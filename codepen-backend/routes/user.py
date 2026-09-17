from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Response, Request, Depends
from sqlmodel import Session, select, col
from db import engine
from models.user import User, UserRole
from models.group_member import GroupMember
from models.group import Group
from models.problem import Problem
from models.question import Question
from models.question_attempt import QuestionAttempt
from utils.user import login_required
from pydantic import BaseModel
import uuid

router = APIRouter(prefix="/user")


class PartialUser(BaseModel):
    # 🟢 회원가입 시 고유 식별자(이메일 또는 user_id)를 함께 받아야 함
    user_id: str | None = None
    email: str | None = None
    role: UserRole = UserRole.STUDENT
    username: str
    student_no: int | None = None
    grade: int | None = None
    major: str | None = None
    codepen_username: str | None = None
    department: str | None = None
    position: str | None = None
    office: str | None = None


class PartialUserEdit(BaseModel):
    username: str | None = None
    student_no: int | None = None
    grade: int | None = None
    major: str | None = None
    codepen_username: str | None = None
    department: str | None = None
    position: str | None = None
    office: str | None = None


@router.post("")
async def create_user(partial_user: PartialUser, request: Request, response: Response):
    user_data = request.session.get("user") or {}
    
    # 🟢 1. user_id가 없으면 학번(student_no) 또는 랜덤 UUID로 자동 생성
    target_user_id = (
        user_data.get("sub") 
        or partial_user.user_id 
        or (str(partial_user.student_no) if partial_user.student_no else str(uuid.uuid4()))
    )
    
    # 🟢 2. email이 없으면 user_id 기반의 임시 이메일 생성
    target_email = (
        user_data.get("email") 
        or partial_user.email 
        or f"{target_user_id}@local.com"
    )

    with Session(engine) as session:
        # 🟢 이미 존재하는 유저면 기존 유저 정보 리턴 + 세션 등록
        existing_user = session.get(User, target_user_id)
        if existing_user:
            request.session["user"] = {"sub": existing_user.user_id, "email": existing_user.email}
            return existing_user

        existing_email = session.exec(
            select(User).where(User.email == target_email)
        ).first()
        if existing_email:
            request.session["user"] = {"sub": existing_email.user_id, "email": existing_email.email}
            return existing_email

        if partial_user.role == UserRole.PROFESSOR:
            user = User(
                user_id=target_user_id,
                username=partial_user.username,
                email=target_email,
                role=UserRole.PROFESSOR,
                department=partial_user.department,
                position=partial_user.position,
                office=partial_user.office,
            )
        else:
            if partial_user.student_no is not None:
                existing_student_no = session.exec(
                    select(User).where(User.student_no == partial_user.student_no)
                ).first()
                if existing_student_no:
                    request.session["user"] = {"sub": existing_student_no.user_id, "email": existing_student_no.email}
                    return existing_student_no

            user = User(
                user_id=target_user_id,
                username=partial_user.username,
                email=target_email,
                role=UserRole.STUDENT,
                student_no=partial_user.student_no,
                grade=partial_user.grade,
                major=partial_user.major,
                codepen_username=partial_user.codepen_username,
            )
        session.add(user)
        session.commit()
        session.refresh(user)

        # 🟢 세션 저장
        request.session["user"] = {"sub": user.user_id, "email": user.email}
        return user


@router.patch("/me")
async def update_current_user(
    partial_user: PartialUserEdit, request: Request, response: Response
):
    user_data = request.session.get("user")
    if not user_data:
        response.status_code = 401
        return {"error": "Unauthorized"}
    with Session(engine) as session:
        user = session.get(User, user_data["sub"])
        if not user:
            response.status_code = 404
            return {"error": "User not found"}

        if partial_user.username is not None:
            user.username = partial_user.username
        if partial_user.student_no is not None and partial_user.student_no != user.student_no:
            user_with_same_student_no = session.exec(
                select(User).where(User.student_no == partial_user.student_no)
            ).first()
            if user_with_same_student_no:
                response.status_code = 400
                return {"error": "Student number already exists"}
            user.student_no = partial_user.student_no
        if partial_user.grade is not None:
            user.grade = partial_user.grade
        if partial_user.major is not None:
            user.major = partial_user.major
        if partial_user.codepen_username is not None:
            user.codepen_username = partial_user.codepen_username
        if user.role in [UserRole.PROFESSOR, "admin"]:
            if partial_user.department is not None:
                user.department = partial_user.department
            if partial_user.position is not None:
                user.position = partial_user.position
            if partial_user.office is not None:
                user.office = partial_user.office

        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@router.get("/me")
async def get_current_user(request: Request, response: Response):
    user_data = request.session.get("user")
    if not user_data:
        response.status_code = 401
        return {"error": "Unauthorized"}

    with Session(engine) as session:
        user = session.get(User, user_data["sub"])
        if not user:
            response.status_code = 404
            return {"error": "User not found"}
        return user


UPCOMING_DEADLINE_WINDOW_HOURS = 24


@router.get("/me/upcoming-deadlines")
async def get_upcoming_deadlines(current_user: User = Depends(login_required)):
    with Session(engine) as session:
        memberships = session.exec(
            select(GroupMember).where(GroupMember.user_id == current_user.user_id)
        ).all()
        group_ids = [m.group_id for m in memberships]
        if not group_ids:
            return []

        now = datetime.now(timezone.utc)
        window_end = now + timedelta(hours=UPCOMING_DEADLINE_WINDOW_HOURS)

        problems = session.exec(
            select(Problem).where(
                Problem.group_id.in_(group_ids),
                Problem.deadline != None,
                Problem.deadline > now,
                Problem.deadline <= window_end,
            )
        ).all()
        if not problems:
            return []

        problem_ids = [p.problem_id for p in problems]
        questions = session.exec(
            select(Question).where(Question.problem_id.in_(problem_ids))
        ).all()

        problem_question_ids: dict[int, list[int]] = {}
        for q in questions:
            problem_question_ids.setdefault(q.problem_id, []).append(q.question_id)

        all_question_ids = [q.question_id for q in questions]
        attempts = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id.in_(all_question_ids),
                QuestionAttempt.user_id == current_user.user_id,
                QuestionAttempt.attempts_count > 0,
            )
        ).all() if all_question_ids else []
        submitted_question_ids = {a.question_id for a in attempts}

        result = []
        for problem in problems:
            q_ids = problem_question_ids.get(problem.problem_id, [])
            if not q_ids:
                continue
            fully_submitted = all(qid in submitted_question_ids for qid in q_ids)
            if fully_submitted:
                continue

            group = session.get(Group, problem.group_id)
            deadline_aware = (
                problem.deadline if problem.deadline.tzinfo is not None
                else problem.deadline.replace(tzinfo=timezone.utc)
            )
            minutes_left = max(0, int((deadline_aware - now).total_seconds() // 60))

            result.append({
                "group_id": problem.group_id,
                "group_name": group.group_name if group else "",
                "problem_id": problem.problem_id,
                "problem_title": problem.title,
                "deadline": problem.deadline,
                "minutes_left": minutes_left,
                "submitted_count": len([qid for qid in q_ids if qid in submitted_question_ids]),
                "total_count": len(q_ids),
            })

        result.sort(key=lambda x: x["minutes_left"])
        return result


@router.get("/{user_id}")
async def get_user(user_id: str, response: Response):
    with Session(engine) as session:
        result = session.get(User, user_id)
        if result:
            return {
                "username" : result.username,
                "major" : result.major,
                "grade" : result.grade
            }
        response.status_code = 404
        return {"error": "User not found"}


@router.get("/search/{query}")
async def search_users(query: str):
    with Session(engine) as session:
        statement = select(User).where(
            col(User.username).contains(query) | col(User.student_no).contains(query)
        )
        results = session.exec(statement).all()
        safe_result = []
        for user in results:
            safe_result.append({
                "username" : user.username,
                "major" : user.major,
                "grade" : user.grade
            })
        return safe_result