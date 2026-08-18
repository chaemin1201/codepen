from datetime import datetime, timezone
from fastapi import APIRouter, Response, Depends
from sqlmodel import Session, select
from pydantic import BaseModel
from db import engine
from models.user import User
from models.group import Group
from models.problem import Problem
from models.question import Question
from models.question_attempt import QuestionAttempt
from utils.user import login_required

router = APIRouter(prefix="/question")


class PartialQuestion(BaseModel):
    problem_id: int
    title: str
    description: str | None = None
    example_output: str | None = None
    score: int = 10
    order: int = 0
    is_visible: bool = True


class AttemptStats(BaseModel):
    total_attempts: int
    total_graded: int
    total_correct: int
    accuracy: float | None = None  # 채점된 것 중 정답 비율 (%), 채점된 게 없으면 None


class MyAttempt(BaseModel):
    attempts_count: int
    is_correct: bool | None = None


class QuestionResponse(BaseModel):
    question_id: int
    problem_id: int
    title: str
    description: str | None = None
    example_output: str | None = None
    score: int
    order: int
    is_visible: bool
    created_at: datetime
    stats: AttemptStats
    my_attempt: MyAttempt


class GradeAttempt(BaseModel):
    user_id: str
    is_correct: bool | None  # None으로 보내면 "미채점"으로 되돌립니다.


def _is_member_or_owner(group: Group, current_user: User) -> bool:
    return current_user.user_id in [
        m.user_id for m in group.members
    ] or current_user.user_id == group.owner_id


def _build_response(question: Question, current_user_id: str) -> QuestionResponse:
    attempts = question.attempts
    total_attempts = sum(a.attempts_count for a in attempts)
    graded = [a for a in attempts if a.is_correct is not None]
    correct = [a for a in graded if a.is_correct]
    accuracy = (len(correct) / len(graded) * 100) if graded else None

    mine = next((a for a in attempts if a.user_id == current_user_id), None)

    return QuestionResponse(
        question_id=question.question_id,
        problem_id=question.problem_id,
        title=question.title,
        description=question.description,
        example_output=question.example_output,
        score=question.score,
        order=question.order,
        is_visible=question.is_visible,
        created_at=question.created_at,
        stats=AttemptStats(
            total_attempts=total_attempts,
            total_graded=len(graded),
            total_correct=len(correct),
            accuracy=accuracy,
        ),
        my_attempt=MyAttempt(
            attempts_count=mine.attempts_count if mine else 0,
            is_correct=mine.is_correct if mine else None,
        ),
    )


@router.get("/{question_id}")
async def get_question(
    question_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        question = session.get(Question, question_id)
        if not question:
            response.status_code = 404
            return {"error": "Question not found"}
        problem = session.get(Problem, question.problem_id)
        group = session.get(Group, problem.group_id) if problem else None
        if not group or not _is_member_or_owner(group, current_user):
            response.status_code = 403
            return {"error": "Forbidden: You are not a member of this group"}
        is_owner = current_user.user_id == group.owner_id
        if not is_owner and not question.is_visible:
            response.status_code = 404
            return {"error": "Question not found"}
        return _build_response(question, current_user.user_id)


@router.get("/problem/{problem_id}")
async def get_questions_by_problem(
    problem_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        problem = session.get(Problem, problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}
        group = session.get(Group, problem.group_id)
        if not group or not _is_member_or_owner(group, current_user):
            response.status_code = 403
            return {"error": "Forbidden: You are not a member of this group"}

        questions = session.exec(
            select(Question)
            .where(Question.problem_id == problem_id)
            .order_by(Question.order, Question.question_id)
        ).all()

        is_owner = current_user.user_id == group.owner_id
        # 학생에게는 비공개 문제를 아예 숨깁니다.
        if not is_owner:
            questions = [q for q in questions if q.is_visible]

        return [_build_response(q, current_user.user_id) for q in questions]


@router.post("")
async def create_question(
    question: PartialQuestion,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        problem = session.get(Problem, question.problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}
        group = session.get(Group, problem.group_id)
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        new_question = Question(
            problem_id=question.problem_id,
            title=question.title,
            description=question.description,
            example_output=question.example_output,
            score=question.score,
            order=question.order,
            is_visible=question.is_visible,
        )
        session.add(new_question)
        session.commit()
        session.refresh(new_question)
        return _build_response(new_question, current_user.user_id)


@router.patch("/{question_id}")
async def update_question(
    question_id: int,
    question: PartialQuestion,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        existing = session.get(Question, question_id)
        if not existing:
            response.status_code = 404
            return {"error": "Question not found"}
        problem = session.get(Problem, existing.problem_id)
        group = session.get(Group, problem.group_id) if problem else None
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        existing.title = question.title
        existing.description = question.description
        existing.example_output = question.example_output
        existing.score = question.score
        existing.order = question.order
        existing.is_visible = question.is_visible
        session.add(existing)
        session.commit()
        session.refresh(existing)
        return _build_response(existing, current_user.user_id)


@router.delete("/{question_id}")
async def delete_question(
    question_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        existing = session.get(Question, question_id)
        if not existing:
            response.status_code = 404
            return {"error": "Question not found"}
        problem = session.get(Problem, existing.problem_id)
        group = session.get(Group, problem.group_id) if problem else None
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        # [버그 수정] QuestionAttempt가 question_id를 FK로 참조하고 있어서,
        # 학생이 한 번이라도 시도한 문제는 그냥 삭제하면 FK 제약 위반으로
        # 500 에러가 나며 "삭제가 안 되는" 것처럼 보였습니다.
        # 관련 시도 기록을 먼저 지우고 나서 문제를 삭제합니다.
        attempts = session.exec(
            select(QuestionAttempt).where(QuestionAttempt.question_id == question_id)
        ).all()
        for attempt in attempts:
            session.delete(attempt)

        session.delete(existing)
        session.commit()
        return {"message": "Question deleted successfully"}


@router.post("/{question_id}/attempt")
async def log_attempt(
    question_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
    """학생이 이 문제를 시도했다는 것만 기록합니다 (정답 여부는 별도로 채점).
    나중에 자동 채점 엔진을 붙이면, 채점 결과에 따라 이 호출과 동시에
    is_correct까지 채워주는 방식으로 확장하면 됩니다."""
    with Session(engine) as session:
        question = session.get(Question, question_id)
        if not question:
            response.status_code = 404
            return {"error": "Question not found"}
        problem = session.get(Problem, question.problem_id)
        group = session.get(Group, problem.group_id) if problem else None
        if not group or not _is_member_or_owner(group, current_user):
            response.status_code = 403
            return {"error": "Forbidden: You are not a member of this group"}

        attempt = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id == question_id,
                QuestionAttempt.user_id == current_user.user_id,
            )
        ).first()
        if not attempt:
            attempt = QuestionAttempt(
                question_id=question_id,
                user_id=current_user.user_id,
                attempts_count=1,
            )
        else:
            attempt.attempts_count += 1
            attempt.updated_at = datetime.now(timezone.utc)
        session.add(attempt)
        session.commit()
        session.refresh(question)
        return _build_response(question, current_user.user_id)


@router.get("/{question_id}/attempts")
async def get_question_attempts(
    question_id: int, response: Response, current_user: User = Depends(login_required)
):
    """교수님 전용: 이 문제에 대한 그룹 멤버 전원의 시도 현황 (채점용)."""
    with Session(engine) as session:
        question = session.get(Question, question_id)
        if not question:
            response.status_code = 404
            return {"error": "Question not found"}
        problem = session.get(Problem, question.problem_id)
        group = session.get(Group, problem.group_id) if problem else None
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        attempts_by_user = {a.user_id: a for a in question.attempts}
        result = []
        for member in group.members:
            if member.user_id == group.owner_id:
                continue  # 교수님 본인은 채점 대상에서 제외
            attempt = attempts_by_user.get(member.user_id)
            result.append({
                "user_id": member.user_id,
                "username": member.username,
                "student_no": member.student_no,
                "attempts_count": attempt.attempts_count if attempt else 0,
                "is_correct": attempt.is_correct if attempt else None,
            })
        return result


@router.patch("/{question_id}/grade")
async def grade_attempt(
    question_id: int,
    grade: GradeAttempt,
    response: Response,
    current_user: User = Depends(login_required),
):
    """교수님 전용: 특정 학생의 이 문제 시도를 정답/오답/미채점으로 표시."""
    with Session(engine) as session:
        question = session.get(Question, question_id)
        if not question:
            response.status_code = 404
            return {"error": "Question not found"}
        problem = session.get(Problem, question.problem_id)
        group = session.get(Group, problem.group_id) if problem else None
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        attempt = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id == question_id,
                QuestionAttempt.user_id == grade.user_id,
            )
        ).first()
        if not attempt:
            # 시도 기록이 없어도 교수님이 직접 정답 처리할 수 있게 허용합니다
            # (예: 오프라인으로 확인한 경우).
            attempt = QuestionAttempt(
                question_id=question_id,
                user_id=grade.user_id,
                attempts_count=1 if grade.is_correct is not None else 0,
            )
        attempt.is_correct = grade.is_correct
        attempt.updated_at = datetime.now(timezone.utc)
        session.add(attempt)
        session.commit()
        return {"message": "Graded successfully"}
