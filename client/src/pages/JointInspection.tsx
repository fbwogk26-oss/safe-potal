import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { maskName } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Pencil, Trash2, ClipboardCheck, Camera, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, MapPin, Building2, PenTool, UserCheck, X, Users, FileDown, Loader2 } from "lucide-react";
import type { JointInspection } from "@shared/schema";

const CHECK_ITEMS_TEMPLATE = [
  "장비 설치 상태",
  "위험요소 내재 상태",
  "화재 시 위험방지 상태",
  "전기관련 작업 시 안전 상태",
  "안전보건 표지판 상태(필요 시)",
  "적정 작업인력 배치 및 작업자 보호구의 착용 상태",
  "작업장 환경 상태",
  "기타",
];

const SUBCONTRACTORS_BASE = ["와이어블", "스피드이엔지"];

type CheckItem = { item: string; issue: string; improvement: string };
type Photo = { url: string; name: string };

interface JoinInspectionSignature {
  id: number;
  inspectionId: number;
  signerName: string;
  signerDepartment?: string | null;
  signerRole?: string | null;
  signerPosition?: string | null;
  signatureData: string;
  signedAt?: string | null;
}

const emptyCheckItems = (): CheckItem[] =>
  CHECK_ITEMS_TEMPLATE.map(item => ({ item, issue: "양호", improvement: "양호" }));

const emptyForm = () => ({
  inspectionDate: "",
  siteName: "",
  subcontractor: "",
  checkItems: emptyCheckItems(),
  photos: [] as Photo[],
});

// ── 날짜 포맷 (2026-04-22 → 2026.04.22(요일)) ───────────────
const DAY_KO = ["일", "월", "화", "수", "목", "금", "토"];
function fmtDate(d: string) {
  if (!d) return "";
  const date = new Date(d + "T00:00:00");
  const ymd = d.replace(/-/g, ".");
  return `${ymd}(${DAY_KO[date.getDay()]})`;
}

// ── 사진 URL → base64 (깨짐 방지) ────────────────────────────
async function loadImageAsBase64(url: string): Promise<string> {
  try {
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) return "";
    const blob = await res.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string) || "");
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

// ── PDF용 HTML 생성 ──────────────────────────────────────────
function buildPrintHtml(
  selectedInspections: JointInspection[],
  allSignatures: Record<number, JoinInspectionSignature[]>,
  photosBase64: Record<number, string[]>,
  hq = "대구본부",
) {
  const total = selectedInspections.length + 1;

  const inspectionPages = selectedInspections.map((insp, idx) => {
    const ci = (insp.checkItems as CheckItem[] | null) ?? [];
    const photos = (insp.photos as Photo[] | null) ?? [];
    const pageNum = idx + 1;
    const b64Photos = photosBase64[insp.id] ?? [];

    const rows = ci.map(c => `
      <tr>
        <td class="cell-item">${c.item}</td>
        <td class="cell-mid">${(c.issue || "-").replace(/\n/g, "<br>")}</td>
        <td class="cell-mid">${(c.improvement || "-").replace(/\n/g, "<br>")}</td>
      </tr>
    `).join("");

    const photoHtml = photos.length > 0 ? `
      <div class="photo-section-title">점검사진</div>
      <div class="photos-grid">
        ${b64Photos.filter(Boolean).map(src => `<img src="${src}" class="photo-img" />`).join("")}
      </div>
    ` : `<div class="photo-section-title">점검사진</div><div class="photos-placeholder"></div>`;

    return `
      <div class="page">
        <div class="doc-box">
          <div class="doc-title">도급사업의 합동 안전 ∙ 보건 점검일지(${insp.subcontractor})</div>
          <div class="doc-info-area">
            <div class="doc-info-row">
              <span class="doc-info-label">점검일</span>
              <span class="doc-info-sep">:</span>
              <span class="doc-info-val">${fmtDate(insp.inspectionDate)}</span>
            </div>
            <div class="doc-info-row">
              <span class="doc-info-label">국소명</span>
              <span class="doc-info-sep">:</span>
              <span class="doc-info-val">${insp.siteName}</span>
            </div>
          </div>
          <table class="check-table">
            <thead>
              <tr>
                <th class="th-item">점검 항목</th>
                <th class="th-mid">문제점</th>
                <th class="th-mid">개선 대책</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
          ${photoHtml}
        </div>
        <div class="page-footer">
          <span class="footer-org">${hq} 현장경영팀</span>
          <span class="footer-page">${pageNum} / ${total}</span>
        </div>
      </div>
    `;
  }).join("");

  // 서명 수집 — 중복 제거
  const allSigs: JoinInspectionSignature[] = [];
  const seen = new Set<number>();
  selectedInspections.forEach(insp => {
    (allSignatures[insp.id] || []).forEach(sig => {
      if (!seen.has(sig.id)) { seen.add(sig.id); allSigs.push(sig); }
    });
  });

  const sigRows = allSigs.length > 0
    ? allSigs.map(sig => `
        <tr>
          <td class="sig-cell center">${sig.signerDepartment || ""}</td>
          <td class="sig-cell center">${sig.signerPosition || ""}</td>
          <td class="sig-cell center">${sig.signerName}</td>
          <td class="sig-cell center"><img src="${sig.signatureData}" class="sig-img" /></td>
        </tr>
      `).join("")
    : `<tr><td colspan="4" class="sig-cell center" style="color:#888;padding:24px">서명 없음</td></tr>`;

  const attendancePage = `
    <div class="page">
      <div class="doc-box">
        <div class="doc-title" style="margin-bottom:6mm">참 석 자 명 단</div>
        <table class="sig-table">
          <thead>
            <tr>
              <th class="sth" style="width:28%">소속</th>
              <th class="sth" style="width:17%">직책</th>
              <th class="sth" style="width:20%">성명</th>
              <th class="sth" style="width:35%">서명</th>
            </tr>
          </thead>
          <tbody>${sigRows}</tbody>
        </table>
      </div>
      <div class="page-footer">
        <span class="footer-org">${hq} 현장경영팀</span>
        <span class="footer-page">${total} / ${total}</span>
      </div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <title>합동안전보건점검일지</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Noto Sans KR', 'Malgun Gothic', '맑은 고딕', sans-serif;
      background: #f0f0f0;
      color: #000;
      font-size: 10pt;
    }

    /* ── 화면 미리보기 ── */
    .page {
      width: 210mm;
      min-height: 297mm;
      margin: 10mm auto;
      padding: 18mm 18mm 25mm;
      background: #fff;
      position: relative;
      box-shadow: 0 2px 8px rgba(0,0,0,.18);
    }

    /* ── 인쇄 ── */
    @media print {
      body { background: #fff; }
      @page { size: A4 portrait; margin: 18mm 18mm 22mm; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .page {
        width: 100%; min-height: 0; margin: 0; padding: 0;
        box-shadow: none;
        page-break-after: always;
      }
      .page:last-child { page-break-after: avoid; }
    }

    /* ── 문서 외곽 박스 ── */
    .doc-box {
      border: 1.5px solid #000;
      padding: 6mm 6mm 4mm;
    }

    /* ── 제목 ── */
    .doc-title {
      text-align: center;
      font-size: 15pt;
      font-weight: 700;
      letter-spacing: -0.5px;
      padding: 3mm 0 5mm;
      border-bottom: 1.5px solid #000;
      margin-bottom: 5mm;
    }

    /* ── 점검일 / 국소명 ── */
    .doc-info-area { padding: 0 2mm; margin-bottom: 5mm; }
    .doc-info-row { display: flex; align-items: baseline; margin-bottom: 3mm; font-size: 11pt; }
    .doc-info-label { width: 44px; font-weight: 500; }
    .doc-info-sep { margin: 0 6px; }
    .doc-info-val { flex: 1; }

    /* ── 점검 항목 테이블 ── */
    .check-table { width: 100%; border-collapse: collapse; margin-bottom: 5mm; }
    .check-table th, .check-table td {
      border: 1px solid #000;
      vertical-align: middle;
      font-size: 9.5pt;
      line-height: 1.5;
    }
    .th-item { width: 36%; text-align: center; padding: 5px 4px; background: #d9d9d9; font-weight: 700; }
    .th-mid  { width: 32%; text-align: center; padding: 5px 4px; background: #d9d9d9; font-weight: 700; }
    .cell-item { text-align: center; padding: 11px 6px; }
    .cell-mid  { text-align: center; padding: 11px 6px; }

    /* ── 점검사진 ── */
    .photo-section-title { font-size: 10pt; font-weight: 700; margin: 4mm 0 3mm; }
    .photos-grid { display: flex; flex-direction: row; flex-wrap: nowrap; gap: 4mm; min-height: 55mm; }
    .photos-placeholder { min-height: 55mm; border: 1px dashed #bbb; }
    .photo-img { flex: 1 1 0; min-width: 0; height: 70mm; object-fit: cover; border: 1px solid #888; display: block; }

    /* ── 참석자 명단 테이블 ── */
    .sig-table { width: 100%; border-collapse: collapse; }
    .sth { border: 1px solid #000; padding: 7px 4px; text-align: center; background: #d9d9d9; font-weight: 700; font-size: 9.5pt; }
    .sig-cell { border: 1px solid #000; padding: 6px 4px; font-size: 9.5pt; vertical-align: middle; }
    .sig-img { width: 100%; max-height: 56px; object-fit: contain; display: block; margin: 0 auto; }
    .center { text-align: center; }
    .role-c { color: #1a3c8f; font-weight: 600; }
    .role-s { color: #923100; font-weight: 600; }

    /* ── 하단 푸터 ── */
    .page-footer {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 4mm;
      font-size: 9.5pt;
      color: #333;
    }
    .footer-org { font-weight: 500; }
    .footer-page { font-weight: 500; }
  </style>
</head>
<body>
  ${inspectionPages}
  ${attendancePage}
  <script>
    var fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
    fontsReady.then(function() {
      setTimeout(function() { window.print(); }, 600);
    });
  </script>
</body>
</html>`;
}

// ── 서명 패드 컴포넌트 ──────────────────────────────────────
function SignaturePad({ onSave, onClear }: { onSave: (data: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = Math.max(rect.height, 140);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasContent(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onClear();
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full h-36 border-2 border-dashed border-blue-300 rounded-lg touch-none cursor-crosshair bg-gray-50"
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1" onClick={handleClear}>지우기</Button>
        <Button type="button" size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700"
          onClick={() => { const c = canvasRef.current; if (c && hasContent) onSave(c.toDataURL("image/png")); }}
          disabled={!hasContent}>
          <UserCheck className="w-3.5 h-3.5 mr-1" />서명 완료
        </Button>
      </div>
    </div>
  );
}

// ── 메인 페이지 ─────────────────────────────────────────────
export default function JointInspectionPage() {
  const { headquarters, departments: DEPARTMENTS } = useHeadquarters();
  const SUBCONTRACTORS = [...SUBCONTRACTORS_BASE];
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 체크박스 선택
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);

  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());
  const toggleMonthCollapse = (key: string) =>
    setCollapsedMonths(prev => { const s = new Set(prev); s.has(key) ? s.delete(key) : s.add(key); return s; });

  // 서명 다이얼로그
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signInspectionId, setSignInspectionId] = useState<number | null>(null);
  const [signForm, setSignForm] = useState({ signerName: "", signerDepartment: "", signerRole: "도급인", signerPosition: "" });
  const [signatureData, setSignatureData] = useState<string>("");

  const { data: inspections = [], isLoading } = useQuery<JointInspection[]>({
    queryKey: ["/api/joint-inspections", headquarters],
    queryFn: () => fetch(`/api/joint-inspections?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
  });

  // 월별 그룹핑
  const byMonth = useMemo(() => {
    const map = new Map<string, JointInspection[]>();
    inspections
      .filter(i => (i.inspectionDate || "").startsWith(String(viewYear)))
      .forEach(insp => {
        const key = (insp.inspectionDate || "").slice(0, 7);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(insp);
      });
    return map;
  }, [inspections, viewYear]);

  const monthKeys = useMemo(() => Array.from(byMonth.keys()).sort().reverse(), [byMonth]);

  const { data: signatures = [], refetch: refetchSigs } = useQuery<JoinInspectionSignature[]>({
    queryKey: ["/api/joint-inspections", expandedId, "signatures"],
    queryFn: async () => {
      if (!expandedId) return [];
      const res = await fetch(`/api/joint-inspections/${expandedId}/signatures`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!expandedId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/joint-inspections", { ...data, headquarters }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/joint-inspections"] }); toast({ title: "합동점검이 등록됐습니다" }); setDialogOpen(false); },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/joint-inspections/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/joint-inspections"] }); toast({ title: "수정됐습니다" }); setDialogOpen(false); },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/joint-inspections/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/joint-inspections"] }); toast({ title: "삭제됐습니다" }); },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const createSigMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/joint-inspections/${data.inspectionId}/signatures`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/joint-inspections", signInspectionId, "signatures"] });
      refetchSigs();
      toast({ title: "서명이 등록됐습니다" });
      setSignDialogOpen(false);
      setSignatureData("");
      setSignForm({ signerName: "", signerDepartment: "", signerRole: "도급인", signerPosition: "" });
    },
    onError: () => toast({ title: "서명 등록 실패", variant: "destructive" }),
  });

  const deleteSigMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/joint-inspection-signatures/${id}`),
    onSuccess: () => { refetchSigs(); toast({ title: "서명이 삭제됐습니다" }); },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = () => { setEditId(null); setForm(emptyForm()); setDialogOpen(true); };
  const openEdit = (insp: JointInspection) => {
    setEditId(insp.id);
    const ci = insp.checkItems as CheckItem[] | null;
    setForm({
      inspectionDate: insp.inspectionDate, siteName: insp.siteName, subcontractor: insp.subcontractor,
      checkItems: ci && ci.length > 0
        ? CHECK_ITEMS_TEMPLATE.map(item => ci.find(c => c.item === item) || { item, issue: "양호", improvement: "양호" })
        : emptyCheckItems(),
      photos: (insp.photos as Photo[]) ?? [],
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!form.inspectionDate) return toast({ title: "점검일을 입력하세요", variant: "destructive" });
    if (!form.siteName) return toast({ title: "국소명을 입력하세요", variant: "destructive" });
    if (!form.subcontractor) return toast({ title: "수급인을 입력하세요", variant: "destructive" });
    if (editId) updateMutation.mutate({ id: editId, data: form });
    else createMutation.mutate(form);
  };

  const updateCheckItem = (idx: number, field: "issue" | "improvement", val: string) => {
    setForm(f => { const items = [...f.checkItems]; items[idx] = { ...items[idx], [field]: val }; return { ...f, checkItems: items }; });
  };

  const uploadPhoto = async (file: File) => {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/joint-inspections/upload-photo", { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      setForm(f => ({ ...f, photos: [...f.photos, { url: data.url, name: data.name }] }));
    } catch { toast({ title: "사진 업로드 실패", variant: "destructive" }); }
    finally { setUploading(false); }
  };

  const openSignDialog = (inspectionId: number) => {
    setSignInspectionId(inspectionId);
    setSignForm({ signerName: "", signerDepartment: "", signerRole: "도급인" });
    setSignatureData("");
    setSignDialogOpen(true);
  };

  const handleSignSubmit = () => {
    if (!signForm.signerName.trim()) return toast({ title: "성명을 입력하세요", variant: "destructive" });
    if (!signatureData) return toast({ title: "서명을 해주세요", variant: "destructive" });
    if (!signInspectionId) return;
    createSigMutation.mutate({ inspectionId: signInspectionId, signerName: signForm.signerName.trim(), signerDepartment: signForm.signerDepartment, signerRole: signForm.signerRole, signerPosition: signForm.signerPosition, signatureData });
  };

  // 체크박스 토글
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };
  const toggleAll = () => {
    if (selectedIds.size === inspections.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(inspections.map(i => i.id)));
  };

  // PDF 다운로드 (HTML print)
  const handleDownloadPDF = async () => {
    if (selectedIds.size === 0) return;
    setDownloading(true);
    try {
      const selected = inspections.filter(i => selectedIds.has(i.id));

      // 서명 + 사진 병렬 로드
      const [sigsResults, photosResults] = await Promise.all([
        Promise.all(
          selected.map(insp =>
            fetch(`/api/joint-inspections/${insp.id}/signatures`, { credentials: "include" })
              .then(r => r.ok ? r.json() : [])
              .then((sigs: JoinInspectionSignature[]) => ({ id: insp.id, sigs }))
          )
        ),
        Promise.all(
          selected.map(async insp => {
            const photos = (insp.photos as Photo[] | null) ?? [];
            const b64 = await Promise.all(photos.map(p => loadImageAsBase64(p.url)));
            return { id: insp.id, b64 };
          })
        ),
      ]);

      const sigsMap: Record<number, JoinInspectionSignature[]> = {};
      sigsResults.forEach(({ id, sigs }) => { sigsMap[id] = sigs; });

      const photosMap: Record<number, string[]> = {};
      photosResults.forEach(({ id, b64 }) => { photosMap[id] = b64; });

      const html = buildPrintHtml(selected, sigsMap, photosMap, headquarters);
      const w = window.open("", "_blank");
      if (!w) { toast({ title: "팝업이 차단됐습니다. 팝업 허용 후 다시 시도하세요", variant: "destructive" }); return; }
      w.document.write(html);
      w.document.close();
    } catch {
      toast({ title: "PDF 생성 실패", variant: "destructive" });
    } finally {
      setDownloading(false);
    }
  };

  const getStatusColor = (val: string) =>
    val === "양호" ? "text-green-600" : (!val || val === "-") ? "text-muted-foreground" : "text-amber-600";

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 sm:w-6 sm:h-6 text-green-600 shrink-0" />
            합동안전보건점검
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">도급인·수급인 2개월 1회 이상 합동 안전보건 점검 관리</p>
        </div>
        <Button onClick={openCreate} size="sm" className="shrink-0" data-testid="button-create-inspection">
          <Plus className="w-4 h-4 mr-1" />점검 등록
        </Button>
      </div>

      {/* 연도 네비게이션 + 다운로드 */}
      <div className="flex items-center justify-between bg-muted/40 border rounded-xl px-4 py-3">
        <button onClick={() => setViewYear(y => y - 1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <div className="text-base font-bold">{viewYear}년</div>
          <div className="text-xs text-muted-foreground">
            {inspections.filter(i => (i.inspectionDate || "").startsWith(String(viewYear))).length}건 등록됨
          </div>
        </div>
        <button onClick={() => setViewYear(y => y + 1)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 선택 액션 바 */}
      {inspections.length > 0 && (
        <div className="flex items-center gap-3 bg-muted/30 border rounded-lg px-3 py-2">
          <Checkbox
            checked={selectedIds.size > 0 && selectedIds.size === inspections.length}
            onCheckedChange={toggleAll}
            id="check-all"
            data-testid="checkbox-select-all"
          />
          <label htmlFor="check-all" className="text-sm cursor-pointer select-none">
            {selectedIds.size > 0 ? `${selectedIds.size}개 선택됨` : "전체 선택"}
          </label>
          <div className="flex-1" />
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              className="gap-1.5 bg-green-700 hover:bg-green-800 text-white"
              onClick={handleDownloadPDF}
              disabled={downloading}
              data-testid="button-download-pdf"
            >
              {downloading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              결과 다운로드 ({selectedIds.size}건)
            </Button>
          )}
        </div>
      )}

      {/* 월별 그룹 목록 */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : monthKeys.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>{viewYear}년 등록된 합동점검이 없습니다</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-4">
          {monthKeys.map(monthKey => {
            const monthInspections = byMonth.get(monthKey) ?? [];
            const isCollapsed = collapsedMonths.has(monthKey);
            const [, m] = monthKey.split("-");
            const monthLabel = `${parseInt(m)}월`;
            const issueTotal = monthInspections.reduce((sum, insp) => {
              const ci = (insp.checkItems as CheckItem[] | null) ?? [];
              return sum + ci.filter(c => c.issue && c.issue !== "양호" && c.issue !== "-").length;
            }, 0);

            return (
              <div key={monthKey} className="border rounded-xl overflow-hidden shadow-sm">
                {/* 월 헤더 */}
                <button
                  className="w-full flex items-center justify-between px-4 py-3 bg-muted/40 hover:bg-muted/60 transition-colors"
                  onClick={() => toggleMonthCollapse(monthKey)}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-green-600 flex items-center justify-center shrink-0">
                      <span className="text-white text-xs font-bold">{monthLabel}</span>
                    </div>
                    <div className="text-left">
                      <div className="font-semibold text-sm">{monthKey} <span className="text-muted-foreground font-normal">· {monthInspections.length}건</span></div>
                      {issueTotal > 0 && <div className="text-xs text-amber-600">지적사항 {issueTotal}건</div>}
                    </div>
                  </div>
                  {isCollapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
                </button>

                {/* 월 내 점검 목록 */}
                {!isCollapsed && (
                  <div className="divide-y">
                    {monthInspections.map((insp) => {
                      const ci = (insp.checkItems as CheckItem[] | null) ?? [];
                      const issueCount = ci.filter(c => c.issue && c.issue !== "양호" && c.issue !== "-").length;
                      const isExpanded = expandedId === insp.id;
                      const isSelected = selectedIds.has(insp.id);

                      return (
                        <div key={insp.id} className={`transition-colors ${isSelected ? "bg-green-50 dark:bg-green-950/20" : "bg-background"}`}>
                          <div className="flex items-center gap-2 px-4 py-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(insp.id)}
                              onClick={e => e.stopPropagation()}
                              data-testid={`checkbox-inspection-${insp.id}`}
                            />
                            <div
                              className="flex-1 flex items-center justify-between cursor-pointer min-w-0"
                              onClick={() => setExpandedId(isExpanded ? null : insp.id)}
                              data-testid={`card-inspection-${insp.id}`}
                            >
                              <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-sm">{insp.inspectionDate}</span>
                                  {issueCount > 0 && (
                                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">지적 {issueCount}건</span>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                                  <span className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate max-w-[120px]">{insp.siteName}</span></span>
                                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{insp.subcontractor}</span></span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1 shrink-0 ml-2">
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openEdit(insp); }} data-testid={`button-edit-inspection-${insp.id}`}>
                                  <Pencil className="w-3 h-3" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(insp.id); }} data-testid={`button-delete-inspection-${insp.id}`}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                                {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                              </div>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="border-t bg-muted/10 px-4 pt-4 pb-4 space-y-6">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-1/3 text-xs">점검 항목</TableHead>
                            <TableHead className="w-1/3 text-xs">문제점</TableHead>
                            <TableHead className="w-1/3 text-xs">개선 대책</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {ci.map((c, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium text-xs sm:text-sm">{c.item}</TableCell>
                              <TableCell className={`text-xs sm:text-sm ${getStatusColor(c.issue)}`}>{c.issue || "-"}</TableCell>
                              <TableCell className="text-xs sm:text-sm text-muted-foreground">{c.improvement || "-"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    {(insp.photos as Photo[] | null)?.length ? (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">점검사진</p>
                        <div className="flex flex-wrap gap-2">
                          {(insp.photos as Photo[]).map((p, i) => (
                            <img key={i} src={p.url} alt={p.name} className="w-28 h-20 sm:w-32 sm:h-24 object-cover rounded border" />
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <p className="text-sm font-semibold flex items-center gap-2">
                          <Users className="w-4 h-4 text-blue-600" />참석자 서명 명단
                          {signatures.length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">{signatures.length}명</span>}
                        </p>
                        <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={() => openSignDialog(insp.id)} data-testid={`button-add-signature-${insp.id}`}>
                          <PenTool className="w-3.5 h-3.5" />서명 추가
                        </Button>
                      </div>
                      {signatures.length === 0 ? (
                        <div className="border-2 border-dashed rounded-lg py-6 text-center text-muted-foreground">
                          <PenTool className="w-6 h-6 mx-auto mb-1 opacity-30" />
                          <p className="text-xs">아직 서명이 없습니다</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                          {signatures.map((sig) => (
                            <div key={sig.id} className="border rounded-lg p-3 bg-white dark:bg-muted/20 relative">
                              <button className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-destructive"
                                onClick={() => { if (confirm("서명을 삭제하시겠습니까?")) deleteSigMutation.mutate(sig.id); }}
                                data-testid={`button-delete-sig-${sig.id}`}><X className="w-3.5 h-3.5" /></button>
                              <div className="bg-gray-50 dark:bg-gray-800 rounded border mb-2 overflow-hidden">
                                <img src={sig.signatureData} alt="서명" className="w-full h-14 object-contain" />
                              </div>
                              <p className="font-semibold text-sm truncate">{sig.signerName}</p>
                              <div className="flex items-center gap-1 mt-0.5">
                                {sig.signerPosition && (
                                  <span className="text-xs px-1.5 py-0.5 rounded-full shrink-0 bg-gray-100 text-gray-600">{sig.signerPosition}</span>
                                )}
                                {sig.signerDepartment && <span className="text-xs text-muted-foreground truncate">{sig.signerDepartment}</span>}
                              </div>
                              {sig.signedAt && <p className="text-xs text-muted-foreground/60 mt-1">{new Date(sig.signedAt).toLocaleDateString("ko-KR")}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                          </div>
                        )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 점검 등록/수정 다이얼로그 ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader>
            <DialogTitle>{editId ? "합동점검 수정" : "합동점검 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>점검일 *</Label>
                <Input type="date" value={form.inspectionDate} onChange={e => setForm(f => ({ ...f, inspectionDate: e.target.value }))} data-testid="input-inspection-date" />
              </div>
              <div className="space-y-1">
                <Label>수급인(회사명) *</Label>
                <Input placeholder="예: 와이어블, 스피드이엔지" value={form.subcontractor} onChange={e => setForm(f => ({ ...f, subcontractor: e.target.value }))} data-testid="input-subcontractor" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>국소명(점검장소) *</Label>
              <Input placeholder="예: 동구청역3, 삼덕동1가21-24 전주" value={form.siteName} onChange={e => setForm(f => ({ ...f, siteName: e.target.value }))} data-testid="input-site-name" />
            </div>
            <div className="space-y-2">
              <Label>점검 항목</Label>
              <div className="border rounded overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-1/3 text-xs">점검 항목</TableHead>
                      <TableHead className="w-1/3 text-xs">문제점</TableHead>
                      <TableHead className="w-1/3 text-xs">개선 대책</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.checkItems.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-xs font-medium align-top pt-3">{c.item}</TableCell>
                        <TableCell><Textarea className="text-xs min-h-[50px] resize-none" value={c.issue} onChange={e => updateCheckItem(i, "issue", e.target.value)} placeholder="양호 또는 문제점" data-testid={`textarea-issue-${i}`} /></TableCell>
                        <TableCell><Textarea className="text-xs min-h-[50px] resize-none" value={c.improvement} onChange={e => updateCheckItem(i, "improvement", e.target.value)} placeholder="개선 대책" data-testid={`textarea-improvement-${i}`} /></TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
            <div className="space-y-2">
              <Label>점검사진</Label>
              <div className="flex flex-wrap gap-2">
                {form.photos.map((p, i) => (
                  <div key={i} className="relative">
                    <img src={p.url} alt={p.name} className="w-24 h-20 object-cover rounded border" />
                    <button type="button" onClick={() => setForm(f => ({ ...f, photos: f.photos.filter((_, j) => j !== i) }))} className="absolute -top-1.5 -right-1.5 bg-destructive text-white rounded-full w-4 h-4 flex items-center justify-center text-xs">×</button>
                  </div>
                ))}
                <label className="w-24 h-20 border-2 border-dashed rounded flex flex-col items-center justify-center cursor-pointer hover:bg-muted/30 text-muted-foreground">
                  <Camera className="w-5 h-5 mb-1" />
                  <span className="text-xs">{uploading ? "업로드중" : "사진 추가"}</span>
                  <input type="file" accept="image/*" multiple className="hidden" disabled={uploading} onChange={e => { Array.from(e.target.files || []).forEach(uploadPhoto); e.target.value = ""; }} />
                </label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-inspection">
              {createMutation.isPending || updateMutation.isPending ? "저장 중..." : (editId ? "수정" : "등록")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 서명 추가 다이얼로그 ── */}
      <Dialog open={signDialogOpen} onOpenChange={setSignDialogOpen}>
        <DialogContent className="max-w-sm w-[95vw]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PenTool className="w-4 h-4 text-blue-600" />참석자 서명
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>성명 *</Label>
              <Input placeholder="성명을 입력하세요" value={signForm.signerName}
                onChange={e => setSignForm(f => ({ ...f, signerName: e.target.value }))}
                data-testid="input-signer-name" />
            </div>
            <div className="space-y-1">
              <Label>소속</Label>
              <Select value={signForm.signerDepartment} onValueChange={v => setSignForm(f => ({ ...f, signerDepartment: v }))}>
                <SelectTrigger data-testid="select-signer-dept">
                  <SelectValue placeholder="선택 (선택)" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                  <SelectItem value={headquarters}>{headquarters}</SelectItem>
                  {SUBCONTRACTORS.map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>직책</Label>
              <Input placeholder="직책을 입력하세요" value={signForm.signerPosition}
                onChange={e => setSignForm(f => ({ ...f, signerPosition: e.target.value }))}
                data-testid="input-signer-position" />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <PenTool className="w-3.5 h-3.5" />서명 *
                <span className="text-xs text-muted-foreground font-normal">(아래에 손가락으로 서명하세요)</span>
              </Label>
              <SignaturePad onSave={setSignatureData} onClear={() => setSignatureData("")} />
              {signatureData && <p className="text-xs text-green-600 flex items-center gap-1"><UserCheck className="w-3.5 h-3.5" />서명 완료</p>}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignDialogOpen(false)}>취소</Button>
            <Button onClick={handleSignSubmit} disabled={!signForm.signerName || !signatureData || createSigMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700" data-testid="button-submit-signature">
              {createSigMutation.isPending ? "등록 중..." : "서명 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
