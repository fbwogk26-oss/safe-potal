import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Activity, RefreshCw, Search, Clock, Server, Filter, AlertCircle, Zap } from "lucide-react";

interface ApiLogEntry {
  id: number;
  method: string;
  path: string;
  status: number;
  duration: number;
  username: string | null;
  ip: string | null;
  referer: string | null;
  timestamp: string;
}

const METHOD_STYLE: Record<string, { bg: string; text: string; short: string }> = {
  GET:    { bg: "bg-sky-100 dark:bg-sky-900/40",    text: "text-sky-700 dark:text-sky-300",    short: "조회" },
  POST:   { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300", short: "등록" },
  PUT:    { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300", short: "수정" },
  PATCH:  { bg: "bg-orange-100 dark:bg-orange-900/40", text: "text-orange-700 dark:text-orange-300", short: "수정" },
  DELETE: { bg: "bg-red-100 dark:bg-red-900/40",    text: "text-red-700 dark:text-red-300",    short: "삭제" },
};

const API_PATH_LABELS: Array<[string, string]> = [
  ["/api/admin/api-logs", "API 호출 내역"], ["/api/admin/signatures", "서명 관리"],
  ["/api/admin/backup", "데이터 백업"], ["/api/admin/card-news", "카드뉴스"],
  ["/api/admin/fuel-costs", "유류비"], ["/api/auto-email", "자동 이메일"],
  ["/api/auth/permissions", "권한 확인"], ["/api/auth/user-role", "역할 확인"],
  ["/api/auth/user", "사용자 인증"], ["/api/auth", "인증"],
  ["/api/accident-reports", "사고경위서"], ["/api/accidents/stats", "사고 통계"],
  ["/api/accidents", "사고 현황"], ["/api/attendance", "입회 관리"],
  ["/api/access", "출입신청"], ["/api/chatbot", "AI 챗봇"],
  ["/api/chemicals", "MSDS"], ["/api/education-sessions", "교육일지"],
  ["/api/education-signatures", "교육 서명"], ["/api/lock-status", "잠금 상태"],
  ["/api/musculoskeletal-assessments", "근골격계"], ["/api/music/schedule", "음악 스케줄"],
  ["/api/music", "음악 관리"], ["/api/new-equipment-requests", "장비 요청"],
  ["/api/notices", "공지사항"], ["/api/risk-assessments", "위험성평가"],
  ["/api/safety-cost-records", "안전보건관리비"], ["/api/safety-cost-tax-invoices", "세금계산서"],
  ["/api/security-logs", "보안 감사 로그"], ["/api/settings/pinned-notice", "고정 공지"],
  ["/api/settings/role-presets", "역할 프리셋"], ["/api/settings/lock", "잠금 설정"],
  ["/api/settings", "설정"], ["/api/teams", "팀 안전점수"],
  ["/api/traffic-fines", "교통 과태료"], ["/api/users", "사용자 관리"],
  ["/api/vehicle-logs", "차량 일지"], ["/api/vehicles", "차량 관리"],
  ["/api/weather", "날씨 정보"], ["/api/work-plans", "작업계획"],
];

function getLabel(p: string) {
  const base = p.split("?")[0];
  const m = API_PATH_LABELS.find(([prefix]) => base === prefix || base.startsWith(prefix + "/"));
  return m ? m[1] : null;
}

function statusStyle(s: number): string {
  if (s < 300) return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300";
  if (s < 400) return "bg-sky-100 text-sky-700";
  if (s < 500) return "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

function durColor(ms: number) {
  if (ms < 100) return "text-emerald-600 dark:text-emerald-400";
  if (ms < 500) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function DurationBar({ ms }: { ms: number }) {
  const pct = Math.min(100, (ms / 2000) * 100);
  const barColor = ms < 100 ? "bg-emerald-400" : ms < 500 ? "bg-amber-400" : "bg-red-500";
  return (
    <div className="flex items-center gap-2 justify-end">
      <span className={`font-mono text-xs font-semibold tabular-nums ${durColor(ms)}`}>{ms}ms</span>
      <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function formatTs(ts: string) {
  const d = new Date(ts);
  const date = d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  const time = d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return { date, time };
}

export default function ApiLogs() {
  const [search, setSearch] = useState("");
  const [methodFilter, setMethodFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [limit, setLimit] = useState("200");

  const { data: logs = [], isLoading, refetch, isFetching } = useQuery<ApiLogEntry[]>({
    queryKey: [`/api/admin/api-logs?limit=${limit}`],
    refetchInterval: 10000,
  });

  const filtered = logs.filter(log => {
    if (methodFilter !== "all" && log.method !== methodFilter) return false;
    if (statusFilter === "2xx" && (log.status < 200 || log.status >= 300)) return false;
    if (statusFilter === "4xx" && (log.status < 400 || log.status >= 500)) return false;
    if (statusFilter === "5xx" && log.status < 500) return false;
    if (search) {
      const s = search.toLowerCase();
      return log.path.toLowerCase().includes(s) || (log.username || "").toLowerCase().includes(s) || (log.ip || "").includes(s);
    }
    return true;
  });

  const total = logs.length;
  const errors = logs.filter(l => l.status >= 400).length;
  const avgMs = total ? Math.round(logs.reduce((a, l) => a + l.duration, 0) / total) : 0;
  const slowCount = logs.filter(l => l.duration >= 500).length;
  const errorPct = total ? ((errors / total) * 100).toFixed(1) : "0.0";

  const methodCounts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.method] = (acc[l.method] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">

      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Activity className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-bold leading-none">API 호출 내역</h1>
            <p className="text-xs text-muted-foreground mt-0.5">10초마다 자동 갱신 · 최근 {limit}건</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />새로고침
        </Button>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <Server className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">총 요청</p>
            <p className="text-xl font-bold tabular-nums">{total.toLocaleString()}</p>
          </div>
        </div>
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${errors > 0 ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900" : "bg-card"}`}>
          <AlertCircle className={`h-4 w-4 flex-shrink-0 ${errors > 0 ? "text-red-500" : "text-muted-foreground"}`} />
          <div>
            <p className="text-xs text-muted-foreground">오류</p>
            <p className={`text-xl font-bold tabular-nums ${errors > 0 ? "text-red-600 dark:text-red-400" : ""}`}>
              {errors} <span className="text-xs font-normal text-muted-foreground">{errorPct}%</span>
            </p>
          </div>
        </div>
        <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
          <Clock className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div>
            <p className="text-xs text-muted-foreground">평균 응답</p>
            <p className={`text-xl font-bold tabular-nums ${durColor(avgMs)}`}>{avgMs}<span className="text-xs font-normal text-muted-foreground ml-1">ms</span></p>
          </div>
        </div>
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${slowCount > 0 ? "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900" : "bg-card"}`}>
          <Zap className={`h-4 w-4 flex-shrink-0 ${slowCount > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
          <div>
            <p className="text-xs text-muted-foreground">느린 요청 ≥500ms</p>
            <p className={`text-xl font-bold tabular-nums ${slowCount > 0 ? "text-amber-600 dark:text-amber-400" : ""}`}>{slowCount}</p>
          </div>
        </div>
      </div>

      {/* 메서드 분포 */}
      {Object.keys(methodCounts).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(methodCounts).sort(([, a], [, b]) => b - a).map(([m, cnt]) => {
            const st = METHOD_STYLE[m];
            return (
              <span key={m} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium ${st?.bg ?? "bg-muted"} ${st?.text ?? "text-foreground"}`}>
                <span className="opacity-60">{st?.short ?? m}</span>
                <span className="font-mono font-bold">{cnt.toLocaleString()}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* 필터 바 */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="경로, 사용자, IP 검색…" value={search} onChange={e => setSearch(e.target.value)} className="pl-9" data-testid="input-search-logs" />
        </div>
        <Select value={methodFilter} onValueChange={setMethodFilter}>
          <SelectTrigger className="w-32" data-testid="select-method-filter">
            <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="GET">조회 GET</SelectItem>
            <SelectItem value="POST">등록 POST</SelectItem>
            <SelectItem value="PUT">수정 PUT</SelectItem>
            <SelectItem value="PATCH">수정 PATCH</SelectItem>
            <SelectItem value="DELETE">삭제 DELETE</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36" data-testid="select-status-filter"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            <SelectItem value="2xx">2xx 성공</SelectItem>
            <SelectItem value="4xx">4xx 클라 오류</SelectItem>
            <SelectItem value="5xx">5xx 서버 오류</SelectItem>
          </SelectContent>
        </Select>
        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="100">100건</SelectItem>
            <SelectItem value="200">200건</SelectItem>
            <SelectItem value="500">500건</SelectItem>
            <SelectItem value="1000">1000건</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground whitespace-nowrap">{filtered.length.toLocaleString()} / {total.toLocaleString()}건</span>
      </div>

      {/* 테이블 */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        {/* sticky 헤더 */}
        <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur border-b grid grid-cols-[7rem_5rem_1fr_5rem_8rem_6rem] gap-0 px-4 py-2.5 text-xs font-medium text-muted-foreground">
          <span>시간</span>
          <span>메서드</span>
          <span>API 경로</span>
          <span className="text-center">상태</span>
          <span className="text-right">응답시간</span>
          <span>사용자</span>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            <RefreshCw className="h-5 w-5 animate-spin mr-2" />로딩 중…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-20 text-center text-sm text-muted-foreground">
            {total === 0 ? "아직 수집된 API 로그가 없습니다." : "검색 결과가 없습니다"}
          </div>
        ) : (
          <div className="divide-y">
            {filtered.map(log => {
              const { date, time } = formatTs(log.timestamp);
              const mst = METHOD_STYLE[log.method];
              const label = getLabel(log.path);
              const isErr = log.status >= 400;

              return (
                <div
                  key={log.id}
                  className={`grid grid-cols-[7rem_5rem_1fr_5rem_8rem_6rem] gap-0 px-4 py-3 items-center text-sm transition-colors hover:bg-muted/30 ${
                    log.status >= 500 ? "bg-red-50/40 dark:bg-red-950/10" : log.status >= 400 ? "bg-amber-50/40 dark:bg-amber-950/10" : ""
                  }`}
                >
                  {/* 시간 */}
                  <div className="font-mono text-[11px] text-muted-foreground leading-snug">
                    <div className="text-foreground/60 font-medium">{date}</div>
                    <div>{time}</div>
                  </div>

                  {/* 메서드 */}
                  <div>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold ${mst?.bg ?? "bg-muted"} ${mst?.text ?? ""}`}>
                      {mst?.short ?? log.method}
                    </span>
                  </div>

                  {/* 경로 */}
                  <div className="min-w-0 pr-4">
                    {label && <p className="font-medium text-xs text-foreground truncate">{label}</p>}
                    <p className={`font-mono text-[10px] text-muted-foreground/60 truncate ${!label ? "text-[11px] text-muted-foreground" : ""}`} title={log.path}>{log.path}</p>
                  </div>

                  {/* 상태 */}
                  <div className="text-center">
                    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-bold ${statusStyle(log.status)}`}>
                      {log.status}
                    </span>
                  </div>

                  {/* 응답시간 */}
                  <div className="text-right pr-2">
                    <DurationBar ms={log.duration} />
                  </div>

                  {/* 사용자 */}
                  <div className="text-xs text-muted-foreground truncate">
                    {log.username ?? <span className="text-muted-foreground/30">—</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
