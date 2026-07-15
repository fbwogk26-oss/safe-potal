import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield, Search, RefreshCw, AlertTriangle, CheckCircle2, XCircle,
  Lock, Unlock, Key, LogIn, LogOut, Download, Upload, Trash2, Pencil,
  ChevronDown, ChevronRight, Monitor, MapPin,
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

const EVENT_META: Record<string, { label: string; icon: React.ElementType; border: string; iconBg: string; iconColor: string }> = {
  LOGIN_SUCCESS:          { label: "로그인 성공",        icon: LogIn,       border: "border-l-green-400",   iconBg: "bg-green-100 dark:bg-green-900/40",   iconColor: "text-green-600 dark:text-green-400" },
  LOGIN_FAILED:           { label: "로그인 실패",        icon: XCircle,     border: "border-l-red-400",     iconBg: "bg-red-100 dark:bg-red-900/40",       iconColor: "text-red-600 dark:text-red-400" },
  LOGIN_BLOCKED:          { label: "로그인 차단",        icon: Lock,        border: "border-l-orange-400",  iconBg: "bg-orange-100 dark:bg-orange-900/40", iconColor: "text-orange-600 dark:text-orange-400" },
  ACCOUNT_LOCKED:         { label: "계정 잠금",          icon: Lock,        border: "border-l-red-500",     iconBg: "bg-red-100 dark:bg-red-900/40",       iconColor: "text-red-700 dark:text-red-400" },
  ACCOUNT_UNLOCKED:       { label: "계정 잠금해제",      icon: Unlock,      border: "border-l-blue-400",    iconBg: "bg-blue-100 dark:bg-blue-900/40",     iconColor: "text-blue-600 dark:text-blue-400" },
  LOGOUT:                 { label: "로그아웃",           icon: LogOut,      border: "border-l-slate-300",   iconBg: "bg-slate-100 dark:bg-slate-800/60",   iconColor: "text-slate-500 dark:text-slate-400" },
  PASSWORD_CHANGED:       { label: "비밀번호 변경",      icon: Key,         border: "border-l-blue-400",    iconBg: "bg-blue-100 dark:bg-blue-900/40",     iconColor: "text-blue-600 dark:text-blue-400" },
  PASSWORD_FORCE_CHANGED: { label: "초기 비밀번호 변경", icon: Key,         border: "border-l-blue-300",    iconBg: "bg-blue-100 dark:bg-blue-900/40",     iconColor: "text-blue-500 dark:text-blue-400" },
  PASSWORD_CHANGE_FAILED: { label: "비밀번호 변경 실패", icon: XCircle,     border: "border-l-red-400",     iconBg: "bg-red-100 dark:bg-red-900/40",       iconColor: "text-red-600 dark:text-red-400" },
  PASSWORD_ADMIN_RESET:   { label: "관리자 비밀번호 초기화", icon: Key,     border: "border-l-yellow-400",  iconBg: "bg-yellow-100 dark:bg-yellow-900/40", iconColor: "text-yellow-600 dark:text-yellow-500" },
  DATA_DOWNLOAD:          { label: "데이터 다운로드",    icon: Download,    border: "border-l-indigo-400",  iconBg: "bg-indigo-100 dark:bg-indigo-900/40", iconColor: "text-indigo-600 dark:text-indigo-400" },
  DATA_UPLOAD:            { label: "데이터 업로드",      icon: Upload,      border: "border-l-violet-400",  iconBg: "bg-violet-100 dark:bg-violet-900/40", iconColor: "text-violet-600 dark:text-violet-400" },
  DATA_DELETE:            { label: "데이터 삭제",        icon: Trash2,      border: "border-l-red-400",     iconBg: "bg-red-100 dark:bg-red-900/40",       iconColor: "text-red-600 dark:text-red-400" },
  DATA_UPDATE:            { label: "데이터 수정",        icon: Pencil,      border: "border-l-amber-400",   iconBg: "bg-amber-100 dark:bg-amber-900/40",   iconColor: "text-amber-600 dark:text-amber-500" },
};

const FALLBACK_META = { label: "", icon: Shield, border: "border-l-slate-300", iconBg: "bg-slate-100 dark:bg-slate-800", iconColor: "text-slate-500" };

function parseUA(ua: string | null): string | null {
  if (!ua) return null;
  if (/iPhone|iPad/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS/i.test(ua)) return "macOS";
  return ua.slice(0, 24) + "…";
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

function getDateLabel(key: string): string {
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
    <div className="space-y-5 pt-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            보안 감사 로그
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">최근 500건 이벤트 · 클릭 시 상세 확인</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5" data-testid="button-refresh-logs">
          <RefreshCw className="w-3.5 h-3.5" />새로고침
        </Button>
      </div>

      {/* 통계 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "전체 이벤트", value: stats.total,  bg: "bg-slate-100 dark:bg-slate-800",    icon: Shield,        color: "text-slate-600 dark:text-slate-400",  val: "text-foreground" },
          { label: "로그인 성공", value: stats.logins, bg: "bg-green-100 dark:bg-green-900/30", icon: CheckCircle2,  color: "text-green-600 dark:text-green-400",  val: "text-green-700 dark:text-green-300" },
          { label: "실패 이벤트", value: stats.failed, bg: "bg-red-100 dark:bg-red-900/30",     icon: AlertTriangle, color: "text-red-600 dark:text-red-400",      val: "text-red-700 dark:text-red-300" },
          { label: "계정 잠금",   value: stats.locked, bg: "bg-orange-100 dark:bg-orange-900/30", icon: Lock,        color: "text-orange-600 dark:text-orange-400", val: "text-orange-700 dark:text-orange-300" },
        ].map(({ label, value, bg, icon: Icon, color, val }) => (
          <Card key={label}>
            <CardContent className="p-4 flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl ${bg} flex items-center justify-center flex-shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground leading-none mb-1">{label}</p>
                <p className={`text-2xl font-bold leading-none ${val}`}>{value.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="사용자명, IP, 상세내용 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search-logs"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-52" data-testid="select-filter-type">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 이벤트</SelectItem>
            <SelectItem value="success">성공만</SelectItem>
            <SelectItem value="failed">실패만</SelectItem>
            <SelectItem value="LOGIN_SUCCESS">로그인 성공</SelectItem>
            <SelectItem value="LOGIN_FAILED">로그인 실패</SelectItem>
            <SelectItem value="ACCOUNT_LOCKED">계정 잠금</SelectItem>
            <SelectItem value="PASSWORD_CHANGED">비밀번호 변경</SelectItem>
            <SelectItem value="PASSWORD_ADMIN_RESET">관리자 초기화</SelectItem>
            <SelectItem value="DATA_DOWNLOAD">데이터 다운로드</SelectItem>
            <SelectItem value="DATA_UPLOAD">데이터 업로드</SelectItem>
            <SelectItem value="DATA_DELETE">데이터 삭제</SelectItem>
            <SelectItem value="DATA_UPDATE">데이터 수정</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground self-center whitespace-nowrap hidden sm:block">
          {filtered.length.toLocaleString()}건 표시
        </span>
      </div>

      {/* 로그 목록 */}
      <div className="space-y-1">
        {isLoading ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm">표시할 로그가 없습니다</p>
          </div>
        ) : (
          groups.map(([dateKey, dateLogs]) => (
            <div key={dateKey}>
              {/* 날짜 구분선 */}
              <div className="flex items-center gap-3 py-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs font-semibold text-muted-foreground bg-background px-2">{getDateLabel(dateKey)}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <div className="space-y-1">
                {dateLogs.map(log => {
                  const meta = EVENT_META[log.eventType] || { ...FALLBACK_META, label: log.eventType };
                  const Icon = meta.icon;
                  const isExpanded = expandedId === log.id;

                  return (
                    <div
                      key={log.id}
                      className={`rounded-xl border border-l-4 transition-all ${meta.border} ${
                        !log.success
                          ? "bg-red-50/40 dark:bg-red-950/20 border-border"
                          : "bg-card border-border"
                      } ${isExpanded ? "shadow-sm" : ""}`}
                      data-testid={`security-log-${log.id}`}
                    >
                      {/* 메인 행 */}
                      <button
                        className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
                        onClick={() => setExpandedId(isExpanded ? null : log.id)}
                      >
                        {/* 이벤트 아이콘 */}
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${meta.iconBg}`}>
                          <Icon className={`w-4 h-4 ${meta.iconColor}`} />
                        </div>

                        {/* 이벤트 정보 */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold ${meta.iconColor}`}>
                              {meta.label || log.eventType}
                            </span>
                            {log.username && (
                              <span className="text-sm font-medium text-foreground">{log.username}</span>
                            )}
                            {!log.success && (
                              <Badge variant="secondary" className="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300 text-[10px] px-1.5 py-0 gap-1 border-0">
                                <AlertTriangle className="w-2.5 h-2.5" />실패
                              </Badge>
                            )}
                          </div>
                          {log.details && !isExpanded && (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[400px]">{log.details}</p>
                          )}
                        </div>

                        {/* 시간 + 토글 */}
                        <div className="text-right flex-shrink-0 flex items-center gap-2">
                          <span className="text-xs text-muted-foreground font-mono">{formatTime(log.createdAt)}</span>
                          {isExpanded
                            ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                            : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />}
                        </div>
                      </button>

                      {/* 확장 상세 */}
                      {isExpanded && (
                        <div className="px-3 pb-3 pt-0 border-t border-border/50 mt-0.5">
                          <div className="rounded-lg bg-muted/50 p-3 space-y-2 text-xs mt-2">
                            {log.details && (
                              <div className="flex gap-2">
                                <span className="text-muted-foreground w-16 flex-shrink-0">상세내용</span>
                                <span className="font-medium break-all">{log.details}</span>
                              </div>
                            )}
                            {log.ipAddress && (
                              <div className="flex gap-2 items-center">
                                <span className="text-muted-foreground w-16 flex-shrink-0 flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />IP
                                </span>
                                <span className="font-mono">{log.ipAddress}</span>
                              </div>
                            )}
                            {log.userAgent && (
                              <div className="flex gap-2 items-center">
                                <span className="text-muted-foreground w-16 flex-shrink-0 flex items-center gap-1">
                                  <Monitor className="w-3 h-3" />기기
                                </span>
                                <span>{parseUA(log.userAgent)}</span>
                              </div>
                            )}
                            <div className="flex gap-2">
                              <span className="text-muted-foreground w-16 flex-shrink-0">이벤트 ID</span>
                              <span className="font-mono text-muted-foreground/60">{log.id}</span>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
