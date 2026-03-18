# SafeBoard - Safety Evaluation Portal

## Overview

SafeBoard is a Korean-language enterprise safety management portal for tracking team safety scores, managing safety notices, rules, education materials, and safety equipment. The application provides a dashboard with real-time safety score visualization, administrative controls with PIN-based locking, and CRUD operations for various safety-related content categories.

## User Preferences

Preferred communication style: Simple, everyday language.

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
  - `education_sessions`: Education log entries with title, date, department, participants, instructor
  - `education_signatures`: Digital signatures for education sessions (signer name, department, base64 signature data)
  - `chemicals`: MSDS chemical substance data (name, CAS number, category, hazards, ppe, firstAid, notes, pdfUrl/pdfFileName/pdfFileType for PDF attachment)
  - `risk_assessments`: KRAS risk assessments (period type, department, hazard, frequency(가능성 1-5) × severity(중대성 1-4) = riskScore(max 20), riskLevel A/B/C, beforePhotoUrl for pre-improvement photo; A등급(≥8) items have improvement workflow: improvementMeasures, plannedDate, completionDate, afterFrequency, afterSeverity, afterRiskScore, afterRiskLevel, improvementStatus(미완료/진행중/완료), afterPhotoUrl stored separately via PUT /api/risk-assessments/:id/improvement); also: currentIssue(현황및문제점), relatedLaw(관련법규), equipmentId, equipmentName fields; approvalStatus: 임시저장/승인대기/승인완료/자동종결
  - `accident_reports`: Accident reports with type, cause, severity, department, date, description, reporter info (name, position, companion, vehicleInfo), progressDetails (JSON), accidentOverview, causeDetail, preventionPlan, signature (base64), images array. DOCX export generates 사고경위서 document.
  - `new_equipment_requests`: New safety equipment product requests with name, reason, specs, priority, status
  - `musculoskeletal_assessments`: 근골격계질환 유해요인조사 (department, task, hazardFactor, riskLevel, currentMeasures, improvementPlan, assessmentDate, assessor, status)
  - `traffic_fines`: 교통 과태료 현황 (violationDate, department, licensePlate, violationType, amount, violationLocation, issuedAt, dueDate, paymentStatus 미납/납부완료, paidAt, note, pdfUrl, createdBy)

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