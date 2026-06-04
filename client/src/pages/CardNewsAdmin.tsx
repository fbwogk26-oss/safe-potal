import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Loader2, Newspaper, Send, RefreshCw, Settings, Clock,
  Mail, AlertTriangle, CheckCircle2, X, Plus, ExternalLink,
  Calendar, Radio
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

function safeFormat(dateStr: string | null | undefined, fmt: string, opts?: object): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return format(d, fmt, opts);
  } catch { return ""; }
}

function safePubDate(pubDate: string): string {
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return pubDate.substring(0, 10);
    return d.toLocaleDateString("ko-KR", { month: "long", day: "numeric" });
  } catch { return ""; }
}

const DAY_OPTIONS = [
  { key: "mon", label: "월" }, { key: "tue", label: "화" },
  { key: "wed", label: "수" }, { key: "thu", label: "목" },
  { key: "fri", label: "금" }, { key: "sat", label: "토" },
  { key: "sun", label: "일" },
];

interface NewsArticle {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  description: string;
  제목?: string;
  핵심내용?: string;
  경각심문구?: string;
}

interface CardNewsConfig {
  enabled: boolean;
  days: string[];
  time: string;
  recipients: string[];
  lastSent?: string | null;
}

type TabType = "preview" | "settings";

export default function CardNewsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [hasFetched, setHasFetched] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>("preview");
  const [newRecipient, setNewRecipient] = useState("");

  const { data: config, isLoading: configLoading } = useQuery<CardNewsConfig>({
    queryKey: ["/api/card-news/config"],
  });

  const [localConfig, setLocalConfig] = useState<CardNewsConfig | null>(null);
  const effectiveConfig = localConfig ?? config ?? {
    enabled: false,
    days: ["mon", "tue", "wed", "thu", "fri"],
    time: "09:00",
    recipients: [],
    lastSent: null,
  };

  const fetchNewsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("GET", "/api/card-news/fetch");
      return res.json() as Promise<{ articles: NewsArticle[]; fetchedAt: string }>;
    },
    onSuccess: (data) => {
      setArticles(data.articles || []);
      setFetchedAt(data.fetchedAt || null);
      setHasFetched(true);
      const count = data.articles?.length || 0;
      toast({
        title: count > 0 ? `${count}건의 뉴스를 수집했습니다` : "수집된 뉴스가 없습니다",
        description: count === 0 ? "잠시 후 다시 시도해 주세요." : undefined,
      });
    },
    onError: (err: any) => {
      setHasFetched(true);
      toast({ variant: "destructive", title: "뉴스 수집 실패", description: String(err?.message || "") });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/card-news/send-email", {}),
    onSuccess: async () => {
      toast({ title: "✅ 카드뉴스 이메일이 발송되었습니다" });
      queryClient.invalidateQueries({ queryKey: ["/api/card-news/config"] });
      setLocalConfig(null);
    },
    onError: async (err: any) => {
      toast({ variant: "destructive", title: "이메일 발송 실패", description: String(err?.message || "") });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: (cfg: CardNewsConfig) => apiRequest("PUT", "/api/card-news/config", cfg),
    onSuccess: () => {
      setLocalConfig(null);
      queryClient.invalidateQueries({ queryKey: ["/api/card-news/config"] });
      toast({ title: "설정이 저장되었습니다" });
    },
    onError: () => toast({ variant: "destructive", title: "설정 저장 실패" }),
  });

  const updateConfig = (patch: Partial<CardNewsConfig>) =>
    setLocalConfig(prev => ({ ...(prev ?? effectiveConfig), ...patch }));

  const toggleDay = (day: string) => {
    const days = effectiveConfig.days.includes(day)
      ? effectiveConfig.days.filter(d => d !== day)
      : [...effectiveConfig.days, day];
    updateConfig({ days });
  };

  const addRecipient = () => {
    const email = newRecipient.trim();
    if (!email || !email.includes("@")) {
      toast({ variant: "destructive", title: "올바른 이메일 주소를 입력해주세요" });
      return;
    }
    if (effectiveConfig.recipients.includes(email)) {
      toast({ variant: "destructive", title: "이미 추가된 이메일입니다" });
      return;
    }
    updateConfig({ recipients: [...effectiveConfig.recipients, email] });
    setNewRecipient("");
  };

  const isDirty = localConfig !== null;
  const today = format(new Date(), "yyyy년 M월 d일", { locale: ko });

  return (
    <div className="max-w-4xl mx-auto space-y-6">

      {/* ── 헤더 ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2.5 mb-1">
            <div className="w-2 h-7 rounded-full bg-red-500" />
            <h2 className="text-2xl font-bold text-foreground tracking-tight">음주운전 카드뉴스</h2>
          </div>
          <p className="text-sm text-muted-foreground pl-4">
            실시간 음주운전 뉴스를 카드뉴스로 자동 발송 · {today}
          </p>
        </div>
        {config?.lastSent && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 border px-3 py-1.5 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            마지막 발송 {safeFormat(config.lastSent, "M월 d일 HH:mm", { locale: ko })}
          </div>
        )}
      </div>

      {/* ── 탭 네비게이션 ──────────────────────────────────────── */}
      <div className="flex border-b">
        {([
          { key: "preview", icon: Newspaper, label: "뉴스 미리보기" },
          { key: "settings", icon: Settings, label: "발송 설정" },
        ] as { key: TabType; icon: any; label: string }[]).map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === key
                ? "border-red-500 text-red-600 dark:text-red-400"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ══════════════════════════════════════════════════════════
          탭 1: 뉴스 미리보기
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "preview" && (
        <div className="space-y-5">

          {/* 수집 + 발송 액션 바 */}
          <div className="flex items-center justify-between gap-3 p-4 bg-muted/30 rounded-xl border">
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Google뉴스 · KBS · SBS · MBC · JTBC · 연합뉴스 등 12개 소스</p>
              <p className="text-xs text-muted-foreground">
                최근 7일 · 음주운전·음주사고·음주단속 키워드
                {fetchedAt && (
                  <span className="ml-2 text-muted-foreground/70">
                    · 수집 {safeFormat(fetchedAt, "HH:mm:ss")}
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button
                onClick={() => fetchNewsMutation.mutate()}
                disabled={fetchNewsMutation.isPending}
                variant="outline"
                size="sm"
                className="gap-2"
                data-testid="button-fetch-news"
              >
                {fetchNewsMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <RefreshCw className="w-3.5 h-3.5" />}
                뉴스 수집
              </Button>
              <Button
                onClick={() => sendEmailMutation.mutate()}
                disabled={sendEmailMutation.isPending || articles.length === 0}
                size="sm"
                className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                data-testid="button-send-email"
              >
                {sendEmailMutation.isPending
                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  : <Send className="w-3.5 h-3.5" />}
                지금 발송
              </Button>
            </div>
          </div>

          {/* 로딩 상태 */}
          {fetchNewsMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
              <div className="relative">
                <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-red-950/30 flex items-center justify-center">
                  <Newspaper className="w-6 h-6 text-red-400" />
                </div>
                <Loader2 className="w-5 h-5 animate-spin text-red-500 absolute -top-0.5 -right-0.5" />
              </div>
              <p className="text-sm">뉴스를 수집하는 중입니다...</p>
            </div>
          )}

          {/* 초기 안내 */}
          {!fetchNewsMutation.isPending && !hasFetched && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-dashed rounded-xl text-muted-foreground">
              <Newspaper className="w-10 h-10 opacity-20" />
              <p className="text-sm font-medium">"뉴스 수집" 버튼을 눌러 최신 뉴스를 불러오세요</p>
              <p className="text-xs opacity-60">Google뉴스 · 연합뉴스 · MBC · 한국경제에서 수집합니다</p>
            </div>
          )}

          {/* 결과 없음 */}
          {!fetchNewsMutation.isPending && hasFetched && articles.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3 border-2 border-dashed border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50/50 dark:bg-amber-950/20">
              <AlertTriangle className="w-10 h-10 text-amber-400 opacity-60" />
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">현재 수집 가능한 뉴스가 없습니다</p>
              <p className="text-xs text-amber-600 dark:text-amber-500">잠시 후 다시 수집을 시도해 주세요.</p>
            </div>
          )}

          {/* 뉴스 카드 목록 */}
          {articles.length > 0 && !fetchNewsMutation.isPending && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-foreground">
                  수집된 뉴스
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{articles.length}건</span>
                </span>
                <Badge variant="outline" className="text-xs text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30">
                  <Radio className="w-2.5 h-2.5 mr-1 fill-green-500 text-green-500" />
                  발송 대기
                </Badge>
              </div>

              <div className="grid gap-3">
                {articles.map((article, i) => (
                  <div
                    key={i}
                    className="group flex gap-4 p-4 rounded-xl border bg-card hover:shadow-sm transition-shadow"
                    data-testid={`card-news-${i}`}
                  >
                    {/* 번호 */}
                    <div className="shrink-0 flex flex-col items-center gap-1">
                      <span className="w-8 h-8 rounded-lg bg-red-600 text-white text-xs font-bold flex items-center justify-center">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                    </div>

                    {/* 본문 */}
                    <div className="flex-1 min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        {article.source && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                            {article.source}
                          </Badge>
                        )}
                        {article.pubDate && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <Calendar className="w-2.5 h-2.5" />
                            {safePubDate(article.pubDate)}
                          </span>
                        )}
                      </div>
                      <h3 className="text-sm font-semibold leading-snug text-foreground">
                        {article.title}
                      </h3>
                      {article.description && (
                        <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
                          {article.description}
                        </p>
                      )}
                    </div>

                    {/* 링크 */}
                    {article.link && (
                      <a
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 self-start text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              {/* 발송 확인 바 */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900">
                <Send className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-sm text-red-700 dark:text-red-400 flex-1">
                  <span className="font-semibold">{articles.length}건</span>의 뉴스가 수집되었습니다.
                  수신자 <span className="font-semibold">{effectiveConfig.recipients.length}명</span>에게 카드뉴스를 발송합니다.
                </p>
                <Button
                  onClick={() => sendEmailMutation.mutate()}
                  disabled={sendEmailMutation.isPending}
                  size="sm"
                  className="shrink-0 gap-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  {sendEmailMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                  지금 발송
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════
          탭 2: 발송 설정
      ══════════════════════════════════════════════════════════ */}
      {activeTab === "settings" && (
        <div className="space-y-4">
          {configLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* 자동 발송 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Settings className="w-4 h-4 text-muted-foreground" />
                    자동 발송
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">자동 발송 활성화</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        설정한 요일·시간에 자동으로 카드뉴스를 발송합니다
                      </p>
                    </div>
                    <Switch
                      checked={effectiveConfig.enabled}
                      onCheckedChange={(v) => updateConfig({ enabled: v })}
                      data-testid="switch-auto-send"
                    />
                  </div>

                  {/* 요일 */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 발송 요일
                    </Label>
                    <div className="flex gap-1.5 flex-wrap">
                      {DAY_OPTIONS.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => toggleDay(key)}
                          className={`w-9 h-9 rounded-lg text-sm font-semibold transition-all ${
                            effectiveConfig.days.includes(key)
                              ? "bg-red-600 text-white shadow-sm"
                              : "bg-muted text-muted-foreground hover:bg-muted/80"
                          }`}
                          data-testid={`button-day-${key}`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* 시간 */}
                  <div className="space-y-2">
                    <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                      <Clock className="w-3 h-3" /> 발송 시간
                    </Label>
                    <Input
                      type="time"
                      value={effectiveConfig.time}
                      onChange={(e) => updateConfig({ time: e.target.value })}
                      className="w-32 text-sm"
                      data-testid="input-send-time"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* 수신자 */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Mail className="w-4 h-4 text-muted-foreground" />
                    수신자 관리
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex gap-2">
                    <Input
                      value={newRecipient}
                      onChange={(e) => setNewRecipient(e.target.value)}
                      placeholder="이메일 주소 입력"
                      onKeyDown={(e) => e.key === "Enter" && addRecipient()}
                      className="flex-1 text-sm"
                      data-testid="input-new-recipient"
                    />
                    <Button
                      onClick={addRecipient}
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      data-testid="button-add-recipient"
                    >
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {effectiveConfig.recipients.map((email) => (
                      <div
                        key={email}
                        className="flex items-center gap-1.5 bg-muted/60 px-3 py-1.5 rounded-full text-xs"
                        data-testid={`recipient-${email}`}
                      >
                        <Mail className="w-3 h-3 text-muted-foreground" />
                        <span>{email}</span>
                        <button
                          onClick={() => removeRecipient(email)}
                          className="ml-1 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                    {effectiveConfig.recipients.length === 0 && (
                      <p className="text-xs text-muted-foreground">수신자를 추가해주세요</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 현황 요약 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  {
                    label: "자동 발송",
                    value: effectiveConfig.enabled ? "활성화" : "비활성화",
                    color: effectiveConfig.enabled ? "text-green-600" : "text-muted-foreground",
                  },
                  {
                    label: "발송 요일",
                    value: effectiveConfig.days.length === 0
                      ? "없음"
                      : effectiveConfig.days.map(d => DAY_OPTIONS.find(o => o.key === d)?.label).join(" "),
                    color: "text-foreground",
                  },
                  {
                    label: "발송 시간",
                    value: effectiveConfig.time,
                    color: "text-foreground",
                  },
                  {
                    label: "수신자",
                    value: `${effectiveConfig.recipients.length}명`,
                    color: "text-foreground",
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="p-3 rounded-xl bg-muted/30 border text-center space-y-1">
                    <p className="text-[11px] text-muted-foreground">{label}</p>
                    <p className={`text-sm font-semibold ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {config?.lastSent && (
                <p className="text-xs text-muted-foreground text-center">
                  마지막 발송 · {safeFormat(config.lastSent, "yyyy년 M월 d일 HH:mm", { locale: ko })}
                </p>
              )}

              {/* 저장 */}
              <div className="flex items-center justify-end gap-3 pt-1">
                {isDirty && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 mr-auto">
                    <AlertTriangle className="w-3 h-3" />
                    저장되지 않은 변경사항이 있습니다
                  </p>
                )}
                <Button
                  onClick={() => saveConfigMutation.mutate(effectiveConfig)}
                  disabled={saveConfigMutation.isPending || !isDirty}
                  size="sm"
                  className={isDirty ? "bg-red-600 hover:bg-red-700 text-white" : ""}
                  variant={isDirty ? "default" : "outline"}
                  data-testid="button-save-config"
                >
                  {saveConfigMutation.isPending
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                    : <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />}
                  설정 저장
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  function removeRecipient(email: string) {
    updateConfig({ recipients: effectiveConfig.recipients.filter(r => r !== email) });
  }
}
