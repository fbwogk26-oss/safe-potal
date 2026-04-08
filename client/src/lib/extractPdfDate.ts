/**
 * PDF에서 점검일자를 추출합니다.
 * pdfjs가 텍스트를 개별 아이템으로 쪼개는 경우도 처리합니다.
 */
export async function extractDateFromPdf(file: File): Promise<string | null> {
  if (!file.name.toLowerCase().endsWith('.pdf')) return null;
  try {
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any);
    const lib = (pdfjsLib as any).default ?? pdfjsLib;
    if (!lib.GlobalWorkerOptions.workerSrc) {
      lib.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/legacy/build/pdf.worker.mjs',
        import.meta.url
      ).href;
    }

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;

    // 첫 3페이지 텍스트 추출 — 공백 있는 버전 + 공백 없는 버전 둘 다 준비
    const maxPages = Math.min(pdf.numPages, 3);
    const tokens: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      for (const item of textContent.items) {
        const s = (item as any).str;
        if (s && s.trim()) tokens.push(s.trim());
      }
    }

    // PDF는 종종 문자별로 쪼개지므로 두 가지 방식으로 합쳐서 시도
    const textWithSpaces = tokens.join(' ');
    const textNoSpaces = tokens.join('');

    const found = tryExtract(textWithSpaces) ?? tryExtract(textNoSpaces);
    if (found) return found;

    // 파일명에서 연·월 추출 후 일(day)=1 폴백
    return extractFromFilename(file.name);
  } catch {
    return null;
  }
}

function tryExtract(text: string): string | null {
  // ── 1순위: 라벨(점검일자 / 방문일자 / 보고일자 / 작성일자) 뒤 날짜 ──
  // 공백·구분자가 섞여도 인식: "점검일자 : 2025. 1. 13."
  const labelRe = /(점검|방문|보고|작성|상태보고)\s*일\s*자?\s*[:\uff1a]?\s*(\d{4}|\d{2})\s*[.·\-년]\s*(\d{1,2})\s*[.·\-월]\s*(\d{1,2})/;
  const lm = text.match(labelRe);
  if (lm) return buildDate(lm[2], lm[3], lm[4]);

  // ── 2순위: "2025. 1. 13" / "2025.01.13" (공백 허용) ──────────────────
  const dotRe = /\b(20\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/;
  const dm = text.match(dotRe);
  if (dm) return buildDate(dm[1], dm[2], dm[3]);

  // ── 3순위: 한국어 "2025년 1월 13일" / "25년 1월 13일" ─────────────────
  const korRe = /(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
  const km = text.match(korRe);
  if (km) return buildDate(km[1], km[2], km[3]);

  // ── 4순위: ISO "2025-01-13" ───────────────────────────────────────────
  const isoRe = /\b(20\d{2})-(\d{2})-(\d{2})\b/;
  const im = text.match(isoRe);
  if (im) return im[0];

  return null;
}

function buildDate(year: string, month: string, day: string): string {
  let y = parseInt(year);
  if (y < 100) y += 2000;  // "25" → 2025
  return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function extractFromFilename(filename: string): string | null {
  // "25년1월" → 2025-01-01 폴백
  const m = filename.match(/(\d{2,4})년\s*(\d{1,2})월/);
  if (m) {
    let y = parseInt(m[1]);
    if (y < 100) y += 2000;
    return `${y}-${m[2].padStart(2, '0')}-01`;
  }
  // "2025-01" 또는 "202501"
  const m2 = filename.match(/(20\d{2})[_\-.]?(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-01`;
  return null;
}
