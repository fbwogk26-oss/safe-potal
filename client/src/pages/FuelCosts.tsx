import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import {
  Fuel, Upload, Trash2, TrendingUp, TrendingDown, Minus,
  Car, BarChart3, Database, RefreshCw, Search, ChevronUp, ChevronDown,
} from "lucide-react";
import type { FuelRecord } from "@shared/schema";

const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(Math.round(n));
const fmtM = (n: number) => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(0)}만`;
  return fmt(n);
};

const FUEL_COLORS: Record<string, string> = {
  경유: "#3b82f6",
  휘발유: "#f59e0b",
  EV: "#22c55e",
  기타: "#8b5cf6",
};
const TEAM_COLORS = [
  "#3b82f6", "#f59e0b", "#22c55e", "#ef4444", "#8b5cf6",
  "#06b6d4", "#f97316", "#ec4899", "#84cc16", "#14b8a6",
  "#a855f7", "#fb923c", "#64748b",
];

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

interface SummaryData {
  byYearMonth: { year: number; month: number; totalCost: number; totalDistance: number; fuelCost: number }[];
  byTeam: { team: string; totalCost: number; fuelCost: number; distance: number }[];
  byFuelType: { fuelType: string; totalCost: number; fuelCost: number; count: number }[];
  totals: { grand24: number; grand25: number; fuel24: number; fuel25: number; totalRecords: number };
}

interface Batch {
  batchId: string;
  uploadedAt: string;
  recordCount: number;
  yearMonths: string[];
}

function KpiCard({ title, value, sub, trend, icon: Icon, color = "blue" }: {
  title: string; value: string; sub?: string; trend?: number; icon: any; color?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
    green: "bg-green-50 dark:bg-green-950/30 text-green-600 dark:text-green-400",
    amber: "bg-amber-50 dark:bg-amber-950/30 text-amber-600 dark:text-amber-400",
    purple: "bg-purple-50 dark:bg-purple-950/30 text-purple-600 dark:text-purple-400",
  };
  return (
    <Card>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground mb-1">{title}</p>
            <p className="text-xl sm:text-2xl font-bold text-foreground truncate">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
            {trend !== undefined && (
              <div className={`flex items-center gap-1 mt-1 text-xs font-medium ${trend > 0 ? "text-red-500" : trend < 0 ? "text-blue-500" : "text-muted-foreground"}`}>
                {trend > 0 ? <TrendingUp className="w-3 h-3" /> : trend < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                {trend > 0 ? "+" : ""}{trend.toFixed(1)}% (24년 대비)
              </div>
            )}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${colorMap[color]}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function FuelCosts() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("dashboard");
  const [filterYear, setFilterYear] = useState<string>("all");
  const [filterMonth, setFilterMonth] = useState<string>("all");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterFuelType, setFilterFuelType] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortField, setSortField] = useState<string>("totalCost");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [deleteBatchId, setDeleteBatchId] = useState<string | null>(null);

  const { data: summary, isLoading: summaryLoading } = useQuery<SummaryData>({
    queryKey: ["/api/fuel-records/summary"],
  });

  const recordParams = new URLSearchParams();
  if (filterYear !== "all") recordParams.set("year", filterYear);
  if (filterMonth !== "all") recordParams.set("month", filterMonth);
  if (filterTeam !== "all") recordParams.set("team", filterTeam);
  if (filterFuelType !== "all") recordParams.set("fuelType", filterFuelType);

  const { data: records = [], isLoading: recordsLoading } = useQuery<FuelRecord[]>({
    queryKey: ["/api/fuel-records", filterYear, filterMonth, filterTeam, filterFuelType],
    queryFn: () => fetch(`/api/fuel-records?${recordParams.toString()}`, { credentials: "include" }).then(r => r.json()),
    enabled: tab === "detail",
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery<Batch[]>({
    queryKey: ["/api/fuel-records/batches"],
    enabled: tab === "upload",
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/fuel-records/upload", {
        method: "POST",
        body: form,
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "업로드 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records/batches"] });
    },
    onError: (e: Error) => toast({ title: "업로드 실패", description: e.message, variant: "destructive" }),
  });

  const deleteBatchMutation = useMutation({
    mutationFn: (batchId: string) => apiRequest("DELETE", `/api/fuel-records/batches/${encodeURIComponent(batchId)}`),
    onSuccess: () => {
      toast({ title: "삭제 완료" });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records/batches"] });
      setDeleteBatchId(null);
    },
    onError: (e: Error) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadMutation.mutate(file);
    e.target.value = "";
  };

  // 월별 추이 데이터 (24년 vs 25년)
  const trendData = MONTHS.map((label, i) => {
    const m = i + 1;
    const y24 = summary?.byYearMonth.find(d => d.year === 2024 && d.month === m);
    const y25 = summary?.byYearMonth.find(d => d.year === 2025 && d.month === m);
    return {
      month: label,
      "24년 유류비": y24 ? Math.round(y24.fuelCost / 10000) : null,
      "25년 유류비": y25 ? Math.round(y25.fuelCost / 10000) : null,
      "24년 합계": y24 ? Math.round(y24.totalCost / 10000) : null,
      "25년 합계": y25 ? Math.round(y25.totalCost / 10000) : null,
    };
  });

  // 팀별 바 차트 (필터: 연도)
  const teamData = (summary?.byTeam ?? []).map(t => ({
    team: t.team.replace("운용팀", "팀").replace("사업팀","사업"),
    유류비: Math.round(t.fuelCost / 10000),
    합계: Math.round(t.totalCost / 10000),
  }));

  // 파이 차트
  const pieData = (summary?.byFuelType ?? []).map(f => ({
    name: f.fuelType ?? "기타",
    value: f.fuelCost,
  }));

  // 전년 대비 계산
  const t = summary?.totals;
  const fuelTrend = t && t.fuel24 > 0 ? ((t.fuel25 - t.fuel24) / t.fuel24) * 100 : undefined;
  const totalTrend = t && t.grand24 > 0 ? ((t.grand25 - t.grand24) / t.grand24) * 100 : undefined;

  // 상세 테이블 필터링 + 정렬
  const filtered = records
    .filter(r => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (r.team ?? "").toLowerCase().includes(s)
        || (r.driver ?? "").toLowerCase().includes(s)
        || (r.licensePlate ?? "").toLowerCase().includes(s)
        || (r.modelName ?? "").toLowerCase().includes(s);
    })
    .sort((a, b) => {
      const av = (a as any)[sortField] ?? 0;
      const bv = (b as any)[sortField] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const SortIcon = ({ field }: { field: string }) =>
    sortField === field ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />) : null;

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };

  const hasData = (summary?.totals?.totalRecords ?? 0) > 0;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Fuel className="w-6 h-6 text-primary" />
            유류비 현황
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">업무용 차량 유류비 사용 현황 및 분석</p>
        </div>
        <Button
          data-testid="button-upload-fuel"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending}
          className="w-full sm:w-auto"
        >
          {uploadMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
          Excel 업로드
        </Button>
        <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} data-testid="input-fuel-file" />
      </div>

      {!hasData && !summaryLoading && (
        <Card className="border-dashed border-2">
          <CardContent className="flex flex-col items-center justify-center py-16 gap-4">
            <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
              <Fuel className="w-7 h-7 text-primary" />
            </div>
            <div className="text-center">
              <p className="font-semibold text-foreground">유류비 데이터가 없습니다</p>
              <p className="text-sm text-muted-foreground mt-1">Excel 파일을 업로드하면 자동으로 데이터가 분석됩니다</p>
            </div>
            <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
              <Upload className="w-4 h-4 mr-2" />
              Excel 파일 업로드
            </Button>
          </CardContent>
        </Card>
      )}

      {(hasData || summaryLoading) && (
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="grid w-full grid-cols-3 sm:w-auto sm:inline-flex">
            <TabsTrigger value="dashboard" data-testid="tab-dashboard">대시보드</TabsTrigger>
            <TabsTrigger value="detail" data-testid="tab-detail">상세 데이터</TabsTrigger>
            <TabsTrigger value="upload" data-testid="tab-upload">업로드 관리</TabsTrigger>
          </TabsList>

          {/* ===== 대시보드 탭 ===== */}
          <TabsContent value="dashboard" className="space-y-5 mt-4">
            {/* KPI 카드 */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                title="25년 유류비 합계"
                value={t ? `${fmtM(t.fuel25)}원` : "-"}
                sub={t ? `전체 비용 ${fmtM(t.grand25)}원` : ""}
                trend={fuelTrend}
                icon={Fuel}
                color="blue"
              />
              <KpiCard
                title="24년 유류비 합계"
                value={t ? `${fmtM(t.fuel24)}원` : "-"}
                sub={t ? `전체 비용 ${fmtM(t.grand24)}원` : ""}
                icon={BarChart3}
                color="amber"
              />
              <KpiCard
                title="25년 전체 비용"
                value={t ? `${fmtM(t.grand25)}원` : "-"}
                sub="유류비+통행료+주차비+수선비 등"
                trend={totalTrend}
                icon={TrendingUp}
                color="purple"
              />
              <KpiCard
                title="총 데이터 건수"
                value={t ? `${fmt(t.totalRecords)}건` : "-"}
                sub="업로드된 차량/월 데이터"
                icon={Database}
                color="green"
              />
            </div>

            {/* 월별 유류비 추이 차트 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">월별 유류비 추이 (만원)</CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={trendData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}만`} />
                    <Tooltip formatter={(v: any) => [`${fmt(v)}만원`]} />
                    <Legend />
                    <Line type="monotone" dataKey="24년 유류비" stroke="#94a3b8" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
                    <Line type="monotone" dataKey="25년 유류비" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 팀별 + 연료 타입 */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <Card className="lg:col-span-2">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">팀별 유류비 합계 (만원)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart data={teamData} layout="vertical" margin={{ top: 0, right: 20, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-30" />
                      <XAxis type="number" tick={{ fontSize: 10 }} tickFormatter={v => `${v}만`} />
                      <YAxis type="category" dataKey="team" tick={{ fontSize: 10 }} width={56} />
                      <Tooltip formatter={(v: any) => [`${fmt(v)}만원`]} />
                      <Legend />
                      <Bar dataKey="유류비" fill="#3b82f6" radius={[0, 3, 3, 0]} />
                      <Bar dataKey="합계" fill="#e2e8f0" radius={[0, 3, 3, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">연료 종류별 비율</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={180}>
                    <PieChart>
                      <Pie data={pieData} cx="50%" cy="50%" outerRadius={70} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                        {pieData.map((entry, i) => (
                          <Cell key={i} fill={FUEL_COLORS[entry.name] ?? TEAM_COLORS[i % TEAM_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${fmtM(v)}원`]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-2 mt-2 justify-center">
                    {pieData.map((entry, i) => (
                      <div key={i} className="flex items-center gap-1.5 text-xs">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: FUEL_COLORS[entry.name] ?? TEAM_COLORS[i] }} />
                        <span>{entry.name}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 팀별 상세 요약 테이블 */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">팀별 비용 요약</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">팀</TableHead>
                        <TableHead className="text-right">유류비</TableHead>
                        <TableHead className="text-right">전체 비용</TableHead>
                        <TableHead className="text-right">총주행거리</TableHead>
                        <TableHead className="text-right pr-4">km당 비용</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(summary?.byTeam ?? []).map((row, i) => {
                        const costPerKm = row.distance > 0 ? row.fuelCost / row.distance : 0;
                        return (
                          <TableRow key={i} data-testid={`row-team-${i}`}>
                            <TableCell className="font-medium pl-4">{row.team}</TableCell>
                            <TableCell className="text-right">{fmtM(row.fuelCost)}원</TableCell>
                            <TableCell className="text-right">{fmtM(row.totalCost)}원</TableCell>
                            <TableCell className="text-right">{fmt(row.distance)}km</TableCell>
                            <TableCell className="text-right pr-4">{costPerKm > 0 ? `${fmt(costPerKm)}원` : "-"}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== 상세 데이터 탭 ===== */}
          <TabsContent value="detail" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-28" data-testid="select-year">
                  <SelectValue placeholder="연도" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 연도</SelectItem>
                  <SelectItem value="2024">2024년</SelectItem>
                  <SelectItem value="2025">2025년</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-24" data-testid="select-month">
                  <SelectValue placeholder="월" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 월</SelectItem>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger className="w-36" data-testid="select-team">
                  <SelectValue placeholder="팀" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 팀</SelectItem>
                  {(summary?.byTeam ?? []).map(t => <SelectItem key={t.team} value={t.team}>{t.team}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterFuelType} onValueChange={setFilterFuelType}>
                <SelectTrigger className="w-28" data-testid="select-fuel-type">
                  <SelectValue placeholder="연료" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 연료</SelectItem>
                  <SelectItem value="경유">경유</SelectItem>
                  <SelectItem value="휘발유">휘발유</SelectItem>
                  <SelectItem value="EV">EV</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[160px]">
                <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input
                  data-testid="input-search"
                  placeholder="팀·사용자·차량번호·모델 검색"
                  className="pl-8"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  {recordsLoading ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground">
                      <RefreshCw className="w-5 h-5 animate-spin mr-2" /> 불러오는 중...
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                      데이터가 없습니다
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-4 whitespace-nowrap">연월</TableHead>
                          <TableHead className="whitespace-nowrap">팀</TableHead>
                          <TableHead className="whitespace-nowrap">사용자</TableHead>
                          <TableHead className="whitespace-nowrap">차량번호</TableHead>
                          <TableHead className="whitespace-nowrap">모델</TableHead>
                          <TableHead className="whitespace-nowrap">연료</TableHead>
                          <TableHead className="whitespace-nowrap">구입형태</TableHead>
                          <TableHead className="text-right whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => handleSort("totalDistance")}>
                            주행(km) <SortIcon field="totalDistance" />
                          </TableHead>
                          <TableHead className="text-right whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => handleSort("cardFuelCost")}>
                            법인카드유류비 <SortIcon field="cardFuelCost" />
                          </TableHead>
                          <TableHead className="text-right whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => handleSort("cashFuelCost")}>
                            현금유류비 <SortIcon field="cashFuelCost" />
                          </TableHead>
                          <TableHead className="text-right whitespace-nowrap cursor-pointer hover:text-foreground pr-4" onClick={() => handleSort("totalCost")}>
                            합계 <SortIcon field="totalCost" />
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.slice(0, 200).map((r) => (
                          <TableRow key={r.id} data-testid={`row-fuel-${r.id}`}>
                            <TableCell className="pl-4 whitespace-nowrap text-xs">{r.year}년 {r.month}월</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{r.team}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{r.driver || "-"}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs font-mono text-[11px]">{r.licensePlate}</TableCell>
                            <TableCell className="whitespace-nowrap text-xs">{r.modelName}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-[10px]" style={{ color: FUEL_COLORS[r.fuelType ?? ""] }}>
                                {r.fuelType}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs">{r.acquisitionType}</TableCell>
                            <TableCell className="text-right text-xs">{r.totalDistance ? fmt(r.totalDistance) : "-"}</TableCell>
                            <TableCell className="text-right text-xs">{r.cardFuelCost ? fmt(r.cardFuelCost) : "-"}</TableCell>
                            <TableCell className="text-right text-xs">{r.cashFuelCost ? fmt(r.cashFuelCost) : "-"}</TableCell>
                            <TableCell className="text-right text-xs font-semibold pr-4">{r.totalCost ? fmt(r.totalCost) : "-"}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
                {filtered.length > 200 && (
                  <p className="text-xs text-muted-foreground px-4 py-2">상위 200건만 표시됩니다. 필터를 적용하여 범위를 좁혀주세요.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== 업로드 관리 탭 ===== */}
          <TabsContent value="upload" className="space-y-4 mt-4">
            <Card className="border-dashed border-2">
              <CardContent className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="w-6 h-6 text-primary" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">Excel 파일 업로드</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    "업무용 차량 유류비 사용추이" 형식의 Excel 파일을 업로드하세요.<br />
                    같은 연월의 데이터는 자동으로 덮어씁니다.
                  </p>
                </div>
                <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                  {uploadMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  파일 선택
                </Button>
              </CardContent>
            </Card>

            <div>
              <h3 className="text-sm font-semibold text-foreground mb-3">업로드 이력</h3>
              {batchesLoading ? (
                <div className="flex items-center justify-center py-8 text-muted-foreground">
                  <RefreshCw className="w-4 h-4 animate-spin mr-2" /> 불러오는 중...
                </div>
              ) : batches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">업로드 이력이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {batches.map((b, i) => (
                    <Card key={i} data-testid={`card-batch-${i}`}>
                      <CardContent className="flex items-center justify-between p-4 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{new Date(b.uploadedAt).toLocaleString("ko-KR")}</span>
                            <Badge variant="secondary" className="text-xs">{fmt(b.recordCount)}건</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-1.5">
                            {b.yearMonths.slice(0, 12).map((ym, j) => (
                              <Badge key={j} variant="outline" className="text-[10px]">{ym}</Badge>
                            ))}
                            {b.yearMonths.length > 12 && (
                              <Badge variant="outline" className="text-[10px]">+{b.yearMonths.length - 12}개월</Badge>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 shrink-0"
                          onClick={() => setDeleteBatchId(b.batchId)}
                          data-testid={`button-delete-batch-${i}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      )}

      <AlertDialog open={!!deleteBatchId} onOpenChange={(o) => !o && setDeleteBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업로드 데이터 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 업로드 배치의 모든 유류비 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-500 hover:bg-red-600"
              onClick={() => deleteBatchId && deleteBatchMutation.mutate(deleteBatchId)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
