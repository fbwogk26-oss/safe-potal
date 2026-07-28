@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  SafeBoard — 이미지/업로드 파일 동기화 스크립트
REM  사용법: download_uploads.bat
REM  위치:   C:\SafeBoard\download_uploads.bat
REM ============================================================

REM ── 설정 (한 번만 수정하면 됨) ─────────────────────────────
set REPLIT_URL=https://safe-potal.replit.app
set DB_SYNC_TOKEN=여기에_DB_SYNC_TOKEN값_입력
set LOCAL_UPLOADS=C:\SafeBoard\uploads
REM ────────────────────────────────────────────────────────────

set STAMP=%DATE:~0,4%%DATE:~5,2%%DATE:~8,2%_%TIME:~0,2%%TIME:~3,2%
set STAMP=%STAMP: =0%
set ZIP_FILE=%TEMP%\safetyboard_uploads_%STAMP%.zip

echo.
echo ========================================
echo  SafeBoard 이미지 동기화 시작
echo  배포 사이트: %REPLIT_URL%
echo  시각: %DATE% %TIME%
echo ========================================
echo.

REM 1. 배포 사이트에서 이미지 ZIP 다운로드
echo [1/3] 배포 사이트에서 이미지 ZIP 다운로드 중...
echo       (파일 크기에 따라 1~3분 소요될 수 있습니다)
curl -f -L --max-time 600 --progress-bar ^
  "%REPLIT_URL%/api/admin/uploads-export?token=%DB_SYNC_TOKEN%" ^
  -o "%ZIP_FILE%"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [오류] 다운로드 실패! 토큰 또는 URL을 확인하세요.
  echo        DB_SYNC_TOKEN 값이 sync_from_replit.bat 의 값과 동일해야 합니다.
  pause
  exit /b 1
)

for %%A in ("%ZIP_FILE%") do set FILE_SIZE=%%~zA
echo [OK] 다운로드 완료: %FILE_SIZE% bytes

REM 2. 로컬 uploads 폴더 확인/생성
echo.
echo [2/3] 로컬 uploads 폴더 확인 중...
if not exist "%LOCAL_UPLOADS%" (
  mkdir "%LOCAL_UPLOADS%"
  echo [OK] 폴더 생성: %LOCAL_UPLOADS%
) else (
  echo [OK] 폴더 확인: %LOCAL_UPLOADS%
)

REM 3. ZIP 압축 해제 (기존 파일 유지, 새 파일만 추가)
echo.
echo [3/3] 이미지 파일 압축 해제 중...
powershell -NoProfile -Command ^
  "Expand-Archive -Path '%ZIP_FILE%' -DestinationPath '%LOCAL_UPLOADS%' -Force"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [오류] 압축 해제 실패!
  del "%ZIP_FILE%" 2>nul
  pause
  exit /b 1
)

REM 임시 ZIP 삭제
del "%ZIP_FILE%" 2>nul

REM 결과 확인
for /f %%A in ('dir /b "%LOCAL_UPLOADS%\*.jpg" "%LOCAL_UPLOADS%\*.jpeg" "%LOCAL_UPLOADS%\*.png" "%LOCAL_UPLOADS%\*.gif" "%LOCAL_UPLOADS%\*.webp" 2^>nul ^| find /c /v ""') do set IMG_COUNT=%%A

echo.
echo ========================================
echo  동기화 완료!
echo  이미지 파일 수: %IMG_COUNT%개
echo  저장 위치: %LOCAL_UPLOADS%
echo ========================================
echo.
pause
