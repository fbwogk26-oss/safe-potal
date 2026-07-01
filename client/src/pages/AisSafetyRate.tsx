import { useState, useRef } from "react";
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
} from "lucide-react";
import type { AisSafetyUpload, AisSafetyRecord } from "@shared/schema";

// 6대 고위험작업 유형
const HIGH_RISK_TYPES = ['고소', '전기', '중장비', '굴착', '밀폐', '화기'];

function isHighRiskWork(val: string | null | undefined): boolean {
  if (!val || val === '없음' || val === 'X' || val.trim() === '') return false;
  return HIGH_RISK_TYPES.some(t => val.includes(t));
}

function calcCompliance(records: AisSafetyRecord[]) {
  if (!records.length) return { rate: 0, items: [], issues: [], highRiskNoPermit: [], tbmUnreg: [], tbmBad: [] };

  // 고위험작업 → 안전작업허가서 미등록 (핵심 이행 항목)
  const highRiskNoPermit = records.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y');
  const tbmUnreg = records.filter(r => r.tbmResult === '미등록');
  const tbmBad = records.filter(r => r.tbmAiResult === '부적합');

  const allItems = [
    { label: '고위험작업 안전허가서 미등록', list: highRiskNoPermit },
    { label: 'TBM 활동 미등록', list: tbmUnreg },
    { label: 'TBM AI 부적합', list: tbmBad },
  ];

  let total = 0, pass = 0;
  const issues: { label: string; count: number; list: AisSafetyRecord[] }[] = [];

  for (const item of allItems) {
    total += records.length;
    pass += records.length - item.list.length;
    if (item.list.length > 0) issues.push({ ...item, count: item.list.length });
  }

  return {
    rate: total > 0 ? Math.round((pass / total) * 100) : 100,
    highRiskNoPermit,
    tbmUnreg,
    tbmBad,
    issues,
  };
}

const RISK_COLORS: Record<string, string> = {
  '상': '#ef4444',
  '중': '#f59e0b',
  '하': '#22c55e',
  '없음': '#94a3b8',
};

// 고위험유형별 색상
const HIGH_RISK_COLOR: Record<string, string> = {
  '고소': 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  '전기': 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
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
  // 매칭되는 유형 찾기
  const matched = HIGH_RISK_TYPES.find(t => v.includes(t));
  const cls = matched ? (HIGH_RISK_COLOR[matched] || 'bg-orange-100 text-orange-700') : 'bg-orange-100 text-orange-700';
  return <Badge className={`${cls} border-0 text-xs font-semibold`}><AlertTriangle className="w-3 h-3 mr-1" />{v}</Badge>;
}

// 고위험작업 유형별 통계 (6대 분류 + 해당없음)
function getHighRiskBreakdown(records: AisSafetyRecord[]) {
  const types = HIGH_RISK_TYPES.map(type => {
    const matched = records.filter(r => r.highRiskWork && r.highRiskWork.includes(type));
    return {
      type,
      total: matched.length,
      permit: matched.filter(r => r.safetyPermit === 'Y').length,
      noPermit: matched.filter(r => r.safetyPermit !== 'Y').length,
      isNone: false,
    };
  });
  // 해당없음 (고위험작업에 해당하지 않는 행)
  const noneCount = records.filter(r => !isHighRiskWork(r.highRiskWork)).length;
  types.push({ type: '해당없음', total: noneCount, permit: 0, noPermit: 0, isNone: true });
  return types;
}

function CircleGauge({ rate }: { rate: number }) {
  const r = 56;
  const circ = 2 * Math.PI * r;
  const dash = (rate / 100) * circ;
  const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
  return (
    <div className="relative w-36 h-36 mx-auto">
      <svg className="w-full h-full -rotate-90" viewBox="0 0 128 128">
        <circle cx="64" cy="64" r={r} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/20" />
        <circle cx="64" cy="64" r={r} fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-black" style={{ color }}>{rate}</span>
        <span className="text-xs font-semibold text-muted-foreground">%</span>
      </div>
    </div>
  );
}

export default function AisSafetyRate() {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedUploadId, setSelectedUploadId] = useState<number | 'all' | null>(null);
  const [search, setSearch] = useState('');
  const [filterTeam, setFilterTeam] = useState('all');
  const [filterIssue, setFilterIssue] = useState('all');
  const [showDetail, setShowDetail] = useState(false);
  const [activeIssue, setActiveIssue] = useState<{ label: string; list: AisSafetyRecord[] } | null>(null);
  const [uploading, setUploading] = useState(false);

  const { data: uploads = [] } = useQuery<AisSafetyUpload[]>({
    queryKey: ['/api/ais-safety/uploads'],
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery<AisSafetyRecord[]>({
    queryKey: ['/api/ais-safety/records', selectedUploadId],
    enabled: selectedUploadId !== null,
    queryFn: async () => {
      if (selectedUploadId === null) return [];
      const url = selectedUploadId === 'all'
        ? '/api/ais-safety/records/all'
        : `/api/ais-safety/records/${selectedUploadId}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('레코드 조회 실패');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`/api/ais-safety/uploads/${id}`, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/uploads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/records', 'all'] });
      toast({ title: '삭제되었습니다' });
      setSelectedUploadId('all');
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
      queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/records', 'all'] });
      setSelectedUploadId('all');
      toast({ title: `${data.recordCount}건 누적 데이터에 추가되었습니다` });
    } catch (err: any) {
      toast({ title: err.message || '업로드 실패', variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const comp = calcCompliance(records);
  const teams = [...new Set(records.map(r => r.team).filter(Boolean))];
  const highRiskRecords = records.filter(r => isHighRiskWork(r.highRiskWork));
  const highRiskBreakdown = getHighRiskBreakdown(records);

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
        || (r.vendorName || '').toLowerCase().includes(q);
    }
    return true;
  });

  const tbmAiData = [
    { name: '적합', value: records.filter(r => r.tbmAiResult === '적합').length, color: '#22c55e' },
    { name: '부적합', value: records.filter(r => r.tbmAiResult === '부적합').length, color: '#ef4444' },
    { name: '분석중', value: records.filter(r => r.tbmAiResult === '분석중').length, color: '#f59e0b' },
    { name: '분석전', value: records.filter(r => r.tbmAiResult === '분석전' || !r.tbmAiResult).length, color: '#94a3b8' },
  ].filter(d => d.value > 0);

  const teamData = teams.map(team => {
    const tr = records.filter(r => r.team === team);
    const c = calcCompliance(tr);
    return { team: team?.replace('운용팀', '').replace('팀', '') || '미지정', rate: c.rate, count: tr.length };
  }).sort((a, b) => b.rate - a.rate);

  const complianceItems = [
    {
      label: '안전허가서 매칭',
      icon: ShieldCheck,
      total: highRiskRecords.length,
      pass: highRiskRecords.filter(r => r.safetyPermit === 'Y').length,
      description: '고위험작업 시 안전허가서 등록',
      emptyLabel: '고위험작업 없음',
    },
    {
      label: 'TBM 등록률',
      icon: Users,
      total: records.length,
      pass: records.filter(r => r.tbmResult === '등록').length,
      description: 'TBM 활동 등록 여부',
      emptyLabel: '데이터 없음',
    },
  ];

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black tracking-tight">AIS 안전이행률</h1>
          <p className="text-sm text-muted-foreground mt-0.5">6대 고위험작업 안전허가서 매칭 및 TBM AI 분석 현황</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedUploadId && (
            <Button variant="outline" size="sm" onClick={() => setShowDetail(!showDetail)} data-testid="button-toggle-detail">
              {showDetail ? <ChevronUp className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
              {showDetail ? '대시보드' : '상세 목록'}
            </Button>
          )}
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} data-testid="input-csv" />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="button-upload-csv"
            className="bg-blue-600 hover:bg-blue-700 text-white">
            {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />업로드 중...</>
              : <><Upload className="w-4 h-4 mr-2" />CSV 업로드</>}
          </Button>
        </div>
      </div>

      {/* Upload selector */}
      {uploads.length > 0 && (
        <Card className="border-0 shadow-sm bg-card/60 backdrop-blur-sm">
          <CardContent className="pt-4 pb-4">
            <div className="flex flex-col gap-3">
              {/* 전체 누적 버튼 */}
              <button
                data-testid="button-upload-all"
                onClick={() => setSelectedUploadId('all')}
                className={`w-full text-left px-4 py-3 rounded-lg border-2 text-sm transition-all flex items-center gap-3 ${selectedUploadId === 'all'
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 shadow-sm'
                  : 'border-dashed border-blue-300 hover:border-blue-400 hover:bg-blue-50/40 dark:border-blue-700 dark:hover:bg-blue-950/20'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${selectedUploadId === 'all' ? 'bg-blue-500' : 'bg-blue-100 dark:bg-blue-900/40'}`}>
                  <Layers className={`w-4 h-4 ${selectedUploadId === 'all' ? 'text-white' : 'text-blue-600 dark:text-blue-400'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">전체 누적 데이터</div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {uploads.length}개 파일 · 총 {uploads.reduce((s, u) => s + (u.recordCount || 0), 0)}건 합산
                  </div>
                </div>
                {selectedUploadId === 'all' && (
                  <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full font-semibold flex-shrink-0">선택됨</span>
                )}
              </button>
              {/* 개별 업로드 목록 */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {uploads.map(u => (
                  <div key={u.id} className="flex items-stretch gap-1">
                    <button data-testid={`button-upload-${u.id}`}
                      onClick={() => setSelectedUploadId(u.id)}
                      className={`flex-1 text-left px-3 py-2.5 rounded-lg border text-sm transition-all ${selectedUploadId === u.id
                        ? 'border-slate-500 bg-slate-50 dark:bg-slate-800/60 text-slate-700 dark:text-slate-300 shadow-sm'
                        : 'border-border hover:border-slate-300 hover:bg-muted/40'}`}>
                      <div className="font-medium truncate text-xs">{u.fileName}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
                        <span>{u.workDate || '날짜 미상'}</span>
                        <span>·</span>
                        <span className="font-semibold">{u.recordCount}건</span>
                      </div>
                    </button>
                    <button
                      onClick={() => deleteMutation.mutate(u.id)}
                      className="px-2 rounded-lg border border-border hover:border-red-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-500 text-muted-foreground transition-colors flex-shrink-0"
                      data-testid={`button-delete-upload-${u.id}`}
                      title="삭제">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {uploads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 gap-4 text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
            <TrendingUp className="w-8 h-8 text-blue-500" />
          </div>
          <div>
            <h3 className="font-bold text-lg">AIS CSV 파일을 업로드하세요</h3>
            <p className="text-sm text-muted-foreground mt-1">공사작업 현황 CSV 파일을 업로드하면 안전이행률을 자동 분석합니다</p>
            <p className="text-xs text-muted-foreground mt-1">6대 고위험작업(고소·전기·중장비·굴착·밀폐·화기) 안전허가서 매칭 자동 분석</p>
          </div>
          <Button onClick={() => fileInputRef.current?.click()} className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-upload-empty">
            <Upload className="w-4 h-4 mr-2" />CSV 파일 선택
          </Button>
        </div>
      )}

      {/* Dashboard */}
      {selectedUploadId && !showDetail && (
        <>
          {recordsLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <>
              {/* Top KPI Row */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-600 to-blue-700 text-white col-span-2 lg:col-span-1">
                  <CardContent className="p-5">
                    <p className="text-xs font-semibold text-blue-100 uppercase tracking-widest">전체 이행률</p>
                    <div className="mt-3">
                      <CircleGauge rate={comp.rate} />
                    </div>
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
                    <p className="text-xs text-muted-foreground mt-1">
                      안전허가서 등록 <span className="font-bold text-emerald-600">{highRiskRecords.filter(r => r.safetyPermit === 'Y').length}건</span>
                    </p>
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
                    <p className="text-xs text-muted-foreground mt-1">
                      적합 / 전체 {records.length}건
                    </p>
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
                    <p className="text-xs text-muted-foreground mt-1">
                      {(comp.issues || []).length}개 항목 이슈
                    </p>
                  </CardContent>
                </Card>
              </div>

              {/* Compliance items bar (2 items) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {complianceItems.map(item => {
                  const rate = item.total === 0 ? 100 : Math.round((item.pass / item.total) * 100);
                  const Icon = item.icon;
                  return (
                    <Card key={item.label} className="border-0 shadow-sm bg-card/60">
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Icon className="w-4 h-4 text-muted-foreground" />
                          <span className="text-xs font-semibold text-muted-foreground">{item.label}</span>
                        </div>
                        {item.total === 0 ? (
                          <p className="text-sm text-muted-foreground">{item.emptyLabel}</p>
                        ) : (
                          <>
                            <div className="flex items-end justify-between mb-1.5">
                              <span className="text-lg font-black">{item.pass}<span className="text-sm font-normal text-muted-foreground">/{item.total}</span></span>
                              <RateBadge value={rate} />
                            </div>
                            <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-700"
                                style={{ width: `${rate}%`, backgroundColor: rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444' }} />
                            </div>
                            <p className="text-xs text-muted-foreground mt-1.5">{item.description}</p>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </div>

              {/* 6대 고위험작업 유형별 현황 */}
              {records.length > 0 && (
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <ShieldAlert className="w-4 h-4 text-orange-500" />
                      고위험작업 유형별 현황
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-3">
                      {highRiskBreakdown.map(d => {
                        if (d.isNone) {
                          return (
                            <div key="해당없음" className="p-3 rounded-lg border border-dashed border-muted bg-muted/20 text-center col-span-1">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">해당없음</p>
                              <p className="text-2xl font-black text-muted-foreground">{d.total}</p>
                              <p className="text-xs text-muted-foreground mt-1">일반작업</p>
                            </div>
                          );
                        }
                        const rate = d.total === 0 ? 100 : Math.round((d.permit / d.total) * 100);
                        return (
                          <div key={d.type} className={`p-3 rounded-lg border bg-card/80 text-center ${d.total === 0 ? 'border-dashed border-muted opacity-50' : ''}`}>
                            <p className="text-xs font-semibold text-muted-foreground mb-1">{d.type}</p>
                            <p className={`text-2xl font-black ${d.total === 0 ? 'text-muted-foreground' : ''}`}>{d.total}</p>
                            {d.total > 0 ? (
                              <>
                                <div className="flex items-center justify-center gap-1 mt-1">
                                  <RateBadge value={rate} />
                                </div>
                                {d.noPermit > 0 && (
                                  <p className="text-xs text-red-600 font-semibold mt-1">미발급 {d.noPermit}</p>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-muted-foreground mt-1">해당없음</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* TBM AI Pie */}
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold">TBM AI 분석결과</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {tbmAiData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={180}>
                        <PieChart>
                          <Pie data={tbmAiData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                            dataKey="value" label={({ name, value }) => `${name} ${value}`} labelLine={false}>
                            {tbmAiData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                          </Pie>
                          <ReTooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : <p className="text-center text-sm text-muted-foreground py-12">데이터 없음</p>}
                    <div className="flex flex-wrap gap-2 justify-center">
                      {tbmAiData.map(d => (
                        <div key={d.name} className="flex items-center gap-1">
                          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }} />
                          <span className="text-xs text-muted-foreground">{d.name} {d.value}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Team bar chart */}
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-bold">팀별 이행률</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {teamData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={Math.max(180, teamData.length * 32)}>
                        <BarChart data={teamData} layout="vertical" margin={{ left: -10, right: 56 }}>
                          <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                          <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 10 }} />
                          <YAxis type="category" dataKey="team" tick={{ fontSize: 10 }} width={60} />
                          <ReTooltip formatter={(v: any, _: any, props: any) => [`${v}% (${props.payload.count}건)`, '이행률']} />
                          <Bar dataKey="rate" radius={[0, 4, 4, 0]}>
                            {teamData.map((entry, i) => (
                              <Cell key={i} fill={entry.rate >= 90 ? '#22c55e' : entry.rate >= 70 ? '#f59e0b' : '#ef4444'} />
                            ))}
                            <LabelList
                              content={(props: any) => {
                                const { x, y, width, height, value, index } = props;
                                const count = teamData[index]?.count ?? 0;
                                return (
                                  <text x={x + width + 6} y={y + height / 2} dy={4} textAnchor="start" fontSize={10} fill="#64748b">
                                    {value}% ({count}건)
                                  </text>
                                );
                              }}
                            />
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
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500" />
                      이슈 현황
                    </CardTitle>
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

              {/* High risk permit matching table */}
              {highRiskRecords.length > 0 && (
                <Card className="border-0 shadow-sm bg-card/60">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-bold flex items-center gap-2">
                      <ShieldCheck className="w-4 h-4 text-orange-500" />
                      고위험작업 안전허가서 매칭 현황
                      <span className="ml-auto text-xs font-normal text-muted-foreground">6대 고위험작업(고소·전기·중장비·굴착·밀폐·화기)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <div className="overflow-x-auto rounded-b-xl">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-muted/30">
                            <TableHead className="text-xs font-bold w-8">#</TableHead>
                            <TableHead className="text-xs font-bold">작업번호</TableHead>
                            <TableHead className="text-xs font-bold">작업명</TableHead>
                            <TableHead className="text-xs font-bold">팀</TableHead>
                            <TableHead className="text-xs font-bold">고위험유형</TableHead>
                            <TableHead className="text-xs font-bold">안전허가서</TableHead>
                            <TableHead className="text-xs font-bold">위험도</TableHead>
                            <TableHead className="text-xs font-bold">TBM AI</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {highRiskRecords.map((r, i) => {
                            const isIssue = r.safetyPermit !== 'Y';
                            return (
                              <TableRow key={r.id} className={isIssue ? 'bg-red-50/30 dark:bg-red-950/10' : ''}>
                                <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                                <TableCell className="text-xs font-mono">{r.workOrderNo}</TableCell>
                                <TableCell className="text-xs max-w-[200px] truncate">{r.workName}</TableCell>
                                <TableCell className="text-xs">{r.team}</TableCell>
                                <TableCell><HighRiskBadge value={r.highRiskWork} /></TableCell>
                                <TableCell><PermitBadge value={r.safetyPermit} highRisk={r.highRiskWork} /></TableCell>
                                <TableCell>
                                  <span className="text-xs font-semibold" style={{ color: RISK_COLORS[r.riskLevel || ''] || '#94a3b8' }}>
                                    {r.riskLevel || '-'}
                                  </span>
                                </TableCell>
                                <TableCell><StatusBadge value={r.tbmAiResult} /></TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Detail Table */}
      {selectedUploadId && showDetail && (
        <Card className="border-0 shadow-sm bg-card/60">
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <CardTitle className="text-sm font-bold flex-1">전체 데이터 ({filteredRecords.length}건)</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Input placeholder="작업번호/작업명/팀 검색..." value={search} onChange={e => setSearch(e.target.value)}
                  className="h-8 text-xs w-48" data-testid="input-search" />
                <Select value={filterTeam} onValueChange={setFilterTeam}>
                  <SelectTrigger className="h-8 text-xs w-36" data-testid="select-filter-team">
                    <SelectValue placeholder="팀 전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">팀 전체</SelectItem>
                    {teams.map(t => <SelectItem key={t!} value={t!}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterIssue} onValueChange={setFilterIssue}>
                  <SelectTrigger className="h-8 text-xs w-44" data-testid="select-filter-issue">
                    <SelectValue placeholder="이슈 필터" />
                  </SelectTrigger>
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
            <div className="overflow-x-auto rounded-b-xl">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-bold w-8">#</TableHead>
                    <TableHead className="text-xs font-bold">작업번호</TableHead>
                    <TableHead className="text-xs font-bold">작업명</TableHead>
                    <TableHead className="text-xs font-bold">팀</TableHead>
                    <TableHead className="text-xs font-bold">고위험유형</TableHead>
                    <TableHead className="text-xs font-bold">안전허가서</TableHead>
                    <TableHead className="text-xs font-bold">TBM</TableHead>
                    <TableHead className="text-xs font-bold">TBM AI</TableHead>
                    <TableHead className="text-xs font-bold">위험도</TableHead>
                    <TableHead className="text-xs font-bold">시작일</TableHead>
                    <TableHead className="text-xs font-bold">공사유형</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRecords.map((r, i) => (
                    <TableRow key={r.id} data-testid={`row-record-${r.id}`}
                      className={isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y' ? 'bg-red-50/20 dark:bg-red-950/10' : ''}>
                      <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="text-xs font-mono whitespace-nowrap">{r.workOrderNo}</TableCell>
                      <TableCell className="text-xs max-w-[180px] truncate" title={r.workName || ''}>{r.workName}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.team}</TableCell>
                      <TableCell><HighRiskBadge value={r.highRiskWork} /></TableCell>
                      <TableCell><PermitBadge value={r.safetyPermit} highRisk={r.highRiskWork} /></TableCell>
                      <TableCell><RegBadge value={r.tbmResult} /></TableCell>
                      <TableCell><StatusBadge value={r.tbmAiResult} /></TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold" style={{ color: RISK_COLORS[r.riskLevel || ''] || '#94a3b8' }}>
                          {r.riskLevel || '-'}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.startDate}</TableCell>
                      <TableCell className="text-xs">
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.workType === '직영공사' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'}`}>
                          {r.workType || '-'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {filteredRecords.length === 0 && (
                <div className="py-12 text-center text-sm text-muted-foreground">
                  조건에 맞는 데이터가 없습니다
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Issue detail dialog */}
      <Dialog open={!!activeIssue} onOpenChange={() => setActiveIssue(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              {activeIssue?.label} — {activeIssue?.list.length}건
            </DialogTitle>
          </DialogHeader>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">작업번호</TableHead>
                  <TableHead className="text-xs">작업명</TableHead>
                  <TableHead className="text-xs">팀</TableHead>
                  <TableHead className="text-xs">고위험유형</TableHead>
                  <TableHead className="text-xs">안전허가서</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeIssue?.list.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs font-mono">{r.workOrderNo}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate">{r.workName}</TableCell>
                    <TableCell className="text-xs">{r.team}</TableCell>
                    <TableCell><HighRiskBadge value={r.highRiskWork} /></TableCell>
                    <TableCell><PermitBadge value={r.safetyPermit} highRisk={r.highRiskWork} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
