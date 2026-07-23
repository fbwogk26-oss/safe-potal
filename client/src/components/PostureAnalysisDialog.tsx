import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, ChevronRight, ChevronLeft, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, Dumbbell, RefreshCw, Upload,
} from "lucide-react";

// ─── SVG 인체 실루엣 ────────────────────────────────────────────────────────

/** 자세 1: 정자세 (정면, 팔 자연스럽게 내림) */
function PoseFront({ color = "#6d28d9" }: { color?: string }) {
  return (
    <svg viewBox="0 0 100 220" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-sm">
      {/* 머리 */}
      <circle cx="50" cy="20" r="16" fill={color} opacity="0.9" />
      {/* 목 */}
      <rect x="44" y="35" width="12" height="11" rx="4" fill={color} opacity="0.8" />
      {/* 몸통 */}
      <rect x="28" y="46" width="44" height="50" rx="9" fill={color} opacity="0.85" />
      {/* 왼팔 (아래로) */}
      <rect x="12" y="50" width="16" height="42" rx="8" fill={color} opacity="0.75" />
      {/* 오른팔 (아래로) */}
      <rect x="72" y="50" width="16" height="42" rx="8" fill={color} opacity="0.75" />
      {/* 왼손 */}
      <ellipse cx="20" cy="97" rx="8" ry="7" fill={color} opacity="0.65" />
      {/* 오른손 */}
      <ellipse cx="80" cy="97" rx="8" ry="7" fill={color} opacity="0.65" />
      {/* 왼쪽 다리 */}
      <rect x="29" y="96" width="18" height="62" rx="9" fill={color} opacity="0.8" />
      {/* 오른쪽 다리 */}
      <rect x="53" y="96" width="18" height="62" rx="9" fill={color} opacity="0.8" />
      {/* 왼발 */}
      <ellipse cx="38" cy="162" rx="14" ry="8" fill={color} opacity="0.65" />
      {/* 오른발 */}
      <ellipse cx="62" cy="162" rx="14" ry="8" fill={color} opacity="0.65" />
      {/* 어깨선 강조 */}
      <line x1="28" y1="52" x2="12" y2="56" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
      <line x1="72" y1="52" x2="88" y2="56" stroke={color} strokeWidth="3" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

/** 자세 2: 양팔 벌리기 (정면, 팔을 수평으로 쭉 뻗음) */
function PoseSpread({ color = "#7c3aed" }: { color?: string }) {
  return (
    <svg viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-sm">
      {/* 머리 */}
      <circle cx="110" cy="20" r="16" fill={color} opacity="0.9" />
      {/* 목 */}
      <rect x="104" y="35" width="12" height="11" rx="4" fill={color} opacity="0.8" />
      {/* 몸통 */}
      <rect x="88" y="46" width="44" height="50" rx="9" fill={color} opacity="0.85" />
      {/* 왼팔 (수평) */}
      <rect x="4" y="52" width="84" height="16" rx="8" fill={color} opacity="0.8" />
      {/* 오른팔 (수평) */}
      <rect x="132" y="52" width="84" height="16" rx="8" fill={color} opacity="0.8" />
      {/* 왼손 */}
      <ellipse cx="9" cy="60" rx="8" ry="7" fill={color} opacity="0.65" />
      {/* 오른손 */}
      <ellipse cx="211" cy="60" rx="8" ry="7" fill={color} opacity="0.65" />
      {/* 어깨 강조점 */}
      <circle cx="88" cy="60" r="6" fill={color} opacity="0.55" />
      <circle cx="132" cy="60" r="6" fill={color} opacity="0.55" />
      {/* 왼쪽 다리 */}
      <rect x="89" y="96" width="18" height="62" rx="9" fill={color} opacity="0.8" />
      {/* 오른쪽 다리 */}
      <rect x="113" y="96" width="18" height="62" rx="9" fill={color} opacity="0.8" />
      {/* 왼발 */}
      <ellipse cx="98" cy="162" rx="14" ry="8" fill={color} opacity="0.65" />
      {/* 오른발 */}
      <ellipse cx="122" cy="162" rx="14" ry="8" fill={color} opacity="0.65" />
    </svg>
  );
}

/** 자세 3: 옆모습 (측면, 팔 자연스럽게 내림) */
function PoseSide({ color = "#059669" }: { color?: string }) {
  return (
    <svg viewBox="0 0 90 220" xmlns="http://www.w3.org/2000/svg" className="w-full h-full drop-shadow-sm">
      {/* 머리 (측면 — 타원) */}
      <ellipse cx="50" cy="20" rx="14" ry="16" fill={color} opacity="0.9" />
      {/* 얼굴 방향 표시 (코) */}
      <path d="M 62 20 Q 68 18 66 24" fill={color} opacity="0.6" />
      {/* 목 */}
      <rect x="43" y="35" width="12" height="11" rx="4" fill={color} opacity="0.8" />
      {/* 몸통 (측면 — 좁음) */}
      <rect x="34" y="46" width="28" height="50" rx="8" fill={color} opacity="0.85" />
      {/* 앞팔 (몸 앞쪽) */}
      <rect x="20" y="52" width="14" height="38" rx="7" fill={color} opacity="0.7" />
      {/* 뒷팔 희미하게 */}
      <rect x="56" y="52" width="11" height="34" rx="5" fill={color} opacity="0.35" />
      {/* 앞손 */}
      <ellipse cx="27" cy="95" rx="7" ry="6" fill={color} opacity="0.55" />
      {/* 앞다리 */}
      <rect x="34" y="96" width="16" height="62" rx="8" fill={color} opacity="0.8" />
      {/* 뒷다리 (희미하게) */}
      <rect x="44" y="96" width="14" height="58" rx="7" fill={color} opacity="0.4" />
      {/* 발 (옆으로) */}
      <ellipse cx="38" cy="162" rx="18" ry="8" fill={color} opacity="0.65" />
      {/* 척추 강조선 */}
      <line x1="48" y1="46" x2="48" y2="96" stroke="white" strokeWidth="2" strokeDasharray="3 3" opacity="0.4" />
    </svg>
  );
}

// ─── POSES 데이터 ──────────────────────────────────────────────────────────

interface PostureIssue {
  area: string;
  severity: "주의" | "경고" | "양호";
  description: string;
}

interface ExerciseRec {
  name: string;
  targetArea: string;
  description: string;
  frequency: string;
  caution: string;
}

interface PostureResult {
  overallScore: number;
  summary: string;
  issues: PostureIssue[];
  exercises: ExerciseRec[];
  lifestyleAdvice: string;
}

const POSES = [
  {
    key: "front" as const,
    label: "정자세",
    Illustration: PoseFront,
    illustrationColor: "#3b82f6",
    instruction: "카메라를 정면으로 바라보며 자연스럽게 서주세요.",
    details: [
      "발을 어깨 너비로 벌리고 서주세요",
      "팔은 몸 옆에 자연스럽게 내려주세요",
      "전신이 나오도록 2~3m 거리를 유지하세요",
      "머리부터 발끝까지 모두 보이게 해주세요",
    ],
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    bgColorHex: "#eff6ff",
    borderColor: "border-blue-200 dark:border-blue-800",
    iconColor: "text-blue-600 dark:text-blue-400",
    badgeClass: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  },
  {
    key: "spread" as const,
    label: "양팔 벌리기",
    Illustration: PoseSpread,
    illustrationColor: "#7c3aed",
    instruction: "양팔을 수평으로 쭉 펴고 정면을 바라보며 서주세요.",
    details: [
      "양팔을 어깨 높이로 수평으로 쭉 펴주세요",
      "손바닥은 아래를 향하게 해주세요",
      "전신이 모두 보이도록 충분한 거리를 유지하세요",
      "어깨와 팔의 좌우 균형이 잘 보이도록 해주세요",
    ],
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    bgColorHex: "#f5f3ff",
    borderColor: "border-purple-200 dark:border-purple-800",
    iconColor: "text-purple-600 dark:text-purple-400",
    badgeClass: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  },
  {
    key: "side" as const,
    label: "옆모습",
    Illustration: PoseSide,
    illustrationColor: "#059669",
    instruction: "옆으로 90° 돌아서 서주세요. 왼쪽·오른쪽 어느 쪽이든 괜찮습니다.",
    details: [
      "카메라를 향해 옆으로 90° 돌아서 주세요",
      "팔은 몸 옆에 자연스럽게 내려주세요",
      "머리부터 발끝까지 측면 전신이 보이게 해주세요",
      "척추와 다리 라인이 잘 보이도록 해주세요",
    ],
    bgColor: "bg-green-50 dark:bg-green-950/30",
    bgColorHex: "#f0fdf4",
    borderColor: "border-green-200 dark:border-green-800",
    iconColor: "text-green-600 dark:text-green-400",
    badgeClass: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
  },
];

// ─── 메인 컴포넌트 ──────────────────────────────────────────────────────────

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function PostureAnalysisDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | 0 | 1 | 2 | "analyzing" | "result">("intro");
  const [photos, setPhotos] = useState<Record<string, File | null>>({ front: null, spread: null, side: null });
  const [previews, setPreviews] = useState<Record<string, string>>({ front: "", spread: "", side: "" });
  const [result, setResult] = useState<PostureResult | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [captured, setCaptured] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentPoseIdx = typeof step === "number" ? step : -1;
  const currentPose = currentPoseIdx >= 0 ? POSES[currentPoseIdx] : null;
  const currentKey = currentPose?.key;

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  const startCamera = useCallback(async () => {
    setCameraError(false);
    setCaptured(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraActive(true);
    } catch {
      setCameraError(true);
    }
  }, []);

  useEffect(() => {
    if (typeof step === "number") {
      stopCamera();
      startCamera();
    } else {
      stopCamera();
    }
    return () => { stopCamera(); };
  }, [step]);

  useEffect(() => {
    if (!open) {
      stopCamera();
      setStep("intro");
      setPhotos({ front: null, spread: null, side: null });
      setPreviews({ front: "", spread: "", side: "" });
      setResult(null);
      setCaptured(false);
    }
  }, [open]);

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current || !currentKey) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) return;
      const file = new File([blob], `${currentKey}.jpg`, { type: "image/jpeg" });
      const url = URL.createObjectURL(blob);
      setPhotos(p => ({ ...p, [currentKey]: file }));
      setPreviews(p => ({ ...p, [currentKey]: url }));
      setCaptured(true);
      stopCamera();
    }, "image/jpeg", 0.9);
  };

  const retakePhoto = () => {
    if (!currentKey) return;
    setPhotos(p => ({ ...p, [currentKey]: null }));
    setPreviews(p => ({ ...p, [currentKey]: "" }));
    setCaptured(false);
    startCamera();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !currentKey) return;
    const url = URL.createObjectURL(file);
    setPhotos(p => ({ ...p, [currentKey]: file }));
    setPreviews(p => ({ ...p, [currentKey]: url }));
    setCaptured(true);
  };

  const goNextStep = () => {
    if (currentPoseIdx === 2) analyzePosture();
    else if (currentPoseIdx >= 0) { setCaptured(false); setStep((currentPoseIdx + 1) as 0 | 1 | 2); }
  };

  const goPrevStep = () => {
    if (currentPoseIdx > 0) {
      setCaptured(!!previews[POSES[currentPoseIdx - 1].key]);
      setStep((currentPoseIdx - 1) as 0 | 1 | 2);
    }
  };

  const analyzePosture = async () => {
    setStep("analyzing");
    try {
      const fd = new FormData();
      if (photos.front) fd.append("front", photos.front);
      if (photos.spread) fd.append("spread", photos.spread);
      if (photos.side) fd.append("side", photos.side);
      const res = await fetch("/api/musculoskeletal/analyze-posture", {
        method: "POST", body: fd, credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data: PostureResult = await res.json();
      setResult(data);
      setStep("result");
    } catch (err: any) {
      toast({ variant: "destructive", title: "분석 실패", description: err?.message || "다시 시도해주세요." });
      setStep(2);
    }
  };

  const severityColor = (s: string) => {
    if (s === "경고") return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400";
    if (s === "주의") return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400";
    return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400";
  };
  const severityIcon = (s: string) => {
    if (s === "경고") return <AlertTriangle className="w-4 h-4" />;
    if (s === "주의") return <AlertCircle className="w-4 h-4" />;
    return <CheckCircle2 className="w-4 h-4" />;
  };
  const scoreColor = (n: number) => n >= 80 ? "text-green-600 dark:text-green-400" : n >= 60 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400";
  const scoreLabel = (n: number) => n >= 80 ? "양호" : n >= 60 ? "보통" : "주의 필요";

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <Dumbbell className="w-5 h-5" />
            AI 자세 분석 & 추천운동
          </DialogTitle>
        </DialogHeader>

        {/* ── 인트로 ────────────────────────────────────────────────────── */}
        {step === "intro" && (
          <div className="space-y-5 py-2">
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
              <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-1">📸 3가지 자세로 AI 분석</h3>
              <p className="text-sm text-muted-foreground">
                아래 3가지 자세로 사진을 촬영하면 GPT-4o AI가 자세를 분석하고 맞춤 운동을 추천해드립니다.
              </p>
            </div>

            {/* 자세 카드 3개 — SVG 일러스트 강조 */}
            <div className="grid grid-cols-3 gap-3">
              {POSES.map((pose, i) => {
                const Illus = pose.Illustration;
                return (
                  <div key={pose.key} className={`${pose.bgColor} ${pose.borderColor} border rounded-2xl pt-4 pb-3 px-3 flex flex-col items-center gap-1 text-center`}>
                    {/* 번호 뱃지 */}
                    <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full mb-1 ${pose.badgeClass}`}>자세 {i + 1}</span>
                    {/* 실루엣 그림 — 카드 폭 맞게 크게 */}
                    <div className="w-full flex items-center justify-center" style={{ height: pose.key === "spread" ? 72 : 90 }}>
                      <div style={{ height: pose.key === "spread" ? 72 : 90, width: pose.key === "spread" ? 160 : 64 }}>
                        <Illus color={pose.illustrationColor} />
                      </div>
                    </div>
                    <span className={`text-base font-extrabold mt-1 ${pose.iconColor}`}>{pose.label}</span>
                    <p className="text-[11px] text-muted-foreground leading-snug">{pose.instruction}</p>
                  </div>
                );
              })}
            </div>

            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground mb-1.5">📌 촬영 전 준비사항</p>
              <p>• 전신이 보이도록 2~3m 거리에서 촬영해주세요</p>
              <p>• 밝은 공간에서 촬영하면 더 정확한 분석이 가능합니다</p>
              <p>• 몸의 윤곽이 잘 보이는 옷을 입으면 좋습니다</p>
              <p>• 카메라가 없으면 사진 파일 업로드도 가능합니다</p>
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2" onClick={() => setStep(0)}>
              <Camera className="w-4 h-4" /> 촬영 시작하기
            </Button>
          </div>
        )}

        {/* ── 촬영 스텝 (0·1·2) ─────────────────────────────────────────── */}
        {typeof step === "number" && currentPose && (() => {
          const Illus = currentPose.Illustration;
          return (
            <div className="space-y-3 py-2">
              {/* 진행 바 */}
              <div className="flex gap-1.5">
                {POSES.map((p, i) => (
                  <div key={p.key} className={`flex-1 h-2 rounded-full transition-all ${
                    i < step ? "bg-purple-500" : i === step ? "bg-purple-400" : "bg-muted"
                  }`} />
                ))}
              </div>

              {/* 자세 안내 패널 — 그림 + 설명 나란히 */}
              <div className={`${currentPose.bgColor} ${currentPose.borderColor} border rounded-2xl overflow-hidden`}>
                <div className="flex gap-0">
                  {/* 왼쪽: 실루엣 일러스트 (큼직하게) */}
                  <div className="flex items-center justify-center p-4 shrink-0" style={{ width: currentPose.key === "spread" ? 140 : 100, background: "rgba(255,255,255,0.45)" }}>
                    <div style={{ height: 120, width: currentPose.key === "spread" ? 120 : 72 }}>
                      <Illus color={currentPose.illustrationColor} />
                    </div>
                  </div>
                  {/* 오른쪽: 텍스트 */}
                  <div className="py-3 pr-4 pl-2 flex flex-col justify-center gap-1.5 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge className={`text-xs shrink-0 ${currentPose.badgeClass} border-0`}>자세 {currentPoseIdx + 1}/3</Badge>
                      <span className={`font-bold text-base ${currentPose.iconColor}`}>{currentPose.label}</span>
                    </div>
                    <p className={`text-sm font-medium ${currentPose.iconColor}`}>{currentPose.instruction}</p>
                    <ul className="space-y-0.5">
                      {currentPose.details.map((d, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex gap-1">
                          <span className="shrink-0 mt-0.5">•</span>
                          <span>{d}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {/* 카메라/미리보기 */}
              <div className="relative bg-black rounded-xl overflow-hidden" style={{ minHeight: 260 }}>
                {!captured ? (
                  <>
                    <video ref={videoRef} autoPlay playsInline muted
                      className={`w-full object-cover ${cameraActive ? "block" : "hidden"}`}
                      style={{ maxHeight: 300 }} />
                    {/* 전신 가이드 프레임 (카메라 활성 시) */}
                    {cameraActive && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <div className="border-2 border-white/40 border-dashed rounded-lg"
                          style={{ width: "38%", height: "88%", boxShadow: "0 0 0 9999px rgba(0,0,0,0.18)" }}>
                          <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-white/70 text-[10px] whitespace-nowrap">전신이 이 안에 들어오게</span>
                        </div>
                      </div>
                    )}
                    {!cameraActive && !cameraError && (
                      <div className="flex flex-col items-center justify-center h-60 gap-3 text-white/60">
                        <Loader2 className="w-8 h-8 animate-spin" />
                        <p className="text-sm">카메라 연결 중...</p>
                      </div>
                    )}
                    {cameraError && (
                      <div className="flex flex-col items-center justify-center h-60 gap-4 text-white/80 p-6">
                        <Camera className="w-10 h-10 opacity-50" />
                        <p className="text-sm text-center">카메라를 사용할 수 없습니다.<br />사진 파일을 업로드해주세요.</p>
                        <Button variant="outline" size="sm"
                          className="bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2"
                          onClick={() => fileInputRef.current?.click()}>
                          <Upload className="w-4 h-4" /> 사진 업로드
                        </Button>
                      </div>
                    )}
                  </>
                ) : (
                  <img src={previews[currentKey!]} alt="촬영된 사진"
                    className="w-full object-cover" style={{ maxHeight: 300 }} />
                )}
                <canvas ref={canvasRef} className="hidden" />
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
              </div>

              {/* 촬영 버튼 */}
              <div className="flex gap-2">
                {!captured ? (
                  <>
                    {cameraActive && (
                      <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2 h-12 text-base" onClick={capturePhoto}>
                        <Camera className="w-5 h-5" /> 촬영하기
                      </Button>
                    )}
                    {cameraError && (
                      <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2 h-12" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="w-5 h-5" /> 사진 선택
                      </Button>
                    )}
                    {!cameraActive && !cameraError && (
                      <Button variant="outline" className="flex-1 h-12 gap-2" onClick={() => fileInputRef.current?.click()}>
                        <Upload className="w-4 h-4" /> 파일로 업로드
                      </Button>
                    )}
                  </>
                ) : (
                  <Button variant="outline" className="flex-1 gap-2 h-12" onClick={retakePhoto}>
                    <RefreshCw className="w-4 h-4" /> 다시 촬영
                  </Button>
                )}
              </div>

              {/* 이전/다음 */}
              <div className="flex gap-2">
                <Button variant="outline" className="gap-1" onClick={goPrevStep} disabled={currentPoseIdx === 0}>
                  <ChevronLeft className="w-4 h-4" /> 이전
                </Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2"
                  disabled={!captured} onClick={goNextStep}>
                  {currentPoseIdx === 2
                    ? <><Dumbbell className="w-4 h-4" /> AI 분석 시작</>
                    : <>다음 자세 <ChevronRight className="w-4 h-4" /></>}
                </Button>
              </div>

              {/* 진행 현황 */}
              <div className="flex gap-2 justify-center pt-1">
                {POSES.map((p, i) => {
                  const PIllus = p.Illustration;
                  const done = !!previews[p.key];
                  const active = i === step;
                  return (
                    <div key={p.key} className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border transition-all ${
                      done ? "bg-green-50 border-green-200 text-green-700 dark:bg-green-900/20 dark:border-green-800 dark:text-green-400"
                        : active ? `${p.bgColor} ${p.borderColor} ${p.iconColor}`
                        : "bg-muted border-transparent text-muted-foreground"
                    }`}>
                      {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Camera className="w-3.5 h-3.5" />}
                      {p.label}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── 분석 중 ───────────────────────────────────────────────────── */}
        {step === "analyzing" && (
          <div className="flex flex-col items-center justify-center gap-6 py-12">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                <Dumbbell className="w-10 h-10 text-purple-600 dark:text-purple-400" />
              </div>
              <Loader2 className="w-24 h-24 animate-spin text-purple-400 absolute -top-2 -left-2 opacity-40" />
            </div>
            <div className="text-center space-y-2">
              <p className="font-semibold text-lg">AI가 자세를 분석하고 있습니다</p>
              <p className="text-sm text-muted-foreground">3장의 사진을 기반으로 맞춤 운동을 추천 중입니다...</p>
              <p className="text-xs text-muted-foreground">최대 30~60초 소요될 수 있습니다</p>
            </div>
            {/* 촬영된 사진 미리보기 */}
            <div className="flex gap-3">
              {POSES.map(p => previews[p.key] && (
                <div key={p.key} className="text-center">
                  <img src={previews[p.key]} alt={p.label}
                    className="w-20 h-20 object-cover rounded-lg border-2 border-white shadow-md" />
                  <p className="text-[10px] text-muted-foreground mt-1">{p.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 결과 ──────────────────────────────────────────────────────── */}
        {step === "result" && result && (
          <div className="space-y-5 py-2">
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800 rounded-xl p-5 text-center">
              <p className="text-sm text-muted-foreground mb-1">자세 평가 점수</p>
              <div className={`text-6xl font-black mb-1 ${scoreColor(result.overallScore)}`}>{result.overallScore}</div>
              <Badge className={`${result.overallScore >= 80 ? "bg-green-500" : result.overallScore >= 60 ? "bg-yellow-500" : "bg-red-500"} text-white text-sm px-3`}>
                {scoreLabel(result.overallScore)}
              </Badge>
              <p className="text-sm text-muted-foreground mt-3 text-left leading-relaxed">{result.summary}</p>
            </div>

            {result.issues && result.issues.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-semibold flex items-center gap-2"><AlertCircle className="w-4 h-4 text-orange-500" /> 자세 분석 결과</h4>
                {result.issues.map((issue, i) => (
                  <div key={i} className={`${severityColor(issue.severity)} border rounded-lg p-3 flex gap-3`}>
                    <div className="flex items-start gap-2 flex-1">
                      {severityIcon(issue.severity)}
                      <div>
                        <span className="font-semibold text-sm">{issue.area}</span>
                        <p className="text-xs mt-0.5 opacity-90">{issue.description}</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="shrink-0 text-xs h-fit">{issue.severity}</Badge>
                  </div>
                ))}
              </div>
            )}

            {result.exercises && result.exercises.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2"><Dumbbell className="w-4 h-4 text-purple-600" /> 맞춤 추천 운동</h4>
                {result.exercises.map((ex, i) => (
                  <div key={i} className="border rounded-xl p-4 space-y-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-700 dark:text-purple-400 font-bold text-sm shrink-0">{i + 1}</div>
                        <div>
                          <p className="font-semibold text-sm">{ex.name}</p>
                          <Badge variant="outline" className="text-[11px] h-5">{ex.targetArea}</Badge>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 bg-muted px-2 py-1 rounded-full">{ex.frequency}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pl-9">{ex.description}</p>
                    {ex.caution && (
                      <p className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded px-3 py-1.5 pl-9">⚠️ {ex.caution}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.lifestyleAdvice && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">💡 일상생활 자세 개선 팁</h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  {result.lifestyleAdvice.split("\n").filter(Boolean).map((line, i) => <p key={i}>{line}</p>)}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1 gap-2" onClick={() => {
                setStep(0);
                setPhotos({ front: null, spread: null, side: null });
                setPreviews({ front: "", spread: "", side: "" });
                setResult(null);
                setCaptured(false);
              }}>
                <RefreshCw className="w-4 h-4" /> 다시 분석하기
              </Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2" onClick={onClose}>
                <CheckCircle2 className="w-4 h-4" /> 확인 완료
              </Button>
            </div>
            <p className="text-center text-xs text-muted-foreground">
              * AI 분석 결과는 참고용이며, 정확한 진단은 전문의 상담을 권장합니다.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
