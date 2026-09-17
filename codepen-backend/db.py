# # db.py
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

