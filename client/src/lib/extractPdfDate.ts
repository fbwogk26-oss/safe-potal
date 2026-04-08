/**
 * PDF 내부 텍스트에서 점검일자를 추출합니다. (클라이언트 정규식 기반)
 * 파일명 폴백은 사용하지 않습니다.
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

    const textWithSpaces = tokens.join(' ');
    const textNoSpaces = tokens.join('');

    return tryExtract(textWithSpaces) ?? tryExtract(textNoSpaces) ?? null;
  } catch {
    return null;
  }
}

function tryExtract(text: string): string | null {
  const labelRe = /(점검|방문|보고|작성|상태보고)\s*일\s*자?\s*[:\uff1a]?\s*(\d{4}|\d{2})\s*[.·\-년]\s*(\d{1,2})\s*[.·\-월]\s*(\d{1,2})/;
  const lm = text.match(labelRe);
  if (lm) return buildDate(lm[2], lm[3], lm[4]);

  const dotRe = /\b(20\d{2})\s*\.\s*(\d{1,2})\s*\.\s*(\d{1,2})/;
  const dm = text.match(dotRe);
  if (dm) return buildDate(dm[1], dm[2], dm[3]);

  const korRe = /(\d{2,4})\s*년\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/;
  const km = text.match(korRe);
  if (km) return buildDate(km[1], km[2], km[3]);

  const isoRe = /\b(20\d{2})-(\d{2})-(\d{2})\b/;
  const im = text.match(isoRe);
  if (im) return im[0];

  return null;
}

function buildDate(year: string, month: string, day: string): string {
  let y = parseInt(year);
  if (y < 100) y += 2000;
  return `${y}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}
