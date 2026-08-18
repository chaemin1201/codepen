from fastapi import APIRouter, Response, Request
from sqlmodel import Session, select, col
from db import engine
from models.user import User, UserRole
from pydantic import BaseModel

router = APIRouter(prefix="/user")


class PartialUser(BaseModel):
    role: UserRole = UserRole.STUDENT
    username: str
    student_no: int | None = None
    grade: int | None = None
    major: str | None = None
    codepen_username: str | None = None
    department: str | None = None
    position: str | None = None
    office: str | None = None


class PartialUserEdit(BaseModel):
    username: str | None = None
    student_no: int | None = None
    grade: int | None = None
    major: str | None = None
    codepen_username: str | None = None
    department: str | None = None
    position: str | None = None
    office: str | None = None

@router.post("")
async def create_user(partial_user: PartialUser, request: Request, response: Response):
    # [배포 준비 - 보안 수정] 로컬 테스트 편의를 위해 실제 구글 로그인 없이도
    # 아무 정보나 보내면 계정이 만들어지던 우회 로직을 되돌렸습니다. 실제
    # 구글 OAuth를 통해 세션이 이미 만들어져 있어야만("/api/auth" 콜백에서
    # request.session["user"]를 채워줌) 회원가입이 진행됩니다.
    user_data = request.session.get("user")
    if not user_data:
        response.status_code = 401
        return {"error": "Unauthorized"}

    with Session(engine) as session:
        existing_user = session.get(User, user_data["sub"])
        if existing_user:
            response.status_code = 400
            return {"error": "User already exists"}

        # [신규] 이메일 중복 확인 (구글 계정 기준이라 사실상 항상 유니크하지만 방어적으로 확인)
        existing_email = session.exec(
            select(User).where(User.email == user_data["email"])
        ).first()
        if existing_email:
            response.status_code = 400
            return {"error": "Email already exists"}

        if partial_user.role == UserRole.PROFESSOR:
            user = User(
                user_id=user_data["sub"],
                username=partial_user.username,
                email=user_data["email"],
                role=UserRole.PROFESSOR,
                department=partial_user.department,
                position=partial_user.position,
                office=partial_user.office,
            )
        else:
            # [신규] 학번 중복 확인
            if partial_user.student_no is not None:
                existing_student_no = session.exec(
                    select(User).where(User.student_no == partial_user.student_no)
                ).first()
                if existing_student_no:
                    response.status_code = 400
                    return {"error": "Student number already exists"}
            user = User(
                user_id=user_data["sub"],
                username=partial_user.username,
                email=user_data["email"],
                role=UserRole.STUDENT,
                student_no=partial_user.student_no,
                grade=partial_user.grade,
                major=partial_user.major,
                codepen_username=partial_user.codepen_username,
            )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user


@router.patch("/me")
async def update_current_user(
    partial_user: PartialUserEdit, request: Request, response: Response
):
    user_data = request.session.get("user")
    if not user_data:
        response.status_code = 401
        return {"error": "Unauthorized"}
    with Session(engine) as session:
        user = session.get(User, user_data["sub"])
        if not user:
            response.status_code = 404
            return {"error": "User not found"}

        if partial_user.username is not None:
            user.username = partial_user.username
        # 학번 변경 시 중복 검사
        if partial_user.student_no is not None and partial_user.student_no != user.student_no:
            user_with_same_student_no = session.exec(
                select(User).where(User.student_no == partial_user.student_no)
            ).first()
            if user_with_same_student_no:
                response.status_code = 400
                return {"error": "Student number already exists"}
            user.student_no = partial_user.student_no
        if partial_user.grade is not None:
            user.grade = partial_user.grade
        if partial_user.major is not None:
            user.major = partial_user.major
        if partial_user.codepen_username is not None:
            user.codepen_username = partial_user.codepen_username
        # 역할 권한에 따른 민감 필드 방어
        if user.role in [UserRole.PROFESSOR, "admin"]:
            if partial_user.department is not None:
                user.department = partial_user.department
            if partial_user.position is not None:
                user.position = partial_user.position
            if partial_user.office is not None:
                user.office = partial_user.office

        session.add(user)
        session.commit()
        session.refresh(user)
        return user

@router.get("/me")
async def get_current_user(request: Request, response: Response):
    # 1. 세션에서 로그인한 유저 정보 확인
    user_data = request.session.get("user")
    if not user_data:
        response.status_code = 401
        return {"error": "Unauthorized"}

    # 2. 세션에 있는 user_id(sub)로 DB 조회
    with Session(engine) as session:
        user = session.get(User, user_data["sub"])
        if not user:
            response.status_code = 404
            return {"error": "User not found"}
        return user
# @router.get("/me")
# async def get_current_user(request: Request, response: Response):
#     user_data = request.session.get("user")
#     if not user_data:
#         response.status_code = 401
#         return {"error": "Unauthorized"}

#     with Session(engine) as session:
#         user = session.get(User, user_data["sub"])
#         if not user:
#             response.status_code = 404
#             return {"error": "User not found"}
#         return user

# 남들에게 공개되는 개인정보를 제한
@router.get("/{user_id}")
async def get_user(user_id: str, response: Response):
    with Session(engine) as session:
        result = session.get(User, user_id)
        if result:
            return {
                "username" : result.username,
                "major" : result.major,
                "grade" : result.grade
            }
        response.status_code = 404
        return {"error": "User not found"}

# 남들에게 공개되는 개인정보를 제한
@router.get("/search/{query}")
async def search_users(query: str):
    with Session(engine) as session:
        statement = select(User).where(
            col(User.username).contains(query) | col(User.student_no).contains(query)
        )
        results = session.exec(statement).all()
        safe_result = []
        for user in results:
            safe_result.append({
                "username" : user.username,
                "major" : user.major,
                "grade" : user.grade
            })
        return safe_result

# [배포 준비 - 보안 수정] 세션 검증 없이 누구나 교수 계정으로 즉시 로그인할 수
# 있던 테스트용 백도어 라우트를 완전히 제거했습니다. 배포 환경에 이게 남아있으면
# 로그인 없이 URL만 알면 교수 권한을 가져갈 수 있는 심각한 보안 구멍이 됩니다.