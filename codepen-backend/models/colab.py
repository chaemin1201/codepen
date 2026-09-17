from sqlmodel import SQLModel, Field
from datetime import datetime, timezone


# 🟢 교수 계정별 Google Drive OAuth 토큰 저장 테이블.
# API 키(GOOGLE_DRIVE_API_KEY, 읽기 전용) 방식 대신, 교수 본인 계정으로 로그인해서
# 받은 access_token/refresh_token을 저장합니다. 이러면:
#   - 노트북을 교수 계정 소유로 만들 수 있어서(쓰기 권한), 학생이 공유 설정을 실수해도
#     교수(=우리 시스템)는 항상 읽을 수 있습니다.
#   - access_token은 보통 1시간 후 만료되므로, refresh_token으로 자동 갱신합니다.
class GoogleCredential(SQLModel, table=True):
    # 교수 한 명당 하나의 연결만 허용 (user_id가 PK)
    user_id: str = Field(foreign_key="user.user_id", primary_key=True)
    access_token: str
    refresh_token: str
    token_expiry: datetime
    scope: str = Field(default="https://www.googleapis.com/auth/drive.file")
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# 🟢 [신규 - 2단계] 학생별로 자동 생성된 Colab 노트북 기록.
# (question_id, user_id) 조합마다 하나씩 - 이미 만들어졌으면 다시 안 만들고 그대로 돌려줍니다.
class ColabNotebook(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    question_id: int = Field(foreign_key="question.question_id", index=True)
    user_id: str = Field(foreign_key="user.user_id", index=True)
    file_id: str
    web_view_link: str
    # 🟢 [신규 - 4단계] 학생에게 부여한 '편집자' 권한의 permission ID.
    # 나중에 마감 시각에 이 권한만 콕 집어서 '읽기 전용'으로 낮추는 데 씁니다.
    permission_id: str | None = Field(default=None)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))