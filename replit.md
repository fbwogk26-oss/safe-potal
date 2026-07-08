# SafeBoard - Safety Evaluation Portal

## Overview

SafeBoard is a Korean-language enterprise safety management portal for tracking team safety scores, managing safety notices, rules, education materials, and safety equipment. The application provides a dashboard with real-time safety score visualization, administrative controls with PIN-based locking, and CRUD operations for various safety-related content categories.

### 산업안전보건관리비 기능
- **사용내역 관리**: 9개 항목별 지출 등록/수정/삭제. GPT-4o Vision AI로 견적서/거래명세서에서 자동 추출
- **항목별 요약**: 카드+진행바+월별 미니바 차트로 가독성 개선된 요약
- **세금계산서 관리**: 월별 세금계산서 등록/첨부파일(이미지/PDF) 업로드 (`safety_cost_tax_invoices` 테이블)
- **법정경비 Excel 다운로드**: `/api/safety-cost-records/export` — 사용내역+세금계산서 시트에 첨부 이미지 임베딩

## User Preferences

Preferred communication style: Simple, everyday language.
**배포 정책**: 모든 작업 완료 후 반드시 배포(Publish) 제안을 해야 함. 개발 서버와 배포 사이트가 항상 동일하게 유지되어야 함.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight client-side router)
- **State Management**: TanStack React Query for server state
- **Styling**: Tailwind CSS with shadcn/ui component library (New York style)
- **Charts**: Recharts for data visualization (bar charts for safety scores)
- **Animations**: Framer Motion for UI transitions
- **Build Tool**: Vite with custom path aliases (@/, @shared/, @assets/)

### Backend Architecture
- **Framework**: Express.js with TypeScript
- **API Pattern**: REST API with typed route definitions in shared/routes.ts
- **File Uploads**: Multer for image and file handling (stored in /uploads directory)
- **Database Access**: Drizzle ORM with PostgreSQL dialect
- **Build System**: esbuild for server bundling, Vite for client

### Data Storage
- **Database**: PostgreSQL via Drizzle ORM
- **Schema Location**: shared/schema.ts
- **Tables**:
  - `teams`: Safety score data with vehicle counts, accidents, fines, and calculated scores
  - `notices`: Multi-category content (rules, notices, education, equipment, vehicle, access) with fileName/fileType for single file, attachments (JSONB array) for multi-file support
  - `settings`: Key-value store for global configuration (lock status, admin PIN)
  - `education_sessions`: Education log entries with title, date, department, participants, instructor, materialAttachments (JSONB array for attached files [{url, name, type}])
  - `education_signatures`: Digital signatures for education sessions (signer name, department, base64 signature data)
  - `chemicals`: MSDS chemical substance data (name, CAS number, category, hazards, ppe, firstAid, notes, pdfUrl/pdfFileName/pdfFileType for PDF attachment)
  - `risk_assessments`: KRAS risk assessments (period type, department, hazard, frequency(가능성 1-5) × severity(중대성 1-4) = riskScore(max 20), riskLevel A/B/C, beforePhotoUrl for pre-improvement photo; A등급(≥8) items have improvement workflow: improvementMeasures, plannedDate, completionDate, afterFrequency, afterSeverity, afterRiskScore, afterRiskLevel, improvementStatus(미완료/진행중/완료), afterPhotoUrl stored separately via PUT /api/risk-assessments/:id/improvement); also: currentIssue(현황및문제점), relatedLaw(관련법규), equipmentId, equipmentName fields; approvalStatus: 임시저장/승인대기/승인완료/자동종결
  - `accident_reports`: Accident reports with type, cause, severity, department, date, description, reporter info (name, position, companion, vehicleInfo), progressDetails (JSON), accidentOverview, causeDetail, preventionPlan, signature (base64), images array. DOCX export generates 사고경위서 document.
  - `new_equipment_requests`: New safety equipment product requests with name, reason, specs, priority, status
  - `musculoskeletal_assessments`: 근골격계질환 유해요인조사 (department, task, hazardFactor, riskLevel, currentMeasures, improvementPlan, assessmentDate, assessor, status)
  - `traffic_fines`: 교통 과태료 현황 (violationDate, department, licensePlate, violationType, amount, violationLocation, issuedAt, dueDate, paymentStatus 미납/납부완료, paidAt, note, pdfUrl, createdBy)
  - `work_plans`: 하도급관리 작업계획 (title, originalFileName, originalFileUrl, processedFileUrl, emailDraft, sheetSummary, createdBy, createdAt) — 엑셀 업로드 시 ExcelJS로 자동 포맷팅(테두리/색채우기/헤더스타일) + 이메일 초안 자동 생성

### Key Design Patterns
- **Shared Types**: Schema and route definitions in /shared directory enable type safety across client and server
- **Storage Interface**: IStorage interface in server/storage.ts abstracts database operations
- **Score Calculation**: Server-side calculation of safety scores based on weighted factors (accidents -40, fines -1, suggestions +3, etc.)

### AI Chatbot (server/chatbot.ts)
- **Model**: OpenAI gpt-5-nano via Replit AI Integrations (no additional cost)
- **Capabilities**: Natural language intent parsing for CREATE_EDUCATION, CREATE_INSPECTION, CREATE_ACCESS, QUERY_EDUCATION, QUERY_INSPECTION, QUERY_ACCESS, GENERAL_QUERY
- **Security**: Permission checks (registerEducation, editInspections, manageAccessRequests) enforced per action, Zod schema validation on parsed AI data
- **Photo Upload**: Up to 10 images via Multer, stored in /uploads
- **UI**: Floating chat widget (ChatBot.tsx) in bottom-right corner with conversation history (max 6 messages)

### Authentication & Authorization
- Username/password login with bcrypt hashing
- Role-based permissions (admin, manager, user, viewer, custom, **deptHead**)
- Role preset system for batch permission assignment (일반사용자/부서장/담당자 3 tabs)
- **Ownership-based edit restriction**: Users can only edit/delete content they created (`createdBy` field on all content tables). Admin bypasses this check. Legacy records without `createdBy` are editable by admin only.
  - `isOwnerOrAdmin` helper in `server/routes.ts`: `req.user?.role === 'admin' || !createdBy || req.user?.username === createdBy`
  - Frontend: `isOwner` helper in each page hides edit/delete buttons for non-owners
  - POST routes set `createdBy: req.user?.username`; PUT/DELETE routes check ownership, return 403 if not owner
  - Tables with `createdBy`: notices, vehicles, safetyInspections, vehicleLogs, educationSessions, chemicals, musculoskeletalAssessments, riskAssessments, accidentReports, newEquipmentRequests (uses `requestedBy`)
- **부서장(deptHead) role**: Can submit improvement+approval in risk assessments in a single action
- Permission checks on both regular API routes and chatbot actions
- Global lock toggle prevents edits when system is locked
- Lock status refreshes every 10 seconds on client
- **Granular Permission System**: 48 individual permission keys in `shared/models/auth.ts` (UserPermissions interface), grouped into 4 categories:
  - **메뉴 표시** (16 keys): viewDashboard, viewNotices, viewDigitalBoard, viewRules, viewAccidents, viewEquipmentStatus, viewEquipment, viewEducation, viewEducationLogs, viewInspections, viewRiskAssessment, viewMsds, viewMusculoskeletal, viewVehicle, viewVehicleLogs, viewAccess
  - **등록/수정** (18 keys): editDashboard, editSafetyScores, editVehicles, editEquipmentStatus, registerRules, registerNotices, registerEducation, editEducationLogs, editInspections, manageAccessRequests, manageEquipmentRequests, editAccidents, editRiskAssessment, editMsds, editMusculoskeletal, uploadDashboardData, uploadEducationPhotos, uploadInspectionPhotos, uploadAccidentPhotos
  - **업로드** (4 keys): uploadDashboardData, uploadEducationPhotos, uploadInspectionPhotos, uploadAccidentPhotos
  - **다운로드** (10 keys): downloadEducationExcel, downloadInspectionExcel, downloadAccidentReport, downloadVehicleExcel, downloadVehicleLogExcel, downloadAccessExcel, downloadEquipmentExcel, downloadMsdsPdf, downloadRulesFiles, downloadEducationFiles
  - Admin users always have ALL permissions; DEFAULT_PERMISSIONS gives view* = true, action/upload/download = false
  - AdminUsers.tsx shows permissions in categorized sections with per-category "전체"/"해제" toggles
  - Sidebar.tsx filters menu items based on viewX permissions
- **Password Management**: mustChangePassword flag forces first-login password change; self-service password change via Topbar menu; admin can reset user passwords (sets mustChangePassword=true)
- **Password Strength**: Minimum 8 chars, must include letters + numbers + special characters; visual strength indicator on password change forms
- Password change APIs: /api/auth/change-password, /api/auth/force-change-password, /api/auth/admin-reset-password

### Security Features (server/security.ts)
- **Helmet**: Security headers (CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy)
- **Rate Limiting**: Global API (500/15min), Login (10/15min, skip successful), Upload (30/15min) via express-rate-limit
- **Brute Force Protection**: 5 failed login attempts locks account for 15 minutes; admin can unlock via /api/auth/unlock-user
- **Session Security**: Auto-generated session secret (crypto.randomBytes), session regeneration on login, 24h TTL, custom cookie name (__sb_sid), sameSite=lax for CSRF protection
- **Security Audit Logs**: All login/logout/password events logged with IP, user agent, timestamp to `security_logs` table; admin viewer at /admin/security
- **API Authentication**: ALL API endpoints require authentication (isAuthenticated middleware); no unauthenticated data access
- **File Access Control**: /uploads/* and /objects/* routes require authentication; no anonymous file access
- **API Response Caching**: API responses use Cache-Control: no-store to prevent sensitive data caching
- **Error Sanitization**: Production error responses use generic messages (no internal error details leaked); chatbot errors sanitized
- **Production Logging**: API response bodies NOT logged in production to prevent sensitive data in logs
- **Input Sanitization**: Username trimming/length limit, request body size limits (10MB)
- **Tables**: `security_logs` (eventType, userId, username, ipAddress, userAgent, details, success, createdAt); users table has `failedLoginAttempts`, `lockedUntil`, `lastLoginAt` columns

### File Structure
```
client/src/
├── components/     # React components including shadcn/ui
├── hooks/          # React Query hooks for API calls
├── pages/          # Page components for each route
├── lib/            # Utilities (queryClient, cn helper)
server/
├── index.ts        # Express server setup
├── routes.ts       # API route handlers
├── storage.ts      # Database access layer
├── db.ts           # Drizzle/PostgreSQL connection
shared/
├── schema.ts       # Drizzle table definitions
├── routes.ts       # API route type definitions
```

### 정보보안 점검 및 개선 (2026-07-08)
- **의존성 취약점**: npm 패키지 감사(95건) 중 axios/drizzle-orm/lodash/multer/nodemailer/ws/vite/tmp 및 다수 하위 의존성을 패치된 버전으로 업그레이드(치명적 0건 유지). `xlsx`는 상류 패치 없음(리스크 인지, 신뢰 가능한 내부 엑셀 파일만 처리), `tar`(canvas 빌드 도구, 개발 시점 전용)와 일부 pinned 하위 의존성(nodemailer/linkify-it은 imapflow·mailparser 내부에 자체 버전 고정)은 실질적 런타임 노출 없어 잔존 리스크로 문서화
- **코드 취약점**: nodemailer TLS 검증 우회(`rejectUnauthorized:false`) 제거 2건, `db.execute(sql.raw(...))` 동적 테이블명 SQL 조합을 `sql.identifier()` 기반 파라미터화로 교체, 파일 다운로드 프록시에 `path.basename`+경로 검증 추가(경로 탈출 방어), 예산 금액을 콘솔에 출력하던 로그 2건 삭제(HoundDog 개인정보/민감정보 노출 경고 해소)
- Replit 오브젝트스토리지 사이드카 호출(`http://127.0.0.1:.../object-storage/...`)은 컨테이너 내부 로컬 통신으로 외부 노출이 없어 HTTP 사용이 의도된 설계이며 수정하지 않음(스캐너 경고는 허용된 리스크로 판단)

### 정보보안 체크리스트 대응 (2026-07-08, 26개 항목)
기존 기능을 건드리지 않는 범위에서 체크리스트 항목별 조치 완료:
- **세션 유휴 타임아웃**: `client/src/hooks/use-idle-timeout.ts` — 30분간 마우스/키보드/스크롤 활동이 없으면 자동 로그아웃 (`MainLayout`에 적용)
- **계정 생명주기 관리**: `users.is_active` 컬럼 추가 — 관리자가 사용자 활성/비활성 전환 가능(자기 자신은 비활성화 불가), 비활성 계정은 로그인 차단. AdminUsers.tsx에 활성/비활성 토글 스위치 + 90일 이상 미접속 "휴면계정" 배지 표시
- **파일 업로드 확장자 차단**: 확장자 필터가 없던 14개 multer 업로드 인스턴스에 위험 확장자(.exe/.sh/.php 등) 차단 필터 적용
- **HTTP 메서드 제한**: TRACE/CONNECT/OPTIONS 메서드 차단 미들웨어 추가 (405 응답)
- **디렉토리 리스팅/에러 페이지 제어**: 모든 정적 파일 서빙에 `index:false, dotfiles:'deny'` 적용, 미매칭 `/api/*` 요청은 SPA 폴백 대신 명시적 JSON 404 반환
- **감사 로그 확장**: DELETE 요청, 수정(PUT/PATCH), 다운로드/엑셀 내보내기(GET), 업로드/가져오기(POST) 패턴을 자동 감지해 `security_logs` 테이블에 기록 (기존 계정 활성화/역할/권한 변경 로그에 추가). 사용자 계정 변경(`/api/users/*`)은 기존 상세 로그(USER_ROLE_CHANGED 등)와 중복 방지 처리
- **XSS 방어**: `DrillTraining.tsx`(시나리오 HTML), `SafetyCommittee.tsx`(Word 미리보기 HTML)의 `dangerouslySetInnerHTML`에 DOMPurify 새니타이징 적용
- **기본 관리자 비밀번호 정책**: 신규 계정은 `mustChangePassword=true`로 생성되어 최초 로그인 시 비밀번호 변경 강제됨(기존 구현으로 이미 충족, 별도 코드 변경 없음)
- **코드 저장소 비공개/버전관리, TLS/HTTPS**: Replit 플랫폼 레벨 설정(비공개 Repl, Replit 배포 시 자동 TLS 적용)으로 충족되며 애플리케이션 코드로 제어하는 항목이 아님
- **저장 데이터 암호화**: 별도 컬럼 단위 암호화는 적용하지 않음 — 모든 업로드 파일/DB 접근이 인증 미들웨어로 보호되고 있어 기존 접근제어로 위험 완화된 것으로 판단(과도한 리팩터링 방지 목적)

## Recent Features Added

### 산업안전보건관리비 사용내역 관리 (2026-04-28)
- **Page**: `client/src/pages/SafetyCostBudget.tsx` — `/safety-cost-budget` route
- **DB Table**: `safety_cost_records` (year, month, category, itemName, specification, unit, quantity, unitPrice, supplyAmount, vatAmount, totalAmount, purchaseDate, vendorName, notes, quoteFileUrl, transactionFileUrl)
- **API**: `GET/POST /api/safety-cost-records`, `GET/PUT/DELETE /api/safety-cost-records/:id`, `POST /api/safety-cost-records/extract` (GPT-4o Vision AI 자동 추출)
- **Features**: 9개 항목별 분류, 월별/항목별 요약 탭, 견적서/거래명세서 업로드 → GPT-4o Vision으로 자동 내용 추출, 다중 품목 선택, 수량×단가 자동계산
- **Sidebar**: 안전관리 메뉴 하위 "산업안전보건관리비" 항목 추가 (Receipt 아이콘)

### AIS TBM 부적합 소명 메일 자동접수 (2026-07-03)
- **Job**: `server/aisInboxEmailJob.ts` — Gmail INBOX(GMAIL_SENDER/GMAIL_APP_PASSWORD)를 10분 간격(cron)으로 ImapFlow+mailparser로 폴링
- **매칭 방식**: 이메일 제목/본문에 AIS 기록의 작업번호(workOrderNo, 예: "직영-무선기지국-20260702-0224")가 문자열로 그대로 포함되어 있는지 확인 (AI 추론 아님, 정확한 문자열 포함 매칭)
- **처리 내용**: 작업번호가 매칭되고 이미지 첨부파일이 있는 경우 **사진만(최대 3장)** `storage.upsertAisTbmBadNote()`로 자동 등록 (사진은 오브젝트스토리지 우선, 실패 시 `/uploads` 로컬 저장). 사유(reason)는 본문에서 추출하지 않으며, 담당자가 화면에서 직접 입력함
- **다중 사진 지원**: `ais_tbm_bad_notes` 테이블에 `photo_urls`/`photo_file_names`(text array, 최대 3장) 컬럼 추가; 기존 단일 `photo_url`/`photo_file_name`은 배열의 첫 번째 값과 동기화되어 하위호환 유지. 이메일 자동접수·수동 사진 첨부 모두 기존 사진에 추가(append)되며 3장을 초과하면 앞의 것부터 유지
- **부분 업데이트 안전성**: `upsertAisTbmBadNote`는 넘기지 않은 필드(reason/photo)를 COALESCE로 기존 값 유지 — 사진만 등록해도 기존 사유가 지워지지 않음
- **부적합으로 되돌리기**: TBM 부적합 사유 다이얼로그에 소명 상태(소명완료/소명불가)가 있는 경우 "부적합 상태로 되돌리기" 버튼 표시 → `DELETE /api/ais-safety/records/:id/tbm-note`로 사진/사유/소명상태를 모두 삭제하여 완전히 초기화(동일 작업번호 연동 건도 함께 처리); 초기화 후에는 배지가 다시 빨간색 "부적합"으로 표시됨
- **중복 방지**: 마지막으로 처리한 IMAP UID를 `settings` 테이블(`ais_inbox_last_uid`)에 저장해 재확인 시 이후 메일만 스캔
- **중요**: 소명완료(justificationStatus) 처리는 자동으로 하지 않음 — 담당자가 화면에서 사진 확인 후 사유 입력 및 승인까지 직접 진행해야 함
- **API**: `GET /api/ais-inbox-email/status`, `POST /api/ais-inbox-email/run-now` (수동 확인), `DELETE /api/ais-safety/records/:id/tbm-note` (초기화)
- **UI**: `AisSafetyRate.tsx` 상단 "소명 메일 자동접수" 버튼 → 상태 확인 및 수동 실행 다이얼로그

### AIS 안전이행률 4-시트 엑셀 리포트 (2026-07-03)
- **Module**: `server/aisExcelReport.ts` — `buildAisExcelReportBuffer()`가 4개 시트로 구성된 ExcelJS 워크북 생성
  - **1.현황**: 핵심지표(전체/허가서/TBM 이행률, 총건수, 이슈건수) + 운용팀별 TBM 활동 내역 표 + 월별/일자별 이행률 현황 표(대시보드 그래프와 동일한 `calcCompliance` 로직으로 계산, 이행률 컬럼에 네이티브 Excel 데이터바(conditional formatting dataBar)로 그래프처럼 시각화, 90%/70% 미만 행은 색상 강조)
  - **2.세부내역**: 업로드된 모든 mosWork 원본 레코드 누적 목록
  - **3.부적합 내용(소명포함)**: 부적합 사유 + 소명내용/소명여부(justificationStatus)
  - **4.작업번호별 사진내역**: 작업번호별 부적합 사진(최대 3장) 임베딩 (오브젝트스토리지 우선, `/uploads` 폴백, sharp로 리사이즈/압축)
  - **참고**: ExcelJS는 네이티브 차트 삽입을 지원하지 않아 실제 막대그래프 대신 데이터바(dataBar) conditional formatting으로 시각화 대체
- **일일 메일 자동첨부**: `server/aisDailyEmailJob.ts`의 `runAisDailyEmailJob`이 발송 시마다 이 엑셀 파일을 생성하여 nodemailer 첨부파일로 함께 발송 (엑셀 생성 실패 시에도 본문 메일은 정상 발송, 콘솔에 경고만 기록)
- **수동 다운로드**: `GET /api/ais-daily-email/export-excel` (인증 필요) — `AisSafetyRate.tsx` 메일 다이얼로그("일일 보고 메일" 버튼 클릭 후 열리는 팝업) 내부에 "엑셀 리포트 다운로드" 버튼으로 즉시 다운로드 가능

## External Dependencies

### Database
- **PostgreSQL**: Primary database (requires DATABASE_URL environment variable)
- **Drizzle ORM**: Database toolkit with `drizzle-kit push` for schema migrations

### Third-Party Libraries
- **ExcelJS**: Server-side Excel file processing for data import/export
- **date-fns**: Date formatting utilities
- **Zod**: Schema validation for API inputs and outputs

### Frontend Dependencies
- **Radix UI**: Headless component primitives (via shadcn/ui)
- **Lucide React**: Icon library
- **React Hook Form**: Form state management with Zod resolver
- **Embla Carousel**: Carousel component

### Development Tools
- **Replit Plugins**: Runtime error overlay, cartographer, dev banner (development only)
- **tsx**: TypeScript execution for development server