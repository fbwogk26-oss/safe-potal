import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Shield, Search, RefreshCw, AlertTriangle, CheckCircle, XCircle, Lock, Unlock, Key, LogIn, LogOut } from "lucide-react";

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

const EVENT_TYPE_LABELS: Record<string, { label: string; icon: typeof Shield; color: string }> = {
  LOGIN_SUCCESS: { label: "로그인 성공", icon: LogIn, color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  LOGIN_FAILED: { label: "로그인 실패", icon: XCircle, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  LOGIN_BLOCKED: { label: "로그인 차단", icon: Lock, color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  ACCOUNT_LOCKED: { label: "계정 잠금", icon: Lock, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  ACCOUNT_UNLOCKED: { label: "계정 잠금해제", icon: Unlock, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  LOGOUT: { label: "로그아웃", icon: LogOut, color: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200" },
  PASSWORD_CHANGED: { label: "비밀번호 변경", icon: Key, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  PASSWORD_FORCE_CHANGED: { label: "초기 비밀번호 변경", icon: Key, color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  PASSWORD_CHANGE_FAILED: { label: "비밀번호 변경 실패", icon: XCircle, color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200" },
  PASSWORD_ADMIN_RESET: { label: "관리자 비밀번호 초기화", icon: Key, color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
};

export default function SecurityLogs() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  const { data: logs = [], isLoading, refetch } = useQuery<SecurityLog[]>({
    queryKey: ["/api/security-logs", { limit: 500 }],
  });

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      !searchTerm ||
      (log.username || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.ipAddress || "").includes(searchTerm) ||
      (log.details || "").toLowerCase().includes(searchTerm.toLowerCase());

    const matchesType =
      filterType === "all" ||
      (filterType === "failed" && !log.success) ||
      (filterType === "success" && log.success) ||
      log.eventType === filterType;

    return matchesSearch && matchesType;
  });

  const stats = {
    total: logs.length,
    failed: logs.filter((l) => !l.success).length,
    locked: logs.filter((l) => l.eventType === "ACCOUNT_LOCKED").length,
    logins: logs.filter((l) => l.eventType === "LOGIN_SUCCESS").length,
  };

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-xl font-bold">보안 감사 로그</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-1.5" data-testid="button-refresh-logs">
          <RefreshCw className="w-4 h-4" />
          새로고침
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.total}</p>
            <p className="text-xs text-muted-foreground">전체 이벤트</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-green-600">{stats.logins}</p>
            <p className="text-xs text-muted-foreground">로그인 성공</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-red-600">{stats.failed}</p>
            <p className="text-xs text-muted-foreground">실패 이벤트</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-orange-600">{stats.locked}</p>
            <p className="text-xs text-muted-foreground">계정 잠금</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="사용자명, IP, 상세내용 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-logs"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-full sm:w-48" data-testid="select-filter-type">
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
          </SelectContent>
        </Select>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">
            로그 목록 ({filteredLogs.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary" />
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Shield className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p>보안 로그가 없습니다</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[600px] overflow-y-auto">
              {filteredLogs.map((log) => {
                const eventInfo = EVENT_TYPE_LABELS[log.eventType] || {
                  label: log.eventType,
                  icon: Shield,
                  color: "bg-gray-100 text-gray-800",
                };
                const Icon = eventInfo.icon;
                const time = new Date(log.createdAt).toLocaleString("ko-KR", {
                  month: "2-digit",
                  day: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                });

                return (
                  <div
                    key={log.id}
                    className={`flex items-center gap-3 p-2.5 rounded-lg border text-sm ${
                      !log.success ? "border-red-200 bg-red-50/50 dark:border-red-900 dark:bg-red-950/30" : "border-border"
                    }`}
                    data-testid={`security-log-${log.id}`}
                  >
                    <div className={`p-1.5 rounded-md ${log.success ? "bg-green-100 dark:bg-green-900" : "bg-red-100 dark:bg-red-900"}`}>
                      {log.success ? (
                        <CheckCircle className="w-3.5 h-3.5 text-green-600 dark:text-green-400" />
                      ) : (
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 dark:text-red-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="secondary" className={`text-xs ${eventInfo.color}`}>
                          <Icon className="w-3 h-3 mr-1" />
                          {eventInfo.label}
                        </Badge>
                        {log.username && (
                          <span className="font-medium text-xs">{log.username}</span>
                        )}
                      </div>
                      {log.details && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{log.details}</p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-muted-foreground">{time}</p>
                      {log.ipAddress && (
                        <p className="text-[10px] text-muted-foreground/70 font-mono">{log.ipAddress}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
