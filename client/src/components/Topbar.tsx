import { Bell, LogOut, Users, Menu, LayoutDashboard, ShieldCheck, Shield, HeartPulse, GraduationCap, DoorOpen, ShoppingCart, MonitorPlay, ClipboardCheck, FileText, KeyRound, Eye, EyeOff, AlertTriangle, ShieldAlert, FlaskConical, ChevronDown, ScrollText, Bone, Home, ReceiptText, Briefcase, CalendarCheck, Music2, Fuel, FileSignature, Car } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
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
  { label: "홈", href: "/", icon: Home },
  { label: "공지/알림", href: "/notices", icon: Bell },
  { label: "전자게시판", href: "/digital-board", icon: MonitorPlay },
  { label: "안전수칙", href: "/rules", icon: ShieldCheck },
  {
    label: "안전관리",
    icon: Shield,
    children: [
      { label: "안전성평가제", href: "/safety-scores", icon: LayoutDashboard },
      { label: "사고보고/통계", href: "/accidents", icon: AlertTriangle },
      { label: "아차사고 관리", href: "/near-miss", icon: AlertTriangle },
      { label: "위험성평가", href: "/risk-assessment", icon: ShieldAlert },
      { label: "안전점검", href: "/inspections", icon: ClipboardCheck },
      { label: "교육 관리", href: "/education-logs", icon: GraduationCap },
      { label: "보호구 현황", href: "/equipment/status", icon: ShieldCheck },
      { label: "안전용품 신청", href: "/equipment", icon: ShoppingCart },
      { label: "출입신청", href: "/access", icon: DoorOpen },
    ],
  },
  {
    label: "보건관리",
    icon: HeartPulse,
    children: [
      { label: "MSDS검색", href: "/msds", icon: FlaskConical },
      { label: "근골격계질환", href: "/musculoskeletal", icon: Bone },
    ],
  },
  {
    label: "하도급관리",
    icon: Briefcase,
    children: [
      { label: "작업계획", href: "/work-plan", icon: CalendarCheck },
    ],
  },
  {
    label: "차량관리",
    icon: Car,
    children: [
      { label: "차량 관리", href: "/admin/fuel-costs", icon: Fuel },
      { label: "과태료 현황", href: "/traffic-fines", icon: ReceiptText },
    ],
  },
  {
    label: "시스템 관리",
    icon: Shield,
    adminOnly: true,
    children: [
      { label: "사용자 관리", href: "/admin/users", icon: Users },
      { label: "보안 감사 로그", href: "/admin/security", icon: ScrollText },
      { label: "음악 관리", href: "/admin/music", icon: Music2 },
      { label: "서명 관리 로그", href: "/admin/signatures", icon: FileSignature },
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
  const { user, isLoading: authLoading, isAuthenticated, logout, isLoggingOut } = useAuth();
  const { data: roleData } = useQuery<{ role: string }>({
    queryKey: ["/api/auth/user-role"],
    enabled: isAuthenticated,
  });
  const isAdmin = roleData?.role === "admin";

  const { data: unreadData } = useQuery<{ count: number }>({
    queryKey: ["/api/new-equipment-requests/unread-count"],
    enabled: isAuthenticated && isAdmin,
    refetchInterval: 60000,
  });
  const unreadCount = unreadData?.count ?? 0;

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

  return (
    <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-sm border-b border-border/70 shadow-sm">
      <div className="flex items-center px-4 py-2.5 gap-3">
        {/* Mobile menu button */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden shrink-0"
          onClick={() => setMobileMenuOpen(true)}
          data-testid="button-mobile-menu"
        >
          <Menu className="w-5 h-5" />
        </Button>

        {/* Logo */}
        <Link href="/">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="w-8 h-8 rounded-lg bg-[#0066CC] flex flex-col items-center justify-center shadow-sm text-white shrink-0">
              <span className="text-[9px] font-bold leading-none tracking-tight">kt</span>
              <span className="text-[7px] font-semibold leading-none tracking-tight">MOS</span>
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight text-foreground truncate max-w-[130px] sm:max-w-none">종합안전포털</h1>
              <p className="text-[10px] text-muted-foreground -mt-0.5 hidden sm:block">Safety Portal System</p>
            </div>
          </div>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* User button on right */}
        {!authLoading && isAuthenticated && user && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2 px-2 h-9" data-testid="button-user-menu">
                <Avatar className="h-7 w-7">
                  <AvatarFallback className="bg-primary/10 text-primary text-xs">
                    {(user.name?.[0] || user.username?.[0] || "U").toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm font-medium max-w-[80px] truncate hidden sm:inline">
                  {user.name || user.username || "사용자"}
                </span>
                {isAdmin && (
                  <span className="relative px-1.5 py-0.5 text-[10px] rounded bg-primary text-primary-foreground font-bold hidden sm:inline">
                    관리자
                    {unreadCount > 0 && (
                      <span className="absolute -top-2 -right-2 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    )}
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
          )}
      </div>

      <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
        <SheetContent side="left" className="w-[224px] p-0 flex flex-col bg-card/90">
          <SheetTitle className="sr-only">메뉴</SheetTitle>
          <div className="px-4 py-3.5 border-b border-border/50">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#0066CC] flex flex-col items-center justify-center text-white shadow-lg shrink-0">
                <span className="text-[9px] font-bold leading-none tracking-tight">kt</span>
                <span className="text-[7px] font-semibold leading-none tracking-tight">MOS</span>
              </div>
              <div className="min-w-0">
                <h2 className="font-bold text-[13px] leading-tight truncate">종합안전포털시스템</h2>
                <p className="text-[10px] text-muted-foreground">Safety Portal System</p>
              </div>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto px-2 py-3 flex flex-col gap-1">
            {MOBILE_NAV_ITEMS.filter((entry) => !entry.adminOnly || isAdmin).map((entry, idx) => {
              if (isMobileGroup(entry)) {
                const isOpen = mobileOpenGroups[entry.label] ?? entry.children.some(c => location === c.href);
                const childActive = entry.children.some(c => location === c.href);
                return (
                  <div key={entry.label} className={cn("flex flex-col gap-0.5", idx > 0 && "pt-1 mt-1 border-t border-border/30")}>
                    <button
                      onClick={() => setMobileOpenGroups(prev => ({ ...prev, [entry.label]: !isOpen }))}
                      className={cn(
                        "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 font-medium text-sm w-full",
                        childActive ? "text-primary bg-primary/8" : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                      )}
                      data-testid={`mobile-nav-group-${entry.label}`}
                    >
                      <entry.icon className={cn("w-4 h-4 shrink-0 transition-colors", childActive ? "text-primary" : "opacity-70")} />
                      <span className="flex-1 text-left">{entry.label}</span>
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200 opacity-50", isOpen && "rotate-180")} />
                    </button>
                    <div className={cn("overflow-hidden transition-all duration-200", isOpen ? "max-h-[500px] opacity-100" : "max-h-0 opacity-0")}>
                      <div className="ml-4 pl-3 border-l-2 border-border/40 flex flex-col gap-0.5 mt-0.5 pb-1">
                        {entry.children.map((child) => {
                          const isActive = location === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setMobileMenuOpen(false)}
                              className={cn(
                                "flex items-center gap-2 px-2.5 py-1.5 rounded-md transition-all duration-150 text-[13px] font-medium",
                                isActive
                                  ? "bg-primary/10 text-primary font-semibold"
                                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                              )}
                              data-testid={`mobile-nav-${child.href.replace("/", "")}`}
                            >
                              <child.icon className={cn("w-3.5 h-3.5 shrink-0", isActive ? "text-primary" : "opacity-60")} />
                              <span>{child.label}</span>
                              {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              }
              const isActive = location === entry.href;
              return (
                <Link
                  key={entry.href}
                  href={entry.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-lg transition-all duration-150 text-sm font-medium",
                    isActive
                      ? "bg-primary/10 text-primary font-semibold"
                      : "text-muted-foreground hover:bg-muted/70 hover:text-foreground"
                  )}
                  data-testid={`mobile-nav-${entry.href.replace("/", "") || "home"}`}
                >
                  <entry.icon className={cn("w-4 h-4 shrink-0", isActive ? "text-primary" : "opacity-70")} />
                  <span>{entry.label}</span>
                  {isActive && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-primary" />}
                </Link>
              );
            })}
          </nav>
          <div className="px-4 py-2.5 border-t border-border/50 text-[10px] text-muted-foreground/50 font-medium">
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
