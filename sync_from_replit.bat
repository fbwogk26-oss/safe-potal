@echo off
chcp 65001 >nul
setlocal

REM ============================================================
REM  SafeBoard — 배포 사이트 DB 동기화 스크립트
REM  사용법: sync_from_replit.bat
REM  위치:   C:\SafeBoard\sync_from_replit.bat
REM ============================================================

REM ── 설정 (한 번만 수정하면 됨) ─────────────────────────────
set REPLIT_URL=https://safe-potal.replit.app
set DB_SYNC_TOKEN=여기에_DB_SYNC_TOKEN값_입력
set LOCAL_DB_NAME=safetyboard
set LOCAL_DB_USER=postgres
set PGPASSWORD=여기에_로컬_postgres_비밀번호_입력
REM ────────────────────────────────────────────────────────────

set STAMP=%DATE:~0,4%%DATE:~5,2%%DATE:~8,2%_%TIME:~0,2%%TIME:~3,2%
set STAMP=%STAMP: =0%
set BACKUP_FILE=%~dp0db_sync_%STAMP%.sql

echo.
echo ========================================
echo  SafeBoard DB 동기화 시작
echo  배포 사이트: %REPLIT_URL%
echo  시각: %DATE% %TIME%
echo ========================================
echo.

REM 1. 배포 사이트에서 DB 덤프 다운로드
echo [1/4] 배포 사이트에서 DB 다운로드 중...
curl -f -L --max-time 300 ^
  "%REPLIT_URL%/api/admin/db-export?token=%DB_SYNC_TOKEN%" ^
  -o "%BACKUP_FILE%"

if %ERRORLEVEL% NEQ 0 (
  echo.
  echo [오류] DB 다운로드 실패! 토큰 또는 URL을 확인하세요.
  pause
  exit /b 1
)

for %%A in ("%BACKUP_FILE%") do set FILE_SIZE=%%~zA
echo [OK] 다운로드 완료: %FILE_SIZE% bytes

REM 2. PM2 앱 잠시 중지
echo.
echo [2/4] SafeBoard 앱 중지 중...
pm2 stop safetyboard 2>nul
timeout /t 2 /nobreak >nul

REM 3. 기존 DB 백업 후 복원
echo.
echo [3/4] 로컬 DB 복원 중 (기존 데이터 교체)...
psql -U %LOCAL_DB_USER% -c "DROP DATABASE IF EXISTS %LOCAL_DB_NAME%_old;" 2>nul
psql -U %LOCAL_DB_USER% -c "ALTER DATABASE %LOCAL_DB_NAME% RENAME TO %LOCAL_DB_NAME%_old;" 2>nul
psql -U %LOCAL_DB_USER% -c "CREATE DATABASE %LOCAL_DB_NAME%;"
psql -U %LOCAL_DB_USER% -d %LOCAL_DB_NAME% -f "%BACKUP_FILE%"

if %ERRORLEVEL% NEQ 0 (
  echo [오류] DB 복원 실패! 이전 DB로 롤백 중...
  psql -U %LOCAL_DB_USER% -c "DROP DATABASE IF EXISTS %LOCAL_DB_NAME%;"
  psql -U %LOCAL_DB_USER% -c "ALTER DATABASE %LOCAL_DB_NAME%_old RENAME TO %LOCAL_DB_NAME%;"
  pm2 start safetyboard
  pause
  exit /b 1
)

REM 이전 백업 DB 삭제
psql -U %LOCAL_DB_USER% -c "DROP DATABASE IF EXISTS %LOCAL_DB_NAME%_old;" 2>nul

REM 4. 앱 재시작
echo.
echo [4/4] SafeBoard 앱 재시작 중...
pm2 start safetyboard --update-env
timeout /t 3 /nobreak >nul

echo.
echo ========================================
echo  동기화 완료!
echo  다운로드 파일: %BACKUP_FILE%
echo ========================================
echo.
pause
