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
  ResponsiveContainer, PieChart, Pie, Cell, LabelList, ReferenceLine,
} from "recharts";
import {
  Upload, Trash2, AlertTriangle, CheckCircle2,
  Clock, XCircle, ShieldCheck, ShieldAlert, FileWarning,
  TrendingUp, Users, Loader2, Eye, ChevronUp, Layers,
  CalendarDays, Calendar, ChevronLeft, ChevronRight,
  Camera, ImageIcon, Save, FileEdit, Pencil,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import type { AisSafetyUpload, AisSafetyRecord, AisTbmBadNote } from "@shared/schema";

const HIGH_RISK_TYPES = ['고소', '전원', '중장비', '굴착', '밀폐', '화기'];

function isHighRiskWork(val: string | null | undefined): boolean {
  if (!val || val === '없음' || val === 'X' || val.trim() === '') return false;
  return HIGH_RISK_TYPES.some(t => val.includes(t));
}

function isCancelled(r: AisSafetyRecord) {
  const status = (r.workStatus ?? '').trim();
  // 취소, 작업취소, 공사취소, 취소완료, 중단 등 모든 취소 패턴 포함
  return status.includes('취소') || status === '중단' || status === '반납';
}

function calcCompliance(records: AisSafetyRecord[]) {
  const active = records.filter(r => !isCancelled(r));
  if (!active.length) return { rate: 0, issues: [], highRiskNoPermit: [], tbmUnreg: [], tbmBad: [] };
  const highRiskNoPermit = active.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y');
  // TBM 미등록: 취소된 작업은 반드시 제외 (workStatus null 등 예외 상황 대비 이중 확인)
  const tbmUnreg = active.filter(r =>
    r.tbmResult === '미등록' && !(r.workStatus ?? '').includes('취소')
  );
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

function StatusBadge({ value, onClick, hasNote }: { value: string | null; onClick?: () => void; hasNote?: boolean }) {
  const v = value || '';
  if (v === '적합') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />적합</Badge>;
  if (v === '부적합') {
    if (hasNote) return (
      <Badge
        className={`bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-xs font-semibold gap-1 ${onClick ? 'cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/60' : ''}`}
        onClick={onClick}
        title="사유 기록됨 — 클릭하여 확인"
      >
        <FileEdit className="w-3 h-3" />부적합 <span className="text-amber-500 font-bold">✎</span>
      </Badge>
    );
    return (
      <Badge
        className={`bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-xs font-semibold gap-1 ${onClick ? 'cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/60' : ''}`}
        onClick={onClick}
        title="클릭하여 사유 기록"
      >
        <XCircle className="w-3 h-3" />부적합
      </Badge>
    );
  }
  if (v === '분析중' || v === '분析中' || v === '분석중') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0 text-xs font-semibold"><Loader2 className="w-3 h-3 mr-1 animate-spin" />분석중</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs"><Clock className="w-3 h-3 mr-1" />분석전</Badge>;
}

function PermitBadge({ value, highRisk }: { value: string | null; highRisk: string | null }) {
  const hr = isHighRiskWork(highRisk);
  if (value === 'Y') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />등록</Badge>;
  if (hr) return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-xs font-semibold"><AlertTriangle className="w-3 h-3 mr-1" />미등록</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs">해당없음</Badge>;
}

function RegBadge({ value, onClick, hasNote }: { value: string | null; onClick?: () => void; hasNote?: boolean }) {
  if (value === '등록') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />등록</Badge>;
  if (hasNote) return (
    <Badge
      className={`bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-300 dark:border-amber-700 text-xs font-semibold gap-1 ${onClick ? 'cursor-pointer hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors' : ''}`}
      onClick={onClick}
      title="사유 기록됨 — 클릭하여 확인"
    >
      <FileEdit className="w-3 h-3" />미등록 <span className="text-amber-500 font-bold">✎</span>
    </Badge>
  );
  return (
    <Badge
      className={`bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-xs ${onClick ? 'cursor-pointer hover:bg-red-200 dark:hover:bg-red-800/40 transition-colors' : ''}`}
      onClick={onClick}
      title={onClick ? '클릭하여 사유 기록' : undefined}
    >
      <XCircle className="w-3 h-3 mr-1" />미등록
    </Badge>
  );
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

function CircleGauge({ rate, total, pass: passCount, size = 'lg' }: { rate: number; total?: number; pass?: number; size?: 'lg' | 'sm' }) {
  const r = 50, circ = 2 * Math.PI * r, dash = (rate / 100) * circ;
  const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
  const label = rate >= 90 ? '우수' : rate >= 70 ? '양호' : '주의';
  const gid = `cg-grad-${rate}-${size}`;
  const wh = size === 'sm' ? 'w-24 h-24' : 'w-44 h-44';
  const numSz = size === 'sm' ? 'text-3xl' : 'text-5xl';
  const pctSz = size === 'sm' ? 'text-xs' : 'text-base';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className={`relative ${wh}`}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 120 120">
          <defs>
            <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={color} stopOpacity="0.5" />
              <stop offset="100%" stopColor={color} />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="14" />
          <circle cx="60" cy="60" r={r} fill="none" stroke={`url(#${gid})`} strokeWidth="14"
            strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
            style={{ filter:`drop-shadow(0 0 6px ${color}88)`, transition:'stroke-dasharray 1.2s cubic-bezier(0.4,0,0.2,1)' }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${numSz} font-black text-white leading-none`}>{rate}</span>
          <span className={`${pctSz} font-bold text-white/70 leading-none`}>%</span>
        </div>
      </div>
      <span className="text-xs font-bold px-2.5 py-0.5 rounded-full" style={{ backgroundColor:`${color}33`, color }}>{label}</span>
      {total != null && size === 'lg' && <p className="text-xs text-blue-100">{passCount}건 이행 / 전체 {total}건</p>}
    </div>
  );
}

// 팀별 현황 카드
function TeamBreakdown({ records, title, onIssueClick }: {
  records: AisSafetyRecord[];
  title: string;
  onIssueClick?: (label: string, list: AisSafetyRecord[]) => void;
}) {
  const teams = [...new Set(records.map(r => r.team).filter(Boolean))] as string[];
  if (teams.length === 0) return null;
  const teamStats = teams.map(team => {
    const tr = records.filter(r => r.team === team);
    const c = calcCompliance(tr);
    const issueList = c.issues.flatMap(i => i.list);
    return { team, count: tr.length, rate: c.rate, issueCount: issueList.length, issueList };
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
          {teamStats.map((s, idx) => {
            const barColor = s.rate >= 90 ? '#22c55e' : s.rate >= 70 ? '#f59e0b' : '#ef4444';
            return (
              <div key={s.team} className="flex flex-col rounded-xl border bg-card/90 overflow-hidden hover:shadow-sm transition-all" style={{ borderColor: `${barColor}30` }}>
                <div className="p-3 flex-1">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-xs font-semibold text-muted-foreground truncate" title={s.team}>{s.team}</p>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ backgroundColor:`${barColor}18`, color:barColor }}>{s.rate}%</span>
                  </div>
                  <p className="text-xl font-black leading-none mb-2">{s.count}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></p>
                  <div className="w-full h-1.5 rounded-full bg-muted/40 overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700" style={{ width:`${s.rate}%`, background:`linear-gradient(90deg,${barColor}aa,${barColor})` }} />
                  </div>
                </div>
                {s.issueCount > 0 ? (
                  <button
                    onClick={() => onIssueClick?.(`${title} · ${s.team} 이슈 목록`, s.issueList)}
                    className="border-t border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 px-3 py-1.5 text-left text-xs font-bold text-red-600 dark:text-red-400 transition-colors"
                  >
                    ⚠ 이슈 {s.issueCount}건 →
                  </button>
                ) : (
                  <div className="h-[30px] flex items-center px-3">
                    <span className="text-[10px] text-emerald-500 font-semibold">✓ 이슈없음</span>
                  </div>
                )}
              </div>
            );
          })}
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
  const [hrFilterTeam, setHrFilterTeam] = useState('all');
  const [hrFilterPermit, setHrFilterPermit] = useState('all');
  const [hrFilterType, setHrFilterType] = useState('all');
  const [hrSearch, setHrSearch] = useState('');
  const [hrFilterTbm, setHrFilterTbm] = useState('all');
  const [cumulativeMonth, setCumulativeMonth] = useState<string>('all');
  const [calendarMonth, setCalendarMonth] = useState<string>(() => new Date().toISOString().substring(0, 7));
  const [editingRecord, setEditingRecord] = useState<AisSafetyRecord | null>(null);
  const [editForm, setEditForm] = useState<Partial<AisSafetyRecord>>({});
  const [tbmNoteRecord, setTbmNoteRecord] = useState<AisSafetyRecord | null>(null);
  const [tbmNoteType, setTbmNoteType] = useState<'bad'|'unreg'>('bad');
  const [tbmNoteReason, setTbmNoteReason] = useState('');
  const [tbmNotePhoto, setTbmNotePhoto] = useState<File | null>(null);
  const [tbmNotePhotoPreview, setTbmNotePhotoPreview] = useState<string | null>(null);
  const [tbmNoteSaving, setTbmNoteSaving] = useState(false);
  const photoInputRef = useRef<HTMLInputElement>(null);

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
    if (viewMode === 'cumulative') {
      if (cumulativeMonth === 'all') return allRecords;
      return allRecords.filter(r => r.startDate?.startsWith(cumulativeMonth));
    }
    if (viewMode === 'daily' && selectedDate) return allRecords.filter(r => r.startDate === selectedDate);
    if (viewMode === 'monthly' && selectedMonth) return allRecords.filter(r => r.startDate?.startsWith(selectedMonth));
    return [];
  }, [allRecords, viewMode, selectedDate, selectedMonth, cumulativeMonth]);

  // 대시보드 계산용: 취소된 작업 제외
  const activeRecords = useMemo(() => records.filter(r => r.workStatus !== '취소'), [records]);

  const showDashboard = viewMode === 'cumulative' ||
    (viewMode === 'daily' && selectedDate !== null) ||
    (viewMode === 'monthly' && selectedMonth !== null);

  const { data: allTbmNotes = [] } = useQuery<AisTbmBadNote[]>({
    queryKey: ['/api/ais-safety/tbm-notes'],
    queryFn: async () => {
      const res = await fetch('/api/ais-safety/tbm-notes', { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });
  const tbmNoteMap = Object.fromEntries(allTbmNotes.map(n => [n.recordId, n]));
  // workOrderNo 기반 연동 맵: 같은 작업번호의 모든 레코드가 동일 사유를 공유
  const tbmNoteByWorkOrder = useMemo(() => {
    const map: Record<string, AisTbmBadNote> = {};
    allTbmNotes.forEach(n => {
      const rec = allRecords.find(r => r.id === n.recordId);
      if (rec?.workOrderNo) map[rec.workOrderNo] = n;
    });
    return map;
  }, [allTbmNotes, allRecords]);

  const openTbmNote = (r: AisSafetyRecord) => {
    setTbmNoteType('bad');
    setTbmNoteRecord(r);
    const existing = (r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : null) ?? tbmNoteMap[r.id];
    setTbmNoteReason(existing?.reason || '');
    setTbmNotePhotoPreview(existing?.photoUrl || null);
    setTbmNotePhoto(null);
  };
  const openTbmUnregNote = (r: AisSafetyRecord) => {
    setTbmNoteType('unreg');
    setTbmNoteRecord(r);
    const existing = (r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : null) ?? tbmNoteMap[r.id];
    setTbmNoteReason(existing?.reason || '');
    setTbmNotePhotoPreview(existing?.photoUrl || null);
    setTbmNotePhoto(null);
  };

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

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<AisSafetyRecord> }) => {
      const res = await fetch(`/api/ais-safety/records/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
        credentials: 'include',
      });
      if (!res.ok) throw new Error('수정 실패');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/records/all'] });
      toast({ title: '수정되었습니다' });
      setEditingRecord(null);
    },
    onError: () => toast({ title: '수정 실패', variant: 'destructive' }),
  });

  const openEdit = (r: AisSafetyRecord) => {
    setEditingRecord(r);
    setEditForm({ ...r });
  };

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
  const highRiskRecords = activeRecords
    .filter(r => isHighRiskWork(r.highRiskWork))
    .sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
  const hrTeams = [...new Set(highRiskRecords.map(r => r.team).filter(Boolean))];
  const filteredHighRiskRecords = highRiskRecords.filter(r => {
    if (hrFilterTeam !== 'all' && r.team !== hrFilterTeam) return false;
    if (hrFilterPermit === 'registered' && r.safetyPermit !== 'Y') return false;
    if (hrFilterPermit === 'unregistered' && r.safetyPermit === 'Y') return false;
    if (hrFilterType !== 'all' && !(r.highRiskWork || '').includes(hrFilterType)) return false;
    if (hrFilterTbm === 'suita') { if (r.tbmAiResult !== '적합') return false; }
    else if (hrFilterTbm === 'unsuita') { if (r.tbmAiResult !== '부적합') return false; }
    else if (hrFilterTbm === 'analyzing') { if (r.tbmAiResult !== '분석중') return false; }
    else if (hrFilterTbm === 'pending') { if (r.tbmAiResult && r.tbmAiResult !== '분석전') return false; }
    if (hrSearch) {
      const q = hrSearch.toLowerCase();
      if (!(r.workOrderNo || '').toLowerCase().includes(q) &&
          !(r.workName || '').toLowerCase().includes(q) &&
          !(r.team || '').toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const highRiskBreakdown = getHighRiskBreakdown(activeRecords);

  const filteredRecords = records.filter(r => {
    if (filterTeam !== 'all' && r.team !== filterTeam) return false;
    if (filterIssue === 'highRisk' && !isHighRiskWork(r.highRiskWork)) return false;
    if (filterIssue === 'noPermit' && !(isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y')) return false;
    if (filterIssue === 'tbmUnreg' && r.tbmResult !== '미등록') return false;
    if (filterIssue === 'tbmBad' && r.tbmAiResult !== '부적합') return false;
    if (filterIssue === 'tbmAnalyzing' && r.tbmAiResult !== '분석중') return false;
    if (filterIssue === 'tbmPending' && r.tbmAiResult && r.tbmAiResult !== '분석전') return false;
    if (filterIssue === 'cancelled' && !isCancelled(r)) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.workOrderNo || '').toLowerCase().includes(q)
        || (r.workName || '').toLowerCase().includes(q)
        || (r.team || '').toLowerCase().includes(q)
        || (r.vendorName || '').toLowerCase().includes(q)
        || (r.workLocation || '').toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));

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
    const issueCount = (c.issues || []).reduce((s, i) => s + i.list.length, 0);
    const issueList = (c.issues || []).flatMap(i => i.list);
    return { team: team?.replace('운용팀', '').replace('팀', '') || '미지정', fullTeam: team || '', rate: c.rate, count: tr.length, issueCount, issueList };
  }).sort((a, b) => b.rate - a.rate);

  const complianceItems = [
    { label: '안전허가서 매칭', icon: ShieldCheck, total: highRiskRecords.length, pass: highRiskRecords.filter(r => r.safetyPermit === 'Y').length, description: '고위험작업 시 안전허가서 등록', emptyLabel: '고위험작업 없음' },
    { label: 'TBM 등록률', icon: Users, total: activeRecords.length, pass: activeRecords.filter(r => r.tbmResult === '등록').length, description: 'TBM 활동 등록 여부', emptyLabel: '데이터 없음' },
  ];

  const dailyTrendData = useMemo(() => {
    const valid = dailyGroups.filter(g => g.date !== '날짜 미상' && /^\d{4}-\d{2}-\d{2}$/.test(g.date));
    const [yr, mo] = calendarMonth.split('-').map(Number);
    const daysInMonth = new Date(yr, mo, 0).getDate();
    const dataMap = new Map(valid.filter(g => g.date.startsWith(calendarMonth)).map(g => [g.date, g]));
    return Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      const dateStr = `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const g = dataMap.get(dateStr);
      return { date: String(d), rate: g ? g.rate : null as any, count: g ? g.records.length : 0, fullDate: dateStr, hasData: !!g };
    });
  }, [dailyGroups, calendarMonth]);

  const monthlyTrendData = monthlyGroups.filter(g => g.month !== '월 미상').slice(0, 12).reverse()
    .map(g => ({ month: g.month, rate: g.rate, count: g.records.length }));

  const tabBtn = (mode: ViewMode, icon: any, label: string) => {
    const Icon = icon;
    const active = viewMode === mode;
    return (
      <button data-testid={`tab-${mode}`}
        onClick={() => { setViewMode(mode); setSelectedDate(null); setSelectedMonth(null); setShowDetail(false); }}
        className={`flex items-center justify-center gap-1.5 px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all flex-1 sm:flex-none whitespace-nowrap ${active ? 'bg-blue-600 text-white shadow-sm' : 'text-muted-foreground hover:bg-muted/60'}`}>
        <Icon className="w-4 h-4 flex-shrink-0" /><span>{label}</span>
      </button>
    );
  };

  // 드릴다운 헤더 라벨
  const drilldownLabel = viewMode === 'daily' && selectedDate
    ? selectedDate
    : viewMode === 'monthly' && selectedMonth
      ? selectedMonth
      : null;

  const handleTbmNoteSave = async () => {
    if (!tbmNoteRecord) return;
    setTbmNoteSaving(true);
    try {
      // 1) 기본 레코드 저장 (사진 포함)
      const formData = new FormData();
      formData.append('noteType', tbmNoteType);
      formData.append('reason', tbmNoteReason);
      if (tbmNotePhoto) formData.append('photo', tbmNotePhoto);
      await fetch(`/api/ais-safety/records/${tbmNoteRecord.id}/tbm-note`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      // 2) 같은 workOrderNo를 가진 다른 레코드에도 사유 연동
      if (tbmNoteRecord.workOrderNo) {
        const linked = allRecords.filter(r =>
          r.id !== tbmNoteRecord.id &&
          r.workOrderNo === tbmNoteRecord.workOrderNo &&
          (tbmNoteType === 'bad' ? r.tbmAiResult === '부적합' : r.tbmResult === '미등록')
        );
        await Promise.all(linked.map(r => {
          const fd = new FormData();
          fd.append('noteType', tbmNoteType);
          fd.append('reason', tbmNoteReason);
          return fetch(`/api/ais-safety/records/${r.id}/tbm-note`, {
            method: 'POST',
            credentials: 'include',
            body: fd,
          });
        }));
      }
      await queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/tbm-notes'] });
      const linkedCount = tbmNoteRecord.workOrderNo
        ? allRecords.filter(r => r.id !== tbmNoteRecord.id && r.workOrderNo === tbmNoteRecord.workOrderNo && (tbmNoteType === 'bad' ? r.tbmAiResult === '부적합' : r.tbmResult === '미등록')).length
        : 0;
      toast({
        title: tbmNoteType === 'unreg' ? 'TBM 미등록 사유가 저장되었습니다 ✎' : 'TBM AI 부적합 사유가 저장되었습니다 ✎',
        description: linkedCount > 0 ? `동일 작업번호 ${linkedCount}건에도 연동 저장됨` : (tbmNoteReason ? `사유: ${tbmNoteReason.slice(0, 40)}${tbmNoteReason.length > 40 ? '...' : ''}` : undefined),
      });
      setTbmNoteRecord(null);
    } catch {
      toast({ title: '저장에 실패했습니다', variant: 'destructive' });
    } finally {
      setTbmNoteSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* TBM 부적합 사유 다이얼로그 */}
      <Dialog open={!!tbmNoteRecord} onOpenChange={open => { if (!open) setTbmNoteRecord(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><XCircle className="w-4 h-4" />{tbmNoteType === 'unreg' ? 'TBM 미등록 사유/사진 기록' : 'TBM AI 부적합 사유 기록'}</DialogTitle>
          </DialogHeader>
          {tbmNoteRecord && (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-3 text-xs space-y-1">
                <p className="font-semibold text-sm text-foreground">{tbmNoteRecord.workName || '-'}</p>
                <p className="text-muted-foreground">{tbmNoteRecord.workOrderNo} · {tbmNoteRecord.team} · {tbmNoteRecord.startDate}</p>
              </div>
              {/* 기존 사유 기록 미리보기 */}
              {(tbmNoteRecord.workOrderNo ? tbmNoteByWorkOrder[tbmNoteRecord.workOrderNo] : tbmNoteMap[tbmNoteRecord.id]) && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs space-y-1">
                  <p className="flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400"><FileEdit className="w-3.5 h-3.5" />기존 사유 기록됨</p>
                  {(() => {
                    const en = tbmNoteRecord.workOrderNo ? tbmNoteByWorkOrder[tbmNoteRecord.workOrderNo] : tbmNoteMap[tbmNoteRecord.id];
                    return (
                      <>
                        {en?.reason && <p className="text-muted-foreground whitespace-pre-line">{en.reason}</p>}
                        {en?.photoUrl && <p className="text-amber-600 dark:text-amber-400">📷 사진 첨부됨</p>}
                        <p className="text-muted-foreground/60">수정하려면 아래에서 다시 작성 후 저장</p>
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{tbmNoteType === 'unreg' ? '미등록 사유 사진' : '부적합 사진'}</Label>
                <div className="flex items-start gap-3">
                  {tbmNotePhotoPreview ? (
                    <div className="relative">
                      <img src={tbmNotePhotoPreview} alt="부적합 사진" className="w-28 h-28 object-cover rounded-lg border" />
                      <button className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        onClick={() => { setTbmNotePhotoPreview(null); setTbmNotePhoto(null); }}>×</button>
                    </div>
                  ) : (
                    <div className="w-28 h-28 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => photoInputRef.current?.click()}>
                      <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground">사진 추가</span>
                    </div>
                  )}
                  <Button variant="outline" size="sm" className="mt-1" onClick={() => photoInputRef.current?.click()}>
                    <Camera className="w-3.5 h-3.5 mr-1" />{tbmNotePhotoPreview ? '사진 변경' : '사진 선택'}
                  </Button>
                  <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      setTbmNotePhoto(file);
                      setTbmNotePhotoPreview(URL.createObjectURL(file));
                    }
                  }} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{tbmNoteType === 'unreg' ? '미등록 사유' : '부적합 사유'}</Label>
                <Textarea
                  placeholder={tbmNoteType === 'unreg' ? 'TBM 미등록 사유를 작성해주세요. (예: 작업 시작 전 TBM 미실시, 담당자 부재 등)' : 'TBM AI가 부적합으로 판정한 사유를 작성해주세요. (예: 안전모 미착용, 안전대 미착용, 작업허가서 내용 불일치 등)'}
                  value={tbmNoteReason}
                  onChange={e => setTbmNoteReason(e.target.value)}
                  className="min-h-[100px] text-sm resize-none"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setTbmNoteRecord(null)}>취소</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700 text-white" disabled={tbmNoteSaving} onClick={handleTbmNoteSave}>
                  {tbmNoteSaving ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1" />}저장
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
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
            {uploading ? <><Loader2 className="w-4 h-4 sm:mr-2 animate-spin" /><span className="hidden sm:inline">업로드 중...</span></> : <><Upload className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">CSV 업로드</span></>}
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
            <div className="flex items-center gap-1 bg-muted/40 p-1 rounded-xl mb-4 w-full sm:w-fit overflow-x-auto">
              {tabBtn('cumulative', Layers, '전체 누적')}
              {tabBtn('daily', CalendarDays, '일단위 관리')}
              {tabBtn('monthly', Calendar, '월단위 관리')}
            </div>

            {/* 전체 누적: 업로드 파일 목록 */}
            {viewMode === 'cumulative' && (
              <div className="flex flex-col gap-3">
                <div className="flex items-center flex-wrap gap-3">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Layers className="w-3.5 h-3.5 text-blue-500" />
                    <span>전체 {uploads.length}개 파일 · 총 {uploads.reduce((s, u) => s + (u.recordCount || 0), 0)}건</span>
                  </div>
                  {monthlyGroups.length > 0 && (
                    <div className="flex items-center gap-2 ml-auto">
                      <span className="text-xs text-muted-foreground font-semibold">월 선택:</span>
                      <Select value={cumulativeMonth} onValueChange={v => { setCumulativeMonth(v); setCurrentPage(1); }}>
                        <SelectTrigger className="h-7 text-xs w-32" data-testid="select-cumulative-month"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">전체 누적</SelectItem>
                          {monthlyGroups.map(g => (
                            <SelectItem key={g.month} value={g.month}>{g.month} ({g.records.length}건)</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {[...uploads].sort((a, b) => (b.workDate ?? '').localeCompare(a.workDate ?? '')).map(u => (
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
                    {dailyTrendData.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-muted-foreground mb-2">
                          일별 이행률 추세 ({calendarMonth} — {dailyTrendData.length}일 데이터)
                        </p>
                        <div className="flex items-center gap-2 mb-1 justify-end">
                          <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 font-semibold">
                            <span className="inline-block w-6 border-t-2 border-dashed border-indigo-400" />목표 90%
                          </span>
                        </div>
                        <ResponsiveContainer width="100%" height={190}>
                          <BarChart data={dailyTrendData} margin={{ left: 4, right: 16, top: 22, bottom: 0 }} barCategoryGap="30%">
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                            <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} interval={1} />
                            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={40} />
                            <ReTooltip
                              contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: 12 }}
                              formatter={(v: any, _: any, p: any) => [`${v}% · ${p.payload.count}건`, '이행률']}
                              cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                            />
                            <ReferenceLine y={90} stroke="#6366f1" strokeDasharray="4 3" strokeWidth={1.5} />
                            <Bar dataKey="rate" radius={[4, 4, 2, 2]} maxBarSize={28} onClick={(d) => d.hasData && setSelectedDate(d.fullDate)} cursor="pointer">
                              {dailyTrendData.map((entry, i) => (
                                <Cell key={i} fill={entry.hasData ? (entry.rate >= 90 ? '#22c55e' : entry.rate >= 70 ? '#f59e0b' : '#ef4444') : '#e2e8f0'} fillOpacity={entry.hasData ? 0.85 : 0.5} />
                              ))}
                              <LabelList dataKey="rate" position="top" formatter={(v: any) => v !== null && v !== undefined ? `${v}%` : ''} style={{ fontSize: 10, fontWeight: 800, fill: '#1e293b' }} />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    <p className="text-xs font-semibold text-muted-foreground">날짜를 선택하면 해당 일의 상세 현황을 확인합니다</p>
                    {(() => {
                      const dateMap = new Map(dailyGroups.map(g => [g.date, g]));
                      const [yr, mo] = calendarMonth.split('-').map(Number);
                      const daysInMonth = new Date(yr, mo, 0).getDate();
                      const firstDow = new Date(yr, mo - 1, 1).getDay();
                      const weekLabels = ['일', '월', '화', '수', '목', '금', '토'];
                      const allDays = Array.from({ length: daysInMonth }, (_, i) => {
                        const d = i + 1;
                        const ds = `${yr}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                        return { day: d, dateStr: ds, dow: new Date(yr, mo - 1, d).getDay(), group: dateMap.get(ds) ?? null };
                      });
                      const monthHasData = allDays.some(d => d.group !== null);
                      const prevMonth = () => {
                        const [y, m] = calendarMonth.split('-').map(Number);
                        setCalendarMonth(m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`);
                      };
                      const nextMonth = () => {
                        const [y, m] = calendarMonth.split('-').map(Number);
                        setCalendarMonth(m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`);
                      };
                      return (
                        <div className="space-y-3">
                          {/* 월 네비게이터 */}
                          <div className="flex items-center justify-between bg-muted/30 rounded-xl px-3 py-2">
                            <button onClick={prevMonth} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 transition-colors text-sm font-medium">
                              <ChevronLeft className="w-4 h-4" />이전달
                            </button>
                            <div className="text-center">
                              <p className="text-base font-black">{yr}년 {mo}월</p>
                              <p className={`text-[11px] ${monthHasData ? 'text-muted-foreground' : 'text-amber-500 font-semibold'}`}>
                                {monthHasData ? `${allDays.filter(d => d.group).length}일 데이터 있음` : '데이터 없음'}
                              </p>
                            </div>
                            <button onClick={nextMonth} className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted/60 transition-colors text-sm font-medium">
                              다음달<ChevronRight className="w-4 h-4" />
                            </button>
                          </div>
                          {recordsLoading ? (
                            <div className="flex items-center gap-2 text-sm text-muted-foreground py-4"><Loader2 className="w-4 h-4 animate-spin" />데이터 불러오는 중...</div>
                          ) : (
                            <div>
                              <div className="grid grid-cols-7 gap-1 mb-1">
                                {weekLabels.map((w, i) => (
                                  <div key={w} className={`text-center text-[11px] font-bold py-1 ${i === 0 ? 'text-red-500' : i === 6 ? 'text-blue-500' : 'text-muted-foreground'}`}>{w}</div>
                                ))}
                              </div>
                              <div className="grid grid-cols-7 gap-1">
                                {Array.from({ length: firstDow }, (_, i) => <div key={`b${i}`} />)}
                                {allDays.map(({ day, dateStr, dow, group }) => {
                                  const isWeekend = dow === 0 || dow === 6;
                                  if (!group) {
                                    return (
                                      <div key={dateStr} className={`min-h-[48px] sm:min-h-[64px] rounded-lg border border-dashed border-border/30 p-1 sm:p-1.5 ${isWeekend ? 'bg-muted/5' : ''}`}>
                                        <span className={`text-[11px] font-semibold ${isWeekend ? (dow === 0 ? 'text-red-300' : 'text-blue-300') : 'text-muted-foreground/30'}`}>{day}</span>
                                      </div>
                                    );
                                  }
                                  const totalIssues = (group.issues || []).reduce((a: number, b: any) => a + b.count, 0);
                                  const issueRecords = (group.issues || []).flatMap((i: any) => i.list);
                                  return (
                                    <div key={dateStr} className="flex flex-col rounded-lg border border-border hover:border-blue-300 dark:hover:border-blue-700 transition-all overflow-hidden min-h-[48px] sm:min-h-[64px]">
                                      <button
                                        data-testid={`card-date-${dateStr}`}
                                        onClick={() => setSelectedDate(dateStr)}
                                        className="flex-1 text-left p-1.5 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors"
                                      >
                                        <span className={`text-[11px] font-bold block mb-0.5 ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : ''}`}>{day}</span>
                                        <p className="text-sm sm:text-base font-black leading-none mb-0.5 sm:mb-1">{group.records.length}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">건</span></p>
                                        <RateBadge value={group.rate} />
                                      </button>
                                      {totalIssues > 0 ? (
                                        <button
                                          data-testid={`btn-issue-${dateStr}`}
                                          onClick={(e) => { e.stopPropagation(); setActiveIssue({ label: `${dateStr} 이슈 목록`, list: issueRecords }); }}
                                          className="border-t border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 px-1.5 py-1 text-left text-[10px] font-bold text-red-600 dark:text-red-400 transition-colors whitespace-nowrap"
                                        >
                                          ⚠ {totalIssues}건
                                        </button>
                                      ) : (
                                        <div className="h-[22px]" />
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
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
                        <div className="flex items-center gap-2 mb-1 justify-end">
                          <span className="inline-flex items-center gap-1 text-[10px] text-indigo-500 font-semibold">
                            <span className="inline-block w-6 border-t-2 border-dashed border-indigo-400" />목표 90%
                          </span>
                        </div>
                        <ResponsiveContainer width="100%" height={190}>
                          <BarChart data={monthlyTrendData} margin={{ left: 4, right: 16, top: 22, bottom: 0 }} barCategoryGap="35%">
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" strokeOpacity={0.08} />
                            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} />
                            <YAxis domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11, fill: '#475569', fontWeight: 600 }} axisLine={false} tickLine={false} width={40} />
                            <ReTooltip
                              contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: 12 }}
                              formatter={(v: any, _: any, p: any) => [`${v}% · ${p.payload.count}건`, '이행률']}
                              cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                            />
                            <ReferenceLine y={90} stroke="#6366f1" strokeDasharray="4 3" strokeWidth={1.5} />
                            <Bar dataKey="rate" radius={[6, 6, 2, 2]} maxBarSize={52} onClick={(d) => setSelectedMonth(d.month)} cursor="pointer">
                              {monthlyTrendData.map((entry, i) => (
                                <Cell key={i} fill={entry.hasData ? (entry.rate >= 90 ? '#22c55e' : entry.rate >= 70 ? '#f59e0b' : '#ef4444') : '#e2e8f0'} fillOpacity={entry.hasData ? 0.85 : 0.5} />
                              ))}
                              <LabelList dataKey="rate" position="insideTop" formatter={(v: any) => `${v}%`} style={{ fontSize: 10, fontWeight: 700, fill: '#fff' }} />
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
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-2">
                        {monthlyGroups.map(g => {
                          const totalIssues = (g.issues || []).reduce((a, b) => a + b.count, 0);
                          const issueRecords = (g.issues || []).flatMap(i => i.list);
                          return (
                          <div key={g.month} className="flex flex-col rounded-lg border border-border hover:border-blue-300 dark:hover:border-blue-700 transition-all overflow-hidden">
                            <button data-testid={`card-month-${g.month}`} onClick={() => setSelectedMonth(g.month)}
                              className="flex-1 text-left p-3 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition-colors">
                              <p className="text-xs font-semibold text-muted-foreground mb-1">{g.month}</p>
                              <p className="text-lg font-black leading-none mb-1.5">{g.records.length}<span className="text-xs font-normal text-muted-foreground ml-0.5">건</span></p>
                              <RateBadge value={g.rate} />
                            </button>
                            {totalIssues > 0 ? (
                              <button
                                data-testid={`btn-issue-month-${g.month}`}
                                onClick={(e) => { e.stopPropagation(); setActiveIssue({ label: `${g.month} 이슈 목록`, list: issueRecords }); }}
                                className="border-t border-red-200 dark:border-red-800 bg-red-50/60 dark:bg-red-950/20 hover:bg-red-100 dark:hover:bg-red-950/40 px-3 py-1.5 text-left text-xs font-bold text-red-600 dark:text-red-400 transition-colors"
                              >
                                ⚠ 이슈 {totalIssues}건 →
                              </button>
                            ) : (
                              <div className="h-[30px]" />
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
                <TeamBreakdown records={records} title={drilldownLabel} onIssueClick={(label, list) => setActiveIssue({ label, list })} />
              )}

              {/* 통합 KPI 패널 */}
              <Card className="overflow-hidden border-0 shadow-md">
                <div className="flex flex-col lg:flex-row">
                  {/* 왼쪽: 원형 게이지 */}
                  <div className="lg:w-44 flex-shrink-0 flex flex-row lg:flex-col items-center justify-center py-3 px-4 lg:py-4 lg:px-5 text-white gap-2 lg:gap-1"
                    style={{ background:'linear-gradient(160deg,#1d4ed8 0%,#2563eb 55%,#4f46e5 100%)', boxShadow:'inset -4px 0 16px rgba(0,0,0,0.15)' }}>
                    <p className="text-[10px] font-bold text-blue-200 uppercase tracking-widest mb-1 hidden lg:block">전체 이행률</p>
                    <CircleGauge rate={comp.rate} size="sm" />
                    <p className="text-[11px] text-blue-200 mt-1 text-center leading-tight">
                      {records.length - (comp.issues||[]).reduce((a,b)=>a+b.count,0)}건 이행 / {records.length}건
                    </p>
                    {(comp.issues||[]).length > 0 && (
                      <div className="flex flex-wrap gap-1 justify-center mt-1">
                        {(comp.issues||[]).map(issue => (
                          <span key={issue.label} className="text-[10px] bg-white/10 text-blue-100 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                            {issue.label} <span className="font-bold text-white">{issue.count}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* 오른쪽: KPI + Compliance 통합 */}
                  <div className="flex-1 divide-y divide-border/60">
                    {/* 상단: KPI 2열 */}
                    <div className="grid grid-cols-2 divide-x divide-border/60">
                      {/* 6대 고위험 */}
                      <div className="p-3 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-3.5 h-3.5 text-orange-600 dark:text-orange-400" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground truncate">6대 고위험작업</span>
                        </div>
                        <p className="text-2xl font-black leading-none">{highRiskRecords.length}<span className="text-xs font-normal text-muted-foreground ml-1">건</span></p>
                        <p className="text-[11px] text-muted-foreground">허가서 <span className="font-bold text-emerald-600">{highRiskRecords.filter(r => r.safetyPermit === 'Y').length}건</span></p>
                        {comp.highRiskNoPermit && comp.highRiskNoPermit.length > 0 && (
                          <p className="text-[11px] text-red-600 font-semibold">⚠ 미매칭 {comp.highRiskNoPermit.length}건</p>
                        )}
                        {highRiskBreakdown.length > 0 && (
                          <div className="flex flex-col gap-0.5 mt-0.5">
                            {highRiskBreakdown.filter(d => !d.isNone && d.total > 0).map(d => {
                              const rate = d.total === 0 ? 100 : Math.round((d.permit / d.total) * 100);
                              return (
                                <div key={d.type} className={`flex items-center justify-between px-2 py-0.5 rounded-md ${d.total === 0 ? 'opacity-40' : 'bg-orange-50/60 dark:bg-orange-950/20'}`}>
                                  <span className="text-[10px] font-semibold text-muted-foreground">{d.type}</span>
                                  <div className="flex items-center gap-1">
                                    <span className={`text-[10px] font-black ${d.total === 0 ? 'text-muted-foreground' : ''}`}>{d.total}</span>
                                    {d.total > 0 && <RateBadge value={rate} />}
                                    {d.noPermit > 0 && <span className="text-[9px] text-red-600 font-bold">미{d.noPermit}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {/* 이슈사항 */}
                      <div className="p-3 flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-6 h-6 rounded-md bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                            <XCircle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                          </div>
                          <span className="text-xs font-semibold text-muted-foreground truncate">이슈사항</span>
                        </div>
                        <p className="text-2xl font-black leading-none">{(comp.issues || []).reduce((a, b) => a + b.count, 0)}<span className="text-xs font-normal text-muted-foreground ml-1">건</span></p>
                        {(comp.issues || []).length > 0 ? (
                          <div className="flex flex-col gap-1 mt-0.5">
                            {(comp.issues || []).map(issue => (
                              <button key={issue.label} onClick={() => setActiveIssue(issue)}
                                className="flex items-center justify-between px-2 py-1 rounded-lg bg-red-50/80 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/40 hover:border-red-400 dark:hover:border-red-600 transition-all group"
                                data-testid={`button-issue-top-${issue.label}`}>
                                <span className="text-[10px] font-semibold text-muted-foreground truncate">{issue.label}</span>
                                <span className="text-xs font-black text-red-600 dark:text-red-400 ml-1 flex-shrink-0">{issue.count}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground">이슈 없음</p>
                        )}
                      </div>
                    </div>

                    {/* 하단: Compliance 2열 */}
                    <div className="grid grid-cols-2 divide-x divide-border/60">
                      {complianceItems.map(item => {
                        const rate = item.total === 0 ? 100 : Math.round((item.pass / item.total) * 100);
                        const fail = item.total - item.pass;
                        const Icon = item.icon;
                        const barColor = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
                        const hasIssue = item.total > 0 && rate < 90;
                        return (
                          <div key={item.label} className="p-3">
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-1.5">
                                <div className={`w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${hasIssue ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                                  <Icon className={`w-3.5 h-3.5 ${hasIssue ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                                </div>
                                <span className="text-xs font-semibold text-muted-foreground">{item.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {fail > 0 && <span className="text-[11px] font-bold text-red-500">미이행 {fail}건</span>}
                                {item.total > 0 && <RateBadge value={rate} />}
                              </div>
                            </div>
                            {item.total === 0 ? (
                              <p className="text-xs text-muted-foreground">{item.emptyLabel}</p>
                            ) : (
                              <>
                                <div className="flex items-baseline gap-1.5 mb-1.5">
                                  <span className="text-xl font-black" style={{ color: barColor }}>{item.pass}</span>
                                  <span className="text-xs text-muted-foreground">/ {item.total}건</span>
                                  <span className="text-[11px] text-muted-foreground ml-auto">{item.description}</span>
                                </div>
                                <div className="w-full h-2.5 bg-muted/40 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-700"
                                    style={{ width:`${rate}%`, background:`linear-gradient(90deg,${barColor}88,${barColor})`, boxShadow:`0 0 6px ${barColor}55` }} />
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Card>



              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                <Card className="border-0 shadow-sm bg-card/60 flex flex-col">
                  <CardHeader className="pb-1 pt-3 px-4">
                    <CardTitle className="text-sm font-bold">TBM AI 분석결과</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 pt-2 flex-1 flex flex-col justify-center">
                    {tbmAiData.length > 0 ? (() => {
                      const total = tbmAiData.reduce((s, d) => s + d.value, 0);
                      return (
                        <div className="flex flex-col items-center gap-4 w-full">
                          {/* 도넛 차트 — 상단 중앙 */}
                          <div className="relative flex-shrink-0" style={{ width: 180, height: 180 }}>
                            <PieChart width={180} height={180}>
                              <Pie data={tbmAiData} cx="50%" cy="50%" innerRadius={58} outerRadius={80}
                                dataKey="value" labelLine={false} paddingAngle={3} stroke="none">
                                {tbmAiData.map((d, i) => <Cell key={i} fill={d.color} fillOpacity={0.9} />)}
                              </Pie>
                              <ReTooltip
                                contentStyle={{ borderRadius: 8, border: 'none', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', fontSize: 12 }}
                                formatter={(v: any, name: any) => [`${v}건 (${total > 0 ? Math.round(v/total*100) : 0}%)`, name]}
                              />
                            </PieChart>
                            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                              <span className="text-3xl font-black">{total}</span>
                              <span className="text-[11px] font-semibold text-muted-foreground">전체 건</span>
                            </div>
                          </div>
                          {/* 항목 3열 가로 배치 */}
                          <div className="grid grid-cols-3 gap-2 w-full">
                            {tbmAiData.map(d => {
                              const pct = total > 0 ? Math.round(d.value / total * 100) : 0;
                              return (
                                <div key={d.name} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border transition-all hover:shadow-sm" style={{ borderColor: `${d.color}40`, backgroundColor: `${d.color}0d` }}>
                                  <div className="flex items-center gap-1">
                                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: d.color }} />
                                    <span className="text-[11px] font-semibold">{d.name}</span>
                                  </div>
                                  <span className="text-xl font-black" style={{ color: d.color }}>{d.value}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">건</span></span>
                                  <span className="text-xs font-bold" style={{ color: d.color }}>{pct}%</span>
                                  <div className="w-full h-1 bg-muted/40 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-700" style={{ width: `${pct}%`, backgroundColor: d.color }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })() : <p className="text-center text-sm text-muted-foreground py-12">데이터 없음</p>}
                  </CardContent>
                </Card>

                <Card className="border-0 shadow-sm bg-card/60 lg:col-span-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-blue-500" />팀별 이행률
                      </CardTitle>
                      {teamData.length > 0 && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-emerald-500"></span>90% 이상</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-amber-500"></span>70~89%</span>
                          <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-red-500"></span>70% 미만</span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {teamData.length > 0 ? (
                      <div className="space-y-2">
                        {teamData.map((entry, i) => {
                          const color = entry.rate >= 90 ? { bar: 'bg-emerald-500', track: 'bg-emerald-100 dark:bg-emerald-950/40', text: 'text-emerald-700 dark:text-emerald-300', badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' }
                            : entry.rate >= 70 ? { bar: 'bg-amber-500', track: 'bg-amber-100 dark:bg-amber-950/40', text: 'text-amber-700 dark:text-amber-300', badge: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' }
                            : { bar: 'bg-red-500', track: 'bg-red-100 dark:bg-red-950/40', text: 'text-red-700 dark:text-red-300', badge: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300' };
                          return (
                            <div key={entry.team} className="group rounded-xl border bg-card/90 hover:shadow-md hover:border-border/80 transition-all overflow-hidden">
                              <div className="flex items-center gap-3 px-3 py-3">
                                {/* 순위 */}
                                <span className={`text-xs font-black w-5 text-center flex-shrink-0 ${i < 3 ? ['text-amber-500','text-slate-400','text-orange-400'][i] : 'text-muted-foreground/50'}`}>{i + 1}</span>
                                {/* 팀명 */}
                                <span className="text-xs font-bold w-20 flex-shrink-0 truncate" title={entry.fullTeam}>{entry.team}</span>
                                {/* 진행바 */}
                                <div className="flex-1 relative">
                                  <div className="w-full h-6 rounded-full bg-muted/40 overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-700 flex items-center justify-end pr-2"
                                      style={{
                                        width: `${Math.max(entry.rate, 2)}%`,
                                        background: entry.rate >= 90
                                          ? 'linear-gradient(90deg,#16a34a,#22c55e)'
                                          : entry.rate >= 70
                                          ? 'linear-gradient(90deg,#d97706,#f59e0b)'
                                          : 'linear-gradient(90deg,#dc2626,#ef4444)',
                                        boxShadow: entry.rate >= 90 ? '0 0 8px #22c55e55' : entry.rate >= 70 ? '0 0 8px #f59e0b55' : '0 0 8px #ef444455'
                                      }}
                                    >
                                      {entry.rate >= 25 && (
                                        <span className="text-white text-[10px] font-black leading-none drop-shadow">{entry.rate}%</span>
                                      )}
                                    </div>
                                  </div>
                                  {entry.rate < 25 && (
                                    <span className={`absolute left-[calc(${Math.max(entry.rate,2)}%+6px)] top-1/2 -translate-y-1/2 text-[10px] font-bold ${color.text}`}>{entry.rate}%</span>
                                  )}
                                  {/* 90% 기준선 */}
                                  <div className="absolute top-0 bottom-0 border-l-2 border-dashed border-indigo-400/50 dark:border-indigo-500/40" style={{ left: '90%' }} />
                                </div>
                                {/* 건수 */}
                                <span className="text-xs font-semibold text-muted-foreground flex-shrink-0 w-10 text-right">{entry.count}건</span>
                                {/* 이슈 뱃지 */}
                                {entry.issueCount > 0 ? (
                                  <button
                                    onClick={() => setActiveIssue({ label: `${entry.fullTeam} 이슈 목록`, list: entry.issueList })}
                                    className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-bold bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-2 py-1 rounded-full hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors border border-red-200 dark:border-red-800"
                                  >
                                    <AlertTriangle className="w-2.5 h-2.5" />{entry.issueCount}
                                  </button>
                                ) : (
                                  <span className="flex-shrink-0 flex items-center gap-0.5 text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 px-2 py-1 rounded-full border border-emerald-200 dark:border-emerald-800">
                                    <CheckCircle2 className="w-2.5 h-2.5" />적합
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                        <p className="text-[10px] text-muted-foreground text-right pt-1">점선 = 90% 기준선</p>
                      </div>
                    ) : <p className="text-center text-sm text-muted-foreground py-12">데이터 없음</p>}
                  </CardContent>
                </Card>

              </div>

              {/* High risk table */}
              {highRiskRecords.length > 0 && (() => {
                const hrTotalPages = Math.ceil(filteredHighRiskRecords.length / highRiskPageSize);
                const hrSafePage = Math.min(highRiskPage, Math.max(1, hrTotalPages));
                const hrPaged = filteredHighRiskRecords.slice((hrSafePage - 1) * highRiskPageSize, hrSafePage * highRiskPageSize);
                return (
                <Card className="border-0 shadow-sm bg-card/60 lg:col-span-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-sm font-bold flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-orange-500" />
                        고위험작업 안전허가서 매칭 현황
                      </CardTitle>
                      <span className="text-xs font-normal text-muted-foreground">6대 고위험작업(고소·전기·중장비·굴착·밀폐·화기)</span>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{filteredHighRiskRecords.length === highRiskRecords.length ? `전체 ${highRiskRecords.length}건` : `${filteredHighRiskRecords.length} / ${highRiskRecords.length}건`}</span>
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
                    {/* 필터 행 */}
                    <div className="flex flex-wrap gap-2 mt-2 [&>*]:min-w-0">
                      <input
                        type="text"
                        placeholder="작업번호·작업명·팀 검색..."
                        value={hrSearch}
                        onChange={e => { setHrSearch(e.target.value); setHighRiskPage(1); }}
                        className="h-8 text-xs px-3 border border-input rounded-md bg-background w-52 focus:outline-none focus:ring-1 focus:ring-ring"
                        data-testid="input-hr-search"
                      />
                      <Select value={hrFilterTeam} onValueChange={v => { setHrFilterTeam(v); setHighRiskPage(1); }}>
                        <SelectTrigger className="h-8 text-xs w-36" data-testid="select-hr-team"><SelectValue placeholder="팀 전체" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">팀 전체</SelectItem>
                          {hrTeams.map(t => <SelectItem key={t!} value={t!}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={hrFilterPermit} onValueChange={v => { setHrFilterPermit(v); setHighRiskPage(1); }}>
                        <SelectTrigger className="h-8 text-xs w-36" data-testid="select-hr-permit"><SelectValue placeholder="허가서 전체" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">허가서 전체</SelectItem>
                          <SelectItem value="registered">등록</SelectItem>
                          <SelectItem value="unregistered">미등록</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select value={hrFilterType} onValueChange={v => { setHrFilterType(v); setHighRiskPage(1); }}>
                        <SelectTrigger className="h-8 text-xs w-36" data-testid="select-hr-type"><SelectValue placeholder="고위험 전체" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">고위험 전체</SelectItem>
                          {['고소', '전원', '중장비', '굴착', '밀폐', '화기'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Select value={hrFilterTbm} onValueChange={v => { setHrFilterTbm(v); setHighRiskPage(1); }}>
                        <SelectTrigger className="h-8 text-xs w-36" data-testid="select-hr-tbm"><SelectValue placeholder="TBM AI 전체" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">TBM AI 전체</SelectItem>
                          <SelectItem value="suita">적합</SelectItem>
                          <SelectItem value="unsuita">부적합</SelectItem>
                          <SelectItem value="analyzing">분석중</SelectItem>
                          <SelectItem value="pending">분석전</SelectItem>
                        </SelectContent>
                      </Select>
                      {(hrFilterTeam !== 'all' || hrFilterPermit !== 'all' || hrFilterType !== 'all' || hrFilterTbm !== 'all' || hrSearch) && (
                        <button className="h-8 text-xs px-2 rounded-md border border-input bg-background hover:bg-muted text-muted-foreground" onClick={() => { setHrFilterTeam('all'); setHrFilterPermit('all'); setHrFilterType('all'); setHrFilterTbm('all'); setHrSearch(''); setHighRiskPage(1); }}>초기화</button>
                      )}
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
                              <TableCell><StatusBadge value={r.tbmAiResult} onClick={r.tbmAiResult === '부적합' ? () => openTbmNote(r) : undefined} hasNote={!!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} /></TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    {hrTotalPages > 1 && (
                      <div className="flex items-center justify-between px-4 py-3 border-t">
                        <span className="text-xs text-muted-foreground">{(hrSafePage - 1) * highRiskPageSize + 1}–{Math.min(hrSafePage * highRiskPageSize, filteredHighRiskRecords.length)} / {filteredHighRiskRecords.length}건</span>
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
                  className="h-8 text-xs w-full sm:w-56" data-testid="input-search" />
                <Select value={filterTeam} onValueChange={v => { setFilterTeam(v); resetPage(); }}>
                  <SelectTrigger className="h-8 text-xs w-full sm:w-40" data-testid="select-filter-team"><SelectValue placeholder="팀 전체" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">팀 전체</SelectItem>
                    {teams.map(t => <SelectItem key={t!} value={t!}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterIssue} onValueChange={v => { setFilterIssue(v); resetPage(); }}>
                  <SelectTrigger className="h-8 text-xs w-full sm:w-48" data-testid="select-filter-issue"><SelectValue placeholder="이슈 필터" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    <SelectItem value="highRisk">6대 고위험작업만</SelectItem>
                    <SelectItem value="noPermit">안전허가서 미등록</SelectItem>
                    <SelectItem value="tbmUnreg">TBM 미등록</SelectItem>
                    <SelectItem value="tbmBad">TBM AI 부적합</SelectItem>
                    <SelectItem value="tbmAnalyzing">TBM AI 분석중</SelectItem>
                    <SelectItem value="tbmPending">TBM AI 분석전</SelectItem>
                    <SelectItem value="cancelled">취소된 작업</SelectItem>
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
                    <TableHead className="text-xs font-bold w-8"></TableHead>
                    <TableHead className="text-xs font-bold w-[120px]">작업번호</TableHead>
                    <TableHead className="text-xs font-bold min-w-[200px]">작업명</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px] hidden md:table-cell">공사유형</TableHead>
                    <TableHead className="text-xs font-bold min-w-[100px]">팀명</TableHead>
                    <TableHead className="text-xs font-bold min-w-[90px] hidden md:table-cell">협력사</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">고위험작업</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">안전허가서</TableHead>
                    <TableHead className="text-xs font-bold min-w-[60px]">위험도</TableHead>
                    <TableHead className="text-xs font-bold min-w-[60px]">TBM</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">TBM AI</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px]">작업상태</TableHead>
                    <TableHead className="text-xs font-bold min-w-[90px]">시작일</TableHead>
                    <TableHead className="text-xs font-bold min-w-[90px] hidden lg:table-cell">종료일</TableHead>
                    <TableHead className="text-xs font-bold min-w-[60px] hidden lg:table-cell">주/야간</TableHead>
                    <TableHead className="text-xs font-bold min-w-[120px] hidden lg:table-cell">작업장소</TableHead>
                    <TableHead className="text-xs font-bold min-w-[80px] hidden lg:table-cell">책임자</TableHead>
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
                      <TableCell className="p-1">
                        <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-blue-600"
                          onClick={() => openEdit(r)} data-testid={`button-edit-${r.id}`} title="수정">
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </TableCell>
                      <TableCell className="text-xs font-mono w-[120px]">
                        <span className="block truncate" title={r.workOrderNo || ''}>{r.workOrderNo || '-'}</span>
                        {r.workStatus === '취소' && <span className="text-[10px] text-muted-foreground bg-muted px-1 py-0.5 rounded ml-0.5">취소</span>}
                      </TableCell>
                      <TableCell className="text-xs min-w-[200px]">
                        <span title={r.workName || ''}>{r.workName || '-'}</span>
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap hidden md:table-cell">
                        {r.workType ? (
                          <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${r.workType.includes('직영') ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'}`}>
                            {r.workType}
                          </span>
                        ) : '-'}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.team || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap hidden md:table-cell">{r.vendorName || '-'}</TableCell>
                      <TableCell><HighRiskBadge value={r.highRiskWork} /></TableCell>
                      <TableCell><PermitBadge value={r.safetyPermit} highRisk={r.highRiskWork} /></TableCell>
                      <TableCell>
                        <span className="text-xs font-semibold" style={{ color: RISK_COLORS[r.riskLevel || ''] || '#94a3b8' }}>{r.riskLevel || '-'}</span>
                      </TableCell>
                      <TableCell><RegBadge value={r.tbmResult} onClick={r.tbmResult === '미등록' && !isCancelled(r.workStatus) ? () => openTbmUnregNote(r) : undefined} hasNote={r.tbmResult === '미등록' && !!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} /></TableCell>
                      <TableCell><StatusBadge value={r.tbmAiResult} onClick={r.tbmAiResult === '부적합' ? () => openTbmNote(r) : undefined} hasNote={r.tbmAiResult === '부적합' && !!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} /></TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.workStatus || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">{r.startDate || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap hidden lg:table-cell">{r.endDate || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap hidden lg:table-cell">{r.dayNight || '-'}</TableCell>
                      <TableCell className="text-xs hidden lg:table-cell">{r.workLocation || '-'}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap hidden lg:table-cell">{r.supervisor || '-'}</TableCell>
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

      {/* 레코드 수정 다이얼로그 */}
      <Dialog open={!!editingRecord} onOpenChange={open => { if (!open) setEditingRecord(null); }}>
        <DialogContent className="w-[95vw] max-w-xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Pencil className="w-4 h-4 text-blue-600" />
              레코드 수정 — {editingRecord?.workOrderNo || editingRecord?.workName || ''}
            </DialogTitle>
          </DialogHeader>
          {editingRecord && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">작업번호</Label>
                  <Input className="h-8 text-xs" value={editForm.workOrderNo ?? ''} onChange={e => setEditForm(f => ({ ...f, workOrderNo: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">팀명</Label>
                  <Input className="h-8 text-xs" value={editForm.team ?? ''} onChange={e => setEditForm(f => ({ ...f, team: e.target.value }))} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">작업명</Label>
                  <Input className="h-8 text-xs" value={editForm.workName ?? ''} onChange={e => setEditForm(f => ({ ...f, workName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">협력사</Label>
                  <Input className="h-8 text-xs" value={editForm.vendorName ?? ''} onChange={e => setEditForm(f => ({ ...f, vendorName: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">작업장소</Label>
                  <Input className="h-8 text-xs" value={editForm.workLocation ?? ''} onChange={e => setEditForm(f => ({ ...f, workLocation: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">책임자</Label>
                  <Input className="h-8 text-xs" value={editForm.supervisor ?? ''} onChange={e => setEditForm(f => ({ ...f, supervisor: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">센터</Label>
                  <Input className="h-8 text-xs" value={editForm.center ?? ''} onChange={e => setEditForm(f => ({ ...f, center: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">작업상태</Label>
                  <Select value={editForm.workStatus ?? ''} onValueChange={v => setEditForm(f => ({ ...f, workStatus: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['예정','진행중','완료','취소'].map(v => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">안전허가서</Label>
                  <Select value={editForm.safetyPermit ?? ''} onValueChange={v => setEditForm(f => ({ ...f, safetyPermit: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['Y','N','미등록'].map(v => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">위험도</Label>
                  <Select value={editForm.riskLevel ?? ''} onValueChange={v => setEditForm(f => ({ ...f, riskLevel: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['상','중','하'].map(v => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">TBM 등록</Label>
                  <Select value={editForm.tbmResult ?? ''} onValueChange={v => setEditForm(f => ({ ...f, tbmResult: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['등록','미등록'].map(v => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">위험성평가</Label>
                  <Select value={editForm.riskAssessment ?? ''} onValueChange={v => setEditForm(f => ({ ...f, riskAssessment: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['등록','미등록'].map(v => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">공사유형</Label>
                  <Select value={editForm.workType ?? ''} onValueChange={v => setEditForm(f => ({ ...f, workType: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['직영','도급'].map(v => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">시작일</Label>
                  <Input type="date" className="h-8 text-xs" value={editForm.startDate ?? ''} onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">종료일</Label>
                  <Input type="date" className="h-8 text-xs" value={editForm.endDate ?? ''} onChange={e => setEditForm(f => ({ ...f, endDate: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">주/야간</Label>
                  <Select value={editForm.dayNight ?? ''} onValueChange={v => setEditForm(f => ({ ...f, dayNight: v }))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {['주간','야간'].map(v => <SelectItem key={v} value={v} className="text-xs">{v}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" size="sm" onClick={() => setEditingRecord(null)}>취소</Button>
                <Button size="sm" disabled={updateMutation.isPending}
                  onClick={() => updateMutation.mutate({ id: editingRecord.id, data: editForm })}>
                  {updateMutation.isPending ? <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />저장 중...</> : <><Save className="w-3.5 h-3.5 mr-1" />저장</>}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Issue detail dialog */}
      <Dialog open={!!activeIssue} onOpenChange={() => setActiveIssue(null)}>
        <DialogContent className="w-[min(95vw,960px)] max-w-none max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              {activeIssue?.label}
            </DialogTitle>
          </DialogHeader>
          {activeIssue && (() => {
            const sortByDate = (arr: AisSafetyRecord[]) =>
              [...arr].sort((a, b) => (b.startDate ?? '').localeCompare(a.startDate ?? ''));
            const list = sortByDate(activeIssue.list.filter(r => !isCancelled(r)));
            const noPermit = sortByDate(list.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y'));
            const tbmUnreg = sortByDate(list.filter(r => r.tbmResult === '미등록'));
            const tbmBad = sortByDate(list.filter(r => r.tbmAiResult === '부적합'));
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
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="text-xs w-[130px]">작업번호</TableHead>
                          <TableHead className="text-xs">작업명</TableHead>
                          <TableHead className="text-xs w-[100px] whitespace-nowrap">팀</TableHead>
                          <TableHead className="text-xs w-[80px] whitespace-nowrap">고위험유형</TableHead>
                          <TableHead className="text-xs w-[80px] whitespace-nowrap">안전허가서</TableHead>
                          <TableHead className="text-xs w-[70px] whitespace-nowrap">TBM</TableHead>
                          <TableHead className="text-xs w-[80px] whitespace-nowrap">TBM AI</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {g.records.map(r => (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs font-mono py-2"><span className="block truncate" title={r.workOrderNo || ''}>{r.workOrderNo || '-'}</span></TableCell>
                            <TableCell className="text-xs py-2"><span className="block" title={r.workName || ''}>{r.workName || '-'}</span></TableCell>
                            <TableCell className="text-xs whitespace-nowrap py-2">{r.team || '-'}</TableCell>
                            <TableCell className="py-2"><HighRiskBadge value={r.highRiskWork} /></TableCell>
                            <TableCell className="py-2"><PermitBadge value={r.safetyPermit} highRisk={r.highRiskWork} /></TableCell>
                            <TableCell className="py-2 whitespace-nowrap"><RegBadge value={r.tbmResult} onClick={r.tbmResult === '미등록' && !isCancelled(r.workStatus) ? () => openTbmUnregNote(r) : undefined} hasNote={r.tbmResult === '미등록' && !!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} /></TableCell>
                            <TableCell className="py-2"><StatusBadge value={r.tbmAiResult} onClick={r.tbmAiResult === '부적합' ? () => openTbmNote(r) : undefined} hasNote={r.tbmAiResult === '부적합' && !!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} /></TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
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
