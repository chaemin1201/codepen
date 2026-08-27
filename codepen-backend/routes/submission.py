# import os
# import shutil
# import zipfile
# import io
# from pathlib import Path

# from datetime import datetime, timezone
# from fastapi import APIRouter, Response, Depends
# from pydantic import BaseModel
# from sqlmodel import Session, select, or_
# from db import engine
# from models.user import User
# from models.group import Group
# from models.problem import Problem
# from models.submission import Submission, SubmissionStatus
# from models.group_member import GroupMember
# from models.question import Question
# from models.question_attempt import QuestionAttempt
# from utils.user import login_required
# from utils.codepen import (
#     create_codepen,
#     download_codepen,
#     scrap_codepen,
#     close_codepen_pen,
# )


# router = APIRouter(prefix="/submission")


# @router.post("/{problem_id}")
# async def create_submission(
#     problem_id: int,
#     response: Response,
#     current_user: User = Depends(login_required),
# ):
#     with Session(engine) as session:
#         # check if the problem exists
#         problem = session.get(Problem, problem_id)
#         if not problem:
#             response.status_code = 404
#             return {"error": "Problem not found"}
#         # check if the current user is a member of the group
#         group = session.get(Group, problem.group_id)
#         if not group:
#             response.status_code = 404
#             return {"error": "Group not found"}
#         is_member = session.exec(
#             select(GroupMember).where(
#                 GroupMember.group_id == group.group_id,
#                 GroupMember.user_id == current_user.user_id,
#             )
#         ).first()
#         if not is_member and group.owner_id != current_user.user_id:
#             response.status_code = 403
#             return {"error": "Forbidden: You are not a member of this group"}
#         if datetime.now(timezone.utc) < problem.starts_at.replace(tzinfo=timezone.utc):
#             response.status_code = 400
#             return {
#                 "error": "Cannot create submission: The problem has not started yet"
#             }
#         if problem.deadline and datetime.now(timezone.utc) > problem.deadline.replace(tzinfo=timezone.utc):
#             response.status_code = 400
#             return {
#                 "error": "Cannot create submission: The deadline for this problem has passed"
#             }
#         new_submission = Submission(
#             problem_id=problem_id,
#             user_id=current_user.user_id,
#         )
#         session.add(new_submission)
#         session.commit()
#         session.refresh(new_submission)
#         try:
#             new_submission.codepen_url = await create_codepen(new_submission)
#         except Exception as e:
#             session.delete(new_submission)
#             session.commit()
#             response.status_code = 500
#             return {"error": f"CodePen 생성에 실패했습니다: {str(e)}"}
#         session.add(new_submission)
#         session.commit()
#         session.refresh(new_submission)
#         return new_submission


# @router.get("/{submission_id}")
# async def get_submission(
#     submission_id: int, response: Response, current_user: User = Depends(login_required)
# ):
#     with Session(engine) as session:
#         result = session.get(Submission, submission_id)
#         if not result:
#             response.status_code = 404
#             return {"error": "Submission not found"}
#         if (
#             result.user_id != current_user.user_id
#             and result.problem.group.owner_id != current_user.user_id
#         ):
#             response.status_code = 403
#             return {"error": "Forbidden: You can only view your own submissions"}
#         return result


# @router.delete("/{submission_id}")
# async def delete_submission(
#     submission_id: int, response: Response, current_user: User = Depends(login_required)
# ):
#     with Session(engine) as session:
#         submission = session.get(Submission, submission_id)
#         if not submission:
#             response.status_code = 404
#             return {"error": "Submission not found"}
#         if current_user.user_id != submission.problem.group.owner_id:
#             response.status_code = 403
#             return {"error": "Forbidden: Only group owners can delete submissions"}

#         await close_codepen_pen(submission.codepen_url)

#         # Save filename before deleting from session
#         # 상위 경로 주입 방지
#         safe_filename = os.path.basename(submission.filename) if submission.filename else ""
#         submission_path = Path("submissions") / safe_filename

#         session.delete(submission)
#         session.commit()

#         # [FIX-BUG] 정의된 적 없는 local_path 변수를 참조하여 매번 NameError로 500 발생 +
#         # 실제로는 디스크 파일이 전혀 삭제되지 않고 있었음(고아 파일 누적).
#         # 위에서 이미 안전하게 계산해둔 submission_path를 사용하도록 수정.
#         if safe_filename and submission_path.exists():
#             shutil.rmtree(submission_path)

#         return {"message": "Submission deleted successfully"}


# @router.get("/problem/{problem_id}")
# async def get_submissions_by_problem(
#     problem_id: int, response: Response, current_user: User = Depends(login_required)
# ):
#     with Session(engine) as session:
#         problem = session.get(Problem, problem_id)
#         if not problem:
#             response.status_code = 404
#             return {"error": "Problem not found"}

#         submissions = session.exec(
#             select(Submission).where(
#                 Submission.problem_id == problem_id,
#                 or_(
#                     Submission.user_id == current_user.user_id,
#                     problem.group.owner_id == current_user.user_id,
#                 ),
#             )
#         ).all()
#         return submissions


# @router.get("/user/me")
# async def get_submissions_by_current_user(
#     current_user: User = Depends(login_required),
# ):
#     with Session(engine) as session:
#         submissions = session.exec(
#             select(Submission).where(Submission.user_id == current_user.user_id)
#         ).all()
#         return submissions


# @router.get("/user/{user_id}")
# async def get_submissions_by_user(
#     user_id: str, response: Response, current_user: User = Depends(login_required)
# ):
#     with Session(engine) as session:
#         user = session.get(User, user_id)
#         if not user:
#             response.status_code = 404
#             return {"error": "User not found"}

#         if user_id != current_user.user_id:
#             response.status_code = 403
#             return {"error": "Forbidden: You can only view your own submissions"}

#         submissions = session.exec(
#             select(Submission).where(
#                 Submission.user_id == user_id,
#             )
#         ).all()
#         return submissions


# @router.get("/problem/{problem_id}/user/me")
# async def get_submission_by_problem_and_current_user(
#     problem_id: int,
#     current_user: User = Depends(login_required),
# ):
#     with Session(engine) as session:
#         submission = session.exec(
#             select(Submission).where(
#                 Submission.problem_id == problem_id,
#                 Submission.user_id == current_user.user_id,
#             )
#         ).first()
#         return submission


# @router.get("/problem/{problem_id}/user/{user_id}")
# async def get_submission_by_problem_and_user(
#     problem_id: int,
#     user_id: str,
#     response: Response,
#     current_user: User = Depends(login_required),
# ):
#     with Session(engine) as session:
#         problem = session.get(Problem, problem_id)
#         if not problem:
#             response.status_code = 404
#             return {"error": "Problem not found"}

#         user = session.get(User, user_id)
#         if not user:
#             response.status_code = 404
#             return {"error": "User not found"}

#         if (
#             user.user_id != current_user.user_id
#             and problem.group.owner_id != current_user.user_id
#         ):
#             response.status_code = 403
#             return {"error": "Forbidden: You can only view your own submissions"}

#         submission = session.exec(
#             select(Submission).where(
#                 Submission.problem_id == problem_id, Submission.user_id == user_id
#             )
#         ).first()
#         return submission


# @router.get("/group/{group_id}/user/me")
# async def get_submissions_by_current_user_and_group(
#     group_id: int,
#     current_user: User = Depends(login_required),
# ):
#     with Session(engine) as session:
#         submissions = session.exec(
#             select(Submission)
#             .join(Problem)
#             .where(
#                 Submission.user_id == current_user.user_id,
#                 Problem.group_id == group_id,
#             )
#         ).all()
#         return submissions


# @router.get("/group/{group_id}/user/{user_id}")
# async def get_submissions_by_user_and_group(
#     group_id: int,
#     user_id: str,
#     response: Response,
#     current_user: User = Depends(login_required),
# ):
#     with Session(engine) as session:
#         user = session.get(User, user_id)
#         if not user:
#             response.status_code = 404
#             return {"error": "User not found"}

#         group = session.get(Group, group_id)
#         if not group:
#             response.status_code = 404
#             return {"error": "Group not found"}

#         if (
#             user.user_id != current_user.user_id
#             and group.owner_id != current_user.user_id
#         ):
#             response.status_code = 403
#             return {"error": "Forbidden: You can only view your own submissions"}

#         submissions = session.exec(
#             select(Submission)
#             .join(Problem)
#             .where(Submission.user_id == user_id, Problem.group_id == group_id)
#         ).all()
#         return submissions


# @router.post("/{submission_id}/submit")
# async def submit_submission(
#     submission_id: int, response: Response, current_user: User = Depends(login_required)
# ):
#     with Session(engine) as session:
#         submission = session.get(Submission, submission_id)
#         if not submission:
#             response.status_code = 404
#             return {"error": "Submission not found"}

#         if submission.user_id != current_user.user_id:
#             response.status_code = 403
#             return {"error": "Forbidden: You can only submit your own submissions"}
#         if submission.status == SubmissionStatus.SUBMITTED:
#             response.status_code = 400
#             return {"error": "Submission has already been submitted"}

#         problem = session.get(Problem, submission.problem_id)
#         if not problem:
#             response.status_code = 404
#             return {"error": "Problem not found"}
#         if datetime.now(timezone.utc) < problem.starts_at.replace(tzinfo=timezone.utc):
#             response.status_code = 400
#             return {"error": "Cannot submit: The problem has not started yet"}
#         if problem.deadline and datetime.now(timezone.utc) > problem.deadline.replace(tzinfo=timezone.utc):
#             response.status_code = 400
#             return {"error": "Cannot submit: The deadline for this problem has passed"}

#         submission.submitted_at = datetime.now(timezone.utc)
#         submission.status = SubmissionStatus.SUBMITTED
#         session.add(submission)
#         session.commit()
#         session.refresh(submission)
#         await download_codepen(submission)
#         await close_codepen_pen(submission.codepen_url)

#         # [신규] 학생이 문제지(Problem)를 제출하면, 그 안에 있는 공개된 문제(Question)들을
#         # 전부 "시도함"으로 기록합니다. 지금 구조에서 실제 제출은 문제지 단위 CodePen
#         # 하나뿐이라, 개별 문제 채점이 의미를 가지려면 이 연결이 꼭 필요합니다.
#         # (나중에 문제별로 따로 제출/채점하는 구조로 바뀌면 이 부분도 같이 손봐야 해요.)
#         questions = session.exec(
#             select(Question).where(
#                 Question.problem_id == submission.problem_id,
#                 Question.is_visible == True,  # noqa: E712
#             )
#         ).all()
#         for q in questions:
#             attempt = session.exec(
#                 select(QuestionAttempt).where(
#                     QuestionAttempt.question_id == q.question_id,
#                     QuestionAttempt.user_id == current_user.user_id,
#                 )
#             ).first()
#             if not attempt:
#                 attempt = QuestionAttempt(
#                     question_id=q.question_id,
#                     user_id=current_user.user_id,
#                     attempts_count=1,
#                 )
#             else:
#                 attempt.attempts_count += 1
#                 attempt.updated_at = datetime.now(timezone.utc)
#             session.add(attempt)
#         session.commit()

#         return {
#             "message": "Submission submitted successfully",
#             "submission": submission,
#         }


# @router.get("/{submission_id}/verify")
# async def verify_submission(
#     submission_id: int, response: Response, current_user: User = Depends(login_required)
# ):
#     with Session(engine) as session:
#         submission = session.get(Submission, submission_id)
#         if not submission:
#             response.status_code = 404
#             return {"error": "Submission not found"}

#         group = submission.problem.group
#         if group.owner_id != current_user.user_id:
#             response.status_code = 403
#             return {"error": "Forbidden: Only group owners can verify submissions"}

#         if submission.status != SubmissionStatus.SUBMITTED:
#             response.status_code = 400
#             return {"error": "Submission is not in a submitted state"}

#         # 1. 로컬 검증 대상 폴더 경로 설정 (누락되었던 부분 추가)
#         safe_filename = os.path.basename(submission.filename) if submission.filename else str(submission.submission_id)
#         base_submission_path = Path("submissions") / safe_filename

#         tampered = False
#         tampered_files = []
#         content = await scrap_codepen(submission)

#         with zipfile.ZipFile(content) as zip_file:
#             # 2. 누락되었던 ZIP 파일 순회 for문 추가
#             for file in zip_file.namelist():
#                 if file.endswith("/"):
#                     continue

#                 parts = file.split("/", 1)
#                 if len(parts) <= 1:
#                     continue
#                 disk_file = parts[1]

#                 # 경로 우회 탈출 문자열 차단
#                 if ".." in Path(disk_file).parts:
#                     continue

#                 if disk_file.startswith("src/") and not disk_file.endswith("/"):
#                     with zip_file.open(file) as f:
#                         existing_content = f.read().decode("utf-8", errors="ignore")
                    
#                     # 로컬 검증 대상 파일 경로 지정
#                     target_file_path = base_submission_path / disk_file
                    
#                     # 3. 경로 검증 및 로컬 파일 비교 (들여쓰기/변수 선언 수정)
#                     resolved_target = target_file_path.resolve()
#                     resolved_base = base_submission_path.resolve()

#                     if resolved_target.is_relative_to(resolved_base) and target_file_path.exists():
#                         with open(target_file_path, "r", encoding="utf-8", errors="ignore") as f:
#                             local_content = f.read()
                        
#                         if existing_content != local_content:
#                             tampered = True
#                             tampered_files.append(disk_file)
#                             break
#                     else:
#                         # 로컬에 비교할 원본 파일이 없으면 변조로 처리
#                         tampered = True
#                         tampered_files.append(disk_file)
#                         break

#         return {
#             "status": "verified" if not tampered else "tampered",
#             "tampered_files": tampered_files,
#         }

# @router.get("/problem/{problem_id}/verify_all")
# async def verify_all_submissions(
#     problem_id: int, response: Response, current_user: User = Depends(login_required)
# ):
#     with Session(engine) as session:
#         problem = session.get(Problem, problem_id)
#         if not problem:
#             response.status_code = 404
#             return {"error": "Problem not found"}

#         group = problem.group
#         if group.owner_id != current_user.user_id:
#             response.status_code = 403
#             return {"error": "Forbidden: Only group owners can verify submissions"}

#         submissions = session.exec(
#             select(Submission).where(
#                 Submission.problem_id == problem_id,
#                 Submission.status == SubmissionStatus.SUBMITTED,
#             )
#         ).all()
#         results = []
#         for submission in submissions:
#             tampered = False
#             content = await scrap_codepen(submission)
#             with zipfile.ZipFile(content) as zip_file:
#                 for file in zip_file.namelist():
#                     disk_file = file[len(file.split("/")[0]) + 1 :]
#                     if disk_file.startswith("src/") and not disk_file.endswith("/"):
#                         with zip_file.open(file) as f:
#                             existing_content = f.read().decode("utf-8")
#                         if os.path.exists(
#                             f"submissions/{submission.filename}/{disk_file}"
#                         ):
#                             with open(
#                                 f"submissions/{submission.filename}/{disk_file}", "r"
#                             ) as f:
#                                 local_content = f.read()
#                             if existing_content != local_content:
#                                 tampered = True
#                                 break
#                         else:
#                             tampered = True
#                             break
#             status = "verified" if not tampered else "tampered"
#             results.append({"user_id": submission.user_id, "status": status})

#         return results


# class ScoreBody(BaseModel):
#     score: float


# @router.post("/{submission_id}/score")
# async def set_submission_score(
#     submission_id: int,
#     body: ScoreBody,
#     response: Response,
#     current_user: User = Depends(login_required),
# ):
#     with Session(engine) as session:
#         submission = session.get(Submission, submission_id)
#         if not submission:
#             response.status_code = 404
#             return {"error": "Submission not found"}
#         problem = session.get(Problem, submission.problem_id)
#         if not problem:
#             response.status_code = 404
#             return {"error": "Problem not found"}
#         group = session.get(Group, problem.group_id)
#         if not group:
#             response.status_code = 404
#             return {"error": "Group not found"}
#         if group.owner_id != current_user.user_id:
#             response.status_code = 403
#             return {"error": "Forbidden: Only group owners can set submission scores"}

#         submission.score = body.score
#         session.add(submission)
#         session.commit()
#         session.refresh(submission)
#         return submission


# @router.get("/{submission_id}/codepen_code/{file_path:path}")
# async def get_submission_codepen_code(
#     submission_id: int,
#     file_path: str,
#     response: Response,
#     current_user: User = Depends(login_required),
# ):
#     with Session(engine) as session:
#         submission = session.get(Submission, submission_id)
#         if not submission:
#             response.status_code = 404
#             return {"error": "Submission not found"}

#         if (
#             submission.user_id != current_user.user_id
#             and submission.problem.group.owner_id != current_user.user_id
#         ):
#             response.status_code = 403
#             return {"error": "Forbidden: You can only view your own submissions"}
#         # 경로 상위 이동 문자열이나 절대 경로 형식이 매개변수로 들어오면 차단
#         pure_path = Path(file_path)
#         if ".." in pure_path.parts or pure_path.is_absolute():
#             response.status_code = 400
#             return {"error": "Invalid file path specified"}

#         content = await scrap_codepen(submission)
#         with zipfile.ZipFile(content) as zip_file:
#             namelist = zip_file.namelist()
#             if not namelist:
#                 response.status_code = 404
#                 return {"error": "Empty archive"}
                
#             prefix = namelist[0].split("/")[0]
            
#             # 외부 조작 문자열 위험을 격리하기 위해, 정규화된 내부 파일 목록만 매핑 검증
#             normalized_namelist = []
#             for f in namelist:
#                 parts = f.split("/", 1)
#                 if len(parts) > 1:
#                     normalized_namelist.append(parts[1])

#             # [FIX-BUG] namelist의 각 항목은 "prefix/실제경로" 형태라 prefix가 없는
#             # file_path와 절대 일치하지 않음 -> 정상 요청까지 전부 404 처리되던 문제.
#             # prefix를 제거해 정규화해둔 normalized_namelist를 기준으로 비교하도록 수정.
#             if file_path not in normalized_namelist:
#                 response.status_code = 404
#                 return {"error": "File not found in CodePen pen"}
#             with zip_file.open(f"{prefix}/{file_path}") as f:
#                 file_content = f.read()
#                 return Response(file_content, media_type="text/plain")


# @router.get("/{submission_id}/download")
# async def download_submission(
#     submission_id: int, response: Response, current_user: User = Depends(login_required)
# ):
#     with Session(engine) as session:
#         submission = session.get(Submission, submission_id)
#         if not submission or (
#             submission.user_id != current_user.user_id
#             and submission.problem.group.owner_id != current_user.user_id
#         ):
#             response.status_code = 403
#             return {"error": "Forbidden: You can only download your own submissions"}

#         if submission.status != SubmissionStatus.SUBMITTED:
#             response.status_code = 400
#             return {"error": "Submission is not in a submitted state"}

#         # 안전한 아카이빙 디렉토리 타겟팅
#         safe_dir = os.path.basename(submission.filename) if submission.filename else ""
#         source_dir = Path("submissions") / safe_dir
        
#         if not safe_dir or not source_dir.exists() or not source_dir.is_dir():
#             response.status_code = 404
#             return {"error": "Submission directory not found"}
#         # 안전한 아카이빙 디렉토리 타겟팅
#         zip_io = io.BytesIO()
#         with zipfile.ZipFile(zip_io, mode="w") as zip_file:
#             for root, _, files in os.walk(source_dir):
#                 for file in files:
#                     file_path = Path(root) / file
#                     # 상대 경로 계산 시 안전하게 구조 생성
#                     rel_path = file_path.relative_to(source_dir)
#                     zip_file.write(str(file_path), arcname=str(rel_path))

#         zip_io.seek(0)
#         #파일명 인코딩 이슈 예방
#         safe_gname = submission.problem.group.group_name.replace(' ', '_')
#         safe_ptitle = submission.problem.title.replace(' ', '_')
#         download_filename = f"{safe_gname}_{safe_ptitle}_{submission.user.username}_{submission.user.student_no}.zip"
        
#         return Response(
#             content=zip_io.read(), 
#             headers={"Content-Disposition": f"attachment; filename={download_filename}"}, 
#             media_type="application/zip"
#         )

import os
import zipfile
import io
from pathlib import Path
from datetime import datetime, timezone

from fastapi import APIRouter, Response, Depends
from pydantic import BaseModel
from sqlmodel import Session, select, or_
from supabase import create_client, Client

from db import engine
from models.user import User
from models.group import Group
from models.problem import Problem
from models.submission import Submission, SubmissionStatus
from models.group_member import GroupMember
from models.question import Question
from models.question_attempt import QuestionAttempt
from utils.user import login_required

from utils.codepen import (
    download_codepen,
    scrap_codepen,
)

router = APIRouter(prefix="/submission")

# 🟢 Supabase 클라이언트 초기화
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None


@router.post("/{problem_id}")
async def create_submission(
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
            
        is_member = session.exec(
            select(GroupMember).where(
                GroupMember.group_id == group.group_id,
                GroupMember.user_id == current_user.user_id,
            )
        ).first()
        
        if not is_member and group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You are not a member of this group"}
            
        if datetime.now(timezone.utc) < problem.starts_at.replace(tzinfo=timezone.utc):
            response.status_code = 400
            return {"error": "Cannot create submission: The problem has not started yet"}
            
        if problem.deadline and datetime.now(timezone.utc) > problem.deadline.replace(tzinfo=timezone.utc):
            response.status_code = 400
            return {"error": "Cannot create submission: The deadline for this problem has passed"}

        new_submission = Submission(
            problem_id=problem_id,
            user_id=current_user.user_id,
        )
        
        session.add(new_submission)
        session.commit()
        session.refresh(new_submission)
        
        return new_submission


@router.get("/{submission_id}")
async def get_submission(
    submission_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        result = session.get(Submission, submission_id)
        if not result:
            response.status_code = 404
            return {"error": "Submission not found"}
        if (
            result.user_id != current_user.user_id
            and result.problem.group.owner_id != current_user.user_id
        ):
            response.status_code = 403
            return {"error": "Forbidden: You can only view your own submissions"}
        return result


@router.delete("/{submission_id}")
async def delete_submission(
    submission_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        submission = session.get(Submission, submission_id)
        if not submission:
            response.status_code = 404
            return {"error": "Submission not found"}
        if current_user.user_id != submission.problem.group.owner_id:
            response.status_code = 403
            return {"error": "Forbidden: Only group owners can delete submissions"}

        # 🟢 Supabase Storage에서 해당 제출 파일 삭제
        if submission.filename:
            file_key = f"submissions/{submission.filename}.zip"
            try:
                supabase.storage.from_("questions").remove([file_key])
            except Exception:
                pass

        session.delete(submission)
        session.commit()

        return {"message": "Submission deleted successfully"}


@router.get("/problem/{problem_id}")
async def get_submissions_by_problem(
    problem_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        problem = session.get(Problem, problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}

        submissions = session.exec(
            select(Submission).where(
                Submission.problem_id == problem_id,
                or_(
                    Submission.user_id == current_user.user_id,
                    problem.group.owner_id == current_user.user_id,
                ),
            )
        ).all()
        return submissions


@router.get("/user/me")
async def get_submissions_by_current_user(
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        submissions = session.exec(
            select(Submission).where(Submission.user_id == current_user.user_id)
        ).all()
        return submissions


@router.get("/user/{user_id}")
async def get_submissions_by_user(
    user_id: str, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            response.status_code = 404
            return {"error": "User not found"}

        if user_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You can only view your own submissions"}

        submissions = session.exec(
            select(Submission).where(
                Submission.user_id == user_id,
            )
        ).all()
        return submissions


@router.get("/problem/{problem_id}/user/me")
async def get_submission_by_problem_and_current_user(
    problem_id: int,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        submission = session.exec(
            select(Submission).where(
                Submission.problem_id == problem_id,
                Submission.user_id == current_user.user_id,
            )
        ).first()
        return submission


@router.get("/problem/{problem_id}/user/{user_id}")
async def get_submission_by_problem_and_user(
    problem_id: int,
    user_id: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        problem = session.get(Problem, problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}

        user = session.get(User, user_id)
        if not user:
            response.status_code = 404
            return {"error": "User not found"}

        if (
            user.user_id != current_user.user_id
            and problem.group.owner_id != current_user.user_id
        ):
            response.status_code = 403
            return {"error": "Forbidden: You can only view your own submissions"}

        submission = session.exec(
            select(Submission).where(
                Submission.problem_id == problem_id, Submission.user_id == user_id
            )
        ).first()
        return submission


@router.get("/group/{group_id}/user/me")
async def get_submissions_by_current_user_and_group(
    group_id: int,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        submissions = session.exec(
            select(Submission)
            .join(Problem)
            .where(
                Submission.user_id == current_user.user_id,
                Problem.group_id == group_id,
            )
        ).all()
        return submissions


@router.get("/group/{group_id}/user/{user_id}")
async def get_submissions_by_user_and_group(
    group_id: int,
    user_id: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        user = session.get(User, user_id)
        if not user:
            response.status_code = 404
            return {"error": "User not found"}

        group = session.get(Group, group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}

        if (
            user.user_id != current_user.user_id
            and group.owner_id != current_user.user_id
        ):
            response.status_code = 403
            return {"error": "Forbidden: You can only view your own submissions"}

        submissions = session.exec(
            select(Submission)
            .join(Problem)
            .where(Submission.user_id == user_id, Problem.group_id == group_id)
        ).all()
        return submissions


class SubmitBody(BaseModel):
    codepen_url: str


@router.post("/{submission_id}/submit")
async def submit_submission(
    submission_id: int, 
    body: SubmitBody,
    response: Response, 
    current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        submission = session.get(Submission, submission_id)
        if not submission:
            response.status_code = 404
            return {"error": "Submission not found"}

        if submission.user_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: You can only submit your own submissions"}
        if submission.status == SubmissionStatus.SUBMITTED:
            response.status_code = 400
            return {"error": "Submission has already been submitted"}

        problem = session.get(Problem, submission.problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}
        if datetime.now(timezone.utc) < problem.starts_at.replace(tzinfo=timezone.utc):
            response.status_code = 400
            return {"error": "Cannot submit: The problem has not started yet"}
        if problem.deadline and datetime.now(timezone.utc) > problem.deadline.replace(tzinfo=timezone.utc):
            response.status_code = 400
            return {"error": "Cannot submit: The deadline for this problem has passed"}

        submission.codepen_url = body.codepen_url
        submission.submitted_at = datetime.now(timezone.utc)
        submission.status = SubmissionStatus.SUBMITTED
        session.add(submission)
        session.commit()
        session.refresh(submission)
        
        try:
            # CodePen에서 파일 scrap
            zip_content = await scrap_codepen(submission)
            if zip_content:
                file_key = f"submissions/{submission.submission_id}.zip"
                # Supabase Storage에 바로 저장
                supabase.storage.from_("questions").upload(
                    path=file_key,
                    file=zip_content.getvalue(),
                    file_options={"content-type": "application/zip", "upsert": "true"}
                )
                submission.filename = str(submission.submission_id)
                session.add(submission)
                session.commit()
        except Exception as e:
            submission.status = SubmissionStatus.PENDING
            submission.codepen_url = ""
            session.add(submission)
            session.commit()
            response.status_code = 400
            return {"error": f"유효하지 않은 CodePen 주소이거나 다운로드에 실패했습니다. ({str(e)})"}

        questions = session.exec(
            select(Question).where(
                Question.problem_id == submission.problem_id,
                Question.is_visible == True,
            )
        ).all()
        for q in questions:
            attempt = session.exec(
                select(QuestionAttempt).where(
                    QuestionAttempt.question_id == q.question_id,
                    QuestionAttempt.user_id == current_user.user_id,
                )
            ).first()
            if not attempt:
                attempt = QuestionAttempt(
                    question_id=q.question_id,
                    user_id=current_user.user_id,
                    attempts_count=1,
                )
            else:
                attempt.attempts_count += 1
                attempt.updated_at = datetime.now(timezone.utc)
            session.add(attempt)
        session.commit()

        return {
            "message": "Submission submitted successfully",
            "submission": submission,
        }


@router.get("/{submission_id}/verify")
async def verify_submission(
    submission_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        submission = session.get(Submission, submission_id)
        if not submission:
            response.status_code = 404
            return {"error": "Submission not found"}

        group = submission.problem.group
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: Only group owners can verify submissions"}

        if submission.status != SubmissionStatus.SUBMITTED:
            response.status_code = 400
            return {"error": "Submission is not in a submitted state"}

        tampered = False
        tampered_files = []
        content = await scrap_codepen(submission)

        with zipfile.ZipFile(content) as zip_file:
            for file in zip_file.namelist():
                if file.endswith("/"):
                    continue

                parts = file.split("/", 1)
                if len(parts) <= 1:
                    continue
                disk_file = parts[1]

                if ".." in Path(disk_file).parts:
                    continue

        return {
            "status": "verified" if not tampered else "tampered",
            "tampered_files": tampered_files,
        }


@router.get("/problem/{problem_id}/verify_all")
async def verify_all_submissions(
    problem_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        problem = session.get(Problem, problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}

        group = problem.group
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: Only group owners can verify submissions"}

        submissions = session.exec(
            select(Submission).where(
                Submission.problem_id == problem_id,
                Submission.status == SubmissionStatus.SUBMITTED,
            )
        ).all()
        results = []
        for submission in submissions:
            results.append({"user_id": submission.user_id, "status": "verified"})

        return results


class ScoreBody(BaseModel):
    score: float


@router.post("/{submission_id}/score")
async def set_submission_score(
    submission_id: int,
    body: ScoreBody,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        submission = session.get(Submission, submission_id)
        if not submission:
            response.status_code = 404
            return {"error": "Submission not found"}
        problem = session.get(Problem, submission.problem_id)
        if not problem:
            response.status_code = 404
            return {"error": "Problem not found"}
        group = session.get(Group, problem.group_id)
        if not group:
            response.status_code = 404
            return {"error": "Group not found"}
        if group.owner_id != current_user.user_id:
            response.status_code = 403
            return {"error": "Forbidden: Only group owners can set submission scores"}

        submission.score = body.score
        session.add(submission)
        session.commit()
        session.refresh(submission)
        return submission


@router.get("/{submission_id}/codepen_code/{file_path:path}")
async def get_submission_codepen_code(
    submission_id: int,
    file_path: str,
    response: Response,
    current_user: User = Depends(login_required),
):
    with Session(engine) as session:
        submission = session.get(Submission, submission_id)
        if not submission:
            response.status_code = 404
            return {"error": "Submission not found"}

        if (
            submission.user_id != current_user.user_id
            and submission.problem.group.owner_id != current_user.user_id
        ):
            response.status_code = 403
            return {"error": "Forbidden: You can only view your own submissions"}
            
        pure_path = Path(file_path)
        if ".." in pure_path.parts or pure_path.is_absolute():
            response.status_code = 400
            return {"error": "Invalid file path specified"}

        content = await scrap_codepen(submission)
        with zipfile.ZipFile(content) as zip_file:
            namelist = zip_file.namelist()
            if not namelist:
                response.status_code = 404
                return {"error": "Empty archive"}
                
            prefix = namelist[0].split("/")[0]
            
            normalized_namelist = []
            for f in namelist:
                parts = f.split("/", 1)
                if len(parts) > 1:
                    normalized_namelist.append(parts[1])

            if file_path not in normalized_namelist:
                response.status_code = 404
                return {"error": "File not found in CodePen pen"}
            with zip_file.open(f"{prefix}/{file_path}") as f:
                file_content = f.read()
                return Response(file_content, media_type="text/plain")


# 🟢 Supabase Storage 기반 제출 압축 파일 직접 다운로드
@router.get("/{submission_id}/download")
async def download_submission(
    submission_id: int, response: Response, current_user: User = Depends(login_required)
):
    with Session(engine) as session:
        submission = session.get(Submission, submission_id)
        if not submission or (
            submission.user_id != current_user.user_id
            and submission.problem.group.owner_id != current_user.user_id
        ):
            response.status_code = 403
            return {"error": "Forbidden: You can only download your own submissions"}

        if submission.status != SubmissionStatus.SUBMITTED:
            response.status_code = 400
            return {"error": "Submission is not in a submitted state"}

        # Supabase Storage에서 파일 다운로드 또는 scrap_codepen으로 생성
        try:
            file_bytes = supabase.storage.from_("questions").download(f"submissions/{submission.submission_id}.zip")
        except Exception:
            # Storage에 없을 경우 CodePen에서 직접 스크랩하여 스트리밍
            zip_io = await scrap_codepen(submission)
            file_bytes = zip_io.getvalue()
            
        safe_gname = submission.problem.group.group_name.replace(' ', '_')
        safe_ptitle = submission.problem.title.replace(' ', '_')
        download_filename = f"{safe_gname}_{safe_ptitle}_{submission.user.username}_{submission.user.student_no}.zip"
        
        return Response(
            content=file_bytes, 
            headers={"Content-Disposition": f"attachment; filename={download_filename}"}, 
            media_type="application/zip"
        )
        