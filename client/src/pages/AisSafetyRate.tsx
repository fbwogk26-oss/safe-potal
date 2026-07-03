import { useState, useRef, useMemo, useEffect } from "react";
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
  ImageIcon, Save, FileEdit, Pencil, Mail, Send, RotateCcw, FileSpreadsheet,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
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

function calcCompliance(records: AisSafetyRecord[], justifiedIds: Set<number> = new Set()) {
  const active = records.filter(r => !isCancelled(r));
  if (!active.length) return { rate: 0, issues: [], highRiskNoPermit: [], tbmUnreg: [], tbmBad: [] };
  const highRiskNoPermit = active.filter(r => isHighRiskWork(r.highRiskWork) && r.safetyPermit !== 'Y' && !justifiedIds.has(r.id));
  // TBM 미등록: 취소된 작업은 반드시 제외 (workStatus null 등 예외 상황 대비 이중 확인)
  const tbmUnreg = active.filter(r =>
    r.tbmResult === '미등록' && !(r.workStatus ?? '').includes('취소') && !justifiedIds.has(r.id)
  );
  const tbmBad = active.filter(r => r.tbmAiResult === '부적합' && !justifiedIds.has(r.id));
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

function StatusBadge({ value, onClick, hasNote, justificationStatus }: { value: string | null; onClick?: () => void; hasNote?: boolean; justificationStatus?: string | null }) {
  const v = value || '';
  if (v === '적합') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />적합</Badge>;
  if (v === '부적합') {
    if (justificationStatus === '소명완료') return (
      <Badge
        className={`bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold gap-1 ${onClick ? 'cursor-pointer hover:bg-emerald-200 dark:hover:bg-emerald-900/60' : ''}`}
        onClick={onClick}
        title="소명완료 — 클릭하여 수정"
      >
        <CheckCircle2 className="w-3 h-3" />소명완료
      </Badge>
    );
    if (justificationStatus === '소명불가') return (
      <Badge
        className={`bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700 text-xs font-semibold gap-1 ${onClick ? 'cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/60' : ''}`}
        onClick={onClick}
        title="소명불가 — 클릭하여 수정"
      >
        <XCircle className="w-3 h-3" />부적합
      </Badge>
    );
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
  if (v === '분석중' || v === '분석중' || v === '분석중') return <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border-0 text-xs font-semibold"><Loader2 className="w-3 h-3 mr-1 animate-spin" />분석중</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs"><Clock className="w-3 h-3 mr-1" />분석전</Badge>;
}

function PermitBadge({ value, highRisk }: { value: string | null; highRisk: string | null }) {
  const hr = isHighRiskWork(highRisk);
  if (value === 'Y') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />등록</Badge>;
  if (hr) return <Badge className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border-0 text-xs font-semibold"><AlertTriangle className="w-3 h-3 mr-1" />미등록</Badge>;
  return <Badge className="bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-0 text-xs">해당없음</Badge>;
}

function RegBadge({ value, onClick, hasNote, justificationStatus }: { value: string | null; onClick?: () => void; hasNote?: boolean; justificationStatus?: string | null }) {
  if (value === '등록') return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border-0 text-xs font-semibold"><CheckCircle2 className="w-3 h-3 mr-1" />등록</Badge>;
  if (justificationStatus === '소명완료') return (
    <Badge
      className={`bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-700 text-xs font-semibold gap-1 ${onClick ? 'cursor-pointer hover:bg-emerald-200 dark:hover:bg-emerald-900/60 transition-colors' : ''}`}
      onClick={onClick}
      title="소명완료 — 클릭하여 수정"
    >
      <CheckCircle2 className="w-3 h-3" />소명완료
    </Badge>
  );
  if (justificationStatus === '소명불가') return (
    <Badge
      className={`bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 border border-red-300 dark:border-red-700 text-xs font-semibold gap-1 ${onClick ? 'cursor-pointer hover:bg-red-200 dark:hover:bg-red-900/60 transition-colors' : ''}`}
      onClick={onClick}
      title="소명불가 — 클릭하여 수정"
    >
      <XCircle className="w-3 h-3" />미등록
    </Badge>
  );
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

function CircleGauge({ rate, total, pass: passCount, size = 'lg' }: { rate: number; total?: number; pass?: number; size?: 'lg' | 'sm' | 'xs' }) {
  const r = 50, circ = 2 * Math.PI * r, dash = (rate / 100) * circ;
  const color = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
  const label = rate >= 90 ? '우수' : rate >= 70 ? '양호' : '주의';
  const gid = `cg-grad-${rate}-${size}`;
  const wh = size === 'xs' ? 'w-16 h-16' : size === 'sm' ? 'w-24 h-24' : 'w-44 h-44';
  const numSz = size === 'xs' ? 'text-xl' : size === 'sm' ? 'text-3xl' : 'text-5xl';
  const pctSz = size === 'xs' ? 'text-[9px]' : size === 'sm' ? 'text-xs' : 'text-base';
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
function TeamBreakdown({ records, title, onIssueClick, justifiedIds = new Set() }: {
  records: AisSafetyRecord[];
  title: string;
  onIssueClick?: (label: string, list: AisSafetyRecord[]) => void;
  justifiedIds?: Set<number>;
}) {
  const teams = [...new Set(records.map(r => r.team).filter(Boolean))] as string[];
  if (teams.length === 0) return null;
  const teamStats = teams.map(team => {
    const tr = records.filter(r => r.team === team);
    const c = calcCompliance(tr, justifiedIds);
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

const TBM_BAD_REASON_PRESETS = [
  '보호구 착용 사진 누락(활선경보기)',
  '보호구 착용 사진 누락(검전기 사용)',
  '보호구 착용 사진 누락(양팔을 펴고)',
  '보호구 미착용(안전화)',
  '보호구 미착용(안전대)',
  '보호구 미착용(안전모)',
  '사다리 아웃트리거 미사용',
  '안전화 착용 했으나 AI 분석 결과 오류',
  '안전대 착용 했으나 AI 분석 결과 오류',
  '안전모 착용 했으나 AI 분석 결과 오류',
  '사진촬영 불가국소',
  '작업 안전대 미착용(사내지침상 안전대 착용대상 아님)',
  '작업인원 불일치',
  'AIS 시스템 오류',
];

const TBM_UNREG_REASON_PRESETS = [
  '작업전 TBM 미실시',
  '시스템 오류로 미등록',
  '작업취소',
  '단순누락',
];

const CUSTOM_REASON_VALUE = '__custom__';

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
  const [tbmNoteReasonPreset, setTbmNoteReasonPreset] = useState<string>(CUSTOM_REASON_VALUE);
  const [tbmNoteExistingPhotos, setTbmNoteExistingPhotos] = useState<{ url: string; name: string }[]>([]);
  const [tbmNoteNewPhotos, setTbmNoteNewPhotos] = useState<File[]>([]);
  const [tbmNoteNewPreviews, setTbmNoteNewPreviews] = useState<string[]>([]);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [showInboxDialog, setShowInboxDialog] = useState(false);
  const [recipientsInput, setRecipientsInput] = useState('');
  const [recipientsInitialized, setRecipientsInitialized] = useState(false);
  const [tbmNoteSaving, setTbmNoteSaving] = useState(false);
  const [justifStatus, setJustifStatus] = useState<'소명완료'|'소명불가'|null>(null);
  const [justifReverting, setJustifReverting] = useState(false);
  const [justifyQueue, setJustifyQueue] = useState<number[]>([]);
  const processedInboxRunRef = useRef<string | null>(null);

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

  const { data: emailStatus } = useQuery<{
    lastRun: string | null; lastResult: string | null; lastMessage: string | null;
    lastSentTo: string | null; lastRecordCount: number | null; nextRun: string; running: boolean;
    recipients: string;
  }>({
    queryKey: ['/api/ais-daily-email/status'],
    enabled: showEmailDialog,
    refetchInterval: showEmailDialog ? 5000 : false,
  });

  useEffect(() => {
    if (emailStatus && !recipientsInitialized) {
      setRecipientsInput(emailStatus.recipients || '');
      setRecipientsInitialized(true);
    }
  }, [emailStatus, recipientsInitialized]);

  useEffect(() => {
    if (!showEmailDialog) setRecipientsInitialized(false);
  }, [showEmailDialog]);

  const { data: emailPreview, isLoading: emailPreviewLoading } = useQuery<{ subject: string; html: string }>({
    queryKey: ['/api/ais-daily-email/preview'],
    enabled: showEmailDialog,
  });

  const testSendMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/ais-daily-email/test-send', {});
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: '발송 완료', description: data.status?.lastMessage || '테스트 메일을 발송했습니다.' });
      queryClient.invalidateQueries({ queryKey: ['/api/ais-daily-email/status'] });
    },
    onError: (e: any) => {
      toast({ title: '발송 실패', description: e.message, variant: 'destructive' });
    },
  });

  const saveRecipientsMutation = useMutation({
    mutationFn: async (recipients: string) => {
      const res = await apiRequest('PUT', '/api/ais-daily-email/recipients', { recipients });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: '저장 완료', description: '수신 이메일이 저장되었습니다.' });
      setRecipientsInput(data.recipients || '');
      queryClient.invalidateQueries({ queryKey: ['/api/ais-daily-email/status'] });
    },
    onError: (e: any) => {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    },
  });

  const { data: inboxStatus } = useQuery<{
    lastRun: string | null; lastResult: string | null; lastMessage: string | null;
    lastMatchedCount: number | null; lastScannedCount: number | null;
    lastMatchedRecordIds?: number[]; running: boolean;
  }>({
    queryKey: ['/api/ais-inbox-email/status'],
    enabled: showInboxDialog,
    refetchInterval: showInboxDialog ? 3000 : false,
  });

  const runInboxNowMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/ais-inbox-email/run-now', {});
      return res.json();
    },
    onSuccess: () => {
      toast({ title: '확인 시작됨', description: '메일함을 확인하는 중입니다. 잠시 후 결과가 갱신됩니다.' });
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['/api/ais-inbox-email/status'] }), 3000);
    },
    onError: (e: any) => {
      toast({ title: '실행 실패', description: e.message, variant: 'destructive' });
    },
  });

  // 소명 메일 자동접수 실행 완료 시, 새로 매칭된 건에 대해 소명가능/불가능 선택 팝업을 하나씩 띄운다
  useEffect(() => {
    if (!inboxStatus || inboxStatus.running || !inboxStatus.lastRun) return;
    if (processedInboxRunRef.current === inboxStatus.lastRun) return;
    const ids = inboxStatus.lastMatchedRecordIds || [];
    processedInboxRunRef.current = inboxStatus.lastRun;
    if (ids.length === 0) return;
    (async () => {
      await queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/tbm-notes'] });
      await queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/records/all'] });
      const freshRecords = queryClient.getQueryData<AisSafetyRecord[]>(['/api/ais-safety/records/all']) || allRecords;
      const freshNotes = queryClient.getQueryData<AisTbmBadNote[]>(['/api/ais-safety/tbm-notes']) || allTbmNotes;
      const noteByWorkOrder: Record<string, AisTbmBadNote> = {};
      freshNotes.forEach(n => {
        const rec = freshRecords.find(r => r.id === n.recordId);
        if (rec?.workOrderNo) noteByWorkOrder[rec.workOrderNo] = n;
      });
      const noteByRecordId = Object.fromEntries(freshNotes.map(n => [n.recordId, n]));
      const seen = new Set<string>();
      const queue: number[] = [];
      for (const id of ids) {
        const rec = freshRecords.find(r => r.id === id);
        if (!rec) continue;
        const key = rec.workOrderNo || `id:${id}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const note = rec.workOrderNo ? noteByWorkOrder[rec.workOrderNo] : noteByRecordId[id];
        if (note?.justificationStatus) continue;
        queue.push(id);
      }
      if (queue.length > 0) {
        setJustifyQueue(queue);
        setShowInboxDialog(false);
      }
    })();
  }, [inboxStatus?.lastRun, inboxStatus?.running]);

  // 소명 메일 자동접수 대기열: 사용자가 다이얼로그를 닫거나 저장을 완료하면 다음 건을 자동으로 연다
  useEffect(() => {
    if (justifyQueue.length === 0 || tbmNoteRecord) return;
    const nextId = justifyQueue[0];
    const rec = allRecords.find(r => r.id === nextId);
    if (!rec) { setJustifyQueue(q => q.slice(1)); return; }
    openTbmNote(rec);
  }, [justifyQueue, tbmNoteRecord, allRecords]);

  const closeTbmNoteDialog = () => {
    setJustifyQueue(q => (tbmNoteRecord && q.length > 0 && q[0] === tbmNoteRecord.id) ? q.slice(1) : q);
    setTbmNoteRecord(null);
  };

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

  // 소명 완료된 레코드 ID Set (같은 workOrderNo 레코드도 포함)
  const justifiedRecordIds = useMemo(() => {
    const ids = new Set<number>();
    allTbmNotes.forEach(n => {
      if (n.justificationStatus === '소명완료') {
        ids.add(n.recordId);
        const rec = allRecords.find(r => r.id === n.recordId);
        if (rec?.workOrderNo) {
          allRecords.filter(r => r.workOrderNo === rec.workOrderNo).forEach(r => ids.add(r.id));
        }
      }
    });
    return ids;
  }, [allTbmNotes, allRecords]);

  const dailyGroups = useMemo(() => {
    const groups: Record<string, AisSafetyRecord[]> = {};
    for (const r of allRecords) {
      if (!r.startDate) continue;
      if (!groups[r.startDate]) groups[r.startDate] = [];
      groups[r.startDate].push(r);
    }
    return Object.entries(groups)
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([date, recs]) => ({ date, records: recs, ...calcCompliance(recs.filter(r => r.workStatus !== '취소'), justifiedRecordIds) }));
  }, [allRecords, justifiedRecordIds]);

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
      .map(([month, recs]) => ({ month, records: recs, ...calcCompliance(recs.filter(r => r.workStatus !== '취소'), justifiedRecordIds) }));
  }, [allRecords, justifiedRecordIds]);

  const loadExistingPhotos = (existing: AisTbmBadNote | undefined | null) => {
    const urls = existing?.photoUrls && existing.photoUrls.length > 0 ? existing.photoUrls : (existing?.photoUrl ? [existing.photoUrl] : []);
    const names = existing?.photoFileNames && existing.photoFileNames.length > 0 ? existing.photoFileNames : (existing?.photoFileName ? [existing.photoFileName] : []);
    setTbmNoteExistingPhotos(urls.map((url, i) => ({ url, name: names[i] || '' })));
    setTbmNoteNewPhotos([]);
    setTbmNoteNewPreviews([]);
  };

  const openTbmNote = (r: AisSafetyRecord) => {
    setTbmNoteType('bad');
    setTbmNoteRecord(r);
    const existing = (r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : null) ?? tbmNoteMap[r.id];
    const reason = existing?.reason || '';
    setTbmNoteReason(reason);
    setTbmNoteReasonPreset(reason && TBM_BAD_REASON_PRESETS.includes(reason) ? reason : CUSTOM_REASON_VALUE);
    loadExistingPhotos(existing);
    setJustifStatus((existing?.justificationStatus as '소명완료'|'소명불가'|null) ?? null);
  };
  const openTbmUnregNote = (r: AisSafetyRecord) => {
    setTbmNoteType('unreg');
    setTbmNoteRecord(r);
    const existing = (r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : null) ?? tbmNoteMap[r.id];
    const reason = existing?.reason || '';
    setTbmNoteReason(reason);
    setTbmNoteReasonPreset(reason && TBM_UNREG_REASON_PRESETS.includes(reason) ? reason : CUSTOM_REASON_VALUE);
    loadExistingPhotos(existing);
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

  const comp = calcCompliance(activeRecords, justifiedRecordIds);
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

  // TBM AI 분석결과 — 소명완료 건은 부적합에서 분리해 별도 집계
  const justifiedBadCount = activeRecords.filter(r => r.tbmAiResult === '부적합' && justifiedRecordIds.has(r.id)).length;
  const tbmAiData = [
    { name: '적합', value: activeRecords.filter(r => r.tbmAiResult === '적합').length, color: '#22c55e' },
    { name: '소명완료', value: justifiedBadCount, color: '#10b981' },
    { name: '부적합', value: activeRecords.filter(r => r.tbmAiResult === '부적합' && !justifiedRecordIds.has(r.id)).length, color: '#ef4444' },
    { name: '분석중', value: activeRecords.filter(r => r.tbmAiResult === '분석중').length, color: '#f59e0b' },
    { name: '분석전', value: activeRecords.filter(r => !r.tbmAiResult || r.tbmAiResult === '분석전').length, color: '#94a3b8' },
  ].filter(d => d.value > 0);

  const teamData = teams.map(team => {
    const tr = activeRecords.filter(r => r.team === team);
    const c = calcCompliance(tr, justifiedRecordIds);
    const issueCount = (c.issues || []).reduce((s, i) => s + i.list.length, 0);
    const issueList = (c.issues || []).flatMap(i => i.list);
    // 취소 건 제외
    const nonCancelled = tr.filter(r => !isCancelled(r));
    // TBM 등록 이행률 (미등록 중 소명완료 건도 등록으로 포함)
    const tbmRegRate = nonCancelled.length > 0
      ? Math.round((nonCancelled.filter(r => r.tbmResult === '등록' || (r.tbmResult === '미등록' && justifiedRecordIds.has(r.id))).length / nonCancelled.length) * 100)
      : 100;
    // TBM AI 적합 이행률: 전체 건 기준, 소명완료(미등록/부적합 무관) 모두 적합으로 포함
    const tbmAiRate = nonCancelled.length > 0
      ? Math.round((nonCancelled.filter(r => r.tbmAiResult === '적합' || (r.tbmAiResult === '부적합' && justifiedRecordIds.has(r.id))).length / nonCancelled.length) * 100)
      : 100;
    // AI 적합 세부 분해: 적합 / 소명완료 / 분석전(대기) / 부적합
    const aiPass = nonCancelled.filter(r => r.tbmAiResult === '적합').length;
    const aiJustified = nonCancelled.filter(r => r.tbmAiResult === '부적합' && justifiedRecordIds.has(r.id)).length;
    const aiPending = nonCancelled.filter(r => !r.tbmAiResult || r.tbmAiResult === '분석전' || r.tbmAiResult === '분석중').length;
    const aiFail = nonCancelled.filter(r => r.tbmAiResult === '부적합' && !justifiedRecordIds.has(r.id)).length;
    return { team: team?.replace('운용팀', '').replace('팀', '') || '미지정', fullTeam: team || '', rate: c.rate, count: tr.length, issueCount, issueList, tbmRegRate, tbmAiRate, aiTotal: nonCancelled.length, aiPass, aiJustified, aiPending, aiFail };
  }).sort((a, b) => b.rate - a.rate);

  const complianceItems = [
    { label: '안전허가서 매칭', icon: ShieldCheck, total: highRiskRecords.length, pass: highRiskRecords.filter(r => r.safetyPermit === 'Y').length, description: '고위험작업 시 안전허가서 등록', emptyLabel: '고위험작업 없음' },
    { label: 'TBM 등록률', icon: Users, total: activeRecords.filter(r => !isCancelled(r)).length, pass: activeRecords.filter(r => !isCancelled(r) && (r.tbmResult === '등록' || (r.tbmResult === '미등록' && justifiedRecordIds.has(r.id)))).length, description: 'TBM 활동 등록 여부 (소명완료 포함)', emptyLabel: '데이터 없음' },
  ];

  // TBM 종합 이행률 (등록 AND AI적합 모두 충족)
  const tbmBase = activeRecords.filter(r => !isCancelled(r));
  const tbmFullRate = tbmBase.length > 0
    ? Math.round(tbmBase.filter(r =>
        (r.tbmResult === '등록' || justifiedRecordIds.has(r.id)) &&
        (r.tbmAiResult === '적합' || justifiedRecordIds.has(r.id))
      ).length / tbmBase.length * 100)
    : 100;
  const tbmOverallAiRate = tbmBase.length > 0
    ? Math.round(tbmBase.filter(r => r.tbmAiResult === '적합' || (r.tbmAiResult === '부적합' && justifiedRecordIds.has(r.id))).length / tbmBase.length * 100)
    : 100;

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
      formData.append('existingPhotoUrls', JSON.stringify(tbmNoteExistingPhotos.map(p => p.url)));
      formData.append('existingPhotoFileNames', JSON.stringify(tbmNoteExistingPhotos.map(p => p.name)));
      tbmNoteNewPhotos.forEach(file => formData.append('photos', file));
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
      // 소명 상태 저장
      if (justifStatus !== null) {
        await fetch(`/api/ais-safety/records/${tbmNoteRecord.id}/justification`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ justificationStatus: justifStatus, justificationReason: null }),
        });
      }
      await queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/tbm-notes'] });
      const linkedCount = tbmNoteRecord.workOrderNo
        ? allRecords.filter(r => r.id !== tbmNoteRecord.id && r.workOrderNo === tbmNoteRecord.workOrderNo && (tbmNoteType === 'bad' ? r.tbmAiResult === '부적합' : r.tbmResult === '미등록')).length
        : 0;
      toast({
        title: tbmNoteType === 'unreg' ? 'TBM 미등록 사유가 저장되었습니다 ✎' : 'TBM AI 부적합 사유가 저장되었습니다 ✎',
        description: linkedCount > 0 ? `동일 작업번호 ${linkedCount}건에도 연동 저장됨` : (tbmNoteReason ? `사유: ${tbmNoteReason.slice(0, 40)}${tbmNoteReason.length > 40 ? '...' : ''}` : undefined),
      });
      closeTbmNoteDialog();
    } catch {
      toast({ title: '저장에 실패했습니다', variant: 'destructive' });
    } finally {
      setTbmNoteSaving(false);
    }
  };

  const handleRevertJustification = async () => {
    if (!tbmNoteRecord) return;
    setJustifReverting(true);
    try {
      const targets = [tbmNoteRecord.id];
      if (tbmNoteRecord.workOrderNo) {
        allRecords.forEach(r => {
          if (r.id !== tbmNoteRecord.id && r.workOrderNo === tbmNoteRecord.workOrderNo) {
            targets.push(r.id);
          }
        });
      }
      await Promise.all(targets.map(id =>
        fetch(`/api/ais-safety/records/${id}/tbm-note`, {
          method: 'DELETE',
          credentials: 'include',
        })
      ));
      setJustifStatus(null);
      setTbmNoteReason('');
      setTbmNoteReasonPreset('');
      setTbmNoteExistingPhotos([]);
      setTbmNoteNewPhotos([]);
      setTbmNoteNewPreviews([]);
      await queryClient.invalidateQueries({ queryKey: ['/api/ais-safety/tbm-notes'] });
      toast({ title: '부적합 상태로 초기화했습니다', description: targets.length > 1 ? `동일 작업번호 ${targets.length}건 반영` : undefined });
      closeTbmNoteDialog();
    } catch {
      toast({ title: '되돌리기에 실패했습니다', variant: 'destructive' });
    } finally {
      setJustifReverting(false);
    }
  };


  return (
    <div className="space-y-6 pb-10">
      {/* TBM 부적합 사유 다이얼로그 */}
      <Dialog open={!!tbmNoteRecord} onOpenChange={open => { if (!open) closeTbmNoteDialog(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600"><XCircle className="w-4 h-4" />{tbmNoteType === 'unreg' ? 'TBM 미등록 사유/사진 기록' : 'TBM AI 부적합 사유 기록'}</DialogTitle>
          </DialogHeader>
          {tbmNoteRecord && (
            <div className="space-y-4">
              {justifyQueue.length > 0 && justifyQueue[0] === tbmNoteRecord.id && (
                <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 px-3 py-2 text-xs flex items-center gap-1.5 text-blue-700 dark:text-blue-400">
                  <Mail className="w-3.5 h-3.5 flex-shrink-0" />
                  메일함에서 사진이 자동 접수되었습니다. 확인 후 사유/소명을 입력해주세요. (남은 {justifyQueue.length}건)
                </div>
              )}
              <div className="rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-100 dark:border-red-900/30 p-3 text-xs space-y-1">
                <p className="font-semibold text-sm text-foreground">{tbmNoteRecord.workName || '-'}</p>
                <p className="text-muted-foreground">{tbmNoteRecord.workOrderNo} · {tbmNoteRecord.team} · {tbmNoteRecord.startDate}</p>
              </div>
              {/* 기존 사유/사진 기록 미리보기 */}
              {(tbmNoteRecord.workOrderNo ? tbmNoteByWorkOrder[tbmNoteRecord.workOrderNo] : tbmNoteMap[tbmNoteRecord.id]) && (
                <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 p-3 text-xs space-y-2">
                  <p className="flex items-center gap-1 font-bold text-amber-700 dark:text-amber-400"><FileEdit className="w-3.5 h-3.5" />기존 사유/사진 기록됨</p>
                  {(() => {
                    const en = tbmNoteRecord.workOrderNo ? tbmNoteByWorkOrder[tbmNoteRecord.workOrderNo] : tbmNoteMap[tbmNoteRecord.id];
                    const photos = en?.photoUrls && en.photoUrls.length > 0 ? en.photoUrls : (en?.photoUrl ? [en.photoUrl] : []);
                    return (
                      <>
                        {en?.reason && <p className="text-muted-foreground whitespace-pre-line">{en.reason}</p>}
                        {photos.length > 0 && (
                          <div className="flex gap-1.5 flex-wrap">
                            {photos.map((url, i) => (
                              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                                <img src={url} alt={`부적합 사진 ${i + 1}`} className="w-14 h-14 object-cover rounded border border-amber-300 dark:border-amber-700" />
                              </a>
                            ))}
                          </div>
                        )}
                        <p className="text-muted-foreground/60">수정하려면 아래에서 다시 작성 후 저장</p>
                      </>
                    );
                  })()}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-sm font-medium">{tbmNoteType === 'unreg' ? '미등록 사유 사진' : '부적합 사진'} ({tbmNoteExistingPhotos.length + tbmNoteNewPhotos.length}/3)</Label>
                <div className="flex items-start gap-2 flex-wrap">
                  {tbmNoteExistingPhotos.map((p, i) => (
                    <div key={`existing-${i}`} className="relative">
                      <img src={p.url} alt={`부적합 사진 ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border" />
                      <button type="button" className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        onClick={() => setTbmNoteExistingPhotos(prev => prev.filter((_, idx) => idx !== i))}>×</button>
                    </div>
                  ))}
                  {tbmNoteNewPreviews.map((url, i) => (
                    <div key={`new-${i}`} className="relative">
                      <img src={url} alt={`새 사진 ${i + 1}`} className="w-24 h-24 object-cover rounded-lg border border-blue-300" />
                      <button type="button" className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs hover:bg-red-600"
                        onClick={() => {
                          setTbmNoteNewPhotos(prev => prev.filter((_, idx) => idx !== i));
                          setTbmNoteNewPreviews(prev => prev.filter((_, idx) => idx !== i));
                        }}>×</button>
                    </div>
                  ))}
                  {(tbmNoteExistingPhotos.length + tbmNoteNewPhotos.length) < 3 && (
                    <div className="w-24 h-24 border-2 border-dashed border-muted-foreground/30 rounded-lg flex flex-col items-center justify-center gap-1 cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
                      onClick={() => photoInputRef.current?.click()}>
                      <ImageIcon className="w-6 h-6 text-muted-foreground/50" />
                      <span className="text-xs text-muted-foreground">사진 추가</span>
                    </div>
                  )}
                  <input ref={photoInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => {
                    const files = Array.from(e.target.files || []);
                    if (files.length === 0) return;
                    const remaining = 3 - (tbmNoteExistingPhotos.length + tbmNoteNewPhotos.length);
                    const toAdd = files.slice(0, Math.max(0, remaining));
                    setTbmNoteNewPhotos(prev => [...prev, ...toAdd]);
                    setTbmNoteNewPreviews(prev => [...prev, ...toAdd.map(f => URL.createObjectURL(f))]);
                    e.target.value = '';
                  }} />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">{tbmNoteType === 'unreg' ? '미등록 사유' : '부적합 사유'}</Label>
                <Select
                  value={tbmNoteReasonPreset}
                  onValueChange={(v) => {
                    setTbmNoteReasonPreset(v);
                    if (v === CUSTOM_REASON_VALUE) {
                      setTbmNoteReason(prev => (TBM_BAD_REASON_PRESETS.includes(prev) || TBM_UNREG_REASON_PRESETS.includes(prev)) ? '' : prev);
                    } else {
                      setTbmNoteReason(v);
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-sm" data-testid="select-tbm-note-reason">
                    <SelectValue placeholder="사유 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {(tbmNoteType === 'unreg' ? TBM_UNREG_REASON_PRESETS : TBM_BAD_REASON_PRESETS).map(reason => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                    <SelectItem value={CUSTOM_REASON_VALUE}>직접입력</SelectItem>
                  </SelectContent>
                </Select>
                {tbmNoteReasonPreset === CUSTOM_REASON_VALUE && (
                  <Textarea
                    placeholder={tbmNoteType === 'unreg' ? 'TBM 미등록 사유를 작성해주세요. (예: 작업전 TBM 미실시, 시스템 오류로 미등록 등)' : 'TBM AI가 부적합으로 판정한 사유를 작성해주세요. (예: 보호구 미착용(안전모), 사다리 아웃트리거 미사용 등)'}
                    value={tbmNoteReason}
                    onChange={e => setTbmNoteReason(e.target.value)}
                    className="min-h-[100px] text-sm resize-none"
                    data-testid="textarea-tbm-note-reason-custom"
                  />
                )}
              </div>
              {/* 소명 */}
              <div className="space-y-1.5 pt-1 border-t border-border">
                <Label className="text-xs font-medium text-muted-foreground">소명</Label>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => setJustifStatus(justifStatus === '소명완료' ? null : '소명완료')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${justifStatus === '소명완료' ? 'bg-emerald-500 text-white border-emerald-500' : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-950/30'}`}
                  >✓ 소명 가능</button>
                  <button type="button"
                    onClick={() => setJustifStatus(justifStatus === '소명불가' ? null : '소명불가')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-all ${justifStatus === '소명불가' ? 'bg-red-500 text-white border-red-500' : 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-950/30'}`}
                  >✗ 소명 불가</button>
                </div>
                {(tbmNoteRecord.workOrderNo ? tbmNoteByWorkOrder[tbmNoteRecord.workOrderNo] : tbmNoteMap[tbmNoteRecord.id])?.justificationStatus && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full mt-1 text-muted-foreground hover:text-red-600 hover:border-red-300"
                    disabled={justifReverting}
                    onClick={handleRevertJustification}
                    data-testid="button-revert-justification"
                  >
                    {justifReverting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <RotateCcw className="w-3.5 h-3.5 mr-1" />}
                    부적합 상태로 되돌리기
                  </Button>
                )}
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={closeTbmNoteDialog}>취소</Button>
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
          <Button variant="outline" size="sm" onClick={() => setShowEmailDialog(true)} data-testid="button-open-email-report">
            <Mail className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">일일 보고 메일</span>
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInboxDialog(true)} data-testid="button-open-inbox-report">
            <Mail className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">소명 메일 자동접수</span>
          </Button>
          <input ref={fileInputRef} type="file" accept=".csv" className="hidden" onChange={handleUpload} data-testid="input-csv" />
          <Button onClick={() => fileInputRef.current?.click()} disabled={uploading} data-testid="button-upload-csv" className="bg-blue-600 hover:bg-blue-700 text-white">
            {uploading ? <><Loader2 className="w-4 h-4 sm:mr-2 animate-spin" /><span className="hidden sm:inline">업로드 중...</span></> : <><Upload className="w-4 h-4 sm:mr-2" /><span className="hidden sm:inline">CSV 업로드</span></>}
          </Button>
        </div>
      </div>

      <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-blue-600" />AIS 일일 보고 메일</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <p><span className="font-semibold">자동 발송:</span> 매일 09:30(KST)에 전일자 데이터를 자동 집계하여 지정된 수신자에게 발송합니다.</p>
              <p className="text-xs text-muted-foreground">메일 발송 시 종합/누적 데이터/부적합 내용/사진내역이 담긴 엑셀 파일이 자동으로 첨부됩니다.</p>
              {emailStatus && (
                <>
                  <p className="text-xs text-muted-foreground">
                    다음 발송 예정: {emailStatus.nextRun ? new Date(emailStatus.nextRun).toLocaleString('ko-KR') : '-'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    마지막 실행: {emailStatus.lastRun ? new Date(emailStatus.lastRun).toLocaleString('ko-KR') : '없음'}
                    {emailStatus.lastResult && ` · 결과: ${emailStatus.lastResult}`}
                  </p>
                  {emailStatus.lastMessage && (
                    <p className="text-xs text-muted-foreground break-words">{emailStatus.lastMessage}</p>
                  )}
                </>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ais-email-recipients" className="text-xs font-semibold text-muted-foreground">
                수신 이메일 (쉼표로 구분하여 여러 명 입력 가능)
              </Label>
              <div className="flex gap-2">
                <input
                  id="ais-email-recipients"
                  type="text"
                  className="flex-1 h-9 rounded-md border border-input bg-background px-3 text-sm"
                  placeholder="example@company.com, example2@company.com"
                  value={recipientsInput}
                  onChange={(e) => setRecipientsInput(e.target.value)}
                  data-testid="input-email-recipients"
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saveRecipientsMutation.isPending || !recipientsInput.trim()}
                  onClick={() => saveRecipientsMutation.mutate(recipientsInput)}
                  data-testid="button-save-recipients"
                >
                  {saveRecipientsMutation.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                  저장
                </Button>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open('/api/ais-daily-email/export-excel', '_blank')}
                data-testid="button-download-excel-report"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                엑셀 리포트 다운로드
              </Button>
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={testSendMutation.isPending}
                onClick={() => testSendMutation.mutate()}
                data-testid="button-test-send-email"
              >
                {testSendMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                지금 테스트 발송
              </Button>
            </div>
            <div>
              <Label className="text-xs font-semibold text-muted-foreground">메일 미리보기</Label>
              <div className="mt-2 rounded-lg border bg-white dark:bg-slate-950 overflow-x-auto overflow-y-visible">
                {emailPreviewLoading ? (
                  <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                ) : emailPreview ? (
                  <div className="p-4">
                    <p className="text-sm font-semibold mb-3 pb-2 border-b">{emailPreview.subject}</p>
                    <div dangerouslySetInnerHTML={{ __html: emailPreview.html }} />
                  </div>
                ) : (
                  <p className="p-6 text-sm text-muted-foreground text-center">미리보기를 불러올 수 없습니다.</p>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showInboxDialog} onOpenChange={setShowInboxDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-blue-600" />TBM 부적합 소명 메일 자동접수</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm space-y-1">
              <p>10분마다 메일함을 확인하여, 제목이나 본문에 <span className="font-semibold">작업번호</span>가 적힌 메일에 사진이 첨부되어 있으면 해당 작업의 TBM 부적합 소명 사진으로 자동 등록합니다.</p>
              <p className="text-xs text-muted-foreground">사진만 자동 등록되며, 사유 입력과 소명완료 처리는 담당자가 화면에서 직접 확인 후 진행해야 합니다.</p>
            </div>
            {inboxStatus && (
              <div className="rounded-lg border p-3 text-xs space-y-1">
                <p>실행 상태: {inboxStatus.running ? '확인 중...' : '대기 중'}</p>
                <p className="text-muted-foreground">
                  마지막 확인: {inboxStatus.lastRun ? new Date(inboxStatus.lastRun).toLocaleString('ko-KR') : '없음'}
                  {inboxStatus.lastResult && ` · 결과: ${inboxStatus.lastResult}`}
                </p>
                {inboxStatus.lastMessage && (
                  <p className="text-muted-foreground break-words">{inboxStatus.lastMessage}</p>
                )}
              </div>
            )}
            <div className="flex justify-end">
              <Button
                size="sm"
                className="bg-blue-600 hover:bg-blue-700 text-white"
                disabled={runInboxNowMutation.isPending || inboxStatus?.running}
                onClick={() => runInboxNowMutation.mutate()}
                data-testid="button-run-inbox-now"
              >
                {(runInboxNowMutation.isPending || inboxStatus?.running) ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
                지금 메일함 확인
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
                <TeamBreakdown records={records} title={drilldownLabel} onIssueClick={(label, list) => setActiveIssue({ label, list })} justifiedIds={justifiedRecordIds} />
              )}

              {/* 통합 KPI 패널 */}
              <Card className="overflow-hidden border-0 shadow-md">
                <div className="flex flex-col lg:flex-row">
                  {/* 왼쪽: 안전허가서 매칭 도넛 그래프 */}
                  <div className="lg:w-52 flex-shrink-0 flex flex-row lg:flex-col items-center justify-center text-white"
                    style={{ background:'linear-gradient(160deg,#1d4ed8 0%,#2563eb 55%,#4f46e5 100%)', boxShadow:'inset -4px 0 16px rgba(0,0,0,0.15)' }}>
                    {/* 안전허가서 매칭 도넛 */}
                    <div className="flex flex-col items-center justify-center py-2 lg:py-4 px-3 lg:px-4 gap-1 lg:gap-2 flex-1">
                      <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">안전허가서 매칭</p>
                      {(() => {
                        const total = highRiskRecords.length;
                        const pass = highRiskRecords.filter(r => r.safetyPermit === 'Y').length;
                        const fail = total - pass;
                        const rate = total === 0 ? 100 : Math.round((pass / total) * 100);
                        const donutData = total === 0
                          ? [{ name: '데이터없음', value: 1, color: '#6366f1' }]
                          : [
                              { name: '매칭', value: pass, color: '#22c55e' },
                              { name: '미매칭', value: fail > 0 ? fail : 0, color: '#ef4444' },
                            ].filter(d => d.value > 0);
                        return (
                          <div className="flex flex-col items-center gap-2 w-full">
                            <div className="relative">
                              <PieChart width={140} height={140}>
                                <Pie data={donutData} cx={66} cy={66} innerRadius={40} outerRadius={62} paddingAngle={fail > 0 ? 2 : 0} dataKey="value">
                                  {donutData.map((entry, idx) => <Cell key={idx} fill={entry.color} opacity={0.9} />)}
                                </Pie>
                              </PieChart>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                <span className="text-3xl font-black text-white leading-none">{rate}</span>
                                <span className="text-xs text-white/70 font-bold">%</span>
                              </div>
                            </div>
                            <div className="flex gap-3 text-xs">
                              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />매칭 {pass}건</span>
                              {fail > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />미매칭 {fail}건</span>}
                            </div>
                            {total === 0 && <p className="text-xs text-blue-300/60">고위험작업 없음</p>}
                          </div>
                        );
                      })()}
                    </div>
                  </div>

                  {/* 오른쪽: KPI + Compliance 통합 */}
                  <div className="flex-1">
                    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_auto_1fr] divide-y lg:divide-y-0 lg:divide-x divide-border/60">
                      {/* 1열: 6대 고위험 + 안전허가서 매칭 */}
                      <div className="flex flex-col divide-y divide-border/60 h-full">
                      {/* 6대 고위험 */}
                      <div className="p-4 flex flex-col gap-2 flex-1 justify-center">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-md bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center flex-shrink-0">
                            <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                          </div>
                          <span className="text-sm font-semibold text-muted-foreground truncate">6대 고위험작업</span>
                        </div>
                        <p className="text-3xl font-black leading-none">{highRiskRecords.length}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                        <p className="text-sm text-muted-foreground">허가서 <span className="font-bold text-emerald-600">{highRiskRecords.filter(r => r.safetyPermit === 'Y').length}건</span></p>
                        {comp.highRiskNoPermit && comp.highRiskNoPermit.length > 0 && (
                          <p className="text-sm text-red-600 font-semibold">⚠ 미매칭 {comp.highRiskNoPermit.length}건</p>
                        )}
                        {highRiskBreakdown.length > 0 && (
                          <div className="flex flex-col gap-1 mt-0.5">
                            {highRiskBreakdown.filter(d => !d.isNone && d.total > 0).map(d => {
                              const rate = d.total === 0 ? 100 : Math.round((d.permit / d.total) * 100);
                              return (
                                <div key={d.type} className={`flex items-center justify-between px-2 py-1 rounded-md ${d.total === 0 ? 'opacity-40' : 'bg-orange-50/60 dark:bg-orange-950/20'}`}>
                                  <span className="text-xs font-semibold text-muted-foreground">{d.type}</span>
                                  <div className="flex items-center gap-1.5">
                                    <span className={`text-xs font-black ${d.total === 0 ? 'text-muted-foreground' : ''}`}>{d.total}</span>
                                    {d.total > 0 && <RateBadge value={rate} />}
                                    {d.noPermit > 0 && <span className="text-[11px] text-red-600 font-bold">미{d.noPermit}</span>}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {/* 안전허가서 매칭 정보 */}
                      {(() => {
                        const item = complianceItems[0];
                        const rate = item.total === 0 ? 100 : Math.round((item.pass / item.total) * 100);
                        const fail = item.total - item.pass;
                        const Icon = item.icon;
                        const barColor = rate >= 90 ? '#22c55e' : rate >= 70 ? '#f59e0b' : '#ef4444';
                        const hasIssue = item.total > 0 && rate < 90;
                        return (
                          <div key={item.label} className="p-4 flex flex-col flex-1 justify-center">
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${hasIssue ? 'bg-red-100 dark:bg-red-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                                  <Icon className={`w-4.5 h-4.5 ${hasIssue ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`} />
                                </div>
                                <span className="text-sm font-semibold text-muted-foreground">{item.label}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                {fail > 0 && <span className="text-xs font-bold text-red-500">미이행 {fail}건</span>}
                                {item.total > 0 && <RateBadge value={rate} />}
                              </div>
                            </div>
                            {item.total === 0 ? (
                              <p className="text-sm text-muted-foreground">{item.emptyLabel}</p>
                            ) : (
                              <>
                                <div className="flex items-baseline gap-2 mb-2">
                                  <span className="text-3xl font-black" style={{ color: barColor }}>{item.pass}</span>
                                  <span className="text-sm text-muted-foreground">/ {item.total}건</span>
                                  <span className="text-xs text-muted-foreground ml-auto">{item.description}</span>
                                </div>
                                <div className="w-full h-3.5 bg-muted/40 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full transition-all duration-700"
                                    style={{ width:`${rate}%`, background:`linear-gradient(90deg,${barColor}88,${barColor})`, boxShadow:`0 0 8px ${barColor}55` }} />
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })()}
                      </div>
                      {/* TBM 전체 이행률 */}
                      <div className="flex flex-col items-center justify-center py-4 px-4 text-white gap-2 lg:w-64 w-full self-stretch"
                        style={{ background:'linear-gradient(160deg,#1d4ed8 0%,#2563eb 55%,#4f46e5 100%)', boxShadow:'inset -4px 0 16px rgba(0,0,0,0.15)' }}>
                        <p className="text-xs font-bold text-blue-200 uppercase tracking-widest">TBM 이행률</p>
                        {(() => {
                          // 등록 AND AI적합을 모두 충족해야 순수 이행(purePass), 둘 중 하나라도 소명완료로 대체되면 소명
                          const purePass = tbmBase.filter(r => r.tbmResult === '등록' && r.tbmAiResult === '적합').length;
                          const justified = tbmBase.filter(r =>
                            !(r.tbmResult === '등록' && r.tbmAiResult === '적합') &&
                            (r.tbmResult === '등록' || justifiedRecordIds.has(r.id)) &&
                            (r.tbmAiResult === '적합' || justifiedRecordIds.has(r.id))
                          ).length;
                          // 등록은 됐지만 AI 분석이 아직 안 끝난 건 = 미이행이 아니라 분석전(대기)
                          const pending = tbmBase.filter(r =>
                            !(r.tbmResult === '등록' && r.tbmAiResult === '적합') &&
                            !((r.tbmResult === '등록' || justifiedRecordIds.has(r.id)) && (r.tbmAiResult === '적합' || justifiedRecordIds.has(r.id))) &&
                            r.tbmResult === '등록' &&
                            (!r.tbmAiResult || r.tbmAiResult === '분석전' || r.tbmAiResult === '분석중')
                          ).length;
                          const total = tbmBase.length;
                          const fail = Math.max(0, total - purePass - justified - pending);
                          const rate = total === 0 ? 100 : Math.round(((purePass + justified) / total) * 100);
                          const donutData = total === 0
                            ? [{ name: '데이터없음', value: 1, color: '#6366f1' }]
                            : [
                                { name: '이행', value: purePass, color: '#22c55e' },
                                { name: '소명완료', value: justified, color: '#f59e0b' },
                                { name: '분석전', value: pending, color: '#94a3b8' },
                                { name: '부적합', value: fail, color: '#ef4444' },
                              ].filter(d => d.value > 0);
                          return (
                            <div className="flex flex-col items-center gap-2 w-full">
                              <div className="relative">
                                <PieChart width={140} height={140}>
                                  <Pie data={donutData} cx={66} cy={66} innerRadius={40} outerRadius={62} paddingAngle={2} dataKey="value">
                                    {donutData.map((entry, idx) => <Cell key={idx} fill={entry.color} opacity={0.9} />)}
                                  </Pie>
                                </PieChart>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                  <span className="text-3xl font-black text-white leading-none">{rate}</span>
                                  <span className="text-xs text-white/70 font-bold">%</span>
                                </div>
                              </div>
                              <div className="flex flex-wrap justify-center gap-x-2.5 gap-y-1 text-xs">
                                {purePass > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400 inline-block" />이행 {purePass}건</span>}
                                {justified > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block" />소명 {justified}건</span>}
                                {pending > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-slate-400 inline-block" />분석전 {pending}건</span>}
                                {fail > 0 && <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-400 inline-block" />부적합 {fail}건</span>}
                              </div>
                              {total === 0 && <p className="text-xs text-blue-300/60">TBM 없음</p>}
                            </div>
                          );
                        })()}
                      </div>
                      {/* 3열: 이슈사항 + TBM 분석결과 */}
                      <div className="flex flex-col divide-y divide-border/60 h-full">
                      {/* 이슈사항 */}
                      <div className="p-4 flex flex-col gap-2 flex-1 justify-center">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-md bg-red-100 dark:bg-red-900/40 flex items-center justify-center flex-shrink-0">
                            <XCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
                          </div>
                          <span className="text-sm font-semibold text-muted-foreground truncate">이슈사항</span>
                        </div>
                        <p className="text-3xl font-black leading-none">{(comp.issues || []).reduce((a, b) => a + b.count, 0)}<span className="text-sm font-normal text-muted-foreground ml-1">건</span></p>
                        {(comp.issues || []).length > 0 ? (
                          <div className="flex flex-col gap-1.5 mt-0.5">
                            {(comp.issues || []).map(issue => (
                              <button key={issue.label} onClick={() => setActiveIssue(issue)}
                                className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-red-50/80 dark:bg-red-950/20 border border-red-200/50 dark:border-red-800/40 hover:border-red-400 dark:hover:border-red-600 transition-all group"
                                data-testid={`button-issue-top-${issue.label}`}>
                                <span className="text-xs font-semibold text-muted-foreground truncate">{issue.label}</span>
                                <span className="text-sm font-black text-red-600 dark:text-red-400 ml-1 flex-shrink-0">{issue.count}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">이슈 없음</p>
                        )}
                      </div>
                      {/* TBM AI 분석결과 */}
                      <div className="p-4 flex flex-col gap-3 flex-1 justify-center">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-md bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                            <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                          </div>
                          <span className="text-sm font-semibold text-muted-foreground">TBM AI 분석결과</span>
                        </div>
                        {(() => {
                          const total = tbmAiData.reduce((s, d) => s + d.value, 0);
                          const fit = tbmAiData.find(d => d.name === '적합')?.value ?? 0;
                          const bad = tbmAiData.find(d => d.name === '부적합')?.value ?? 0;
                          const analyzing = tbmAiData.find(d => d.name === '분석중')?.value ?? 0;
                          const pending = tbmAiData.find(d => d.name === '분석전')?.value ?? 0;
                          const justified = justifiedBadCount;
                          const items = [
                            { name: '적합', value: fit, color: '#22c55e' },
                            { name: '소명완료', value: justified, color: '#f59e0b' },
                            { name: '부적합', value: bad, color: '#ef4444' },
                            { name: '분석전', value: pending + analyzing, color: '#94a3b8' },
                          ].filter(d => d.value > 0);
                          return (
                            <div className="flex flex-col gap-2.5">
                              {/* 건수 */}
                              <p className="text-3xl font-black leading-none">{total}<span className="text-base font-normal text-muted-foreground ml-1">전체 건</span></p>
                              {/* 스택바 */}
                              <div className="w-full h-7 rounded-lg overflow-hidden flex shadow-inner">
                                {items.map(d => {
                                  const pct = total > 0 ? (d.value / total) * 100 : 0;
                                  return (
                                    <div key={d.name} style={{ width:`${pct}%`, backgroundColor:d.color, opacity:0.9 }}
                                      className="h-full relative flex items-center justify-center"
                                      title={`${d.name}: ${d.value}건`}>
                                      {pct > 12 && <span className="text-white text-xs font-black drop-shadow">{d.value}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                              {/* 범례 2열 */}
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                                {items.map(d => {
                                  const pct = total > 0 ? Math.round(d.value / total * 100) : 0;
                                  return (
                                    <div key={d.name} className="flex items-center gap-2">
                                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: d.color }} />
                                      <span className="text-xs text-muted-foreground truncate">{d.name}</span>
                                      <span className="text-xs font-bold ml-auto" style={{ color: d.color }}>{d.value}건</span>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>



              {/* Charts row */}
              {/* Charts row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
                <Card className="border-0 shadow-sm bg-card/60 lg:col-span-3">
                  <CardHeader className="pb-2 pt-3 px-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <CardTitle className="text-base font-bold flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-blue-500" />팀별 이행률
                      </CardTitle>
                      {teamData.length > 0 && (
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-emerald-500"></span>90%+</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-amber-500"></span>70~89%</span>
                          <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm inline-block bg-red-500"></span>~70%</span>
                          <span className="text-muted-foreground/60">· TBM등록 <span className="text-emerald-500 font-bold">■</span> AI적합 <span className="text-sky-500 font-bold">■</span></span>
                        </div>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0 px-4 pb-3">
                    {teamData.length > 0 ? (
                      <div className="grid grid-cols-1 gap-3">
                        {teamData.map((entry, i) => {
                          const regColor = entry.tbmRegRate >= 90
                            ? { grad: 'linear-gradient(90deg,#16a34a,#22c55e)', text: 'text-emerald-600 dark:text-emerald-400' }
                            : entry.tbmRegRate >= 70
                            ? { grad: 'linear-gradient(90deg,#d97706,#f59e0b)', text: 'text-amber-600 dark:text-amber-400' }
                            : { grad: 'linear-gradient(90deg,#dc2626,#ef4444)', text: 'text-red-600 dark:text-red-400' };
                          const aiColor = entry.tbmAiRate >= 90
                            ? { grad: 'linear-gradient(90deg,#0369a1,#0ea5e9)', text: 'text-sky-600 dark:text-sky-400' }
                            : entry.tbmAiRate >= 70
                            ? { grad: 'linear-gradient(90deg,#d97706,#f59e0b)', text: 'text-amber-600 dark:text-amber-400' }
                            : { grad: 'linear-gradient(90deg,#dc2626,#ef4444)', text: 'text-red-600 dark:text-red-400' };
                          return (
                            <div key={entry.team} className="rounded-lg border bg-card/90 hover:shadow-sm transition-all px-4 py-3">
                              {/* 상단: 순위 · 팀명 · 건수 · 이슈 */}
                              <div className="flex items-center gap-2.5 mb-2">
                                <span className={`text-base font-black w-6 text-center flex-shrink-0 ${i < 3 ? ['text-amber-500','text-slate-400','text-orange-400'][i] : 'text-muted-foreground/40'}`}>{i + 1}</span>
                                <span className="text-base font-bold flex-1 truncate" title={entry.fullTeam}>{entry.team}</span>
                                <span className="text-sm text-muted-foreground flex-shrink-0">{entry.count}건</span>
                                {entry.issueCount > 0 ? (
                                  <button
                                    onClick={() => setActiveIssue({ label: `${entry.fullTeam} 이슈 목록`, list: entry.issueList })}
                                    className="flex items-center gap-0.5 text-xs font-bold bg-red-100 dark:bg-red-950/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full hover:bg-red-200 transition-colors border border-red-200 dark:border-red-800 flex-shrink-0"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />{entry.issueCount}
                                  </button>
                                ) : (
                                  <span className="flex items-center gap-0.5 text-xs font-bold text-emerald-500 flex-shrink-0">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                  </span>
                                )}
                              </div>
                              {/* 등록/AI 바 — 각 그래프가 무엇을 의미하는지 라벨로 명시 */}
                              <div className="flex items-center gap-4">
                                <div className="flex-1">
                                  <div className="text-[11px] text-muted-foreground mb-1">TBM 등록</div>
                                  <div className="flex items-center gap-2">
                                    <div className="relative flex-1 h-3 rounded-full bg-muted/40 overflow-hidden" title="TBM 등록률">
                                      <div className="h-full rounded-full transition-all duration-700" style={{ width: `${Math.max(entry.tbmRegRate, 2)}%`, background: regColor.grad }} />
                                      <div className="absolute top-0 bottom-0 border-l border-dashed border-indigo-400/60" style={{ left: '90%' }} />
                                    </div>
                                    <span className={`text-sm font-bold w-10 text-right flex-shrink-0 ${regColor.text}`}>{entry.tbmRegRate}%</span>
                                  </div>
                                </div>
                                <div className="flex-1">
                                  <div className="text-[11px] text-muted-foreground mb-1">AI 적합</div>
                                  <div className="flex items-center gap-2">
                                    <div className="relative flex-1 h-3 rounded-full bg-muted/40 overflow-hidden flex"
                                      title={`AI 적합 · 적합 ${entry.aiPass}건 · 소명완료 ${entry.aiJustified}건 · 분석전 ${entry.aiPending}건 · 부적합 ${entry.aiFail}건`}>
                                      {entry.aiTotal === 0 ? (
                                        <div className="h-full w-full bg-muted/40" />
                                      ) : (
                                        <>
                                          {entry.aiPass > 0 && <div className="h-full" style={{ width: `${(entry.aiPass / entry.aiTotal) * 100}%`, background: '#22c55e' }} />}
                                          {entry.aiJustified > 0 && <div className="h-full" style={{ width: `${(entry.aiJustified / entry.aiTotal) * 100}%`, background: '#f59e0b' }} />}
                                          {entry.aiPending > 0 && <div className="h-full" style={{ width: `${(entry.aiPending / entry.aiTotal) * 100}%`, background: '#94a3b8' }} />}
                                          {entry.aiFail > 0 && <div className="h-full" style={{ width: `${(entry.aiFail / entry.aiTotal) * 100}%`, background: '#ef4444' }} />}
                                        </>
                                      )}
                                      <div className="absolute top-0 bottom-0 border-l border-dashed border-indigo-400/60" style={{ left: '90%' }} />
                                    </div>
                                    <span className={`text-sm font-bold w-10 text-right flex-shrink-0 ${aiColor.text}`}>{entry.tbmAiRate}%</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
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
                      <span className="text-xs font-normal text-muted-foreground">6대 고위험작업(고소·전기·중장비·굴착·밀폐·화기){drilldownLabel ? ` · ${drilldownLabel}` : ''}</span>
                      <div className="ml-auto flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">{filteredHighRiskRecords.length === highRiskRecords.length ? `${drilldownLabel ? drilldownLabel + ' ' : '전체 '}${highRiskRecords.length}건` : `${filteredHighRiskRecords.length} / ${highRiskRecords.length}건`}</span>
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
                              <TableCell><StatusBadge value={r.tbmAiResult} onClick={r.tbmAiResult === '부적합' ? () => openTbmNote(r) : undefined} hasNote={!!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} justificationStatus={(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])?.justificationStatus} /></TableCell>
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
                      <TableCell><RegBadge value={r.tbmResult} onClick={r.tbmResult === '미등록' && !isCancelled(r.workStatus) ? () => openTbmUnregNote(r) : undefined} hasNote={r.tbmResult === '미등록' && !!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} justificationStatus={r.tbmResult === '미등록' ? (r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])?.justificationStatus : null} /></TableCell>
                      <TableCell><StatusBadge value={r.tbmAiResult} onClick={r.tbmAiResult === '부적합' ? () => openTbmNote(r) : undefined} hasNote={r.tbmAiResult === '부적합' && !!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} justificationStatus={r.tbmAiResult === '부적합' ? (r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])?.justificationStatus : null} /></TableCell>
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
            const list = sortByDate(activeIssue.list.filter(r => !isCancelled(r) && !justifiedRecordIds.has(r.id)));
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
                            <TableCell className="py-2 whitespace-nowrap"><RegBadge value={r.tbmResult} onClick={r.tbmResult === '미등록' && !isCancelled(r.workStatus) ? () => openTbmUnregNote(r) : undefined} hasNote={r.tbmResult === '미등록' && !!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} justificationStatus={r.tbmResult === '미등록' ? (r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])?.justificationStatus : null} /></TableCell>
                            <TableCell className="py-2"><StatusBadge value={r.tbmAiResult} onClick={r.tbmAiResult === '부적합' ? () => openTbmNote(r) : undefined} hasNote={r.tbmAiResult === '부적합' && !!(r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])} justificationStatus={r.tbmAiResult === '부적합' ? (r.workOrderNo ? tbmNoteByWorkOrder[r.workOrderNo] : tbmNoteMap[r.id])?.justificationStatus : null} /></TableCell>
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
