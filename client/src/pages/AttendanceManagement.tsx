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
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Upload, Trash2, Users, Calendar, TrendingUp, FileSpreadsheet, UserCheck } from "lucide-react";

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

interface AttendanceStats {
  total: number;
  byPerson: { name: string; company: string | null; count: number }[];
  byWeek: { label: string; count: number; weekNum: number; year: number }[];
  byMonth: { label: string; count: number; month: number; year: number }[];
}

const COLORS = ["#3B82F6","#10B981","#F59E0B","#EF4444","#8B5CF6","#06B6D4","#EC4899","#84CC16","#F97316","#6366F1"];

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

/** ISO 주차 번호로부터 해당 주의 월요일 날짜를 반환 */
function getMondayOfISOWeek(year: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dow = jan4.getUTCDay() || 7;
  return new Date(Date.UTC(year, 0, 4 - (dow - 1) + (isoWeek - 1) * 7));
}

/** ISO 주차를 "M월 N주차" 형식으로 변환 */
function getWeekLabel(year: number, isoWeek: number): string {
  const monday = getMondayOfISOWeek(year, isoWeek);
  const month = monday.getUTCMonth() + 1;
  const weekOfMonth = Math.ceil(monday.getUTCDate() / 7);
  return `${month}월 ${weekOfMonth}주차`;
}

export default function AttendanceManagement() {
  const { canEditAttendance } = usePermissions();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [viewMode, setViewMode] = useState<"weekly" | "monthly">("weekly");
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedWeek, setSelectedWeek] = useState(getISOWeek(now));

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
      toast({ title: `${data.count}건 입회 기록 등록 완료` });
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

  // 필터링된 기록
  const filtered = records.filter(r => {
    if (viewMode === "weekly") return r.year === selectedYear && r.weekNum === selectedWeek;
    return r.year === selectedYear && r.month === selectedMonth;
  });

  // 전체 통계
  const stats = computeStats(records, selectedYear, selectedMonth, selectedWeek, viewMode);

  const thisWeek = getISOWeek(now);
  const thisWeekCount = records.filter(r => r.year === currentYear && r.weekNum === thisWeek).length;
  const thisMonthCount = records.filter(r => r.year === currentYear && r.month === currentMonth).length;
  const topPerson = stats.byPerson[0];

  const years = Array.from({ length: 5 }, (_, i) => currentYear - i);
  const months = Array.from({ length: 12 }, (_, i) => i + 1);
  const weekNums = Array.from({ length: 53 }, (_, i) => i + 1);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <UserCheck className="h-6 w-6 text-primary" />
            입회 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">엑셀 파일 업로드로 입회 기록을 관리하세요</p>
        </div>
        {canEditAttendance && (
          <div>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadMutation.mutate(f); }} />
            <Button onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending} data-testid="button-upload-attendance">
              <Upload className="h-4 w-4 mr-2" />
              {uploadMutation.isPending ? "업로드 중..." : "엑셀 업로드"}
            </Button>
          </div>
        )}
      </div>

      {/* 상단 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">총 입회 건수</p>
                <p className="text-2xl font-bold">{records.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg"><Calendar className="h-5 w-5 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">이번 주</p>
                <p className="text-2xl font-bold">{thisWeekCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg"><Calendar className="h-5 w-5 text-purple-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">이번 달</p>
                <p className="text-2xl font-bold">{thisMonthCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg"><TrendingUp className="h-5 w-5 text-amber-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">최다 입회자</p>
                <p className="text-lg font-bold truncate">{topPerson?.name || "-"}</p>
                {topPerson && <p className="text-xs text-muted-foreground">{topPerson.count}회</p>}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 기간 선택 탭 */}
      <Tabs value={viewMode} onValueChange={v => setViewMode(v as any)}>
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <TabsList>
            <TabsTrigger value="weekly">주별</TabsTrigger>
            <TabsTrigger value="monthly">월별</TabsTrigger>
          </TabsList>
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

        <TabsContent value="weekly" className="mt-4 space-y-4">
          <PeriodContent records={filtered} allStats={stats} viewMode="weekly" label={`${selectedYear}년 ${getWeekLabel(selectedYear, selectedWeek)}`} />
        </TabsContent>
        <TabsContent value="monthly" className="mt-4 space-y-4">
          <PeriodContent records={filtered} allStats={stats} viewMode="monthly" label={`${selectedYear}년 ${selectedMonth}월`} />
        </TabsContent>
      </Tabs>

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
                      <p className="text-xs text-muted-foreground">{u.totalCount}건 · {new Date(u.createdAt).toLocaleDateString("ko-KR")}</p>
                    </div>
                  </div>
                  <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                    onClick={() => { if (confirm("이 업로드의 모든 기록이 삭제됩니다. 계속할까요?")) deleteUploadMutation.mutate(u.id); }}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function PeriodContent({ records, allStats, viewMode, label }: {
  records: AttendanceRecord[];
  allStats: AttendanceStats;
  viewMode: "weekly" | "monthly";
  label: string;
}) {
  // 기간 내 사람별 집계
  const personMap = new Map<string, { name: string; company: string | null; department: string | null; count: number; types: string[] }>();
  for (const r of records) {
    const key = r.name + (r.company || "");
    const ex = personMap.get(key);
    if (ex) { ex.count++; if (r.attendanceType) ex.types.push(r.attendanceType); }
    else personMap.set(key, { name: r.name, company: r.company, department: r.department, count: 1, types: r.attendanceType ? [r.attendanceType] : [] });
  }
  const persons = [...personMap.values()].sort((a, b) => b.count - a.count);

  // 추세 차트 데이터
  const trendData = viewMode === "weekly" ? allStats.byWeek : allStats.byMonth;

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        {/* 사람별 입회 횟수 차트 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{label} 인원별 입회 횟수</CardTitle>
          </CardHeader>
          <CardContent>
            {persons.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">해당 기간 입회 기록 없음</div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(180, persons.length * 36)}>
                <BarChart data={persons.slice(0, 15)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} width={72} />
                  <Tooltip formatter={(v) => [`${v}회`, "입회 횟수"]} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {persons.slice(0, 15).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* 추세 차트 */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{viewMode === "weekly" ? "주별" : "월별"} 입회 추세</CardTitle>
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
                  <Tooltip formatter={(v) => [`${v}건`, "입회 건수"]} />
                  <Bar dataKey="count" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 기간 내 기록 테이블 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>{label} 입회 기록</span>
            <Badge variant="secondary">{records.length}건</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {records.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">해당 기간 입회 기록이 없습니다</div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>날짜</TableHead>
                    <TableHead>이름</TableHead>
                    <TableHead>소속/업체</TableHead>
                    <TableHead>부서</TableHead>
                    <TableHead>입회 유형</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.attendanceDate}</TableCell>
                      <TableCell className="font-medium">{r.name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.company || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.department || "-"}</TableCell>
                      <TableCell>{r.attendanceType ? <Badge variant="outline">{r.attendanceType}</Badge> : "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 인원별 요약 */}
      {persons.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">인원별 입회 순위</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">순위</TableHead>
                  <TableHead>이름</TableHead>
                  <TableHead>소속</TableHead>
                  <TableHead>부서</TableHead>
                  <TableHead className="text-right">입회 횟수</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {persons.map((p, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <Badge variant={i === 0 ? "default" : i === 1 ? "secondary" : "outline"} className="w-7 h-7 rounded-full flex items-center justify-center p-0 text-xs">
                        {i + 1}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.company || "-"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.department || "-"}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{p.count}회</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function computeStats(records: AttendanceRecord[], year: number, month: number, weekNum: number, viewMode: string): AttendanceStats {
  const personMap = new Map<string, { name: string; company: string | null; count: number }>();
  for (const r of records) {
    const key = r.name + (r.company || "");
    const ex = personMap.get(key);
    if (ex) ex.count++;
    else personMap.set(key, { name: r.name, company: r.company, count: 1 });
  }
  const byPerson = [...personMap.values()].sort((a, b) => b.count - a.count);

  // 주별 집계 (현재 연도)
  const weekMap = new Map<number, number>();
  for (const r of records.filter(r => r.year === year)) {
    if (r.weekNum) weekMap.set(r.weekNum, (weekMap.get(r.weekNum) || 0) + 1);
  }
  const byWeek = [...weekMap.entries()].sort(([a], [b]) => a - b).map(([w, c]) => ({ label: getWeekLabel(year, w), count: c, weekNum: w, year }));

  // 월별 집계 (현재 연도)
  const monthMap = new Map<number, number>();
  for (const r of records.filter(r => r.year === year)) {
    if (r.month) monthMap.set(r.month, (monthMap.get(r.month) || 0) + 1);
  }
  const byMonth = [...monthMap.entries()].sort(([a], [b]) => a - b).map(([m, c]) => ({ label: `${m}월`, count: c, month: m, year }));

  return { total: records.length, byPerson, byWeek, byMonth };
}
