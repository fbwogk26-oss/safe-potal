---
name: otplib v12 API 변경 및 import 방법
description: otplib 새 버전의 API 변경점과 ESM/CJS 호환 import 방법
---

# otplib v12+ API 및 import

## 규칙

`authenticator` 객체는 otplib 새 버전에서 **완전 제거**됨. 함수형 API로 교체 필요.

올바른 import (ESM tsx dev + esbuild CJS prod 모두 동작):
```ts
import { verifySync as totpVerifySync, generateSecret as totpGenerateSecret, generateURI as totpGenerateURI } from "otplib";
```

## API 매핑 (구 → 신)

| 구 API | 신 API |
|--------|--------|
| `authenticator.verify({ token, secret })` | `totpVerifySync({ strategy: "totp", token, secret })` |
| `authenticator.generateSecret()` | `totpGenerateSecret()` |
| `authenticator.keyuri(user, issuer, secret)` | `totpGenerateURI({ strategy: "totp", issuer, label: user, secret })` |

**Why:** `createRequire(import.meta.url)` 방식은 esbuild CJS 번들에서 `import.meta.url`이 undefined가 되어 `ERR_INVALID_ARG_VALUE`로 실패함. 또한 `authenticator` 자체가 새 버전에서 제거됨. Named import로 직접 쓰면 esbuild가 자동으로 CJS require로 변환해서 양쪽 모두 동작.

**How to apply:** TOTP 관련 로직 어디서든 위 함수형 API를 사용. strategy: "totp" 는 항상 명시.
