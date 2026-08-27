# # db.py
# import os
# from sqlmodel import SQLModel, create_engine
# import models


# # [테스트 지원] 평소엔 그대로 "database.db"를 쓰지만, 테스트에서는
# # DATABASE_URL 환경변수로 격리된 sqlite 파일을 넣어줄 수 있게 했습니다.
# # 환경변수가 없으면 기존과 완전히 동일하게 동작합니다.
# sqlite_file_name = "database.db"
# sqlite_url = os.environ.get("DATABASE_URL", f"sqlite:///{sqlite_file_name}")

# engine = create_engine(sqlite_url)

# SQLModel.metadata.create_all(engine)

import os
from sqlmodel import SQLModel, create_engine
import models

# Supabase PostgreSQL 연결 주소 (.env에서 로드)
# 만약 환경변수가 없으면 기본 로컬 sqlite로 fallback
database_url = os.environ.get("DATABASE_URL", "sqlite:///database.db")

# PostgreSQL 연결 시 echo=True 설정 (개발 시 SQL 로그 확인용, 필요 없으면 제거 가능)
engine = create_engine(database_url, echo=False)

def init_db():
    SQLModel.metadata.create_all(engine)

# 서버 시작 시 테이블 자동 생성 실행
init_db()