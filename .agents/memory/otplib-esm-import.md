---
name: otplib ESM import 방법
description: otplib 패키지를 ESM(tsx/Node ESM) 환경에서 사용하는 방법
---

# otplib ESM import 방법

## 규칙

`import { authenticator } from "otplib"` 및 `import otplib from "otplib"` 모두 ESM 모드에서 오류 발생.

올바른 방법은 `createRequire`를 사용해 CJS 방식으로 로드:

```ts
import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const { authenticator } = _require("otplib") as { authenticator: typeof import("otplib").authenticator };
```

**Why:** otplib은 CommonJS 패키지로, ESM named export / default export를 제공하지 않음. tsx가 ESM 모드로 실행하면 `SyntaxError: The requested module 'otplib' does not provide an export named ...` 오류 발생.

**How to apply:** otplib의 authenticator, totp, hotp 등 어떤 export를 쓰든 동일하게 createRequire 패턴 사용.
