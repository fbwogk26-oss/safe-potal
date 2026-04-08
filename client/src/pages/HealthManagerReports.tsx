import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Heart, Plus, Trash2, Pencil, FileText, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2, Calendar, Paperclip, X, ExternalLink } from "lucide-react";
import type { HealthManagerReport } from "@shared/schema";

const PREVIEWABLE_EXTS = ['.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

function getFileExt(name: string | null): string {
  if (!name) return '';
  return name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
}

function FileViewer({ fileUrl, fileOriginalName, apiBase }: { fileUrl: string | null; fileOriginalName: string | null; apiBase: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(false);

  const ext = getFileExt(fileOriginalName);
  const isImage = IMAGE_EXTS.includes(ext);
  const isPdf = ext === '.pdf';
  const canPreview = PREVIEWABLE_EXTS.includes(ext);

  useEffect(() => {
    if (!fileUrl || !canPreview) return;
    let objectUrl: string | null = null;
    setLoading(true);
    fetch(`${apiBase}?inline=true`)
      .then(r => { if (!r.ok) throw new Error("failed"); return r.blob(); })
      .then(blob => { objectUrl = URL.createObjectURL(blob); setBlobUrl(objectUrl); setLoadError(false); })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
    return () => { if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [apiBase, fileUrl, canPreview]);

  if (!fileUrl) return <div className="border rounded-lg p-4 bg-muted/20 text-center text-muted-foreground text-sm">첨부 파일 없음</div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 text-rose-500 shrink-0" />
          <span className="text-sm font-medium truncate">{fileOriginalName || "보고서 파일"}</span>
        </div>
        <button
          onClick={async () => {
            const res = await fetch(apiBase);
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url; a.download = fileOriginalName || "파일";
            document.body.appendChild(a); a.click();
            document.body.removeChild(a); URL.revokeObjectURL(url);
          }}
          className="flex items-center gap-1 text-xs text-blue-600 hover:underline shrink-0 ml-2"
        >
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
        ) : blobUrl ? (
          isImage ? (
            <img src={blobUrl} alt={fileOriginalName || "파일"} className="w-full rounded-lg border object-contain max-h-[60vh]" />
          ) : isPdf ? (
            <iframe src={blobUrl} className="w-full rounded-lg border bg-white" style={{ height: "60vh", minHeight: 320 }} title={fileOriginalName || "PDF 미리보기"} />
          ) : null
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

type StaffType = "위생기사" | "의사" | "간호사";

const STAFF_CONFIGS: { type: StaffType; label: string; frequencyLabel: string; frequencyMonths: number }[] = [
  { type: "간호사", label: "간호사", frequencyLabel: "매월 1회", frequencyMonths: 1 },
  { type: "위생기사", label: "위생기사", frequencyLabel: "2개월 1회", frequencyMonths: 2 },
  { type: "의사", label: "의사", frequencyLabel: "3개월 1회", frequencyMonths: 3 },
];

const STAFF_BADGE: Record<StaffType, string> = {
  "간호사": "bg-pink-100 text-pink-800 dark:bg-pink-900/50 dark:text-pink-200",
  "위생기사": "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-200",
  "의사": "bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-200",
};

function getYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isExpectedThisMonth(frequencyMonths: number, month: number): boolean {
  if (frequencyMonths === 1) return true;
  if (frequencyMonths === 2) return month % 2 === 1;
  if (frequencyMonths === 3) return month % 3 === 1;
  return false;
}

export default function HealthManagerReports() {
  const { canEditInspections } = usePermissions();
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<HealthManagerReport | null>(null);
  const [detailReport, setDetailReport] = useState<HealthManagerReport | null>(null);

  const [form, setForm] = useState({ visitDate: format(now, "yyyy-MM-dd"), staffType: "" as StaffType | "" });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const yearMonth = getYearMonth(year, month);

  const { data: reports = [], isLoading } = useQuery<HealthManagerReport[]>({
    queryKey: ["/api/health-manager-reports", yearMonth],
    queryFn: () => fetch(`/api/health-manager-reports?yearMonth=${yearMonth}`).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/health-manager-reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/health-manager-reports", yearMonth] });
      toast({ title: "삭제 완료" });
    },
  });

  function openAdd() {
    setEditing(null);
    setForm({ visitDate: format(new Date(year, month - 1, 1), "yyyy-MM-dd"), staffType: "" });
    setFile(null);
    setDialogOpen(true);
  }

  function openEdit(r: HealthManagerReport) {
    setEditing(r);
    setForm({ visitDate: r.visitDate, staffType: r.staffType as StaffType });
    setFile(null);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.staffType || !form.visitDate) return toast({ variant: "destructive", title: "직종과 방문일을 입력해주세요" });
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("yearMonth", yearMonth);
      fd.append("visitDate", form.visitDate);
      fd.append("staffType", form.staffType);
      if (file) fd.append("file", file);
      if (editing) {
        await fetch(`/api/health-manager-reports/${editing.id}`, { method: "PATCH", body: fd });
      } else {
        await fetch("/api/health-manager-reports", { method: "POST", body: fd });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/health-manager-reports", yearMonth] });
      setDialogOpen(false);
      toast({ title: editing ? "수정 완료" : "등록 완료" });
    } catch {
      toast({ variant: "destructive", title: "저장 실패" });
    } finally {
      setSubmitting(false);
    }
  }

  function prevMonth() { if (month === 1) { setYear(y => y - 1); setMonth(12); } else setMonth(m => m - 1); }
  function nextMonth() { if (month === 12) { setYear(y => y + 1); setMonth(1); } else setMonth(m => m + 1); }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <Heart className="h-6 w-6 text-rose-600" />
          <h1 className="text-xl font-bold">보건관리자 상태보고서</h1>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="font-semibold min-w-[6rem] text-center">{year}년 {month}월</span>
          <Button variant="outline" size="icon" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
          {canEditInspections && (
            <Button onClick={openAdd} className="gap-1" data-testid="btn-add-report">
              <Plus className="h-4 w-4" /> 등록
            </Button>
          )}
        </div>
      </div>

      {/* 직종별 현황 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {STAFF_CONFIGS.map(cfg => {
          const done = reports.filter(r => r.staffType === cfg.type).length;
          const expected = isExpectedThisMonth(cfg.frequencyMonths, month);
          const status = !expected ? "해당없음" : done > 0 ? "완료" : "미완료";
          return (
            <Card key={cfg.type} className={`border-2 ${status === "완료" ? "border-green-400" : status === "미완료" ? "border-amber-400" : "border-gray-200 dark:border-gray-700"}`} data-testid={`card-staff-${cfg.type}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="font-semibold">{cfg.label}</span>
                  {status === "완료" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  {status === "미완료" && <AlertCircle className="h-5 w-5 text-amber-500" />}
                  {status === "해당없음" && <Calendar className="h-5 w-5 text-gray-400" />}
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">방문 주기</span>
                    <Badge variant="outline" className="text-xs">{cfg.frequencyLabel}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">이번달 방문</span>
                    <span className={`font-medium ${done > 0 ? "text-green-600" : expected ? "text-amber-600" : "text-gray-500"}`}>{done}회</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 보고서 목록 */}
      <div className="space-y-2">
        <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">등록된 보고서 ({reports.length}건)</h2>
        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : reports.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">등록된 보고서가 없습니다</div>
        ) : (
          <div className="space-y-2">
            {reports.map(r => (
              <Card key={r.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => setDetailReport(r)} data-testid={`card-report-${r.id}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium shrink-0 ${STAFF_BADGE[r.staffType as StaffType] ?? ""}`}>{r.staffType}</span>
                      <span className="text-xs text-muted-foreground shrink-0">{r.visitDate}</span>
                      {r.fileOriginalName && (
                        <span className="flex items-center gap-1 text-xs text-blue-600 min-w-0">
                          <FileText className="h-3 w-3 shrink-0" />
                          <span className="truncate max-w-[160px]">{r.fileOriginalName}</span>
                        </span>
                      )}
                    </div>
                    {canEditInspections && (
                      <div className="flex gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(r)} data-testid={`btn-edit-${r.id}`}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(r.id); }} data-testid={`btn-delete-${r.id}`}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 등록/수정 다이얼로그 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="w-[95vw] max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "보고서 수정" : "보건관리자 방문 보고서 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>직종 *</Label>
                <Select value={form.staffType} onValueChange={v => setForm(f => ({ ...f, staffType: v as StaffType }))} data-testid="select-staff-type">
                  <SelectTrigger><SelectValue placeholder="직종 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="간호사">간호사 (매월 1회)</SelectItem>
                    <SelectItem value="위생기사">위생기사 (2개월 1회)</SelectItem>
                    <SelectItem value="의사">의사 (3개월 1회)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>방문일 *</Label>
                <Input type="date" value={form.visitDate} onChange={e => setForm(f => ({ ...f, visitDate: e.target.value }))} data-testid="input-visit-date" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>보고서 파일 첨부</Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileRef.current?.click()}
                data-testid="drop-file-area"
              >
                {file ? (
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-rose-500 shrink-0" />
                    <span className="text-sm font-medium flex-1 truncate">{file.name}</span>
                    <button type="button" onClick={e => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ""; }} className="p-0.5 rounded hover:bg-muted" data-testid="btn-remove-file">
                      <X className="h-4 w-4 text-muted-foreground" />
                    </button>
                  </div>
                ) : editing?.fileOriginalName ? (
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                    <span className="text-sm flex-1 truncate">현재: {editing.fileOriginalName}</span>
                    <span className="text-xs text-muted-foreground">(클릭하여 교체)</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Paperclip className="h-5 w-5 shrink-0" />
                    <span className="text-sm">파일 클릭하여 첨부 (PDF, HWP, DOC, 엑셀, 이미지)</span>
                  </div>
                )}
              </div>
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.hwp,.hwpx,.xlsx,.xls,.jpg,.jpeg,.png" onChange={e => setFile(e.target.files?.[0] || null)} data-testid="input-file" />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
              <Button onClick={handleSubmit} disabled={submitting} data-testid="btn-submit">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {editing ? "수정" : "등록"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 상세 보기 다이얼로그 */}
      <Dialog open={!!detailReport} onOpenChange={() => setDetailReport(null)}>
        <DialogContent className="w-[95vw] max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>방문 보고서 상세</DialogTitle>
          </DialogHeader>
          {detailReport && (
            <div className="space-y-4 pt-2">
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <div>
                  <span className="text-muted-foreground mr-1">직종</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STAFF_BADGE[detailReport.staffType as StaffType] ?? ""}`}>{detailReport.staffType}</span>
                </div>
                <div><span className="text-muted-foreground mr-1">방문일</span><span className="font-semibold">{detailReport.visitDate}</span></div>
                <div><span className="text-muted-foreground mr-1">기준 월</span><span>{detailReport.yearMonth}</span></div>
                <div><span className="text-muted-foreground mr-1">등록일</span><span>{detailReport.createdAt ? format(new Date(detailReport.createdAt), "yyyy.MM.dd HH:mm", { locale: ko }) : "-"}</span></div>
              </div>
              <FileViewer
                fileUrl={detailReport.fileUrl}
                fileOriginalName={detailReport.fileOriginalName}
                apiBase={`/api/health-manager-reports/${detailReport.id}/file`}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
