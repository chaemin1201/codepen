# from fastapi import FastAPI, APIRouter, Request
# from fastapi.middleware.cors import CORSMiddleware
# from fastapi.responses import JSONResponse, RedirectResponse
# from fastapi.staticfiles import StaticFiles
# from starlette.middleware.sessions import SessionMiddleware
# from authlib.integrations.starlette_client import OAuth
# from starlette.config import Config
# from contextlib import asynccontextmanager
# from sqlmodel import Session, select
# from datetime import datetime, timezone
# import asyncio

# from routes.user import router as user_router
# from routes.group import router as group_router
# from routes.problem import router as problem_router
# from routes.submission import router as submission_router
# from routes.category import router as category_router
# from routes.question import router as question_router

# from models.submission import Submission, SubmissionStatus
# from models.problem import Problem

# from utils.codepen import (
#     initialize_codepen,
#     create_codepen,
#     download_codepen,
#     refresh_codepen_auth,
#     open_codepen_pen,
#     shutdown_codepen,
# )

# from db import engine

# from utils.scheduler import (
#     scheduler,
#     start_scheduler,
#     shutdown_scheduler,
#     schedule_problem_deadline,
# )

# config = Config(".env")

# ORIGINS = (
#     [
#         "https://notiworld.co.kr",
#         "https://www.notiworld.co.kr",
#     ]
#     if config("IS_PRODUCTION", cast=bool, default=False)
#     else [
#         "http://localhost:3000",
#         "http://127.0.0.1:3000",  # 추가
#         "http://localhost:8000",  # 추가
#         "http://127.0.0.1:8000",  # 추가
#     ]
# )

# async def _codepen_startup_tasks():
#     """Run CodePen initialization in the background so the server starts immediately."""
#     print("CodePen startup tasks skipped for local testing.", flush=True)
#     return # <-- 여기서 바로 리턴하여 Playwright 초기화를 건너뜁니다.
# # 윈도우에서 백엔드 실행 오류로 우회하여 실행
# # async def _codepen_startup_tasks():
# #     """Run CodePen initialization in the background so the server starts immediately."""
# #     import traceback
# #     print("CodePen startup tasks starting...", flush=True)
# #     try:
# #         await initialize_codepen()
# #         print("CodePen browser initialized with existing cookies.", flush=True)
# #     except Exception as e:
# #         traceback.print_exc()
# #         print(f"Warning: CodePen init failed, skipping CodePen tasks: {e}", flush=True)
# #         return
# #     if True:
# #         with Session(engine) as session:
# #             # Retry creating CodePen for submissions with empty codepen_url
# #             empty_url_submissions = session.exec(
# #                 select(Submission).where(
# #                     Submission.codepen_url == "",
# #                     Submission.status == SubmissionStatus.PENDING,
# #                 )
# #             ).all()
# #             for submission in empty_url_submissions:
# #                 try:
# #                     submission.codepen_url = await create_codepen(submission)
# #                     session.add(submission)
# #                     session.commit()
# #                     session.refresh(submission)
# #                     print(f"Created CodePen for submission {submission.submission_id}: {submission.codepen_url}")
# #                 except Exception as e:
# #                     print(f"Warning: Failed to create CodePen for submission {submission.submission_id}: {e}")

# #             after_deadline_submissions = session.exec(
# #                 select(Submission)
# #                 .where(
# #                     Submission.status == SubmissionStatus.PENDING,
# #                     Problem.deadline < datetime.now(timezone.utc),
# #                 )
# #                 .join(Problem)
# #             ).all()
# #             for submission in after_deadline_submissions:
# #                 try:
# #                     await download_codepen(submission)
# #                 except Exception as e:
# #                     print(f"Warning: Failed to download submission {submission.submission_id}: {e}")
# #             before_deadline_problems = session.exec(
# #                 select(Problem).where(Problem.deadline > datetime.now(timezone.utc))
# #             ).all()
# #             for problem in before_deadline_problems:
# #                 schedule_problem_deadline(problem.problem_id, problem.deadline)
# #                 submissions = session.exec(
# #                     select(Submission).where(
# #                         Submission.problem_id == problem.problem_id,
# #                         Submission.status == SubmissionStatus.PENDING,
# #                     )
# #                 ).all()
# #                 for submission in submissions:
# #                     try:
# #                         await open_codepen_pen(submission.codepen_url)
# #                     except Exception as e:
# #                         print(f"Warning: Failed to open codepen for submission {submission.submission_id}: {e}")
# #     print("CodePen startup tasks completed.", flush=True)


# @asynccontextmanager
# async def lifespan(app: FastAPI):
#     scheduler.add_job(
#         func=refresh_codepen_auth,
#         trigger="interval",
#         minutes=25,
#         id="refresh_codepen_auth",
#     )
#     start_scheduler()
#     # Run CodePen tasks in background so the server starts immediately
#     codepen_task = asyncio.create_task(_codepen_startup_tasks())
#     codepen_task.add_done_callback(
#         lambda t: t.exception() and print(f"CodePen startup task failed: {t.exception()}", flush=True)
#     )
#     yield
#     codepen_task.cancel()
#     shutdown_scheduler()
#     await shutdown_codepen()


# app = FastAPI(lifespan=lifespan)
# app.mount(
#     "/api/submission_files/",
#     StaticFiles(directory="submissions"),
#     name="submission_files",
# )
# app.add_middleware(SessionMiddleware, secret_key=config("SESSION_SECRET"))
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=ORIGINS,
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
#     expose_headers=["*"],
# )
# oauth = OAuth(config)
# oauth.register(
#     name="google",
#     server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
#     client_kwargs={"scope": "openid email profile"},
# )

# api = APIRouter(prefix="/api")

# @api.get("/login")
# async def login(request: Request):
#     # redirect_uri = request.url_for("auth")
#     redirect_uri = (
#         "https://notiworld.co.kr/api/auth"
#         if config("IS_PRODUCTION", cast=bool, default=False)
#         else "http://localhost:3000/api/auth"
#     )
#     return await oauth.google.authorize_redirect(
#         request, redirect_uri, prompt="consent"
#     )


# @api.get("/auth")
# async def auth(request: Request):
#     token = await oauth.google.authorize_access_token(request)
#     user = token["userinfo"]
#     request.session["user"] = dict(user)
#     # 로컬 개발 환경(3000번 포트) 또는 배포 환경 주소로 리다이렉트
#     frontend_url = (
#         "https://notiworld.co.kr"
#         if config("IS_PRODUCTION", cast=bool, default=False)
#         else "http://localhost:3000"
#     )
#     return RedirectResponse(url=frontend_url)

# @api.get("/user/logout")
# async def logout(request: Request):
#     request.session.pop("user", None)
#     return JSONResponse(content={"message": "Logged out successfully"})


# api.include_router(user_router)
# api.include_router(group_router)
# api.include_router(problem_router)
# api.include_router(submission_router)
# api.include_router(category_router)
# api.include_router(question_router)


# app.include_router(api)

from fastapi import FastAPI, APIRouter, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from authlib.integrations.starlette_client import OAuth
from starlette.config import Config
from contextlib import asynccontextmanager
from sqlmodel import Session, select
from datetime import datetime, timezone
import asyncio
import os

# 🟢 Supabase 클라이언트 라이브러리 추가
from supabase import create_client, Client

from routes.user import router as user_router
from routes.group import router as group_router
from routes.problem import router as problem_router
from routes.submission import router as submission_router
from routes.category import router as category_router
from routes.question import router as question_router

from models.submission import Submission, SubmissionStatus
from models.problem import Problem

from db import engine

from utils.scheduler import (
    scheduler,
    start_scheduler,
    shutdown_scheduler,
    schedule_problem_deadline,
)

config = Config(".env")

# 🟢 Supabase 설정 및 클라이언트 전역 초기화
SUPABASE_URL = config("SUPABASE_URL", default="")
SUPABASE_KEY = config("SUPABASE_KEY", default="")
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY) if SUPABASE_URL and SUPABASE_KEY else None

ORIGINS = (
    [
        "https://notiworld.co.kr",
        "https://www.notiworld.co.kr",
    ]
    if config("IS_PRODUCTION", cast=bool, default=False)
    else [
        "http://localhost:3000",
        "http://127.0.0.1:3000",  
        "http://localhost:8000",  
        "http://127.0.0.1:8000",  
    ]
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Supabase Storage를 사용하므로 로컬 폴더 생성(os.makedirs)은 필요 없음
    start_scheduler()
    yield
    shutdown_scheduler()

app = FastAPI(lifespan=lifespan)

# 🔴 [기존 정적 파일 마운트 제거]
# Supabase Storage의 Public URL을 사용하므로 app.mount("/uploads", ...)는 필요 없습니다.

app.add_middleware(SessionMiddleware, secret_key=config("SESSION_SECRET"))
app.add_middleware(
    CORSMiddleware,
    allow_origins=ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

oauth = OAuth(config)
oauth.register(
    name="google",
    server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
    client_kwargs={"scope": "openid email profile"},
)

api = APIRouter(prefix="/api")

@api.get("/login")
async def login(request: Request):
    redirect_uri = (
        "https://notiworld.co.kr/api/auth"
        if config("IS_PRODUCTION", cast=bool, default=False)
        else "http://localhost:3000/api/auth"
    )
    return await oauth.google.authorize_redirect(
        request, redirect_uri, prompt="consent"
    )

@api.get("/auth")
async def auth(request: Request):
    token = await oauth.google.authorize_access_token(request)
    user = token["userinfo"]
    request.session["user"] = dict(user)
    
    frontend_url = (
        "https://notiworld.co.kr"
        if config("IS_PRODUCTION", cast=bool, default=False)
        else "http://localhost:3000"
    )
    return RedirectResponse(url=frontend_url)

@api.get("/user/logout")
async def logout(request: Request):
    request.session.pop("user", None)
    return JSONResponse(content={"message": "Logged out successfully"})

api.include_router(user_router)
api.include_router(group_router)
api.include_router(problem_router)
api.include_router(submission_router)
api.include_router(category_router)
api.include_router(question_router)

app.include_router(api)
