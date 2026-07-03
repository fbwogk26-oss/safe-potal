---
name: 백엔드 라우트 추가 후 HMR 착각
description: server/routes.ts 등 백엔드 파일을 수정한 뒤, Vite HMR 로그만 보고 반영됐다고 착각하지 말 것
---

Express 라우트(`server/routes.ts`, `server/*.ts`)를 새로 추가하거나 수정한 직후에는 반드시 워크플로("Start application")를 재시작해야 반영된다.

**Why:** Vite HMR은 프론트엔드(`client/src/**`)에만 적용된다. 백엔드는 `tsx server/index.ts`로 실행되며, 코드 변경 후 프로세스를 재시작하지 않으면 이전 라우트 테이블이 그대로 유지된다. 이 상태에서 새로 추가한 API 경로를 curl/fetch로 호출하면 404가 아니라 200 + `index.html`(SPA 폴백)이 돌아와서, 마치 라우트 자체가 잘못된 것처럼 보이는 혼란스러운 증상이 발생한다 (헤더는 `/api/*` 미들웨어가 붙여서 정상처럼 보이지만 body는 HTML).

**How to apply:** 새 API 라우트/서버 모듈을 추가했는데 curl 테스트 시 JSON 대신 HTML(index.html, `<script type="module" src="/@vite/client">` 포함)이 돌아오면, 라우트 코드를 다시 검토하기 전에 먼저 워크플로를 재시작하고 재시도할 것.
