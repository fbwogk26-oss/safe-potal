import { useState, useEffect, useRef } from "react";
import { FileText, ExternalLink, Loader2, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const PDF_EXT = '.pdf';
const PREVIEWABLE_EXTS = [...IMAGE_EXTS, PDF_EXT];

function getFileExt(name: string | null): string {
  if (!name) return '';
  return name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
}

interface PdfViewerProps {
  arrayBuffer: ArrayBuffer;
}

function PdfCanvasViewer({ arrayBuffer }: PdfViewerProps) {
  const [pages, setPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const cancelledRef = useRef(false);

  useEffect(() => {
    cancelledRef.current = false;
    setLoading(true);
    setError(false);
    setPages([]);
    setCurrentPage(0);

    (async () => {
      try {
        const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as any);
        const lib = (pdfjsLib as any).default ?? pdfjsLib;
        if (!lib.GlobalWorkerOptions.workerSrc) {
          lib.GlobalWorkerOptions.workerSrc = new URL(
            'pdfjs-dist/legacy/build/pdf.worker.mjs',
            import.meta.url
          ).href;
        }

        const pdf = await lib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
        const dataUrls: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          if (cancelledRef.current) return;
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 1.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport }).promise;
          dataUrls.push(canvas.toDataURL('image/jpeg', 0.85));
        }

        if (!cancelledRef.current) {
          setPages(dataUrls);
          setLoading(false);
        }
      } catch {
        if (!cancelledRef.current) {
          setError(true);
          setLoading(false);
        }
      }
    })();

    return () => { cancelledRef.current = true; };
  }, [arrayBuffer]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-48 border rounded-lg bg-muted/10 gap-2">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">PDF 렌더링 중...</p>
      </div>
    );
  }

  if (error || pages.length === 0) {
    return <div className="border rounded-lg p-4 bg-muted/20 text-center text-sm text-muted-foreground">PDF를 표시할 수 없습니다</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{currentPage + 1} / {pages.length} 페이지</span>
        <div className="flex gap-1">
          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCurrentPage(p => Math.max(0, p - 1))} disabled={currentPage === 0}>
            <ChevronLeft className="h-3 w-3" />
          </Button>
          <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => setCurrentPage(p => Math.min(pages.length - 1, p + 1))} disabled={currentPage === pages.length - 1}>
            <ChevronRight className="h-3 w-3" />
          </Button>
        </div>
      </div>
      <div className="border rounded-lg overflow-hidden bg-white" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        <img
          src={pages[currentPage]}
          alt={`페이지 ${currentPage + 1}`}
          className="w-full"
        />
      </div>
    </div>
  );
}

interface FileViewerProps {
  fileUrl: string | null;
  fileOriginalName: string | null;
  apiBase: string;
  accentColor?: string;
}

export function FileViewer({ fileUrl, fileOriginalName, apiBase, accentColor = 'text-orange-500' }: FileViewerProps) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [arrayBuffer, setArrayBuffer] = useState<ArrayBuffer | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);

  const ext = getFileExt(fileOriginalName);
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === PDF_EXT;
  const canPreview = PREVIEWABLE_EXTS.includes(ext);

  useEffect(() => {
    if (!fileUrl || !canPreview) return;
    let objectUrl: string | null = null;
    setLoading(true);
    setLoadError(false);
    setBlob(null);
    setArrayBuffer(null);
    setBlobUrl(null);

    fetch(`${apiBase}?inline=true`)
      .then(r => { if (!r.ok) throw new Error("failed"); return r.blob(); })
      .then(async b => {
        setBlob(b);
        if (isImage) {
          objectUrl = URL.createObjectURL(b);
          setBlobUrl(objectUrl);
        } else if (isPdf) {
          const ab = await b.arrayBuffer();
          setArrayBuffer(ab);
        }
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));

    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [apiBase, fileUrl, canPreview, isImage, isPdf]);

  async function handleDownload() {
    try {
      const res = await fetch(apiBase);
      const b = await res.blob();
      const url = URL.createObjectURL(b);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileOriginalName || "파일";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch { /* silent */ }
  }

  if (!fileUrl) {
    return <div className="border rounded-lg p-4 bg-muted/20 text-center text-muted-foreground text-sm">첨부 파일 없음</div>;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className={`h-4 w-4 shrink-0 ${accentColor}`} />
          <span className="text-sm font-medium truncate">{fileOriginalName || "보고서 파일"}</span>
        </div>
        <button onClick={handleDownload} className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-2">
          <ExternalLink className="h-3 w-3" /> 다운로드
        </button>
      </div>

      {canPreview ? (
        loading ? (
          <div className="flex items-center justify-center h-40 border rounded-lg bg-muted/20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : loadError ? (
          <div className="border rounded-lg p-4 bg-muted/20 text-center text-sm text-muted-foreground">파일을 불러올 수 없습니다</div>
        ) : isImage && blobUrl ? (
          <img src={blobUrl} alt={fileOriginalName || "파일"} className="w-full rounded-lg border object-contain max-h-[60vh]" />
        ) : isPdf && arrayBuffer ? (
          <PdfCanvasViewer arrayBuffer={arrayBuffer} />
        ) : null
      ) : (
        <div className="border rounded-lg p-4 bg-muted/20 flex items-center gap-3">
          <FileText className="h-8 w-8 text-muted-foreground shrink-0" />
          <div>
            <p className="text-sm font-medium">{fileOriginalName}</p>
            <p className="text-xs text-muted-foreground mt-0.5">이 파일 형식은 미리보기를 지원하지 않습니다. 위 다운로드 버튼을 사용하세요.</p>
          </div>
        </div>
      )}
    </div>
  );
}
