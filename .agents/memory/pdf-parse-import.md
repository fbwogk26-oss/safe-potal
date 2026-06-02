---
name: pdf-parse import 방법
description: pdf-parse 패키지를 import할 때 ENOENT 오류를 피하는 방법
---

# pdf-parse 직접 import

## 규칙
`pdf-parse`를 `import('pdf-parse')`로 가져오면 안 된다. 반드시 `pdf-parse/lib/pdf-parse.js`를 직접 import해야 한다.

```typescript
const pdfParse = (await import('pdf-parse/lib/pdf-parse.js' as any)).default as (buf: Buffer, opts?: any) => Promise<{ text: string; numpages: number }>;
const result = await pdfParse(buffer);
```

**Why:** `pdf-parse/index.js`가 import 시점에 `./test/data/05-versions-space.pdf`를 `readFileSync`로 로드하는데, Replit 환경에는 이 test/data 디렉토리가 없어서 항상 ENOENT 오류 발생.

**How to apply:** server/routes.ts의 `extractPdfText` 함수 및 PDF 텍스트 추출이 필요한 모든 곳.
