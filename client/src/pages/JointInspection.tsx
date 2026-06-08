import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Plus, Pencil, Trash2, ClipboardCheck, Camera, ChevronDown, ChevronUp, MapPin, Building2, PenTool, UserCheck, X, Users, FileDown, Loader2 } from "lucide-react";
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

const DEPARTMENTS = [
  "동대구운용팀", "포항운용팀", "안동운용팀",
  "서대구운용팀", "남대구운용팀", "구미운용팀", "문경운용팀",
  "운용계획팀", "사업지원팀", "현장경영팀",
];

const SUBCONTRACTORS = ["와이어블", "스피드이엔지"];

type CheckItem = { item: string; issue: string; improvement: string };
type Photo = { url: string; name: string };

interface JoinInspectionSignature {
  id: number;
  inspectionId: number;
  signerName: string;
  signerDepartment?: string | null;
  signerRole?: string | null;
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

// ── 날짜 포맷 (2026-04-22 → 2026.04.22) ─────────────────────
function fmtDate(d: string) {
  return d ? d.replace(/-/g, ".") : "";
}

// ── PDF용 HTML 생성 ──────────────────────────────────────────
function buildPrintHtml(
  selectedInspections: JointInspection[],
  allSignatures: Record<number, JoinInspectionSignature[]>,
  origin: string,
) {
  const total = selectedInspections.length + 1; // 점검 페이지 + 참석자 명단

  const inspectionPages = selectedInspections.map((insp, idx) => {
    const ci = (insp.checkItems as CheckItem[] | null) ?? [];
    const photos = (insp.photos as Photo[] | null) ?? [];
    const pageNum = idx + 1;

    const photoHtml = photos.length > 0 ? `
      <div class="section-title">점검사진</div>
      <div class="photos-grid">
        ${photos.map(p => `<img src="${origin}${p.url}" class="photo-img" onerror="this.style.display='none'" />`).join("")}
      </div>
    ` : "";

    const rows = ci.map(c => `
      <tr>
        <td class="center">${c.item}</td>
        <td class="center">${c.issue || "-"}</td>
        <td class="center">${c.improvement || "-"}</td>
      </tr>
    `).join("");

    return `
      <div class="page">
        <div class="main-title">도급사업의 합동 안전 · 보건 점검일지(${insp.subcontractor})</div>
        <div class="info-block">
          <div class="info-row"><span class="info-label">점검일</span><span class="info-colon">:</span><span>${fmtDate(insp.inspectionDate)}</span></div>
          <div class="info-row"><span class="info-label">국소명</span><span class="info-colon">:</span><span>${insp.siteName}</span></div>
        </div>
        <table class="check-table">
          <thead>
            <tr>
              <th class="col-item">점검 항목</th>
              <th class="col-issue">문제점</th>
              <th class="col-improve">개선 대책</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        ${photoHtml}
        <div class="footer">대구본부 현장경영팀&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${pageNum} / ${total}</div>
      </div>
    `;
  }).join("");

  // 모든 서명 수집 (도급인 먼저, 수급인 다음 순)
  const allSigs: JoinInspectionSignature[] = [];
  const seen = new Set<number>();
  selectedInspections.forEach(insp => {
    (allSignatures[insp.id] || []).forEach(sig => {
      if (!seen.has(sig.id)) { seen.add(sig.id); allSigs.push(sig); }
    });
  });
  // 도급인 → 수급인 순 정렬
  allSigs.sort((a, b) => {
    const ra = a.signerRole === "도급인" ? 0 : 1;
    const rb = b.signerRole === "도급인" ? 0 : 1;
    return ra - rb;
  });

  const sigRows = allSigs.length > 0
    ? allSigs.map(sig => `
        <tr>
          <td class="center role-${sig.signerRole === "도급인" ? "contractor" : "sub"}">${sig.signerRole || ""}</td>
          <td class="center">${sig.signerDepartment || ""}</td>
          <td class="center">${sig.signerName}</td>
          <td class="center"><img src="${sig.signatureData}" class="sig-img" /></td>
        </tr>
      `).join("")
    : `<tr><td colspan="4" class="center empty-row">서명 없음</td></tr>`;

  const attendancePage = `
    <div class="page attendance-page">
      <div class="main-title">참 석 자 명 단</div>
      <div class="attendance-subtitle">합동 안전 · 보건 점검 참석자 서명</div>
      <table class="sig-table">
        <thead>
          <tr>
            <th class="col-role">구분</th>
            <th class="col-dept">소속</th>
            <th class="col-name">성명</th>
            <th class="col-sig">서명</th>
          </tr>
        </thead>
        <tbody>${sigRows}</tbody>
      </table>
      <div class="footer">대구본부 현장경영팀&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;${total} / ${total}</div>
    </div>
  `;

  return `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>합동안전보건점검일지</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Noto Sans KR', 'Malgun Gothic', '맑은 고딕', sans-serif; background: #fff; color: #111; font-size: 10pt; }
    @media print {
      @page { size: A4; margin: 15mm 15mm 18mm; }
      body { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .page { page-break-after: always; border: none !important; padding: 0 !important; min-height: 0 !important; }
      .page:last-child { page-break-after: avoid; }
    }

    .page {
      width: 180mm;
      min-height: 257mm;
      margin: 0 auto 20mm;
      padding: 8mm 0;
      border: 1px solid #ddd;
      position: relative;
      background: #fff;
    }

    .main-title {
      text-align: center;
      font-size: 14pt;
      font-weight: 700;
      margin-bottom: 12px;
      letter-spacing: -0.3px;
    }
    .attendance-subtitle {
      text-align: center;
      font-size: 10pt;
      color: #555;
      margin-bottom: 14px;
    }

    .info-block { margin-bottom: 10px; padding: 0 4mm; }
    .info-row { display: flex; align-items: baseline; margin-bottom: 4px; font-size: 11pt; }
    .info-label { width: 40px; font-weight: 500; }
    .info-colon { margin: 0 8px; }

    .check-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    .check-table th, .check-table td { border: 1px solid #333; padding: 7px 6px; font-size: 9.5pt; vertical-align: middle; }
    .check-table th { background: #e8e8e8; text-align: center; font-weight: 700; }
    .check-table .col-item { width: 38%; }
    .check-table .col-issue { width: 31%; }
    .check-table .col-improve { width: 31%; }
    .center { text-align: center; }

    .section-title { font-size: 10pt; font-weight: 700; margin: 8px 4mm 6px; }
    .photos-grid { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 4mm; margin-bottom: 8px; }
    .photo-img { width: 85mm; height: 60mm; object-fit: cover; border: 1px solid #ccc; }

    .sig-table { width: 100%; border-collapse: collapse; }
    .sig-table th, .sig-table td { border: 1px solid #333; padding: 8px 6px; font-size: 9.5pt; vertical-align: middle; }
    .sig-table th { background: #e8e8e8; text-align: center; font-weight: 700; }
    .col-role { width: 14%; }
    .col-dept { width: 26%; }
    .col-name { width: 18%; }
    .col-sig  { width: 42%; }
    .sig-img { width: 100%; max-height: 52px; object-fit: contain; display: block; margin: 0 auto; }
    .role-contractor { color: #1d4ed8; font-weight: 600; }
    .role-sub { color: #c2410c; font-weight: 600; }
    .empty-row { color: #888; padding: 20px; }

    .footer {
      position: absolute;
      bottom: 6mm;
      right: 4mm;
      font-size: 9.5pt;
      color: #444;
    }
    .attendance-page .footer { right: 4mm; }
  </style>
</head>
<body>
  ${inspectionPages}
  ${attendancePage}
  <script>
    window.addEventListener('load', function() {
      setTimeout(function() { window.print(); }, 800);
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
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // 체크박스 선택
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);

  // 서명 다이얼로그
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signInspectionId, setSignInspectionId] = useState<number | null>(null);
  const [signForm, setSignForm] = useState({ signerName: "", signerDepartment: "", signerRole: "도급인" });
  const [signatureData, setSignatureData] = useState<string>("");

  const { data: inspections = [], isLoading } = useQuery<JointInspection[]>({
    queryKey: ["/api/joint-inspections"],
  });

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
    mutationFn: (data: any) => apiRequest("POST", "/api/joint-inspections", data),
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
      setSignForm({ signerName: "", signerDepartment: "", signerRole: "도급인" });
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
    createSigMutation.mutate({ inspectionId: signInspectionId, signerName: signForm.signerName.trim(), signerDepartment: signForm.signerDepartment, signerRole: signForm.signerRole, signatureData });
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
      // 선택된 점검들의 서명을 병렬로 로드
      const sigsResults = await Promise.all(
        selected.map(insp =>
          fetch(`/api/joint-inspections/${insp.id}/signatures`, { credentials: "include" })
            .then(r => r.ok ? r.json() : [])
            .then((sigs: JoinInspectionSignature[]) => ({ id: insp.id, sigs }))
        )
      );
      const sigsMap: Record<number, JoinInspectionSignature[]> = {};
      sigsResults.forEach(({ id, sigs }) => { sigsMap[id] = sigs; });

      const origin = window.location.origin;
      const html = buildPrintHtml(selected, sigsMap, origin);
      const w = window.open("", "_blank");
      if (!w) { toast({ title: "팝업이 차단됐습니다. 팝업 허용 후 다시 시도하세요", variant: "destructive" }); return; }
      w.document.write(html);
      w.document.close();
    } catch (e) {
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

      {/* 목록 */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">불러오는 중...</div>
      ) : inspections.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>등록된 합동점검이 없습니다</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {inspections.map((insp) => {
            const ci = (insp.checkItems as CheckItem[] | null) ?? [];
            const issueCount = ci.filter(c => c.issue && c.issue !== "양호" && c.issue !== "-").length;
            const isExpanded = expandedId === insp.id;
            const isSelected = selectedIds.has(insp.id);

            return (
              <Card key={insp.id} className={`overflow-hidden transition-colors ${isSelected ? "ring-2 ring-green-500 ring-offset-1" : ""}`}>
                <div className="flex items-center gap-2 px-3 pt-3 pb-0">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelect(insp.id)}
                    onClick={e => e.stopPropagation()}
                    data-testid={`checkbox-inspection-${insp.id}`}
                  />
                  <div
                    className="flex-1 flex items-center justify-between cursor-pointer pb-3"
                    onClick={() => setExpandedId(isExpanded ? null : insp.id)}
                    data-testid={`card-inspection-${insp.id}`}
                  >
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{insp.inspectionDate}</span>
                        {issueCount > 0 && (
                          <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full shrink-0">지적 {issueCount}건</span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                        <span className="flex items-center gap-1"><MapPin className="w-3 h-3 shrink-0" /><span className="truncate">{insp.siteName}</span></span>
                        <span className="flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" /><span className="truncate">{insp.subcontractor}</span></span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={(e) => { e.stopPropagation(); openEdit(insp); }} data-testid={`button-edit-inspection-${insp.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive" onClick={(e) => { e.stopPropagation(); if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(insp.id); }} data-testid={`button-delete-inspection-${insp.id}`}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <CardContent className="border-t bg-muted/10 pt-4 space-y-6">
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
                                {sig.signerRole && (
                                  <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${sig.signerRole === "도급인" ? "bg-blue-100 text-blue-700" : "bg-orange-100 text-orange-700"}`}>{sig.signerRole}</span>
                                )}
                                {sig.signerDepartment && <span className="text-xs text-muted-foreground truncate">{sig.signerDepartment}</span>}
                              </div>
                              {sig.signedAt && <p className="text-xs text-muted-foreground/60 mt-1">{new Date(sig.signedAt).toLocaleDateString("ko-KR")}</p>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                )}
              </Card>
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
              <Label>구분</Label>
              <div className="flex gap-2">
                {["도급인", "수급인"].map(role => (
                  <button key={role} type="button"
                    onClick={() => setSignForm(f => ({ ...f, signerRole: role, signerDepartment: "" }))}
                    className={`flex-1 py-2 rounded-lg border-2 text-sm font-medium transition-colors ${
                      signForm.signerRole === role
                        ? role === "도급인" ? "border-blue-500 bg-blue-50 text-blue-700" : "border-orange-500 bg-orange-50 text-orange-700"
                        : "border-muted bg-background text-muted-foreground"
                    }`} data-testid={`button-role-${role}`}>{role}</button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label>성명 *</Label>
              <Input placeholder="성명을 입력하세요" value={signForm.signerName}
                onChange={e => setSignForm(f => ({ ...f, signerName: e.target.value }))}
                data-testid="input-signer-name" />
            </div>
            <div className="space-y-1">
              <Label>{signForm.signerRole === "수급인" ? "수급사" : "소속"}</Label>
              <Select value={signForm.signerDepartment} onValueChange={v => setSignForm(f => ({ ...f, signerDepartment: v }))}>
                <SelectTrigger data-testid="select-signer-dept">
                  <SelectValue placeholder="선택 (선택)" />
                </SelectTrigger>
                <SelectContent>
                  {(signForm.signerRole === "수급인" ? SUBCONTRACTORS : DEPARTMENTS).map(d => (
                    <SelectItem key={d} value={d}>{d}</SelectItem>
                  ))}
                  <SelectItem value="기타">기타</SelectItem>
                </SelectContent>
              </Select>
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
