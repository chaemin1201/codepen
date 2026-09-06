from fastapi import APIRouter, Response, Depends
from pydantic import BaseModel
from sqlmodel import Session, select, and_, or_
from datetime import datetime, timezone
from db import engine
import os
from models.user import User, UserRole
from models.problem import Problem, ProblemResponse, create_problem_response
from models.group import Group
from models.group_member import GroupMember
from models.submission import Submission
from models.invite_queue import InviteQueue
from utils.user import login_required
import secrets 
from pathlib import Path
from sqlmodel import delete
from models.question import Question
from models.question_attempt import QuestionAttempt
from models.category import Category


class PartialGroup(BaseModel):
    name: str
    description: str | None = None
    platform: str = "codepen"   # 🟢 [추가] "codepen" 또는 "colab", 기본값 codepen

class GroupMemberResponse(BaseModel):
    user_id: str
    username: str
    email: str
    role: str
    student_no: int | None = None
    grade: int | None = None
    major: str | None = None
    codepen_username: str | None = None
    department: str | None = None
    position: str | None = None
    office: str | None = None
    created_at: str
    joined_at: str  # [신규] 계정 생성일이 아니라 "이 그룹에" 가입한 날짜


class GroupResponse(BaseModel):
    group_id: int
    group_name: str
    invite_code: str
    description: str | None
    owner_id: str
    created_at: str
    platform: str   # 🟢 [추가]
    owner: User
    members: list[GroupMemberResponse]
    problems: list[Problem | ProblemResponse]


def get_group_response(group: Group, session: Session, user_id: str) -> GroupResponse:
    owner = session.get(User, group.owner_id)
    if not owner:
        raise ValueError("Owner not found")
    member_rows = session.exec(
        select(User, GroupMember.created_at)
        .join(GroupMember, GroupMember.user_id == User.user_id)  # type: ignore
        .where(GroupMember.group_id == group.group_id)
    ).all()
    members = [
        GroupMemberResponse(
            user_id=user.user_id,
            username=user.username,
            email=user.email,
            role=user.role,
            student_no=user.student_no,
            grade=user.grade,
            major=user.major,
            codepen_username=user.codepen_username,
            department=user.department,
            position=user.position,
            office=user.office,
            created_at=str(user.created_at),
            joined_at=str(joined_at),
        )
        for user, joined_at in member_rows
    ]
    problems = session.exec(
        select(Problem).where(
            and_(
                Problem.group_id == group.group_id,
                or_(
                    Problem.hide_before_start == False,
                    Problem.starts_at <= datetime.now(timezone.utc),
                    group.owner_id == user_id,
                ),
            )
        )
    ).all()
    for problem in problems:
        actual_count = session.exec(
            select(Question).where(Question.problem_id == problem.problem_id)
        ).all()
        problem.question_count = len(actual_count)

    problems = [
        create_problem_response(problem, is_owner=owner.user_id == user_id)
        for problem in problems
    ]

    return GroupResponse(
        group_id=group.group_id,  # type: ignore group_id is not None here
        group_name=group.group_name,
        invite_code=group.invite_code,
        description=group.description,
        owner_id=group.owner_id,
        created_at=group.created_at.isoformat() if group.created_at else "",
        platform=group.platform,   # 🟢 [추가]
        owner=owner,
        members=list(members),
        problems=list(problems),
    )


router = APIRouter(prefix="/group")


# move this specifically to top so it precedes the other routes
@router.get("/invites")
async def get_current_user_invites(
    response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        invites = session.exec(
            select(InviteQueue).where(InviteQueue.user_id == current_user.user_id)
        ).all()
        return [
            {
                "group_id": invite.group_id,
                "group_name": invite.group.group_name,
                "invite_code": invite.group.invite_code,
                "description": invite.group.description,
                "created_at": (
                    invite.created_at.isoformat() if invite.created_at else ""
                ),
                "owner_name": invite.group.owner.username,
            }
            for invite in invites
        ]


@router.get("")
async def list_groups(current_user: User = Depends(login_required)):
    with Session(engine) as session:
        groups = session.exec(
            select(Group)
            .join(GroupMember)
            .where(GroupMember.user_id == current_user.user_id)
        ).all()
        return [
            get_group_response(group, session, current_user.user_id) for group in groups
        ]


@router.post("")
async def create_group(
    group: PartialGroup,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        # 6글자 대신 예측 불가한 안전한 코드로 변경
        invite_code = secrets.token_urlsafe(16)

        new_group = Group(
            group_name=group.name,
            description=group.description,
            owner_id=current_user.user_id,
            invite_code=invite_code,
            platform=group.platform,   # 🟢 [추가]
        )
        session.add(new_group)
        session.commit()
        session.refresh(new_group)
        new_group_member = GroupMember(
            group_id=new_group.group_id, user_id=current_user.user_id  # type: ignore group_id is not None here
        )
        session.add(new_group_member)
        session.commit()
        return get_group_response(new_group, session, current_user.user_id)


@router.patch("/{group_id}")
async def update_group(
    group_id: int,
    group: PartialGroup,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        existing_group = session.get(Group, group_id)
        if not existing_group:
            response.status_code = 404
            return {"error": "Group not found"}

        if existing_group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        existing_group.group_name = group.name
        existing_group.description = group.description
        # 🟢 [추가] 이미 문제가 하나라도 있는 그룹은 플랫폼 변경 막기 (데이터 일관성 보호)
        if not existing_group.problems:
            existing_group.platform = group.platform
        session.add(existing_group)
        session.commit()
        session.refresh(existing_group)
        return get_group_response(existing_group, session, current_user.user_id)

@router.get("/{group_id}")
async def get_group(
    group_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        result = session.get(Group, group_id)
        if not result or (
            current_user.user_id not in [member.user_id for member in result.members]
            and current_user.user_id != result.owner_id
        ):
            response.status_code = 404
            return {"error": "Group not found"}

        return get_group_response(result, session, current_user.user_id)


@router.delete("/{group_id}")
async def delete_group(
    group_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        # 1. 데이터베이스 연관 데이터 직접 삭제 (SQL 쿼리 방식)
        # 🟢 [수정] 삭제 순서가 중요합니다 — "자식(참조하는 쪽)"을 먼저 지우고 "부모"를 나중에 지워야
        # DB의 외래키 제약(FK constraint)에 안 걸립니다. 원래 코드는 Question과 Category를
        # 지우지 않아서, 소문제나 항목이 하나라도 있으면 그룹 삭제 자체가 실패했습니다.
        session.exec(delete(InviteQueue).where(InviteQueue.group_id == group_id))
        session.exec(delete(GroupMember).where(GroupMember.group_id == group_id))

        # 문제 및 제출물도 직접 깔끔하게 삭제
        problem_ids = [p.problem_id for p in group.problems]
        if problem_ids:
            # 🟢 [수정] Question -> QuestionAttempt 순서로 먼저 지워야
            # 뒤이어 Problem을 지울 때 "아직 나를 참조하는 Question이 있다"는 에러가 안 납니다.
            question_ids = [
                q.question_id
                for q in session.exec(
                    select(Question).where(Question.problem_id.in_(problem_ids))
                ).all()
            ]
            if question_ids:
                session.exec(
                    delete(QuestionAttempt).where(QuestionAttempt.question_id.in_(question_ids))
                )
                session.exec(delete(Question).where(Question.problem_id.in_(problem_ids)))

            session.exec(delete(Submission).where(Submission.problem_id.in_(problem_ids)))
            session.exec(delete(Problem).where(Problem.group_id == group_id))

        # 🟢 [수정] 빠져있던 부분: 그룹의 항목(Category)들도 그룹을 지우기 전에 반드시 삭제
        session.exec(delete(Category).where(Category.group_id == group_id))

        # 2. 그룹 삭제
        session.delete(group)
        session.commit()
        return {"message": "Group deleted successfully"}
        

@router.put("/{group_id}/members/{user_id}")
async def add_member_to_group(
    group_id: int,
    user_id: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        user = session.get(User, user_id)
        if not user:
            response.status_code = 404
            return {"error": "User not found"}

        existing_member = session.exec(
            select(GroupMember).where(
                GroupMember.group_id == group_id, GroupMember.user_id == user_id
            )
        ).first()
        if existing_member:
            response.status_code = 400
            return {"error": "User is already a member of the group"}

        group_member = GroupMember(group_id=group_id, user_id=user_id)
        session.add(group_member)
        session.commit()
        return {"message": "User added to group successfully"}


class GraderUpdate(BaseModel):
    student_id: str
    is_grader: bool


@router.get("/{group_id}/students")
async def get_group_students(
    group_id: int, response: Response, current_user: User = Depends(login_required)
):
    """채점자 설정 다이얼로그용 - 학생 목록 + 현재 채점자 여부."""
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        rows = session.exec(
            select(User, GroupMember.is_grader)
            .join(GroupMember, GroupMember.user_id == User.user_id)
            .where(GroupMember.group_id == group_id, User.user_id != group.owner_id)
        ).all()
        return [
            {
                "user_id": user.user_id,
                "username": user.username,
                "student_no": user.student_no,
                "is_grader": is_grader,
            }
            for user, is_grader in rows
        ]


@router.patch("/{group_id}/grader")
async def set_group_grader(
    group_id: int,
    payload: GraderUpdate,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        membership = session.get(GroupMember, (group_id, payload.student_id))
        if not membership:
            response.status_code = 404
            return {"error": "Member not found"}

        membership.is_grader = payload.is_grader
        session.add(membership)
        session.commit()
        return {"message": "Grader role updated"}


@router.get("/{group_id}/attendance")
async def get_group_attendance(
    group_id: int, response: Response, current_user: User = Depends(login_required)
):
    """학생별 '출석률' - 그룹 전체 문제지 중 몇 개를 제출했는지 대략적인 비율입니다.

    🟢 [수정] 예전엔 옛날 Submission 테이블(status=='submitted')을 봤는데,
    지금 실제 제출 흐름(/api/question/{id}/submit)은 QuestionAttempt 테이블에만 기록돼서
    Submission 테이블은 항상 비어있었습니다. 그래서 학생이 문제를 다 풀어도 출석률이
    항상 0으로 나왔습니다. QuestionAttempt 기준으로 다시 계산합니다.
    """
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        total_problems = len(group.problems)

        # 문제지(Problem)별 소문제(Question) id 목록 매핑
        problem_ids = [p.problem_id for p in group.problems]
        questions = session.exec(
            select(Question).where(Question.problem_id.in_(problem_ids))
        ).all() if problem_ids else []

        question_id_to_problem_id = {q.question_id: q.problem_id for q in questions}

        # 이 그룹의 모든 QuestionAttempt 중, 실제로 제출 흔적이 있는(attempts_count > 0) 것만
        all_question_ids = list(question_id_to_problem_id.keys())
        attempts = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id.in_(all_question_ids),
                QuestionAttempt.attempts_count > 0,
            )
        ).all() if all_question_ids else []

        # user_id -> 그 학생이 제출 흔적을 남긴 problem_id 집합 (소문제 하나라도 제출했으면 그 문제지는 '제출'로 카운트)
        user_submitted_problem_ids: dict[str, set[int]] = {}
        for a in attempts:
            pid = question_id_to_problem_id.get(a.question_id)
            if pid is None:
                continue
            user_submitted_problem_ids.setdefault(str(a.user_id), set()).add(pid)

        result = []
        for member in group.members:
            if member.user_id == group.owner_id:
                continue
            submitted_count = len(user_submitted_problem_ids.get(str(member.user_id), set()))
            rate = (submitted_count / total_problems * 100) if total_problems > 0 else 0
            result.append({
                "user_id": member.user_id,
                "submitted_count": submitted_count,
                "total_problems": total_problems,
                "attendance_rate": round(rate, 1),
            })
        return result


@router.get("/{group_id}/members")
async def get_group_members(
    group_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

        # [FIX-IDOR] 그룹 멤버/오너가 아니어도 group_id만 알면 멤버 목록을 볼 수 있었음.
        # 다른 엔드포인트(get_group 등)와 동일하게 접근 권한 체크 추가.
        is_member = current_user.user_id in [m.user_id for m in group.members]
        if not is_member and current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not a member of this group"}

        members = session.exec(
            select(User).join(GroupMember).where(GroupMember.group_id == group_id)
        ).all()
        return members


@router.delete("/{group_id}/members/{user_id}")
async def remove_member_from_group(
    group_id: int,
    user_id: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}
        group_member = session.exec(
            select(GroupMember).where(
                GroupMember.group_id == group_id, GroupMember.user_id == user_id
            )
        ).first()
        if not group_member:
            response.status_code = 404
            return {"error": "Group member not found"}

        session.delete(group_member)

        submissions = session.exec(
            select(Submission)
            .join(Problem)
            .where(
                Problem.group_id == group_id,
                Submission.user_id == user_id,
            )
        ).all()
        for submission in submissions:
            session.delete(submission)
        session.commit()
        return {"message": "User removed from group successfully"}


@router.get("/invites/{invite_code}")
async def get_invite_status(
    invite_code: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.exec(
            select(Group).where(Group.invite_code == invite_code)
        ).first()
        if not group:
            response.status_code = 404
            return {"error": "Invalid invite code"}
        status = "none"
        if current_user.user_id in [invite.user_id for invite in group.invite_queues]:
            status = "pending"
        if current_user.user_id == group.owner_id or current_user.user_id in [
            member.user_id for member in group.members
        ]:
            status = "accepted"
        return {
            "group_id": group.group_id,
            "group_name": group.group_name,
            "description": group.description,
            "owner_name": group.owner.username,
            "created_at": group.created_at.isoformat() if group.created_at else "",
            "status": status,
        }


@router.post("/invites/{invite_code}")
async def request_group_invite(
    invite_code: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.exec(
            select(Group).where(Group.invite_code == invite_code)
        ).first()
        if not group:
            response.status_code = 404
            return {"error": "Invalid invite code"}
        existing_invite = session.exec(
            select(InviteQueue).where(
                InviteQueue.group_id == group.group_id,
                InviteQueue.user_id == current_user.user_id,
            )
        ).first()
        if existing_invite:
            response.status_code = 400
            return {"error": "You have already requested to join this group"}
        if current_user.user_id == group.owner_id or current_user.user_id in [
            member.user_id for member in group.members
        ]:
            response.status_code = 400
            return {"error": "You are already a member of this group"}
        invite_queue = InviteQueue(group_id=group.group_id, user_id=current_user.user_id)  # type: ignore group_id is not None here
        session.add(invite_queue)
        session.commit()
        return {"message": "Group join request sent successfully"}


@router.delete("/invites/{invite_code}")
async def cancel_group_invite_request(
    invite_code: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.exec(
            select(Group).where(Group.invite_code == invite_code)
        ).first()
        if not group:
            response.status_code = 404
            return {"error": "Invalid invite code"}
        invite_queue = session.exec(
            select(InviteQueue).where(
                InviteQueue.group_id == group.group_id,
                InviteQueue.user_id == current_user.user_id,
            )
        ).first()
        if not invite_queue:
            response.status_code = 404
            return {"error": "You have not requested to join this group"}
        session.delete(invite_queue)
        session.commit()
        return {"message": "Group join request cancelled successfully"}


@router.post("/{group_id}/invites/all")
async def accept_all_group_invites(
    group_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}
        invite_queues = group.invite_queues
        for invite_queue in invite_queues:
            session.delete(invite_queue)
            group_member = GroupMember(
                group_id=group_id, user_id=invite_queue.user_id
            )
            session.add(group_member)
        session.commit()
        return {"message": "All invites accepted successfully"}


@router.delete("/{group_id}/invites/all")
async def reject_all_group_invites(
    group_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}
        invite_queues = group.invite_queues
        for invite_queue in invite_queues:
            session.delete(invite_queue)
        session.commit()
        return {"message": "All invites rejected successfully"}


@router.post("/{group_id}/invites/{user_id}")
async def accept_group_invite(
    group_id: int,
    user_id: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}
        invite_queue = session.exec(
            select(InviteQueue).where(
                InviteQueue.group_id == group_id, InviteQueue.user_id == user_id
            )
        ).first()
        if not invite_queue:
            response.status_code = 404
            return {"error": f"Invite with user_id {user_id} not found"}
        session.delete(invite_queue)
        group_member = GroupMember(group_id=group_id, user_id=user_id)
        session.add(group_member)
        session.commit()
        return {"message": "User added to group successfully"}


@router.delete("/{group_id}/invites/{user_id}")
async def reject_group_invite(
    group_id: int,
    user_id: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}
        invite_queue = session.exec(
            select(InviteQueue).where(
                InviteQueue.group_id == group_id, InviteQueue.user_id == user_id
            )
        ).first()
        if not invite_queue:
            response.status_code = 404
            return {"error": f"Invite with user_id {user_id} not found"}
        session.delete(invite_queue)
        session.commit()
        return {"message": "Invite rejected successfully"}


@router.get("/{group_id}/invite-queues")
async def get_group_invite_queues(
    group_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}
        invite_queues = [invite.user for invite in group.invite_queues]
        return invite_queues