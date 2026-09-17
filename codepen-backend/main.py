from dotenv import load_dotenv
load_dotenv()
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
from routes.category import router as category_router
from routes.question import router as question_router
# 🟢 [수정] Google Drive OAuth(교수 Drive 연결, Colab 학생별 노트북 자동생성/권한회수)
# 라우터가 여기 빠져 있어서, 지금까지 만든 관련 기능이 전부 404로 동작 안 하고
# 있었습니다. 추가했습니다.
from routes.colab import router as colab_router
# 🟢 [수정] routes/submission.py는 완전히 고장난 옛날 시스템입니다 - scrap_codepen()이
# 항상 None을 반환하도록 바뀌면서, 이 라우트로 제출하면 "성공"으로 응답은 하는데 실제
# 파일은 저장이 안 되고, 나중에 코드를 읽으려 하면 TypeError로 500이 납니다. 프론트도
# 이제 이 라우트를 안 씁니다(전부 /api/question/... 로 통일됨). 라우터 등록도 지웠습니다.
# 파일(routes/submission.py, models/submission.py)도 프로젝트에서 지우셔도 됩니다.
# from routes.submission import router as submission_router

# 🟢 [수정] Submission/Problem은 여기 활성 코드에서 더 이상 안 쓰여서(옛날 lifespan
# 코드에서만 쓰였던 것) import를 지웠습니다.

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
api.include_router(category_router)
api.include_router(question_router)
# 🟢 [수정] Google Drive OAuth 라우터 등록 - 이게 빠져 있어서 관련 기능 전체가 404였음
api.include_router(colab_router)
# 🟢 [수정] 고장난 옛날 시스템이라 등록 제거 (위 import도 같이 뺐음)
# api.include_router(submission_router)

app.include_router(api)