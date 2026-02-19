import { Bell, LogOut, Users, Menu, LayoutDashboard, ShieldCheck, GraduationCap, DoorOpen, ShoppingCart, MonitorPlay, ClipboardCheck, BookOpen, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNotices } from "@/hooks/use-notices";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

const NAV_ITEMS = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "안전수칙", href: "/rules", icon: ShieldCheck },
  { label: "공지/알림", href: "/notices", icon: Bell },
  { label: "안전교육", href: "/education", icon: GraduationCap },
  { label: "교육일지", href: "/education-logs", icon: FileText },
  { label: "안전점검", href: "/inspections", icon: ClipboardCheck },
  { label: "차량운행일지", href: "/vehicle-logs", icon: BookOpen },
  { label: "안전용품신청", href: "/equipment", icon: ShoppingCart },
  { label: "출입신청", href: "/access", icon: DoorOpen },
  { label: "전자게시판", href: "/digital-board", icon: MonitorPlay },
];

export function Topbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [location] = useLocation();
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
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0"
              onClick={() => setMobileMenuOpen(true)}
              data-testid="button-mobile-menu"
            >
              <Menu className="w-5 h-5" />
            </Button>
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

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">메뉴</SheetTitle>
          <div className="p-4 border-b border-border/50">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[#0066CC] flex flex-col items-center justify-center text-white shadow-lg">
                <span className="text-[10px] font-bold leading-none tracking-tight">kt</span>
                <span className="text-[7px] font-semibold leading-none tracking-tight">MOS</span>
              </div>
              <div>
                <h2 className="font-bold text-base leading-tight">종합안전포털시스템</h2>
                <p className="text-xs text-muted-foreground">Safety Portal System</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 px-3 py-2">
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm",
                    location === item.href
                      ? "bg-primary text-primary-foreground shadow-md"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                  data-testid={`mobile-nav-${item.href.replace("/", "") || "home"}`}
                >
                  <item.icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </nav>
          <div className="p-3 border-t border-border/50 text-xs text-center text-muted-foreground">
            v3.0.0
          </div>
        </SheetContent>
      </Sheet>
    </header>
  );
}
