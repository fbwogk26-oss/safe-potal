import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Send, Sparkles, CheckCircle2, ChevronRight, Camera } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePermissions } from "@/hooks/use-permissions";

const PRESET_CITIES = ["대구", "구미", "문경", "포항", "안동", "울릉도", "울진"];

interface WeatherData {
  city: string;
  tempC: number;
  feelsLikeC: number;
  tempMaxC: number;
  tempMinC: number;
  humidity: number;
  windspeedKmph: number;
  windspeedMs: number;
  precipMM: number;
  precipProb: number;
  uvIndex: number;
  snowCM: number;
  weatherDesc: string;
  weatherCode: string;
  pm10: number | null;
  pm10Grade: string | null;
  pm10Color: string | null;
  warningFactor: string;
  riskFactor: string;
  safetyAction: string;
  specialReport: string;
  fetchedAt: string;
}

function getWeatherEmoji(code: string, tempC: number): string {
  const c = Number(code);
  if ([389, 392, 395].includes(c)) return "⛈️";
  if ([371, 374, 377, 350].includes(c)) return "🌨️";
  if ([338, 335, 332, 329, 326, 323, 320, 317, 314, 311].includes(c)) return "❄️";
  if ([308, 305, 302, 299, 296, 293, 266, 263].includes(c)) return "🌧️";
  if ([176].includes(c)) return "🌦️";
  if ([260, 248, 143].includes(c)) return "🌫️";
  if ([122, 119].includes(c)) return "☁️";
  if ([116].includes(c)) return "⛅";
  if ([113].includes(c)) return tempC >= 30 ? "☀️" : "🌤️";
  return "🌤️";
}

function getPm10Color(grade: string | null): string {
  if (grade === "좋음") return "#22c55e";
  if (grade === "보통") return "#eab308";
  if (grade === "나쁨") return "#f97316";
  if (grade === "매우나쁨") return "#ef4444";
  return "#94a3b8";
}

function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${d.getFullYear()}-${String(month).padStart(2,"0")}-${String(day).padStart(2,"0")} ${h}:${m}`;
}

async function captureElementAsBlob(el: HTMLElement): Promise<Blob> {
  const html2canvas = (await import("html2canvas")).default;
  const canvas = await html2canvas(el, {
    scale: 2,
    useCORS: true,
    allowTaint: true,
    backgroundColor: "#ffffff",
    logging: false,
    width: el.offsetWidth,
    height: el.offsetHeight,
    windowWidth: el.scrollWidth,
    windowHeight: el.scrollHeight,
  });
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("캡처 실패"));
    }, "image/png");
  });
}

async function uploadImage(blob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append("image", blob, filename);
  const res = await fetch("/api/upload", {
    method: "POST",
    credentials: "include",
    body: formData,
  });
  if (!res.ok) throw new Error("이미지 업로드 실패");
  const data = await res.json();
  return data.fileUrl as string;
}

export default function WeatherSafetyMessage() {
  const { canRegisterNotices } = usePermissions();
  const { toast } = useToast();
  const [city, setCity] = useState("대구");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [posted, setPosted] = useState(false);
  const [aiGenerated, setAiGenerated] = useState(false);
  const [captureEnabled, setCaptureEnabled] = useState(true);
  const weatherCardRef = useRef<HTMLDivElement>(null);

  const weatherQuery = useQuery<WeatherData>({
    queryKey: ["/api/weather/current", city],
    queryFn: async () => {
      const res = await fetch(`/api/weather/current?city=${encodeURIComponent(city)}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("날씨 정보를 불러오는데 실패했습니다.");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/weather/generate-message", { city });
      return res.json() as Promise<{ weather: WeatherData; message: { title: string; content: string } }>;
    },
    onSuccess: (data) => {
      setEditTitle(data.message.title);
      setEditContent(data.message.content);
      setPosted(false);
      setAiGenerated(true);
    },
    onError: (err: any) => {
      toast({ title: "생성 실패", description: err?.message ?? "날씨 메시지 생성에 실패했습니다.", variant: "destructive" });
    },
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined = undefined;

      if (captureEnabled && weatherCardRef.current) {
        try {
          toast({ title: "화면 캡처 중...", description: "날씨 카드를 이미지로 저장하고 있습니다." });
          const blob = await captureElementAsBlob(weatherCardRef.current);
          const filename = `weather_${city}_${Date.now()}.png`;
          imageUrl = await uploadImage(blob, filename);
        } catch (captureErr) {
          console.warn("날씨 카드 캡처 실패 (이미지 없이 게시):", captureErr);
        }
      }

      const res = await apiRequest("POST", "/api/weather/post-notice", {
        city,
        title: editTitle,
        content: editContent,
        imageUrl,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      setPosted(true);
      toast({ title: "게시 완료", description: captureEnabled ? "날씨 카드 이미지와 함께 공지로 등록되었습니다." : "날씨 안전메시지가 공지로 등록되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "게시 실패", description: err?.message ?? "게시에 실패했습니다.", variant: "destructive" });
    },
  });

  const weather = weatherQuery.data;
  const isLoading = weatherQuery.isLoading;

  const stats = weather ? [
    { label: "강수량", value: `${weather.precipMM}` + (weather.precipMM > 0 ? " mm" : ""), unit: "" },
    { label: "강수확률", value: `${weather.precipProb}%`, unit: "" },
    { label: "풍속", value: `${weather.windspeedMs}m/s`, unit: "" },
    { label: "습도", value: `${weather.humidity}%`, unit: "" },
    { label: "적설량", value: weather.snowCM > 0 ? `${weather.snowCM}cm` : "적설없음", unit: "" },
    {
      label: "미세먼지/황사",
      value: weather.pm10 !== null ? `${weather.pm10}μg/m³` : "정보없음",
      unit: "",
      color: weather.pm10Color ?? undefined,
    },
  ] : [];

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">

      {/* 출처 헤더 */}
      <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border">
        <div className="flex items-center gap-2">
          <span className="inline-flex gap-0.5">
            <span className="bg-green-600 text-white text-[9px] font-bold px-1 py-0.5 rounded-sm">OPEN</span>
            <span className="bg-gray-600 text-white text-[9px] font-bold px-1 py-0.5 rounded-sm">공공</span>
          </span>
          <span>출처: 기상청, 한국환경공단</span>
        </div>
        {weather && (
          <span>최종 갱신: {formatFetchedAt(weather.fetchedAt)}</span>
        )}
      </div>

      {/* 날씨 카드 (캡처 대상) */}
      <div ref={weatherCardRef} className="bg-white dark:bg-card border rounded-xl shadow-sm overflow-hidden">
        {/* 도시 선택 */}
        <div className="border-b px-4 py-3">
          <Select value={city} onValueChange={(v) => { setCity(v); setAiGenerated(false); setPosted(false); }}>
            <SelectTrigger className="w-full border-0 shadow-none text-base font-semibold focus:ring-0 px-0 h-auto">
              <div className="flex items-center gap-2">
                <span className="text-primary text-lg">📍</span>
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent>
              {PRESET_CITIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 날씨 본문 */}
        {isLoading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            <span className="text-sm">날씨 정보를 불러오는 중...</span>
          </div>
        ) : weatherQuery.isError ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            날씨 정보를 불러오지 못했습니다.
            <Button variant="ghost" size="sm" className="ml-2" onClick={() => weatherQuery.refetch()}>
              다시 시도
            </Button>
          </div>
        ) : weather ? (
          <div className="flex flex-col sm:flex-row">
            {/* 좌측: 날씨 정보 */}
            <div className="flex-1 p-4 space-y-4">
              {/* 온도 & 아이콘 */}
              <div className="flex items-center gap-3">
                <span className="text-5xl" role="img">
                  {getWeatherEmoji(weather.weatherCode, weather.tempC)}
                </span>
                <div>
                  <div className="text-5xl font-bold text-foreground leading-none">
                    {weather.tempC}°C
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    최고 {weather.tempMaxC}.0°C ~ 최저 {weather.tempMinC}.0°C
                  </div>
                </div>
              </div>

              {/* 경고요인 / 위험요인 / 안전조치 */}
              <div className="space-y-1.5 text-sm">
                <div className="flex gap-2">
                  <span className="font-semibold text-orange-600 w-16 shrink-0">경고요인</span>
                  <span className="text-foreground">{weather.warningFactor}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-red-600 w-16 shrink-0">위험요인</span>
                  <span className="text-foreground">{weather.riskFactor}</span>
                </div>
                <div className="flex gap-2">
                  <span className="font-semibold text-blue-600 w-16 shrink-0">안전조치</span>
                  <span className="text-foreground">{weather.safetyAction}</span>
                </div>
              </div>

              {/* 기상특보 */}
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900 text-sm">
                <span className="text-blue-500 text-base">ℹ️</span>
                <span className="font-medium text-blue-700 dark:text-blue-400">기상특보</span>
                <span className="text-blue-600 dark:text-blue-300">{weather.specialReport}</span>
              </div>
            </div>

            {/* 우측: Safety message 버튼 + 통계 */}
            <div className="sm:w-44 border-t sm:border-t-0 sm:border-l p-4 space-y-3">
              {/* Safety message 버튼 */}
              <Button
                onClick={() => generateMutation.mutate()}
                disabled={generateMutation.isPending}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white gap-1 text-sm font-semibold"
              >
                {generateMutation.isPending ? (
                  <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 생성중...</>
                ) : (
                  <>Safety message <ChevronRight className="w-3.5 h-3.5" /></>
                )}
              </Button>

              {/* 날씨 수치 목록 */}
              <div className="space-y-1.5">
                {stats.map(({ label, value, color }) => (
                  <div key={label} className="flex items-center justify-between text-xs gap-1">
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                      <span>{label}</span>
                    </div>
                    <span
                      className="font-semibold tabular-nums"
                      style={color ? { color } : undefined}
                    >
                      {value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* AI 메시지 편집 패널 */}
      <AnimatePresence>
        {aiGenerated && (
          <motion.div
            key="ai-panel"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="bg-white dark:bg-card border rounded-xl shadow-sm overflow-hidden"
          >
            <div className="px-4 py-3 border-b flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-violet-500" />
              <span className="font-semibold text-sm">AI 생성 안전메시지</span>
              <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200 font-medium">
                수정 가능
              </span>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">제목</label>
                <Input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  placeholder="메시지 제목"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">내용</label>
                <Textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  placeholder="메시지 내용"
                  className="min-h-[200px] resize-y"
                />
              </div>

              {/* 화면 캡처 첨부 옵션 */}
              {weather && (
                <div
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors select-none ${
                    captureEnabled
                      ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                      : "bg-muted/40 border-border"
                  }`}
                  onClick={() => setCaptureEnabled((v) => !v)}
                >
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                    captureEnabled ? "bg-blue-600 border-blue-600" : "border-muted-foreground"
                  }`}>
                    {captureEnabled && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  <Camera className={`w-3.5 h-3.5 ${captureEnabled ? "text-blue-600" : "text-muted-foreground"}`} />
                  <span className={`text-xs font-medium ${captureEnabled ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}>
                    날씨 카드 이미지 첨부
                  </span>
                  <span className="text-[10px] text-muted-foreground ml-auto">
                    {captureEnabled ? "첨부됨" : "첨부 안 함"}
                  </span>
                </div>
              )}

              {posted ? (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-green-700">공지 게시 완료!</p>
                    <p className="text-xs text-green-600">
                      {captureEnabled ? "날씨 카드 이미지와 함께 " : ""}공지/알림 메뉴에서 확인할 수 있습니다.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    className="gap-2 flex-1"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${generateMutation.isPending ? "animate-spin" : ""}`} />
                    재생성
                  </Button>
                  {canRegisterNotices && (
                    <Button
                      onClick={() => postMutation.mutate()}
                      disabled={postMutation.isPending || !editTitle.trim() || !editContent.trim()}
                      className="gap-2 flex-1"
                    >
                      {postMutation.isPending ? (
                        <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {captureEnabled ? "캡처 중..." : "게시중..."}</>
                      ) : (
                        <>{captureEnabled ? <Camera className="w-3.5 h-3.5" /> : <Send className="w-3.5 h-3.5" />} 공지로 게시</>
                      )}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 로딩 중 AI 생성 표시 */}
      {generateMutation.isPending && !aiGenerated && (
        <div className="text-center py-8 text-muted-foreground">
          <RefreshCw className="w-8 h-8 mx-auto mb-2 animate-spin opacity-40" />
          <p className="text-sm">AI가 안전메시지를 생성하고 있습니다...</p>
        </div>
      )}
    </div>
  );
}
