import { Bell, LogOut, Users, Menu, LayoutDashboard, ShieldCheck, Shield, HeartPulse, GraduationCap, DoorOpen, ShoppingCart, MonitorPlay, ClipboardCheck, FileText, KeyRound, Eye, EyeOff, AlertTriangle, ShieldAlert, FlaskConical, ChevronDown, ScrollText, CloudRain } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNotices } from "@/hooks/use-notices";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";

type MobileNavItem = { label: string; href: string; icon: any; adminOnly?: boolean };
type MobileNavGroup = { label: string; icon: any; children: MobileNavItem[]; adminOnly?: boolean };
type MobileNavEntry = MobileNavItem | MobileNavGroup;

function isMobileGroup(entry: MobileNavEntry): entry is MobileNavGroup {
  return "children" in entry;
}

const MOBILE_NAV_ITEMS: MobileNavEntry[] = [
  { label: "공지/알림", href: "/notices", icon: Bell },
  { label: "전자게시판", href: "/digital-board", icon: MonitorPlay },
  { label: "안전수칙", href: "/rules", icon: ShieldCheck },
  {
    label: "안전관리",
    icon: Shield,
    children: [
      { label: "안전점수", href: "/safety-scores", icon: LayoutDashboard },
      { label: "사고보고/통계", href: "/accidents", icon: AlertTriangle },
      { label: "안전보호구 현황", href: "/equipment/status", icon: ShieldCheck },
      { label: "안전용품 신청", href: "/equipment", icon: ShoppingCart },
      { label: "안전교육 자료", href: "/education", icon: GraduationCap },
      { label: "교육일지", href: "/education-logs", icon: FileText },
      { label: "안전점검", href: "/inspections", icon: ClipboardCheck },
      { label: "위험성평가", href: "/risk-assessment", icon: ShieldAlert },
    ],
  },
  {
    label: "보건관리",
    icon: HeartPulse,
    children: [
      { label: "MSDS검색", href: "/msds", icon: FlaskConical },
      { label: "날씨 안전메시지", href: "/weather-safety", icon: CloudRain },
    ],
  },
  { label: "출입신청", href: "/access", icon: DoorOpen },
  {
    label: "시스템 관리",
    icon: Shield,
    adminOnly: true,
    children: [
      { label: "사용자 관리", href: "/admin/users", icon: Users },
      { label: "보안 감사 로그", href: "/admin/security", icon: ScrollText },
    ],
  },
];

export function Topbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileOpenGroups, setMobileOpenGroups] = useState<Record<string, boolean>>({});
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const { toast } = useToast();
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

  const resetPwDialog = () => {
    setCurrentPw(""); setNewPw(""); setConfirmPw(""); setPwError(""); setShowPw(false);
  };

  const handleChangePassword = async () => {
    setPwError("");
    if (!currentPw || !newPw || !confirmPw) {
      setPwError("모든 항목을 입력해주세요"); return;
    }
    if (newPw.length < 4) {
      setPwError("새 비밀번호는 4자 이상이어야 합니다"); return;
    }
    if (newPw !== confirmPw) {
      setPwError("새 비밀번호가 일치하지 않습니다"); return;
    }
    try {
      setPwSubmitting(true);
      const res = await apiRequest("POST", "/api/auth/change-password", { currentPassword: currentPw, newPassword: newPw });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      toast({ title: "비밀번호가 변경되었습니다" });
      setPwDialogOpen(false); resetPwDialog();
    } catch (err: any) {
      setPwError(err.message || "비밀번호 변경에 실패했습니다");
    } finally {
      setPwSubmitting(false);
    }
  };

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
                        <span className="text-sm font-medium max-w-[100px] truncate">
                          {user.name || user.username || "사용자"}
                        </span>
                        {isAdmin && (
                          <span className="px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground font-bold">
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
                      <DropdownMenuItem
                        onClick={() => { setPwDialogOpen(true); resetPwDialog(); }}
                        className="flex items-center gap-2 cursor-pointer"
                      >
                        <KeyRound className="w-4 h-4" />
                        비밀번호 변경
                      </DropdownMenuItem>
                      {isAdmin && (
                        <>
                          <DropdownMenuItem asChild>
                            <Link href="/admin/users" className="flex items-center gap-2 cursor-pointer">
                              <Users className="w-4 h-4" />
                              사용자 관리
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link href="/admin/security" className="flex items-center gap-2 cursor-pointer">
                              <Shield className="w-4 h-4" />
                              보안 감사 로그
                            </Link>
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuSeparator />
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

        <div className="bg-primary/5 border-t border-primary/10 overflow-hidden h-8 flex items-center relative">
          <div className="absolute left-0 z-10 px-2.5 h-full flex items-center bg-primary/10 border-r border-primary/15">
            <span className="text-[11px] font-bold text-primary uppercase tracking-wider whitespace-nowrap">📢 공지</span>
          </div>
          <div className="w-full overflow-hidden pl-[72px]">
            <div className="animate-ticker pause-hover px-4 text-[13px] font-medium text-foreground/75 flex items-center gap-10">
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
          <nav className="flex-1 overflow-y-auto px-3 py-2">
            <div className="flex flex-col gap-0.5">
              {MOBILE_NAV_ITEMS.filter((entry) => !entry.adminOnly || isAdmin).map((entry) => {
                if (isMobileGroup(entry)) {
                  const isOpen = mobileOpenGroups[entry.label] ?? entry.children.some(c => location === c.href);
                  const childActive = entry.children.some(c => location === c.href);
                  return (
                    <div key={entry.label}>
                      <button
                        onClick={() => setMobileOpenGroups(prev => ({ ...prev, [entry.label]: !isOpen }))}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm w-full",
                          childActive ? "text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        data-testid={`mobile-nav-group-${entry.label}`}
                      >
                        <entry.icon className="w-4 h-4" />
                        <span className="flex-1 text-left">{entry.label}</span>
                        <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", isOpen && "rotate-180")} />
                      </button>
                      <div className={cn("overflow-hidden transition-all duration-200", isOpen ? "max-h-96 opacity-100" : "max-h-0 opacity-0")}>
                        <div className="ml-4 pl-3 border-l border-border/40 flex flex-col gap-0.5 mt-0.5 pb-1">
                          {entry.children.map((child) => (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setMobileMenuOpen(false)}
                              className={cn(
                                "flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-200 font-medium text-[13px]",
                                location === child.href
                                  ? "bg-primary text-primary-foreground shadow-md"
                                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
                              )}
                              data-testid={`mobile-nav-${child.href.replace("/", "")}`}
                            >
                              <child.icon className="w-3.5 h-3.5" />
                              <span>{child.label}</span>
                            </Link>
                          ))}
                        </div>
                      </div>
                    </div>
                  );
                }
                return (
                  <Link
                    key={entry.href}
                    href={entry.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm",
                      location === entry.href
                        ? "bg-primary text-primary-foreground shadow-md"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    )}
                    data-testid={`mobile-nav-${entry.href.replace("/", "") || "home"}`}
                  >
                    <entry.icon className="w-4 h-4" />
                    <span>{entry.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>
          <div className="p-3 border-t border-border/50 text-xs text-center text-muted-foreground">
            v3.0.0
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={pwDialogOpen} onOpenChange={(open) => { if (!open) { setPwDialogOpen(false); resetPwDialog(); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>비밀번호 변경</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>현재 비밀번호</Label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={currentPw}
                  onChange={(e) => setCurrentPw(e.target.value)}
                  placeholder="현재 비밀번호"
                  data-testid="input-current-password"
                />
                <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 -translate-y-1/2 h-8 w-8" onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>새 비밀번호</Label>
              <Input
                type={showPw ? "text" : "password"}
                value={newPw}
                onChange={(e) => setNewPw(e.target.value)}
                placeholder="새 비밀번호 (4자 이상)"
                data-testid="input-new-pw"
              />
            </div>
            <div className="space-y-2">
              <Label>새 비밀번호 확인</Label>
              <Input
                type={showPw ? "text" : "password"}
                value={confirmPw}
                onChange={(e) => setConfirmPw(e.target.value)}
                placeholder="비밀번호 확인"
                data-testid="input-confirm-pw"
              />
            </div>
            {pwError && (
              <p className="text-sm text-destructive text-center" data-testid="text-pw-error">{pwError}</p>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setPwDialogOpen(false); resetPwDialog(); }}>취소</Button>
            <Button onClick={handleChangePassword} disabled={pwSubmitting} data-testid="button-submit-pw">
              {pwSubmitting ? "변경 중..." : "변경"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
