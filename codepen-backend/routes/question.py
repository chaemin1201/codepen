from datetime import datetime, timezone
from fastapi import APIRouter, Response, Depends, UploadFile, File
from sqlmodel import Session, select
from pydantic import BaseModel
from db import engine
import os
import shutil
from pathlib import Path
from models.user import User
from models.group import Group
from models.problem import Problem
from models.question import Question
from models.question_attempt import QuestionAttempt
from models.submission import Submission
from utils.user import login_required

router = APIRouter(prefix="/question")


# 🟢 condition 필드 추가 (프론트엔드 호환성을 위해 conditions도 함께 수신)
class PartialQuestion(BaseModel):
    problem_id: int | None = None
    title: str | None = None
    description: str | None = None
    condition: str | None = None
    conditions: str | None = None
    example_output: str | None = None
    score: int | None = None
    order: int | None = None
    is_visible: bool | None = None


class AttemptStats(BaseModel):
    total_attempts: int
    total_graded: int
    total_correct: int
    accuracy: float | None = None


class MyAttempt(BaseModel):
    attempts_count: int
    is_correct: bool | None = None
    last_submitted_at: datetime | None = None


# 🟢 QuestionResponse 스키마에 condition 및 conditions 추가
class QuestionResponse(BaseModel):
    question_id: int
    problem_id: int
    title: str
    description: str | None = None
    condition: str | None = None
    conditions: str | None = None
    example_output: str | None = None
    score: int
    order: int
    is_visible: bool
    created_at: datetime
    stats: AttemptStats
    my_attempt: MyAttempt
    attachment_name: str | None = None


class GradeAttempt(BaseModel):
    user_id: str
    is_correct: bool | None


class SubmitQuestionBody(BaseModel):
    codepen_url: str


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
    last_submitted_at = getattr(mine, "updated_at", None) if mine else None

    if not last_submitted_at:
        with Session(engine) as session:
            sub = session.exec(
                select(Submission).where(
                    Submission.problem_id == question.problem_id,
                    Submission.user_id == current_user_id,
                )
            ).first()
            if sub and sub.submitted_at:
                last_submitted_at = sub.submitted_at

    # 🟢 DB 모델의 condition/conditions 값 호환 파싱
    cond_val = getattr(question, "condition", getattr(question, "conditions", None))

    return QuestionResponse(
        question_id=question.question_id,
        problem_id=question.problem_id,
        title=question.title,
        description=question.description,
        condition=cond_val,
        conditions=cond_val,
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
            attempts_count=mine.attempts_count if mine else (1 if last_submitted_at else 0),
            is_correct=mine.is_correct if mine else None,
            last_submitted_at=last_submitted_at,
        ),
        attachment_name=getattr(question, "attachment_name", None),
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
        if not is_owner:
            questions = [q for q in questions if q.is_visible]

        return [_build_response(q, current_user.user_id) for q in questions]


# 🟢 소문제 생성 시 condition 값 저장
@router.post("")
async def create_question(
    question: PartialQuestion,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        if question.problem_id is None or question.title is None:
            response.status_code = 400
            return {"error": "problem_id and title are required"}

        problem = session.get(Problem, question.problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}
        group = session.get(Group, problem.group_id)
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        target_condition = question.condition or question.conditions

        new_question = Question(
            problem_id=question.problem_id,
            title=question.title,
            description=question.description,
            example_output=question.example_output,
            score=question.score if question.score is not None else 10,
            order=question.order if question.order is not None else 0,
            is_visible=question.is_visible if question.is_visible is not None else True,
        )

        # SQLModel / DB 모델 속성에 condition이 있을 경우 저장
        if hasattr(new_question, "condition"):
            setattr(new_question, "condition", target_condition)
        if hasattr(new_question, "conditions"):
            setattr(new_question, "conditions", target_condition)

        session.add(new_question)
        session.commit()
        session.refresh(new_question)
        return _build_response(new_question, current_user.user_id)


# 🟢 소문제 수정 시 condition 값 업데이트
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

        if question.title is not None:
            existing.title = question.title
        if question.description is not None:
            existing.description = question.description
        
        # 🟢 condition / conditions 파라미터 갱신
        target_condition = question.condition if question.condition is not None else question.conditions
        if target_condition is not None:
            if hasattr(existing, "condition"):
                setattr(existing, "condition", target_condition)
            if hasattr(existing, "conditions"):
                setattr(existing, "conditions", target_condition)

        if question.example_output is not None:
            existing.example_output = question.example_output
        if question.score is not None:
            existing.score = question.score
        if question.order is not None:
            existing.order = question.order
        if question.is_visible is not None:
            existing.is_visible = question.is_visible

        session.add(existing)
        session.commit()
        session.refresh(existing)
        return _build_response(existing, current_user.user_id)


@router.post("/{question_id}/file")
async def upload_question_file(
    question_id: int,
    response: Response,
    file: UploadFile = File(...),
    current_user: User = Depends(login_required),
):
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

        upload_dir = Path("uploads/questions")
        upload_dir.mkdir(parents=True, exist_ok=True)
        
        safe_filename = os.path.basename(file.filename or "file")
        file_path = upload_dir / f"{question_id}_{safe_filename}"
        
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        if hasattr(question, "attachment_name"):
            question.attachment_name = safe_filename
            session.add(question)
            session.commit()

        return {"message": "File uploaded successfully", "filename": safe_filename}


@router.delete("/{question_id}/file")
async def delete_question_file(
    question_id: int,
    response: Response,
    current_user: User = Depends(login_required),
):
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

        if question.attachment_name:
            upload_dir = Path("uploads/questions")
            file_path = upload_dir / f"{question_id}_{question.attachment_name}"
            if file_path.exists():
                try:
                    os.remove(file_path)
                except Exception:
                    pass

            question.attachment_name = None
            session.add(question)
            session.commit()

        return {"message": "File deleted successfully"}


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


@router.get("/{question_id}/attempt/{user_id}")
async def get_question_attempt_by_user(
    question_id: int,
    user_id: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        question = session.get(Question, question_id)
        if not question:
            response.status_code = 404
            return {"error": "Question not found"}

        problem = session.get(Problem, question.problem_id)
        group = session.get(Group, problem.group_id) if problem else None

        # 🟢 채점 화면 전용: 교수(그룹 owner)만 조회 가능
        if not group or group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}

        attempt = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id == question_id,
                QuestionAttempt.user_id == user_id,
            )
        ).first()

        if not attempt:
            response.status_code = 404
            return {"error": "Attempt not found"}

        return {
            "question_id": question_id,
            "user_id": user_id,
            "attempts_count": attempt.attempts_count,
            "codepen_url": attempt.codepen_url,
            "is_correct": attempt.is_correct,
            "professor_score": attempt.professor_score,
            "score": attempt.professor_score,
            "reason": attempt.reason,
            "updated_at": attempt.updated_at,
        }


@router.get("/{question_id}/attempts")
async def get_question_attempts(
    question_id: int, response: Response, current_user: User = Depends(login_required)
):
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

        all_attempts = session.exec(
            select(QuestionAttempt).where(QuestionAttempt.question_id == question_id)
        ).all()
        
        all_submissions = session.exec(
            select(Submission).where(Submission.problem_id == question.problem_id)
        ).all()

        attempts_map = {str(a.user_id): a for a in all_attempts}
        submissions_map = {str(s.user_id): s for s in all_submissions}

        result = []

        for member in group.members:
            m_user_id = str(getattr(member, "user_id", getattr(member, "id", "")))
            
            if m_user_id == str(group.owner_id):
                continue

            m_username = getattr(member, "username", getattr(member, "name", m_user_id))
            m_student_no = getattr(member, "student_no", getattr(member, "studentId", m_user_id))

            attempt = attempts_map.get(m_user_id)
            submission = submissions_map.get(m_user_id)

            last_submitted_at = None
            if attempt and getattr(attempt, "updated_at", None):
                last_submitted_at = attempt.updated_at
            elif submission and getattr(submission, "submitted_at", None):
                last_submitted_at = submission.submitted_at

            attempts_count = 0
            if attempt and attempt.attempts_count > 0:
                attempts_count = attempt.attempts_count
            elif last_submitted_at:
                attempts_count = 1

            result.append({
    "question_id": question_id,
    "user_id": m_user_id,
    "username": m_username,
    "student_no": m_student_no,
    "attempts_count": attempts_count,
    "is_correct": attempt.is_correct if attempt else None,
    "last_submitted_at": last_submitted_at,
    "professor_score": getattr(attempt, "professor_score", None) if attempt else None,
    "score": getattr(attempt, "professor_score", None) if attempt else None,
    "codepen_url": getattr(attempt, "codepen_url", None) if attempt else None,
    "reason": getattr(attempt, "reason", None) if attempt else None,
})

        return result


@router.patch("/{question_id}/grade")
async def grade_attempt(
    question_id: int,
    grade: GradeAttempt,
    response: Response,
    current_user: User = Depends(login_required),
):
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


@router.post("/{question_id}/submit")
async def submit_question(
    question_id: int,
    body: SubmitQuestionBody,
    response: Response,
    current_user: User = Depends(login_required),
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

        attempt = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id == question_id,
                QuestionAttempt.user_id == current_user.user_id,
            )
        ).first()

        now = datetime.now(timezone.utc)

        if not attempt:
            attempt = QuestionAttempt(
                question_id=question_id,
                user_id=current_user.user_id,
                attempts_count=1,
                codepen_url=body.codepen_url,
                updated_at=now,
            )
        else:
            attempt.attempts_count += 1
            attempt.codepen_url = body.codepen_url
            attempt.updated_at = now

        session.add(attempt)
        session.commit()

        return {
            "message": "Question submitted successfully",
            "question_id": question_id,
            "codepen_url": body.codepen_url,
        }

# 🟢 점수 저장 요청 바디 스키마
class SaveScoreBody(BaseModel):
    score: float
    reason: str | None = None


# 🟢 소문제 시도(Attempt) 개별 점수 및 피드백 저장 API
@router.post("/{question_id}/attempt/{user_id}/score")
async def save_attempt_score(
    question_id: int,
    user_id: str,
    body: SaveScoreBody,
    response: Response,
    current_user: User = Depends(login_required),
):
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

        # 해당 학생의 시도(QuestionAttempt) 기록 조회
        attempt = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id == question_id,
                QuestionAttempt.user_id == user_id,
            )
        ).first()

        if not attempt:
            # 시도 기록이 없으면 새 객체 생성
            attempt = QuestionAttempt(
                question_id=question_id,
                user_id=user_id,
                attempts_count=1,
            )

        # 🟢 professor_score와 score 컬럼 모두에 교수님이 입력한 점수 반영
        if hasattr(attempt, "professor_score"):
            setattr(attempt, "professor_score", body.score)
        if hasattr(attempt, "score"):
            setattr(attempt, "score", body.score)
            
        if hasattr(attempt, "reason"):
            setattr(attempt, "reason", body.reason)
        if hasattr(attempt, "feedback"):
            setattr(attempt, "feedback", body.reason)

        attempt.updated_at = datetime.now(timezone.utc)
        session.add(attempt)
        session.commit()
        session.refresh(attempt)

        return {"message": "Score saved successfully", "score": body.score}