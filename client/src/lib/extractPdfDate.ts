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

    // 첫 3페이지 텍스트 추출
    const maxPages = Math.min(pdf.numPages, 3);
    let fullText = '';
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(' ') + ' ';
    }

    // ── 1순위: 점검일자 / 방문일자 / 보고일자 라벨 옆 날짜 ──────────────
    const labelPatterns = [
      /점검\s*일\s*자\s*[:\uff1a]?\s*(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/,
      /방문\s*일\s*자\s*[:\uff1a]?\s*(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/,
      /보고\s*일\s*자\s*[:\uff1a]?\s*(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/,
      /작성\s*일\s*자\s*[:\uff1a]?\s*(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/,
      /상태\s*보고\s*일\s*[:\uff1a]?\s*(\d{4})\s*[.\-년]\s*(\d{1,2})\s*[.\-월]\s*(\d{1,2})/,
    ];
    for (const pat of labelPatterns) {
      const m = fullText.match(pat);
      if (m) {
        const [, y, mo, d] = m;
        return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
    }

    // ── 2순위: 한국어 날짜 "2026년 4월 13일" ─────────────────────────────
    const korMatch = fullText.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (korMatch) {
      const [, y, mo, d] = korMatch;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // ── 3순위: ISO 형식 "2026-04-13" ──────────────────────────────────────
    const isoMatch = fullText.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (isoMatch) return isoMatch[0];

    // ── 4순위: 점 구분 "2026.04.13" ───────────────────────────────────────
    const dotMatch = fullText.match(/\b(20\d{2})\.(\d{2})\.(\d{2})\b/);
    if (dotMatch) {
      const [, y, mo, d] = dotMatch;
      return `${y}-${mo}-${d}`;
    }

    return null;
  } catch {
    return null;
  }
}
