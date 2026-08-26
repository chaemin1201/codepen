# import io
# import os
# import re
# import zipfile
# import shutil
# import uuid
# from pathlib import Path
# from collections import deque
# from playwright.async_api import async_playwright
# from playwright_stealth import Stealth
# from random import randint

# from models.submission import Submission


# CODEPEN_PEN_URL_REGEX = r"https:\/\/codepen\.io\/(.+)\/pen\/(.+)(\/.+)?"
# CODEPEN_COLLAB_URL_REGEX = r"https:\/\/codepen\.io\/(.+)\/collab\/(.+)(\/.+)?"

# p = None
# browser = None
# context = None


# async def initialize_codepen():
#     global p, browser, context
#     stealth = Stealth().use_async(async_playwright())
#     p = await stealth.manager.start()
#     stealth.stealth.hook_playwright_context(p)
#     browser = await p.chromium.launch(
#         headless=False,
#         args=[
#             "--no-sandbox",
#             "--disable-dev-shm-usage",
#             "--disable-gpu",
#         ],
#     )
#     context = await browser.new_context(storage_state="playwright/.auth/state.json")


# opened_codepens = {}
# codepen_lru_queue = deque()
# MAX_OPEN_CODEPENS = 50


# async def _evict_oldest_codepen():
#     """Close the oldest opened codepen page to free memory."""
#     #동시성 이슈를 고려하여 큐 기반으로 정리
#     while codepen_lru_queue and len(opened_codepens) >= MAX_OPEN_CODEPENS:
#         oldest_url = codepen_lru_queue.popleft()
#         if oldest_url in opened_codepens:
#             await close_codepen_pen(oldest_url)
#             break


# async def create_codepen(submission: Submission):
#     if not p or not browser or not context:
#         await initialize_codepen()
#     page = await context.new_page()
#     await page.goto("https://codepen.io/pen")
#     await page.click("#item-title > svg")
#     await page.fill(
#         "#editable-title-input",
#         f"Submission {submission.submission_id} in {submission.problem.title} by {submission.user.username} ({submission.user.student_no})",
#     )
#     await page.click("button#save-as-private")
#     async with page.expect_navigation(url="https://codepen.io/**/pen/**"):
#         pass
#     url_match = re.match(CODEPEN_PEN_URL_REGEX, page.url)
#     if not url_match:
#         await page.close()
#         raise ValueError("Failed to create CodePen pen: invalid URL format")
#     url = f"https://codepen.io/{url_match[1]}/collab/{url_match[2]}{url_match[3] or ''}"
#     await context.storage_state(path="playwright/.auth/state.json")
#     await page.close()
#     await open_codepen_pen(url)
#     return url


# async def download_codepen(submission: Submission):
#     temporary_opened = False
#     if not submission.codepen_url:
#         raise ValueError("Submission does not have a CodePen URL")
#     if submission.codepen_url not in opened_codepens:
#         await open_codepen_pen(submission.codepen_url)
#         temporary_opened = True
#     page = opened_codepens[submission.codepen_url]
#     await page.click('span > button[data-test-id="save-button"]')
#     button = page.get_by_role("button", name="Export")
#     parent = page.locator("span", has=button)
#     if await parent.get_attribute("data-open") != "true":
#         await button.click()
#     async with page.expect_download() as download_info:
#         await page.click('a[data-test-id="export-zip"]')
#     download = await download_info.value
#     # Path 오염을 예방하고 유일성 보장
#     safe_filename = os.path.basename(submission.filename) if submission.filename else str(uuid.uuid4())
#     base_target_dir = Path("submissions") / safe_filename
#     base_target_dir.mkdir(parents=True, exist_ok=True)

#     temp_zip_path = Path("submissions") / f"temp_{uuid.uuid4()}.zip"
#     await download.save_as(str(temp_zip_path))

#     try:
#         with zipfile.ZipFile(temp_zip_path) as zip_file:
#             for file in zip_file.namelist():
#                 # 디렉토리 엔트리는 파일 저장 스트림에서 제외
#                 if file.endswith("/"):
#                     continue
                    
#                 path_parts = Path(file).parts
#                 if not path_parts:
#                     continue
                
#                 # 최상위 루트 디렉토리 레이어 슬라이싱 제거
#                 cleaned_relative_path = Path(*path_parts[1:])
                
#                 # 💡 보안 보완 1: 악의적 상위 우회 경로(Zip Slip) 검증 차단
#                 if ".." in cleaned_relative_path.parts:
#                     continue
                    
#                 # 최종 물리적 타겟 경로 맵핑
#                 final_target_path = (base_target_dir / cleaned_relative_path).resolve()
                
#                 # 💡 보안 보완 2: 최종 계산된 파일 경로가 샌드박스 경계 내에 있는지 확증
#                 if not final_target_path.is_relative_to(base_target_dir.resolve()):
#                     continue

#                 # 저장될 하위 폴더 자동 생성
#                 final_target_path.parent.mkdir(parents=True, exist_ok=True)
                
#                 # 복사 작업 스트리밍 수행
#                 with zip_file.open(file) as source, open(final_target_path, "wb") as f:
#                     shutil.copyfileobj(source, f)
#     finally:
#         if temp_zip_path.exists():
#             temp_zip_path.unlink()
#     if temporary_opened:
#         await close_codepen_pen(submission.codepen_url)


# async def scrap_codepen(submission: Submission):
#     temporary_opened = False
#     if not submission.codepen_url:
#         raise ValueError("Submission does not have a CodePen URL")
#     if submission.codepen_url not in opened_codepens:
#         await open_codepen_pen(submission.codepen_url)
#         temporary_opened = True
#     page = opened_codepens[submission.codepen_url]
#     await page.click('span > button[data-test-id="save-button"]')
#     button = page.get_by_role("button", name="Export")
#     parent = page.locator("span", has=button)
#     if await parent.get_attribute("data-open") != "true":
#         await button.click()
#     async with page.expect_download() as download_info:
#         await page.click('a[data-test-id="export-zip"]')
#     download = await download_info.value

#     random_suffix = randint(0, 16777215)
#     filepath = f"submissions/{submission.filename}_{hex(random_suffix)}.zip"
#     await download.save_as(filepath)
#     with open(filepath, "rb") as f:
#         content = f.read()
#     os.remove(filepath)
#     if temporary_opened:
#         await close_codepen_pen(submission.codepen_url)
#     return io.BytesIO(content)


# async def refresh_codepen_auth():
#     if not p or not browser or not context:
#         await initialize_codepen()
#     page = await context.new_page()
#     try:
#         await page.goto("https://codepen.io", timeout=60000, wait_until="domcontentloaded")
#         # Wait for Cloudflare challenge to pass
#         cloudflare_passed = False
#         for _ in range(10):
#             title = await page.title()
#             if "just a moment" not in title.lower():
#                 cloudflare_passed = True
#                 break
#             await page.wait_for_timeout(3000)
#         if not cloudflare_passed:
#             await page.close()
#             raise RuntimeError("Cloudflare challenge did not pass after 30 seconds")
#         logged_in = await page.locator("a[data-test-id='login-button']").is_hidden(timeout=10000)
#         await context.storage_state(path="playwright/.auth/state.json")
#         if not logged_in:
#             print("Warning: CodePen not logged in, skipping auto-login in container environment", flush=True)
#     finally:
#         if not page.is_closed():
#             await page.close()


# async def open_codepen_login():
#     global context
#     if not p or not browser or not context:
#         await initialize_codepen()
#     urls = list(opened_codepens.keys())
#     browser_ = await p.chromium.launch(headless=False)
#     context_ = await browser_.new_context(storage_state="playwright/.auth/state.json")
#     page = await context_.new_page()
#     await page.goto("https://codepen.io/login")
#     async with page.expect_navigation(url="https://codepen.io/your-work"):
#         pass
#     await context_.storage_state(path="playwright/.auth/state.json")
#     await browser_.close()
#     context = await browser.new_context(storage_state="playwright/.auth/state.json")
#     for url in urls:
#         await open_codepen_pen(url)


# async def open_codepen_pen(url: str):
#     if not p or not browser or not context:
#         await initialize_codepen()
#     if url in opened_codepens:
#         # 캐시 히트 시 큐의 순서를 맨 뒤로 갱신하여 상위 우선순위 부여
#         if url in codepen_lru_queue:
#             codepen_lru_queue.remove(url)
#         codepen_lru_queue.append(url)
#         return  # Already opened this URL
#     while len(opened_codepens) >= MAX_OPEN_CODEPENS:
#         await _evict_oldest_codepen()
#     page = await context.new_page()
#     await page.goto(url, timeout=30000)
#     opened_codepens[url] = page
#     codepen_lru_queue.append(url)


# async def close_codepen_pen(url: str):
#     if not p or not browser or not context:
#         await initialize_codepen()
#     if url not in opened_codepens:
#         return
#     page = opened_codepens[url]
#     # 큐에서도 동시 제거
#     if url in codepen_lru_queue:
#         codepen_lru_queue.remove(url)
#     await context.storage_state(path="playwright/.auth/state.json")
#     await page.close()
#     del opened_codepens[url]


# async def close_all_codepens():
#     for url in list(opened_codepens.keys()):
#         await close_codepen_pen(url)


# async def shutdown_codepen():
#     await close_all_codepens()
#     if browser:
#         await browser.close()
#     if p:
#         await p.stop()


import io
import os
import re
import uuid
import zipfile
import shutil
import httpx
from pathlib import Path

from models.submission import Submission

# CodePen URL 파싱을 위한 정규식 (pen, collab, full, details 등 모두 호환)
CODEPEN_URL_REGEX = r"https:\/\/codepen\.io\/(.+)\/(?:pen|collab|full|details)\/(.+)(\/.+)?"

async def get_codepen_zip_url(codepen_url: str) -> str:
    """학생이 제출한 URL을 CodePen 네이티브 압축파일 다운로드 API URL로 변환합니다."""
    match = re.match(CODEPEN_URL_REGEX, codepen_url)
    if not match:
        raise ValueError(f"유효하지 않은 CodePen URL입니다: {codepen_url}")
    
    username = match.group(1)
    pen_id = match.group(2)
    # CodePen의 공식 Export API 엔드포인트
    return f"https://codepen.io/{username}/share/zip/{pen_id}"


async def download_codepen(submission: Submission):
    """학생이 제출한 CodePen URL에서 압축 파일을 다운로드하여 서버에 안전하게 저장합니다."""
    if not submission.codepen_url:
        raise ValueError("제출 내역에 CodePen URL이 없습니다.")

    zip_url = await get_codepen_zip_url(submission.codepen_url)
    
    # httpx를 사용해 가볍게 zip 파일 다운로드
    async with httpx.AsyncClient() as client:
        response = await client.get(zip_url, follow_redirects=True)
        if response.status_code != 200:
            raise Exception(f"CodePen 다운로드 실패 (상태 코드: {response.status_code})")
        zip_content = response.content

    # 안전한 디렉토리 이름 생성 및 타겟 경로 설정
    safe_filename = os.path.basename(submission.filename) if submission.filename else str(uuid.uuid4())
    base_target_dir = Path("submissions") / safe_filename
    base_target_dir.mkdir(parents=True, exist_ok=True)

    # 다운로드한 데이터를 메모리에서 바로 압축 해제 (임시 파일 생성 불필요)
    with zipfile.ZipFile(io.BytesIO(zip_content)) as zip_file:
        for file in zip_file.namelist():
            # 디렉토리 엔트리는 제외
            if file.endswith("/"):
                continue
            
            path_parts = Path(file).parts
            if not path_parts:
                continue
            
            # 압축 파일 내의 최상위 폴더명 제거
            cleaned_relative_path = Path(*path_parts[1:])
            
            # 💡 보안 보완 1: 악의적 상위 우회 경로(Zip Slip) 검증 차단
            if ".." in cleaned_relative_path.parts:
                continue
                
            final_target_path = (base_target_dir / cleaned_relative_path).resolve()
            
            # 💡 보안 보완 2: 샌드박스(base_target_dir) 경계 밖으로 나가는지 확인
            if not final_target_path.is_relative_to(base_target_dir.resolve()):
                continue

            # 파일이 위치할 폴더 생성 및 저장
            final_target_path.parent.mkdir(parents=True, exist_ok=True)
            with zip_file.open(file) as source, open(final_target_path, "wb") as f:
                shutil.copyfileobj(source, f)


async def scrap_codepen(submission: Submission) -> io.BytesIO:
    """(검증용) CodePen에서 코드를 메모리로 바로 받아와 Zip 객체로 반환합니다."""
    if not submission.codepen_url:
        raise ValueError("제출 내역에 CodePen URL이 없습니다.")

    zip_url = await get_codepen_zip_url(submission.codepen_url)
    
    async with httpx.AsyncClient() as client:
        response = await client.get(zip_url, follow_redirects=True)
        if response.status_code != 200:
            raise Exception(f"CodePen 스크랩 실패 (상태 코드: {response.status_code})")
        
    return io.BytesIO(response.content)


# =====================================================================
# 아래 함수들은 Option A로 전환하며 더 이상 브라우저 자동화가 필요 없으므로 
# 내부 로직을 비운 더미(Dummy) 함수로 둡니다. 
# (다른 파일에서 import 에러가 나지 않도록 형태만 유지)
# =====================================================================

async def initialize_codepen():
    pass

async def create_codepen(submission: Submission) -> str:
    """Option A에서는 시스템이 CodePen을 생성하지 않으므로 사용되지 않습니다."""
    return ""

async def refresh_codepen_auth():
    pass

async def open_codepen_login():
    pass

async def open_codepen_pen(url: str):
    pass

async def close_codepen_pen(url: str):
    pass

async def close_all_codepens():
    pass

async def shutdown_codepen():
    pass