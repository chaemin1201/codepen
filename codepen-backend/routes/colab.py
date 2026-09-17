import os
import httpx
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

from fastapi import APIRouter, Request, Response, Depends
from fastapi.responses import RedirectResponse
from sqlmodel import Session

from db import engine
from models.user import User
from models.colab import GoogleCredential
from utils.user import login_required

# 🟢 prefix를 /google-drive 로 수정하여 프론트엔드 요청(/api/google-drive/...)과 일치시킵니다.
router = APIRouter(prefix="/google-drive")

GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET = os.environ.get("GOOGLE_CLIENT_SECRET", "")

# 기본 콜백 주소도 /api/google-drive/callback 으로 맞춰줍니다.
GOOGLE_DRIVE_REDIRECT_URI = os.environ.get(
    "GOOGLE_DRIVE_REDIRECT_URI", "http://localhost:8000/api/google-drive/callback"
)
FRONTEND_RETURN_URL = os.environ.get("FRONTEND_URL", "http://localhost:3000")

DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file"


@router.get("/connect")
async def connect_google_drive(current_user: User = Depends(login_required)):
    """교수가 이 엔드포인트로 오면 구글 OAuth 동의 화면으로 리다이렉트합니다."""
    if not GOOGLE_CLIENT_ID or not GOOGLE_DRIVE_REDIRECT_URI:
        return {"error": "서버에 GOOGLE_CLIENT_ID/GOOGLE_DRIVE_REDIRECT_URI가 설정되어 있지 않습니다."}

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": GOOGLE_DRIVE_REDIRECT_URI,
        "response_type": "code",
        "scope": DRIVE_SCOPE,
        "access_type": "offline",   # refresh_token 수신용
        "prompt": "consent",        # 동의 화면 재노출 및 refresh_token 발급 보장
        "state": current_user.user_id,
    }
    url = f"https://accounts.google.com/o/oauth2/v2/auth?{urlencode(params)}"
    return RedirectResponse(url)


@router.get("/callback")
async def google_drive_callback(request: Request):
    """구글이 인증 코드를 실어서 돌아오는 콜백. 코드를 토큰으로 교환해 저장합니다."""
    code = request.query_params.get("code")
    state_user_id = request.query_params.get("state")
    error = request.query_params.get("error")

    if error or not code or not state_user_id:
        return RedirectResponse(f"{FRONTEND_RETURN_URL}/groups?drive_connect=failed")

    async with httpx.AsyncClient(timeout=10.0) as client:
        token_res = await client.post(
            "https://oauth2.googleapis.com/token",
            data={
                "code": code,
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "redirect_uri": GOOGLE_DRIVE_REDIRECT_URI,
                "grant_type": "authorization_code",
            },
        )

    if token_res.status_code >= 400:
        print(f"❌ [Google Drive OAuth] 토큰 교환 실패: {token_res.text}")
        return RedirectResponse(f"{FRONTEND_RETURN_URL}/groups?drive_connect=failed")

    token_data = token_res.json()
    access_token = token_data.get("access_token")
    refresh_token = token_data.get("refresh_token")
    expires_in = token_data.get("expires_in", 3600)

    if not access_token:
        return RedirectResponse(f"{FRONTEND_RETURN_URL}/groups?drive_connect=failed")

    with Session(engine) as session:
        existing = session.get(GoogleCredential, state_user_id)
        expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)

        if existing:
            existing.access_token = access_token
            if refresh_token:
                existing.refresh_token = refresh_token
            existing.token_expiry = expiry
            existing.updated_at = datetime.now(timezone.utc)
            session.add(existing)
        else:
            if not refresh_token:
                print("❌ [Google Drive OAuth] 최초 연결인데 refresh_token이 없습니다.")
                return RedirectResponse(f"{FRONTEND_RETURN_URL}/groups?drive_connect=failed")
            session.add(GoogleCredential(
                user_id=state_user_id,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expiry=expiry,
            ))
        session.commit()

    return RedirectResponse(f"{FRONTEND_RETURN_URL}/groups?drive_connect=success")


@router.get("/status")
async def google_drive_status(current_user: User = Depends(login_required)):
    """프론트에서 '연결됨/연결 안 됨' 표시용."""
    with Session(engine) as session:
        cred = session.get(GoogleCredential, current_user.user_id)
        return {"connected": cred is not None}


@router.delete("/disconnect")
async def disconnect_google_drive(current_user: User = Depends(login_required)):
    with Session(engine) as session:
        cred = session.get(GoogleCredential, current_user.user_id)
        if cred:
            session.delete(cred)
            session.commit()
    return {"message": "Google Drive 연결이 해제되었습니다."}


async def get_valid_drive_token(user_id: str) -> str | None:
    """유효한 access_token을 반환하며, 만료되었으면 refresh_token으로 자동 갱신합니다."""
    with Session(engine) as session:
        cred = session.get(GoogleCredential, user_id)
        if not cred:
            return None

        if cred.token_expiry > datetime.now(timezone.utc) + timedelta(minutes=1):
            return cred.access_token

        async with httpx.AsyncClient(timeout=10.0) as client:
            refresh_res = await client.post(
                "https://oauth2.googleapis.com/token",
                data={
                    "client_id": GOOGLE_CLIENT_ID,
                    "client_secret": GOOGLE_CLIENT_SECRET,
                    "refresh_token": cred.refresh_token,
                    "grant_type": "refresh_token",
                },
            )

        if refresh_res.status_code >= 400:
            print(f"❌ [Google Drive OAuth] 토큰 갱신 실패 (user_id={user_id}): {refresh_res.text}")
            return None

        refreshed = refresh_res.json()
        new_access_token = refreshed.get("access_token")
        expires_in = refreshed.get("expires_in", 3600)
        if not new_access_token:
            return None

        cred.access_token = new_access_token
        cred.token_expiry = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        cred.updated_at = datetime.now(timezone.utc)
        session.add(cred)
        session.commit()

        return new_access_token