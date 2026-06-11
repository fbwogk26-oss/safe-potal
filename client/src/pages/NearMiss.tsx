import { useState, useMemo } from "react";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertTriangle, Download, Search, Filter, ChevronDown, ChevronUp,
  MapPin, Calendar, User, Clipboard, CheckCircle2, Clock, Eye,
  Trash2, QrCode, BarChart3, TrendingUp, Shield, Zap, ArrowRight,
  CheckSquare, X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";


const ACCIDENT_TYPES = ["추락","전도(넘어짐)","감전","낙하·비래","협착(끼임)","충돌","화재","기타"];
const RISK_FACTORS = ["불안전한 상태 (시설·장비 결함)", "불안전한 행동 (보호구 미착용 등)", "환경적 요인", "기타"];
const STATUS_LIST = ["접수","검토중","조치완료"] as const;
const STATUS_COLOR: Record<string, string> = {
  "접수": "bg-amber-100 text-amber-700 border-amber-300",
  "검토중": "bg-blue-100 text-blue-700 border-blue-300",
  "조치완료": "bg-emerald-100 text-emerald-700 border-emerald-300",
};
const TYPE_COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#3b82f6","#8b5cf6","#ec4899","#64748b"];

type NearMiss = {
  id: number; occurredAt: string; location: string; team?: string; reporter?: string;
  isAnonymous?: boolean; accidentType: string; riskFactor: string; riskDetail?: string;
  description?: string; immediateAction?: string; preventionIdea?: string;
  images?: string[]; status?: string; adminNote?: string; assignedTo?: string;
  createdAt: string;
};

export default function NearMiss() {
  const { departments: TEAMS } = useHeadquarters();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { isAdmin, canEditAccidents } = usePermissions();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [selected, setSelected] = useState<NearMiss | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [activeTab, setActiveTab] = useState<"list"|"dashboard">("dashboard");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  const { data: reports = [], isLoading } = useQuery<NearMiss[]>({
    queryKey: ["/api/near-miss"],
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: any) => apiRequest("PATCH", `/api/near-miss/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/near-miss"] }); toast({ title: "업데이트 완료" }); },
    onError: (e: Error) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/near-miss/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/near-miss"] }); setShowDetail(false); toast({ title: "삭제 완료" }); },
    onError: (e: Error) => toast({ title: "오류", description: e.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/near-miss/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      qc.invalidateQueries({ queryKey: ["/api/near-miss"] });
      setSelectedIds(new Set());
      setSelectionMode(false);
      toast({ title: `${data.deleted}건 삭제 완료` });
    },
    onError: (e: Error) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filtered = useMemo(() => reports.filter(r => {
    if (filterStatus !== "all" && r.status !== filterStatus) return false;
    if (filterType !== "all" && r.accidentType !== filterType) return false;
    if (search) {
      const q = search.toLowerCase();
      return [r.location, r.accidentType, r.team, r.reporter, r.description].some(v => v?.toLowerCase().includes(q));
    }
    return true;
  }), [reports, search, filterStatus, filterType]);

  const typeStats = useMemo(() => {
    const map: Record<string, number> = {};
    reports.forEach(r => { map[r.accidentType] = (map[r.accidentType] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [reports]);

  const teamStats = useMemo(() => {
    const map: Record<string, number> = {};
    reports.forEach(r => { if (r.team) map[r.team] = (map[r.team] || 0) + 1; });
    return Object.entries(map).map(([name, value]) => ({ name: name.replace("운용팀","").replace("팀",""), value })).sort((a, b) => b.value - a.value).slice(0, 8);
  }, [reports]);

  const statusStats = useMemo(() => ({
    접수: reports.filter(r => r.status === "접수").length,
    검토중: reports.filter(r => r.status === "검토중").length,
    조치완료: reports.filter(r => r.status === "조치완료").length,
  }), [reports]);

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const toggleAll = () => {
    if (allSelected) setSelectedIds(new Set());
    else setSelectedIds(new Set(filtered.map(r => r.id)));
  };

  const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/near-miss/submit` : "";

  const openDetail = (r: NearMiss) => { setSelected(r); setShowDetail(true); };

  return (
    <div className="space-y-4 sm:space-y-6 p-3 sm:p-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            아차사고 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">당신의 기록이 동료의 생명을 구합니다</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowQr(true)} data-testid="button-show-qr">
            <QrCode className="w-4 h-4" />QR 등록링크
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open('/api/near-miss/export/excel')} data-testid="button-export-excel">
            <Download className="w-4 h-4" />엑셀
          </Button>
          <Button size="sm" className="gap-1.5 bg-amber-500 hover:bg-amber-600" onClick={() => window.open('/near-miss/submit', '_blank')} data-testid="button-go-public">
            <ArrowRight className="w-4 h-4" />등록하기
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b">
        {(["dashboard","list"] as const).map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setSelectionMode(false); setSelectedIds(new Set()); }} className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${activeTab === tab ? "border-amber-500 text-amber-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab === "dashboard" ? "📊 대시보드" : "📋 목록 관리"}
          </button>
        ))}
        {activeTab === "list" && isAdmin && (
          <div className="ml-auto pb-1">
            <Button
              variant={selectionMode ? "default" : "outline"}
              size="sm"
              className={`gap-1.5 h-8 ${selectionMode ? "bg-amber-500 hover:bg-amber-600 text-white" : ""}`}
              onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
              data-testid="button-toggle-selection"
            >
              <CheckSquare className="w-3.5 h-3.5" />
              {selectionMode ? "선택 취소" : "선택"}
            </Button>
          </div>
        )}
      </div>

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: "전체 건수", value: reports.length, icon: Clipboard, color: "text-slate-600", bg: "bg-slate-100" },
              { label: "접수", value: statusStats["접수"], icon: Clock, color: "text-amber-600", bg: "bg-amber-100" },
              { label: "검토중", value: statusStats["검토중"], icon: Shield, color: "text-blue-600", bg: "bg-blue-100" },
              { label: "조치완료", value: statusStats["조치완료"], icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-100" },
            ].map(({ label, value, icon: Icon, color, bg }) => (
              <Card key={label}>
                <CardContent className="p-3 sm:p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${bg}`}>
                    <Icon className={`w-5 h-5 ${color}`} />
                  </div>
                  <div>
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className={`text-xl font-bold ${color}`}>{value}<span className="text-xs font-normal text-muted-foreground ml-1">건</span></p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* 사고 유형 차트 */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-amber-500" />사고 유형 TOP</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-4">
                {typeStats.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <div style={{ height: Math.max(120, typeStats.length * 40) + "px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={typeStats} margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={90} />
                        <Tooltip formatter={(v) => [`${v}건`]} />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26} label={{ position: "right", fontSize: 12, fontWeight: 700 }}>
                          {typeStats.map((_, i) => <Cell key={i} fill={TYPE_COLORS[i % TYPE_COLORS.length]} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 팀별 차트 */}
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="w-4 h-4 text-indigo-500" />팀별 발생건수</CardTitle>
              </CardHeader>
              <CardContent className="px-3 pb-4">
                {teamStats.length === 0 ? (
                  <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">데이터 없음</div>
                ) : (
                  <div style={{ height: Math.max(120, teamStats.length * 40) + "px" }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart layout="vertical" data={teamStats} margin={{ top: 4, right: 40, left: 4, bottom: 4 }}>
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" opacity={0.5} />
                        <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                        <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fontWeight: 600 }} axisLine={false} tickLine={false} width={60} />
                        <Tooltip formatter={(v) => [`${v}건`]} />
                        <Bar dataKey="value" fill="#8b5cf6" radius={[0, 6, 6, 0]} maxBarSize={26} label={{ position: "right", fontSize: 12, fontWeight: 700 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 최근 접수 목록 */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />최근 접수 (미조치)</CardTitle>
            </CardHeader>
            <CardContent className="px-3 pb-4 space-y-2">
              {reports.filter(r => r.status !== "조치완료").slice(0, 5).length === 0 ? (
                <div className="py-6 text-center text-muted-foreground text-sm">미조치 건이 없습니다</div>
              ) : reports.filter(r => r.status !== "조치완료").slice(0, 5).map(r => (
                <div key={r.id} onClick={() => openDetail(r)} className="flex items-center gap-3 p-2.5 rounded-lg hover:bg-muted/40 cursor-pointer transition-colors border border-transparent hover:border-border">
                  <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold truncate">{r.accidentType}</span>
                      <Badge className={`text-[10px] border ${STATUS_COLOR[r.status || "접수"]}`}>{r.status || "접수"}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{r.location} · {r.team || ""} · {new Date(r.occurredAt).toLocaleDateString("ko-KR")}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* List Tab */}
      {activeTab === "list" && (
        <div className="space-y-3">
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Input placeholder="장소, 유형, 팀 검색..." value={search} onChange={e => setSearch(e.target.value)} className="pr-8" data-testid="input-search" />
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-36" data-testid="select-status">
                <Filter className="w-3.5 h-3.5 mr-1" /><SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                {STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="w-full sm:w-40" data-testid="select-type">
                <SelectValue placeholder="사고 유형" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 유형</SelectItem>
                {ACCIDENT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* 전체 선택 행 */}
          {selectionMode && filtered.length > 0 && (
            <div className="flex items-center gap-3 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <Checkbox checked={allSelected} onCheckedChange={toggleAll} data-testid="checkbox-select-all" />
              <span className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                전체 선택 ({selectedIds.size}/{filtered.length})
              </span>
            </div>
          )}

          {isLoading ? (
            <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-20 bg-muted/20 animate-pulse rounded-lg" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">등록된 아차사고가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filtered.map((r, idx) => (
                <motion.div key={r.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: idx * 0.02 }}>
                  <div
                    onClick={() => selectionMode ? toggleSelect(r.id) : openDetail(r)}
                    className={`border rounded-lg p-3 sm:p-4 cursor-pointer transition-colors ${
                      selectionMode && selectedIds.has(r.id)
                        ? "bg-amber-50 border-amber-300 dark:bg-amber-900/20 dark:border-amber-700"
                        : "hover:bg-amber-50/40 dark:hover:bg-amber-900/10"
                    }`}
                    data-testid={`near-miss-card-${r.id}`}
                  >
                    <div className="flex items-start gap-3">
                      {selectionMode ? (
                        <Checkbox
                          checked={selectedIds.has(r.id)}
                          onCheckedChange={() => toggleSelect(r.id)}
                          onClick={e => e.stopPropagation()}
                          className="mt-0.5 shrink-0"
                          data-testid={`checkbox-near-miss-${r.id}`}
                        />
                      ) : (
                        <div className="shrink-0 w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                          <AlertTriangle className="w-5 h-5" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-sm">{r.accidentType}</span>
                          <Badge className={`text-[10px] border ${STATUS_COLOR[r.status || "접수"]}`}>{r.status || "접수"}</Badge>
                          {r.isAnonymous && <Badge variant="outline" className="text-[10px]">익명</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(r.occurredAt).toLocaleDateString("ko-KR")}</span>
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{r.location}</span>
                          {r.team && <span>{r.team}</span>}
                          {r.reporter && <span className="flex items-center gap-1"><User className="w-3 h-3" />{r.reporter}</span>}
                        </div>
                        {r.description && <p className="text-xs text-muted-foreground mt-1 truncate">{r.description}</p>}
                      </div>
                      {!selectionMode && <Eye className="w-4 h-4 text-muted-foreground shrink-0" />}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 플로팅 벌크 액션 바 */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-full px-5 py-3">
          <span className="text-sm font-semibold text-amber-600">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border" />
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-muted-foreground"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="w-3.5 h-3.5 mr-1" />선택 해제
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="h-8"
            onClick={() => { if (confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }}
            disabled={bulkDeleteMutation.isPending}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
        </div>
      )}

      {/* Detail Dialog */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              아차사고 상세 (#{selected?.id})
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-muted-foreground text-xs">발생일시</span><p className="font-medium">{new Date(selected.occurredAt).toLocaleString("ko-KR")}</p></div>
                <div><span className="text-muted-foreground text-xs">발생장소</span><p className="font-medium">{selected.location}</p></div>
                <div><span className="text-muted-foreground text-xs">소속팀</span><p className="font-medium">{selected.team || "-"}</p></div>
                <div><span className="text-muted-foreground text-xs">신고자</span><p className="font-medium">{selected.isAnonymous ? "익명" : (selected.reporter || "-")}</p></div>
                <div><span className="text-muted-foreground text-xs">사고유형</span><p className="font-semibold text-amber-700">{selected.accidentType}</p></div>
                <div><span className="text-muted-foreground text-xs">위험요인</span><p className="font-medium">{selected.riskFactor}</p></div>
              </div>
              {selected.riskDetail && <div><p className="text-xs text-muted-foreground mb-1">위험요인 상세</p><p className="text-sm bg-muted/30 rounded p-2">{selected.riskDetail}</p></div>}
              {selected.description && <div><p className="text-xs text-muted-foreground mb-1">상황 설명</p><p className="text-sm bg-muted/30 rounded p-2">{selected.description}</p></div>}
              {selected.immediateAction && <div><p className="text-xs text-muted-foreground mb-1">즉시 조치</p><p className="text-sm bg-emerald-50 dark:bg-emerald-900/20 rounded p-2">{selected.immediateAction}</p></div>}
              {selected.preventionIdea && <div><p className="text-xs text-muted-foreground mb-1">재발방지 아이디어</p><p className="text-sm bg-indigo-50 dark:bg-indigo-900/20 rounded p-2">{selected.preventionIdea}</p></div>}
              {selected.images && selected.images.length > 0 && (
                <div>
                  <p className="text-xs text-muted-foreground mb-2">첨부 사진</p>
                  <div className="grid grid-cols-3 gap-2">
                    {selected.images.map((img, i) => (
                      <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                        <img src={img} alt={`사진${i+1}`} className="w-full aspect-square object-cover rounded-lg border hover:opacity-80 transition-opacity" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
              {canEditAccidents && (
                <div className="border-t pt-4 space-y-3">
                  <p className="text-sm font-semibold text-foreground">관리자 조치</p>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">상태 변경</Label>
                      <Select value={selected.status || "접수"} onValueChange={v => { setSelected(s => s ? {...s, status: v} : s); updateMutation.mutate({ id: selected.id, status: v }); }}>
                        <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                        <SelectContent>{STATUS_LIST.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">담당자</Label>
                      <Input className="mt-1" defaultValue={selected.assignedTo || ""} placeholder="담당자 이름" onBlur={e => updateMutation.mutate({ id: selected.id, assignedTo: e.target.value })} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">관리자 메모</Label>
                    <Textarea className="mt-1 text-sm" rows={3} defaultValue={selected.adminNote || ""} placeholder="조치 내용, 피드백 등" onBlur={e => updateMutation.mutate({ id: selected.id, adminNote: e.target.value })} />
                  </div>
                  {isAdmin && (
                    <Button variant="destructive" size="sm" className="w-full" onClick={() => { if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(selected.id); }}>
                      <Trash2 className="w-4 h-4 mr-1" />삭제
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* QR Dialog */}
      <Dialog open={showQr} onOpenChange={setShowQr}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><QrCode className="w-5 h-5" />현장 등록 QR</DialogTitle></DialogHeader>
          <div className="text-center space-y-4 py-2">
            <p className="text-sm text-muted-foreground">아래 QR 코드를 현장에 부착하거나 링크를 공유하세요</p>
            <div className="bg-white p-4 rounded-xl border inline-block">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicUrl)}`} alt="QR Code" className="w-48 h-48" />
            </div>
            <div className="text-xs text-muted-foreground break-all bg-muted/30 rounded p-2">{publicUrl}</div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => { navigator.clipboard.writeText(publicUrl); toast({ title: "링크 복사됨" }); }}>링크 복사</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
