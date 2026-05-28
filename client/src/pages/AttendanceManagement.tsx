import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from "recharts";
import { Upload, Trash2, Users, Calendar, TrendingUp, FileSpreadsheet, UserCheck, Download, ClipboardList, ShieldCheck, AlertCircle } from "lucide-react";

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
}

interface AttendanceUpload {
  id: number;
  fileName: string;
  totalCount: number;
  createdBy: string | null;
  createdAt: string;
}

const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#84CC16","#F97316","#6366F1"];

const STAGE_COLORS: Record<string, string> = {
  "점검전": "#EF4444",
  "1차결재대기": "#F59E0B",
  "2차결재대기": "#3B82F6",
  "승인완료": "#10B981",
  "자동종결": "#8B5CF6",
};

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
  return `${month}월 ${weekOfMonth}주차`;
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
  const total = records.length;

  // 단계별 집계
  const stageMap = new Map<string, number>();
  records.forEach(r => {
    const k = r.attendanceType || "미확인";
    stageMap.set(k, (stageMap.get(k) || 0) + 1);
  });
  const stageData = [...stageMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([stage, count]) => ({ stage, count, color: STAGE_COLORS[stage] || "#9CA3AF" }));

  // 안전등급별 집계
  const gradeMap = new Map<string, number>();
  records.forEach(r => {
    const g = extractGrade(r.department);
    gradeMap.set(g, (gradeMap.get(g) || 0) + 1);
  });
  const gradeData = [...gradeMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([grade, count]) => ({ grade, count, color: GRADE_COLORS[grade] || "#9CA3AF" }));

  // 담당자별 집계 (순회점검대상자)
  const inspMap = new Map<string, number>();
  records.forEach(r => { inspMap.set(r.name, (inspMap.get(r.name) || 0) + 1); });
  const inspData = [...inspMap.entries()]
    .sort(([, a], [, b]) => b - a)
    .map(([name, count]) => ({ name, count }));

  // 날짜별 집계
  const dateMap = new Map<string, number>();
  records.forEach(r => { dateMap.set(r.attendanceDate, (dateMap.get(r.attendanceDate) || 0) + 1); });
  const dateData = [...dateMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date: date.slice(5), count }));

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

      {/* 단계별 + 안전등급별 차트 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <span>순회점검 단계별 현황</span>
              <Badge variant="secondary">{stageData.length}단계</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stageData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <div className="space-y-3">
                {stageData.map(({ stage, count, color }) => (
                  <div key={stage} className="space-y-1">
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{stage}</span>
                      <span className="text-muted-foreground">{count}건 ({((count/total)*100).toFixed(1)}%)</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${(count/total)*100}%`, backgroundColor: color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">안전등급별 현황</CardTitle>
          </CardHeader>
          <CardContent>
            {gradeData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="55%" height={160}>
                  <PieChart>
                    <Pie data={gradeData} dataKey="count" nameKey="grade" cx="50%" cy="50%" outerRadius={68} innerRadius={36}>
                      {gradeData.map(({ color }, i) => <Cell key={i} fill={color} />)}
                    </Pie>
                    <Tooltip formatter={(v: any, name: any) => [`${v}건`, name]} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {gradeData.map(({ grade, count, color }) => (
                    <div key={grade} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                      <span className="text-sm font-medium">{grade}</span>
                      <span className="text-sm text-muted-foreground ml-auto">{count}건</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 날짜별 건수 차트 */}
      {dateData.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">날짜별 작업 건수</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={dateData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v}건`, "건수"]} />
                <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* 담당자별 현황 */}
      <div className="grid lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">순회점검 담당자별 현황</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(180, inspData.length * 34)}>
              <BarChart data={inspData.slice(0, 15)} layout="vertical" margin={{ left: 8, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={64} />
                <Tooltip formatter={(v: any) => [`${v}건`, "담당 건수"]} />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {inspData.slice(0, 15).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* 전체 목록 테이블 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>담당자별 요약</span>
              <Badge variant="secondary">{inspData.length}명</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">순위</TableHead>
                    <TableHead>담당자</TableHead>
                    <TableHead className="text-right">담당 건수</TableHead>
                    <TableHead className="text-right">비율</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {inspData.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Badge variant={i === 0 ? "default" : i < 3 ? "secondary" : "outline"}
                          className="w-6 h-6 rounded-full flex items-center justify-center p-0 text-xs">
                          {i + 1}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">{p.name}</TableCell>
                      <TableCell className="text-right"><Badge variant="secondary">{p.count}건</Badge></TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{((p.count / total) * 100).toFixed(1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

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
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{label} 담당자별 건수</CardTitle>
          </CardHeader>
          <CardContent>
            {filtered.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">해당 기간 기록 없음</div>
            ) : (() => {
              const pm = new Map<string, number>();
              filtered.forEach(r => pm.set(r.name, (pm.get(r.name) || 0) + 1));
              const pData = [...pm.entries()].sort(([, a], [, b]) => b - a).map(([name, count]) => ({ name, count }));
              return (
                <ResponsiveContainer width="100%" height={Math.max(180, pData.length * 36)}>
                  <BarChart data={pData} layout="vertical" margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={64} />
                    <Tooltip formatter={(v: any) => [`${v}건`, "건수"]} />
                    <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                      {pData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{viewMode === "weekly" ? "주별" : "월별"} 전체 추이</CardTitle>
          </CardHeader>
          <CardContent>
            {trendData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">데이터 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: any) => [`${v}건`, "건수"]} />
                  <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

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
                      <TableCell className="font-medium">{r.name}</TableCell>
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
