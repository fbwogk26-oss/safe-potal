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
import { Shield, ShieldCheck, ShieldOff, Loader2, Copy, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function TotpSetup() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"status" | "setup" | "disable">("status");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [setupData, setSetupData] = useState<{ secret: string; qrDataUrl: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const { data: totpStatus, isLoading } = useQuery<{ totpEnabled: boolean }>({
    queryKey: ["/api/auth/totp/status"],
  });

  const setupMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/auth/totp/setup");
      return res.json() as Promise<{ secret: string; qrDataUrl: string }>;
    },
    onSuccess: (data) => {
      setSetupData(data);
      setStep("setup");
    },
    onError: () => toast({ variant: "destructive", title: "설정 준비에 실패했습니다" }),
  });

  const enableMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/auth/totp/enable", { code: code.trim() });
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
    setCode("");
    setPassword("");
    setSetupData(null);
    setCopied(false);
  }

  function copySecret() {
    if (!setupData) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const totpEnabled = totpStatus?.totpEnabled ?? false;

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
          <DialogTitle>2차 인증 (TOTP)</DialogTitle>
          <DialogDescription>
            Google Authenticator 등의 앱으로 로그인 시 추가 보안을 적용합니다
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
                  {totpEnabled ? "로그인 시 2차 인증 코드가 필요합니다" : "비밀번호만으로 로그인됩니다"}
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
                <Button onClick={() => setupMutation.mutate()} disabled={setupMutation.isPending}>
                  {setupMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  2차 인증 설정 시작
                </Button>
              )}
            </DialogFooter>
          </div>
        ) : step === "setup" && setupData ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              Google Authenticator 앱으로 아래 QR 코드를 스캔하거나, 비밀키를 직접 입력하세요.
            </p>
            <div className="flex justify-center">
              <img src={setupData.qrDataUrl} alt="QR 코드" className="w-44 h-44 rounded-lg border" />
            </div>
            <div className="flex items-center gap-2 p-2 bg-muted rounded text-xs font-mono break-all">
              <span className="flex-1">{setupData.secret}</span>
              <Button variant="ghost" size="icon" className="h-6 w-6 flex-shrink-0" onClick={copySecret}>
                {copied ? <CheckCircle className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3" />}
              </Button>
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium">앱에 표시된 6자리 코드 입력</p>
              <Input
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                className="text-center text-xl tracking-widest font-mono"
                maxLength={6}
                data-testid="input-totp-enable-code"
              />
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button variant="outline" onClick={() => setStep("status")}>취소</Button>
              <Button
                onClick={() => enableMutation.mutate()}
                disabled={code.length !== 6 || enableMutation.isPending}
              >
                {enableMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                활성화
              </Button>
            </DialogFooter>
          </div>
        ) : step === "disable" ? (
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">
              2차 인증을 비활성화하려면 현재 비밀번호를 입력하세요.
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
