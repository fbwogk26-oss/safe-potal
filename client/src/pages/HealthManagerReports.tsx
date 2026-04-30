import { useQuery, useMutation } from "@tanstack/react-query";
import { useState, useRef } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isToday } from "date-fns";
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
import { Heart, Plus, Trash2, Pencil, FileText, ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, Loader2, Calendar, Paperclip, X, TrendingUp, CalendarDays } from "lucide-react";
import { FileViewer } from "@/components/FileViewer";
import { extractDateFromPdf } from "@/lib/extractPdfDate";
import type { HealthManagerReport } from "@shared/schema";

type StaffType = "위생기사" | "의사" | "간호사";

const STAFF_CONFIGS: { type: StaffType; label: string; frequencyLabel: string; frequencyMonths: number }[] = [
  { type: "간호사",  label: "간호사",  frequencyLabel: "매월 1회",    frequencyMonths: 1 },
  { type: "위생기사", label: "위생기사", frequencyLabel: "2개월 1회", frequencyMonths: 2 },
  { type: "의사",   label: "의사",   frequencyLabel: "3개월 1회",   frequencyMonths: 3 },
];

const STAFF_COLOR: Record<StaffType, string> = {
  "간호사":  "bg-pink-500 text-white",
  "위생기사": "bg-blue-500 text-white",
  "의사":    "bg-green-600 text-white",
};

const ALL_TEAMS = [
  "동대구운용팀", "서대구운용팀", "남대구운용팀", "공공망관제팀",
  "구미운용팀", "포항운용팀", "안동운용팀", "문경운용팀",
];

const DAY_NAMES = ["일", "월", "화", "수", "목", "금", "토"];

function getYearMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function isExpectedThisMonth(frequencyMonths: number, month: number): boolean {
  if (frequencyMonths === 1) return true;
  if (frequencyMonths === 2) return month % 2 === 1;
  if (frequencyMonths === 3) return month % 3 === 1;
  return false;
}

function shortTeam(team: string | null | undefined): string {
  if (!team) return "";
  return team.replace("운용팀", "").replace("관제팀", "");
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
  const [dayReports, setDayReports] = useState<{ date: string; reports: HealthManagerReport[] } | null>(null);

  const [form, setForm] = useState({
    visitDate: format(now, "yyyy-MM-dd"),
    staffType: "" as StaffType | "",
    team: "",
  });
  const [file, setFile] = useState<File | null>(null);
  const [extractingDate, setExtractingDate] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [submitting, setSubmitting] = useState(false);
  const [pdfAnalyzed, setPdfAnalyzed] = useState(false);

  async function handleFileChange(selected: File | null) {
    setFile(selected);
    setPdfAnalyzed(false);
    if (!selected) return;
    if (!selected.name.toLowerCase().endsWith('.pdf')) return;
    setExtractingDate(true);
    try {
      // 서버 AI 분석으로 방문일자·직종 추출 (45초 타임아웃)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 45000);
      const fd = new FormData();
      fd.append("file", selected);
      let res: Response;
      try {
        res = await fetch("/api/health-manager-reports/analyze-pdf", {
          method: "POST",
          body: fd,
          credentials: "include",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeoutId);
      }
      if (res.ok) {
        const { data } = await res.json();
        if (data?.visitDate) setForm(f => ({ ...f, visitDate: data.visitDate }));
        if (data?.staffType && ["간호사", "위생기사", "의사"].includes(data.staffType)) {
          setForm(f => ({ ...f, staffType: data.staffType as StaffType }));
        } else {
          // AI가 직종을 추출하지 못한 경우 사용자에게 알림
          toast({ title: "직종 자동 인식 실패", description: "직종을 직접 선택해주세요.", variant: "destructive" });
        }
        setPdfAnalyzed(true);
        return;
      }
      // AI 분석 실패: 사용자에게 알림 후 클라이언트 폴백
      toast({ title: "PDF 자동 분석 실패", description: "직종과 방문일을 직접 입력해주세요.", variant: "destructive" });
      const date = await extractDateFromPdf(selected);
      if (date) setForm(f => ({ ...f, visitDate: date }));
      setPdfAnalyzed(true);
    } catch (e: any) {
      const isTimeout = e?.name === "AbortError";
      toast({
        title: "PDF 자동 분석 실패",
        description: isTimeout ? "분석 시간이 초과되었습니다. 직종과 방문일을 직접 입력해주세요." : "직종과 방문일을 직접 입력해주세요.",
        variant: "destructive",
      });
      const date = await extractDateFromPdf(selected);
      if (date) setForm(f => ({ ...f, visitDate: date }));
      setPdfAnalyzed(true);
    } finally {
      setExtractingDate(false);
    }
  }

  const yearMonth = getYearMonth(year, month);

  const { data: reports = [], isLoading } = useQuery<HealthManagerReport[]>({
    queryKey: ["/api/health-manager-reports", yearMonth],
    queryFn: () => fetch(`/api/health-manager-reports?yearMonth=${yearMonth}`).then(r => r.json()),
  });

  const { data: annualReports = [] } = useQuery<HealthManagerReport[]>({
    queryKey: ["/api/health-manager-reports", "year", String(year)],
    queryFn: () => fetch(`/api/health-manager-reports?year=${year}`).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/health-manager-reports/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/health-manager-reports"] });
      toast({ title: "삭제 완료" });
      setDayReports(null);
    },
  });

  function openAdd(date?: string) {
    setEditing(null);
    setForm({ visitDate: date || format(now, "yyyy-MM-dd"), staffType: "", team: "" });
    setFile(null);
    setPdfAnalyzed(false);
    setDialogOpen(true);
  }

  function openEdit(r: HealthManagerReport) {
    setEditing(r);
    setForm({ visitDate: r.visitDate, staffType: r.staffType as StaffType, team: r.team || "" });
    setFile(null);
    setPdfAnalyzed(false);
    setDialogOpen(true);
  }

  async function handleSubmit() {
    if (!form.staffType || !form.visitDate) return toast({ variant: "destructive", title: "직종과 방문일을 입력해주세요" });
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("visitDate", form.visitDate);
      fd.append("staffType", form.staffType);
      if (form.team) fd.append("team", form.team);
      if (file) fd.append("file", file);
      let res: Response;
      const fetchOpts: RequestInit = { method: editing ? "PATCH" : "POST", body: fd, credentials: "include" };
      if (editing) {
        res = await fetch(`/api/health-manager-reports/${editing.id}`, fetchOpts);
      } else {
        res = await fetch("/api/health-manager-reports", fetchOpts);
      }
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || `서버 오류 (${res.status})`);
      }
      // visitDate 기준으로 올바른 년월 캐시 무효화 + 캘린더 이동
      queryClient.invalidateQueries({ queryKey: ["/api/health-manager-reports"] });
      const [vy, vm] = form.visitDate.substring(0, 7).split("-").map(Number);
      setYear(vy);
      setMonth(vm);
      setDialogOpen(false);
      toast({ title: editing ? "수정 완료" : "등록 완료" });
    } catch (e: any) {
      const isNetworkError = e instanceof TypeError;
      toast({
        variant: "destructive",
        title: "저장 실패",
        description: isNetworkError
          ? "네트워크 연결 오류입니다. 잠시 후 다시 시도해주세요."
          : (e?.message || "알 수 없는 오류"),
      });
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
  const startPad = getDay(monthStart);

  // 날짜별 보고서 맵
  const reportsByDate = new Map<string, HealthManagerReport[]>();
  for (const r of reports) {
    if (!reportsByDate.has(r.visitDate)) reportsByDate.set(r.visitDate, []);
    reportsByDate.get(r.visitDate)!.push(r);
  }

  const expectedConfigs = STAFF_CONFIGS.filter(cfg => isExpectedThisMonth(cfg.frequencyMonths, month));
  const totalPlanned = expectedConfigs.length;
  const totalDone = expectedConfigs.filter(cfg => reports.some(r => r.staffType === cfg.type)).length;
  const annualCount = annualReports.length;

  function handleDayClick(dateStr: string, dayRpts: HealthManagerReport[]) {
    if (dayRpts.length === 1) {
      setDetailReport(dayRpts[0]);
    } else {
      setDayReports({ date: dateStr, reports: dayRpts });
    }
  }

  return (
    <div className="p-4 md:p-6 space-y-5">
      {/* 헤더 */}
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
            <Button onClick={() => openAdd()} className="gap-1 bg-rose-600 hover:bg-rose-700" data-testid="btn-add-report">
              <Plus className="h-4 w-4" /> 등록
            </Button>
          )}
        </div>
      </div>

      {/* 대시보드 — 이번달 현황 + 연간 현황 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 이번달 현황 */}
        <Card className="border-rose-200/60 dark:border-rose-900/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-rose-500" />
              <span className="text-sm font-semibold">{year}년 {month}월 현황</span>
              <Badge variant={totalDone >= totalPlanned ? "default" : "secondary"} className="ml-auto text-xs">
                {totalDone} / {totalPlanned}직종
              </Badge>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-3">
              <div className="bg-rose-500 h-2 rounded-full transition-all" style={{ width: `${totalPlanned > 0 ? Math.min(100, (totalDone / totalPlanned) * 100) : 0}%` }} />
            </div>
            <div className="grid grid-cols-3 gap-2">
              {STAFF_CONFIGS.map(cfg => {
                const done = reports.filter(r => r.staffType === cfg.type).length;
                const expected = isExpectedThisMonth(cfg.frequencyMonths, month);
                const statusLabel = !expected ? "해당없음" : done > 0 ? "완료" : "미완료";
                return (
                  <div key={cfg.type} className={`rounded-lg p-2 text-center border ${statusLabel === "완료" ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" : statusLabel === "미완료" ? "border-amber-300" : "border-border bg-muted/20"}`}>
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium mb-1 ${STAFF_COLOR[cfg.type]}`}>{cfg.label}</span>
                    <div className={`font-bold text-sm ${statusLabel === "완료" ? "text-green-600" : statusLabel === "미완료" ? "text-amber-600" : "text-muted-foreground"}`}>
                      {done}회
                    </div>
                    <div className="text-[10px] text-muted-foreground">{cfg.frequencyLabel}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* 연간 현황 */}
        <Card className="border-blue-200/60 dark:border-blue-900/40">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-semibold">{year}년 연간 현황</span>
            </div>
            <div className="flex items-end gap-2 mb-3">
              <span className="text-4xl font-bold text-blue-600">{annualCount}</span>
              <span className="text-muted-foreground mb-1">회 방문</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {Array.from({ length: 12 }, (_, i) => {
                const m = i + 1;
                const cnt = annualReports.filter(r => {
                  const rm = parseInt(r.visitDate.slice(5, 7));
                  return rm === m;
                }).length;
                const isPast = m <= month;
                const isCurrentMonth = m === month;
                return (
                  <div key={m} className={`rounded p-1.5 text-center text-[11px] border ${
                    isCurrentMonth ? "bg-blue-100 dark:bg-blue-900/30 border-blue-400 dark:border-blue-600 font-semibold" :
                    cnt > 0 ? "bg-muted/40 border-border" : isPast ? "bg-muted/20 border-border" : "border-dashed border-border/50"
                  }`}>
                    <div className="text-muted-foreground text-[10px]">{m}월</div>
                    <div className={`font-bold ${cnt > 0 ? "text-blue-600" : "text-muted-foreground/50"}`}>{cnt}</div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 직종별 현황 카드 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STAFF_CONFIGS.map(cfg => {
          const done = reports.filter(r => r.staffType === cfg.type).length;
          const expected = isExpectedThisMonth(cfg.frequencyMonths, month);
          const status = !expected ? "해당없음" : done > 0 ? "완료" : "미완료";
          return (
            <Card key={cfg.type} className={`border-2 ${status === "완료" ? "border-green-400 bg-green-50 dark:bg-green-950/30" : status === "미완료" ? "border-amber-400" : "border-gray-200 dark:border-gray-700"}`} data-testid={`card-staff-${cfg.type}`}>
              <CardContent className="p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STAFF_COLOR[cfg.type]}`}>{cfg.label}</span>
                    <span className="text-xs text-muted-foreground">{cfg.frequencyLabel}</span>
                  </div>
                  {status === "완료" && <CheckCircle2 className="h-5 w-5 text-green-500" />}
                  {status === "미완료" && <AlertCircle className="h-5 w-5 text-amber-500" />}
                  {status === "해당없음" && <Calendar className="h-5 w-5 text-gray-400" />}
                </div>
                <div className="text-lg font-bold">
                  <span className={done > 0 ? "text-green-600" : expected ? "text-amber-600" : "text-gray-400"}>{done}회</span>
                  {expected && <span className="text-sm text-muted-foreground"> 방문</span>}
                  {!expected && <span className="text-sm text-muted-foreground"> (이번달 해당없음)</span>}
                </div>
                {/* 방문한 팀 목록 */}
                {done > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {reports.filter(r => r.staffType === cfg.type && r.team).map(r => (
                      <span key={r.id} className="text-[10px] px-1.5 py-0.5 bg-muted rounded text-muted-foreground">{r.team}</span>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 캘린더 */}
      <Card>
        <CardContent className="p-3">
          {/* 캘린더 헤더 */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{year}년 {month}월 방문 캘린더</span>
              <Badge variant={totalDone >= totalPlanned ? "default" : "secondary"} className="text-xs">
                {totalDone} / {totalPlanned}직종
              </Badge>
            </div>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 mb-0.5">
            {DAY_NAMES.map((d, i) => (
              <div key={d} className={`text-center text-[10px] font-semibold py-0.5 ${i === 0 ? "text-red-500" : i === 6 ? "text-blue-500" : "text-muted-foreground"}`}>{d}</div>
            ))}
          </div>

          {/* 날짜 셀 */}
          {isLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : (
            <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
              {Array.from({ length: startPad }).map((_, i) => (
                <div key={`pad-${i}`} className="bg-muted/20 min-h-[46px]" />
              ))}
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
                    className={`bg-background min-h-[46px] p-0.5 flex flex-col gap-0.5 transition-colors
                      ${hasReports ? "cursor-pointer hover:bg-rose-50 dark:hover:bg-rose-950/20" : ""}
                      ${today ? "ring-2 ring-rose-400 ring-inset" : ""}
                    `}
                    onClick={() => hasReports && handleDayClick(dateStr, dayRpts)}
                  >
                    <span className={`text-[10px] font-medium leading-none mb-0.5 pl-0.5
                      ${today ? "text-rose-600 font-bold" : isSun ? "text-red-500" : isSat ? "text-blue-500" : "text-foreground"}
                    `}>
                      {format(day, "d")}
                    </span>
                    {dayRpts.map(r => (
                      <span
                        key={r.id}
                        className={`text-[8px] leading-tight px-0.5 py-px rounded font-medium truncate ${STAFF_COLOR[r.staffType as StaffType] ?? "bg-gray-400 text-white"}`}
                        title={`${r.staffType}${r.team ? ` · ${r.team}` : ""}`}
                      >
                        {r.team ? `${shortTeam(r.team)}·${r.staffType === "위생기사" ? "위생" : r.staffType}` : r.staffType}
                      </span>
                    ))}
                  </div>
                );
              })}
            </div>
          )}

          {/* 색상 범례 */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t">
            {STAFF_CONFIGS.map(cfg => (
              <span key={cfg.type} className="flex items-center gap-1 text-xs text-muted-foreground">
                <span className={`inline-block w-2.5 h-2.5 rounded-sm ${STAFF_COLOR[cfg.type].split(" ")[0]}`} />
                {cfg.label}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

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
                  <SelectTrigger className={!form.staffType && pdfAnalyzed ? "border-amber-500 ring-1 ring-amber-400" : ""}><SelectValue placeholder="직종 선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="간호사">간호사 (매월 1회)</SelectItem>
                    <SelectItem value="위생기사">위생기사 (2개월 1회)</SelectItem>
                    <SelectItem value="의사">의사 (3개월 1회)</SelectItem>
                  </SelectContent>
                </Select>
                {!form.staffType && pdfAnalyzed && (
                  <p className="text-xs text-amber-600 flex items-center gap-1 mt-1"><AlertCircle className="h-3 w-3" />직종을 선택해주세요</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>방문일 *</Label>
                <Input type="date" value={form.visitDate} onChange={e => setForm(f => ({ ...f, visitDate: e.target.value }))} data-testid="input-visit-date" />
              </div>
            </div>

            <div className="space-y-1">
              <Label>방문 팀</Label>
              <Select value={form.team || "__none__"} onValueChange={v => setForm(f => ({ ...f, team: v === "__none__" ? "" : v }))} data-testid="select-team">
                <SelectTrigger><SelectValue placeholder="팀 선택 (선택사항)" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">선택 안 함</SelectItem>
                  {ALL_TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
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
              <Button onClick={handleSubmit} disabled={submitting || extractingDate} className="bg-rose-600 hover:bg-rose-700" data-testid="btn-submit">
                {(submitting || extractingDate) ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                {extractingDate ? "PDF 분석 중..." : editing ? "수정" : "등록"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* 하루에 여러 보고서 선택 다이얼로그 */}
      <Dialog open={!!dayReports} onOpenChange={() => setDayReports(null)}>
        <DialogContent className="w-[95vw] max-w-sm">
          <DialogHeader>
            <DialogTitle>{dayReports?.date} 방문 보고서</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 pt-2">
            {dayReports?.reports.map(r => (
              <div key={r.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/50 cursor-pointer" onClick={() => { setDayReports(null); setDetailReport(r); }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STAFF_COLOR[r.staffType as StaffType] ?? "bg-gray-400 text-white"}`}>{r.staffType}</span>
                  {r.team && <Badge variant="outline" className="text-xs">{r.team}</Badge>}
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
                <div>
                  <span className="text-muted-foreground mr-1">직종</span>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${STAFF_COLOR[detailReport.staffType as StaffType] ?? ""}`}>{detailReport.staffType}</span>
                </div>
                {detailReport.team && (
                  <div><span className="text-muted-foreground mr-1">방문 팀</span><span className="font-semibold">{detailReport.team}</span></div>
                )}
                <div><span className="text-muted-foreground mr-1">방문일</span><span className="font-semibold">{detailReport.visitDate}</span></div>
                <div><span className="text-muted-foreground mr-1">기준 월</span><span>{detailReport.yearMonth}</span></div>
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
                apiBase={`/api/health-manager-reports/${detailReport.id}/file`}
                accentColor="text-rose-500"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
