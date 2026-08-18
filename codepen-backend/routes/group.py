from fastapi import APIRouter, Response, Depends
from pydantic import BaseModel
from sqlmodel import Session, select, and_, or_
from datetime import datetime, timezone
from db import engine
import os
import shutil
from models.user import User, UserRole
from models.problem import Problem, ProblemResponse, create_problem_response
from models.group import Group
from models.group_member import GroupMember
from models.submission import Submission
from models.invite_queue import InviteQueue
from utils.codepen import close_codepen_pen
from utils.user import login_required
import secrets 
from pathlib import Path


class PartialGroup(BaseModel):
    name: str
    description: str | None = None


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

        for invite in group.invite_queues:
            session.delete(invite)

        for member in group.members:
            session.delete(member)

        for problem in group.problems:
            for submission in problem.submissions:
                await close_codepen_pen(submission.codepen_url)
                if os.path.exists(f"submissions/{submission.filename}"):
                    shutil.rmtree(f"submissions/{submission.filename}")
                session.delete(submission)
            session.delete(problem)

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
    """학생별 '출석률' - 그룹 전체 문제지 중 몇 개를 제출했는지 대략적인 비율입니다."""
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if current_user.user_id != group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        total_problems = len(group.problems)
        result = []
        for member in group.members:
            if member.user_id == group.owner_id:
                continue
            submitted = session.exec(
                select(Submission).where(
                    Submission.user_id == member.user_id,
                    Submission.status == "submitted",
                    Submission.problem_id.in_([p.problem_id for p in group.problems]) if group.problems else False,
                )
            ).all()
            rate = (len(submitted) / total_problems * 100) if total_problems > 0 else 0
            result.append({
                "user_id": member.user_id,
                "submitted_count": len(submitted),
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
            await close_codepen_pen(submission.codepen_url)
            # 하위 파일명만 존재하여 경로 탐색 공격 방어
            safe_filename = os.path.basename(submission.filename)
            submission_path = Path("submissions") / safe_filename
            
            if submission_path.exists() and safe_filename:
                shutil.rmtree(submission_path)
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
