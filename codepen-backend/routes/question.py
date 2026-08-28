import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Response, Depends, UploadFile, File
from sqlmodel import Session, select
from pydantic import BaseModel
from supabase import create_client, Client

from db import engine
from models.user import User
from models.group import Group
from models.problem import Problem
from models.question import Question
from models.question_attempt import QuestionAttempt
from models.submission import Submission
from utils.user import login_required
import re

router = APIRouter(prefix="/question")

# 🟢 Supabase 클라이언트 초기화 (.env 설정 참조)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


class PartialQuestion(BaseModel):
    problem_id: int | None = None
    title: str | None = None
    description: str | None = None
    condition: str | None = None
    conditions: str | None = None
    example_output: str | None = None
    example_image_url: str | None = None
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


class QuestionResponse(BaseModel):
    question_id: int
    problem_id: int
    title: str
    description: str | None = None
    condition: str | None = None
    conditions: str | None = None
    example_output: str | None = None
    example_image_url: str | None = None
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

    cond_val = getattr(question, "condition", getattr(question, "conditions", None))
    img_url_val = getattr(question, "example_image_url", None)

    return QuestionResponse(
        question_id=question.question_id,
        problem_id=question.problem_id,
        title=question.title,
        description=question.description,
        condition=cond_val,
        conditions=cond_val,
        example_output=question.example_output,
        example_image_url=img_url_val,
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


def make_safe_filename(filename: str) -> str:
    """Storage 키로 안전하게 쓸 수 있도록 파일명을 정제한다.
    한글, 공백, 특수문자를 제거하고 확장자는 보존한다."""
    name = os.path.basename(filename or "file")
    # 확장자 분리
    stem, ext = os.path.splitext(name)
    # 영문/숫자/-/_ 만 남기고 나머지는 언더스코어로 치환
    stem = re.sub(r"[^a-zA-Z0-9\-_]", "_", stem)
    # 연속된 언더스코어 정리 + 앞뒤 언더스코어 제거
    stem = re.sub(r"_+", "_", stem).strip("_")
    if not stem:
        stem = uuid.uuid4().hex[:8]
    return f"{stem}{ext}"


# 🟢 [수정] Supabase Storage 'questions' 버킷에 이미지 업로드
@router.post("/upload-image")
async def upload_question_image(
    file: UploadFile = File(...),
    current_user: User = Depends(login_required),
):
    timestamp = int(datetime.now(timezone.utc).timestamp())
    safe_filename = make_safe_filename(file.filename or "image.png")
    file_key = f"images/{timestamp}_{safe_filename}"

    file_bytes = await file.read()

    # Supabase Storage 업로드
    supabase.storage.from_("questions").upload(
        path=file_key,
        file=file_bytes,
        file_options={"content-type": file.content_type or "image/png"}
    )

    # 공개 URL 가져오기
    image_url = supabase.storage.from_("questions").get_public_url(file_key)

    return {"image_url": image_url, "url": image_url}


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

        if hasattr(new_question, "condition"):
            setattr(new_question, "condition", target_condition)
        if hasattr(new_question, "conditions"):
            setattr(new_question, "conditions", target_condition)
        if hasattr(new_question, "example_image_url") and question.example_image_url:
            setattr(new_question, "example_image_url", question.example_image_url)

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

        if question.title is not None:
            existing.title = question.title
        if question.description is not None:
            existing.description = question.description

        target_condition = question.condition if question.condition is not None else question.conditions
        if target_condition is not None:
            if hasattr(existing, "condition"):
                setattr(existing, "condition", target_condition)
            if hasattr(existing, "conditions"):
                setattr(existing, "conditions", target_condition)

        if question.example_output is not None:
            existing.example_output = question.example_output
        if question.example_image_url is not None and hasattr(existing, "example_image_url"):
            setattr(existing, "example_image_url", question.example_image_url)
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


# 🟢 [수정] Supabase Storage에 첨부파일 업로드
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

        safe_filename = make_safe_filename(file.filename or "file")
        file_key = f"attachments/{question_id}_{safe_filename}"
        file_bytes = await file.read()

        # Supabase Storage 업로드
        supabase.storage.from_("questions").upload(
            path=file_key,
            file=file_bytes,
            file_options={"content-type": file.content_type or "application/octet-stream"}
        )

        if hasattr(question, "attachment_name"):
            question.attachment_name = safe_filename
            session.add(question)
            session.commit()

        return {"message": "File uploaded successfully", "filename": safe_filename}


# 🟢 [수정] Supabase Storage에서 첨부파일 삭제
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
            file_key = f"attachments/{question_id}_{question.attachment_name}"
            try:
                supabase.storage.from_("questions").remove([file_key])
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


class SaveScoreBody(BaseModel):
    score: float
    reason: str | None = None


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

        attempt = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id == question_id,
                QuestionAttempt.user_id == user_id,
            )
        ).first()

        if not attempt:
            attempt = QuestionAttempt(
                question_id=question_id,
                user_id=user_id,
                attempts_count=1,
            )

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