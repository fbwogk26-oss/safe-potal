import { useState, useRef, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Card, CardContent, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LabelList,
} from "recharts";
import {
  Upload, Trash2, AlertTriangle, CheckCircle2,
  Clock, XCircle, ShieldCheck, ShieldAlert, FileWarning,
  TrendingUp, Users, Loader2, Eye, ChevronUp, Layers,
  CalendarDays, Calendar, ChevronLeft, ChevronRight,
} from "lucide-react";
import type { AisSafetyUpload, AisSafetyRecord } from "@shared/schema";

const HIGH_RISK_TYPES = ['고소', '전원', '중장비', '굴착', '밀폐', '화기'];

function isHighRiskWork(val: string | null | undefined): boolean {
  if (!val || val === '없음' || val === 'X' || val.trim() === '') return false;
  return HIGH_RISK_TYPES.some(t => val.includes(t));
}

function isCancelled(r: AisSafetyRecord) {
  return r.workStatus?.includes('취소') ?? false;
}

function calcCompliance(records: AisSafetyRecord[]) {
  const active = records.filter(r => !isCancelled(r));
  if (!active.length) return { rate: 0, issues: [], highRiskNoPermit: [], tbmUnreg: [], tbmBad: [] };
  const highRiskNoPermit = active.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y');
  const tbmUnreg = active.filter(r => r.tbmResult === '미등록');
  const tbmBad = active.filter(r => r.tbmAiResult === '부적합');
  const allItems = [
    { label: '고위험작업 안전허가서 미등록', list: highRiskNoPermit },
    { label: 'TBM 활동 미등록', list: tbmUnreg },
    { label: 'TBM AI 부적합', list: tbmBad },
  ];
  let total = 0, pass = 0;
  const issues: { label: string; count: number; list: AisSafetyRecord[] }[] = [];
  for (const item of allItems) {
    total += active.length;
    pass += active.length - item.list.length;
    if (item.list.length > 0) issues.push({ ...item, count: item.list.length });
  }
  return { rate: total > 0 ? Math.round((pass / total) * 100) : 100, highRiskNoPermit, tbmUnreg, tbmBad, issues };
}

const RISK_COLORS: Record<string, string> = { '상': '#ef4444', '중': '#f59e0b', '하': '#22c55e', '없음': '#94a3b8' };

const HIGH_RISK_COLOR: Record<string, string> = {
  '고소': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  '전원': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  '중장비': 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  '굴착': 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  '밀폐': 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  '화기': 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
};

function RateBadge({ value }: { value: number }) {
  const color = value >= 90 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
    : value >= 70 ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
      : 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
  return <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${color}`}>{value}%</span>;
}

function StatusBadge({ value }: { value: string | null }) {
  const v = value || '';
  if (v === '적합') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />적합</Badge>;
  if (v === '부적합') return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-xs font-semibold"><XCircle className="w-3 h-3 mr-1" />부적합</Badge>;
  if (v === '분석중') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0 text-xs font-semibold"><Loader2 className="w-3 h-3 mr-1 animate-spin" />분석중</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs"><Clock className="w-3 h-3 mr-1" />분석전</Badge>;
}

function PermitBadge({ value, highRisk }: { value: string | null; highRisk: string | null }) {
  const hr = isHighRiskWork(highRisk);
  if (value === 'Y') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />등록</Badge>;
  if (hr) return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-xs font-semibold"><AlertTriangle className="w-3 h-3 mr-1" />미등록</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs">해당없음</Badge>;
}

function RegBadge({ value }: { value: string | null }) {
  if (value === '등록') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />등록</Badge>;
  return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-xs"><XCircle className="w-3 h-3 mr-1" />미등록</Badge>;
}

function HighRiskBadge({ value }: { value: string | null }) {
  const v = value || '없음';
  if (!isHighRiskWork(v)) return <Badge className="bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500 border-0 text-xs">없음</Badge>;
  const matched = HIGH_RISK_TYPES.find(t => v.includes(t));
  const cls = matched ? (HIGH_RISK_COLOR[matched] || 'bg-orange-100 text-orange-700') : 'bg-orange-100 text-orange-700';
  return <Badge className={`${cls} border-0 text-xs font-semibold`}><AlertTriangle className="w-3 h-3 mr-1" />{v}</Badge>;
}

function getHighRiskBreakdown(records: AisSafetyRecord[]) {
  const types = HIGH_RISK_TYPES.map(type => {
    const matched = records.filter(r => r.highRiskWork && r.highRiskWork.includes(type));
    return { type, total: matched.length, permit: matched.filter(r => r.safetyPermit === 'Y').length, noPermit: matched.filter(r => r.safetyPermit !== 'Y').length, isNone: false };
  });
  const noneCount = records.filter(r => !isHighRiskWork(r.highRiskWork)).length;
  types.push({ type: '없음', total: noneCount, permit: 0, noPermit: 0, isNone: true });
  return types;
}

function CircleGauge({ rate }: { rate: number }) {
  const r = 56, circ = 2 * Math.PI * r, dash = (rate / 100) * circ;
  const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/20" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10" strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color }}>{rate}</span>
        <span className="text-xs font-semibold text-muted-foreground">%</span>
      </div>
    </div>
  );
}

// 팀별 현황 카드
function TeamBreakdown({ records, title }: { records: AisSafetyRecord[]; title: string }) {
  const teams = [...new Set(records.map(r => r.team).filter(Boolean))] as string[];
  if (teams.length === 0) return null;
  const teamStats = teams.map(team => {
    const tr = records.filter(r => r.team === team);
    const c = calcCompliance(tr);
    return { team, count: tr.length, rate: c.rate, issues: c.issues.reduce((a, b) => a + b.count, 0) };
  }).sort((a, b) => b.count - a.count);

  return (
    <Card className="border-0 shadow-sm bg-card/60">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          {title} — 팀별 현황
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {teamStats.map(s => (
            <div key={s.team} className="p-3 rounded-lg border bg-card/80">
              <p className="text-xs font-semibold text-muted-foreground mb-1 truncate" title={s.team}>{s.team}</p>
              <p className="text-xl font-black leading-none mb-1.5">{s.count}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></p>
              <RateBadge value={s.rate} />
              {s.issues > 0 && <p className="text-xs text-red-600 font-semibold mt-1">이슈 {s.issues}건</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

type ViewMode = 'cumulative' | 'daily' | 'monthly';

export default function AisSafetyRate() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('cumulative');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterIssue, setFilterIssue] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [activeIssue, setActiveIssue] = useState<{ label: string; list: AisSafetyRecord[] } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [pageSize, setPageSize] = useState(30);
  const [currentPage, setCurrentPage] = useState(1);
  const [highRiskPageSize, setHighRiskPageSize] = useState(30);
  const [highRiskPage, setHighRiskPage] = useState(1);

  const { data: uploads = [] } = useQuery<AisSafetyUpload[]>({
    queryKey: ['/api/ais-safety/uploads'],
  });

  const { data: allRecords = [], isLoading: recordsLoading } = useQuery<AisSafetyRecord[]>({
    queryKey: ['/api/ais-safety/records/all'],
    enabled: uploads.length > 0,
    queryFn: async () => {
      const res = await fetch('/api/ais-safety/records/all', { credentials: 'include' });
      if (!res.ok) throw new Error('레코드 조회 실패');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const dailyGroups = useMemo(() => {
    const groups: Record<string, AisSafetyRecord[]> = {};
    for (const r of allRecords) {
      if (!r.startDate) continue;
      if (!groups[r.startDate]) groups[r.startDate] = [];
      groups[r.startDate].push(r);
    }
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, recs]) => ({ date, records: recs, ...calcCompliance(recs.filter(r => r.workStatus !== '취소')) }));
  }, [allRecords]);

  const monthlyGroups = useMemo(() => {
    const groups: Record<string, AisSafetyRecord[]> = {};
    for (const r of allRecords) {
      if (!r.startDate || r.startDate.length < 7) continue;
      const month = r.startDate.substring(0, 7);
      if (!groups[month]) groups[month] = [];
      groups[month].push(r);
    }
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([month, recs]) => ({ month, records: recs, ...calcCompliance(recs.filter(r => r.workStatus !== '취소')) }));
  }, [allRecords]);

  const records = useMemo(() => {
    if (viewMode === 'cumulative') return allRecords;
    if (viewMode === 'daily' && selectedDate) return allRecords.filter(r => r.startDate === selectedDate);
    if (viewMode === 'monthly' && selectedMonth) return allRecords.filter(r => r.startDate?.startsWith(selectedMonth));
    return [];
  }, [allRecords, viewMode, selectedDate, selectedMonth]);

  // 대시보드 계산용: 취소된 작업 제외
  const activeRecords = useMemo(() => records.filter(r => r.workStatus !== '취소'), [records]);

  const showDashboard = viewMode === 'cumulative' ||
    (viewMode === 'daily' && selectedDate !== null) ||
    (viewMode === 'monthly' && selectedMonth !== null);

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/ais-safety/uploads/${id}`, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/uploads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/records/all'] });
      toast({ title: '삭제되었습니다' });
    },
  });

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast({ title: 'CSV 파일만 업로드 가능합니다', variant: 'destructive' });
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('csv', file);
      const res = await fetch('/api/ais-safety/upload', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || '업로드 실패');
      queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/uploads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/records/all'] });
      setViewMode('cumulative');
      toast({ title: `${data.recordCount}건 누적 데이터에 추가되었습니다` });
    } catch (err: any) {
      toast({ title: err.message || '업로드 실패', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const comp = calcCompliance(activeRecords);
  const teams = [...new Set(records.map(r => r.team).filter(Boolean))];
  const highRiskRecords = activeRecords.filter(r => isHighRiskWork(r.highRiskWork));
  const highRiskBreakdown = getHighRiskBreakdown(activeRecords);

  const filteredRecords = records.filter(r => {
    if (filterTeam !== 'all' && r.team !== filterTeam) return false;
    if (filterIssue === 'highRisk' && !isHighRiskWork(r.highRiskWork)) return false;
    if (filterIssue === 'noPermit' && !(isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y')) return false;
    if (filterIssue === 'tbmUnreg' && r.tbmResult !== '미등록') return false;
    if (filterIssue === 'tbmBad' && r.tbmAiResult !== '부적합') return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.workOrderNo || '').toLowerCase().includes(q)
        || (r.workName || '').toLowerCase().includes(q)
        || (r.team || '').toLowerCase().includes(q)
        || (r.vendorName || '').toLowerCase().includes(q)
        || (r.workLocation || '').toLowerCase().includes(q);
    }
    return true;
  });

  const totalPages = Math.ceil(filteredRecords.length / pageSize);
  const safePage = Math.min(currentPage, Math.max(1, totalPages));
  const pagedRecords = filteredRecords.slice((safePage - 1) * pageSize, safePage * pageSize);

  // 필터 변경 시 첫 페이지로
  const resetPage = () => setCurrentPage(1);

  // TBM AI 분석결과 — 분석전/적합/부적합/분석중 순 (취소 제외)
  const tbmAiData = [
    { name: '분석전', value: activeRecords.filter(r => !r.tbmAiResult || r.tbmAiResult === '분석전').length, color: '#94a3b8' },
    { name: '적합', value: activeRecords.filter(r => r.tbmAiResult === '적합').length, color: '#22c55e' },
    { name: '부적합', value: activeRecords.filter(r => r.tbmAiResult === '부적합').length, color: '#ef4444' },
    { name: '분석중', value: activeRecords.filter(r => r.tbmAiResult === '분석중').length, color: '#f59e0b' },
  ].filter(d => d.value > 0);

  const teamData = teams.map(team => {
    const tr = activeRecords.filter(r => r.team === team);
    const c = calcCompliance(tr);
    return { team: team?.replace('운용팀', '').replace('팀', '') || '미지정', fullTeam: team || '', rate: c.rate, count: tr.length };
  }).sort((a, b) => b.rate - a.rate);

  const complianceItems = [
    { label: '안전허가서 매칭', icon: ShieldCheck, total: highRiskRecords.length, pass: highRiskRecords.filter(r => r.safetyPermit === 'Y').length, description: '고위험작업 시 안전허가서 등록', emptyLabel: '고위험작업 없음' },
    { label: 'TBM 등록률', icon: Users, total: activeRecords.length, pass: activeRecords.filter(r => r.tbmResult === '등록').length, description: 'TBM 활동 등록 여부', emptyLabel: '데이터 없음' },
  ];

  const dailyTrendData = dailyGroups.filter(g => g.date !== '날짜 미상').slice(0, 14).reverse()
    .map(g => ({ date: g.date.replace(/^\d{4}-/, ''), rate: g.rate, count: g.records.length, fullDate: g.date }));

  const monthlyTrendData = monthlyGroups.filter(g => g.month !== '월 미상').slice(0, 12).reverse()
    .map(g => ({ month: g.month, rate: g.rate, count: g.records.length }));

  const tabBtn = (mode: ViewMode, icon: any, label: string) => {
    const Icon = icon;
    const active = viewMode === mode;
    return (
      <button data-testid={`tab-${mode}`}
        onClick={() => { setViewMode(mode); setSelectedDate(null); setSelectedMonth(null); setShowDetail(false); }}
        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${active ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/60'}`}>
        <Icon className="w-4 h-4" />{label}
      </button>
    );
  };

  // 드릴다운 헤더 라벨
  const drilldownLabel = viewMode === 'daily' && selectedDate
    ? selectedDate
    : viewMode === 'monthly' && selectedMonth
      ? selectedMonth
      : null;

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">AIS 안전이행률</h1>
          <p className="text-sm text-muted-foreground mt-0.5">6대 고위험작업 안전허가서 매칭 및 TBM AI 분석 현황</p>
        </div>
        <div className="flex items-center gap-2">
          {showDashboard && (
            <Button variant="outline" size="sm" onClick={() => setShowDetail(!showDetail)} data-testid="button-toggle-detail">
              {showDetail ? <ChevronUp className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
              {showDetail ? '대시보드' : '상세 목록'}
            </Button>
          )}
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} data-testid="input-csv" />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="button-upload-csv" className="bg-blue-600 hover:bg-blue-700 text-white">
            {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />업로드 중...</> : <><Upload className="w-4 h-4 mr-2" />CSV 업로드</>}
          </Button>
        </div>
      </div>

      {/* Empty state */}
      {uploads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h3 className="font-bold text-lg">AIS CSV 파일을 업로드하세요</h3>
            <p className="text-sm text-muted-foreground mt-1">공사작업 현황 CSV 파일을 업로드하면 안전이행률을 자동 분석합니다</p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-upload-empty">
            <Upload className="w-4 h-4 mr-2" />CSV 파일 선택
          </Button>
        </div>
      )}

      {/* Tab selector */}
      {uploads.length > 0 && (
        <Card className="border-0 shadow-sm bg-card/60 backdrop-blur-sm">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl mb-4 w-fit">
              {tabBtn('cumulative', Layers, '전체 누적')}
              {tabBtn('daily', CalendarDays, '일단위 관리')}
              {tabBtn('monthly', Calendar, '월단위 관리')}
            </div>

            {/* 전체 누적: 업로드 파일 목록 */}
            {viewMode === 'cumulative' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Layers className="w-3.5 h-3.5 text-blue-500" />
                  <span>전체 {uploads.length}개 파일 · 총 {uploads.reduce((s, u) => s + (u.recordCount || 0), 0)}건 합산 분석</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {uploads.map(u => (
                    <div key={u.id} className="flex items-stretch gap-1">
                      <div className="flex-1 px-3 py-2.5 rounded-lg border border-border bg-muted/20 text-sm">
                        <div className="font-medium truncate text-xs">{u.fileName}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                          <span>{u.workDate || '날짜 미상'}</span><span>·</span>
                          <span className="font-semibold">{u.recordCount}건</span>
                        </div>
                      </div>
                      <button onClick={() => deleteMutation.mutate(u.id)}
                        className="px-2 rounded-lg border border-border hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 text-muted-foreground transition-colors flex-shrink-0"
                        data-testid={`button-delete-upload-${u.id}`} title="삭제">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 일단위 관리 */}
            {viewMode === 'daily' && (
              <div className="space-y-4">
                {selectedDate ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setSelectedDate(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronLeft className="w-3.5 h-3.5" />날짜 목록으로
                    </button>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-sm font-bold text-blue-600">{selectedDate}</span>
                    <RateBadge value={comp.rate} />
                    <span className="text-xs text-muted-foreground">({records.length}건)</span>
                  </div>
                ) : (
                  <>
                    {dailyTrendData.length > 1 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">일별 이행률 추세 (최근 {dailyTrendData.length}일)</p>
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={dailyTrendData} margin={{ left: -20, right: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                            <ReTooltip formatter={(v: any, _: any, p: any) => [`${v}% (${p.payload.count}건)`, '이행률']} />
                            <Bar dataKey="rate" radius={[4, 4, 0, 0]} onClick={(d) => setSelectedDate(d.fullDate)}>
                              {dailyTrendData.map((entry, i) => (
                                <Cell key={i} fill={entry.rate >= 90 ? '#22c55e' : entry.rate >= 70 ? '#f59e0b' : '#ef4444'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-muted-foreground">날짜를 선택하면 해당 일의 상세 현황을 확인합니다</p>
                    {recordsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />데이터 불러오는 중...</div>
                    ) : dailyGroups.length === 0 ? (
                      <p className="text-sm text-muted-foreground">날짜별 데이터가 없습니다</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {dailyGroups.map(g => {
                          const totalIssues = (g.issues || []).reduce((a, b) => a + b.count, 0);
                          const issueRecords = (g.issues || []).flatMap(i => i.list);
                          return (
                          <div key={g.date} className="relative group rounded-lg border border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 transition-all">
                            <button data-testid={`card-date-${g.date}`} onClick={() => setSelectedDate(g.date)}
                              className="text-left p-3 w-full h-full block">
                              <p className="text-xs font-semibold text-muted-foreground mb-1 truncate">{g.date}</p>
                              <p className="text-lg font-black leading-none mb-1.5">{g.records.length}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></p>
                              <RateBadge value={g.rate} />
                            </button>
                            {totalIssues > 0 && (
                              <button
                                data-testid={`btn-issue-${g.date}`}
                                onClick={(e) => { e.stopPropagation(); setActiveIssue({ label: `${g.date} 이슈 목록`, list: issueRecords }); }}
                                className="mt-1 mx-3 mb-2 block w-[calc(100%-24px)] text-left text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:underline transition-colors"
                              >
                                ⚠ 이슈 {totalIssues}건 →
                              </button>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* 월단위 관리 */}
            {viewMode === 'monthly' && (
              <div className="space-y-4">
                {selectedMonth ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <button onClick={() => setSelectedMonth(null)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                      <ChevronLeft className="w-3.5 h-3.5" />월 목록으로
                    </button>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-sm font-bold text-blue-600">{selectedMonth}</span>
                    <RateBadge value={comp.rate} />
                    <span className="text-xs text-muted-foreground">({records.length}건)</span>
                  </div>
                ) : (
                  <>
                    {monthlyTrendData.length > 1 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">월별 이행률 추세</p>
                        <ResponsiveContainer width="100%" height={120}>
                          <BarChart data={monthlyTrendData} margin={{ left: -20, right: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                            <ReTooltip formatter={(v: any, _: any, p: any) => [`${v}% (${p.payload.count}건)`, '이행률']} />
                            <Bar dataKey="rate" radius={[4, 4, 0, 0]} onClick={(d) => setSelectedMonth(d.month)}>
                              {monthlyTrendData.map((entry, i) => (
                                <Cell key={i} fill={entry.rate >= 90 ? '#22c55e' : entry.rate >= 70 ? '#f59e0b' : '#ef4444'} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-muted-foreground">월을 선택하면 해당 월의 상세 현황을 확인합니다</p>
                    {recordsLoading ? (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />데이터 불러오는 중...</div>
                    ) : monthlyGroups.length === 0 ? (
                      <p className="text-sm text-muted-foreground">월별 데이터가 없습니다</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {monthlyGroups.map(g => {
                          const totalIssues = (g.issues || []).reduce((a, b) => a + b.count, 0);
                          const issueRecords = (g.issues || []).flatMap(i => i.list);
                          return (
                          <div key={g.month} className="relative rounded-lg border border-border hover:border-blue-300 hover:bg-blue-50/50 dark:hover:border-blue-700 dark:hover:bg-blue-950/20 transition-all">
                            <button data-testid={`card-month-${g.month}`} onClick={() => setSelectedMonth(g.month)}
                              className="text-left p-3 w-full block">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">{g.month}</p>
                              <p className="text-lg font-black leading-none mb-1.5">{g.records.length}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></p>
                              <RateBadge value={g.rate} />
                            </button>
                            {totalIssues > 0 && (
                              <button
                                data-testid={`btn-issue-month-${g.month}`}
                                onClick={(e) => { e.stopPropagation(); setActiveIssue({ label: `${g.month} 이슈 목록`, list: issueRecords }); }}
                                className="mt-1 mx-3 mb-2 block w-[calc(100%-24px)] text-left text-xs font-bold text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 hover:underline transition-colors"
                              >
                                ⚠ 이슈 {totalIssues}건 →
                              </button>
                            )}
                          </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Dashboard */}
      {showDashboard && !showDetail && (
        <>
          {recordsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
                <CalendarDays className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-semibold text-muted-foreground">해당 기간에 데이터가 없습니다</p>
            </div>
          ) : (
            <>
              {/* 일단위/월단위 드릴다운 시 팀별 현황 먼저 표시 */}
              {drilldownLabel && (
                <TeamBreakdown records={records} title={drilldownLabel} />
              )}

              {/* Top KPI Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-600 to-blue-700 text-white col-span-2 lg:col-span-1">
                  <CardContent className="p-5">
                    <p className="text-xs font-semibold text-blue-100 uppercase tracking-widest">전체 이행률</p>
                    <div className="mt-3"><CircleGauge rate={comp.rate} /></div>
                    <p className="text-center text-xs text-blue-100 mt-2">{records.length}건 분석</p>
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                        <AlertTriangle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">6대 고위험작업</span>
                    </div>
                    <p className="text-3xl font-black">{highRiskRecords.length}</p>
                    <p className="text-xs text-muted-foreground mt-1">안전허가서 등록 <span className="font-bold text-emerald-600">{highRiskRecords.filter(r => r.safetyPermit === 'Y').length}건</span></p>
                    {comp.highRiskNoPermit && comp.highRiskNoPermit.length > 0 && (
                      <p className="text-xs mt-0.5 text-red-600 font-semibold">⚠ 미매칭 {comp.highRiskNoPermit.length}건</p>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                        <FileWarning className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">TBM AI 현황</span>
                    </div>
                    <p className="text-3xl font-black">{records.filter(r => r.tbmAiResult === '적합').length}</p>
                    <p className="text-xs text-muted-foreground mt-1">적합 / 전체 {records.length}건</p>
                    {records.filter(r => r.tbmAiResult === '부적합').length > 0 && (
                      <p className="text-xs mt-0.5 text-red-600 font-semibold">⚠ 부적합 {records.filter(r => r.tbmAiResult === '부적합').length}건</p>
                    )}
                  </CardContent>
                </Card>
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardContent className="p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                        <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
                      </div>
                      <span className="text-sm font-semibold text-muted-foreground">누락/미이행</span>
                    </div>
                    <p className="text-3xl font-black">{(comp.issues || []).reduce((a, b) => a + b.count, 0)}</p>
                    <p className="text-xs text-muted-foreground mt-1">{(comp.issues || []).length}개 항목 이슈</p>
                  </CardContent>
                </Card>
              </div>

              {/* Compliance items */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {complianceItems.map(item => {
                  const rate = item.total === 0 ? 100 : Math.round((item.pass / item.total) * 100);
                  const Icon = item.icon;
                  return (
                    <Card key={item.label} className="border-0 shadow-sm bg-card/60">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2"><Icon className="w-4 h-4 text-muted-foreground" /><span className="text-xs font-semibold text-muted-foreground">{item.label}</span></div>
                        {item.total === 0 ? <p className="text-sm text-muted-foreground">{item.emptyLabel}</p> : (
                          <>
                            <div className="flex items-end justify-between mb-1.5">
                              <span className="text-lg font-black">{item.pass}<span className="text-sm font-normal text-muted-foreground">/{item.total}</span></span>
                              <RateBadge value={rate} />
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${rate}%`, backgroundColor: rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444' }} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">{item.description}</p>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* 6대 고위험작업 유형별 */}
              {records.length > 0 && (
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-orange-500" />고위험작업 유형별 현황</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                      {highRiskBreakdown.map(d => {
                        if (d.isNone) return (
                          <div key="해당없음" className="p-3 rounded-lg border border-dashed border-muted bg-muted/20 text-center">
                            <p className="text-xs font-semibold text-muted-foreground mb-1">해당없음</p>
                            <p className="text-2xl font-black text-muted-foreground">{d.total}</p>
                            <p className="text-xs text-muted-foreground mt-1">일반작업</p>
                          </div>
                        );
                        const rate = d.total === 0 ? 100 : Math.round((d.permit / d.total) * 100);
                        return (
                          <div key={d.type} className={`p-3 rounded-lg border bg-card/80 text-center ${d.total === 0 ? 'border-dashed border-muted opacity-50' : ''}`}>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">{d.type}</p>
                            <p className={`text-2xl font-black ${d.total === 0 ? 'text-muted-foreground' : ''}`}>{d.total}</p>
                            {d.total > 0 ? (
                              <>
                                <div className="flex items-center justify-center gap-1 mt-1"><RateBadge value={rate} /></div>
                                {d.noPermit > 0 && <p className="text-xs text-red-600 font-semibold mt-1">미발급 {d.noPermit}</p>}
                              </>
                            ) : <p className="text-xs text-muted-foreground mt-1">해당없음</p>}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold">TBM AI 분석결과</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tbmAiData.length > 0 ? (
                      <div className="flex flex-col items-center gap-4">
                        <ResponsiveContainer width="100%" height={200}>
                          <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
                            <Pie data={tbmAiData} cx="50%" cy="50%" innerRadius={55} outerRadius={80}
                              dataKey="value" labelLine={false}>
                              {tbmAiData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                            </Pie>
                            <ReTooltip formatter={(v: any, name: any) => [`${v}건`, name]} />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="grid grid-cols-2 gap-2 w-full px-2">
                          {tbmAiData.map(d => (
                            <div key={d.name} className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: `${d.color}18` }}>
                              <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                              <span className="text-xs font-semibold text-foreground">{d.name}</span>
                              <span className="text-sm font-black ml-auto" style={{ color: d.color }}>{d.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : <p className="text-center text-sm text-muted-foreground py-12">데이터 없음</p>}
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold">팀별 이행률</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {teamData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={Math.max(180, teamData.length * 32)}>
                        <BarChart data={teamData} layout="vertical" margin={{ left: -10, right: 60 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="team" tick={{ fontSize: 10 }} width={64} />
                          <ReTooltip formatter={(v: any, _: any, props: any) => [`${v}% (${props.payload.count}건)`, '이행률']}
                            labelFormatter={(label) => {
                              const found = teamData.find(t => t.team === label);
                              return found?.fullTeam || label;
                            }} />
                          <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                            {teamData.map((entry, i) => (
                              <Cell key={i} fill={entry.rate >= 90 ? '#22c55e' : entry.rate >= 70 ? '#f59e0b' : '#ef4444'} />
                            ))}
                            <LabelList content={(props: any) => {
                              const { x, y, width, height, value, index } = props;
                              const count = teamData[index]?.count ?? 0;
                              return (
                                <text x={x + width + 6} y={y + height / 2} dy={4} textAnchor="start" fontSize={10} fill="#64748b">
                                  {value}% ({count}건)
                                </text>
                              );
                            }} />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    ) : <p className="text-center text-sm text-muted-foreground py-12">데이터 없음</p>}
                  </CardContent>
                </Card>
              </div>

              {/* Issue cards */}
              {(comp.issues || []).length > 0 && (
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" />이슈 현황</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                      {(comp.issues || []).map(issue => (
                        <button key={issue.label} onClick={() => setActiveIssue(issue)}
                          className="text-left p-3 rounded-lg border border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
                          data-testid={`button-issue-${issue.label}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs font-semibold text-red-700 dark:text-red-300">{issue.label}</span>
                            <span className="text-lg font-black text-red-600">{issue.count}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">클릭하여 상세 보기</p>
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* High risk table */}
              {highRiskRecords.length > 0 && (() => {
                const hrTotalPages = Math.ceil(highRiskRecords.length / highRiskPageSize);
                const hrSafePage = Math.min(highRiskPage, Math.max(1, hrTotalPages));
                const hrPaged = highRiskRecords.slice((hrSafePage - 1) * highRiskPageSize, hrSafePage * highRiskPageSize);
                return (
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-orange-500" />
                        고위험작업 안전허가서 매칭 현황
                      </CardTitle>
                      <span className="text-xs font-normal text-muted-foreground">6대 고위험작업(고소·전기·중장비·굴착·밀폐·화기)</span>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">전체 {highRiskRecords.length}건</span>
                        <Select value={String(highRiskPageSize)} onValueChange={v => { setHighRiskPageSize(Number(v)); setHighRiskPage(1); }}>
                          <SelectTrigger className="h-7 text-xs w-20" data-testid="select-hr-pagesize"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="30">30개</SelectItem>
                            <SelectItem value="50">50개</SelectItem>
                            <SelectItem value="100">100개</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto rounded-b-xl">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs font-bold w-8">#</TableHead>
                            <TableHead className="text-xs font-bold w-[110px]">작업번호</TableHead>
                            <TableHead className="text-xs font-bold">작업명</TableHead>
                            <TableHead className="text-xs font-bold">팀</TableHead>
                            <TableHead className="text-xs font-bold">고위험유형</TableHead>
                            <TableHead className="text-xs font-bold">안전허가서</TableHead>
                            <TableHead className="text-xs font-bold">위험도</TableHead>
                            <TableHead className="text-xs font-bold">TBM AI</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {hrPaged.map((r, i) => (
                            <TableRow key={r.id} className={r.safetyPermit !== 'Y' ? 'bg-red-50/30 dark:bg-red-950/10' : ''}>
                              <TableCell className="text-xs text-muted-foreground">{(hrSafePage - 1) * highRiskPageSize + i + 1}</TableCell>
                              <TableCell className="text-xs font-mono max-w-[110px]"><span className="block truncate" title={r.workOrderNo || ''}>{r.workOrderNo || '-'}</span></TableCell>
                              <TableCell className="text-xs">{r.workName || '-'}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{r.team || '-'}</TableCell>
                              <TableCell><HighRiskBadge value={r.highRiskWork} /></TableCell>
                              <TableCell><PermitBadge value={r.safetyPermit} highRisk={r.highRiskWork} /></TableCell>
                              <TableCell><span className="text-xs font-semibold" style={{ color: RISK_COLORS[r.riskLevel || ''] || '#94a3b8' }}>{r.riskLevel || '-'}</span></TableCell>
                              <TableCell><StatusBadge value={r.tbmAiResult} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {hrTotalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <span className="text-xs text-muted-foreground">{(hrSafePage - 1) * highRiskPageSize + 1}–{Math.min(hrSafePage * highRiskPageSize, highRiskRecords.length)} / {highRiskRecords.length}건</span>
                        <div className="flex items-center gap-1">
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setHighRiskPage(p => Math.max(1, p - 1))} disabled={hrSafePage === 1}><ChevronLeft className="w-3.5 h-3.5" /></Button>
                          {Array.from({ length: Math.min(hrTotalPages, 5) }, (_, i) => {
                            const page = hrTotalPages <= 5 ? i + 1 : hrSafePage <= 3 ? i + 1 : hrSafePage >= hrTotalPages - 2 ? hrTotalPages - 4 + i : hrSafePage - 2 + i;
                            return <Button key={page} variant={page === hrSafePage ? 'default' : 'outline'} size="icon" className="h-7 w-7 text-xs" onClick={() => setHighRiskPage(page)}>{page}</Button>;
                          })}
                          <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => setHighRiskPage(p => Math.min(hrTotalPages, p + 1))} disabled={hrSafePage === hrTotalPages}><ChevronRight className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
                );
              })()}
            </>
          )}
        </>
      )}

      {/* Detail Table — 전체 데이터 */}
      {showDashboard && showDetail && (
        <Card className="border-0 shadow-sm bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex flex-col gap-3">
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <CardTitle className="text-sm font-bold flex-1">
                  전체 데이터
                  <span className="ml-2 font-normal text-muted-foreground text-xs">
                    {filteredRecords.length}건 중 {Math.min((safePage - 1) * pageSize + 1, filteredRecords.length)}–{Math.min(safePage * pageSize, filteredRecords.length)}건 표시
                  </span>
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); resetPage(); }}>
                    <SelectTrigger className="h-8 text-xs w-28" data-testid="select-page-size">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="30">30개씩</SelectItem>
                      <SelectItem value="50">50개씩</SelectItem>
                      <SelectItem value="100">100개씩</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {/* 검색/필터 */}
              <div className="flex flex-wrap gap-2">
                <Input placeholder="작업번호·작업명·팀·장소 검색..." value={search} onChange={e => { setSearch(e.target.value); resetPage(); }}
                  className="h-8 text-xs w-56" data-testid="input-search" />
                <Select value={filterTeam} onValueChange={v => { setFilterTeam(v); resetPage(); }}>
                  <SelectTrigger className="h-8 text-xs w-40" data-testid="select-filter-team"><SelectValue placeholder="팀 전체" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">팀 전체</SelectItem>
                    {teams.map(t => <SelectItem key={t!} value={t!}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterIssue} onValueChange={v => { setFilterIssue(v); resetPage(); }}>
                  <SelectTrigger className="h-8 text-xs w-44" data-testid="select-filter-issue"><SelectValue placeholder="이슈 필터" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="highRisk">6대 고위험작업만</SelectItem>
                    <SelectItem value="noPermit">안전허가서 미등록</SelectItem>
                    <SelectItem value="tbmUnreg">TBM 미등록</SelectItem>
                    <SelectItem value="tbmBad">TBM AI 부적합</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-bold w-8 sticky left-0 bg-muted/30">#</TableHead>
                    <TableHead className="text-xs font-bold w-[120px]">작업번호</TableHead>
                    <TableHead className="text-xs font-bold min-w-[200px]">작업명</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">공사유형</TableHead>
                    <TableHead className="text-xs font-bold min-w-[100px]">팀명</TableHead>
                    <TableHead className="text-xs font-bold min-w-[90px]">협력사</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">고위험작업</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">안전허가서</TableHead>
                    <TableHead className="text-xs font-bold min-w-[60px]">위험도</TableHead>
                    <TableHead className="text-xs font-bold min-w-[60px]">TBM</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">TBM AI</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">작업상태</TableHead>
                    <TableHead className="text-xs font-bold min-w-[90px]">시작일</TableHead>
                    <TableHead className="text-xs font-bold min-w-[90px]">종료일</TableHead>
                    <TableHead className="text-xs font-bold min-w-[60px]">주/야간</TableHead>
                    <TableHead className="text-xs font-bold min-w-[120px]">작업장소</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">책임자</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagedRecords.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={17} className="py-12 text-center text-sm text-muted-foreground">조건에 맞는 데이터가 없습니다</TableCell>
                    </TableRow>
                  ) : pagedRecords.map((r, i) => (
                    <TableRow key={r.id} data-testid={`row-record-${r.id}`}
                      className={r.workStatus === '취소' ? 'opacity-50 bg-muted/30' : isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y' ? 'bg-red-50/20 dark:bg-red-950/10' : ''}>
                      <TableCell className="text-xs text-muted-foreground sticky left-0 bg-background">{(safePage - 1) * pageSize + i + 1}</TableCell>
                      <TableCell className="text-xs font-mono w-[120px]">
                        <span className="block truncate" title={r.workOrderNo || ''}>{r.workOrderNo || '-'}</span>
                        {r.workStatus === '취소' && <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded ml-0.5">취소</span>}
                      </TableCell>
                      <TableCell className="text-xs min-w-[200px]">
                        <span title={r.workName || ''}>{r.workName || '-'}</span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {r.workType ? (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.workType.includes('직영') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'}`}>
                            {r.workType}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.team || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.vendorName || '-'}</TableCell>
                      <TableCell><HighRiskBadge value={r.highRiskWork} /></TableCell>
                      <TableCell><PermitBadge value={r.safetyPermit} highRisk={r.highRiskWork} /></TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold" style={{ color: RISK_COLORS[r.riskLevel || ''] || '#94a3b8' }}>{r.riskLevel || '-'}</span>
                      </TableCell>
                      <TableCell><RegBadge value={r.tbmResult} /></TableCell>
                      <TableCell><StatusBadge value={r.tbmAiResult} /></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.workStatus || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.startDate || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.endDate || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.dayNight || '-'}</TableCell>
                      <TableCell className="text-xs">{r.workLocation || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.supervisor || '-'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t">
                <span className="text-xs text-muted-foreground">
                  {filteredRecords.length}건 중 {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filteredRecords.length)}건
                </span>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon" className="h-7 w-7"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={safePage === 1}>
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </Button>
                  {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                    const page = totalPages <= 7 ? i + 1
                      : safePage <= 4 ? i + 1
                        : safePage >= totalPages - 3 ? totalPages - 6 + i
                          : safePage - 3 + i;
                    return (
                      <Button key={page} variant={page === safePage ? 'default' : 'outline'} size="icon"
                        className="h-7 w-7 text-xs" onClick={() => setCurrentPage(page)}>
                        {page}
                      </Button>
                    );
                  })}
                  <Button variant="outline" size="icon" className="h-7 w-7"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={safePage === totalPages}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <span className="text-xs text-muted-foreground">{safePage} / {totalPages} 페이지</span>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Issue detail dialog */}
      <Dialog open={!!activeIssue} onOpenChange={() => setActiveIssue(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              {activeIssue?.label}
            </DialogTitle>
          </DialogHeader>
          {activeIssue && (() => {
            const list = activeIssue.list.filter(r => !isCancelled(r));
            const noPermit = list.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y');
            const tbmUnreg = list.filter(r => r.tbmResult === '미등록');
            const tbmBad = list.filter(r => r.tbmAiResult === '부적합');
            const groups = [
              { label: '고위험작업 안전허가서 미등록', records: noPermit, headerColor: 'bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800', badgeColor: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300' },
              { label: 'TBM 활동 미등록', records: tbmUnreg, headerColor: 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800', badgeColor: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300' },
              { label: 'TBM AI 부적합', records: tbmBad, headerColor: 'bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800', badgeColor: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300' },
            ].filter(g => g.records.length > 0);

            if (groups.length === 0) return (
              <p className="text-sm text-muted-foreground py-6 text-center">취소 건 제외 시 이슈 없음</p>
            );

            return (
              <div className="space-y-5">
                {/* 요약 뱃지 */}
                <div className="flex flex-wrap gap-2">
                  {groups.map(g => (
                    <span key={g.label} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${g.badgeColor}`}>
                      {g.label} {g.records.length}건
                    </span>
                  ))}
                </div>
                {/* 유형별 섹션 */}
                {groups.map(g => (
                  <div key={g.label} className={`rounded-lg border ${g.headerColor}`}>
                    <div className={`px-3 py-2 border-b ${g.headerColor} rounded-t-lg`}>
                      <p className="text-xs font-bold">{g.label} — {g.records.length}건</p>
                    </div>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs w-[100px]">작업번호</TableHead>
                            <TableHead className="text-xs">작업명</TableHead>
                            <TableHead className="text-xs w-[90px]">팀</TableHead>
                            <TableHead className="text-xs w-[80px]">고위험유형</TableHead>
                            <TableHead className="text-xs w-[80px]">안전허가서</TableHead>
                            <TableHead className="text-xs w-[70px]">TBM</TableHead>
                            <TableHead className="text-xs w-[80px]">TBM AI</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {g.records.map(r => (
                            <TableRow key={r.id}>
                              <TableCell className="text-xs font-mono"><span className="block truncate max-w-[96px]" title={r.workOrderNo || ''}>{r.workOrderNo || '-'}</span></TableCell>
                              <TableCell className="text-xs"><span className="block truncate max-w-[160px]" title={r.workName || ''}>{r.workName || '-'}</span></TableCell>
                              <TableCell className="text-xs whitespace-nowrap">{r.team || '-'}</TableCell>
                              <TableCell><HighRiskBadge value={r.highRiskWork} /></TableCell>
                              <TableCell><PermitBadge value={r.safetyPermit} highRisk={r.highRiskWork} /></TableCell>
                              <TableCell><span className={`text-xs font-semibold ${r.tbmResult === '미등록' ? 'text-red-600' : 'text-emerald-600'}`}>{r.tbmResult || '-'}</span></TableCell>
                              <TableCell><StatusBadge value={r.tbmAiResult} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
