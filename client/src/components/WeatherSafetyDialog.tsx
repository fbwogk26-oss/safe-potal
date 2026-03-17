import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  RefreshCw, Sparkles, CheckCircle2, Camera, ImageOff, Send,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const PRESET_CITIES = ["대구", "구미", "문경", "안동", "포항", "울릉도", "울진"];

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

function getWeatherEmojiUI(code: string, tempC: number): string {
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

function getWeatherEmojiText(code: string, tempC: number): string {
  const c = Number(code);
  if ([389, 392, 395].includes(c)) return "천둥번개";
  if ([371, 374, 377, 350].includes(c)) return "진눈깨비";
  if ([338, 335, 332, 329, 326, 323, 320, 317, 314, 311].includes(c)) return "눈";
  if ([308, 305, 302, 299, 296, 293, 266, 263].includes(c)) return "비";
  if ([176].includes(c)) return "소나기";
  if ([260, 248, 143].includes(c)) return "안개";
  if ([122, 119].includes(c)) return "흐림";
  if ([116].includes(c)) return "구름";
  if ([113].includes(c)) return tempC >= 30 ? "맑음(더움)" : "맑음";
  return "맑음";
}

function formatFetchedAt(iso: string): string {
  const d = new Date(iso);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const h = d.getHours().toString().padStart(2, "0");
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${d.getFullYear()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")} ${h}:${m}`;
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number): number {
  const words = text.split("");
  let line = "";
  let currentY = y;
  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i];
    if (ctx.measureText(testLine).width > maxWidth && i > 0) {
      ctx.fillText(line, x, currentY);
      line = words[i];
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, currentY);
  return currentY;
}

async function createWeatherImageBlob(weather: WeatherData, city: string): Promise<Blob> {
  const W = 640, H = 340;
  const canvas = document.createElement("canvas");
  canvas.width = W * 2; canvas.height = H * 2;
  canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);

  const now = new Date();
  const dateStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  const grad = ctx.createLinearGradient(0, 0, W, 0);
  grad.addColorStop(0, "#1e40af");
  grad.addColorStop(1, "#2563eb");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, 52);

  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px sans-serif";
  ctx.fillText(`${city} 날씨 안전메시지`, 16, 22);
  ctx.font = "12px sans-serif";
  ctx.fillStyle = "#bfdbfe";
  ctx.fillText(dateStr, 16, 40);

  ctx.fillStyle = "rgba(255,255,255,0.15)";
  ctx.font = "bold 12px sans-serif";
  ctx.fillText("KT MOS남부 종합안전포털", W - 170, 34);

  ctx.fillStyle = "#f8fafc";
  ctx.fillRect(0, 52, 200, H - 52);

  ctx.fillStyle = "#1e3a8a";
  ctx.font = "bold 56px sans-serif";
  ctx.fillText(`${weather.tempC}°`, 16, 120);

  ctx.fillStyle = "#374151";
  ctx.font = "11px sans-serif";
  ctx.fillText(`최고 ${weather.tempMaxC}°C / 최저 ${weather.tempMinC}°C`, 16, 138);
  ctx.fillText(`체감 ${weather.feelsLikeC}°C · ${getWeatherEmojiText(weather.weatherCode, weather.tempC)}`, 16, 156);

  ctx.strokeStyle = "#e5e7eb";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(16, 172); ctx.lineTo(184, 172);
  ctx.stroke();

  const stats = [
    ["강수량", weather.precipMM > 0 ? `${weather.precipMM}mm` : "없음"],
    ["강수확률", `${weather.precipProb}%`],
    ["풍속", `${weather.windspeedMs}m/s`],
    ["습도", `${weather.humidity}%`],
    ["적설량", weather.snowCM > 0 ? `${weather.snowCM}cm` : "없음"],
    ["미세먼지", weather.pm10 !== null ? `${weather.pm10}μg/m³` : "-"],
  ];
  stats.forEach(([label, val], i) => {
    const yy = 188 + i * 22;
    ctx.fillStyle = "#9ca3af"; ctx.font = "10px sans-serif";
    ctx.fillText(label, 16, yy);
    ctx.fillStyle = "#111827"; ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "right"; ctx.fillText(val, 190, yy); ctx.textAlign = "left";
  });

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(208, 52, W - 208, H - 52);

  const factors = [
    { label: "경고요인", value: weather.warningFactor, color: "#d97706", bg: "#fffbeb", border: "#fde68a" },
    { label: "위험요인", value: weather.riskFactor, color: "#dc2626", bg: "#fef2f2", border: "#fecaca" },
    { label: "안전조치", value: weather.safetyAction, color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe" },
  ];
  let fy = 68;
  factors.forEach(({ label, value, color, bg, border }) => {
    const lineH = 15;
    const approxLines = Math.ceil(value.length / 30) + 1;
    const boxH = 14 + approxLines * lineH + 8;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(216, fy, W - 232, boxH, 4);
    ctx.fill();
    ctx.strokeStyle = border; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.fillStyle = color; ctx.font = "bold 10px sans-serif";
    ctx.fillText(label, 224, fy + 12);
    ctx.fillStyle = "#374151"; ctx.font = "11px sans-serif";
    wrapText(ctx, value, 224, fy + 26, W - 240, lineH);
    fy += boxH + 6;
  });

  ctx.fillStyle = "#eff6ff";
  ctx.beginPath(); ctx.roundRect(216, fy, W - 232, 34, 4); ctx.fill();
  ctx.strokeStyle = "#bfdbfe"; ctx.lineWidth = 0.8; ctx.stroke();
  ctx.fillStyle = "#1d4ed8"; ctx.font = "bold 10px sans-serif";
  ctx.fillText("기상특보", 224, fy + 13);
  ctx.fillStyle = "#1e40af"; ctx.font = "10px sans-serif";
  ctx.fillText(weather.specialReport.substring(0, 55), 224, fy + 27);

  ctx.fillStyle = "#f1f5f9"; ctx.fillRect(0, H - 24, W, 24);
  ctx.fillStyle = "#9ca3af"; ctx.font = "9px sans-serif";
  ctx.fillText("출처: 기상청 · 한국환경공단", 12, H - 9);
  ctx.textAlign = "right";
  ctx.fillText(formatFetchedAt(weather.fetchedAt) + " 기준", W - 12, H - 9);
  ctx.textAlign = "left";

  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("이미지 생성 실패"))), "image/png");
  });
}

async function uploadImage(blob: Blob, filename: string): Promise<string> {
  const formData = new FormData();
  formData.append("image", blob, filename);
  const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: formData });
  if (!res.ok) throw new Error(`업로드 실패 (${res.status})`);
  const data = await res.json();
  return (data.imageUrl ?? data.fileUrl) as string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialCity?: string;
}

export default function WeatherSafetyDialog({ open, onOpenChange, initialCity = "대구" }: Props) {
  const { toast } = useToast();
  const [city, setCity] = useState(initialCity);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [aiGenerated, setAiGenerated] = useState(false);
  const [captureEnabled, setCaptureEnabled] = useState(true);
  const [posted, setPosted] = useState(false);

  const weatherQuery = useQuery<WeatherData>({
    queryKey: ["/api/weather/current", city],
    queryFn: async () => {
      const res = await fetch(`/api/weather/current?city=${encodeURIComponent(city)}`, { credentials: "include" });
      if (!res.ok) throw new Error("날씨 정보를 불러오는데 실패했습니다.");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    enabled: open,
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/weather/generate-message", { city });
      return res.json() as Promise<{ weather: WeatherData; message: { title: string; content: string } | string }>;
    },
    onSuccess: (data: any) => {
      const now = new Date();
      const mm = String(now.getMonth() + 1).padStart(2, "0");
      const dd = String(now.getDate()).padStart(2, "0");
      setEditTitle(`${mm}.${dd} Safety Message`);
      const content = typeof data.message === "string" ? data.message : data.message?.content ?? "";
      setEditContent(content);
      setPosted(false);
      setAiGenerated(true);
    },
    onError: (err: any) => {
      toast({ title: "생성 실패", description: err?.message ?? "메시지 생성에 실패했습니다.", variant: "destructive" });
    },
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      let imageUrl: string | undefined;
      const weather = weatherQuery.data;
      if (captureEnabled && weather) {
        try {
          const blob = await createWeatherImageBlob(weather, city);
          imageUrl = await uploadImage(blob, `weather_${city}_${Date.now()}.png`);
        } catch (err: any) {
          toast({ title: "이미지 첨부 실패", description: "이미지 없이 공지를 등록합니다.", variant: "destructive" });
        }
      }
      const res = await apiRequest("POST", "/api/weather/post-notice", { city, title: editTitle, content: editContent, imageUrl });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      setPosted(true);
      toast({
        title: "게시 완료",
        description: captureEnabled ? "날씨 카드 이미지와 함께 공지로 등록됐습니다." : "날씨 안전메시지가 공지로 등록됐습니다.",
      });
    },
    onError: (err: any) => {
      toast({ title: "게시 실패", description: err?.message ?? "게시에 실패했습니다.", variant: "destructive" });
    },
  });

  const weather = weatherQuery.data;

  function handleClose() {
    onOpenChange(false);
    setAiGenerated(false);
    setPosted(false);
    setEditTitle("");
    setEditContent("");
  }

  function handleCityChange(v: string) {
    setCity(v);
    setAiGenerated(false);
    setPosted(false);
  }

  const stats = weather ? [
    { label: "강수량", value: weather.precipMM > 0 ? `${weather.precipMM}mm` : "없음" },
    { label: "강수확률", value: `${weather.precipProb}%` },
    { label: "풍속", value: `${weather.windspeedMs}m/s` },
    { label: "습도", value: `${weather.humidity}%` },
    { label: "적설량", value: weather.snowCM > 0 ? `${weather.snowCM}cm` : "없음" },
    { label: "미세먼지", value: weather.pm10 !== null ? `${weather.pm10}μg/m³` : "-", color: weather.pm10Color ?? undefined },
  ] : [];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0 gap-0">
        <DialogHeader className="px-5 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2 text-base">
            <span>🛡️</span> 날씨 안전메시지
          </DialogTitle>
          <DialogDescription className="text-xs">
            날씨 정보를 바탕으로 AI 안전메시지를 생성하고 공지로 게시합니다.
          </DialogDescription>
        </DialogHeader>

        <div className="p-4 space-y-4">
          {/* 출처 + 갱신시각 */}
          <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg border">
            <div className="flex items-center gap-1.5">
              <span className="bg-green-600 text-white text-[9px] font-bold px-1 py-0.5 rounded-sm">OPEN</span>
              <span className="bg-gray-600 text-white text-[9px] font-bold px-1 py-0.5 rounded-sm">공공</span>
              <span>출처: 기상청, 한국환경공단</span>
            </div>
            {weather && <span>최종 갱신: {formatFetchedAt(weather.fetchedAt)}</span>}
          </div>

          {/* 날씨 카드 */}
          <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
            {/* 도시 선택 */}
            <div className="border-b px-4 py-2.5">
              <Select value={city} onValueChange={handleCityChange}>
                <SelectTrigger className="w-full border-0 shadow-none text-base font-semibold focus:ring-0 px-0 h-auto">
                  <div className="flex items-center gap-2">
                    <span className="text-primary text-lg">📍</span>
                    <SelectValue />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {PRESET_CITIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* 날씨 본문 */}
            {weatherQuery.isLoading ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground gap-2">
                <RefreshCw className="w-5 h-5 animate-spin" />
                <span className="text-sm">날씨 정보를 불러오는 중...</span>
              </div>
            ) : weatherQuery.isError ? (
              <div className="text-center py-8 text-muted-foreground text-sm">
                날씨 정보를 불러오지 못했습니다.
                <Button variant="ghost" size="sm" className="ml-2" onClick={() => weatherQuery.refetch()}>다시 시도</Button>
              </div>
            ) : weather ? (
              <div className="flex flex-col sm:flex-row">
                {/* 좌측: 날씨 정보 */}
                <div className="flex-1 p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <span className="text-5xl">{getWeatherEmojiUI(weather.weatherCode, weather.tempC)}</span>
                    <div>
                      <div className="text-4xl font-bold leading-none">{weather.tempC}°C</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        최고 {weather.tempMaxC}°C ~ 최저 {weather.tempMinC}°C
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1 text-sm">
                    {[
                      { label: "경고요인", value: weather.warningFactor, color: "text-orange-600" },
                      { label: "위험요인", value: weather.riskFactor, color: "text-red-600" },
                      { label: "안전조치", value: weather.safetyAction, color: "text-blue-600" },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="flex gap-2">
                        <span className={`font-semibold ${color} w-16 shrink-0`}>{label}</span>
                        <span className="text-foreground text-xs leading-snug">{value}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex items-start gap-2 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-100 dark:border-blue-900 text-xs">
                    <span className="text-blue-500 shrink-0">ℹ️</span>
                    <span className="font-medium text-blue-700 dark:text-blue-400 shrink-0">기상특보</span>
                    <span className="text-blue-600 dark:text-blue-300">{weather.specialReport}</span>
                  </div>
                </div>

                {/* 우측: AI 생성 버튼 + 수치 */}
                <div className="sm:w-44 border-t sm:border-t-0 sm:border-l p-4 space-y-3">
                  <Button
                    onClick={() => generateMutation.mutate()}
                    disabled={generateMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold gap-1"
                  >
                    {generateMutation.isPending
                      ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 생성중...</>
                      : <><Sparkles className="w-3.5 h-3.5" /> AI 메시지 생성</>
                    }
                  </Button>

                  <div className="space-y-1.5">
                    {stats.map(({ label, value, color }) => (
                      <div key={label} className="flex items-center justify-between text-xs gap-1">
                        <div className="flex items-center gap-1 text-muted-foreground">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
                          {label}
                        </div>
                        <span className="font-semibold tabular-nums" style={color ? { color } : undefined}>{value}</span>
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
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="bg-card border rounded-xl overflow-hidden shadow-sm"
              >
                <div className="px-4 py-2.5 border-b flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  <span className="font-semibold text-sm">AI 생성 안전메시지</span>
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 border border-violet-200 font-medium">수정 가능</span>
                </div>

                <div className="p-4 space-y-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">제목</label>
                    <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} placeholder="메시지 제목" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">내용</label>
                    <Textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="메시지 내용"
                      className="min-h-[160px] resize-y"
                    />
                  </div>

                  {/* 날씨 카드 이미지 첨부 옵션 */}
                  {weather && (
                    <div
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors select-none ${
                        captureEnabled
                          ? "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800"
                          : "bg-muted/40 border-border"
                      }`}
                      onClick={() => setCaptureEnabled((v) => !v)}
                    >
                      <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${captureEnabled ? "bg-blue-600 border-blue-600" : "border-muted-foreground/50"}`}>
                        {captureEnabled && (
                          <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                            <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                      </div>
                      {captureEnabled
                        ? <Camera className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        : <ImageOff className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                      }
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-medium ${captureEnabled ? "text-blue-700 dark:text-blue-300" : "text-muted-foreground"}`}>
                          날씨 카드 이미지 첨부
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {captureEnabled ? "공지에 날씨 정보 이미지가 함께 등록됩니다" : "이미지 없이 텍스트만 등록됩니다"}
                        </p>
                      </div>
                      <span className={`text-[10px] font-medium shrink-0 ${captureEnabled ? "text-blue-600" : "text-muted-foreground"}`}>
                        {captureEnabled ? "ON" : "OFF"}
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
                        size="sm"
                      >
                        {generateMutation.isPending
                          ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 재생성 중...</>
                          : <><RefreshCw className="w-3.5 h-3.5" /> 재생성</>
                        }
                      </Button>
                      <Button
                        onClick={() => postMutation.mutate()}
                        disabled={postMutation.isPending || !editTitle.trim() || !editContent.trim()}
                        className="gap-2 flex-1"
                        size="sm"
                      >
                        {postMutation.isPending
                          ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> 게시 중...</>
                          : <><Send className="w-3.5 h-3.5" /> 공지로 게시</>
                        }
                      </Button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
