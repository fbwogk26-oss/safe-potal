import { Bell, Lock, Unlock, Settings, RotateCw, Menu } from "lucide-react";
import { useLockStatus, useSetLock } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { useNotices } from "@/hooks/use-notices";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { Link, useLocation } from "wouter";
import { 
  LayoutDashboard, 
  ShieldCheck, 
  GraduationCap, 
  DoorOpen,
  Car,
  HardHat,
  MonitorPlay,
  ClipboardCheck,
  ShoppingCart
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "대시보드", href: "/", icon: LayoutDashboard },
  { label: "안전수칙", href: "/rules", icon: ShieldCheck },
  { label: "공지/알림", href: "/notices", icon: Bell },
  { label: "안전교육", href: "/education", icon: GraduationCap },
  { label: "안전점검", href: "/inspections", icon: ClipboardCheck },
  { label: "안전용품신청", href: "/equipment", icon: ShoppingCart },
  { label: "출입신청", href: "/access", icon: DoorOpen },
  { label: "전자게시판", href: "/digital-board", icon: MonitorPlay },
];

export function Topbar() {
  const { data: lockData, isLoading: lockLoading } = useLockStatus();
  const { data: notices } = useNotices("notice");
  const { data: pinnedData } = useQuery<{ pinnedNoticeId: number | null }>({
    queryKey: ["/api/settings/pinned-notice"],
  });
  
  // Use pinned notice first, or fall back to latest notice
  const tickerNotice = useMemo(() => {
    if (!notices || notices.length === 0) return null;
    const pinnedNoticeId = pinnedData?.pinnedNoticeId;
    
    if (pinnedNoticeId) {
      const pinned = notices.find(n => n.id === pinnedNoticeId);
      if (pinned) return pinned;
    }
    
    // Fall back to most recent notice
    return [...notices].sort((a, b) => b.id - a.id)[0] || null;
  }, [notices, pinnedData]);
  
  const isLocked = lockData?.isLocked;
  const [location] = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <header className="sticky top-0 z-20 w-full glass-panel border-b-0 rounded-none md:rounded-b-2xl mb-4 md:mb-6">
      <div className="flex flex-col">
        {/* Top Level */}
        <div className="px-3 py-2 md:px-6 md:py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 md:gap-4">
            {/* Mobile Menu Button */}
            <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden h-9 w-9">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 p-0">
                <div className="p-4 border-b bg-primary/5">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-primary to-blue-600 flex items-center justify-center text-white shadow-lg">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="font-display font-bold text-base">종합안전포털</h2>
                      <p className="text-xs text-muted-foreground">시스템</p>
                    </div>
                  </div>
                </div>
                <div className="px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {NAV_ITEMS.map((item) => (
                      <Link 
                        key={item.href} 
                        href={item.href}
                        onClick={() => setSheetOpen(false)}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 font-medium text-sm",
                          location === item.href 
                            ? "bg-primary text-primary-foreground shadow-md" 
                            : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                      >
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            
            <div className="md:hidden font-display font-bold text-base truncate">종합안전포털</div>
            {isLocked && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200 animate-pulse">
                <Lock className="w-3 h-3" /> 시스템 잠김
              </div>
            )}
            {isLocked && (
              <div className="md:hidden flex items-center">
                <Lock className="w-4 h-4 text-red-500" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <AdminButton isLocked={isLocked || false} />
          </div>
        </div>

        {/* Ticker - Only if there are notices */}
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

function AdminButton({ isLocked }: { isLocked: boolean }) {
  const [isOpen, setIsOpen] = useState(false);
  const [pin, setPin] = useState("");
  const { mutate: setLock, isPending } = useSetLock();
  const { toast } = useToast();

  const handleToggle = () => {
    setLock({ isLocked: !isLocked, pin }, {
      onSuccess: () => {
        setIsOpen(false);
        setPin("");
        toast({
          title: !isLocked ? "시스템 잠금" : "시스템 잠금 해제",
          description: !isLocked ? "모든 편집 기능이 비활성화되었습니다." : "편집 기능이 활성화되었습니다.",
        });
      },
      onError: () => {
        toast({
          variant: "destructive",
          title: "접근 거부",
          description: "잘못된 PIN 코드입니다.",
        });
      }
    });
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant={isLocked ? "destructive" : "outline"} size="sm" className="gap-2 shadow-sm">
          {isLocked ? <Lock className="w-4 h-4" /> : <Settings className="w-4 h-4" />}
          <span className="hidden sm:inline">{isLocked ? "시스템 잠금 해제" : "관리자"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>관리자 접속</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">PIN 번호 입력</label>
            <Input 
              type="password" 
              placeholder="••••••" 
              className="text-center tracking-widest text-lg font-mono"
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
          </div>
          <Button 
            className="w-full" 
            onClick={handleToggle} 
            disabled={isPending || pin.length < 4}
            variant={isLocked ? "default" : "destructive"}
          >
            {isPending && <RotateCw className="mr-2 h-4 w-4 animate-spin" />}
            {isLocked ? "시스템 잠금 해제" : "시스템 잠금"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
