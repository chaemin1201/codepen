from fastapi import APIRouter, Response, Depends
from pydantic import BaseModel
from sqlmodel import Session, select, and_, or_, delete
from datetime import datetime, timezone
from db import engine
import os
import secrets 
from pathlib import Path

from models.user import User, UserRole
from models.problem import Problem, ProblemResponse, create_problem_response
from models.group import Group
from models.group_member import GroupMember
from models.invite_queue import InviteQueue
from models.question import Question
from models.question_attempt import QuestionAttempt
from models.category import Category
from utils.user import login_required


class PartialGroup(BaseModel):
    name: str
    description: str | None = None
    platform: str = "codepen"   # "codepen" 또는 "colab"


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
    joined_at: str  # 이 그룹 가입일


class GroupResponse(BaseModel):
    group_id: int
    group_name: str
    invite_code: str
    description: str | None
    owner_id: str
    created_at: str
    platform: str
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
        group_id=group.group_id,  # type: ignore
        group_name=group.group_name,
        invite_code=group.invite_code,
        description=group.description,
        owner_id=group.owner_id,
        created_at=group.created_at.isoformat() if group.created_at else "",
        platform=group.platform,
        owner=owner,
        members=list(members),
        problems=list(problems),
    )


router = APIRouter(prefix="/group")


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
        invite_code = secrets.token_urlsafe(16)

        new_group = Group(
            group_name=group.name,
            description=group.description,
            owner_id=current_user.user_id,
            invite_code=invite_code,
            platform=group.platform,
        )
        session.add(new_group)
        session.commit()
        session.refresh(new_group)
        new_group_member = GroupMember(
            group_id=new_group.group_id, user_id=current_user.user_id  # type: ignore
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

        # 🟢 [수정] 자식 참조 데이터 순차 삭제 (Submission 삭제 로직 제거됨)
        session.exec(delete(InviteQueue).where(InviteQueue.group_id == group_id))
        session.exec(delete(GroupMember).where(GroupMember.group_id == group_id))

        problem_ids = [p.problem_id for p in group.problems]
        if problem_ids:
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

            session.exec(delete(Problem).where(Problem.group_id == group_id))

        session.exec(delete(Category).where(Category.group_id == group_id))

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
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        total_problems = len(group.problems)
        problem_ids = [p.problem_id for p in group.problems]
        questions = session.exec(
            select(Question).where(Question.problem_id.in_(problem_ids))
        ).all() if problem_ids else []

        question_id_to_problem_id = {q.question_id: q.problem_id for q in questions}

        all_question_ids = list(question_id_to_problem_id.keys())
        attempts = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id.in_(all_question_ids),
                QuestionAttempt.attempts_count > 0,
            )
        ).all() if all_question_ids else []

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


@router.get("/{group_id}/grades")
async def get_group_grades(
    group_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        categories = session.exec(
            select(Category).where(Category.group_id == group_id)
        ).all()
        categories_sorted = sorted(
            categories, key=lambda c: (c.starts_at is None, c.starts_at)
        )

        problems = session.exec(
            select(Problem).where(Problem.group_id == group_id)
        ).all()
        problem_to_category: dict[int, int | None] = {p.problem_id: p.category_id for p in problems}
        problem_ids = [p.problem_id for p in problems]

        questions = session.exec(
            select(Question).where(Question.problem_id.in_(problem_ids))
        ).all() if problem_ids else []

        question_id_to_category: dict[int, int | None] = {}
        category_max_score: dict[int | None, int] = {}
        for q in questions:
            cid = problem_to_category.get(q.problem_id)
            question_id_to_category[q.question_id] = cid
            category_max_score[cid] = category_max_score.get(cid, 0) + (q.score or 0)

        all_question_ids = list(question_id_to_category.keys())
        attempts = session.exec(
            select(QuestionAttempt).where(QuestionAttempt.question_id.in_(all_question_ids))
        ).all() if all_question_ids else []

        user_category_scores: dict[str, dict[int | None, float]] = {}
        for a in attempts:
            if a.professor_score is None:
                continue
            cid = question_id_to_category.get(a.question_id)
            per_user = user_category_scores.setdefault(str(a.user_id), {})
            per_user[cid] = per_user.get(cid, 0) + a.professor_score

        category_columns = [
            {"category_id": c.category_id, "title": c.title, "max_score": category_max_score.get(c.category_id, 0)}
            for c in categories_sorted
        ]
        if None in category_max_score and category_max_score[None] > 0:
            category_columns.append({"category_id": None, "title": "미분류", "max_score": category_max_score[None]})

        total_max_score = sum(category_max_score.values())

        # 🟢 [수정] group.members(관계)에서 .user로 접근하는 대신, /students 엔드포인트에서
        # 이미 검증된 방식대로 User와 GroupMember를 직접 JOIN해서 가져옵니다.
        roster = session.exec(
            select(User).join(GroupMember, GroupMember.user_id == User.user_id)
            .where(GroupMember.group_id == group_id, User.user_id != group.owner_id)
        ).all()

        students = []
        for user in roster:
            per_user_scores = user_category_scores.get(str(user.user_id), {})
            category_rows = [
                {
                    "category_id": col["category_id"],
                    "title": col["title"],
                    "score": per_user_scores.get(col["category_id"], 0),
                    "max_score": col["max_score"],
                }
                for col in category_columns
            ]
            students.append({
                "user_id": user.user_id,
                "username": user.username,
                "student_no": user.student_no,
                "categories": category_rows,
                "total_score": sum(per_user_scores.values()),
                "total_max_score": total_max_score,
            })

        students.sort(key=lambda s: s["total_score"], reverse=True)

        return {
            "categories": category_columns,
            "total_max_score": total_max_score,
            "students": students,
        }


@router.get("/{group_id}/members")
async def get_group_members(
    group_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

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

        # 🟢 [수정] 멤버 삭제 시 Submission 테이블을 참조/삭제하던 구형 로직 제거
        session.delete(group_member)
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
        invite_queue = InviteQueue(group_id=group.group_id, user_id=current_user.user_id)  # type: ignore
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