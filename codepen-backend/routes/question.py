import io
import json
import os
import re
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, File, Response, UploadFile
from pydantic import BaseModel
from sqlmodel import Session, select
from supabase import Client, create_client

from db import engine
from models.category import CategoryType
from models.colab import ColabNotebook
from models.group import Group
from models.problem import Problem
from models.question import Question
from models.question_attempt import QuestionAttempt
from models.user import User
from routes.colab import get_valid_drive_token
from utils.colab import (
    create_notebook_for_student,
    download_colab_snapshot,
    download_notebook_with_oauth,
    get_colab_file_id,
    share_file_with_email,
)
from utils.user import login_required

router = APIRouter(prefix="/question")

# Supabase 클라이언트 초기화 (.env 설정 참조)
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
    submitted_students: int = 0


class MyAttempt(BaseModel):
    attempts_count: int
    is_correct: bool | None = None
    last_submitted_at: datetime | None = None


def _compute_late_info(deadline: datetime | None, submitted_at: datetime | None):
    if not deadline or not submitted_at:
        return False, None

    def _as_aware(dt: datetime) -> datetime:
        return dt if dt.tzinfo is not None else dt.replace(tzinfo=timezone.utc)

    deadline = _as_aware(deadline)
    submitted_at = _as_aware(submitted_at)

    if submitted_at <= deadline:
        return False, None

    late_minutes = int((submitted_at - deadline).total_seconds() // 60)
    return True, late_minutes


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
    codepen_url: str | None = None
    html: str | None = ""
    css: str | None = ""
    js: str | None = ""


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
    submitted_students = len({a.user_id for a in attempts if a.attempts_count > 0})

    mine = next((a for a in attempts if a.user_id == current_user_id), None)
    last_submitted_at = getattr(mine, "updated_at", None) if mine else None

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
            submitted_students=submitted_students,
        ),
        my_attempt=MyAttempt(
            attempts_count=mine.attempts_count if mine else 0,
            is_correct=mine.is_correct if mine else None,
            last_submitted_at=last_submitted_at,
        ),
        attachment_name=getattr(question, "attachment_name", None),
    )


_ANSI_ESCAPE_RE = re.compile(r"\x1b\[[0-9;]*m")


def make_safe_filename(filename: str) -> str:
    name = os.path.basename(filename or "file")
    stem, ext = os.path.splitext(name)
    stem = re.sub(r"[^a-zA-Z0-9\-_]", "_", stem)
    stem = re.sub(r"_+", "_", stem).strip("_")
    if not stem:
        stem = uuid.uuid4().hex[:8]
    return f"{stem}{ext}"


@router.post("/upload-image")
async def upload_question_image(
    file: UploadFile = File(...),
    current_user: User = Depends(login_required),
):
    timestamp = int(datetime.now(timezone.utc).timestamp())
    safe_filename = make_safe_filename(file.filename or "image.png")
    file_key = f"images/{timestamp}_{safe_filename}"

    file_bytes = await file.read()

    supabase.storage.from_("questions").upload(
        path=file_key,
        file=file_bytes,
        file_options={"content-type": file.content_type or "image/png"}
    )

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


@router.post("/{question_id}/colab-notebook")
async def get_or_create_colab_notebook(
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

        if getattr(group, "platform", "codepen") != "colab":
            response.status_code = 400
            return {"error": "이 그룹은 Colab 플랫폼이 아닙니다."}

        existing = session.exec(
            select(ColabNotebook).where(
                ColabNotebook.question_id == question_id,
                ColabNotebook.user_id == current_user.user_id,
            )
        ).first()
        if existing:
            return {
                "file_id": existing.file_id,
                "web_view_link": existing.web_view_link,
                "colab_url": f"https://colab.research.google.com/drive/{existing.file_id}",
                "created": False,
            }

        if problem and problem.category and problem.category.type == CategoryType.EXAM:
            if problem.deadline:
                deadline_aware = (
                    problem.deadline if problem.deadline.tzinfo is not None
                    else problem.deadline.replace(tzinfo=timezone.utc)
                )
                if datetime.now(timezone.utc) > deadline_aware:
                    response.status_code = 403
                    return {"error": "시험 시간이 종료되어 더 이상 노트북을 생성할 수 없습니다."}

        drive_token = await get_valid_drive_token(group.owner_id)
        if not drive_token:
            response.status_code = 400
            return {
                "error": "교수님이 아직 Google Drive를 연결하지 않았습니다. 그룹 목록 화면에서 "
                         "'Google Drive 연결하기'를 먼저 진행해달라고 요청해주세요."
            }

        try:
            title = f"{question.title}_{current_user.username}"
            file_id, web_view_link = await create_notebook_for_student(drive_token, title)

            permission_id = None
            if current_user.email:
                permission_id = await share_file_with_email(drive_token, file_id, current_user.email)
            else:
                print(f"⚠️ [Colab Notebook] user_id={current_user.user_id}에 이메일이 없어 공유를 건너뜀")
        except Exception as e:
            print(f"❌ [Colab Notebook] 생성 실패: {e}")
            response.status_code = 500
            return {"error": f"노트북 생성에 실패했습니다. 잠시 후 다시 시도해주세요. ({e})"}

        notebook = ColabNotebook(
            question_id=question_id,
            user_id=current_user.user_id,
            file_id=file_id,
            web_view_link=web_view_link,
            permission_id=permission_id,
        )
        session.add(notebook)
        session.commit()

        return {
            "file_id": file_id,
            "web_view_link": web_view_link,
            "colab_url": f"https://colab.research.google.com/drive/{file_id}",
            "created": True,
        }


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


@router.get("/{question_id}/attempt/{user_id}/codepen_code/{file_path:path}")
async def get_question_attempt_codepen_code(
    question_id: int,
    user_id: str,
    file_path: str,
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
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

        if user_id != current_user.user_id and group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You can only view your own submissions"}

        pure_path = Path(file_path)
        if ".." in pure_path.parts or pure_path.is_absolute():
            response.status_code = 400
            return {"error": "Invalid file path specified"}

        attempt = session.exec(
            select(QuestionAttempt).where(
                QuestionAttempt.question_id == question_id,
                QuestionAttempt.user_id == user_id,
            )
        ).first()
        if not attempt:
            response.status_code = 404
            return {"error": "Attempt not found"}

        try:
            file_key_to_read = f"question_attempts/{question_id}_{user_id}.zip"
            file_bytes = supabase.storage.from_("questions").download(file_key_to_read)
            zip_content = io.BytesIO(file_bytes)
        except Exception as e:
            print(f"❌ [Snapshot Read Error] '{file_key_to_read}' 를 찾지 못함: {e}")
            response.status_code = 404
            return {"error": "저장된 스냅샷이 없습니다."}

        with zipfile.ZipFile(zip_content) as zip_file:
            namelist = zip_file.namelist()
            if not namelist:
                response.status_code = 404
                return {"error": "Empty archive"}

            target_file_in_zip = None
            target_filename = os.path.basename(file_path)

            if file_path in namelist:
                target_file_in_zip = file_path
            else:
                for item in namelist:
                    if item.endswith(target_filename) or item.endswith(file_path):
                        target_file_in_zip = item
                        break

            if not target_file_in_zip:
                print(f"⚠️ [ZIP Path Mismatch] 요청된 파일({file_path})을 압축 목록({namelist})에서 찾을 수 없음")
                response.status_code = 404
                return {"error": "File not found in submission snapshot"}

            with zip_file.open(target_file_in_zip) as f:
                file_content = f.read()
                
                media_type = "text/plain"
                if target_filename.endswith(".html"):
                    media_type = "text/html"
                elif target_filename.endswith(".css"):
                    media_type = "text/css"
                elif target_filename.endswith(".js"):
                    media_type = "application/javascript"

                return Response(file_content, media_type=media_type)


@router.get("/{question_id}/attempt/{user_id}/colab_snapshot")
async def get_question_attempt_colab_snapshot(
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
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

        if user_id != current_user.user_id and group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You can only view your own submissions"}

        try:
            file_bytes = supabase.storage.from_("questions").download(
                f"question_attempts/{question_id}_{user_id}.ipynb"
            )
        except Exception:
            response.status_code = 404
            return {"error": "저장된 스냅샷이 없습니다."}

        try:
            notebook = json.loads(file_bytes.decode("utf-8"))
        except Exception:
            response.status_code = 500
            return {"error": "노트북 파일을 파싱하는 데 실패했습니다."}

        cells = []
        for cell in notebook.get("cells", []):
            source = "".join(cell.get("source", []))
            cell_type = cell.get("cell_type", "code")
            outputs_text = []
            outputs_images = []
            outputs_html = []
            outputs_errors = []

            for out in cell.get("outputs", []):
                output_type = out.get("output_type")
                data = out.get("data", {})

                if "text/plain" in data:
                    text = data["text/plain"]
                    outputs_text.append("".join(text) if isinstance(text, list) else str(text))
                if "text/html" in data:
                    html = data["text/html"]
                    outputs_html.append("".join(html) if isinstance(html, list) else str(html))
                if "image/png" in data:
                    outputs_images.append(data["image/png"])
                if output_type == "stream":
                    text = out.get("text", [])
                    outputs_text.append("".join(text) if isinstance(text, list) else str(text))
                if output_type == "error":
                    raw_traceback = out.get("traceback", [])
                    clean_traceback = [_ANSI_ESCAPE_RE.sub("", line) for line in raw_traceback]
                    outputs_errors.append({
                        "ename": out.get("ename", "Error"),
                        "evalue": out.get("evalue", ""),
                        "traceback": clean_traceback,
                    })

            cells.append({
                "cell_type": cell_type,
                "source": source,
                "outputs_text": outputs_text,
                "outputs_images": outputs_images,
                "outputs_html": outputs_html,
                "outputs_errors": outputs_errors,
            })

        return {"cells": cells}


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

        attempts_map = {str(a.user_id): a for a in all_attempts}
        deadline = problem.deadline if problem else None

        result = []

        for member in group.members:
            m_user_id = str(getattr(member, "user_id", getattr(member, "id", "")))

            if m_user_id == str(group.owner_id):
                continue

            m_username = getattr(member, "username", getattr(member, "name", m_user_id))
            m_student_no = getattr(member, "student_no", getattr(member, "studentId", m_user_id))

            attempt = attempts_map.get(m_user_id)
            last_submitted_at = getattr(attempt, "updated_at", None) if attempt else None
            attempts_count = attempt.attempts_count if attempt else 0

            is_late, late_by_minutes = _compute_late_info(deadline, last_submitted_at)

            result.append({
                "question_id": question_id,
                "user_id": m_user_id,
                "username": m_username,
                "student_no": m_student_no,
                "attempts_count": attempts_count,
                "is_correct": attempt.is_correct if attempt else None,
                "last_submitted_at": last_submitted_at,
                "deadline": deadline,
                "is_late": is_late,
                "late_by_minutes": late_by_minutes,
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

        if problem and problem.category and problem.category.type == CategoryType.EXAM:
            if problem.deadline:
                deadline_aware = (
                    problem.deadline if problem.deadline.tzinfo is not None
                    else problem.deadline.replace(tzinfo=timezone.utc)
                )
                if datetime.now(timezone.utc) > deadline_aware:
                    response.status_code = 403
                    return {
                        "error": "시험 시간이 종료되어 더 이상 제출할 수 없습니다."
                    }

        platform = getattr(group, "platform", "codepen")
        fetched_html, fetched_css, fetched_js = "", "", ""

        if platform != "colab":
            fetched_html, fetched_css, fetched_js = body.html or "", body.css or "", body.js or ""
            if not fetched_html.strip() and not fetched_css.strip() and not fetched_js.strip():
                response.status_code = 400
                return {"error": "제출할 코드가 비어 있습니다. HTML/CSS/JS 중 하나 이상 작성해주세요."}

        if supabase is None:
            response.status_code = 500
            return {
                "error": (
                    "서버에 Supabase 연결이 설정되어 있지 않습니다 (SUPABASE_URL/SUPABASE_KEY 환경변수 확인 필요). "
                    "제출이 저장되지 않았으니 관리자에게 문의 후 다시 시도해주세요."
                )
            }

        try:
            if platform == "colab":
                snapshot_bytes = None
                oauth_error = None
                drive_token = await get_valid_drive_token(group.owner_id)
                if drive_token:
                    try:
                        file_id = get_colab_file_id(body.codepen_url)
                        snapshot_bytes = await download_notebook_with_oauth(drive_token, file_id)
                    except Exception as e:
                        oauth_error = e
                        print(f"⚠️ [Colab Snapshot] OAuth 다운로드 실패, API 키 방식으로 재시도: {e}")

                if snapshot_bytes is None:
                    try:
                        snapshot_bytes = await download_colab_snapshot(body.codepen_url)
                    except Exception as e:
                        raise oauth_error or e

                try:
                    notebook_json = json.loads(snapshot_bytes)
                    code_cells = [c for c in notebook_json.get("cells", []) if c.get("cell_type") == "code"]
                    has_any_output = any(c.get("outputs") for c in code_cells)
                    has_any_source = any("".join(c.get("source", [])).strip() for c in code_cells)
                    if code_cells and has_any_source and not has_any_output:
                        response.status_code = 400
                        return {
                            "error": (
                                "코드는 작성되어 있지만 한 번도 실행되지 않았어요. Colab에서 "
                                "'런타임 → 모두 실행'(또는 Ctrl/Cmd+F9)으로 셀을 전부 실행하고 "
                                "저장한 뒤 다시 제출해주세요. 실행하지 않으면 채점 화면에 결과가 "
                                "보이지 않아요."
                            )
                        }
                except json.JSONDecodeError:
                    pass

                file_key = f"question_attempts/{question_id}_{current_user.user_id}.ipynb"
                supabase.storage.from_("questions").upload(
                    path=file_key,
                    file=snapshot_bytes,
                    file_options={"content-type": "application/json", "upsert": "true"}
                )
                print(f"✅ [Colab Snapshot] 성공적으로 저장됨: {file_key}")
            else:
                zip_buffer = io.BytesIO()
                with zipfile.ZipFile(zip_buffer, "a", zipfile.ZIP_DEFLATED, False) as zip_file:
                    zip_file.writestr("index.html", fetched_html or "")
                    zip_file.writestr("style.css", fetched_css or "")
                    zip_file.writestr("script.js", fetched_js or "")

                file_key = f"question_attempts/{question_id}_{current_user.user_id}.zip"
                supabase.storage.from_("questions").upload(
                    path=file_key,
                    file=zip_buffer.getvalue(),
                    file_options={"content-type": "application/zip", "upsert": "true"}
                )
                print(f"✅ [자체 에디터 Snapshot] 학생이 작성한 코드로 ZIP 저장 완료: {file_key}")
        except Exception as e:
            print(f"❌ [Snapshot Error] {platform} 스냅샷 업로드 실패: {e}")
            response.status_code = 500
            return {
                "error": (
                    "코드 파일 저장에 실패했습니다. 제출 기록은 남지 않았으니 "
                    f"다시 제출해주세요. ({e})"
                )
            }

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
        session.refresh(attempt)

        is_late, late_by_minutes = _compute_late_info(problem.deadline if problem else None, now)

        return {
            "message": "Question submitted successfully",
            "question_id": question_id,
            "codepen_url": body.codepen_url,
            "is_late": is_late,
            "late_by_minutes": late_by_minutes,
            "deadline": problem.deadline if problem else None,
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