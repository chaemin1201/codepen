# run.py
import sys
import asyncio
import uvicorn

if __name__ == "__main__":
    # Uvicorn 및 asyncio 루프가 생성되기 전에 정책 변경
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)