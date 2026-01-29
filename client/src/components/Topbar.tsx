import { Bell, Lock, Unlock, Settings, RotateCw } from "lucide-react";
import { useLockStatus, useSetLock } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { useNotices } from "@/hooks/use-notices";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";

export function Topbar() {
  const { data: lockData, isLoading: lockLoading } = useLockStatus();
  const { data: notices } = useNotices("notice");
  const latestNotice = notices && notices.length > 0 ? notices[0] : null;
  const isLocked = lockData?.isLocked;

  return (
    <header className="sticky top-0 z-20 w-full glass-panel border-b-0 rounded-none md:rounded-b-2xl mb-6">
      <div className="flex flex-col">
        {/* Top Level */}
        <div className="px-4 py-3 md:px-6 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="md:hidden font-display font-bold text-xl">종합안전포털</div>
            {isLocked && (
              <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-bold border border-red-200 animate-pulse">
                <Lock className="w-3 h-3" /> 시스템 잠김
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <AdminButton isLocked={isLocked || false} />
          </div>
        </div>

        {/* Ticker - Only if there are notices */}
        <div className="bg-primary/5 border-y border-primary/10 overflow-hidden h-9 flex items-center relative">
          <div className="absolute left-0 z-10 px-3 h-full flex items-center bg-background/50 backdrop-blur-sm text-xs font-bold text-primary uppercase tracking-wider">
            공지
          </div>
          <div className="w-full overflow-hidden">
            <div className="animate-ticker pause-hover px-4 text-sm font-medium text-foreground/80 flex items-center gap-10">
              {latestNotice ? (
                 <>
                   <span>{latestNotice.title}: {latestNotice.content}</span>
                   <span className="opacity-50">•</span>
                   <span>{latestNotice.title}: {latestNotice.content}</span>
                   <span className="opacity-50">•</span>
                   <span>{latestNotice.title}: {latestNotice.content}</span>
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
              placeholder="••••" 
              className="text-center tracking-widest text-lg font-mono"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
            />
            <p className="text-xs text-muted-foreground text-center">기본 PIN: 2026</p>
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
