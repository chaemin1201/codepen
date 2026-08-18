from functools import wraps
from fastapi import Request, HTTPException, Depends
from sqlmodel import Session
from db import engine
from models.user import User

# FastAPI의 Depends 체계에서 재사용 가능한 DB 세션 디펜던시
def get_db_session():
    with Session(engine) as session:
        yield session

def get_current_user(request: Request):
    user = request.session.get("user")
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return user


async def login_required(
    request: Request, 
    session: Session = Depends(get_db_session)
) -> User:
    session_user = request.session.get("user")
    if not session_user:
        raise HTTPException(status_code=401, detail="Unauthorized")

    db_user = session.get(User, session_user["sub"])
    
    # DB에 유저가 없는 유령 세션일 경우 세션 강제 파기
    if not db_user:
        request.session.clear()  # 브라우저의 오염된 쿠키 세션 무효화
        raise HTTPException(status_code=401, detail="User accounts no longer exists")

    # 라우터 전역 dependencies 배치 시에도 접근 가능하도록 request.state에 바인딩
    request.state.user = db_user

    return db_user
