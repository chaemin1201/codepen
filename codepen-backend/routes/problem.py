import csv
from datetime import datetime, timezone
from io import BytesIO, StringIO
from zipfile import ZipFile

from fastapi import APIRouter, Depends, Response
from pydantic import BaseModel
from sqlmodel import Session, and_, delete, or_, select

from db import engine
from models.category import Category
from models.group import Group
from models.problem import Problem, create_problem_response
from models.question import Question
from models.question_attempt import QuestionAttempt
from models.user import User
from utils.scheduler import (
    reschedule_problem_deadline,
    schedule_problem_deadline,
)
from utils.user import login_required


def _parse_dt_aware(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


class PartialProblem(BaseModel):
    group_id: int | None = None
    category_id: int | None = None
    question_count: int = 1
    title: str | None = None
    description: str | None = ""
    difficulty: str | None = "easy"
    starts_at: str | None = None
    deadline: str | None = None
    hide_before_start: bool | None = None


router = APIRouter(prefix="/problem")


@router.post("")
async def create_problem(
    problem: PartialProblem,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        group = session.get(Group, problem.group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        if problem.category_id is not None:
            category = session.get(Category, problem.category_id)
            if not category or category.group_id != problem.group_id:
                response.status_code = 400
                return {"error": "Invalid category for this group"}

        try:
            parsed_starts_at = _parse_dt_aware(problem.starts_at)
            parsed_deadline = _parse_dt_aware(problem.deadline)
        except ValueError:
            response.status_code = 400
            return {"error": "Invalid datetime format. Use ISO 8601 format."}

        new_problem = Problem(
            group_id=problem.group_id,
            category_id=problem.category_id,
            question_count=problem.question_count,
            title=problem.title,
            description=problem.description,
            difficulty=problem.difficulty,
            starts_at=parsed_starts_at,
            deadline=parsed_deadline,
            hide_before_start=bool(problem.hide_before_start),
        )
        session.add(new_problem)
        session.commit()
        session.refresh(new_problem)
        schedule_problem_deadline(new_problem.problem_id, new_problem.deadline)
        return create_problem_response(
            new_problem, group.owner_id == current_user.user_id
        )


@router.patch("/{problem_id}")
async def update_problem(
    problem_id: int,
    problem: PartialProblem,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        existing_problem = session.get(Problem, problem_id)
        if not existing_problem:
            response.status_code = 404
            return {"error": "Problem not found"}

        group = session.get(Group, existing_problem.group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        if problem.category_id is not None:
            category = session.get(Category, problem.category_id)
            if not category or category.group_id != existing_problem.group_id:
                response.status_code = 400
                return {"error": "Invalid category for this group"}

        if problem.starts_at:
            try:
                existing_problem.starts_at = _parse_dt_aware(problem.starts_at)
            except ValueError:
                response.status_code = 400
                return {"error": "Invalid starts_at datetime format."}

        if problem.deadline:
            try:
                new_deadline = _parse_dt_aware(problem.deadline)
                existing_problem.deadline = new_deadline
            except ValueError:
                response.status_code = 400
                return {"error": "Invalid deadline datetime format."}

        if problem.title is not None:
            existing_problem.title = problem.title
        if problem.description is not None:
            existing_problem.description = problem.description
        if problem.difficulty is not None:
            existing_problem.difficulty = problem.difficulty
        if problem.hide_before_start is not None:
            existing_problem.hide_before_start = problem.hide_before_start
        if problem.question_count is not None:
            existing_problem.question_count = problem.question_count
        if problem.category_id is not None:
            existing_problem.category_id = problem.category_id

        session.add(existing_problem)
        session.commit()
        session.refresh(existing_problem)

        if problem.deadline:
            reschedule_problem_deadline(
                existing_problem.problem_id, existing_problem.deadline
            )

        return create_problem_response(
            existing_problem, group.owner_id == current_user.user_id
        )


@router.get("/{problem_id}")
async def get_problem(
    problem_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        problem = session.get(Problem, problem_id)
        if not problem or (
            current_user.user_id
            not in [member.user_id for member in problem.group.members]
            and current_user.user_id != problem.group.owner_id
        ):
            response.status_code = 404
            return {"error": "Problem not found"}

        return create_problem_response(
            problem, is_owner=problem.group.owner_id == current_user.user_id
        )


@router.get("/group/{group_id}")
async def get_problems_by_group(
    group_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

        problems = session.exec(
            select(Problem).where(
                and_(
                    Problem.group_id == group_id,
                    or_(
                        Problem.hide_before_start == False,
                        Problem.starts_at <= datetime.now(timezone.utc),
                        group.owner_id == current_user.user_id,
                    ),
                )
            )
        ).all()
        problems = [
            create_problem_response(
                problem, is_owner=problem.group.owner_id == current_user.user_id
            )
            for problem in problems
        ]
        return problems


@router.delete("/{problem_id}")
async def delete_problem(
    problem_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        problem = session.get(Problem, problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}

        group = session.get(Group, problem.group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        # 문제지 하위 소문제 및 시도(QuestionAttempt) 기록 깔끔히 삭제
        questions = session.exec(
            select(Question).where(Question.problem_id == problem_id)
        ).all()
        question_ids = [q.question_id for q in questions]

        if question_ids:
            session.exec(
                delete(QuestionAttempt).where(QuestionAttempt.question_id.in_(question_ids))
            )
            session.exec(
                delete(Question).where(Question.question_id.in_(question_ids))
            )

        session.delete(problem)
        session.commit()
        return {"message": "Problem deleted successfully"}


@router.get("/{problem_id}/scores")
async def get_problem_scores_in_csv(
    problem_id: int, response: Response, current_user: User = Depends(login_required)
):
    """소문제 제출 점수를 집계하여 CSV 파일로 다운로드합니다."""
    with Session(engine) as session:
        problem = session.get(Problem, problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}

        group = session.get(Group, problem.group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        questions = session.exec(
            select(Question).where(Question.problem_id == problem_id)
        ).all()
        question_ids = [q.question_id for q in questions]

        attempts = session.exec(
            select(QuestionAttempt).where(QuestionAttempt.question_id.in_(question_ids))
        ).all() if question_ids else []

        # 학생별 점수 합산
        user_scores: dict[str, float] = {}
        for a in attempts:
            if a.professor_score is not None:
                user_scores[a.user_id] = user_scores.get(a.user_id, 0) + a.professor_score

        csv_buffer = StringIO()
        writer = csv.writer(csv_buffer, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(["Student No", "Username", "Score"])

        for member in group.members:
            if member.user_id == group.owner_id:
                continue

            student_no = member.student_no if member.student_no is not None else ""
            username = member.username or ""

            # 엑셀 매크로 주입 방어
            if username and username[0] in ["=", "+", "-", "@"]:
                username = f"'{username}"

            score = user_scores.get(member.user_id, "")
            writer.writerow([student_no, username, score])

        csv_content = csv_buffer.getvalue()
        csv_buffer.close()

        filename = f"{problem.group.group_name}_{problem.title}_scores.csv".replace(" ", "_")
        return Response(
            content=csv_content,
            headers={"Content-Disposition": f"attachment; filename={filename}"},
            media_type="text/csv",
        )