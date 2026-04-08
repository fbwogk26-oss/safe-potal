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
import { HardHat, Plus, Trash2, Pencil, FileText, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2, Paperclip, X, ExternalLink } from "lucide-react";
import type { SafetyManagerReport } from "@shared/schema";

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
          <FileText className="h-4 w-4 text-orange-500 shrink-0" />
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

const DAEGU_TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "공공망관제팀"];
const ALL_TEAMS = [...DAEGU_TEAMS, "구미운용팀", "포항운용팀", "안동운용팀", "문경운용팀"];

const VISIT_PLAN: { label: string; teams: string[]; planned: number; note: string }[] = [
  { label: "대구 지역", teams: DAEGU_TEAMS, planned: 2, note: "동대구·서대구·남대구·공공망 4팀 중 매월 2팀 순환" },
  { label: "구미운용팀", teams: ["구미운용팀"], planned: 2, note: "매월 2회" },
  { label: "포항운용팀", teams: ["포항운용팀"], planned: 2, note: "매월 2회" },
  { label: "안동운용팀", teams: ["안동운용팀"], planned: 1, note: "매월 1회" },
  { label: "문경운용팀", teams: ["문경운용팀"], planned: 1, note: "매월 1회" },
];

function getYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

const needsSequence = (team: string) => team === "구미운용팀" || team === "포항운용팀";

export default function SafetyManagerReports() {
  const { canEditInspections } = usePermissions();
  const { toast } = useToast();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SafetyManagerReport | null>(null);
  const [detailReport, setDetailReport] = useState<SafetyManagerReport | null>(null);

  const [form, setForm] = useState({ visitDate: format(now, "yyyy-MM-dd"), team: "", visitSequence: "1" });
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  const yearMonth = getYearMonth(year, month);

  const { data: reports = [], isLoading } = useQuery<SafetyManagerReport[]>({
    queryKey: ["/api/safety-manager-reports", yearMonth],
    queryFn: () => fetch(`/api/safety-manager-reports?yearMonth=${yearMonth}`).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-manager-reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-manager-reports", yearMonth] });
      toast({ title: "삭제 완료" });
    },
  });

  function openAdd() {
    setEditing(null);
    setForm({ visitDate: format(new Date(year, month - 1, 1), "yyyy-MM-dd"), team: "", visitSequence: "1" });
    setFile(null);
    setDialogOpen(true);
  }

  function openEdit(r: SafetyManagerReport) {
    setEditing(r);
    setForm({ visitDate: r.visitDate, team: r.team, visitSequence: String(r.visitSequence) });
    setFile(null);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.team || !form.visitDate) return toast({ variant: "destructive", title: "팀과 방문일을 입력해주세요" });
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("yearMonth", yearMonth);
      fd.append("visitDate", form.visitDate);
      fd.append("team", form.team);
      fd.append("visitSequence", form.visitSequence);
      if (file) fd.append("file", file);
      if (editing) {
        await fetch(`/api/safety-manager-reports/${editing.id}`, { method: "PATCH", body: fd });
      } else {
        await fetch("/api/safety-manager-reports", { method: "POST", body: fd });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/safety-manager-reports", yearMonth] });
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

  const visitCountByGroup = VISIT_PLAN.map(g => ({ ...g, count: reports.filter(r => g.teams.includes(r.team)).length }));
  const totalPlanned = VISIT_PLAN.reduce((s, g) => s + g.planned, 0);
  const totalDone = reports.length;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <HardHat className="h-6 w-6 text-orange-600" />
          <h1 className="text-xl font-bold">안전관리자 상태보고서</h1>
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

      {/* 방문 현황 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {visitCountByGroup.map(g => (
          <Card key={g.label} className={`border-2 ${g.count >= g.planned ? "border-green-400 bg-green-50 dark:bg-green-950/30" : "border-gray-200 dark:border-gray-700"}`}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-muted-foreground truncate">{g.label}</span>
                {g.count >= g.planned ? <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" /> : <AlertCircle className="h-4 w-4 text-amber-500 shrink-0" />}
              </div>
              <div className="text-lg font-bold">
                <span className={g.count >= g.planned ? "text-green-600" : "text-amber-600"}>{g.count}</span>
                <span className="text-sm text-muted-foreground"> / {g.planned}회</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{g.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 진행률 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">{year}년 {month}월 방문 현황</span>
            <Badge variant={totalDone >= totalPlanned ? "default" : "secondary"}>{totalDone} / {totalPlanned}회</Badge>
          </div>
          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div className="bg-orange-500 h-2 rounded-full transition-all" style={{ width: `${Math.min(100, (totalDone / totalPlanned) * 100)}%` }} />
          </div>
        </CardContent>
      </Card>

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
                      <Badge variant="outline" className="text-xs shrink-0">{r.team}</Badge>
                      {needsSequence(r.team) && <Badge variant="secondary" className="text-xs shrink-0">{r.visitSequence}차 방문</Badge>}
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
            <DialogTitle>{editing ? "보고서 수정" : "안전관리자 방문 보고서 등록"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>방문 팀 *</Label>
                <Select value={form.team} onValueChange={v => setForm(f => ({ ...f, team: v, visitSequence: "1" }))} data-testid="select-team">
                  <SelectTrigger><SelectValue placeholder="팀 선택" /></SelectTrigger>
                  <SelectContent>
                    {ALL_TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>방문일 *</Label>
                <Input type="date" value={form.visitDate} onChange={e => setForm(f => ({ ...f, visitDate: e.target.value }))} data-testid="input-visit-date" />
              </div>
            </div>

            {needsSequence(form.team) && (
              <div className="space-y-1">
                <Label>방문 차수</Label>
                <Select value={form.visitSequence} onValueChange={v => setForm(f => ({ ...f, visitSequence: v }))} data-testid="select-sequence">
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1차 방문</SelectItem>
                    <SelectItem value="2">2차 방문</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1">
              <Label>보고서 파일 첨부</Label>
              <div
                className="border-2 border-dashed rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => fileRef.current?.click()}
                data-testid="drop-file-area"
              >
                {file ? (
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-orange-500 shrink-0" />
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
                <div><span className="text-muted-foreground mr-1">팀</span><span className="font-semibold">{detailReport.team}</span></div>
                <div><span className="text-muted-foreground mr-1">방문일</span><span className="font-semibold">{detailReport.visitDate}</span></div>
                {needsSequence(detailReport.team) && <div><span className="text-muted-foreground mr-1">방문 차수</span><span className="font-semibold">{detailReport.visitSequence}차</span></div>}
                <div><span className="text-muted-foreground mr-1">등록일</span><span>{detailReport.createdAt ? format(new Date(detailReport.createdAt), "yyyy.MM.dd HH:mm", { locale: ko }) : "-"}</span></div>
              </div>
              <FileViewer
                fileUrl={detailReport.fileUrl}
                fileOriginalName={detailReport.fileOriginalName}
                apiBase={`/api/safety-manager-reports/${detailReport.id}/file`}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
