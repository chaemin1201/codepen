# db.py
import os
from sqlmodel import SQLModel, create_engine
import models


# [테스트 지원] 평소엔 그대로 "database.db"를 쓰지만, 테스트에서는
# DATABASE_URL 환경변수로 격리된 sqlite 파일을 넣어줄 수 있게 했습니다.
# 환경변수가 없으면 기존과 완전히 동일하게 동작합니다.
sqlite_file_name = "database.db"
sqlite_url = os.environ.get("DATABASE_URL", f"sqlite:///{sqlite_file_name}")

engine = create_engine(sqlite_url)

SQLModel.metadata.create_all(engine)
