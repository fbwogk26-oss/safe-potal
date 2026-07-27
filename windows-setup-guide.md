# SafeBoard — Windows 노트북 서버 설치 가이드

> 이 문서를 보면서 순서대로 따라하시면 됩니다.

---

## 1단계 — 필수 프로그램 설치

### 1-1. Node.js 설치
1. https://nodejs.org 접속
2. **LTS 버전** 다운로드 (예: 20.x.x LTS)
3. 설치 파일 실행 → 기본 옵션 그대로 Next → Finish
4. 설치 확인:
   ```
   cmd 창 열고 입력: node -v
   결과 예시: v20.15.0  ← 이렇게 뜨면 성공
   ```

### 1-2. PostgreSQL 설치
1. https://www.postgresql.org/download/windows/ 접속
2. **Windows x86-64** 인스톨러 다운로드
3. 설치 중 **비밀번호 설정** 화면에서 기억하기 쉬운 비밀번호 입력 (나중에 필요)
4. 포트는 기본값 **5432** 유지
5. Stack Builder 화면은 **체크 해제** 후 Finish
6. 설치 확인:
   ```
   cmd 창에서: psql -U postgres
   비밀번호 입력 → postgres=# 프롬프트 뜨면 성공
   종료: \q
   ```

### 1-3. Git 설치
1. https://git-scm.com 접속 → Download for Windows
2. 기본 옵션으로 설치

### 1-4. PM2 설치 (자동 실행용)
```
cmd 창에서: npm install -g pm2 pm2-windows-startup
```

---

## 2단계 — 코드 가져오기

```cmd
cd C:\
mkdir SafeBoard
cd SafeBoard
git clone https://github.com/본인_레포_주소.git .
npm install
```

> **레포 주소 확인**: Replit 화면 왼쪽 Git 메뉴에서 Remote URL 확인

---

## 3단계 — 환경변수 설정

1. 프로젝트 폴더(C:\SafeBoard)에서 `.env.example` 파일을 복사해서 `.env` 로 저장
2. 메모장으로 `.env` 파일 열기
3. 각 항목에 값 입력:

| 항목 | 어디서 얻나요? |
|---|---|
| DATABASE_URL | 아래 3-1 참고 |
| SESSION_SECRET | 영문+숫자 32자 아무거나 입력 |
| AI_INTEGRATIONS_OPENAI_API_KEY | https://platform.openai.com/api-keys |
| GMAIL_APP_PASSWORD | Google 계정 → 보안 → 앱 비밀번호 |
| KMA_API_KEY | https://www.data.go.kr |

### 3-1. DATABASE_URL 만들기

PostgreSQL 설치 시 설정한 비밀번호를 사용:
```
DATABASE_URL=postgresql://postgres:여기에비밀번호@localhost:5432/safetyboard
```

---

## 4단계 — 데이터베이스 준비

### 4-1. DB 생성
```cmd
psql -U postgres
```
```sql
CREATE DATABASE safetyboard;
\q
```

### 4-2. Replit DB 데이터 내보내기 (Replit에서 실행)

Replit Shell 탭에서:
```bash
pg_dump $DATABASE_URL --no-owner --no-acl -f safetyboard_backup.sql
```
생성된 `safetyboard_backup.sql` 파일을 다운로드합니다.

### 4-3. 노트북에 데이터 복원
`safetyboard_backup.sql` 파일을 `C:\SafeBoard\` 에 복사 후:
```cmd
psql -U postgres -d safetyboard -f C:\SafeBoard\safetyboard_backup.sql
```

---

## 5단계 — 업로드 파일 이전

Replit의 `uploads/` 폴더 전체를 압축해서 노트북의 `C:\SafeBoard\uploads\` 에 복사합니다.

```
C:\SafeBoard\
├── uploads\          ← Replit에서 복사한 파일들
├── public-uploads\   ← Replit에서 복사한 파일들
├── dist\             ← 빌드 후 생성됨
└── .env              ← 방금 만든 환경변수 파일
```

---

## 6단계 — 빌드 및 실행

```cmd
cd C:\SafeBoard

:: 1. 빌드
npm run build

:: 2. PM2로 실행 (영구 서비스 등록)
pm2 start ecosystem.config.cjs
pm2 save

:: Windows 부팅 시 자동 시작 등록
pm2-startup install
```

---

## 7단계 — 접속 확인

### 내 노트북에서 접속
```
http://localhost:5000
```

### 같은 사무실(내부망) 다른 컴퓨터에서 접속

1. 내 노트북 IP 주소 확인:
   ```cmd
   ipconfig
   ```
   `IPv4 주소` 항목 확인 (예: 192.168.1.105)

2. 다른 컴퓨터 브라우저에서:
   ```
   http://192.168.1.105:5000
   ```

3. **Windows 방화벽에서 5000번 포트 허용**:
   - Windows 검색 → "Windows Defender 방화벽" → 고급 설정
   - 인바운드 규칙 → 새 규칙 → 포트 → TCP 5000 → 허용

---

## 자주 쓰는 명령어

```cmd
:: 앱 상태 확인
pm2 status

:: 앱 재시작
pm2 restart safetyboard

:: 실시간 로그 보기
pm2 logs safetyboard

:: 앱 중지
pm2 stop safetyboard
```

---

## 문제 해결

| 증상 | 해결 방법 |
|---|---|
| "DATABASE_URL 없음" 오류 | .env 파일이 프로젝트 루트에 있는지 확인 |
| 5000 포트 접속 안 됨 | 방화벽에서 5000 포트 열었는지 확인 |
| 외부에서 접속 불가 | 공유기 포트포워딩 필요 (내부망만 쓴다면 불필요) |
| 노트북 재부팅 후 앱 꺼짐 | `pm2-startup install` 명령어 다시 실행 |
| DB 연결 실패 | PostgreSQL 서비스 실행 중인지 확인: 작업관리자 → 서비스 탭 → postgresql 검색 |

---

## 추가 — 고정 IP 설정 (권장)

내부망에서 항상 같은 주소로 접속하려면 노트북의 **IP를 고정**하세요:
- 제어판 → 네트워크 → 이더넷/Wi-Fi → 속성 → IPv4 → 수동 입력
- 현재 IP와 동일한 값으로 고정 (예: 192.168.1.105)

---

> 궁금한 점은 Replit AI에게 물어보시면 단계별로 도와드립니다.
