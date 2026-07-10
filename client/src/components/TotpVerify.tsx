import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield, ArrowLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";

export default function TotpVerify() {
  const { totpVerify, isTotpVerifying, cancelTotp } = useAuth();
  const { toast } = useToast();
  const [code, setCode] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length !== 6) return;
    try {
      await totpVerify({ code: code.trim() });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "인증 실패",
        description: err?.message || "PIN이 올바르지 않습니다",
      });
      setCode("");
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="bg-blue-100 dark:bg-blue-900/30 p-3 rounded-full">
              <Shield className="w-8 h-8 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <CardTitle>2차 인증</CardTitle>
          <CardDescription>
            설정한 6자리 PIN을 입력하세요
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              type="password"
              inputMode="numeric"
              placeholder="••••••"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="text-center text-2xl tracking-widest font-mono"
              maxLength={6}
              autoFocus
              data-testid="input-totp-code"
            />
            <Button
              type="submit"
              className="w-full"
              disabled={code.length !== 6 || isTotpVerifying}
              data-testid="button-totp-verify"
            >
              {isTotpVerifying ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />확인 중...</>
              ) : "인증"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full"
              onClick={cancelTotp}
              data-testid="button-totp-cancel"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              로그인으로 돌아가기
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
