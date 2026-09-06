import os
import uuid
import io
import zipfile
import re
import json
import asyncio
import httpx
from utils.colab import download_colab_snapshot, get_colab_file_id
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
from models.category import CategoryType
from utils.user import login_required

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


# 🟢 [신규] 마감(deadline) 대비 제출 시각을 비교해 지각 여부/지각 시간(분)을 계산.
# 프론트엔드가 브라우저 로컬 시계로만 판단하지 않도록 서버가 기준값을 내려줍니다.
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


# 🟢 [수정] CodePen의 .html/.css/.js 원본 추출 URL은 "다른 Pen에서 <script src>/<link>로
# 끌어다 쓰라고" 만든 기능이라 Access-Control-Allow-Origin 헤더를 주지 않습니다.
# 그래서 브라우저의 fetch()로는 CORS에 막혀 절대 못 가져옵니다 (프론트에서 시도했던 방식).
# CORS는 브라우저만 검사하는 규칙이라, 서버(백엔드)에서 요청하면 이 제약이 아예 적용되지 않습니다.
# → 그래서 이 추출을 프론트가 아니라 여기, 백엔드에서 대신 수행합니다.
_CODEPEN_URL_RE = re.compile(
    r"codepen\.io/([^/]+)/(?:pen|collab|full|details)/([^/?#]+)"
)


async def _fetch_codepen_source(codepen_url: str) -> tuple[str, str, str]:
    """codepen_url에서 username/penId를 뽑아 .html/.css/.js를 서버에서 직접 가져옵니다.
    실패하면 예외를 던집니다 (호출부에서 400으로 변환해 프론트에 명확히 알림)."""
    match = _CODEPEN_URL_RE.search(codepen_url or "")
    if not match:
        raise ValueError("올바른 CodePen 링크가 아닙니다.")

    username, pen_id = match.group(1), match.group(2)
    base = f"https://codepen.io/{username}/pen/{pen_id}"

    # 일부 사이트가 브라우저가 아닌 요청(빈 User-Agent 등)을 차단하는 경우가 있어
    # 일반 브라우저처럼 보이는 헤더를 붙여서 요청합니다.
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
        )
    }

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        html_res, css_res, js_res = await asyncio.gather(
            client.get(f"{base}.html", headers=headers),
            client.get(f"{base}.css", headers=headers),
            client.get(f"{base}.js", headers=headers),
        )

    for res, label in ((html_res, "HTML"), (css_res, "CSS"), (js_res, "JS")):
        if res is None or res.status_code >= 400:
            status = res.status_code if res is not None else "요청 실패"
            raise ValueError(f"CodePen에서 {label} 코드를 가져오지 못했습니다 (status={status}).")

    return html_res.text, css_res.text, js_res.text


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


# 🟢 [수정] 프론트엔드에서 HTML, CSS, JS 코드를 직접 받을 수 있도록 필드 추가
class SubmitQuestionBody(BaseModel):
    codepen_url: str
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
            # 🟢 [수정] 어떤 경로를 찾으려 했는지 같이 찍어서, 업로드 시점 경로와
            # 조회 시점 경로가 정말 일치하는지(user_id 형식 등) 비교할 수 있게 함
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
            for out in cell.get("outputs", []):
                data = out.get("data", {})
                if "text/plain" in data:
                    text = data["text/plain"]
                    outputs_text.append("".join(text) if isinstance(text, list) else str(text))
                if "image/png" in data:
                    outputs_images.append(data["image/png"])
                if out.get("output_type") == "stream":
                    text = out.get("text", [])
                    outputs_text.append("".join(text) if isinstance(text, list) else str(text))
            cells.append({
                "cell_type": cell_type,
                "source": source,
                "outputs_text": outputs_text,
                "outputs_images": outputs_images,
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

        all_submissions = session.exec(
            select(Submission).where(Submission.problem_id == question.problem_id)
        ).all()

        attempts_map = {str(a.user_id): a for a in all_attempts}
        submissions_map = {str(s.user_id): s for s in all_submissions}

        # 🟢 이 문제지의 마감(deadline) 기준으로 지각 여부를 계산합니다.
        deadline = problem.deadline if problem else None

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

            # 🟢 [신규] 마감(deadline) 이후 제출이면 is_late=True, late_by_minutes에 얼마나 늦었는지(분) 담아 내려줌
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

# 🟢 [핵심 수정] 제출 시 프론트가 보낸 codepen_url을 서버가 직접 가져와서(CORS 우회) ZIP으로 묶어 저장
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

        # 🟢 [신규] 시험(exam) 카테고리는 일반 문제지와 다르게, 마감(시험 종료) 이후에는
        # "늦게라도 제출"을 허용하지 않고 아예 막습니다. 일반 문제지는 기존처럼 늦게 제출하면
        # "제출 늦음"으로 기록만 되고 제출 자체는 계속 허용합니다.
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

        # 🟢 [수정] CodePen 서버가 봇 차단(403)으로 우리 서버의 자동 요청까지 막고 있어서,
        # "자동으로 긁어오기"는 더 이상 신뢰할 수 없습니다. 그래서 우선순위를 바꿨습니다:
        #   1순위: 프론트가 학생이 직접 붙여넣은 html/css/js를 보냈다면 그걸 그대로 사용 (가장 확실함)
        #   2순위: 붙여넣은 게 없으면 예전처럼 서버가 자동으로 가져오기를 "시도"는 해봄 (되면 편함)
        #          — 이것도 실패하면 그때 400으로 "직접 붙여넣어주세요"라고 안내
        fetched_html, fetched_css, fetched_js = "", "", ""
        has_pasted_code = bool((body.html or "").strip() or (body.css or "").strip() or (body.js or "").strip())

        if platform != "colab":
            if has_pasted_code:
                fetched_html, fetched_css, fetched_js = body.html or "", body.css or "", body.js or ""
            else:
                try:
                    fetched_html, fetched_css, fetched_js = await _fetch_codepen_source(body.codepen_url)
                except Exception as e:
                    response.status_code = 400
                    return {
                        "error": (
                            "CodePen에서 코드를 자동으로 가져오지 못했습니다 (CodePen의 봇 차단으로 "
                            "서버 요청도 막혔을 수 있어요). 아래 '코드 직접 붙여넣기'에 HTML/CSS/JS를 "
                            f"붙여넣은 후 다시 제출해주세요. ({e})"
                        )
                    }

        # 🟢 [수정] 순서를 바꿨습니다. 예전에는 QuestionAttempt(제출 횟수/시각)를 먼저 저장하고
        # '그 다음에' 파일 업로드를 시도했습니다. 그러면 업로드가 실패해도(GOOGLE_DRIVE_API_KEY
        # 미설정, Supabase 문제 등) "제출 횟수: 1회"라는 기록은 이미 남아버려서, 교수 화면엔
        # "제출함"으로 보이는데 실제로 열어보면 파일이 없는 불일치가 생겼습니다.
        # 이제는 파일 저장을 먼저 "시도"하고, 그게 성공했을 때만 QuestionAttempt를 기록합니다.
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
                snapshot_bytes = await download_colab_snapshot(body.codepen_url)
                file_key = f"question_attempts/{question_id}_{current_user.user_id}.ipynb"
                supabase.storage.from_("questions").upload(
                    path=file_key,
                    file=snapshot_bytes,
                    file_options={"content-type": "application/json", "upsert": "true"}
                )
                print(f"✅ [Colab Snapshot] 성공적으로 저장됨: {file_key}")
            else:
                # 🟢 [수정] 프론트가 보낸 값이 아니라, 위에서 서버가 직접 받아온 코드로 ZIP 생성
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
                print(f"✅ [CodePen Snapshot] {'붙여넣은' if has_pasted_code else '서버에서 자동으로 가져온'} 코드로 ZIP 저장 완료: {file_key}")
        except Exception as e:
            # 🟢 [수정] 파일 저장이 실패하면 여기서 끝냅니다. QuestionAttempt는 아직 손대지
            # 않았으니(아래에서 저장 성공 후에만 기록), "제출 기록만 남고 파일은 없는" 상태가
            # 생기지 않습니다. 학생은 안심하고 그대로 다시 제출하면 됩니다.
            print(f"❌ [Snapshot Error] {platform} 스냅샷 업로드 실패: {e}")
            response.status_code = 500
            return {
                "error": (
                    "코드 파일 저장에 실패했습니다. 제출 기록은 남지 않았으니 "
                    f"다시 제출해주세요. ({e})"
                )
            }

        # 🟢 파일 저장이 성공한 뒤에만 제출 기록(QuestionAttempt)을 남깁니다.
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

        # 🟢 이 문제지(problem)의 마감(deadline)과 지금(now)을 비교해 지각 여부를 서버 기준으로 계산.
        # 프론트가 브라우저 로컬 시계로 판단하는 대신 이 값을 우선 사용하도록 함께 내려줍니다.
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