import os

os.environ.setdefault("SESSION_SECRET", "test-secret")
os.environ.setdefault("IS_PRODUCTION", "false")
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_database.db")

import sys  # noqa: E402
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))  # noqa: E402

import json  # noqa: E402
from base64 import b64encode  # noqa: E402
import itsdangerous  # noqa: E402

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

import main  # noqa: E402
from db import engine  # noqa: E402


def _sign_session_cookie(payload: dict) -> str:
    """[배포 준비] 실제 회원가입/로그인이 이제 request.session["user"]가 진짜
    구글 로그인으로 채워져 있어야만 동작하도록 바뀌었습니다 (테스트용 백도어
    라우트를 없앴기 때문). 테스트에서는 Starlette SessionMiddleware가 실제로
    만드는 것과 똑같은 서명된 쿠키를 직접 만들어서, "이미 구글 로그인된 것"
    처럼 세션을 미리 채워넣습니다. main.py 앱 코드는 전혀 건드리지 않습니다."""
    signer = itsdangerous.TimestampSigner(os.environ["SESSION_SECRET"])
    data = b64encode(json.dumps({"user": payload}).encode("utf-8"))
    return signer.sign(data).decode("utf-8")


def login_as(client, sub: str, email: str):
    """구글 로그인이 이미 끝난 것처럼 세션 쿠키를 강제로 심어줍니다."""
    client.cookies.set("session", _sign_session_cookie({"sub": sub, "email": email}))


@pytest.fixture()
def client():
    """매 테스트마다 테이블을 비우고 다시 만들어서 서로 영향 안 주게 합니다.
    (SQLModel의 메타데이터 레지스트리가 클래스 단위 전역이라 모듈을 매번 다시
    import하는 방식은 "테이블이 이미 정의됨" 에러가 나서 안 썼습니다. 대신
    같은 앱/모델을 계속 쓰되, 실제 sqlite 파일의 테이블 내용만 매번 초기화합니다.)
    """
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with TestClient(main.app) as c:
        yield c


def register_professor(client, username="TestProf"):
    sub = f"google_sub_prof_{username}"
    email = f"{username}@example.com"
    login_as(client, sub, email)
    resp = client.post(
        "/api/user",
        json={
            "role": "professor",
            "username": username,
            "department": "CS",
            "position": "교수",
            "office": "101호",
        },
    )
    if resp.status_code == 400 and resp.json().get("error") == "User already exists":
        # 이미 가입된 사용자로 "로그인"만 다시 하는 경우
        return {"user_id": sub, "username": username}
    assert resp.status_code == 200, resp.text
    return resp.json()


def register_student(client, student_no=20250001, username="TestStudent"):
    sub = f"google_sub_stu_{student_no}"
    email = f"{username}_{student_no}@example.com"
    login_as(client, sub, email)
    resp = client.post(
        "/api/user",
        json={
            "role": "student",
            "username": username,
            "student_no": student_no,
            "grade": 1,
            "major": "컴퓨터공학",
            "codepen_username": "cptest",
        },
    )
    if resp.status_code == 400 and resp.json().get("error") == "User already exists":
        return {"user_id": sub, "username": username, "student_no": student_no}
    assert resp.status_code == 200, resp.text
    return resp.json()
