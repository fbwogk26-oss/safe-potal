import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Users, Trash2, Presentation, FileText, Eye, Upload, Loader2, Plus,
  ExternalLink, ChevronLeft, ChevronRight, CheckCircle2, Circle, FileQuestion,
} from "lucide-react";
import type { SafetyCommittee } from "@shared/schema";

const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

export default function SafetyCommitteePage() {
  const { toast } = useToast();
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [targetMonth, setTargetMonth] = useState("");

  const [materialUrl, setMaterialUrl] = useState("");
  const [materialName, setMaterialName] = useState("");
  const [minutesUrl, setMinutesUrl] = useState("");
  const [minutesName, setMinutesName] = useState("");

  const [uploadingMaterial, setUploadingMaterial] = useState(false);
  const [uploadingMinutes, setUploadingMinutes] = useState(false);

  const [officeViewerUrl, setOfficeViewerUrl] = useState<string | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [pdfPreviewTitle, setPdfPreviewTitle] = useState("");
  const [docHtml, setDocHtml] = useState<string | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  const { data: committees = [], isLoading } = useQuery<SafetyCommittee[]>({
    queryKey: ["/api/safety-committees"],
  });

  const byMonth = useMemo(() => {
    const map = new Map<string, SafetyCommittee[]>();
    committees.forEach(c => {
      const key = (c.meetingDate || c.createdAt || "").slice(0, 7);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    });
    return map;
  }, [committees]);

  const yearTotal = useMemo(() =>
    committees.filter(c => (c.meetingDate || c.createdAt || "").startsWith(String(viewYear))).length,
  [committees, viewYear]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/safety-committees", data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] }); toast({ title: "등록됐습니다" }); setDialogOpen(false); },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/safety-committees/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] }); toast({ title: "수정됐습니다" }); setDialogOpen(false); },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-committees/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/safety-committees"] }),
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const openCreate = (yearMonth: string) => {
    setEditId(null);
    setTargetMonth(yearMonth);
    setMaterialUrl(""); setMaterialName("");
    setMinutesUrl(""); setMinutesName("");
    setDialogOpen(true);
  };

  const openEdit = (c: SafetyCommittee) => {
    setEditId(c.id);
    setTargetMonth((c.meetingDate || "").slice(0, 7));
    setMaterialUrl(c.meetingMaterialUrl ?? "");
    setMaterialName(c.meetingMaterialName ?? "");
    setMinutesUrl(c.meetingMinutesUrl ?? "");
    setMinutesName(c.meetingMinutesName ?? "");
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    const payload = {
      meetingDate: targetMonth ? targetMonth + "-01" : new Date().toISOString().slice(0, 10),
      location: "-",
      meetingType: "정기",
      principalCount: 0,
      subcontractorCount: 0,
      meetingMaterialUrl: materialUrl,
      meetingMaterialName: materialName,
      meetingMinutesUrl: minutesUrl,
      meetingMinutesName: minutesName,
    };
    if (editId) updateMutation.mutate({ id: editId, data: payload });
    else createMutation.mutate(payload);
  };

  const uploadFile = async (file: File, endpoint: string, setter: (url: string, name: string) => void) => {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(endpoint, { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const e = await res.json(); throw new Error(e.message); }
      const data = await res.json();
      setter(data.url, data.name);
      toast({ title: "업로드됐습니다" });
    } catch (e: any) {
      toast({ title: e.message || "업로드 실패", variant: "destructive" });
    }
  };

  const getExt = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

  const openMaterialPreview = (url: string, name: string) => {
    const ext = getExt(name);
    const isObj = url.startsWith("/objects/");
    const fullUrl = isObj ? url : `${window.location.origin}${url}`;
    if (ext === "pdf") { setPdfPreviewTitle(name || "회의자료"); setPdfPreviewUrl(fullUrl); }
    else { setOfficeViewerUrl(`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fullUrl)}`); }
  };

  const openMinutesPreview = async (c: SafetyCommittee) => {
    const ext = getExt(c.meetingMinutesName ?? "");
    if (ext === "pdf") {
      const url = c.meetingMinutesUrl ?? "";
      const isObj = url.startsWith("/objects/");
      const fullUrl = isObj ? url : `${window.location.origin}${url}`;
      setPdfPreviewTitle(c.meetingMinutesName || "회의록"); setPdfPreviewUrl(fullUrl);
    } else {
      setDocLoading(true); setDocHtml("");
      try {
        const res = await fetch(`/api/safety-committees/${c.id}/preview-minutes`, { credentials: "include" });
        if (!res.ok) throw new Error("미리보기 불가");
        const data = await res.json();
        setDocHtml(data.html);
      } catch { toast({ title: "회의록 미리보기 실패", variant: "destructive" }); setDocHtml(null); }
      finally { setDocLoading(false); }
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-5">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Users className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 shrink-0" />
            산업안전보건협의체
          </h1>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">월별 회의자료 및 회의록 관리</p>
        </div>
      </div>

      {/* 연도 네비게이션 + 요약 */}
      <div className="flex items-center justify-between bg-muted/40 border rounded-xl px-4 py-3">
        <button
          onClick={() => setViewYear(y => y - 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="text-center">
          <div className="text-lg font-bold">{viewYear}년</div>
          <div className="text-xs text-muted-foreground">
            {yearTotal > 0 ? `${yearTotal}건 등록됨` : "등록 없음"}
          </div>
        </div>
        <button
          onClick={() => setViewYear(y => y + 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-background transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* 12개월 그리드 */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16 text-muted-foreground gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />불러오는 중...
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 12 }, (_, i) => i + 1).map(m => {
            const key = `${viewYear}-${String(m).padStart(2, "0")}`;
            const items = byMonth.get(key) ?? [];
            const hasMaterial = items.some(c => c.meetingMaterialUrl);
            const hasMinutes = items.some(c => c.meetingMinutesUrl);
            const status = hasMaterial && hasMinutes ? "complete" : items.length > 0 ? "partial" : "empty";
            const isCurrentMonth = new Date().getFullYear() === viewYear && new Date().getMonth() + 1 === m;

            return (
              <MonthCard
                key={m}
                month={m}
                monthKey={key}
                items={items}
                status={status}
                isCurrentMonth={isCurrentMonth}
                hasMaterial={hasMaterial}
                hasMinutes={hasMinutes}
                onAdd={() => openCreate(key)}
                onEdit={(c) => openEdit(c)}
                onDelete={(id) => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(id); }}
                onPreviewMaterial={(url, name) => openMaterialPreview(url, name)}
                onPreviewMinutes={(c) => openMinutesPreview(c)}
              />
            );
          })}
        </div>
      )}

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm mx-auto">
          <DialogHeader>
            <DialogTitle>
              {editId ? "수정" : `${targetMonth ? `${parseInt(targetMonth.split("-")[1])}월 ` : ""}회의자료/회의록 등록`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <UploadBox
              icon={<Presentation className="w-4 h-4" />}
              label="회의자료"
              accept=".ppt,.pptx,.pdf"
              hint="PPT · PPTX · PDF"
              color="orange"
              fileName={materialName}
              uploading={uploadingMaterial}
              onSelect={(f) => { setUploadingMaterial(true); uploadFile(f, "/api/safety-committees/upload-material", (u, n) => { setMaterialUrl(u); setMaterialName(n); }).finally(() => setUploadingMaterial(false)); }}
              onRemove={() => { setMaterialUrl(""); setMaterialName(""); }}
              testId="input-material-file"
            />
            <UploadBox
              icon={<FileText className="w-4 h-4" />}
              label="회의록"
              accept=".doc,.docx,.pdf"
              hint="DOC · DOCX · PDF"
              color="blue"
              fileName={minutesName}
              uploading={uploadingMinutes}
              onSelect={(f) => { setUploadingMinutes(true); uploadFile(f, "/api/safety-committees/upload-minutes", (u, n) => { setMinutesUrl(u); setMinutesName(n); }).finally(() => setUploadingMinutes(false)); }}
              onRemove={() => { setMinutesUrl(""); setMinutesName(""); }}
              testId="input-minutes-file"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending} data-testid="button-submit-committee">
              {createMutation.isPending || updateMutation.isPending ? "저장 중..." : (editId ? "수정" : "등록")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PPT 미리보기 */}
      <Dialog open={!!officeViewerUrl} onOpenChange={() => setOfficeViewerUrl(null)}>
        <DialogContent className="max-w-5xl w-[95vw] h-[85vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-3 pb-2 shrink-0 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Presentation className="w-4 h-4 text-orange-500" />회의자료 미리보기
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden p-2">
            {officeViewerUrl && <iframe src={officeViewerUrl} className="w-full h-full rounded border" title="PPT 미리보기" allowFullScreen />}
          </div>
        </DialogContent>
      </Dialog>

      {/* PDF 인앱 미리보기 */}
      <Dialog open={!!pdfPreviewUrl} onOpenChange={() => setPdfPreviewUrl(null)}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-3 pb-2 shrink-0 border-b">
            <div className="flex items-center justify-between gap-2">
              <DialogTitle className="flex items-center gap-2 text-base truncate">
                <FileText className="w-4 h-4 text-red-500 shrink-0" />
                <span className="truncate">{pdfPreviewTitle}</span>
              </DialogTitle>
              {pdfPreviewUrl && (
                <a href={pdfPreviewUrl} target="_blank" rel="noopener noreferrer"
                  className="shrink-0 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 border rounded px-2 py-1">
                  <ExternalLink className="w-3 h-3" />새 탭
                </a>
              )}
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            {pdfPreviewUrl && <iframe src={pdfPreviewUrl} className="w-full h-full" title="PDF 미리보기" />}
          </div>
        </DialogContent>
      </Dialog>

      {/* Word 미리보기 */}
      <Dialog open={docHtml !== null} onOpenChange={() => setDocHtml(null)}>
        <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="p-3 pb-2 shrink-0 border-b">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-blue-500" />회의록 미리보기
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto px-5 py-4">
            {docLoading ? (
              <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
                <Loader2 className="w-6 h-6 animate-spin" />불러오는 중...
              </div>
            ) : (
              <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: docHtml || "" }} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── 월별 카드 컴포넌트 ── */
function MonthCard({
  month, monthKey, items, status, isCurrentMonth,
  hasMaterial, hasMinutes,
  onAdd, onEdit, onDelete, onPreviewMaterial, onPreviewMinutes,
}: {
  month: number; monthKey: string; items: SafetyCommittee[]; status: "complete" | "partial" | "empty";
  isCurrentMonth: boolean; hasMaterial: boolean; hasMinutes: boolean;
  onAdd: () => void; onEdit: (c: SafetyCommittee) => void; onDelete: (id: number) => void;
  onPreviewMaterial: (url: string, name: string) => void; onPreviewMinutes: (c: SafetyCommittee) => void;
}) {
  const c = items[0]; // 월 1건 기준

  const borderColor = status === "complete" ? "border-green-400" : status === "partial" ? "border-amber-400" : "border-border";
  const headerBg = status === "complete" ? "bg-green-50 dark:bg-green-950/30" : status === "partial" ? "bg-amber-50 dark:bg-amber-950/30" : "bg-muted/30";
  const monthColor = status === "complete" ? "text-green-700 dark:text-green-400" : status === "partial" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground";

  return (
    <div className={`border-2 rounded-xl overflow-hidden transition-all ${borderColor} ${isCurrentMonth ? "ring-2 ring-blue-400 ring-offset-1" : ""}`}
      data-testid={`card-committee-${monthKey}`}>
      {/* 월 헤더 */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${headerBg}`}>
        <div className="flex items-center gap-2">
          <span className={`text-base font-bold ${monthColor}`}>{MONTH_NAMES[month - 1]}</span>
          {isCurrentMonth && <span className="text-xs bg-blue-500 text-white px-1.5 py-0.5 rounded-full">이달</span>}
        </div>
        {status === "complete" ? (
          <CheckCircle2 className="w-4 h-4 text-green-500" />
        ) : status === "partial" ? (
          <div className="w-4 h-4 rounded-full border-2 border-amber-400 bg-amber-200" />
        ) : (
          <Circle className="w-4 h-4 text-muted-foreground/40" />
        )}
      </div>

      {/* 본문 */}
      <div className="p-3 space-y-2">
        {status === "empty" ? (
          <div className="flex flex-col items-center justify-center py-3 gap-1.5">
            <FileQuestion className="w-7 h-7 text-muted-foreground/25" />
            <p className="text-xs text-muted-foreground/60">미등록</p>
            <button
              onClick={onAdd}
              className="mt-1 text-xs text-blue-600 hover:text-blue-700 flex items-center gap-0.5 border border-blue-200 rounded px-2 py-1 hover:bg-blue-50 transition-colors"
              data-testid={`button-add-month-${monthKey}`}
            >
              <Plus className="w-3 h-3" />등록
            </button>
          </div>
        ) : (
          <>
            {/* 파일 상태 */}
            <div className="space-y-1.5">
              <FileStatusRow
                icon={<Presentation className="w-3 h-3" />}
                label="회의자료"
                hasFile={hasMaterial}
                color="orange"
                onPreview={c?.meetingMaterialUrl ? () => onPreviewMaterial(c.meetingMaterialUrl!, c.meetingMaterialName ?? "") : undefined}
              />
              <FileStatusRow
                icon={<FileText className="w-3 h-3" />}
                label="회의록"
                hasFile={hasMinutes}
                color="blue"
                onPreview={c?.meetingMinutesUrl ? () => onPreviewMinutes(c) : undefined}
              />
            </div>

            {/* 관리 버튼 */}
            {c && (
              <div className="flex items-center gap-1 pt-1 border-t">
                <button
                  onClick={() => onEdit(c)}
                  className="flex-1 text-xs text-center py-1 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                  data-testid={`button-edit-committee-${c.id}`}
                >수정</button>
                <div className="w-px h-3 bg-border" />
                <button
                  onClick={() => onDelete(c.id)}
                  className="flex-1 text-xs text-center py-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                  data-testid={`button-delete-committee-${c.id}`}
                >삭제</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── 파일 상태 행 ── */
function FileStatusRow({ icon, label, hasFile, color, onPreview }: {
  icon: React.ReactNode; label: string; hasFile: boolean; color: "orange" | "blue";
  onPreview?: () => void;
}) {
  const c = color === "orange"
    ? { text: "text-orange-600", bg: "bg-orange-50", border: "border-orange-200" }
    : { text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" };

  return (
    <div className={`flex items-center gap-1.5 rounded-lg px-2 py-1.5 ${hasFile ? `${c.bg} border ${c.border}` : "bg-muted/20 border border-dashed border-muted"}`}>
      <span className={hasFile ? c.text : "text-muted-foreground/40"}>{icon}</span>
      <span className={`text-xs flex-1 ${hasFile ? `${c.text} font-medium` : "text-muted-foreground/60"}`}>{label}</span>
      {hasFile && onPreview ? (
        <button onClick={onPreview} className={`text-xs flex items-center gap-0.5 ${c.text} hover:opacity-70`}>
          <Eye className="w-2.5 h-2.5" />보기
        </button>
      ) : (
        <span className="text-xs text-muted-foreground/40">미첨부</span>
      )}
    </div>
  );
}

/* ── 업로드 박스 컴포넌트 ── */
function UploadBox({ icon, label, accept, hint, color, fileName, uploading, onSelect, onRemove, testId }: {
  icon: React.ReactNode; label: string; accept: string; hint: string;
  color: "orange" | "blue"; fileName: string; uploading: boolean;
  onSelect: (f: File) => void; onRemove: () => void; testId: string;
}) {
  const colors = {
    orange: { bg: "bg-orange-50/60", border: "border-orange-200", label: "text-orange-700", dashed: "border-orange-300 text-orange-600 hover:bg-orange-50" },
    blue: { bg: "bg-blue-50/60", border: "border-blue-200", label: "text-blue-700", dashed: "border-blue-300 text-blue-600 hover:bg-blue-50" },
  }[color];

  return (
    <div className={`space-y-2 border rounded-lg p-3 ${colors.bg} ${colors.border}`}>
      <p className={`flex items-center gap-2 text-sm font-semibold ${colors.label}`}>
        {icon}{label} <span className="font-normal opacity-60 text-xs">({hint})</span>
      </p>
      {fileName ? (
        <div className="flex items-center gap-2 bg-white border rounded p-2 text-sm">
          <span className={`flex-1 truncate text-xs ${colors.label}`}>{fileName}</span>
          <button type="button" className="text-muted-foreground hover:text-destructive text-xs shrink-0" onClick={onRemove}>삭제</button>
        </div>
      ) : (
        <label className={`flex items-center gap-2 border-2 border-dashed rounded-lg p-3 cursor-pointer ${colors.dashed}`}>
          {uploading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Upload className="w-4 h-4 shrink-0" />}
          <span className="text-sm">{uploading ? "업로드 중..." : "파일 선택"}</span>
          <input type="file" accept={accept} className="hidden" disabled={uploading}
            onChange={e => { if (e.target.files?.[0]) onSelect(e.target.files[0]); e.target.value = ""; }}
            data-testid={testId} />
        </label>
      )}
    </div>
  );
}
