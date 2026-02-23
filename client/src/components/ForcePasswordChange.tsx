import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Lock, Eye, EyeOff, ShieldAlert, Check, X } from "lucide-react";
import { motion } from "framer-motion";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";

function PasswordStrength({ password }: { password: string }) {
  const checks = [
    { label: "8자 이상", pass: password.length >= 8 },
    { label: "영문 포함", pass: /[A-Za-z]/.test(password) },
    { label: "숫자 포함", pass: /[0-9]/.test(password) },
    { label: "특수문자 포함", pass: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password) },
  ];
  const passCount = checks.filter(c => c.pass).length;
  
  if (!password) return null;
  
  return (
    <div className="space-y-1.5 mt-2">
      <div className="flex gap-1">
        {[0,1,2,3].map(i => (
          <div key={i} className={`h-1 flex-1 rounded-full transition-colors ${
            i < passCount 
              ? passCount <= 1 ? "bg-red-500" 
              : passCount <= 2 ? "bg-orange-500" 
              : passCount <= 3 ? "bg-yellow-500" 
              : "bg-green-500"
              : "bg-muted"
          }`} />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-1">
        {checks.map(({ label, pass }) => (
          <div key={label} className={`flex items-center gap-1 text-xs ${pass ? "text-green-600" : "text-muted-foreground"}`}>
            {pass ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
            {label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ForcePasswordChange() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { clearMustChangePassword } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!newPassword || !confirmPassword) {
      setError("새 비밀번호를 입력해주세요");
      return;
    }
    if (newPassword.length < 8) {
      setError("비밀번호는 8자 이상이어야 합니다");
      return;
    }
    if (!/[A-Za-z]/.test(newPassword)) {
      setError("비밀번호에 영문자가 포함되어야 합니다");
      return;
    }
    if (!/[0-9]/.test(newPassword)) {
      setError("비밀번호에 숫자가 포함되어야 합니다");
      return;
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)) {
      setError("비밀번호에 특수문자가 포함되어야 합니다");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("비밀번호가 일치하지 않습니다");
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await apiRequest("POST", "/api/auth/force-change-password", { newPassword });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message);
      }
      clearMustChangePassword();
    } catch (err: any) {
      setError(err.message || "비밀번호 변경에 실패했습니다");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-primary/5 rounded-full blur-3xl" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md relative z-10"
      >
        <div className="text-center mb-8">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-amber-500 shadow-lg shadow-amber-500/25 mb-4 text-white"
          >
            <ShieldAlert className="w-10 h-10" />
          </motion.div>
          <motion.h1
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-2xl font-bold tracking-tight"
          >
            비밀번호 변경 필요
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-muted-foreground mt-1"
          >
            보안을 위해 최초 로그인 시 비밀번호를 변경해주세요
          </motion.p>
        </div>

        <Card className="border-0 shadow-xl shadow-black/5 bg-card/80 backdrop-blur-sm">
          <CardContent className="p-6 sm:p-8">
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  새 비밀번호
                </label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="새 비밀번호를 입력하세요"
                    autoComplete="new-password"
                    className="h-12 bg-background/50 border-border/50 focus:border-primary transition-colors pr-12"
                    data-testid="input-new-password"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-10 w-10 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
                <PasswordStrength password={newPassword} />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Lock className="w-4 h-4 text-muted-foreground" />
                  비밀번호 확인
                </label>
                <Input
                  type={showPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="비밀번호를 한 번 더 입력하세요"
                  autoComplete="new-password"
                  className="h-12 bg-background/50 border-border/50 focus:border-primary transition-colors"
                  data-testid="input-confirm-password"
                />
              </div>

              {error && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                >
                  <p className="text-sm text-destructive text-center" data-testid="text-error">
                    {error}
                  </p>
                </motion.div>
              )}

              <Button
                type="submit"
                className="w-full h-12 text-base font-medium shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 transition-all"
                disabled={isSubmitting}
                data-testid="button-change-password"
              >
                {isSubmitting ? "변경 중..." : "비밀번호 변경"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
