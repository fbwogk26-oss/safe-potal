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
  ComposedChart, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  ReferenceLine, Area, AreaChart,
} from "recharts";
import {
  Fuel, Upload, Trash2, TrendingUp, TrendingDown, Minus,
  Car, BarChart3, Database, RefreshCw, Search, ChevronUp, ChevronDown,
  Layers, Map, CreditCard, Banknote,
} from "lucide-react";
import type { FuelRecord } from "@shared/schema";

const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(Math.round(n));
const fmtM = (n: number) => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만`;
  return fmt(n);
};
const fmtK = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(0)}천km` : `${fmt(n)}km`;

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

// 연도별 색상 팔레트
const YEAR_COLORS: Record<number, { stroke: string; fill: string; bg: string; text: string }> = {
  2024: { stroke: "#94a3b8", fill: "#94a3b8", bg: "bg-slate-100 dark:bg-slate-800", text: "text-slate-600 dark:text-slate-300" },
  2025: { stroke: "#3b82f6", fill: "#3b82f6", bg: "bg-blue-50 dark:bg-blue-950/40", text: "text-blue-600 dark:text-blue-400" },
  2026: { stroke: "#f97316", fill: "#f97316", bg: "bg-orange-50 dark:bg-orange-950/40", text: "text-orange-600 dark:text-orange-400" },
};

const FUEL_COLORS: Record<string, string> = {
  경유: "#3b82f6", 휘발유: "#f59e0b", EV: "#22c55e", LPG: "#a855f7", 기타: "#94a3b8",
};

const ACQUISITION_COLORS: Record<string, string> = {
  렌트: "#3b82f6", 리스: "#22c55e", 자차: "#f59e0b", 기타: "#94a3b8",
};

const TEAM_COLORS = [
  "#3b82f6","#f59e0b","#22c55e","#ef4444","#8b5cf6",
  "#06b6d4","#f97316","#ec4899","#84cc16","#14b8a6","#a855f7","#fb923c","#64748b",
];

interface YearStat {
  year: number;
  totalCost: number;
  fuelCost: number;
  cardFuelCost: number;
  cashFuelCost: number;
  cardOther: number;
  totalDistance: number;
  vehicleCount: number;
  avgFuelPerKm: number;
}

interface MonthStat {
  year: number;
  month: number;
  totalCost: number;
  totalDistance: number;
  fuelCost: number;
  cardFuelCost: number;
  cashFuelCost: number;
  cardOther: number;
  cashOther: number;
}

interface SummaryData {
  byYearMonth: MonthStat[];
  byTeam: { team: string; totalCost: number; fuelCost: number; distance: number }[];
  byTeamByYear: { team: string; year: number; totalCost: number; fuelCost: number; distance: number }[];
  byFuelType: { fuelType: string; totalCost: number; fuelCost: number; count: number }[];
  byAcquisition: { type: string; totalCost: number; fuelCost: number; count: number }[];
  byVehicleType: { type: string; fuelCost: number; count: number }[];
  years: YearStat[];
  totals: { totalRecords: number };
}

interface Batch {
  batchId: string;
  uploadedAt: string;
  recordCount: number;
  yearMonths: string[];
}

// 퍼센트 변화율 계산
function pct(now: number, prev: number): number | null {
  if (!prev) return null;
  return ((now - prev) / prev) * 100;
}

// 변화율 배지
function TrendBadge({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value === null) return <span className="text-xs text-muted-foreground">-</span>;
  const positive = invert ? value < 0 : value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${positive ? "text-red-500" : value === 0 ? "text-muted-foreground" : "text-blue-500"}`}>
      {value > 0 ? <TrendingUp className="w-3 h-3" /> : value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

// 연도 카드
function YearCard({ stat, prevStat }: { stat: YearStat; prevStat?: YearStat }) {
  const c = YEAR_COLORS[stat.year] ?? YEAR_COLORS[2025];
  const fuelTrend = prevStat ? pct(stat.fuelCost, prevStat.fuelCost) : null;
  const distTrend = prevStat ? pct(stat.totalDistance, prevStat.totalDistance) : null;
  return (
    <Card className={`relative overflow-hidden border ${c.bg}`}>
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className={`text-sm font-bold ${c.text}`}>{stat.year}년</span>
          {prevStat && <TrendBadge value={fuelTrend} />}
        </div>
        <div>
          <p className="text-[11px] text-muted-foreground">유류비 합계</p>
          <p className="text-xl font-bold text-foreground">{fmtM(stat.fuelCost)}원</p>
        </div>
        <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border/50">
          <div>
            <p className="text-[10px] text-muted-foreground">전체비용</p>
            <p className="text-sm font-semibold text-foreground">{fmtM(stat.totalCost)}원</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">총주행거리</p>
            <p className="text-sm font-semibold text-foreground">{fmtK(stat.totalDistance)}</p>
            {prevStat && <TrendBadge value={distTrend} />}
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">법인카드 유류비</p>
            <p className="text-sm font-semibold text-foreground">{fmtM(stat.cardFuelCost)}원</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">현금 유류비</p>
            <p className="text-sm font-semibold text-foreground">{fmtM(stat.cashFuelCost)}원</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">km당 유류비</p>
            <p className="text-sm font-semibold text-foreground">{stat.avgFuelPerKm > 0 ? `${fmt(stat.avgFuelPerKm)}원` : "-"}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">차량 수</p>
            <p className="text-sm font-semibold text-foreground">{stat.vehicleCount}대</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// 커스텀 툴팁
function MonthTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-xs min-w-[160px]">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-semibold text-foreground">
            {typeof p.value === "number" ? `${fmt(p.value)}만원` : "-"}
          </span>
        </div>
      ))}
    </div>
  );
}

function DeltaTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background border border-border rounded-lg p-3 shadow-lg text-xs min-w-[160px]">
      <p className="font-bold text-foreground mb-2">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className={`font-semibold ${p.value > 0 ? "text-red-500" : "text-blue-500"}`}>
            {p.value > 0 ? "+" : ""}{fmt(p.value)}만원
          </span>
        </div>
      ))}
    </div>
  );
}

export default function FuelCosts() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("dashboard");
  const [uploadYear, setUploadYear] = useState<string>("");
  const [uploadMonth, setUploadMonth] = useState<string>("");
  const [chartMetric, setChartMetric] = useState<"fuel" | "total" | "distance">("fuel");
  const [teamYearFilter, setTeamYearFilter] = useState<string>("all");
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
    mutationFn: async ({ file, year, month }: { file: File; year?: string; month?: string }) => {
      const form = new FormData();
      form.append("file", file);
      if (year) form.append("year", year);
      if (month) form.append("month", month);
      const res = await fetch("/api/fuel-records/upload", { method: "POST", body: form, credentials: "include" });
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
    const yr = uploadYear === "auto" || !uploadYear ? undefined : uploadYear;
    const mo = uploadMonth === "auto" || !uploadMonth ? undefined : uploadMonth;
    if (file) uploadMutation.mutate({ file, year: yr, month: mo });
    e.target.value = "";
  };

  // 업로드 연도 목록
  const uploadYearOptions = ["2024", "2025", "2026"];
  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().getMonth() + 1;

  const years = summary?.years ?? [];
  const hasData = (summary?.totals?.totalRecords ?? 0) > 0;

  // ────────── 월별 추이 데이터 구성 ──────────
  const trendData = MONTHS.map((label, i) => {
    const m = i + 1;
    const row: Record<string, any> = { month: label };
    for (const yr of years) {
      const d = summary?.byYearMonth.find(x => x.year === yr.year && x.month === m);
      if (chartMetric === "fuel") {
        row[`${yr.year}년`] = d ? Math.round(d.fuelCost / 10000) : null;
      } else if (chartMetric === "total") {
        row[`${yr.year}년`] = d ? Math.round(d.totalCost / 10000) : null;
      } else {
        row[`${yr.year}년`] = d ? Math.round(d.totalDistance / 1000) : null;
      }
    }
    return row;
  });

  // ────────── 전년 대비 증감 차트 ──────────
  const sortedYears = years.map(y => y.year).sort();
  const deltaCharts: { label: string; data: any[] }[] = [];
  for (let i = 1; i < sortedYears.length; i++) {
    const curYear = sortedYears[i];
    const prevYear = sortedYears[i - 1];
    const data = MONTHS.map((label, mi) => {
      const m = mi + 1;
      const cur = summary?.byYearMonth.find(x => x.year === curYear && x.month === m);
      const prev = summary?.byYearMonth.find(x => x.year === prevYear && x.month === m);
      const delta = (cur && prev)
        ? Math.round((cur.fuelCost - prev.fuelCost) / 10000)
        : null;
      return { month: label, delta, cur: cur ? Math.round(cur.fuelCost / 10000) : null, prev: prev ? Math.round(prev.fuelCost / 10000) : null };
    });
    deltaCharts.push({ label: `${prevYear}→${curYear}년 유류비 증감`, data });
  }

  // ────────── 팀별 차트 ──────────
  const teamsForChart = summary?.byTeam.map(t => t.team) ?? [];
  const teamChartData = teamsForChart.map(team => {
    const row: Record<string, any> = { team };
    const filteredYears = teamYearFilter === "all" ? sortedYears : [parseInt(teamYearFilter)];
    for (const yr of filteredYears) {
      const d = summary?.byTeamByYear.find(x => x.team === team && x.year === yr);
      row[`${yr}년`] = d ? Math.round(d.fuelCost / 10000) : 0;
    }
    return row;
  });

  // ────────── 비용 구조 파이 ──────────
  const costStructure = years.length > 0 ? (() => {
    const latest = years[years.length - 1];
    return [
      { name: "법인카드 유류비", value: latest.cardFuelCost },
      { name: "현금 유류비", value: latest.cashFuelCost },
      { name: "법인카드 기타", value: latest.cardOther },
    ].filter(x => x.value > 0);
  })() : [];

  const costStructureColors = ["#3b82f6", "#f59e0b", "#94a3b8", "#22c55e"];

  // ────────── 연도별 비교 테이블 ──────────
  const yearCompTable = teamsForChart.map(team => {
    const row: Record<string, any> = { team };
    for (const yr of sortedYears) {
      const d = summary?.byTeamByYear.find(x => x.team === team && x.year === yr);
      row[yr] = d?.fuelCost ?? 0;
    }
    return row;
  }).sort((a, b) => {
    const lastYr = sortedYears[sortedYears.length - 1];
    return (b[lastYr] ?? 0) - (a[lastYr] ?? 0);
  });

  // ────────── 상세 테이블 ──────────
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

  const metricLabel = chartMetric === "fuel" ? "유류비 (만원)" : chartMetric === "total" ? "전체비용 (만원)" : "주행거리 (천km)";
  const yAxisFmt = (v: any) => chartMetric === "distance" ? `${v}천km` : `${v}만`;

  return (
    <div className="p-4 sm:p-6 space-y-5 max-w-[1400px] mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Fuel className="w-6 h-6 text-primary" />
            유류비 현황
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">업무용 차량 유류비 사용 현황 및 연도별 비교 분석</p>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} data-testid="input-fuel-file" />

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
              <Upload className="w-4 h-4 mr-2" />Excel 파일 업로드
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

          {/* ═══════════════ 대시보드 탭 ═══════════════ */}
          <TabsContent value="dashboard" className="space-y-5 mt-4">

            {/* ── 연도별 요약 카드 (24 / 25 / 26) ── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {[2024, 2025, 2026].map(yr => {
                const stat = years.find(y => y.year === yr);
                const prevStat = years.find(y => y.year === yr - 1);
                if (!stat) {
                  return (
                    <Card key={yr} className="border-dashed opacity-50">
                      <CardContent className="p-4 flex items-center justify-center h-[160px]">
                        <div className="text-center text-muted-foreground">
                          <p className="text-sm font-semibold">{yr}년</p>
                          <p className="text-xs mt-1">데이터 없음</p>
                          <p className="text-xs">Excel 파일 업로드 후 표시됩니다</p>
                        </div>
                      </CardContent>
                    </Card>
                  );
                }
                return <YearCard key={yr} stat={stat} prevStat={prevStat} />;
              })}
            </div>

            {/* ── 전년 대비 증감 요약 행 ── */}
            {sortedYears.length >= 2 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(() => {
                  const items = [];
                  for (let i = 1; i < sortedYears.length; i++) {
                    const cur = years.find(y => y.year === sortedYears[i]);
                    const prev = years.find(y => y.year === sortedYears[i - 1]);
                    if (!cur || !prev) continue;
                    const fuelDelta = cur.fuelCost - prev.fuelCost;
                    const fuelPct = pct(cur.fuelCost, prev.fuelCost);
                    const distPct = pct(cur.totalDistance, prev.totalDistance);
                    items.push(
                      <Card key={i} className="col-span-2">
                        <CardContent className="p-4">
                          <p className="text-xs text-muted-foreground mb-2">{sortedYears[i - 1]}→{sortedYears[i]}년 비교</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <p className="text-[10px] text-muted-foreground">유류비 증감</p>
                              <p className={`text-base font-bold ${fuelDelta > 0 ? "text-red-500" : "text-blue-500"}`}>
                                {fuelDelta > 0 ? "+" : ""}{fmtM(fuelDelta)}원
                              </p>
                              <TrendBadge value={fuelPct} />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">주행거리 증감</p>
                              <p className={`text-base font-bold ${(cur.totalDistance - prev.totalDistance) > 0 ? "text-red-500" : "text-blue-500"}`}>
                                {(cur.totalDistance - prev.totalDistance) > 0 ? "+" : ""}{fmtK(Math.abs(cur.totalDistance - prev.totalDistance))}
                              </p>
                              <TrendBadge value={distPct} invert />
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">km당 유류비 ({sortedYears[i - 1]}년)</p>
                              <p className="text-sm font-semibold">{prev.avgFuelPerKm > 0 ? `${fmt(prev.avgFuelPerKm)}원` : "-"}</p>
                            </div>
                            <div>
                              <p className="text-[10px] text-muted-foreground">km당 유류비 ({sortedYears[i]}년)</p>
                              <p className="text-sm font-semibold">{cur.avgFuelPerKm > 0 ? `${fmt(cur.avgFuelPerKm)}원` : "-"}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  }
                  return items;
                })()}
              </div>
            )}

            {/* ── 월별 추이 메인 차트 ── */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base">월별 {metricLabel} 추이</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      연도별 월간 {chartMetric === "fuel" ? "유류비" : chartMetric === "total" ? "전체 비용" : "총 주행거리"} 비교
                    </p>
                  </div>
                  <div className="flex gap-1.5">
                    {(["fuel", "total", "distance"] as const).map(m => (
                      <Button
                        key={m}
                        size="sm"
                        variant={chartMetric === m ? "default" : "outline"}
                        className="text-xs h-7 px-2.5"
                        onClick={() => setChartMetric(m)}
                        data-testid={`button-metric-${m}`}
                      >
                        {m === "fuel" ? "유류비" : m === "total" ? "전체비용" : "주행거리"}
                      </Button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <ComposedChart data={trendData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                    <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={yAxisFmt} width={56} />
                    <Tooltip content={<MonthTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {sortedYears.map(yr => {
                      const c = YEAR_COLORS[yr] ?? YEAR_COLORS[2025];
                      return (
                        <Line
                          key={yr}
                          type="monotone"
                          dataKey={`${yr}년`}
                          stroke={c.stroke}
                          strokeWidth={yr === Math.max(...sortedYears) ? 2.5 : 1.8}
                          dot={{ r: 3, fill: c.fill }}
                          activeDot={{ r: 5 }}
                          connectNulls={false}
                        />
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>

                {/* 연도별 월간 합계 소표 */}
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left py-1 px-2 text-muted-foreground font-medium">구분</th>
                        {MONTHS.map(m => (
                          <th key={m} className="text-right py-1 px-1 text-muted-foreground font-medium">{m}</th>
                        ))}
                        <th className="text-right py-1 px-2 text-muted-foreground font-medium">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedYears.map(yr => {
                        const c = YEAR_COLORS[yr] ?? YEAR_COLORS[2025];
                        const monthVals = MONTHS.map((_, mi) => {
                          const m = mi + 1;
                          const d = summary?.byYearMonth.find(x => x.year === yr && x.month === m);
                          if (!d) return null;
                          return chartMetric === "fuel" ? d.fuelCost
                            : chartMetric === "total" ? d.totalCost
                            : d.totalDistance;
                        });
                        const total = monthVals.reduce((s, v) => s + (v ?? 0), 0);
                        return (
                          <tr key={yr} className="border-b border-border/40 hover:bg-muted/30">
                            <td className={`py-1.5 px-2 font-bold ${c.text}`}>{yr}년</td>
                            {monthVals.map((v, mi) => (
                              <td key={mi} className="text-right py-1.5 px-1 text-foreground">
                                {v != null ? (
                                  chartMetric === "distance"
                                    ? `${Math.round(v / 1000)}천`
                                    : `${Math.round(v / 10000)}만`
                                ) : <span className="text-muted-foreground/40">-</span>}
                              </td>
                            ))}
                            <td className={`text-right py-1.5 px-2 font-bold ${c.text}`}>
                              {chartMetric === "distance"
                                ? `${Math.round(total / 1000)}천km`
                                : `${fmtM(total)}원`}
                            </td>
                          </tr>
                        );
                      })}
                      {/* 전년 대비 증감 행 */}
                      {sortedYears.length >= 2 && (() => {
                        const rows = [];
                        for (let i = 1; i < sortedYears.length; i++) {
                          const curYr = sortedYears[i];
                          const prevYr = sortedYears[i - 1];
                          const deltas = MONTHS.map((_, mi) => {
                            const m = mi + 1;
                            const cur = summary?.byYearMonth.find(x => x.year === curYr && x.month === m);
                            const prev = summary?.byYearMonth.find(x => x.year === prevYr && x.month === m);
                            if (!cur || !prev) return null;
                            const curVal = chartMetric === "fuel" ? cur.fuelCost : chartMetric === "total" ? cur.totalCost : cur.totalDistance;
                            const prevVal = chartMetric === "fuel" ? prev.fuelCost : chartMetric === "total" ? prev.totalCost : prev.totalDistance;
                            return curVal - prevVal;
                          });
                          const totalDelta = deltas.reduce((s, v) => s + (v ?? 0), 0);
                          rows.push(
                            <tr key={`delta-${i}`} className="border-b border-border/40 bg-muted/20">
                              <td className="py-1.5 px-2 text-muted-foreground font-medium text-[10px]">증감({prevYr}→{curYr})</td>
                              {deltas.map((v, mi) => (
                                <td key={mi} className={`text-right py-1.5 px-1 text-[10px] font-medium ${v == null ? "" : v > 0 ? "text-red-500" : v < 0 ? "text-blue-500" : "text-muted-foreground"}`}>
                                  {v != null ? (
                                    <>
                                      {v > 0 ? "+" : ""}
                                      {chartMetric === "distance"
                                        ? `${Math.round(v / 1000)}천`
                                        : `${Math.round(v / 10000)}만`}
                                    </>
                                  ) : <span className="text-muted-foreground/30">-</span>}
                                </td>
                              ))}
                              <td className={`text-right py-1.5 px-2 font-bold text-[10px] ${totalDelta > 0 ? "text-red-500" : totalDelta < 0 ? "text-blue-500" : "text-muted-foreground"}`}>
                                {totalDelta > 0 ? "+" : ""}
                                {chartMetric === "distance" ? `${Math.round(totalDelta / 1000)}천km` : `${fmtM(Math.abs(totalDelta))}원`}
                              </td>
                            </tr>
                          );
                        }
                        return rows;
                      })()}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

            {/* ── 전년 대비 월별 증감 바 차트 ── */}
            {deltaCharts.map(({ label, data }, idx) => (
              <Card key={idx}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{label}</CardTitle>
                  <p className="text-xs text-muted-foreground">양수(빨간색)=증가, 음수(파란색)=감소</p>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={200}>
                    <ComposedChart data={data} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v > 0 ? "+" : ""}${v}만`} width={56} />
                      <ReferenceLine y={0} stroke="#94a3b8" strokeWidth={1.5} />
                      <Tooltip content={<DeltaTooltip />} />
                      <Bar dataKey="delta" name="증감" radius={[2, 2, 0, 0]}>
                        {data.map((entry, i) => (
                          <Cell key={i} fill={entry.delta > 0 ? "#ef4444" : "#3b82f6"} fillOpacity={0.8} />
                        ))}
                      </Bar>
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            ))}

            {/* ── 팀별 유류비 (전체 너비) ── */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <CardTitle className="text-base">팀별 유류비 비교</CardTitle>
                  <Select value={teamYearFilter} onValueChange={setTeamYearFilter}>
                    <SelectTrigger className="w-28 h-8" data-testid="select-team-year">
                      <SelectValue placeholder="연도" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">전체</SelectItem>
                      {sortedYears.map(yr => (
                        <SelectItem key={yr} value={String(yr)}>{yr}년</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(320, teamChartData.length * 30 + 50)}>
                  <BarChart data={teamChartData} layout="vertical" barCategoryGap="25%" margin={{ top: 4, right: 30, left: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} className="opacity-20" />
                    <XAxis type="number" tick={{ fontSize: 11 }} tickFormatter={v => `${v}만`} />
                    <YAxis type="category" dataKey="team" tick={{ fontSize: 12 }} width={110} />
                    <Tooltip formatter={(v: any) => [`${fmt(v)}만원`]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    {(teamYearFilter === "all" ? sortedYears : [parseInt(teamYearFilter)]).map((yr, i) => {
                      const c = YEAR_COLORS[yr] ?? { fill: TEAM_COLORS[i] };
                      return <Bar key={yr} dataKey={`${yr}년`} fill={c.fill} radius={[0, 3, 3, 0]} />;
                    })}
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* ── 비용구조 + 연료 + 구입형태 (3열) ── */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* 비용 구조 도넛 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">비용 구조 ({years[years.length - 1]?.year ?? ""}년)</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={costStructure} cx="50%" cy="50%" outerRadius={65} innerRadius={30} dataKey="value" nameKey="name">
                        {costStructure.map((_, i) => (
                          <Cell key={i} fill={costStructureColors[i % costStructureColors.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(v: any) => [`${fmtM(v)}원`]} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap gap-1.5 mt-1 justify-center">
                    {costStructure.map((entry, i) => (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <div className="w-2 h-2 rounded-full" style={{ background: costStructureColors[i] }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                        <span className="font-medium">{fmtM(entry.value)}원</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* 연료 종류별 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">연료 종류별</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {(summary?.byFuelType ?? []).slice(0, 5).map((f, i) => {
                    const total = summary?.byFuelType.reduce((s, x) => s + x.fuelCost, 0) ?? 1;
                    const pctVal = total > 0 ? (f.fuelCost / total) * 100 : 0;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium" style={{ color: FUEL_COLORS[f.fuelType ?? ""] ?? "#64748b" }}>{f.fuelType}</span>
                          <span className="text-xs text-muted-foreground">{fmtM(f.fuelCost)}원 ({pctVal.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: FUEL_COLORS[f.fuelType ?? ""] ?? "#94a3b8" }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              {/* 구입형태별 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">구입형태별</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {(summary?.byAcquisition ?? []).slice(0, 5).map((a, i) => {
                    const total = summary?.byAcquisition.reduce((s, x) => s + x.fuelCost, 0) ?? 1;
                    const pctVal = total > 0 ? (a.fuelCost / total) * 100 : 0;
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-xs font-medium" style={{ color: ACQUISITION_COLORS[a.type ?? ""] ?? "#64748b" }}>{a.type}</span>
                          <span className="text-xs text-muted-foreground">{fmtM(a.fuelCost)}원 ({pctVal.toFixed(1)}%)</span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: ACQUISITION_COLORS[a.type ?? ""] ?? "#94a3b8" }} />
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            </div>

            {/* ── 팀별 연도별 비교 테이블 ── */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">팀별 연도별 유류비 비교표</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="pl-4">팀</TableHead>
                        {sortedYears.map(yr => (
                          <TableHead key={yr} className="text-right">
                            <span className={YEAR_COLORS[yr]?.text ?? ""}>{yr}년</span>
                          </TableHead>
                        ))}
                        {sortedYears.length >= 2 && (
                          <TableHead className="text-right pr-4">
                            {sortedYears[sortedYears.length - 2]}→{sortedYears[sortedYears.length - 1]} 증감
                          </TableHead>
                        )}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {yearCompTable.map((row, i) => {
                        const lastYr = sortedYears[sortedYears.length - 1];
                        const prevYr = sortedYears[sortedYears.length - 2];
                        const delta = prevYr ? (row[lastYr] ?? 0) - (row[prevYr] ?? 0) : null;
                        const deltaPct = prevYr && row[prevYr] > 0 ? ((row[lastYr] - row[prevYr]) / row[prevYr]) * 100 : null;
                        return (
                          <TableRow key={i} data-testid={`row-team-year-${i}`}>
                            <TableCell className="font-medium pl-4">{row.team}</TableCell>
                            {sortedYears.map(yr => (
                              <TableCell key={yr} className="text-right">
                                {row[yr] > 0 ? fmtM(row[yr]) + "원" : "-"}
                              </TableCell>
                            ))}
                            {sortedYears.length >= 2 && (
                              <TableCell className="text-right pr-4">
                                {delta !== null && row[prevYr] > 0 ? (
                                  <span className={`font-semibold ${delta > 0 ? "text-red-500" : delta < 0 ? "text-blue-500" : "text-muted-foreground"}`}>
                                    {delta > 0 ? "+" : ""}{fmtM(delta)}원
                                    <br />
                                    <span className="text-[10px] font-normal">
                                      ({deltaPct !== null ? (deltaPct > 0 ? "+" : "") + deltaPct.toFixed(1) + "%" : "-"})
                                    </span>
                                  </span>
                                ) : "-"}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      })}
                      {/* 합계 행 */}
                      <TableRow className="font-bold bg-muted/30">
                        <TableCell className="pl-4 font-bold">전체 합계</TableCell>
                        {sortedYears.map(yr => {
                          const stat = years.find(y => y.year === yr);
                          return (
                            <TableCell key={yr} className="text-right font-bold">
                              {stat ? fmtM(stat.fuelCost) + "원" : "-"}
                            </TableCell>
                          );
                        })}
                        {sortedYears.length >= 2 && (() => {
                          const cur = years.find(y => y.year === sortedYears[sortedYears.length - 1]);
                          const prev = years.find(y => y.year === sortedYears[sortedYears.length - 2]);
                          const d = cur && prev ? cur.fuelCost - prev.fuelCost : null;
                          const dp = cur && prev && prev.fuelCost > 0 ? ((cur.fuelCost - prev.fuelCost) / prev.fuelCost) * 100 : null;
                          return (
                            <TableCell className="text-right pr-4 font-bold">
                              {d !== null ? (
                                <span className={d > 0 ? "text-red-500" : "text-blue-500"}>
                                  {d > 0 ? "+" : ""}{fmtM(d)}원<br />
                                  <span className="text-[10px] font-normal">({dp !== null ? (dp > 0 ? "+" : "") + dp.toFixed(1) + "%" : "-"})</span>
                                </span>
                              ) : "-"}
                            </TableCell>
                          );
                        })()}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════ 상세 데이터 탭 ═══════════════ */}
          <TabsContent value="detail" className="space-y-4 mt-4">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-28" data-testid="select-year">
                  <SelectValue placeholder="연도" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 연도</SelectItem>
                  {sortedYears.map(yr => <SelectItem key={yr} value={String(yr)}>{yr}년</SelectItem>)}
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
                <Input data-testid="input-search" placeholder="팀·사용자·차량번호·모델 검색" className="pl-8" value={search} onChange={e => setSearch(e.target.value)} />
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
                    <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">데이터가 없습니다</div>
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
                        {filtered.slice(0, 300).map(r => (
                          <TableRow key={r.id} data-testid={`row-fuel-${r.id}`}>
                            <TableCell className="pl-4 whitespace-nowrap text-xs">
                              <span className={`font-medium ${YEAR_COLORS[r.year]?.text ?? ""}`}>{r.year}년 {r.month}월</span>
                            </TableCell>
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
                {filtered.length > 300 && (
                  <p className="text-xs text-muted-foreground px-4 py-2">상위 300건만 표시됩니다. 필터를 적용하여 범위를 좁혀주세요.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ═══════════════ 업로드 관리 탭 ═══════════════ */}
          <TabsContent value="upload" className="space-y-4 mt-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Upload className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-foreground">Excel 파일 업로드</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      같은 연월의 기존 데이터는 자동으로 교체됩니다.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">📋 다중 시트 파일 (자동 처리)</p>
                    <p className="text-xs text-muted-foreground">
                      "24년 1월", "25년 12월" 형식의 시트명이 포함된 파일은 연도/월을 자동으로 인식합니다.
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-foreground mb-2">📄 단일 시트 파일 (연월 지정 필요)</p>
                    <p className="text-xs text-muted-foreground">
                      "Sheet1" 또는 단월 데이터 파일은 상단의 연도/월을 먼저 지정하거나 파일명에 날짜(YYYYMMDD)를 포함하면 자동 인식됩니다.
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      예: 차량사용실적현황_<strong>20260330</strong>_xxx.xlsx → 2026년 3월로 자동 인식
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-muted-foreground">연월 수동 지정 (선택):</span>
                  <Select value={uploadYear} onValueChange={setUploadYear}>
                    <SelectTrigger className="w-24 h-8">
                      <SelectValue placeholder="연도" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">자동</SelectItem>
                      {uploadYearOptions.map(y => <SelectItem key={y} value={y}>{y}년</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={uploadMonth} onValueChange={setUploadMonth}>
                    <SelectTrigger className="w-20 h-8">
                      <SelectValue placeholder="월" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">자동</SelectItem>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {uploadYear && uploadYear !== "auto" && uploadMonth && uploadMonth !== "auto" && (
                    <Badge className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300 border-0">
                      {uploadYear}년 {uploadMonth}월로 업로드
                    </Badge>
                  )}
                  <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="ml-auto">
                    {uploadMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    파일 선택
                  </Button>
                </div>
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
                          variant="ghost" size="sm"
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
