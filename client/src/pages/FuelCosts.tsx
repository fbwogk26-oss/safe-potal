import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import {
  ComposedChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LabelList,
} from "recharts";
import {
  Fuel, Upload, Trash2, TrendingUp, TrendingDown, Minus,
  RefreshCw, Search, ChevronUp, ChevronDown, Car, Route,
} from "lucide-react";
import type { FuelRecord } from "@shared/schema";

const fmt = (n: number) => new Intl.NumberFormat("ko-KR").format(Math.round(n));
const fmtM = (n: number) => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000)}만`;
  return fmt(n);
};
const fmtM2 = (n: number) => {
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억원`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString()}만원`;
  return `${fmt(n)}원`;
};
// 거리: 만km 단위로 표시 (10만km → 10만km, 2천km → 2,000km)
const fmtK = (n: number) => {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}만km`;
  return `${fmt(n)}km`;
};

const shortYr = (y: number | string) => String(y).slice(2);

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const MONTHS_SHORT = ["1","2","3","4","5","6","7","8","9","10","11","12"];

const YEAR_PALETTE: Record<number, {
  stroke: string; fill: string; gradient: [string, string];
  bg: string; border: string; text: string; badgeBg: string;
}> = {
  2024: {
    stroke: "#64748b", fill: "#64748b",
    gradient: ["#94a3b8", "#cbd5e1"],
    bg: "bg-slate-50 dark:bg-slate-900/50", border: "border-l-slate-400",
    text: "text-slate-700 dark:text-slate-300", badgeBg: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  },
  2025: {
    stroke: "#2563eb", fill: "#3b82f6",
    gradient: ["#3b82f6", "#93c5fd"],
    bg: "bg-blue-50 dark:bg-blue-950/30", border: "border-l-blue-500",
    text: "text-blue-700 dark:text-blue-400", badgeBg: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300",
  },
  2026: {
    stroke: "#ea580c", fill: "#f97316",
    gradient: ["#f97316", "#fdba74"],
    bg: "bg-orange-50 dark:bg-orange-950/30", border: "border-l-orange-500",
    text: "text-orange-700 dark:text-orange-400", badgeBg: "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300",
  },
};

const FUEL_COLORS: Record<string, string> = {
  경유: "#2563eb", 휘발유: "#d97706", EV: "#16a34a", LPG: "#9333ea", 기타: "#6b7280",
};

interface YearStat {
  year: number; totalCost: number; fuelCost: number;
  cardFuelCost: number; cashFuelCost: number; cardOther: number;
  totalDistance: number; vehicleCount: number; avgFuelPerKm: number;
}
interface MonthStat {
  year: number; month: number; totalCost: number; totalDistance: number;
  fuelCost: number; cardFuelCost: number; cashFuelCost: number; cardOther: number; cashOther: number;
}
interface SummaryData {
  byYearMonth: MonthStat[];
  byTeam: { team: string; totalCost: number; fuelCost: number; distance: number }[];
  byTeamByYear: { team: string; year: number; totalCost: number; fuelCost: number; distance: number }[];
  byTeamByYearMonth: { team: string; year: number; month: number; fuelCost: number; distance: number }[];
  byFuelType: { fuelType: string; totalCost: number; fuelCost: number; count: number }[];
  byAcquisition: { type: string; totalCost: number; fuelCost: number; count: number }[];
  byVehicleType: { type: string; fuelCost: number; count: number }[];
  years: YearStat[];
  totals: { totalRecords: number };
}
interface Batch {
  batchId: string; uploadedAt: string; recordCount: number; yearMonths: string[];
}

function pct(now: number, prev: number): number | null {
  if (!prev) return null;
  return ((now - prev) / prev) * 100;
}

function TrendBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-muted-foreground">-</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${up ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" : value === 0 ? "bg-muted text-muted-foreground" : "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400"}`}>
      {up ? <TrendingUp className="w-3 h-3" /> : value < 0 ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {value > 0 ? "+" : ""}{value.toFixed(1)}%
    </span>
  );
}

function YearCard({ stat, prevStat }: { stat: YearStat; prevStat?: YearStat }) {
  const p = YEAR_PALETTE[stat.year] ?? YEAR_PALETTE[2025];
  const fuelTrend = prevStat ? pct(stat.fuelCost, prevStat.fuelCost) : null;
  const fuelD = prevStat ? stat.fuelCost - prevStat.fuelCost : null;
  const distD = prevStat ? stat.totalDistance - prevStat.totalDistance : null;
  const vehicleD = prevStat ? stat.vehicleCount - prevStat.vehicleCount : null;
  return (
    <div className={`rounded-xl overflow-hidden border ${p.bg}`} style={{ borderColor: p.stroke + "30" }}>
      <div className="h-[3px] w-full" style={{ background: p.stroke }} />
      <div className="p-4">
        {/* 헤더: 연도 + 추이 */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-1.5">
            <Fuel className="w-3.5 h-3.5" style={{ color: p.stroke }} />
            <span className="text-sm font-black" style={{ color: p.stroke }}>{shortYr(stat.year)}년</span>
            <span className="text-[10px] text-muted-foreground">유류비 합계</span>
          </div>
          {fuelTrend !== null && <TrendBadge value={fuelTrend} />}
        </div>
        {/* 메인 숫자 */}
        <p className="text-[2rem] font-black text-foreground tracking-tight leading-none mb-3">
          {fmtM(stat.fuelCost)}<span className="text-base font-semibold text-muted-foreground ml-1">원</span>
        </p>
        {/* 보조 지표: 거리 + 차량 (전년 증감 인라인) */}
        <div className="space-y-1.5 pb-2.5 border-b" style={{ borderColor: p.stroke + "20" }}>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <Route className="w-3 h-3 shrink-0 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">주행거리</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-foreground tabular-nums">{fmtK(stat.totalDistance)}</span>
              {distD !== null && distD !== 0 && (
                <span className={`text-[10px] font-semibold tabular-nums ${distD > 0 ? "text-red-500" : "text-blue-500"}`}>
                  {distD > 0 ? "▲" : "▼"} {fmtK(Math.abs(distD))}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs">
              <Car className="w-3 h-3 shrink-0 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">차량 대수</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="font-semibold text-foreground tabular-nums">{stat.vehicleCount}대</span>
              {vehicleD !== null && vehicleD !== 0 && (
                <span className={`text-[10px] font-semibold tabular-nums ${vehicleD > 0 ? "text-orange-500" : "text-blue-500"}`}>
                  {vehicleD > 0 ? "▲" : "▼"} {Math.abs(vehicleD)}대
                </span>
              )}
            </div>
          </div>
        </div>
        {/* 유류비 전년 대비 */}
        {fuelD !== null ? (
          <div className="mt-2.5 flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground font-medium">유류비 전년 대비</span>
            <span className={`text-xs font-black tabular-nums ${fuelD > 0 ? "text-red-500" : "text-blue-500"}`}>
              {fuelD > 0 ? "▲" : "▼"} {fmtM2(Math.abs(fuelD))}
            </span>
          </div>
        ) : (
          <div className="mt-2.5 text-[10px] text-muted-foreground/50">전년 데이터 없음</div>
        )}
      </div>
    </div>
  );
}

const ChartTooltip = ({ active, payload, label, unit = "만원" }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-background/95 backdrop-blur border border-border rounded-xl p-3 shadow-xl text-xs min-w-[160px]">
      <p className="font-bold text-foreground mb-2 text-sm">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-bold text-foreground">{fmt(p.value ?? 0)}{unit}</span>
        </div>
      ))}
    </div>
  );
};


export default function FuelCosts() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vehicleLogInputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState("dashboard");
  const [uploadYear, setUploadYear] = useState<string>("");
  const [uploadMonth, setUploadMonth] = useState<string>("");
  const [vlogYear, setVlogYear] = useState<string>("");
  const [vlogMonth, setVlogMonth] = useState<string>("");
  const [chartMetric, setChartMetric] = useState<"fuel" | "distance">("fuel");
  const [teamYearFilter, setTeamYearFilter] = useState<string>("all");
  const [teamTeamFilter, setTeamTeamFilter] = useState<string>("all");
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

  const vehicleLogMutation = useMutation({
    mutationFn: async ({ file, year, month }: { file: File; year?: string; month?: string }) => {
      const form = new FormData();
      form.append("file", file);
      if (year) form.append("year", year);
      if (month) form.append("month", month);
      const res = await fetch("/api/fuel-records/upload-vehicle-log", { method: "POST", body: form, credentials: "include" });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: "차량일지 업로드 완료", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fuel-records/batches"] });
    },
    onError: (e: Error) => toast({ title: "업로드 실패", description: e.message, variant: "destructive" }),
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const yr = uploadYear === "auto" || !uploadYear ? undefined : uploadYear;
    const mo = uploadMonth === "auto" || !uploadMonth ? undefined : uploadMonth;
    if (file) uploadMutation.mutate({ file, year: yr, month: mo });
    e.target.value = "";
  };

  const handleVehicleLogChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const yr = vlogYear && vlogYear !== "none" ? vlogYear : undefined;
    const mo = vlogMonth && vlogMonth !== "none" ? vlogMonth : undefined;
    vehicleLogMutation.mutate({ file, year: yr, month: mo });
    e.target.value = "";
  };

  const uploadYearOptions = ["2024", "2025", "2026"];
  const years = summary?.years ?? [];
  const sortedYears = years.map(y => y.year).sort();
  const hasData = (summary?.totals?.totalRecords ?? 0) > 0;

  // ── 월별 추이 ──
  const trendData = MONTHS_SHORT.map((label, i) => {
    const m = i + 1;
    const row: Record<string, any> = { month: `${label}월` };
    for (const yr of sortedYears) {
      const d = summary?.byYearMonth.find(x => x.year === yr && x.month === m);
      if (chartMetric === "fuel") row[`${yr}`] = d ? Math.round(d.fuelCost / 10000) : null;
      else row[`${yr}`] = d ? Math.round(d.totalDistance / 10000) : null;
    }
    return row;
  });

  // ── 전년 대비 증감 (통합) ──
  const deltaPairs = sortedYears.slice(1).map((curYear, i) => {
    const prevYear = sortedYears[i];
    return { key: `${prevYear}→${curYear}`, label: `${prevYear}→${curYear}년`, prevYear, curYear };
  });
  const combinedDeltaData = MONTHS_SHORT.map((_, mi) => {
    const m = mi + 1;
    const row: Record<string, any> = { month: `${mi + 1}월` };
    for (const { key, prevYear, curYear } of deltaPairs) {
      const cur = summary?.byYearMonth.find(x => x.year === curYear && x.month === m);
      const prev = summary?.byYearMonth.find(x => x.year === prevYear && x.month === m);
      row[key] = (cur && prev) ? Math.round((cur.fuelCost - prev.fuelCost) / 10000) : null;
    }
    return row;
  });

  // 추이 + 증감 통합 데이터 (ComposedChart용)
  const mergedTrendData = trendData.map((row, i) => {
    const merged: Record<string, any> = { ...row };
    for (const { key } of deltaPairs) {
      merged[key] = combinedDeltaData[i]?.[key] ?? null;
    }
    return merged;
  });

  // ── 팀별 차트 ── (유의미한 팀만: 어느 연도든 유류비 500만원 이상)
  const significantTeams = new Set(
    (summary?.byTeamByYear ?? [])
      .filter(t => t.fuelCost >= 5000000)
      .map(t => t.team)
  );
  const teamsForChart = (summary?.byTeam ?? [])
    .filter(t => significantTeams.has(t.team))
    .map(t => t.team);

  const activeYearsForTeam = teamYearFilter === "all" ? sortedYears : [parseInt(teamYearFilter)];
  const teamChartData = teamsForChart.map(team => {
    const row: Record<string, any> = { team };
    for (const yr of activeYearsForTeam) {
      const d = summary?.byTeamByYear.find(x => x.team === team && x.year === yr);
      row[`${yr}`] = d ? Math.round(d.fuelCost / 10000) : 0;
    }
    return row;
  }).sort((a, b) => {
    const latestYr = activeYearsForTeam[activeYearsForTeam.length - 1];
    return (b[`${latestYr}`] ?? 0) - (a[`${latestYr}`] ?? 0);
  });

  // ── 팀 선택 시 월별 분석 차트 데이터 ──
  const monthlyTeamChartData = teamTeamFilter === "all" ? [] : Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const row: Record<string, any> = { month: `${month}월` };
    for (const yr of activeYearsForTeam) {
      const d = (summary?.byTeamByYearMonth ?? []).find(x => x.team === teamTeamFilter && x.year === yr && x.month === month);
      row[`${yr}`] = d ? Math.round(d.fuelCost / 10000) : 0;
    }
    return row;
  });

  // ── 연도별 비교 테이블 ──
  const yearCompTable = teamsForChart.map(team => {
    const row: Record<string, any> = { team };
    for (const yr of sortedYears) {
      const d = summary?.byTeamByYear.find(x => x.team === team && x.year === yr);
      row[yr] = d?.fuelCost ?? 0;
    }
    return row;
  }).sort((a, b) => (b[sortedYears[sortedYears.length - 1]] ?? 0) - (a[sortedYears[sortedYears.length - 1]] ?? 0));

  // ── 상세 데이터 ──
  const filtered = records
    .filter(r => {
      if (!search) return true;
      const s = search.toLowerCase();
      return [(r.team ?? ""), (r.driver ?? ""), (r.licensePlate ?? ""), (r.modelName ?? "")]
        .some(v => v.toLowerCase().includes(s));
    })
    .sort((a, b) => {
      const av = (a as any)[sortField] ?? 0, bv = (b as any)[sortField] ?? 0;
      return sortDir === "asc" ? av - bv : bv - av;
    });

  const handleSort = (field: string) => {
    if (sortField === field) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDir("desc"); }
  };
  const SortIcon = ({ field }: { field: string }) =>
    sortField === field ? (sortDir === "asc" ? <ChevronUp className="w-3 h-3 inline ml-0.5" /> : <ChevronDown className="w-3 h-3 inline ml-0.5" />) : null;

  const metricLabel = chartMetric === "fuel" ? "유류비" : "주행거리";
  const yFmt = (v: any) => chartMetric === "distance" ? `${v}만km` : `${v}만원`;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black text-foreground flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Fuel className="w-5 h-5 text-primary" />
            </div>
            유류비 현황
          </h1>
          <p className="text-sm text-muted-foreground mt-1 ml-11">업무용 차량 유류비 사용 현황 및 연도별 비교 분석</p>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileChange} data-testid="input-fuel-file" />
      <input ref={vehicleLogInputRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleVehicleLogChange} data-testid="input-vehicle-log-file" />

      <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="h-10 w-full sm:w-auto">
            <TabsTrigger value="dashboard" className="flex-1 sm:flex-none sm:px-5 text-xs sm:text-sm" data-testid="tab-dashboard">대시보드</TabsTrigger>
            <TabsTrigger value="detail" className="flex-1 sm:flex-none sm:px-5 text-xs sm:text-sm" data-testid="tab-detail">상세 데이터</TabsTrigger>
            <TabsTrigger value="upload" className="flex-1 sm:flex-none sm:px-5 text-xs sm:text-sm" data-testid="tab-upload">업로드 관리</TabsTrigger>
          </TabsList>

          {/* ══════════ 대시보드 ══════════ */}
          <TabsContent value="dashboard" className="space-y-6 mt-5">

            {!hasData && !summaryLoading && (
              <Card className="border-dashed border-2">
                <CardContent className="flex flex-col items-center justify-center py-16 gap-5">
                  <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Fuel className="w-8 h-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-lg text-foreground">유류비 데이터가 없습니다</p>
                    <p className="text-sm text-muted-foreground mt-1">Excel 파일을 업로드하면 자동으로 분석 대시보드가 생성됩니다</p>
                  </div>
                  <Button size="lg" onClick={() => setTab("upload")}>
                    <Upload className="w-4 h-4 mr-2" />업로드 관리로 이동
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* ── 연도별 KPI 카드 ── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[2024, 2025, 2026].map(yr => {
                const stat = years.find(y => y.year === yr);
                const prevStat = years.find(y => y.year === yr - 1);
                if (!stat) {
                  const p = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                  return (
                    <div key={yr} className={`rounded-2xl border border-dashed opacity-40 flex items-center justify-center h-[200px] ${p.bg}`} style={{ borderColor: p.stroke + "50" }}>
                      <div className="text-center text-muted-foreground">
                        <p className="text-lg font-bold" style={{ color: p.stroke }}>{shortYr(yr)}년</p>
                        <p className="text-xs mt-1">데이터 없음</p>
                      </div>
                    </div>
                  );
                }
                return <YearCard key={yr} stat={stat} prevStat={prevStat} />;
              })}
            </div>


            {/* ── 월별 추이 + 증감 통합 차트 ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <CardTitle className="text-base font-bold">월별 {metricLabel} 추이</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      연도별 월간 {metricLabel} 추이 비교
                    </p>
                  </div>
                  <div className="flex gap-1.5 bg-muted p-1 rounded-lg">
                    {(["fuel", "distance"] as const).map(m => (
                      <button
                        key={m}
                        className={`text-xs px-3 py-1.5 rounded-md font-semibold transition-all ${chartMetric === m ? "bg-background shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                        onClick={() => setChartMetric(m)}
                        data-testid={`button-metric-${m}`}
                      >
                        {m === "fuel" ? "유류비" : "주행거리"}
                      </button>
                    ))}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={340}>
                  <ComposedChart data={trendData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      {sortedYears.map(yr => {
                        const c = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                        return (
                          <linearGradient key={yr} id={`grad-${yr}`} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={c.gradient[0]} stopOpacity={0.18} />
                            <stop offset="95%" stopColor={c.gradient[1]} stopOpacity={0} />
                          </linearGradient>
                        );
                      })}
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="currentColor" strokeOpacity={0.07} />
                    <XAxis dataKey="month" tick={{ fontSize: 12, fill: "currentColor" }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                      tickFormatter={yFmt}
                      tickLine={false}
                      axisLine={false}
                      width={56}
                    />
                    <Tooltip
                      content={({ active, payload, label: lbl }) => {
                        if (!active || !payload?.length) return null;
                        return (
                          <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs min-w-[160px]">
                            <p className="font-bold text-sm mb-2">{lbl}</p>
                            {payload.map((p: any, i: number) => {
                              const c = YEAR_PALETTE[Number(p.dataKey)] ?? YEAR_PALETTE[2025];
                              return (
                                <div key={i} className="flex items-center justify-between gap-3 py-0.5">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full" style={{ background: c.stroke }} />
                                    <span className="text-muted-foreground">{shortYr(p.name)}년</span>
                                  </span>
                                  <span className="font-semibold tabular-nums" style={{ color: c.stroke }}>
                                    {p.value != null ? `${Number(p.value).toLocaleString()}${chartMetric === "distance" ? "만km" : "만원"}` : "-"}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      }}
                    />
                    <Legend
                      wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                      formatter={(v) => <span className="font-semibold">{v}년</span>}
                    />
                    {/* Area 추이선 */}
                    {sortedYears.map(yr => {
                      const c = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                      return (
                        <Area
                          key={yr}
                          type="monotone"
                          dataKey={`${yr}`}
                          name={`${yr}`}
                          stroke={c.stroke}
                          strokeWidth={yr === Math.max(...sortedYears) ? 2.5 : 2}
                          fill={`url(#grad-${yr})`}
                          dot={{ r: 3, fill: c.stroke, strokeWidth: 0 }}
                          activeDot={{ r: 5, fill: c.stroke, stroke: "white", strokeWidth: 2 }}
                          connectNulls={false}
                        />
                      );
                    })}
                  </ComposedChart>
                </ResponsiveContainer>

                {/* 월별 소계표 */}
                <div className="mt-4 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full text-[11px] border-collapse min-w-[900px]">
                    <thead>
                      <tr className="bg-muted/60">
                        <th className="text-left py-2.5 px-3 font-semibold text-muted-foreground whitespace-nowrap w-20">구분</th>
                        {MONTHS.map(m => <th key={m} className="text-right py-2.5 px-2 font-semibold text-muted-foreground whitespace-nowrap">{m}</th>)}
                        <th className="text-right py-2.5 px-3 font-semibold text-muted-foreground whitespace-nowrap">합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sortedYears.map((yr, ri) => {
                        const p = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                        const vals = MONTHS.map((_, mi) => {
                          const m = mi + 1;
                          const d = summary?.byYearMonth.find(x => x.year === yr && x.month === m);
                          if (!d) return null;
                          return chartMetric === "fuel" ? d.fuelCost : d.totalDistance;
                        });
                        const total = vals.reduce((s, v) => s + (v ?? 0), 0);
                        return (
                          <tr key={yr} className={`border-t border-border/40 ${ri % 2 === 1 ? "bg-muted/20" : ""}`}>
                            <td className={`py-2.5 px-3 font-bold whitespace-nowrap ${p.text}`}>{shortYr(yr)}년</td>
                            {vals.map((v, mi) => (
                              <td key={mi} className="text-right py-2 px-2 tabular-nums whitespace-nowrap">
                                {v != null
                                  ? <span className="font-medium">{chartMetric === "distance" ? `${(v / 10000).toFixed(1)}만km` : `${Math.round(v / 10000)}만원`}</span>
                                  : <span className="text-muted-foreground/30">-</span>}
                              </td>
                            ))}
                            <td className={`text-right py-2 px-3 font-black tabular-nums whitespace-nowrap ${p.text}`}>
                              {chartMetric === "distance" ? fmtK(total) : fmtM2(total)}
                            </td>
                          </tr>
                        );
                      })}
                      {/* 증감 행 */}
                      {sortedYears.length >= 2 && (() => {
                        const rows: React.ReactNode[] = [];
                        for (let i = 1; i < sortedYears.length; i++) {
                          const curYr = sortedYears[i], prevYr = sortedYears[i - 1];
                          const deltas = MONTHS.map((_, mi) => {
                            const m = mi + 1;
                            const cur = summary?.byYearMonth.find(x => x.year === curYr && x.month === m);
                            const prev = summary?.byYearMonth.find(x => x.year === prevYr && x.month === m);
                            if (!cur || !prev) return null;
                            const cV = chartMetric === "fuel" ? cur.fuelCost : cur.totalDistance;
                            const pV = chartMetric === "fuel" ? prev.fuelCost : prev.totalDistance;
                            return cV - pV;
                          });
                          const totalD = deltas.reduce((s, v) => s + (v ?? 0), 0);
                          rows.push(
                            <tr key={`d-${i}`} className="border-t border-border bg-muted/30">
                              <td className="py-2 px-3 text-muted-foreground font-semibold whitespace-nowrap">{shortYr(prevYr)}→{shortYr(curYr)}</td>
                              {deltas.map((v, mi) => (
                                <td key={mi} className={`text-right py-2 px-2 font-semibold tabular-nums whitespace-nowrap ${v == null ? "" : v > 0 ? "text-red-500" : v < 0 ? "text-blue-500" : "text-muted-foreground"}`}>
                                  {v != null ? `${v > 0 ? "+" : ""}${chartMetric === "distance" ? `${(v / 10000).toFixed(1)}만km` : `${Math.round(v / 10000)}만원`}` : "-"}
                                </td>
                              ))}
                              <td className={`text-right py-2 px-3 font-black tabular-nums whitespace-nowrap ${totalD > 0 ? "text-red-500" : totalD < 0 ? "text-blue-500" : "text-muted-foreground"}`}>
                                {totalD > 0 ? "+" : ""}{chartMetric === "distance" ? fmtK(Math.abs(totalD)) : fmtM2(Math.abs(totalD))}
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

            {/* ── 팀별 유류비 (전체 너비) ── */}
            <Card className="shadow-sm">
              <CardHeader className="pb-3">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div>
                    <CardTitle className="text-base font-bold">팀별 유류비 비교</CardTitle>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {teamTeamFilter === "all"
                        ? `주요 운용팀 기준 · ${shortYr(activeYearsForTeam[activeYearsForTeam.length - 1])}년 유류비 순 정렬`
                        : `${teamTeamFilter} · 월별 유류비 분석`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Select value={teamYearFilter} onValueChange={setTeamYearFilter}>
                      <SelectTrigger className="w-28 h-8" data-testid="select-team-year">
                        <SelectValue placeholder="연도" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체 연도</SelectItem>
                        {sortedYears.map(yr => <SelectItem key={yr} value={String(yr)}>{shortYr(yr)}년</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={teamTeamFilter} onValueChange={setTeamTeamFilter}>
                      <SelectTrigger className="w-36 h-8" data-testid="select-team-team">
                        <SelectValue placeholder="팀 선택" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">전체 팀 비교</SelectItem>
                        {teamsForChart.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {teamTeamFilter === "all" ? (
                  /* ── 전체 팀 비교 가로 막대 차트 ── */
                  <div className="w-full overflow-x-auto">
                  <div style={{ minWidth: 520, height: Math.max(320, teamChartData.length * 44 + 60) }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={teamChartData}
                      layout="vertical"
                      barCategoryGap="30%"
                      barGap={3}
                      margin={{ top: 4, right: 80, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="currentColor" strokeOpacity={0.07} />
                      <XAxis
                        type="number"
                        tick={{ fontSize: 11, fill: "currentColor", opacity: 0.5 }}
                        tickFormatter={v => v === 0 ? "0" : `${v}만`}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        type="category"
                        dataKey="team"
                        tick={{ fontSize: 13, fontWeight: 600, fill: "currentColor" }}
                        width={115}
                        tickLine={false}
                        axisLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs min-w-[140px]">
                              <p className="font-bold text-sm mb-2">{label}</p>
                              {payload.map((p: any, i: number) => (
                                <div key={i} className="flex items-center justify-between gap-4 py-0.5">
                                  <span className="flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-sm" style={{ background: p.fill }} />
                                    <span className="text-muted-foreground">{shortYr(p.name)}년</span>
                                  </span>
                                  <span className="font-semibold tabular-nums">{Number(p.value).toLocaleString()}만원</span>
                                </div>
                              ))}
                            </div>
                          );
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        formatter={(v) => <span className="font-semibold">{shortYr(String(v))}년</span>}
                      />
                      {activeYearsForTeam.map((yr) => {
                        const c = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                        return (
                          <Bar key={yr} dataKey={`${yr}`} name={`${yr}`} fill={c.fill} radius={[0, 5, 5, 0]} maxBarSize={28}>
                            <LabelList
                              dataKey={`${yr}`}
                              position="right"
                              style={{ fontSize: 11, fontWeight: 700, fill: c.fill }}
                              formatter={(v: number) => v > 0 ? `${v.toLocaleString()}만` : ""}
                            />
                          </Bar>
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                  </div>
                  </div>
                ) : (
                  /* ── 선택 팀 월별 분석 차트 ── */
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart
                      data={monthlyTeamChartData}
                      barCategoryGap="28%"
                      barGap={3}
                      margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.07} />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12, fill: "currentColor" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "currentColor", opacity: 0.6 }}
                        tickFormatter={v => v === 0 ? "0" : `${v}만`}
                        tickLine={false}
                        axisLine={false}
                        width={52}
                      />
                      <Tooltip
                        cursor={{ fill: "currentColor", fillOpacity: 0.04 }}
                        content={({ active, payload, label }) => {
                          if (!active || !payload?.length) return null;
                          return (
                            <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-xs min-w-[150px]">
                              <p className="font-bold text-sm mb-2">{teamTeamFilter} · {label}</p>
                              {payload.map((p: any, i: number) => {
                                const c = YEAR_PALETTE[Number(p.name)] ?? YEAR_PALETTE[2025];
                                return (
                                  <div key={i} className="flex items-center justify-between gap-4 py-0.5">
                                    <span className="flex items-center gap-1.5">
                                      <span className="w-2 h-2 rounded-sm" style={{ background: c.fill }} />
                                      <span className="text-muted-foreground">{shortYr(p.name)}년</span>
                                    </span>
                                    <span className="font-semibold tabular-nums" style={{ color: c.stroke }}>
                                      {Number(p.value).toLocaleString()}만원
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                        formatter={(v) => <span className="font-semibold">{shortYr(String(v))}년</span>}
                      />
                      {activeYearsForTeam.map((yr) => {
                        const c = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                        return (
                          <Bar key={yr} dataKey={`${yr}`} name={`${yr}`} fill={c.fill} radius={[4, 4, 0, 0]} maxBarSize={36} />
                        );
                      })}
                    </BarChart>
                  </ResponsiveContainer>
                )}

                {/* 팀별 연도별 비교표 */}
                <div className="mt-5 overflow-x-auto rounded-lg border border-border">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr className="bg-muted/70 border-b-2 border-border">
                        <th className="text-left py-2.5 px-4 font-bold text-foreground whitespace-nowrap">팀</th>
                        {sortedYears.map(yr => {
                          const p = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                          return <th key={yr} className={`text-right py-2.5 px-4 font-bold whitespace-nowrap ${p.text}`}>{shortYr(yr)}년</th>;
                        })}
                        {sortedYears.length >= 2 && sortedYears.slice(0, -1).map((yr, idx) => (
                          <th key={`delta-${yr}`} className="text-right py-2.5 px-4 font-bold text-foreground whitespace-nowrap">
                            {shortYr(yr)}→{shortYr(sortedYears[idx + 1])} 증감
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {yearCompTable.map((row, i) => (
                        <tr
                          key={i}
                          className={`border-b border-border/50 hover:bg-muted/30 transition-colors cursor-pointer ${i % 2 === 0 ? "" : "bg-muted/15"} ${teamTeamFilter === row.team ? "ring-1 ring-inset ring-primary/30 bg-primary/5" : ""}`}
                          onClick={() => setTeamTeamFilter(teamTeamFilter === row.team ? "all" : row.team)}
                        >
                          <td className="py-2.5 px-4 font-semibold text-foreground whitespace-nowrap">{row.team}</td>
                          {sortedYears.map(yr => {
                            const p = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                            return (
                              <td key={yr} className="text-right py-2.5 px-4 tabular-nums whitespace-nowrap">
                                {row[yr] > 0 ? <span className={`font-semibold ${p.text}`}>{fmtM2(row[yr])}</span> : <span className="text-muted-foreground/50">-</span>}
                              </td>
                            );
                          })}
                          {sortedYears.length >= 2 && sortedYears.slice(0, -1).map((yr, idx) => {
                            const nextYr = sortedYears[idx + 1];
                            const delta = (row[nextYr] ?? 0) - (row[yr] ?? 0);
                            const dPct = row[yr] > 0 ? (delta / row[yr]) * 100 : null;
                            return (
                              <td key={`delta-${yr}`} className="text-right py-2.5 px-4 tabular-nums whitespace-nowrap">
                                {row[yr] > 0 ? (
                                  <span className={`font-bold ${delta > 0 ? "text-red-600" : delta < 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                                    {delta > 0 ? "▲ " : delta < 0 ? "▼ " : ""}{fmtM2(Math.abs(delta))}
                                    <span className="ml-1 text-[11px] font-medium">
                                      ({dPct !== null ? `${dPct > 0 ? "+" : ""}${dPct.toFixed(1)}%` : "-"})
                                    </span>
                                  </span>
                                ) : <span className="text-muted-foreground/50">-</span>}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/50 border-t-2 border-border">
                        <td className="py-2.5 px-4 font-black text-foreground whitespace-nowrap">전체 합계</td>
                        {sortedYears.map(yr => {
                          const stat = years.find(y => y.year === yr);
                          const p = YEAR_PALETTE[yr] ?? YEAR_PALETTE[2025];
                          return (
                            <td key={yr} className={`text-right py-2.5 px-4 font-black tabular-nums whitespace-nowrap ${p.text}`}>
                              {stat ? fmtM2(stat.fuelCost) : "-"}
                            </td>
                          );
                        })}
                        {sortedYears.length >= 2 && sortedYears.slice(0, -1).map((yr, idx) => {
                          const nextYr = sortedYears[idx + 1];
                          const prev = years.find(y => y.year === yr);
                          const cur = years.find(y => y.year === nextYr);
                          const d = cur && prev ? cur.fuelCost - prev.fuelCost : null;
                          const dp = cur && prev && prev.fuelCost > 0 ? ((cur.fuelCost - prev.fuelCost) / prev.fuelCost) * 100 : null;
                          return (
                            <td key={`tfoot-delta-${yr}`} className="text-right py-2.5 px-4 tabular-nums whitespace-nowrap">
                              {d !== null ? (
                                <span className={`font-black ${d > 0 ? "text-red-600" : d < 0 ? "text-blue-600" : "text-muted-foreground"}`}>
                                  {d > 0 ? "▲ " : d < 0 ? "▼ " : ""}{fmtM2(Math.abs(d))}
                                  <span className="ml-1 text-xs font-bold">
                                    ({dp !== null ? `${dp > 0 ? "+" : ""}${dp.toFixed(1)}%` : "-"})
                                  </span>
                                </span>
                              ) : "-"}
                            </td>
                          );
                        })}
                      </tr>
                    </tfoot>
                  </table>
                </div>
                {teamTeamFilter !== "all" && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">표의 팀 행을 클릭하면 해당 팀의 월별 분석을 볼 수 있습니다</p>
                )}
              </CardContent>
            </Card>

          </TabsContent>

          {/* ══════════ 상세 데이터 ══════════ */}
          <TabsContent value="detail" className="space-y-4 mt-5">
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-28 h-9" data-testid="select-year"><SelectValue placeholder="연도" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 연도</SelectItem>
                  {sortedYears.map(yr => <SelectItem key={yr} value={String(yr)}>{shortYr(yr)}년</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterMonth} onValueChange={setFilterMonth}>
                <SelectTrigger className="w-24 h-9" data-testid="select-month"><SelectValue placeholder="월" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 월</SelectItem>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterTeam} onValueChange={setFilterTeam}>
                <SelectTrigger className="w-36 h-9" data-testid="select-team"><SelectValue placeholder="팀" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 팀</SelectItem>
                  {(summary?.byTeam ?? []).map(t => <SelectItem key={t.team} value={t.team}>{t.team}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterFuelType} onValueChange={setFilterFuelType}>
                <SelectTrigger className="w-28 h-9" data-testid="select-fuel-type"><SelectValue placeholder="연료" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체 연료</SelectItem>
                  <SelectItem value="경유">경유</SelectItem>
                  <SelectItem value="휘발유">휘발유</SelectItem>
                  <SelectItem value="EV">EV</SelectItem>
                </SelectContent>
              </Select>
              <div className="relative flex-1 min-w-[180px]">
                <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
                <Input data-testid="input-search" placeholder="팀·사용자·차량번호·모델 검색" className="pl-9 h-9" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
            </div>

            <Card className="shadow-sm">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  {recordsLoading ? (
                    <div className="flex items-center justify-center py-20 text-muted-foreground gap-2">
                      <RefreshCw className="w-4 h-4 animate-spin" /> 불러오는 중...
                    </div>
                  ) : filtered.length === 0 ? (
                    <div className="flex items-center justify-center py-20 text-muted-foreground text-sm">데이터가 없습니다</div>
                  ) : (
                    <table className="w-full text-sm border-collapse">
                      <thead>
                        <tr className="bg-muted/70 border-b-2 border-border">
                          <th className="text-left py-3 px-4 font-bold text-foreground whitespace-nowrap">연월</th>
                          <th className="text-left py-3 px-3 font-bold text-foreground whitespace-nowrap">팀</th>
                          <th className="text-left py-3 px-3 font-bold text-foreground whitespace-nowrap">사용자</th>
                          <th className="text-left py-3 px-3 font-bold text-foreground whitespace-nowrap">차량번호</th>
                          <th className="text-left py-3 px-3 font-bold text-foreground whitespace-nowrap">모델</th>
                          <th className="text-left py-3 px-3 font-bold text-foreground whitespace-nowrap">연료</th>
                          <th className="text-left py-3 px-3 font-bold text-foreground whitespace-nowrap">구입형태</th>
                          <th className="text-right py-3 px-3 font-bold text-foreground whitespace-nowrap cursor-pointer hover:text-primary" onClick={() => handleSort("totalDistance")}>
                            주행(km) <SortIcon field="totalDistance" />
                          </th>
                          <th className="text-right py-3 px-3 font-bold text-foreground whitespace-nowrap cursor-pointer hover:text-primary" onClick={() => handleSort("cardFuelCost")}>
                            유류비 <SortIcon field="cardFuelCost" />
                          </th>
                          <th className="text-right py-3 px-4 font-bold text-foreground whitespace-nowrap cursor-pointer hover:text-primary" onClick={() => handleSort("totalCost")}>
                            합계 <SortIcon field="totalCost" />
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.slice(0, 300).map((r, i) => {
                          const p = YEAR_PALETTE[r.year] ?? YEAR_PALETTE[2025];
                          return (
                            <tr key={r.id} className={`border-b border-border/40 hover:bg-muted/30 transition-colors ${i % 2 === 1 ? "bg-muted/10" : ""}`} data-testid={`row-fuel-${r.id}`}>
                              <td className="py-2.5 px-4 whitespace-nowrap">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${p.badgeBg}`}>{shortYr(r.year)}년 {r.month}월</span>
                              </td>
                              <td className="py-2.5 px-3 text-sm font-medium">{r.team}</td>
                              <td className="py-2.5 px-3 text-sm text-muted-foreground">{r.driver || "-"}</td>
                              <td className="py-2.5 px-3 font-mono text-xs font-semibold">{r.licensePlate}</td>
                              <td className="py-2.5 px-3 text-sm">{r.modelName}</td>
                              <td className="py-2.5 px-3">
                                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ color: FUEL_COLORS[r.fuelType ?? ""] ?? "#6b7280", background: `${FUEL_COLORS[r.fuelType ?? ""] ?? "#6b7280"}18` }}>
                                  {r.fuelType}
                                </span>
                              </td>
                              <td className="py-2.5 px-3 text-sm text-muted-foreground">{r.acquisitionType}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-sm">{r.totalDistance ? fmt(r.totalDistance) : "-"}</td>
                              <td className="py-2.5 px-3 text-right tabular-nums text-sm">{(r.cardFuelCost || r.cashFuelCost) ? fmt((r.cardFuelCost ?? 0) + (r.cashFuelCost ?? 0)) : "-"}</td>
                              <td className="py-2.5 px-4 text-right tabular-nums font-bold text-sm">{r.totalCost ? fmt(r.totalCost) : "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
                {filtered.length > 300 && (
                  <p className="text-xs text-muted-foreground px-4 py-3 border-t border-border">상위 300건만 표시됩니다. 필터를 적용하여 범위를 좁혀주세요.</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ══════════ 업로드 관리 ══════════ */}
          <TabsContent value="upload" className="space-y-5 mt-5">
            <Card className="shadow-sm">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Upload className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <p className="font-bold text-base">Excel 파일 업로드</p>
                    <p className="text-sm text-muted-foreground mt-0.5">같은 연월의 기존 데이터는 자동으로 교체됩니다.</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-xl">
                  <div>
                    <p className="text-xs font-bold text-foreground mb-1.5">📋 다중 시트 파일 (자동 처리)</p>
                    <p className="text-xs text-muted-foreground">"24년 1월", "25년 12월" 형식 시트명 → 자동 인식</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold text-foreground mb-1.5">📄 단일 시트 파일</p>
                    <p className="text-xs text-muted-foreground">파일명에 날짜(YYYYMMDD) 포함 시 자동 인식<br />예: 차량사용실적현황_<strong>20260330</strong>_xxx.xlsx</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-sm font-medium text-muted-foreground">연월 수동 지정:</span>
                  <Select value={uploadYear} onValueChange={setUploadYear}>
                    <SelectTrigger className="w-24 h-9"><SelectValue placeholder="연도" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">자동</SelectItem>
                      {uploadYearOptions.map(y => <SelectItem key={y} value={y}>{y}년</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={uploadMonth} onValueChange={setUploadMonth}>
                    <SelectTrigger className="w-20 h-9"><SelectValue placeholder="월" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">자동</SelectItem>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {uploadYear && uploadYear !== "auto" && uploadMonth && uploadMonth !== "auto" && (
                    <Badge className="bg-primary/10 text-primary border-0 font-semibold">{uploadYear}년 {uploadMonth}월</Badge>
                  )}
                  <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending} className="ml-auto">
                    {uploadMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    파일 선택
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 차량일지 업로드 카드 */}
            <Card className="shadow-sm border-blue-200 dark:border-blue-900">
              <CardContent className="p-6 space-y-5">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center shrink-0">
                    <Car className="w-6 h-6 text-blue-500" />
                  </div>
                  <div>
                    <p className="font-bold text-base">차량일지 업로드</p>
                    <p className="text-sm text-muted-foreground mt-0.5">차량일지 형식 엑셀(행=운행기록)을 업로드합니다. 같은 연월 기존 데이터는 교체됩니다.</p>
                  </div>
                </div>

                <div className="p-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl text-xs space-y-1.5">
                  <p className="font-bold text-foreground text-sm mb-2">📋 차량일지 파일 형식</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="font-semibold text-foreground mb-1">단일 시트 파일</p>
                      <p className="text-muted-foreground">파일명에 연월 포함: <strong className="text-foreground">차량일지_26년_3월.xlsx</strong></p>
                      <p className="text-muted-foreground mt-0.5">시트명: <strong className="text-foreground">차량일지</strong></p>
                    </div>
                    <div>
                      <p className="font-semibold text-foreground mb-1">다중 시트 파일</p>
                      <p className="text-muted-foreground">시트명에 연월 포함: <strong className="text-foreground">차량일지_26년 3월</strong></p>
                      <p className="text-muted-foreground mt-0.5">여러 달을 하나의 파일로 업로드 가능</p>
                    </div>
                  </div>
                  <p className="text-muted-foreground pt-1 border-t border-blue-200 dark:border-blue-800">• 컬럼: 차량번호, 출발시간, 시작km, 종료km, 주유금액, 탑승자 자동 인식</p>
                  <p className="text-muted-foreground">• 팀·연료·구입형태 메타데이터는 기존 DB에서 자동 매핑</p>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs text-muted-foreground">연월 수동 지정 (파일명 자동인식 시 생략 가능):</span>
                  <Select value={vlogYear} onValueChange={setVlogYear}>
                    <SelectTrigger className="w-24 h-9" data-testid="select-vlog-year"><SelectValue placeholder="연도" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">자동</SelectItem>
                      {uploadYearOptions.map(y => <SelectItem key={y} value={y}>{y}년</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Select value={vlogMonth} onValueChange={setVlogMonth}>
                    <SelectTrigger className="w-20 h-9" data-testid="select-vlog-month"><SelectValue placeholder="월" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">자동</SelectItem>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  {vlogYear && vlogYear !== "none" && vlogMonth && vlogMonth !== "none" && (
                    <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0 font-semibold">{vlogYear}년 {vlogMonth}월 (수동)</Badge>
                  )}
                  <Button
                    variant="outline"
                    className="ml-auto border-blue-400 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30"
                    onClick={() => vehicleLogInputRef.current?.click()}
                    disabled={vehicleLogMutation.isPending}
                    data-testid="button-upload-vehicle-log"
                  >
                    {vehicleLogMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                    차량일지 파일 선택
                  </Button>
                </div>
              </CardContent>
            </Card>

            <div>
              <h3 className="text-sm font-bold text-foreground mb-3">업로드 이력</h3>
              {batchesLoading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />불러오는 중...
                </div>
              ) : batches.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10">업로드 이력이 없습니다</p>
              ) : (
                <div className="space-y-2">
                  {batches.map((b, i) => (
                    <Card key={i} className="shadow-sm" data-testid={`card-batch-${i}`}>
                      <CardContent className="flex items-center justify-between p-4 gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold">{new Date(b.uploadedAt).toLocaleString("ko-KR")}</span>
                            <Badge variant="secondary" className="text-xs font-semibold">{fmt(b.recordCount)}건</Badge>
                          </div>
                          <div className="flex flex-wrap gap-1 mt-2">
                            {b.yearMonths.slice(0, 14).map((ym, j) => (
                              <span key={j} className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-medium text-muted-foreground">{ym}</span>
                            ))}
                            {b.yearMonths.length > 14 && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-muted rounded font-medium text-muted-foreground">+{b.yearMonths.length - 14}개월</span>
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

      <AlertDialog open={!!deleteBatchId} onOpenChange={o => !o && setDeleteBatchId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업로드 데이터 삭제</AlertDialogTitle>
            <AlertDialogDescription>이 업로드 배치의 모든 유류비 데이터가 삭제됩니다. 이 작업은 되돌릴 수 없습니다.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction className="bg-red-500 hover:bg-red-600" onClick={() => deleteBatchId && deleteBatchMutation.mutate(deleteBatchId)}>
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
