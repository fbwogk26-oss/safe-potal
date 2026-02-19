import { Bell, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotices } from "@/hooks/use-notices";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function Topbar() {
  const { data: notices } = useNotices("notice");
  const { data: pinnedData } = useQuery<{ pinnedNoticeId: number | null }>({
    queryKey: ["/api/settings/pinned-notice"],
  });
  const { user, isLoading: authLoading, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/user-role"],
    enabled: isAuthenticated,
  });
  const isAdmin = roleData?.role === "admin";
  
  const tickerNotice = useMemo(() => {
    if (!notices || notices.length === 0) return null;
    const pinnedNoticeId = pinnedData?.pinnedNoticeId;
    
    if (pinnedNoticeId) {
      const pinned = notices.find(n => n.id === pinnedNoticeId);
      if (pinned) return pinned;
    }
    
    return [...notices].sort((a, b) => b.id - a.id)[0] || null;
  }, [notices, pinnedData]);

  return (
    <header className="sticky top-0 z-50 bg-background border-b shadow-sm">
      <div className="flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/">
              <div className="flex items-center gap-2.5 cursor-pointer hover:opacity-80 transition-opacity">
                <div className="w-9 h-9 rounded-lg bg-[#0066CC] flex flex-col items-center justify-center shadow-sm text-white">
                  <span className="text-[9px] font-bold leading-none tracking-tight">kt</span>
                  <span className="text-[7px] font-semibold leading-none tracking-tight">MOS</span>
                </div>
                <div>
                  <h1 className="text-sm font-bold leading-tight text-foreground">종합안전포털시스템</h1>
                  <p className="text-[10px] text-muted-foreground -mt-0.5">Safety Portal System</p>
                </div>
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {!authLoading && (
              <>
                {isAuthenticated && user ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm" className="gap-2 px-2" data-testid="button-user-menu">
                        <Avatar className="h-7 w-7">
                          <AvatarFallback className="bg-primary/10 text-primary text-xs">
                            {(user.name?.[0] || user.username?.[0] || "U").toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <span className="hidden sm:inline text-sm font-medium max-w-[100px] truncate">
                          {user.name || user.username || "사용자"}
                        </span>
                        {isAdmin && (
                          <span className="hidden sm:inline px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground font-bold">
                            관리자
                          </span>
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <div className="px-2 py-1.5 text-sm">
                        <p className="font-medium">{user.name || user.username}</p>
                        <p className="text-xs text-muted-foreground">@{user.username}</p>
                      </div>
                      <DropdownMenuSeparator />
                      {isAdmin && (
                        <>
                          <DropdownMenuItem asChild>
                            <Link href="/admin/users" className="flex items-center gap-2 cursor-pointer">
                              <Users className="w-4 h-4" />
                              사용자 관리
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                        </>
                      )}
                      <DropdownMenuItem 
                        onClick={() => logout()}
                        disabled={isLoggingOut}
                        className="flex items-center gap-2 cursor-pointer text-red-600"
                      >
                        <LogOut className="w-4 h-4" />
                        {isLoggingOut ? "로그아웃 중..." : "로그아웃"}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : null}
              </>
            )}
          </div>
        </div>

        <div className="bg-primary/5 border-y border-primary/10 overflow-hidden h-9 flex items-center relative">
          <div className="absolute left-0 z-10 px-3 h-full flex items-center bg-background/50 backdrop-blur-sm text-xs font-bold text-primary uppercase tracking-wider">
            공지
          </div>
          <div className="w-full overflow-hidden pl-14">
            <div className="animate-ticker pause-hover px-4 text-sm font-medium text-foreground/80 flex items-center gap-10">
              {tickerNotice ? (
                 <>
                   <span>{tickerNotice.content}</span>
                   <span className="opacity-50">•</span>
                   <span>{tickerNotice.content}</span>
                   <span className="opacity-50">•</span>
                   <span>{tickerNotice.content}</span>
                 </>
              ) : (
                <span>시스템 정상 작동 중. 현재 활성화된 긴급 알림이 없습니다.</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
