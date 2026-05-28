import { useState, useRef, Fragment } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LabelList } from "recharts";
import { Upload, Trash2, Users, Calendar, TrendingUp, FileSpreadsheet, UserCheck, Download, ClipboardList, ShieldCheck, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";

interface AttendanceRecord {
  id: number;
  uploadId: number | null;
  attendanceDate: string;
  name: string;
  company: string | null;
  department: string | null;
  attendanceType: string | null;
  weekNum: number | null;
  month: number | null;
  year: number | null;
  stationName: string | null;
  absenceReason: string | null;
}

interface AttendanceUpload {
  id: number;
  fileName: string;
  totalCount: number;
  createdBy: string | null;
  createdAt: string;
}

const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#84CC16","#F97316","#6366F1"];

// 7팀 고정 색상 (구분이 잘 되는 팔레트)
const DEPT_HEAD_COLORS: Record<string, string> = {
  "구미운용팀":   "#3B82F6",
  "문경운용팀":   "#10B981",
  "포항운용팀":   "#F59E0B",
  "안동운용팀":   "#EF4444",
  "동대구운용팀": "#8B5CF6",
  "서대구운용팀": "#06B6D4",
  "남대구운용팀": "#EC4899",
};

const STAGE_COLORS: Record<string, string> = {
  "점검전": "#EF4444",
  "1차결재대기": "#F59E0B",
  "2차결재대기": "#3B82F6",
  "승인완료": "#10B981",
  "자동종결": "#8B5CF6",
};

const DEPT_HEADS: { team: string; prefix: string }[] = [
  { team: "구미운용팀",    prefix: "홍성" },
  { team: "문경운용팀",    prefix: "곽영" },
  { team: "포항운용팀",    prefix: "윤수" },
  { team: "안동운용팀",    prefix: "편광" },
  { team: "동대구운용팀",  prefix: "맹찬" },
  { team: "서대구운용팀",  prefix: "김철" },
  { team: "남대구운용팀",  prefix: "김홍" },
];

function getDeptHead(name: string) {
  return DEPT_HEADS.find(d => name.startsWith(d.prefix)) ?? null;
}

const GRADE_COLORS: Record<string, string> = {
  "1등급": "#EF4444",
  "2등급": "#F59E0B",
  "3등급": "#10B981",
  "미분류": "#9CA3AF",
};

const now = new Date();
const currentYear = now.getFullYear();
const currentMonth = now.getMonth() + 1;

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

function getMondayOfISOWeek(year: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  return new Date(Date.UTC(year, 0, 4 - (dow - 1) + (isoWeek - 1) * 7));
}

function getWeekLabel(year: number, isoWeek: number): string {
  const monday = getMondayOfISOWeek(year, isoWeek);
  const month = monday.getUTCMonth() + 1;
  const weekOfMonth = Math.ceil(monday.getUTCDate() / 7);
  return `${month}월 ${weekOfMonth}주`;
}

function extractGrade(dept: string | null): string {
  if (!dept) return "미분류";
  const m = dept.match(/^(\d+등급)/);
  return m ? m[1] : "미분류";
}

function isInspectionData(records: AttendanceRecord[]): boolean {
  if (!records.length) return false;
  const sample = records.slice(0, 20);
  return sample.some(r =>
    r.attendanceType?.includes("결재대기") ||
    r.attendanceType?.includes("점검전") ||
    r.attendanceType?.includes("승인완료") ||
    r.attendanceType?.includes("자동종결")
  );
}

export default function AttendanceManagement() {
  const { canEditAttendance } = usePermissions();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<"weekly" | "monthly">("weekly");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedWeek, setSelectedWeek] = useState(getISOWeek(now));
  const [activeTab, setActiveTab] = useState<"inspection" | "trend">("inspection");

  const { data: records = [], isLoading } = useQuery<AttendanceRecord[]>({
    queryKey: ["/api/attendance/records"],
  });

  const { data: uploads = [] } = useQuery<AttendanceUpload[]>({
    queryKey: ["/api/attendance/uploads"],
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/attendance/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message || "업로드 실패");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/uploads"] });
      const excludedMsg = data.excludedCount > 0 ? ` (직영작업 ${data.excludedCount}건 제외)` : "";
      toast({ title: `${data.count}건 점검 기록 등록 완료${excludedMsg}` });
      if (data.isInspectionFormat) setActiveTab("inspection");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: (e: any) => toast({ title: "업로드 실패", description: e.message, variant: "destructive" }),
  });

  const deleteUploadMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/attendance/uploads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/uploads"] });
      toast({ title: "업로드 기록 삭제 완료" });
    },
  });

  const handleDownload = async (uploadId?: number) => {
    const url = uploadId
      ? `/api/attendance/export?uploadId=${uploadId}`
      : `/api/attendance/export`;
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) { toast({ title: "다운로드 실패", variant: "destructive" }); return; }
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `순회점검현황_${new Date().toISOString().slice(0,10)}.xlsx`;
    a.click();
  };

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const weekNums = Array.from({ length: 53 }, (_, i) => i + 1);

  const inspMode = isInspectionData(records);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            입회 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">점검대상 관리 CSV 파일을 업로드하여 분석하세요</p>
        </div>
        <div className="flex gap-2">
          {records.length > 0 && (
            <Button variant="outline" onClick={() => handleDownload()} data-testid="button-download-attendance">
              <Download className="h-4 w-4 mr-2" />
              엑셀 다운로드
            </Button>
          )}
          {canEditAttendance && (
            <>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); }} />
              <Button onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending} data-testid="button-upload-attendance">
                <Upload className="h-4 w-4 mr-2" />
                {uploadMutation.isPending ? "업로드 중..." : "CSV 업로드"}
              </Button>
            </>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-muted-foreground">데이터 로딩 중...</div>
      ) : records.length === 0 ? (
        <Card>
          <CardContent className="py-16 flex flex-col items-center gap-3 text-center">
            <ClipboardList className="h-12 w-12 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">업로드된 점검 기록이 없습니다</p>
            <p className="text-sm text-muted-foreground/70">점검대상 관리 CSV 파일을 업로드하면 분석 자료가 표시됩니다</p>
            {canEditAttendance && (
              <Button className="mt-2" onClick={() => fileRef.current?.click()}>
                <Upload className="h-4 w-4 mr-2" /> CSV 업로드
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList>
            <TabsTrigger value="inspection">
              <ShieldCheck className="h-4 w-4 mr-1.5" />
              점검 분석
            </TabsTrigger>
            <TabsTrigger value="trend">
              <TrendingUp className="h-4 w-4 mr-1.5" />
              기간별 추이
            </TabsTrigger>
          </TabsList>

          <TabsContent value="inspection" className="mt-4 space-y-5">
            <InspectionAnalytics records={records} />
          </TabsContent>

          <TabsContent value="trend" className="mt-4 space-y-5">
            <TrendContent
              records={records}
              viewMode={viewMode} setViewMode={setViewMode}
              selectedYear={selectedYear} setSelectedYear={setSelectedYear}
              selectedMonth={selectedMonth} setSelectedMonth={setSelectedMonth}
              selectedWeek={selectedWeek} setSelectedWeek={setSelectedWeek}
              years={years} months={months} weekNums={weekNums}
            />
          </TabsContent>
        </Tabs>
      )}

      {/* 업로드 이력 */}
      {canEditAttendance && uploads.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              업로드 이력
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {uploads.map(u => (
                <div key={u.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                  <div className="flex items-center gap-3">
                    <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{u.fileName}</p>
                      <p className="text-xs text-muted-foreground">{u.totalCount}건 · {new Date(u.createdAt).toLocaleDateString("ko-KR")} · {u.createdBy}</p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" onClick={() => handleDownload(u.id)} title="이 업로드 엑셀 다운로드">
                      <Download className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("이 업로드의 모든 기록이 삭제됩니다. 계속할까요?")) deleteUploadMutation.mutate(u.id); }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ─── 점검 분석 탭 ────────────────────────────────────────────
function InspectionAnalytics({ records }: { records: AttendanceRecord[] }) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [trendView, setTrendView] = useState<"weekly" | "monthly">("weekly");
  const [reasonDraft, setReasonDraft] = useState<Record<number, string>>({});
  const [reasonSaving, setReasonSaving] = useState<Record<number, boolean>>({});

  const saveReasonMutation = useMutation({
    mutationFn: ({ id, absenceReason }: { id: number; absenceReason: string }) =>
      apiRequest("PUT", `/api/attendance/records/${id}/reason`, { absenceReason }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/attendance/records"] }); },
  });

  // 미분류 제외
  const filteredRecords = records.filter(r => extractGrade(r.department) !== "미분류");
  const total = filteredRecords.length;

  // 단계별 집계
  const stageMap = new Map<string, number>();
  filteredRecords.forEach(r => {
    const k = r.attendanceType || "미확인";
    stageMap.set(k, (stageMap.get(k) || 0) + 1);
  });
  const stageData = [...stageMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([stage, count]) => ({ stage, count, color: STAGE_COLORS[stage] || "#9CA3AF" }));

  // 안전등급별 집계
  const gradeMap = new Map<string, number>();
  filteredRecords.forEach(r => {
    const g = extractGrade(r.department);
    gradeMap.set(g, (gradeMap.get(g) || 0) + 1);
  });
  const gradeData = [...gradeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([grade, count]) => ({ grade, count, color: GRADE_COLORS[grade] || "#9CA3AF" }));

  // 담당자별 집계 (순회점검대상자)
  const inspMap = new Map<string, number>();
  filteredRecords.forEach(r => { inspMap.set(r.name, (inspMap.get(r.name) || 0) + 1); });
  const inspData = [...inspMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));

  // 날짜별 집계
  const dateMap = new Map<string, number>();
  filteredRecords.forEach(r => { dateMap.set(r.attendanceDate, (dateMap.get(r.attendanceDate) || 0) + 1); });
  const dateData = [...dateMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date: date.slice(5), count }));

  // 부서장 입회 집계 (미분류 포함 원본 records 기준)
  const deptHeadRecords = records.filter(r => getDeptHead(r.name) !== null);
  const deptHeadMap = new Map<string, { count: number; name: string; items: AttendanceRecord[] }>();
  DEPT_HEADS.forEach(d => deptHeadMap.set(d.team, { count: 0, name: d.prefix + "*", items: [] }));
  deptHeadRecords.forEach(r => {
    const dh = getDeptHead(r.name);
    if (dh) {
      const prev = deptHeadMap.get(dh.team)!;
      deptHeadMap.set(dh.team, { count: prev.count + 1, name: r.name, items: [...prev.items, r] });
    }
  });
  const deptHeadData = [...deptHeadMap.entries()].map(([team, { count, name, items }]) => ({ team, count, name, items }));

  // 1등급 중 부서장 입회 비율
  const grade1Records = records.filter(r => extractGrade(r.department) === "1등급");
  const grade1WithDeptHead = grade1Records.filter(r => getDeptHead(r.name) !== null);
  const grade1DeptHeadRatio = grade1Records.length > 0 ? (grade1WithDeptHead.length / grade1Records.length) * 100 : 0;

  // 부서장 주별/월별 추이
  const deptHeadWeeklyData = (() => {
    const weekSet = new Set<number>();
    deptHeadRecords.forEach(r => { if (r.weekNum) weekSet.add(r.weekNum); });
    const year = deptHeadRecords.find(r => r.weekNum !== null)?.year ?? new Date().getFullYear();
    return [...weekSet].sort((a, b) => a - b).map(w => {
      const entry: Record<string, any> = { period: getWeekLabel(year, w) };
      let total = 0;
      DEPT_HEADS.forEach(d => {
        const cnt = deptHeadRecords.filter(r => r.weekNum === w && getDeptHead(r.name)?.prefix === d.prefix).length;
        entry[d.team] = cnt;
        total += cnt;
      });
      entry._total = total;
      return entry;
    });
  })();

  const deptHeadMonthlyData = (() => {
    const monthSet = new Set<number>();
    deptHeadRecords.forEach(r => { if (r.month) monthSet.add(r.month); });
    return [...monthSet].sort((a, b) => a - b).map(m => {
      const entry: Record<string, any> = { period: `${m}월` };
      let total = 0;
      DEPT_HEADS.forEach(d => {
        const cnt = deptHeadRecords.filter(r => r.month === m && getDeptHead(r.name)?.prefix === d.prefix).length;
        entry[d.team] = cnt;
        total += cnt;
      });
      entry._total = total;
      return entry;
    });
  })();

  const deptHeadTrendData = trendView === "weekly" ? deptHeadWeeklyData : deptHeadMonthlyData;

  const beforeInspection = stageMap.get("점검전") || 0;
  const waitApproval = [...stageMap.entries()].filter(([k]) => k.includes("결재대기")).reduce((s, [, v]) => s + v, 0);
  const completed = (stageMap.get("승인완료") || 0) + (stageMap.get("자동종결") || 0);
  const grade1Count = gradeMap.get("1등급") || 0;

  return (
    <div className="space-y-5">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><ClipboardList className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">총 점검 건수</p>
                <p className="text-2xl font-bold">{total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg"><AlertCircle className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">점검전</p>
                <p className="text-2xl font-bold">{beforeInspection}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg"><Calendar className="h-5 w-5 text-amber-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">결재대기</p>
                <p className="text-2xl font-bold">{waitApproval}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg"><ShieldCheck className="h-5 w-5 text-red-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">1등급 고위험</p>
                <p className="text-2xl font-bold">{grade1Count}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 단계별 + 안전등급별 + 날짜별 차트 — 한 줄 5분할 */}
      <div className="grid lg:grid-cols-5 gap-4">
        <Card className="lg:col-span-1">
          <CardHeader className="pb-2 pt-3 px-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold">순회점검 단계별 현황</CardTitle>
              <span className="text-[11px] font-bold text-foreground">총 <span className="text-blue-600">{total}</span>건</span>
            </div>
          </CardHeader>
          <CardContent className="px-4 pt-3 pb-4">
            {stageData.length === 0 ? (
              <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">데이터 없음</div>
            ) : (
              <div className="space-y-2.5">
                {stageData.map(({ stage, count, color }) => (
                  <div key={stage} className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-medium truncate max-w-[110px]" title={stage}>{stage}</span>
                      <span className="text-muted-foreground shrink-0 tabular-nums">{count}건 <span className="text-[10px]">({((count/total)*100).toFixed(0)}%)</span></span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${(count/total)*100}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-1">
          <CardHeader className="pb-2 pt-3 px-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold">안전등급별 현황</CardTitle>
              <span className="text-[11px] font-bold text-foreground">총 <span className="text-emerald-600">{gradeData.reduce((s, g) => s + g.count, 0)}</span>건</span>
            </div>
          </CardHeader>
          <CardContent className="px-3 pt-2 pb-3">
            {gradeData.length === 0 ? (
              <div className="h-28 flex items-center justify-center text-xs text-muted-foreground">데이터 없음</div>
            ) : (
              <div className="flex items-center gap-2">
                <ResponsiveContainer width="52%" height={110}>
                  <PieChart>
                    <Pie data={gradeData} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={48} innerRadius={24}>
                      {gradeData.map(({ color }, i) => <Cell key={i} fill={color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, name: any) => [`${v}건`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5 flex-1">
                  {gradeData.map(({ grade, count, color }) => (
                    <div key={grade} className="flex items-center gap-1.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-[11px] font-medium flex-1">{grade}</span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">{count}건</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {dateData.length > 0 && (
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2 pt-3 px-4 border-b">
            <div className="flex items-center justify-between">
              <CardTitle className="text-xs font-semibold">날짜별 작업 건수</CardTitle>
              <span className="text-[11px] font-bold text-foreground">총 <span className="text-violet-600">{dateData.reduce((s, d) => s + d.count, 0)}</span>건 · <span className="text-muted-foreground font-normal">{dateData.length}일</span></span>
            </div>
          </CardHeader>
          <CardContent className="px-2 pt-1 pb-3">
            <ResponsiveContainer width="100%" height={148}>
              <BarChart data={dateData} margin={{ top: 18, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={20} />
                <Tooltip formatter={(v: any) => [`${v}건`, "건수"]} contentStyle={{ fontSize: 11, borderRadius: 8 }} />
                <Bar dataKey="count" fill="#7C3AED" radius={[3, 3, 0, 0]}>
                  <LabelList dataKey="count" position="top" style={{ fontSize: 10, fontWeight: 700, fill: "#4B5563" }} formatter={(v: any) => `${v}`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
        )}
      </div>

      {/* 부서장 입회 현황 + 추이 (통합 카드) */}
      {records.length > 0 && (
        <Card className="overflow-hidden border-purple-200/60 dark:border-purple-800/40 shadow-sm">
          <CardHeader className="py-2.5 px-4 bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-950/30 dark:to-violet-950/20 border-b border-purple-100 dark:border-purple-800/30">
            <div className="flex items-center gap-2 flex-wrap">
              <div className="p-1.5 bg-purple-100 dark:bg-purple-900/40 rounded-md">
                <UserCheck className="h-4 w-4 text-purple-600" />
              </div>
              <CardTitle className="text-sm font-semibold">부서장 입회 현황</CardTitle>
              {grade1Records.length > 0 && (
                <div className="flex items-center gap-1.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/40 rounded-lg px-2.5 py-1">
                  <span className="text-[11px] text-amber-700 dark:text-amber-300 font-medium">1등급 입회율</span>
                  <span className="text-[11px] font-bold text-amber-800 dark:text-amber-200">{grade1WithDeptHead.length}/{grade1Records.length}건</span>
                  <span className="inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[11px] font-bold"
                    style={{
                      backgroundColor: grade1DeptHeadRatio >= 80 ? "#22c55e22" : grade1DeptHeadRatio >= 50 ? "#f59e0b22" : "#ef444422",
                      color: grade1DeptHeadRatio >= 80 ? "#16a34a" : grade1DeptHeadRatio >= 50 ? "#d97706" : "#dc2626",
                    }}>
                    {grade1DeptHeadRatio.toFixed(1)}%
                  </span>
                </div>
              )}
            </div>
          </CardHeader>
          <div className="grid lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x divide-purple-100/60 dark:divide-purple-800/30">
            {/* 왼쪽: 팀별 현황 테이블 */}
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="w-8 py-2"></TableHead>
                    <TableHead className="py-2 text-xs w-28">팀</TableHead>
                    <TableHead className="py-2 text-xs">부서장</TableHead>
                    <TableHead className="py-2 text-xs text-right">건수</TableHead>
                    <TableHead className="py-2 text-xs w-40">비율</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deptHeadData.map(({ team, count, name, items }) => {
                    const pct = deptHeadRecords.length > 0 ? (count / deptHeadRecords.length) * 100 : 0;
                    const isExpanded = expandedTeam === team;
                    return (
                      <Fragment key={team}>
                        <TableRow
                          className={count > 0 ? "cursor-pointer hover:bg-purple-50/50 dark:hover:bg-purple-950/20" : "opacity-50"}
                          onClick={() => count > 0 && setExpandedTeam(isExpanded ? null : team)}
                        >
                          <TableCell className="pr-0 py-2">
                            {count > 0 ? (
                              isExpanded
                                ? <ChevronDown className="h-3.5 w-3.5 text-purple-400" />
                                : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : null}
                          </TableCell>
                          <TableCell className="font-medium text-xs py-2">{team}</TableCell>
                          <TableCell className="text-xs text-muted-foreground py-2">{name}</TableCell>
                          <TableCell className="text-right py-2">
                            <Badge variant={count > 0 ? "default" : "outline"} className={`text-xs ${count > 0 ? "bg-purple-600 hover:bg-purple-600" : ""}`}>{count}</Badge>
                          </TableCell>
                          <TableCell className="py-2">
                            <div className="flex items-center gap-1.5">
                              <div className="h-1.5 bg-muted rounded-full overflow-hidden flex-1">
                                <div className="h-full rounded-full bg-purple-500 transition-all duration-500" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-[10px] text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                        </TableRow>
                        {isExpanded && items.map(r => {
                          const grade = extractGrade(r.department);
                          const gradeColor = GRADE_COLORS[grade] || "#9CA3AF";
                          const stageColor = STAGE_COLORS[r.attendanceType || ""] || "#9CA3AF";
                          return (
                            <TableRow key={r.id} className="bg-purple-50/60 dark:bg-purple-950/20 hover:bg-purple-50 dark:hover:bg-purple-950/30">
                              <TableCell className="py-2" />
                              <TableCell className="text-[10px] text-muted-foreground whitespace-nowrap pl-3 py-2">{r.attendanceDate}</TableCell>
                              <TableCell className="py-2 text-[10px] font-semibold text-foreground">{r.name}</TableCell>
                              <TableCell className="py-2 max-w-[130px]">
                                <div className="flex flex-col gap-0.5">
                                  <span className="truncate text-[10px] text-purple-700 dark:text-purple-300 font-medium" title={r.stationName || ""}>{r.stationName || "-"}</span>
                                  {r.department && <span className="truncate text-[9px] text-muted-foreground" title={r.department}>{r.department}</span>}
                                </div>
                              </TableCell>
                              <TableCell className="py-2">
                                <div className="flex flex-col gap-0.5">
                                  <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                                    <span className="inline-block w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: gradeColor }} />
                                    {grade}
                                  </span>
                                  <Badge style={{ backgroundColor: stageColor + "22", color: stageColor, borderColor: stageColor + "55" }} variant="outline" className="text-[10px] h-4 px-1 py-0 w-fit">
                                    {r.attendanceType || "-"}
                                  </Badge>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* 오른쪽: 기간별 추이 차트 */}
            <div className="flex flex-col bg-gradient-to-br from-slate-50 to-purple-50/30 dark:from-slate-900/40 dark:to-purple-950/10">
              {/* 패널 헤더 */}
              <div className="flex items-center justify-between px-4 pt-3 pb-2 border-b border-purple-100/60 dark:border-purple-800/20">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-xs font-semibold text-purple-700 dark:text-purple-300">기간별 추이</span>
                </div>
                <div className="flex gap-0.5 bg-white/70 dark:bg-zinc-800/70 border border-purple-100 dark:border-purple-800/40 rounded-lg p-0.5 shadow-sm">
                  <button
                    onClick={() => setTrendView("weekly")}
                    className={`h-6 px-3 text-[11px] font-medium rounded-md transition-all ${trendView === "weekly" ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >주별</button>
                  <button
                    onClick={() => setTrendView("monthly")}
                    className={`h-6 px-3 text-[11px] font-medium rounded-md transition-all ${trendView === "monthly" ? "bg-purple-600 text-white shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >월별</button>
                </div>
              </div>
              <div className="p-3 flex flex-col gap-1 flex-1">
              {deptHeadTrendData.length === 0 ? (
                <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-sm text-muted-foreground gap-2">
                  <TrendingUp className="h-8 w-8 text-muted-foreground/30" />
                  <span>추이 데이터 없음</span>
                </div>
              ) : trendView === "monthly" ? (() => {
                /* ── 월별: 팀 X축, 월은 우상단 ── */
                const months = deptHeadTrendData.map(d => d.period as string);
                const grandTotal = deptHeadTrendData.reduce((s, d) => s + (Number(d._total) || 0), 0);
                // 팀 기준 데이터 변환: { team: "구미", "5월": 3, ... }
                const teamBasedData = DEPT_HEADS.map(d => {
                  const entry: Record<string, any> = { team: d.team.replace("운용팀", ""), fullTeam: d.team };
                  months.forEach(m => {
                    const row = deptHeadTrendData.find(r => r.period === m);
                    entry[m] = row ? (row[d.team] || 0) : 0;
                  });
                  entry._total = months.reduce((s, m) => s + (entry[m] || 0), 0);
                  return entry;
                }).filter(e => e._total > 0);
                const MONTH_COLORS = ["#7C3AED", "#2563EB", "#059669", "#D97706", "#DC2626"];
                return (
                  <div className="flex flex-col gap-1 h-full">
                    {/* 헤더: 합계(좌) + 월(우) */}
                    <div className="flex items-center justify-between px-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-muted-foreground">전체 합계</span>
                        <span className="text-base font-bold text-purple-600">{grandTotal}건</span>
                      </div>
                      <div className="flex items-center gap-1">
                        {months.map((m, i) => (
                          <span key={m} className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-white text-[10px] font-semibold" style={{ backgroundColor: MONTH_COLORS[i % MONTH_COLORS.length] }}>
                            {m}
                          </span>
                        ))}
                      </div>
                    </div>
                    {/* 그룹 세로 막대 — X축: 부서명 */}
                    <ResponsiveContainer width="100%" height={258}>
                      <BarChart data={teamBasedData} margin={{ top: 22, right: 8, left: -8, bottom: 4 }} barCategoryGap="20%" barGap={3}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                        <XAxis dataKey="team" tick={{ fontSize: 11, fill: "#2563EB", fontWeight: 700 }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
                        <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={24} />
                        <Tooltip
                          cursor={{ fill: "rgba(147,51,234,0.04)" }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const tot = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                            return (
                              <div className="bg-white dark:bg-zinc-800 border border-border rounded-xl shadow-lg p-3 min-w-[130px]">
                                <p className="text-xs font-semibold mb-2 pb-1.5 border-b border-border">{label}운용팀 · 합계 <span className="text-purple-600">{tot}건</span></p>
                                <div className="space-y-1">
                                  {payload.filter(p => Number(p.value) > 0).map(p => (
                                    <div key={p.dataKey as string} className="flex items-center justify-between gap-3">
                                      <div className="flex items-center gap-1.5">
                                        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: p.fill as string }} />
                                        <span className="text-[11px] text-muted-foreground">{p.dataKey as string}</span>
                                      </div>
                                      <span className="text-[11px] font-medium tabular-nums">{p.value}건</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            );
                          }}
                        />
                        {months.map((m, i) => {
                          const barColor = MONTH_COLORS[i % MONTH_COLORS.length];
                          return (
                            <Bar key={m} dataKey={m} fill={barColor} name={m} radius={[4, 4, 0, 0]} maxBarSize={32}>
                              <LabelList
                                dataKey={m}
                                content={(props: any) => {
                                  const { x, y, width, value } = props;
                                  if (!value || Number(value) < 1) return null;
                                  const cx = Number(x) + Number(width) / 2;
                                  return (
                                    <g style={{ pointerEvents: "none" }}>
                                      <rect x={cx - 12} y={Number(y) - 17} width={24} height={14} rx={3} fill={barColor} opacity={0.15} />
                                      <text x={cx} y={Number(y) - 10} fill={barColor} fontSize={10} fontWeight={800} textAnchor="middle" dominantBaseline="middle">
                                        {value}건
                                      </text>
                                    </g>
                                  );
                                }}
                              />
                            </Bar>
                          );
                        })}
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                );
              })() : (
                /* ── 주별: 누적 막대 ── */
                <>
                  <div className="flex items-center justify-end gap-1 px-1 pb-0.5">
                    <span className="text-[11px] text-muted-foreground">전체 합계</span>
                    <span className="text-sm font-bold text-purple-600">{deptHeadTrendData.reduce((s, d) => s + (Number(d._total) || 0), 0)}건</span>
                  </div>
                  <ResponsiveContainer width="100%" height={268}>
                    <BarChart data={deptHeadTrendData} margin={{ top: 24, right: 12, left: -4, bottom: 4 }} barCategoryGap="30%">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.06)" vertical={false} />
                      <XAxis dataKey="period" tick={{ fontSize: 12, fill: "#6B7280", fontWeight: 500 }} axisLine={{ stroke: "#E5E7EB" }} tickLine={false} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#9CA3AF" }} axisLine={false} tickLine={false} width={24} />
                      <Tooltip
                        cursor={{ fill: "rgba(147,51,234,0.05)" }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          const total = payload.reduce((s, p) => s + (Number(p.value) || 0), 0);
                          return (
                            <div className="bg-white dark:bg-zinc-800 border border-border rounded-xl shadow-lg p-3 min-w-[160px]">
                              <p className="text-xs font-semibold text-foreground mb-2 pb-1.5 border-b border-border">{label} · 합계 <span className="text-purple-600">{total}건</span></p>
                              <div className="space-y-1">
                                {[...payload].reverse().map(p => Number(p.value) > 0 && (
                                  <div key={p.dataKey as string} className="flex items-center justify-between gap-3">
                                    <div className="flex items-center gap-1.5">
                                      <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: p.fill as string }} />
                                      <span className="text-[11px] text-muted-foreground">{p.dataKey}</span>
                                    </div>
                                    <span className="text-[11px] font-medium tabular-nums">{p.value}건</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }}
                      />
                      {DEPT_HEADS.map((d, i) => {
                        const teamShort = d.team.replace("운용팀", "");
                        const color = DEPT_HEAD_COLORS[d.team] ?? COLORS[i % COLORS.length];
                        return (
                          <Bar key={d.team} dataKey={d.team} stackId="a" fill={color} name={d.team} radius={i === DEPT_HEADS.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}>
                            <LabelList
                              dataKey={d.team}
                              content={(props: any) => {
                                const { x, y, width, height, value } = props;
                                if (!value || Number(value) < 1 || Number(height) < 18 || Number(width) < 22) return null;
                                const cx = Number(x) + Number(width) / 2;
                                const cy = Number(y) + Number(height) / 2;
                                const showTeam = Number(height) >= 26;
                                return (
                                  <g style={{ pointerEvents: "none" }}>
                                    {showTeam && <text x={cx} y={cy - 6} fill="#BFDBFE" fontSize={9} fontWeight={700} textAnchor="middle" dominantBaseline="middle">{teamShort}</text>}
                                    <text x={cx} y={showTeam ? cy + 6 : cy} fill="rgba(255,255,255,0.92)" fontSize={showTeam ? 8 : 9} fontWeight={700} textAnchor="middle" dominantBaseline="middle">{value}건</text>
                                  </g>
                                );
                              }}
                            />
                          </Bar>
                        );
                      })}
                      <Bar dataKey="_total" stackId="b" fill="transparent" legendType="none" isAnimationActive={false}>
                        <LabelList
                          dataKey="_total"
                          content={(props: any) => {
                            const { x, y, width, value } = props;
                            if (!value || Number(value) < 1) return null;
                            const cx = Number(x) + Number(width) / 2;
                            return (
                              <g style={{ pointerEvents: "none" }}>
                                <rect x={cx - 16} y={Number(y) - 18} width={32} height={15} rx={3} fill="#7C3AED" opacity={0.12} />
                                <text x={cx} y={Number(y) - 11} fill="#5B21B6" fontSize={11} fontWeight={800} textAnchor="middle" dominantBaseline="middle">
                                  {value}건
                                </text>
                              </g>
                            );
                          }}
                        />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              )}
              </div>
            </div>
          </div>
        </Card>
      )}

      {/* 1등급 미입회 사유 관리 */}
      {(() => {
        const grade1NoHead = filteredRecords.filter(r =>
          extractGrade(r.department) === "1등급" && getDeptHead(r.name) === null
        );
        if (grade1NoHead.length === 0) return null;
        return (
          <Card className="overflow-hidden border-red-200/60 dark:border-red-800/40">
            <CardHeader className="pb-3 bg-gradient-to-r from-red-50 to-orange-50 dark:from-red-950/30 dark:to-orange-950/20 border-b border-red-100 dark:border-red-800/30">
              <CardTitle className="text-sm flex items-center gap-2">
                <div className="p-1.5 bg-red-100 dark:bg-red-900/40 rounded-md">
                  <AlertCircle className="h-4 w-4 text-red-600" />
                </div>
                <span>1등급 부서장 미입회 사유</span>
                <Badge className="bg-red-500 hover:bg-red-500 text-white text-xs">{grade1NoHead.length}건</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableHead className="py-2 text-xs">날짜</TableHead>
                    <TableHead className="py-2 text-xs">점검자</TableHead>
                    <TableHead className="py-2 text-xs">국사명</TableHead>
                    <TableHead className="py-2 text-xs">공사내용</TableHead>
                    <TableHead className="py-2 text-xs">미입회 사유</TableHead>
                    <TableHead className="py-2 text-xs w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {grade1NoHead.map(r => {
                    const savedReason = r.absenceReason || "";
                    const draft = reasonDraft[r.id] ?? savedReason;
                    const isDirty = draft !== savedReason;
                    const isSaving = reasonSaving[r.id];
                    return (
                      <TableRow key={r.id} className={savedReason ? "bg-green-50/30 dark:bg-green-950/10" : "bg-red-50/30 dark:bg-red-950/10"}>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">{r.attendanceDate}</TableCell>
                        <TableCell className="text-xs font-medium py-2">{r.name}</TableCell>
                        <TableCell className="text-xs font-medium py-2 whitespace-nowrap">{r.stationName || "-"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground py-2 max-w-[200px]">
                          <span className="truncate block" title={r.department || ""}>{r.department || "-"}</span>
                        </TableCell>
                        <TableCell className="py-1.5 min-w-[220px]">
                          <Textarea
                            className="text-xs min-h-[36px] h-9 resize-none py-1.5 px-2 leading-tight"
                            placeholder="미입회 사유를 입력하세요..."
                            value={draft}
                            onChange={e => setReasonDraft(prev => ({ ...prev, [r.id]: e.target.value }))}
                            rows={1}
                          />
                        </TableCell>
                        <TableCell className="py-1.5 text-right">
                          {savedReason && !isDirty ? (
                            <span className="text-[10px] text-green-600 font-medium">저장됨</span>
                          ) : (
                            <Button
                              size="sm"
                              className="h-7 text-xs px-2.5"
                              disabled={!isDirty || isSaving}
                              onClick={async () => {
                                setReasonSaving(prev => ({ ...prev, [r.id]: true }));
                                try {
                                  await saveReasonMutation.mutateAsync({ id: r.id, absenceReason: draft });
                                  setReasonDraft(prev => { const n = { ...prev }; delete n[r.id]; return n; });
                                } finally {
                                  setReasonSaving(prev => ({ ...prev, [r.id]: false }));
                                }
                              }}
                            >
                              {isSaving ? "저장중..." : "저장"}
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        );
      })()}

      {/* 전체 상세 테이블 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>전체 점검 목록</span>
            <Badge variant="secondary">{total}건</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky top-0 bg-background">작업일자</TableHead>
                  <TableHead className="sticky top-0 bg-background">순회점검대상자</TableHead>
                  <TableHead className="sticky top-0 bg-background">작업자(소속)</TableHead>
                  <TableHead className="sticky top-0 bg-background">안전등급</TableHead>
                  <TableHead className="sticky top-0 bg-background">공사내용</TableHead>
                  <TableHead className="sticky top-0 bg-background">점검단계</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm whitespace-nowrap">{r.attendanceDate}</TableCell>
                    <TableCell className="font-medium whitespace-nowrap">{r.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate" title={r.company || ""}>{r.company || "-"}</TableCell>
                    <TableCell>
                      {(() => {
                        const g = extractGrade(r.department);
                        const color = GRADE_COLORS[g] || "#9CA3AF";
                        return <Badge style={{ backgroundColor: color + "22", color, borderColor: color + "44" }} variant="outline">{g}</Badge>;
                      })()}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate" title={r.department || ""}>{r.department || "-"}</TableCell>
                    <TableCell>
                      {r.attendanceType && (
                        <Badge style={{ backgroundColor: (STAGE_COLORS[r.attendanceType] || "#9CA3AF") + "22", color: STAGE_COLORS[r.attendanceType] || "#9CA3AF", borderColor: (STAGE_COLORS[r.attendanceType] || "#9CA3AF") + "44" }} variant="outline">
                          {r.attendanceType}
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── 기간별 추이 탭 ─────────────────────────────────────────
function TrendContent({ records, viewMode, setViewMode, selectedYear, setSelectedYear, selectedMonth, setSelectedMonth, selectedWeek, setSelectedWeek, years, months, weekNums }: {
  records: AttendanceRecord[];
  viewMode: "weekly" | "monthly";
  setViewMode: (v: "weekly" | "monthly") => void;
  selectedYear: number;
  setSelectedYear: (v: number) => void;
  selectedMonth: number;
  setSelectedMonth: (v: number) => void;
  selectedWeek: number;
  setSelectedWeek: (v: number) => void;
  years: number[];
  months: number[];
  weekNums: number[];
}) {
  const filtered = records.filter(r => {
    if (viewMode === "weekly") return r.year === selectedYear && r.weekNum === selectedWeek;
    return r.year === selectedYear && r.month === selectedMonth;
  });

  const weekMap = new Map<number, number>();
  records.filter(r => r.year === selectedYear).forEach(r => {
    if (r.weekNum) weekMap.set(r.weekNum, (weekMap.get(r.weekNum) || 0) + 1);
  });
  const byWeek = [...weekMap.entries()].sort(([a], [b]) => a - b).map(([w, c]) => ({ label: getWeekLabel(selectedYear, w), count: c }));

  const monthMap = new Map<number, number>();
  records.filter(r => r.year === selectedYear).forEach(r => {
    if (r.month) monthMap.set(r.month, (monthMap.get(r.month) || 0) + 1);
  });
  const byMonth = [...monthMap.entries()].sort(([a], [b]) => a - b).map(([m, c]) => ({ label: `${m}월`, count: c }));

  const trendData = viewMode === "weekly" ? byWeek : byMonth;

  const label = viewMode === "weekly"
    ? `${selectedYear}년 ${getWeekLabel(selectedYear, selectedWeek)}`
    : `${selectedYear}년 ${selectedMonth}월`;

  // 전체 담당자별 집계
  const allInspMap = new Map<string, number>();
  records.forEach(r => { allInspMap.set(r.name, (allInspMap.get(r.name) || 0) + 1); });
  const allInspData = [...allInspMap.entries()].sort(([, a], [, b]) => b - a).map(([name, count]) => ({ name, count }));
  const allTotal = records.length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <Tabs value={viewMode} onValueChange={v => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="weekly">주별</TabsTrigger>
            <TabsTrigger value="monthly">월별</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <Select value={String(selectedYear)} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{years.map(y => <SelectItem key={y} value={String(y)}>{y}년</SelectItem>)}</SelectContent>
          </Select>
          {viewMode === "weekly" ? (
            <Select value={String(selectedWeek)} onValueChange={v => setSelectedWeek(Number(v))}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>{weekNums.map(w => <SelectItem key={w} value={String(w)}>{getWeekLabel(selectedYear, w)}</SelectItem>)}</SelectContent>
            </Select>
          ) : (
            <Select value={String(selectedMonth)} onValueChange={v => setSelectedMonth(Number(v))}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>{months.map(m => <SelectItem key={m} value={String(m)}>{m}월</SelectItem>)}</SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        {/* 기간별 담당자 건수 차트 */}
        <Card className="overflow-hidden border-violet-200/60 dark:border-violet-800/40 shadow-sm">
          <CardHeader className="py-2.5 px-4 bg-gradient-to-r from-violet-50 to-purple-50 dark:from-violet-950/30 dark:to-purple-950/20 border-b border-violet-100 dark:border-violet-800/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-violet-900 dark:text-violet-200 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-violet-500" />
                {label} 담당자별 건수
              </CardTitle>
              <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300 text-xs border-0">
                {filtered.length}건
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {filtered.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">해당 기간 기록 없음</div>
            ) : (() => {
              const pm = new Map<string, number>();
              filtered.forEach(r => pm.set(r.name, (pm.get(r.name) || 0) + 1));
              const pData = [...pm.entries()].sort(([, a], [, b]) => b - a).map(([name, count]) => ({ name, count }));
              return (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={pData} layout="vertical" margin={{ left: 4, right: 40, top: 2, bottom: 2 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="name" width={70} axisLine={false} tickLine={false}
                      tick={({ x, y, payload }: any) => (
                        <text x={x} y={y} dy={4} textAnchor="end" fontSize={12}
                          fontWeight={getDeptHead(payload.value) !== null ? 700 : 500}
                          fill={getDeptHead(payload.value) !== null ? "#2563EB" : "#334155"}>
                          {payload.value}
                        </text>
                      )}
                    />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                      formatter={(v: any) => [`${v}건`, "건수"]}
                    />
                    <Bar dataKey="count" radius={[0, 6, 6, 0]} maxBarSize={26}>
                      {pData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 700, fill: "#475569" }} formatter={(v: any) => `${v}건`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>

        {/* 전체 추이 차트 */}
        <Card className="overflow-hidden border-sky-200/60 dark:border-sky-800/40 shadow-sm">
          <CardHeader className="py-2.5 px-4 bg-gradient-to-r from-sky-50 to-blue-50 dark:from-sky-950/30 dark:to-blue-950/20 border-b border-sky-100 dark:border-sky-800/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-sky-900 dark:text-sky-200 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-sky-500" />
                {viewMode === "weekly" ? "주별" : "월별"} 전체 추이
              </CardTitle>
              <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300 text-xs border-0">
                {trendData.length}개 구간
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trendData} margin={{ left: 0, right: 8, top: 4, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, fontSize: 12, border: "1px solid #e2e8f0", boxShadow: "0 4px 12px rgba(0,0,0,0.08)" }}
                    formatter={(v: any) => [`${v}건`, "건수"]}
                  />
                  <Bar dataKey="count" fill="#38BDF8" radius={[6, 6, 0, 0]} maxBarSize={40}>
                    <LabelList dataKey="count" position="top" style={{ fontSize: 10, fontWeight: 700, fill: "#0369a1" }} formatter={(v: any) => v > 0 ? `${v}` : ""} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 담당자별 현황 + 요약 — 차트와 목록 사이 */}
      {allInspData.length > 0 && (
        <Card className="overflow-hidden border-blue-200/60 dark:border-blue-800/40 shadow-sm">
          <CardHeader className="py-2.5 px-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/20 border-b border-blue-100 dark:border-blue-800/30">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-2">
                <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                순회점검 담당자별 현황
              </CardTitle>
              <div className="flex items-center gap-2">
                <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300 text-xs border-0">{allInspData.length}명</Badge>
                <Badge className="bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300 text-xs border-0">총 {allTotal}건</Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {(() => {
              const top = allInspData.slice(0, 10);
              const maxCount = top[0]?.count || 1;
              const medalColors = ["#F59E0B", "#94A3B8", "#CD7F32"];
              return (
                <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                  {top.map((p, i) => {
                    const pct = allTotal > 0 ? (p.count / allTotal) * 100 : 0;
                    const barWidth = (p.count / maxCount) * 100;
                    const isMedal = i < 3;
                    const color = COLORS[i % COLORS.length];
                    return (
                      <div key={i} className="flex items-center gap-2.5">
                        {/* 순위 배지 */}
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={isMedal
                            ? { backgroundColor: medalColors[i] + "22", color: medalColors[i], border: `1px solid ${medalColors[i]}55` }
                            : { backgroundColor: "#f1f5f9", color: "#94a3b8", border: "1px solid #e2e8f0" }}
                        >
                          {i + 1}
                        </div>
                        {/* 이름 + 바 + 건수·비율 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold truncate" style={getDeptHead(p.name) !== null ? { color: "#2563EB", fontWeight: 700 } : undefined}>{p.name}</span>
                            <div className="flex items-center gap-1 ml-2 shrink-0">
                              <span className="text-[11px] font-bold" style={{ color }}>{p.count}건</span>
                              <span className="text-[10px] text-muted-foreground">·</span>
                              <span className="text-[10px] text-muted-foreground">{pct.toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${barWidth}%`, backgroundColor: color }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>{label} 목록</span>
            <Badge variant="secondary">{filtered.length}건</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">해당 기간 기록이 없습니다</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead>작업자(소속)</TableHead>
                    <TableHead>안전등급</TableHead>
                    <TableHead>점검단계</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.attendanceDate}</TableCell>
                      <TableCell className="font-medium" style={getDeptHead(r.name) !== null ? { color: "#2563EB", fontWeight: 700 } : undefined}>{r.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate">{r.company || "-"}</TableCell>
                      <TableCell>
                        {(() => {
                          const g = extractGrade(r.department);
                          const color = GRADE_COLORS[g] || "#9CA3AF";
                          return <Badge style={{ backgroundColor: color + "22", color, borderColor: color + "44" }} variant="outline">{g}</Badge>;
                        })()}
                      </TableCell>
                      <TableCell>
                        {r.attendanceType && (
                          <Badge style={{ backgroundColor: (STAGE_COLORS[r.attendanceType] || "#9CA3AF") + "22", color: STAGE_COLORS[r.attendanceType] || "#9CA3AF", borderColor: (STAGE_COLORS[r.attendanceType] || "#9CA3AF") + "44" }} variant="outline">
                            {r.attendanceType}
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
