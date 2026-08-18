from datetime import datetime, timezone
import os
import shutil
import glob
from fastapi import APIRouter, Response, Depends
from sqlmodel import Session, select, and_, or_
from db import engine
from models.user import User
from models.group import Group
from models.problem import Problem, create_problem_response
from models.category import Category
from models.submission import Submission
from utils.codepen import close_codepen_pen, open_codepen_pen
from utils.user import login_required
from utils.scheduler import (
    reschedule_problem_deadline,
    schedule_problem_deadline,
)
from pydantic import BaseModel
from zipfile import ZipFile
from io import BytesIO
import csv 
from pathlib import Path


# [버그 수정] fromisoformat만 쓰면 클라이언트가 타임존 없는 문자열을 보냈을 때
# naive datetime이 그대로 저장돼서, 나중에 aware datetime과 비교하다 500이
# 나는 경우가 있었습니다(카테고리 쪽에서 실제로 재현됨). 문제 생성/수정도
# 같은 위험이 있어서 항상 UTC aware로 정규화하는 헬퍼를 씁니다.
def _parse_dt_aware(value: str) -> datetime:
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed


class PartialProblem(BaseModel):
    group_id: int
    category_id: int | None = None
    question_count: int = 1
    title: str
    description: str
    difficulty: str
    starts_at: str
    deadline: str
    hide_before_start: bool


router = APIRouter(prefix="/problem")


@router.post("")
async def create_problem(
    problem: PartialProblem,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        # check if the group exists
        group = session.get(Group, problem.group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        # check if the current user is an owner of the group
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not the owner of this group"}
        # [신규] category_id를 지정했다면 같은 그룹 소속 카테고리인지 확인
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
            hide_before_start=problem.hide_before_start,
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
        # [신규] category_id를 바꾸는 경우 같은 그룹 소속인지 확인
        if problem.category_id is not None:
            category = session.get(Category, problem.category_id)
            if not category or category.group_id != existing_problem.group_id:
                response.status_code = 400
                return {"error": "Invalid category for this group"}

        try:
            parsed_starts_at = _parse_dt_aware(problem.starts_at)
            new_deadline = _parse_dt_aware(problem.deadline)
        except ValueError:
            response.status_code = 400
            return {"error": "Invalid datetime format. Use ISO 8601 format."}
        existing_problem.category_id = problem.category_id
        existing_problem.question_count = problem.question_count
        existing_problem.title = problem.title
        existing_problem.description = problem.description
        existing_problem.difficulty = problem.difficulty
        existing_problem.starts_at = parsed_starts_at
        existing_problem.hide_before_start = problem.hide_before_start
        if existing_problem.deadline and new_deadline > existing_problem.deadline.replace(tzinfo=timezone.utc):
            for submission in existing_problem.submissions:
                await open_codepen_pen(submission.codepen_url)
        existing_problem.deadline = new_deadline
        session.add(existing_problem)
        session.commit()
        session.refresh(existing_problem)
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

        for submission in problem.submissions:
            await close_codepen_pen(submission.codepen_url)
            # 하위 파일명만 존재하여 경로 탐색 공격 방어
            safe_filename = os.path.basename(submission.filename)
            submission_path = Path("submissions") / safe_filename
            
            if submission_path.exists() and safe_filename:
                shutil.rmtree(submission_path)
            session.delete(submission)

        session.delete(problem)
        session.commit()
        return {"message": "Problem deleted successfully"}


@router.get("/{problem_id}/download_all")
async def download_all_submissions(
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

        submissions = session.exec(
            select(Submission).where(Submission.problem_id == problem_id)
        ).all()

        zip_filename = f"{group.group_name.replace(' ', '_')}_{problem.title.replace(' ', '_')}_submissions.zip"
        zip_buffer = BytesIO()
        with ZipFile(zip_buffer, "w") as zip_file:
            for submission in submissions:
                # 기준 디렉토리를 다룰 때 상위 경로 탈출 차단
                safe_sub_dir = os.path.basename(submission.filename)
                base_dir = Path("submissions") / safe_sub_dir
                
                if not base_dir.exists():
                    continue

                for file in glob.glob(f"submissions/{safe_sub_dir}/**/*", recursive=True):
                    if os.path.isfile(file):
                        # 오직 내부 상대 경로만 순수하게 계산되도록 처리
                        rel_path = os.path.relpath(file, start=str(base_dir))
                        
                        # 만약 상대 경로에 ../ 가 들어있다면 강제로 제거해서 Zip Slip 방어
                        if ".." in rel_path:
                            continue
                            
                        # 안전한 폴더명 규격화
                        safe_user_folder = f"{problem.group.group_name}_{problem.title}_{submission.user.username}_{submission.user.student_no}".replace(" ", "_")
                        arc_name = f"{safe_user_folder}/{rel_path}"
                        
                        zip_file.write(file, arcname=arc_name)

        zip_buffer.seek(0)
        return Response(
            content=zip_buffer.read(), 
            headers={"Content-Disposition": f"attachment; filename={zip_filename}"}, 
            media_type="application/zip"
        )

@router.get("/{problem_id}/scores")
async def get_problem_scores_in_csv(
    problem_id: int, response: Response, current_user: User = Depends(login_required)
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

        submissions = problem.submissions
        # 텍스트 수동 결합 대신 csv.writer 사용
        from io import StringIO
        csv_buffer = StringIO()
        writer = csv.writer(csv_buffer, quoting=csv.QUOTE_MINIMAL)
        
        # 헤더 작성
        writer.writerow(["Student No", "Username", "Score"])
        
        for submission in submissions:
            student_no = submission.user.student_no if submission.user.student_no is not None else ""
            username = submission.user.username
            
            # 💡 엑셀 매크로 주입(CSV Injection) 방어 방벽
            if username and username[0] in ['=', '+', '-', '@']:
                username = f"'{username}"
                
            score = submission.score if submission.score is not None else ""
            writer.writerow([student_no, username, score])

        csv_content = csv_buffer.getvalue()
        csv_buffer.close()

        filename = f"{problem.group.group_name}_{problem.title}_scores.csv".replace(" ", "_")
        return Response(
            content=csv_content, 
            headers={"Content-Disposition": f"attachment; filename={filename}"}, 
            media_type="text/csv"
        )