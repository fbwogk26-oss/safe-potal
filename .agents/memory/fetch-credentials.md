---
name: fetch credentials 누락 패턴
description: FormData fetch 요청에서 세션 인증이 실패하는 원인
---

# fetch에 credentials:"include" 필수

## 규칙
FormData를 body로 보내는 `fetch()` 호출에는 반드시 `credentials: "include"` 옵션을 추가해야 한다.

```typescript
// 올바른 방법
const res = await fetch("/api/some-endpoint", {
  method: "POST",
  body: formData,
  credentials: "include"  // 반드시 추가
});
```

**Why:** Replit 앱에서 세션 쿠키가 same-origin이더라도 fetch 기본값이 `credentials: "omit"`이어서 쿠키가 전송되지 않음 → 서버에서 401 반환. `apiRequest` 헬퍼는 이미 처리되어 있지만 raw `fetch()`는 수동으로 추가해야 함.

**How to apply:** FormData 업로드, 파일 업로드 등 raw fetch를 쓰는 모든 곳. 특히 multipart/form-data 요청.
