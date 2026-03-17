import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  CloudRain, Thermometer, Wind, Droplets, RefreshCw,
  Sparkles, Send, MapPin, Sun, CloudSnow, Zap,
  CheckCircle2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { usePermissions } from "@/hooks/use-permissions";

const PRESET_CITIES = [
  "대구", "서울", "부산", "대전", "광주", "인천", "울산", "수원", "창원", "전주",
];

interface WeatherData {
  city: string;
  tempC: number;
  feelsLikeC: number;
  humidity: number;
  windspeedKmph: number;
  precipMM: number;
  uvIndex: number;
  weatherDesc: string;
  fetchedAt: string;
}

interface GenerateResult {
  weather: WeatherData;
  message: { title: string; content: string };
}

function getWeatherIcon(desc: string, temp: number) {
  const d = desc.toLowerCase();
  if (d.includes("snow") || d.includes("눈")) return CloudSnow;
  if (d.includes("rain") || d.includes("비") || d.includes("drizzle")) return CloudRain;
  if (d.includes("thunder") || d.includes("번개") || d.includes("storm")) return Zap;
  if (temp >= 30) return Sun;
  return Sun;
}

function WeatherCard({ weather }: { weather: WeatherData }) {
  const Icon = getWeatherIcon(weather.weatherDesc, weather.tempC);
  const tempColor =
    weather.tempC >= 35 ? "#ef4444" :
    weather.tempC >= 30 ? "#f97316" :
    weather.tempC <= 0 ? "#3b82f6" :
    weather.tempC <= -10 ? "#1d4ed8" : "#10b981";

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <Card className="border-0 shadow-sm bg-gradient-to-br from-blue-50 to-sky-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-sm font-semibold">{weather.city}</span>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                {new Date(weather.fetchedAt).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })} 기준
              </Badge>
            </div>
            <Icon className="w-8 h-8 text-sky-400" />
          </div>
          <div className="flex items-end gap-2 mb-3">
            <span className="text-4xl font-bold leading-none" style={{ color: tempColor }}>
              {weather.tempC}°
            </span>
            <span className="text-sm text-muted-foreground mb-1">체감 {weather.feelsLikeC}°C</span>
          </div>
          <p className="text-sm text-muted-foreground mb-3">{weather.weatherDesc}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { icon: Droplets, label: "습도", value: `${weather.humidity}%`, color: "#3b82f6" },
              { icon: Wind, label: "바람", value: `${weather.windspeedKmph}km/h`, color: "#6366f1" },
              { icon: CloudRain, label: "강수", value: `${weather.precipMM}mm`, color: "#06b6d4" },
            ].map(({ icon: Icon2, label, value, color }) => (
              <div key={label} className="bg-white rounded-lg p-2 shadow-sm">
                <Icon2 className="w-4 h-4 mx-auto mb-0.5" style={{ color }} />
                <p className="text-[10px] text-muted-foreground">{label}</p>
                <p className="text-xs font-bold">{value}</p>
              </div>
            ))}
          </div>
          {weather.windspeedKmph >= 30 && (
            <div className="mt-2 px-3 py-1.5 bg-orange-50 border border-orange-200 rounded-lg">
              <p className="text-[11px] text-orange-700 font-medium">⚠️ 강풍 주의 - 고소작업 위험</p>
            </div>
          )}
          {weather.precipMM > 5 && (
            <div className="mt-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[11px] text-blue-700 font-medium">🌧️ 강수 주의 - 미끄럼 사고 주의</p>
            </div>
          )}
          {weather.tempC >= 33 && (
            <div className="mt-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-[11px] text-red-700 font-medium">🌡️ 폭염 주의 - 온열질환 예방 필요</p>
            </div>
          )}
          {weather.tempC <= 0 && (
            <div className="mt-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-[11px] text-blue-700 font-medium">🧊 결빙 위험 - 넘어짐 사고 주의</p>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function WeatherSafetyMessage() {
  const { canRegisterNotices } = usePermissions();
  const { toast } = useToast();
  const [city, setCity] = useState("대구");
  const [result, setResult] = useState<GenerateResult | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [posted, setPosted] = useState(false);

  const generateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/weather/generate-message", { city });
      return res.json() as Promise<GenerateResult>;
    },
    onSuccess: (data) => {
      setResult(data);
      setEditTitle(data.message.title);
      setEditContent(data.message.content);
      setPosted(false);
    },
    onError: (err: any) => {
      toast({ title: "생성 실패", description: err?.message ?? "날씨 메시지 생성에 실패했습니다.", variant: "destructive" });
    },
  });

  const postMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/weather/post-notice", {
        city,
        title: editTitle,
        content: editContent,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      setPosted(true);
      toast({ title: "게시 완료", description: "날씨 안전메시지가 공지로 등록되었습니다." });
    },
    onError: (err: any) => {
      toast({ title: "게시 실패", description: err?.message ?? "게시에 실패했습니다.", variant: "destructive" });
    },
  });

  return (
    <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-5">

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold flex items-center gap-2">
          <CloudRain className="w-5 h-5 text-sky-500" />
          날씨 기반 안전메시지
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          현재 날씨를 분석해 AI가 맞춤 안전메시지를 작성하고 공지로 게시합니다.
        </p>
      </div>

      {/* City Selector */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2 pt-4 px-4">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> 도시 선택
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="도시명 입력 (예: 대구)"
              className="flex-1"
            />
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={!city.trim() || generateMutation.isPending}
              className="gap-2 shrink-0"
            >
              {generateMutation.isPending
                ? <RefreshCw className="w-4 h-4 animate-spin" />
                : <Sparkles className="w-4 h-4" />}
              {generateMutation.isPending ? "생성중..." : "메시지 생성"}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {PRESET_CITIES.map((c) => (
              <button
                key={c}
                onClick={() => setCity(c)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  city === c
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Results */}
      <AnimatePresence>
        {result && (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="space-y-4"
          >
            {/* Weather Card */}
            <WeatherCard weather={result.weather} />

            {/* AI Message Editor */}
            <Card className="border-0 shadow-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-violet-500" />
                  AI 생성 안전메시지
                  <Badge variant="outline" className="text-[10px] ml-1 text-violet-600 border-violet-200 bg-violet-50">
                    수정 가능
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-3">
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
                    className="min-h-[120px] resize-none"
                  />
                </div>

                {posted ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-green-700">공지 게시 완료!</p>
                      <p className="text-xs text-green-600">공지/알림 메뉴에서 확인할 수 있습니다.</p>
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
                        {postMutation.isPending
                          ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          : <Send className="w-3.5 h-3.5" />}
                        {postMutation.isPending ? "게시중..." : "공지로 게시"}
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Empty state */}
      {!result && !generateMutation.isPending && (
        <div className="text-center py-12 text-muted-foreground">
          <CloudRain className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">도시를 선택하고 <strong>메시지 생성</strong> 버튼을 눌러주세요.</p>
          <p className="text-xs mt-1">현재 날씨를 분석해 AI가 안전메시지를 자동 작성합니다.</p>
        </div>
      )}

      {generateMutation.isPending && (
        <div className="text-center py-12 text-muted-foreground">
          <RefreshCw className="w-10 h-10 mx-auto mb-3 animate-spin opacity-40" />
          <p className="text-sm">날씨 데이터를 가져오고 AI 메시지를 생성하고 있습니다...</p>
        </div>
      )}
    </div>
  );
}
