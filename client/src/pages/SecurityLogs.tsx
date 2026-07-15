import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Lock, Unlock, Key, LogIn, LogOut, Download, Upload, Trash2, Pencil,
  ChevronDown, Monitor, MapPin,
} from "lucide-react";

interface SecurityLog {
  id: string;
  eventType: string;
  userId: string | null;
  username: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  details: string | null;
  success: boolean;
  createdAt: string;
}

const EVENT_META: Record<string, { label: string; icon: React.ElementType; dot: string }> = {
  LOGIN_SUCCESS:          { label: "로그인 성공",           icon: LogIn,    dot: "bg-emerald-500" },
  LOGIN_FAILED:           { label: "로그인 실패",           icon: XCircle,  dot: "bg-red-500" },
  LOGIN_BLOCKED:          { label: "로그인 차단",           icon: Lock,     dot: "bg-orange-500" },
  ACCOUNT_LOCKED:         { label: "계정 잠금",             icon: Lock,     dot: "bg-red-600" },
  ACCOUNT_UNLOCKED:       { label: "계정 잠금해제",         icon: Unlock,   dot: "bg-blue-500" },
  LOGOUT:                 { label: "로그아웃",              icon: LogOut,   dot: "bg-slate-400" },
  PASSWORD_CHANGED:       { label: "비밀번호 변경",         icon: Key,      dot: "bg-blue-500" },
  PASSWORD_FORCE_CHANGED: { label: "초기 비밀번호 변경",    icon: Key,      dot: "bg-blue-400" },
  PASSWORD_CHANGE_FAILED: { label: "비밀번호 변경 실패",    icon: XCircle,  dot: "bg-red-500" },
  PASSWORD_ADMIN_RESET:   { label: "관리자 비밀번호 초기화", icon: Key,     dot: "bg-amber-500" },
  DATA_DOWNLOAD:          { label: "데이터 다운로드",       icon: Download, dot: "bg-indigo-500" },
  DATA_UPLOAD:            { label: "데이터 업로드",         icon: Upload,   dot: "bg-violet-500" },
  DATA_DELETE:            { label: "데이터 삭제",           icon: Trash2,   dot: "bg-red-500" },
  DATA_UPDATE:            { label: "데이터 수정",           icon: Pencil,   dot: "bg-amber-500" },
};

function parseUA(ua: string | null) {
  if (!ua) return null;
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "macOS";
  return ua.slice(0, 20) + "…";
}

function groupByDate(logs: SecurityLog[]): [string, SecurityLog[]][] {
  const map = new Map<string, SecurityLog[]>();
  for (const log of logs) {
    const key = new Date(log.createdAt).toLocaleDateString("ko-KR", {
      year: "numeric", month: "long", day: "numeric",
    });
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(log);
  }
  return Array.from(map.entries());
}

function getDateLabel(key: string) {
  const fmt = (d: Date) => d.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const today = fmt(new Date());
  const yesterday = fmt(new Date(Date.now() - 86_400_000));
  if (key === today) return "오늘";
  if (key === yesterday) return "어제";
  return key;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export default function SecurityLogs() {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data: logs = [], isLoading, refetch } = useQuery<SecurityLog[]>({
    queryKey: ["/api/security-logs?limit=500"],
  });

  const filtered = useMemo(() => logs.filter(log => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (log.username || "").toLowerCase().includes(q) ||
      (log.ipAddress || "").includes(q) ||
      (log.details || "").toLowerCase().includes(q);
    const matchType =
      filterType === "all" ||
      (filterType === "failed" && !log.success) ||
      (filterType === "success" && log.success) ||
      log.eventType === filterType;
    return matchSearch && matchType;
  }), [logs, search, filterType]);

  const groups = useMemo(() => groupByDate(filtered), [filtered]);

  const stats = {
    total: logs.length,
    logins: logs.filter(l => l.eventType === "LOGIN_SUCCESS").length,
    failed: logs.filter(l => !l.success).length,
    locked: logs.filter(l => l.eventType === "ACCOUNT_LOCKED").length,
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pt-4">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">보안 감사 로그</h1>
            <p className="text-xs text-muted-foreground mt-0.5">최근 500건 · 행 클릭 시 상세</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5" data-testid="button-refresh-logs">
          <RefreshCw className="w-3.5 h-3.5" />새로고침
        </Button>
      </div>

      {/* 통계 */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: "전체",   value: stats.total,  color: "text-foreground",           sub: "" },
          { label: "로그인 성공", value: stats.logins, color: "text-emerald-600 dark:text-emerald-400", sub: "" },
          { label: "실패",   value: stats.failed, color: "text-red-600 dark:text-red-400",     sub: "" },
          { label: "계정 잠금", value: stats.locked, color: "text-orange-600 dark:text-orange-400", sub: "" },
        ].map(s => (
          <div key={s.label} className="rounded-xl border bg-card p-4 text-center">
            <p className={`text-2xl font-bold tabular-nums ${s.color}`}>{s.value.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="사용자명, IP, 내용 검색…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="input-search-logs" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-48" data-testid="select-filter-type"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 이벤트</SelectItem>
            <SelectItem value="success">성공만</SelectItem>
            <SelectItem value="failed">실패만</SelectItem>
            <SelectItem value="LOGIN_SUCCESS">로그인 성공</SelectItem>
            <SelectItem value="LOGIN_FAILED">로그인 실패</SelectItem>
            <SelectItem value="ACCOUNT_LOCKED">계정 잠금</SelectItem>
            <SelectItem value="PASSWORD_CHANGED">비밀번호 변경</SelectItem>
            <SelectItem value="PASSWORD_ADMIN_RESET">관리자 초기화</SelectItem>
            <SelectItem value="DATA_DOWNLOAD">다운로드</SelectItem>
            <SelectItem value="DATA_UPLOAD">업로드</SelectItem>
            <SelectItem value="DATA_DELETE">삭제</SelectItem>
            <SelectItem value="DATA_UPDATE">수정</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* 로그 목록 */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Shield className="w-10 h-10 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">표시할 로그가 없습니다</p>
        </div>
      ) : (
        <div className="rounded-2xl border bg-card overflow-hidden">
          {groups.map(([dateKey, dateLogs], gi) => (
            <div key={dateKey}>
              {/* 날짜 구분 */}
              <div className={`flex items-center gap-3 px-5 py-3 bg-muted/40 ${gi > 0 ? "border-t" : ""}`}>
                <span className="text-xs font-semibold text-muted-foreground">{getDateLabel(dateKey)}</span>
                <div className="h-px flex-1 bg-border/60" />
                <span className="text-xs text-muted-foreground/60">{dateLogs.length}건</span>
              </div>

              {/* 행 목록 */}
              {dateLogs.map((log, idx) => {
                const meta = EVENT_META[log.eventType] || { label: log.eventType, icon: Shield, dot: "bg-slate-400" };
                const Icon = meta.icon;
                const isExpanded = expandedId === log.id;

                return (
                  <div
                    key={log.id}
                    className={`border-t first:border-t-0 transition-colors ${!log.success ? "bg-red-50/30 dark:bg-red-950/10 hover:bg-red-50/60 dark:hover:bg-red-950/20" : "hover:bg-muted/30"}`}
                    data-testid={`security-log-${log.id}`}
                  >
                    <button
                      className="w-full flex items-center gap-4 px-5 py-3.5 text-left"
                      onClick={() => setExpandedId(isExpanded ? null : log.id)}
                    >
                      {/* 타임라인 점 */}
                      <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                        <div className={`w-2 h-2 rounded-full ${meta.dot}`} />
                      </div>

                      {/* 아이콘 */}
                      <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                      </div>

                      {/* 이벤트 정보 */}
                      <div className="flex-1 min-w-0 flex items-center gap-3">
                        <span className="text-sm font-medium">{meta.label}</span>
                        {log.username && (
                          <span className="text-sm text-muted-foreground">{log.username}</span>
                        )}
                        {!log.success && (
                          <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-0 text-[10px] px-1.5 py-0">실패</Badge>
                        )}
                        {log.details && !isExpanded && (
                          <span className="text-xs text-muted-foreground/60 truncate max-w-xs hidden lg:block">{log.details}</span>
                        )}
                      </div>

                      {/* 시간 + 토글 */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-muted-foreground font-mono">{formatTime(log.createdAt)}</span>
                        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground/50 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    {/* 확장 상세 */}
                    {isExpanded && (
                      <div className="px-5 pb-4 pt-0 mx-5 mb-3 rounded-xl bg-muted/50 text-xs space-y-2 border">
                        <div className="pt-3 space-y-2">
                          {log.details && (
                            <div className="flex gap-3">
                              <span className="text-muted-foreground w-20 flex-shrink-0">상세 내용</span>
                              <span className="break-all">{log.details}</span>
                            </div>
                          )}
                          {log.ipAddress && (
                            <div className="flex gap-3 items-center">
                              <span className="text-muted-foreground w-20 flex-shrink-0 flex items-center gap-1"><MapPin className="w-3 h-3" />IP</span>
                              <span className="font-mono">{log.ipAddress}</span>
                            </div>
                          )}
                          {log.userAgent && (
                            <div className="flex gap-3 items-center">
                              <span className="text-muted-foreground w-20 flex-shrink-0 flex items-center gap-1"><Monitor className="w-3 h-3" />기기</span>
                              <span>{parseUA(log.userAgent)}</span>
                            </div>
                          )}
                          <div className="flex gap-3">
                            <span className="text-muted-foreground w-20 flex-shrink-0">이벤트 ID</span>
                            <span className="font-mono text-muted-foreground/50">{log.id}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
