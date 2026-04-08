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

    // 첫 3페이지에서 텍스트 추출
    const maxPages = Math.min(pdf.numPages, 3);
    let fullText = '';
    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      fullText += textContent.items.map((item: any) => item.str).join(' ') + ' ';
    }

    // 한국어: 2026년 04월 13일 / 2026년 4월 13일
    const korMatch = fullText.match(/(\d{4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
    if (korMatch) {
      const [, y, m, d] = korMatch;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // ISO 형식: 2026-04-13
    const isoMatch = fullText.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/);
    if (isoMatch) return isoMatch[0];

    // 점 구분: 2026.04.13
    const dotMatch = fullText.match(/\b(20\d{2})\.(\d{2})\.(\d{2})\b/);
    if (dotMatch) {
      const [, y, m, d] = dotMatch;
      return `${y}-${m}-${d}`;
    }

    return null;
  } catch {
    return null;
  }
}
