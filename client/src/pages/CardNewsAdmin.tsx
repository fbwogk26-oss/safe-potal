import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Loader2, Newspaper, Send, RefreshCw, Settings, Clock, Mail, AlertTriangle, CheckCircle2, X, Plus } from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

function safeFormat(dateStr: string | null | undefined, fmt: string, opts?: object): string {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "";
    return format(d, fmt, opts);
  } catch {
    return "";
  }
}

function safePubDate(pubDate: string): string {
  try {
    const d = new Date(pubDate);
    if (isNaN(d.getTime())) return pubDate.substring(0, 10);
    return d.toLocaleDateString("ko-KR");
  } catch {
    return "";
  }
}

const DAY_OPTIONS = [
  { key: "mon", label: "월" },
  { key: "tue", label: "화" },
  { key: "wed", label: "수" },
  { key: "thu", label: "목" },
  { key: "fri", label: "금" },
  { key: "sat", label: "토" },
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

export default function CardNewsAdmin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [newRecipient, setNewRecipient] = useState("");

  const { data: config, isLoading: configLoading } = useQuery<CardNewsConfig>({
    queryKey: ["/api/card-news/config"],
  });

  const [localConfig, setLocalConfig] = useState<CardNewsConfig | null>(null);
  const effectiveConfig = localConfig ?? config ?? {
    enabled: false,
    days: ["mon", "tue", "wed", "thu", "fri"],
    time: "09:00",
    recipients: ["fbwogk26@gmail.com"],
    lastSent: null,
  };

  const [hasFetched, setHasFetched] = useState(false);

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
      if (count === 0) {
        toast({ title: "수집된 뉴스가 없습니다", description: "현재 수집 가능한 음주운전 뉴스가 없습니다. 잠시 후 다시 시도해 주세요." });
      } else {
        toast({ title: `${count}건의 음주운전 뉴스를 수집했습니다` });
      }
    },
    onError: (err: any) => {
      setHasFetched(true);
      toast({ variant: "destructive", title: "뉴스 수집에 실패했습니다", description: String(err?.message || "") });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/card-news/send-email", {}),
    onSuccess: async () => {
      toast({ title: "카드뉴스 이메일이 발송되었습니다 ✓" });
      queryClient.invalidateQueries({ queryKey: ["/api/card-news/config"] });
      setLocalConfig(null);
    },
    onError: async (err: any) => {
      toast({ variant: "destructive", title: "이메일 발송 실패", description: String(err?.message || "") });
    },
  });

  const saveConfigMutation = useMutation({
    mutationFn: (cfg: CardNewsConfig) => apiRequest("PUT", "/api/card-news/config", cfg),
    onSuccess: async (res: any) => {
      const data = await res.json();
      setLocalConfig(null);
      queryClient.invalidateQueries({ queryKey: ["/api/card-news/config"] });
      toast({ title: "설정이 저장되었습니다" });
    },
    onError: () => toast({ variant: "destructive", title: "설정 저장에 실패했습니다" }),
  });

  const updateConfig = (patch: Partial<CardNewsConfig>) => {
    setLocalConfig(prev => ({ ...(prev ?? effectiveConfig), ...patch }));
  };

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

  const removeRecipient = (email: string) => {
    updateConfig({ recipients: effectiveConfig.recipients.filter(r => r !== email) });
  };

  const isDirty = localConfig !== null;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="bg-red-100 p-2 rounded-xl text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <Newspaper className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-2xl md:text-3xl font-display font-bold text-foreground">음주운전 카드뉴스</h2>
            <p className="text-muted-foreground text-sm mt-1">실시간 음주운전 뉴스를 카드뉴스로 자동 발송</p>
          </div>
        </div>
        {config?.lastSent && (
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
            마지막 발송: {safeFormat(config.lastSent, "M월 d일 HH:mm", { locale: ko })}
          </div>
        )}
      </div>

      <Tabs defaultValue="preview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="preview" className="gap-2">
            <Newspaper className="w-4 h-4" />
            뉴스 미리보기
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-2">
            <Settings className="w-4 h-4" />
            발송 설정
          </TabsTrigger>
        </TabsList>

        {/* ── 뉴스 미리보기 탭 ────────────────────────────────────────── */}
        <TabsContent value="preview" className="space-y-4">
          <Card className="border-red-200 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="text-sm font-semibold">Google뉴스 · 연합뉴스 · MBC · 한국경제에서 실시간 음주운전 뉴스 수집</p>
                  <p className="text-xs text-muted-foreground mt-0.5">수집 후 AI가 경각심 카드뉴스로 요약하여 이메일 발송 · 순서대로 시도 후 수집된 소스 사용</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => fetchNewsMutation.mutate()}
                    disabled={fetchNewsMutation.isPending}
                    variant="outline"
                    className="gap-2"
                    data-testid="button-fetch-news"
                  >
                    {fetchNewsMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    뉴스 수집
                  </Button>
                  <Button
                    onClick={() => sendEmailMutation.mutate()}
                    disabled={sendEmailMutation.isPending || articles.length === 0}
                    className="gap-2 bg-red-600 hover:bg-red-700 text-white"
                    data-testid="button-send-email"
                  >
                    {sendEmailMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    지금 발송
                  </Button>
                </div>
              </div>
              {fetchedAt && (
                <p className="text-xs text-muted-foreground mt-2">
                  수집 시각: {safeFormat(fetchedAt, "M월 d일 HH:mm:ss", { locale: ko })}
                </p>
              )}
            </CardContent>
          </Card>

          {fetchNewsMutation.isPending && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
              <Loader2 className="w-8 h-8 animate-spin text-red-500" />
              <p className="text-sm">뉴스를 수집하고 있습니다...</p>
            </div>
          )}

          {articles.length === 0 && !fetchNewsMutation.isPending && !hasFetched && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground border-2 border-dashed rounded-xl">
              <Newspaper className="w-12 h-12 opacity-30" />
              <p className="text-sm">위 "뉴스 수집" 버튼을 눌러 최신 뉴스를 불러오세요</p>
              <p className="text-xs opacity-60">Google뉴스 · 연합뉴스 · MBC · 한국경제에서 음주운전 뉴스를 수집합니다</p>
            </div>
          )}

          {articles.length === 0 && !fetchNewsMutation.isPending && hasFetched && (
            <div className="flex flex-col items-center justify-center py-16 gap-3 border-2 border-dashed border-amber-200 dark:border-amber-800 rounded-xl bg-amber-50/50 dark:bg-amber-950/20">
              <AlertTriangle className="w-12 h-12 text-amber-400 opacity-60" />
              <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">현재 수집 가능한 음주운전 뉴스가 없습니다</p>
              <p className="text-xs text-amber-600 dark:text-amber-500 opacity-80">모든 뉴스 소스(Google뉴스 · 연합뉴스 · MBC · 한국경제)에서 기사를 찾지 못했습니다.</p>
              <p className="text-xs text-muted-foreground">잠시 후 다시 수집을 시도해 주세요.</p>
            </div>
          )}

          {articles.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <div className="w-1 h-5 rounded-full bg-red-500" />
                <span className="text-sm font-bold">수집된 뉴스 ({articles.length}건) — 이메일 카드뉴스 미리보기</span>
              </div>
              <div className="grid gap-3">
                {articles.map((article, i) => (
                  <Card key={i} className="border-0 shadow-sm overflow-hidden" data-testid={`card-news-${i}`}>
                    <div className="h-1.5 bg-gradient-to-r from-red-600 to-rose-500" />
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400 font-black text-sm">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            {article.source && (
                              <Badge variant="outline" className="text-[10px] shrink-0">{article.source}</Badge>
                            )}
                            {article.pubDate && (
                              <span className="text-[10px] text-muted-foreground">
                                {safePubDate(article.pubDate)}
                              </span>
                            )}
                          </div>
                          <h3 className="font-semibold text-sm leading-snug mb-2 text-foreground">{article.title}</h3>
                          {article.description && (
                            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">{article.description}</p>
                          )}
                          <div className="mt-3 flex items-center gap-2 p-2 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
                            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                            <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                              AI 경각심 문구가 자동 생성되어 이메일에 포함됩니다
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              <Card className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <Send className="w-5 h-5 text-amber-600" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">발송 준비 완료</p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                        AI가 각 뉴스를 요약·편집하여 이메일로 발송합니다. 수신자: {effectiveConfig.recipients.join(', ')}
                      </p>
                    </div>
                    <Button
                      onClick={() => sendEmailMutation.mutate()}
                      disabled={sendEmailMutation.isPending}
                      className="ml-auto shrink-0 gap-2 bg-red-600 hover:bg-red-700 text-white"
                    >
                      {sendEmailMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      지금 발송
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>

        {/* ── 발송 설정 탭 ──────────────────────────────────────────────── */}
        <TabsContent value="settings" className="space-y-4">
          {configLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* 자동 발송 ON/OFF */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Settings className="w-4 h-4 text-primary" />
                    자동 발송 설정
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40">
                    <div>
                      <p className="text-sm font-semibold">자동 발송 활성화</p>
                      <p className="text-xs text-muted-foreground mt-0.5">설정한 요일과 시간에 자동으로 카드뉴스를 발송합니다</p>
                    </div>
                    <Switch
                      checked={effectiveConfig.enabled}
                      onCheckedChange={(v) => updateConfig({ enabled: v })}
                      data-testid="switch-auto-send"
                    />
                  </div>

                  {/* 발송 요일 */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> 발송 요일
                    </Label>
                    <div className="flex gap-2 flex-wrap">
                      {DAY_OPTIONS.map(({ key, label }) => (
                        <button
                          key={key}
                          onClick={() => toggleDay(key)}
                          className={`w-10 h-10 rounded-full text-sm font-semibold transition-all ${
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

                  {/* 발송 시간 */}
                  <div className="space-y-2">
                    <Label htmlFor="send-time" className="text-sm font-semibold flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" /> 발송 시간
                    </Label>
                    <Input
                      id="send-time"
                      type="time"
                      value={effectiveConfig.time}
                      onChange={(e) => updateConfig({ time: e.target.value })}
                      className="w-36"
                      data-testid="input-send-time"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* 수신자 관리 */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Mail className="w-4 h-4 text-primary" />
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
                      className="flex-1"
                      data-testid="input-new-recipient"
                    />
                    <Button onClick={addRecipient} variant="outline" size="icon" data-testid="button-add-recipient">
                      <Plus className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {effectiveConfig.recipients.map((email) => (
                      <div
                        key={email}
                        className="flex items-center gap-1.5 bg-muted/60 px-3 py-1.5 rounded-full text-sm"
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

              {/* 저장 버튼 */}
              <div className="flex items-center justify-between">
                {isDirty && (
                  <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    변경사항이 있습니다. 저장해주세요.
                  </p>
                )}
                <Button
                  onClick={() => saveConfigMutation.mutate(effectiveConfig)}
                  disabled={saveConfigMutation.isPending || !isDirty}
                  className={`ml-auto gap-2 ${isDirty ? "bg-red-600 hover:bg-red-700 text-white" : ""}`}
                  data-testid="button-save-config"
                >
                  {saveConfigMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  설정 저장
                </Button>
              </div>

              {/* 현황 요약 */}
              <Card className="border-0 bg-muted/30">
                <CardContent className="p-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">자동 발송</p>
                      <Badge className={effectiveConfig.enabled ? "bg-green-500 text-white" : "bg-muted text-muted-foreground"}>
                        {effectiveConfig.enabled ? "활성화" : "비활성화"}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">발송 요일</p>
                      <p className="text-sm font-semibold">
                        {effectiveConfig.days.length === 0
                          ? "없음"
                          : effectiveConfig.days.map(d => DAY_OPTIONS.find(o => o.key === d)?.label).join(" ")}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">발송 시간</p>
                      <p className="text-sm font-semibold">{effectiveConfig.time}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">수신자</p>
                      <p className="text-sm font-semibold">{effectiveConfig.recipients.length}명</p>
                    </div>
                  </div>
                  {config?.lastSent && (
                    <p className="text-xs text-muted-foreground text-center mt-3 pt-3 border-t">
                      마지막 발송: {safeFormat(config.lastSent, "yyyy년 M월 d일 HH:mm", { locale: ko })}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
