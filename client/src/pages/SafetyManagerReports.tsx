import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameDay, isToday } from "date-fns";
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
import { HardHat, Plus, Trash2, Pencil, FileText, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2, Paperclip, X } from "lucide-react";
import { FileViewer } from "@/components/FileViewer";
import { extractDateFromPdf } from "@/lib/extractPdfDate";
import type { SafetyManagerReport } from "@shared/schema";

const DAEGU_TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "공공망관제팀"];
const ALL_TEAMS = [...DAEGU_TEAMS, "구미운용팀", "포항운용팀", "안동운용팀", "문경운용팀"];

const TEAM_COLOR: Record<string, string> = {
  "동대구운용팀": "bg-orange-500 text-white",
  "서대구운용팀": "bg-orange-400 text-white",
  "남대구운용팀": "bg-amber-500 text-white",
  "공공망관제팀": "bg-yellow-500 text-white",
  "구미운용팀":   "bg-blue-500 text-white",
  "포항운용팀":   "bg-green-500 text-white",
  "안동운용팀":   "bg-purple-500 text-white",
  "문경운용팀":   "bg-rose-500 text-white",
};

const VISIT_PLAN: { label: string; teams: string[]; planned: number; note: string }[] = [
  { label: "대구 지역", teams: DAEGU_TEAMS, planned: 2, note: "4팀 중 매월 2팀 순환" },
  { label: "구미운용팀", teams: ["구미운용팀"], planned: 2, note: "매월 2회" },
  { label: "포항운용팀", teams: ["포항운용팀"], planned: 2, note: "매월 2회" },
  { label: "안동운용팀", teams: ["안동운용팀"], planned: 1, note: "매월 1회" },
  { label: "문경운용팀", teams: ["문경운용팀"], planned: 1, note: "매월 1회" },
];

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

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
  const [dayReports, setDayReports] = useState<{ date: string; reports: SafetyManagerReport[] } | null>(null);

  const [form, setForm] = useState({ visitDate: format(now, "yyyy-MM-dd"), team: "", visitSequence: "1" });
  const [file, setFile] = useState<File | null>(null);
  const [extractingDate, setExtractingDate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleFileChange(selected: File | null) {
    setFile(selected);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.pdf')) return;
    setExtractingDate(true);
    try {
      // 서버 AI 분석으로 점검일자 추출
      const fd = new FormData();
      fd.append("file", selected);
      const res = await fetch("/api/safety-manager-reports/analyze-pdf", { method: "POST", body: fd });
      if (res.ok) {
        const { data } = await res.json();
        if (data?.visitDate) {
          setForm(f => ({ ...f, visitDate: data.visitDate }));
          return;
        }
      }
      // AI 실패 시 클라이언트 정규식 폴백
      const date = await extractDateFromPdf(selected);
      if (date) setForm(f => ({ ...f, visitDate: date }));
    } catch {
      // 폴백
      const date = await extractDateFromPdf(selected);
      if (date) setForm(f => ({ ...f, visitDate: date }));
    } finally {
      setExtractingDate(false);
    }
  }

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
      setDayReports(null);
    },
  });

  function openAdd(date?: string) {
    setEditing(null);
    setForm({ visitDate: date || format(new Date(year, month - 1, 1), "yyyy-MM-dd"), team: "", visitSequence: "1" });
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

  // 캘린더 날짜 계산
  const monthStart = startOfMonth(new Date(year, month - 1));
  const monthEnd = endOfMonth(monthStart);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  const startPad = getDay(monthStart); // 0=일요일

  // 날짜별 보고서 맵
  const reportsByDate = new Map<string, SafetyManagerReport[]>();
  for (const r of reports) {
    const key = r.visitDate;
    if (!reportsByDate.has(key)) reportsByDate.set(key, []);
    reportsByDate.get(key)!.push(r);
  }

  const visitCountByGroup = VISIT_PLAN.map(g => ({ ...g, count: reports.filter(r => g.teams.includes(r.team)).length }));
  const totalPlanned = VISIT_PLAN.reduce((s, g) => s + g.planned, 0);
  const totalDone = reports.length;

  function handleDayClick(dateStr: string, dayRpts: SafetyManagerReport[]) {
    if (dayRpts.length === 1) {
      setDetailReport(dayRpts[0]);
    } else if (dayRpts.length > 1) {
      setDayReports({ date: dateStr, reports: dayRpts });
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 헤더 */}
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
            <Button onClick={() => openAdd()} className="gap-1" data-testid="btn-add-report">
              <Plus className="h-4 w-4" /> 등록
            </Button>
          )}
        </div>
      </div>

      {/* 방문 현황 요약 카드 */}
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
              <p className="text-xs text-muted-foreground mt-0.5">{g.note}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 캘린더 */}
      <Card>
        <CardContent className="p-3 md:p-4">
          {/* 진행률 헤더 */}
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium">방문 현황</span>
            <div className="flex items-center gap-2">
              <Badge variant={totalDone >= totalPlanned ? "default" : "secondary"} className="text-xs">
                {totalDone} / {totalPlanned}회 완료
              </Badge>
              <div className="w-24 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                <div className="bg-orange-500 h-1.5 rounded-full transition-all" style={{ width: `${Math.min(100, (totalDone / totalPlanned) * 100)}%` }} />
              </div>
            </div>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className={`text-center text-xs font-semibold py-1 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}>{d}</div>
            ))}
          </div>

          {/* 날짜 셀 */}
          {isLoading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {/* 앞 빈 칸 */}
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} className="bg-muted/20 min-h-[64px] md:min-h-[80px]" />
              ))}
              {/* 날짜 셀 */}
              {days.map(day => {
                const dateStr = format(day, "yyyy-MM-dd");
                const dayRpts = reportsByDate.get(dateStr) || [];
                const hasReports = dayRpts.length > 0;
                const today = isToday(day);
                const dayOfWeek = getDay(day);
                const isSun = dayOfWeek === 0;
                const isSat = dayOfWeek === 6;

                return (
                  <div
                    key={dateStr}
                    className={`bg-background min-h-[64px] md:min-h-[80px] p-1 md:p-1.5 flex flex-col gap-0.5 transition-colors
                      ${hasReports ? "cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-950/20" : ""}
                      ${today ? "ring-2 ring-orange-400 ring-inset" : ""}
                    `}
                    onClick={() => hasReports && handleDayClick(dateStr, dayRpts)}
                  >
                    <span className={`text-xs font-medium leading-none mb-0.5
                      ${today ? "text-orange-600 font-bold" : isSun ? "text-red-500" : isSat ? "text-blue-500" : "text-foreground"}
                    `}>
                      {format(day, "d")}
                    </span>
                    {dayRpts.map(r => (
                      <span
                        key={r.id}
                        className={`text-[9px] md:text-[10px] leading-tight px-1 py-0.5 rounded font-medium truncate ${TEAM_COLOR[r.team] ?? "bg-gray-400 text-white"}`}
                        title={`${r.team}${needsSequence(r.team) ? ` ${r.visitSequence}차` : ""}`}
                      >
                        {r.team.replace("운용팀", "").replace("관제팀", "")}
                        {needsSequence(r.team) ? `·${r.visitSequence}차` : ""}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* 팀 색상 범례 */}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-3 pt-3 border-t">
            {ALL_TEAMS.map(team => (
              <span key={team} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${TEAM_COLOR[team]?.split(" ")[0] ?? "bg-gray-400"}`} />
                {team.replace("운용팀", "").replace("관제팀", "")}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

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
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{file.name}</p>
                      {extractingDate && <p className="text-xs text-muted-foreground flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />날짜 추출 중...</p>}
                    </div>
                    <button type="button" onClick={e => { e.stopPropagation(); handleFileChange(null); if (fileRef.current) fileRef.current.value = ""; }} className="p-0.5 rounded hover:bg-muted" data-testid="btn-remove-file">
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
              <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.hwp,.hwpx,.xlsx,.xls,.jpg,.jpeg,.png" onChange={e => handleFileChange(e.target.files?.[0] || null)} data-testid="input-file" />
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

      {/* 하루에 여러 보고서가 있을 때 선택 다이얼로그 */}
      <Dialog open={!!dayReports} onOpenChange={() => setDayReports(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>{dayReports?.date} 방문 보고서</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {dayReports?.reports.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => { setDayReports(null); setDetailReport(r); }}>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${TEAM_COLOR[r.team] ?? "bg-gray-400 text-white"}`}>{r.team}</span>
                  {needsSequence(r.team) && <span className="text-xs text-muted-foreground">{r.visitSequence}차 방문</span>}
                  {r.fileOriginalName && <FileText className="h-3 w-3 text-blue-500" />}
                </div>
                {canEditInspections && (
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setDayReports(null); openEdit(r); }}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(r.id); }}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )}
              </div>
            ))}
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
                <div><span className="text-muted-foreground mr-1">팀</span><span className={`px-2 py-0.5 rounded text-xs font-medium ${TEAM_COLOR[detailReport.team] ?? ""}`}>{detailReport.team}</span></div>
                <div><span className="text-muted-foreground mr-1">방문일</span><span className="font-semibold">{detailReport.visitDate}</span></div>
                {needsSequence(detailReport.team) && <div><span className="text-muted-foreground mr-1">방문 차수</span><span className="font-semibold">{detailReport.visitSequence}차</span></div>}
                <div><span className="text-muted-foreground mr-1">등록일</span><span>{detailReport.createdAt ? format(new Date(detailReport.createdAt), "yyyy.MM.dd HH:mm", { locale: ko }) : "-"}</span></div>
              </div>
              {canEditInspections && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => { setDetailReport(null); openEdit(detailReport); }}>
                    <Pencil className="h-3 w-3" /> 수정
                  </Button>
                  <Button variant="outline" size="sm" className="gap-1 text-destructive hover:text-destructive" onClick={() => { if (confirm("삭제하시겠습니까?")) { deleteMutation.mutate(detailReport.id); setDetailReport(null); } }}>
                    <Trash2 className="h-3 w-3" /> 삭제
                  </Button>
                </div>
              )}
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
