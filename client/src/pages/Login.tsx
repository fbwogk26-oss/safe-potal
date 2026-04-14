import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CalendarDays, Mail, Lock } from "lucide-react";
import { motion } from "framer-motion";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const { login, isLoggingIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username || !password) {
      setError("아이디와 비밀번호를 입력해주세요");
      return;
    }
    try {
      await login({ username, password });
    } catch (err: any) {
      setError(err.message || "로그인에 실패했습니다");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#e8eafd] dark:bg-gray-950 p-4 transition-colors duration-300">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut" }}
        className="w-full max-w-sm"
      >
        <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-lg shadow-indigo-200/40 dark:shadow-black/40 px-8 pt-10 pb-8 space-y-6 border border-transparent dark:border-gray-800">
          {/* 로고 아이콘 */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-[#4F58E8] flex items-center justify-center shadow-md shadow-indigo-300/40">
              <CalendarDays className="w-7 h-7 text-white" />
            </div>
            <div className="text-center">
              <h1 className="text-[1.35rem] font-bold tracking-tight text-gray-800 dark:text-gray-100">
                종합안전포털시스템
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">안전 관리 시스템에 로그인하세요</p>
            </div>
          </div>

          {/* 폼 */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="username" className="text-sm font-medium text-gray-700 dark:text-gray-300">아이디</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <Input
                  id="username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  placeholder=""
                  autoComplete="username"
                  className="pl-10 h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-indigo-400 focus:ring-indigo-100 dark:focus:border-indigo-500 rounded-lg text-sm dark:text-gray-100 dark:placeholder-gray-500"
                  data-testid="input-username"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-sm font-medium text-gray-700 dark:text-gray-300">비밀번호</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500 pointer-events-none" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder=""
                  autoComplete="current-password"
                  className="pl-10 h-11 bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 focus:border-indigo-400 focus:ring-indigo-100 dark:focus:border-indigo-500 rounded-lg text-sm dark:text-gray-100"
                  data-testid="input-password"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-500 text-center" data-testid="text-error">{error}</p>
            )}

            <div className="flex items-center gap-2 pt-0.5">
              <Checkbox
                id="remember"
                checked={rememberMe}
                onCheckedChange={v => setRememberMe(!!v)}
                className="rounded border-gray-300 dark:border-gray-600"
                data-testid="checkbox-remember"
              />
              <Label htmlFor="remember" className="text-sm text-gray-600 dark:text-gray-400 cursor-pointer select-none">로그인 상태 유지</Label>
            </div>

            <Button
              type="submit"
              disabled={isLoggingIn}
              className="w-full h-12 text-base font-semibold rounded-xl bg-[#4F58E8] hover:bg-[#3d46d4] text-white shadow-md shadow-indigo-300/40 transition-all"
              data-testid="button-login"
            >
              {isLoggingIn ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  로그인 중...
                </span>
              ) : "로그인"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 dark:text-gray-600 mt-5">
          © KTMOS남부 임직원 외 사용금지
        </p>
      </motion.div>
    </div>
  );
}
