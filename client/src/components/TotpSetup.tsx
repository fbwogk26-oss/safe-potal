import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Shield, ShieldCheck, ShieldOff, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TotpSetup() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"status" | "setup" | "disable">("status");
  const [pin, setPin] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [password, setPassword] = useState("");

  const { data: totpStatus, isLoading } = useQuery<{ totpEnabled: boolean }>({
    queryKey: ["/api/auth/totp/status"],
  });

  const enableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/totp/enable", { code: pin });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/totp/status"] });
      toast({ title: "2차 인증이 활성화되었습니다" });
      setOpen(false);
      resetState();
    },
    onError: (err: any) => toast({ variant: "destructive", title: err?.message || "활성화에 실패했습니다" }),
  });

  const disableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/totp/disable", { password });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/totp/status"] });
      toast({ title: "2차 인증이 비활성화되었습니다" });
      setOpen(false);
      resetState();
    },
    onError: (err: any) => toast({ variant: "destructive", title: err?.message || "비활성화에 실패했습니다" }),
  });

  function resetState() {
    setStep("status");
    setPin("");
    setPinConfirm("");
    setPassword("");
  }

  const totpEnabled = totpStatus?.totpEnabled ?? false;
  const pinMismatch = pinConfirm.length === 6 && pin !== pinConfirm;
  const canEnable = pin.length === 6 && pinConfirm.length === 6 && pin === pinConfirm && !enableMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetState(); }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-totp-setup">
          {totpEnabled ? (
            <><ShieldCheck className="w-4 h-4 text-green-600" />2차 인증 관리</>
          ) : (
            <><Shield className="w-4 h-4" />2차 인증 설정</>
          )}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>2차 인증 (PIN)</DialogTitle>
          <DialogDescription>
            로그인 시 6자리 PIN으로 추가 보안을 적용합니다
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin" /></div>
        ) : step === "status" ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3 p-3 rounded-lg border">
              {totpEnabled ? (
                <ShieldCheck className="w-6 h-6 text-green-600 flex-shrink-0" />
              ) : (
                <ShieldOff className="w-6 h-6 text-muted-foreground flex-shrink-0" />
              )}
              <div>
                <p className="font-medium text-sm">
                  현재 상태: {totpEnabled ? "활성화됨" : "비활성화"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {totpEnabled ? "로그인 시 PIN 입력이 필요합니다" : "비밀번호만으로 로그인됩니다"}
                </p>
              </div>
              <Badge variant={totpEnabled ? "default" : "secondary"} className="ml-auto">
                {totpEnabled ? "ON" : "OFF"}
              </Badge>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              {totpEnabled ? (
                <Button variant="destructive" onClick={() => setStep("disable")}>
                  2차 인증 비활성화
                </Button>
              ) : (
                <Button onClick={() => setStep("setup")}>
                  2차 인증 설정 시작
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : step === "setup" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              로그인 시 사용할 6자리 PIN을 설정하세요. 숫자만 입력 가능합니다.
            </p>
            <div className="space-y-2">
              <p className="text-sm font-medium">새 PIN (6자리)</p>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="••••••"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl tracking-widest font-mono"
                maxLength={6}
                autoFocus
                data-testid="input-totp-pin"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">PIN 확인</p>
              <Input
                type="password"
                inputMode="numeric"
                placeholder="••••••"
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className={`text-center text-xl tracking-widest font-mono ${pinMismatch ? "border-red-500" : ""}`}
                maxLength={6}
                data-testid="input-totp-pin-confirm"
              />
              {pinMismatch && (
                <p className="text-xs text-red-500">PIN이 일치하지 않습니다</p>
              )}
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("status")}>취소</Button>
              <Button
                onClick={() => enableMutation.mutate()}
                disabled={!canEnable}
                data-testid="button-totp-enable"
              >
                {enableMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                활성화
              </Button>
            </DialogFooter>
          </div>
        ) : step === "disable" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              2차 인증을 비활성화하려면 현재 로그인 비밀번호를 입력하세요.
            </p>
            <Input
              type="password"
              placeholder="현재 비밀번호"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              data-testid="input-totp-disable-password"
            />
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("status")}>취소</Button>
              <Button
                variant="destructive"
                onClick={() => disableMutation.mutate()}
                disabled={!password || disableMutation.isPending}
              >
                {disableMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                비활성화
              </Button>
            </DialogFooter>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
