import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, RefreshCw, Search, Clock, User, Server, Filter, Globe } from "lucide-react";

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

const METHOD_COLORS: Record<string, string> = {
  GET:    "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  POST:   "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300",
  PUT:    "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300",
  PATCH:  "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  DELETE: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
};

const METHOD_KO: Record<string, string> = {
  GET:    "조회",
  POST:   "등록",
  PUT:    "수정",
  PATCH:  "수정",
  DELETE: "삭제",
};

// URL 경로 → 메뉴 한국어 이름
const ROUTE_LABELS: Record<string, string> = {
  "/":                        "대시보드",
  "/dashboard":               "대시보드",
  "/notices":                 "공지사항",
  "/digital-board":           "디지털 보드",
  "/rules":                   "안전 규정",
  "/accidents":               "사고 현황",
  "/equipment-status":        "장비 현황",
  "/equipment":               "안전 장비",
  "/education":               "교육 자료",
  "/education-logs":          "교육일지",
  "/education-management":    "교육 업무 관리",
  "/inspections":             "점검 일지",
  "/risk-assessment":         "위험성평가",
  "/msds":                    "MSDS",
  "/musculoskeletal":         "근골격계",
  "/vehicles":                "차량 관리",
  "/vehicle-logs":            "차량 일지",
  "/access":                  "출입신청",
  "/attendance":              "입회 관리",
  "/safety-cost-budget":      "산업안전보건관리비",
  "/admin/users":             "사용자 관리",
  "/admin/security":          "보안 감사 로그",
  "/admin/api-logs":          "API 호출 내역",
  "/admin/music":             "음악 관리",
  "/admin/signatures":        "서명 관리 로그",
  "/admin/backup":            "데이터 백업",
  "/admin/card-news":         "음주운전 카드뉴스",
  "/admin/fuel-costs":        "유류비 관리",
  "/work-plan":               "하도급 작업계획",
};

// API 경로 → 한국어 설명 (접두어 매핑, 긴 것 우선)
const API_PATH_LABELS: Array<[string, string]> = [
  ["/api/admin/api-logs",                 "API 호출 내역"],
  ["/api/admin/signatures",               "서명 관리"],
  ["/api/admin/backup",                   "데이터 백업"],
  ["/api/admin/card-news",                "음주운전 카드뉴스"],
  ["/api/admin/fuel-costs",               "유류비 관리"],
  ["/api/auto-email",                     "자동 이메일"],
  ["/api/auth/permissions",               "권한 확인"],
  ["/api/auth/user-role",                 "역할 확인"],
  ["/api/auth/user",                      "사용자 인증"],
  ["/api/auth",                           "인증"],
  ["/api/accident-reports",               "사고경위서"],
  ["/api/accidents/stats",                "사고 통계"],
  ["/api/accidents",                      "사고 현황"],
  ["/api/attendance",                     "입회 관리"],
  ["/api/access",                         "출입신청"],
  ["/api/chatbot",                        "AI 챗봇"],
  ["/api/chemicals",                      "MSDS"],
  ["/api/education-sessions",             "교육일지"],
  ["/api/education-signatures",           "교육 서명"],
  ["/api/lock-status",                    "잠금 상태"],
  ["/api/musculoskeletal-assessments",    "근골격계"],
  ["/api/music/schedule",                 "음악 스케줄"],
  ["/api/music",                          "음악 관리"],
  ["/api/new-equipment-requests",         "새 장비 요청"],
  ["/api/notices",                        "공지사항"],
  ["/api/risk-assessments",               "위험성평가"],
  ["/api/safety-cost-records",            "산업안전보건관리비"],
  ["/api/safety-cost-tax-invoices",       "세금계산서"],
  ["/api/security-logs",                  "보안 감사 로그"],
  ["/api/settings/pinned-notice",         "고정 공지 설정"],
  ["/api/settings/role-presets",          "역할 프리셋"],
  ["/api/settings/lock",                  "잠금 설정"],
  ["/api/settings",                       "설정"],
  ["/api/teams",                          "팀 안전점수"],
  ["/api/traffic-fines",                  "교통 과태료"],
  ["/api/users",                          "사용자 관리"],
  ["/api/vehicle-logs",                   "차량 일지"],
  ["/api/vehicles",                       "차량 관리"],
  ["/api/weather",                        "날씨 정보"],
  ["/api/work-plans",                     "하도급 작업계획"],
];

function getApiLabel(apiPath: string): string | null {
  // 쿼리스트링 제거
  const base = apiPath.split("?")[0];
  const match = API_PATH_LABELS.find(([prefix]) => base === prefix || base.startsWith(prefix + "/"));
  return match ? match[1] : null;
}

function getRouteLabel(referer: string | null): string | null {
  if (!referer) return null;
  // 정확 매핑 우선, 그 다음 접두어 매핑
  if (ROUTE_LABELS[referer]) return ROUTE_LABELS[referer];
  const match = Object.keys(ROUTE_LABELS)
    .filter(k => k !== "/" && referer.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return match ? ROUTE_LABELS[match] : null;
}

function statusColor(status: number) {
  if (status < 300) return "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300";
  if (status < 400) return "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300";
  if (status < 500) return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300";
  return "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300";
}

function durationColor(ms: number) {
  if (ms < 100) return "text-green-600 dark:text-green-400";
  if (ms < 500) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function formatTime(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  } catch { return ts; }
}

function formatDate(ts: string) {
  try {
    const d = new Date(ts);
    return d.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" });
  } catch { return ""; }
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
      return (
        log.path.toLowerCase().includes(s) ||
        (log.username || "").toLowerCase().includes(s) ||
        (log.ip || "").includes(s)
      );
    }
    return true;
  });

  const stats = {
    total: logs.length,
    errors: logs.filter(l => l.status >= 400).length,
    avgDuration: logs.length ? Math.round(logs.reduce((a, l) => a + l.duration, 0) / logs.length) : 0,
    slowCount: logs.filter(l => l.duration >= 500).length,
  };

  const methodCounts = logs.reduce<Record<string, number>>((acc, l) => {
    acc[l.method] = (acc[l.method] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            API 호출 내역
          </h1>
          <p className="text-sm text-muted-foreground mt-1">서버로 들어오는 API 요청 실시간 모니터링 (최근 1,000건)</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching} className="gap-2">
          <RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />
          새로고침
        </Button>
      </div>

      {/* 요약 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg"><Server className="h-4 w-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">총 요청 수</p>
                <p className="text-2xl font-bold">{stats.total.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg"><Activity className="h-4 w-4 text-red-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">오류 (4xx/5xx)</p>
                <p className="text-2xl font-bold text-red-600">{stats.errors}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg"><Clock className="h-4 w-4 text-green-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">평균 응답시간</p>
                <p className="text-2xl font-bold">{stats.avgDuration}<span className="text-sm font-normal ml-1">ms</span></p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg"><Clock className="h-4 w-4 text-yellow-600" /></div>
              <div>
                <p className="text-xs text-muted-foreground">느린 요청 (≥500ms)</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.slowCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 메서드별 현황 */}
      {Object.keys(methodCounts).length > 0 && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(methodCounts).sort(([,a],[,b]) => b-a).map(([method, count]) => (
            <Badge key={method} className={`${METHOD_COLORS[method] || "bg-gray-100 text-gray-700"} gap-1.5 text-xs font-semibold`}>
              {METHOD_KO[method] || method}({method}) <span className="opacity-70">{count}건</span>
            </Badge>
          ))}
        </div>
      )}

      {/* 필터 */}
      <Card>
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="경로, 사용자, IP 검색..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-9"
                data-testid="input-search-logs"
              />
            </div>
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-28" data-testid="select-method-filter">
                <Filter className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 메서드</SelectItem>
                <SelectItem value="GET">조회 (GET)</SelectItem>
                <SelectItem value="POST">등록 (POST)</SelectItem>
                <SelectItem value="PUT">수정 (PUT)</SelectItem>
                <SelectItem value="PATCH">수정 (PATCH)</SelectItem>
                <SelectItem value="DELETE">삭제 (DELETE)</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-28" data-testid="select-status-filter">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                <SelectItem value="2xx">2xx 성공</SelectItem>
                <SelectItem value="4xx">4xx 클라이언트 오류</SelectItem>
                <SelectItem value="5xx">5xx 서버 오류</SelectItem>
              </SelectContent>
            </Select>
            <Select value={limit} onValueChange={setLimit}>
              <SelectTrigger className="w-24">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="100">100건</SelectItem>
                <SelectItem value="200">200건</SelectItem>
                <SelectItem value="500">500건</SelectItem>
                <SelectItem value="1000">1000건</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground ml-auto">
              {filtered.length.toLocaleString()}건 표시 / 전체 {logs.length.toLocaleString()}건
            </span>
          </div>
        </CardContent>
      </Card>

      {/* 로그 테이블 */}
      <Card>
        <CardHeader className="pb-0 pt-4 px-4">
          <CardTitle className="text-sm text-muted-foreground">최신순 정렬 · 10초마다 자동 갱신</CardTitle>
        </CardHeader>
        <CardContent className="p-0 mt-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              로딩 중...
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              {logs.length === 0 ? "아직 수집된 API 로그가 없습니다. 앱을 사용하면 여기에 표시됩니다." : "검색 결과가 없습니다"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-28 text-xs">시간</TableHead>
                    <TableHead className="w-16 text-xs">메서드</TableHead>
                    <TableHead className="text-xs">API 경로</TableHead>
                    <TableHead className="w-40 text-xs">호출 페이지</TableHead>
                    <TableHead className="w-16 text-center text-xs">상태</TableHead>
                    <TableHead className="w-24 text-right text-xs">응답시간</TableHead>
                    <TableHead className="w-24 text-xs">사용자</TableHead>
                    <TableHead className="w-28 text-xs">IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(log => (
                    <TableRow key={log.id} className={`text-xs ${log.status >= 500 ? "bg-red-50/50 dark:bg-red-950/10" : log.status >= 400 ? "bg-yellow-50/50 dark:bg-yellow-950/10" : ""}`}>
                      <TableCell className="font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                        <div>{formatDate(log.timestamp)}</div>
                        <div>{formatTime(log.timestamp)}</div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-0.5">
                          <Badge className={`${METHOD_COLORS[log.method] || "bg-gray-100 text-gray-700"} text-[10px] font-bold px-1.5 py-0`}>
                            {METHOD_KO[log.method] || log.method}
                          </Badge>
                          <span className="text-[9px] text-muted-foreground/60 font-mono pl-0.5">{log.method}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] max-w-[260px]">
                        {(() => {
                          const label = getApiLabel(log.path);
                          return (
                            <div className="flex flex-col gap-0.5" title={log.path}>
                              {label && (
                                <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
                              )}
                              <span className="font-mono text-[10px] text-muted-foreground/70 truncate">{log.path}</span>
                            </div>
                          );
                        })()}
                      </TableCell>
                      <TableCell className="text-[11px] max-w-[160px]">
                        {log.referer ? (() => {
                          const label = getRouteLabel(log.referer);
                          return (
                            <div className="flex flex-col gap-0.5" title={log.referer}>
                              {label ? (
                                <span className="font-medium text-slate-700 dark:text-slate-300">{label}</span>
                              ) : null}
                              <div className="flex items-center gap-1 text-muted-foreground/70">
                                <Globe className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate font-mono text-[10px]">{log.referer}</span>
                              </div>
                            </div>
                          );
                        })() : (
                          <span className="text-muted-foreground/40">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge className={`${statusColor(log.status)} text-[10px] font-bold px-1.5 py-0`}>
                          {log.status}
                        </Badge>
                      </TableCell>
                      <TableCell className={`text-right font-mono font-semibold ${durationColor(log.duration)}`}>
                        {log.duration}ms
                      </TableCell>
                      <TableCell>
                        {log.username ? (
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3 text-muted-foreground shrink-0" />
                            <span className="truncate max-w-[80px]" title={log.username}>{log.username}</span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-muted-foreground">{log.ip || "-"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
