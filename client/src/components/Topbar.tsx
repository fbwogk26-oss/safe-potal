import { Bell, LogOut, Users, Shield, KeyRound, Eye, EyeOff, Menu, Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/hooks/use-theme";
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

interface TopbarProps {
  onMenuClick?: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const [pwDialogOpen, setPwDialogOpen] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [pwError, setPwError] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const { toast } = useToast();
  const { theme, toggleTheme } = useTheme();
  const [, navigate] = useLocation();
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

  const { data: noticesList } = useQuery<any[]>({
    queryKey: ["/api/notices"],
    enabled: isAuthenticated,
    staleTime: 60000,
  });

  const unreadNoticesCount = useMemo(() => {
    if (!noticesList) return 0;
    const notices = noticesList.filter((n: any) => n.category === "notice");
    try {
      const lastViewed = localStorage.getItem("noticesLastViewed");
      if (!lastViewed) return Math.min(notices.length, 99);
      const lastViewedDate = new Date(lastViewed);
      return notices.filter((n: any) => new Date(n.createdAt) > lastViewedDate).length;
    } catch {
      return 0;
    }
  }, [noticesList]);

  const handleBellClick = () => {
    try {
      localStorage.setItem("noticesLastViewed", new Date().toISOString());
    } catch {}
    navigate("/notices");
  };

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
      <div className="flex items-center px-3 py-2.5 gap-2">
        {/* 모바일 햄버거 버튼 */}
        <button
          onClick={onMenuClick}
          className="md:hidden w-10 h-10 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors shrink-0"
          data-testid="button-mobile-menu"
          aria-label="메뉴 열기"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* 모바일 타이틀 */}
        <Link href="/" className="md:hidden">
          <div className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity">
            <div className="min-w-0">
              <h1 className="text-sm font-bold leading-tight text-foreground truncate max-w-[160px]">종합안전포털</h1>
            </div>
          </div>
        </Link>

        {/* Spacer */}
        <div className="flex-1" />

        {/* 다크/라이트 모드 토글 */}
        <button
          onClick={toggleTheme}
          className="w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors shrink-0"
          data-testid="button-theme-toggle"
          aria-label={theme === "dark" ? "라이트 모드로 전환" : "다크 모드로 전환"}
          title={theme === "dark" ? "라이트 모드" : "다크 모드"}
        >
          {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        {/* 알림 벨 */}
        {isAuthenticated && (
          <button
            onClick={handleBellClick}
            className="relative w-9 h-9 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors shrink-0"
            data-testid="button-notifications"
            aria-label="알림 보기"
            title="공지/알림"
          >
            <Bell className="w-4 h-4" />
            {unreadNoticesCount > 0 && (
              <span className="absolute top-1 right-1 min-w-[14px] h-3.5 px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-[8px] font-bold leading-none">
                {unreadNoticesCount > 99 ? "99+" : unreadNoticesCount}
              </span>
            )}
          </button>
        )}

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
