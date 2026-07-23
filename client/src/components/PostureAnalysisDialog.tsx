import { useState, useRef, useCallback, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, ChevronRight, ChevronLeft, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, Dumbbell, RefreshCw, X, Upload,
  PersonStanding, ArrowLeftRight, MoveRight
} from "lucide-react";

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
    icon: PersonStanding,
    instruction: "카메라를 정면으로 바라보며 자연스럽게 서주세요.",
    details: [
      "발을 어깨 너비로 벌리고 서주세요",
      "팔은 몸 옆에 자연스럽게 내려주세요",
      "전신이 나오도록 2~3m 거리를 유지하세요",
      "머리부터 발끝까지 모두 보이게 해주세요",
    ],
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    borderColor: "border-blue-200 dark:border-blue-800",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    key: "spread" as const,
    label: "양팔 벌리기",
    icon: ArrowLeftRight,
    instruction: "양팔을 수평으로 벌리고 정면을 바라보며 서주세요.",
    details: [
      "양팔을 어깨 높이로 수평으로 쭉 펴주세요",
      "손바닥은 아래를 향하게 해주세요",
      "전신이 모두 보이도록 충분한 거리를 유지하세요",
      "어깨와 팔의 좌우 균형이 잘 보이도록 해주세요",
    ],
    bgColor: "bg-purple-50 dark:bg-purple-950/30",
    borderColor: "border-purple-200 dark:border-purple-800",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    key: "side" as const,
    label: "옆모습",
    icon: MoveRight,
    instruction: "옆으로 90° 돌아서 서주세요. 왼쪽 또는 오른쪽 어느 방향이든 괜찮습니다.",
    details: [
      "카메라를 향해 옆으로 90° 돌아서 주세요",
      "팔은 몸 옆에 자연스럽게 내려주세요",
      "머리부터 발끝까지 측면 전신이 보이게 해주세요",
      "척추와 다리 라인이 잘 보이도록 해주세요",
    ],
    bgColor: "bg-green-50 dark:bg-green-950/30",
    borderColor: "border-green-200 dark:border-green-800",
    iconColor: "text-green-600 dark:text-green-400",
  },
];

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

  // 카메라 정지
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setCameraActive(false);
  }, []);

  // 카메라 시작
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

  // 스텝 변경 시 카메라 재시작
  useEffect(() => {
    if (typeof step === "number") {
      stopCamera();
      startCamera();
    } else {
      stopCamera();
    }
    return () => { stopCamera(); };
  }, [step]);

  // 다이얼로그 닫힐 때 정리
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
    if (currentPoseIdx === 2) {
      analyzePosture();
    } else if (currentPoseIdx >= 0) {
      setCaptured(false);
      setStep((currentPoseIdx + 1) as 0 | 1 | 2);
    }
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
        method: "POST",
        body: fd,
        credentials: "include",
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

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-green-600 dark:text-green-400";
    if (score >= 60) return "text-yellow-600 dark:text-yellow-400";
    return "text-red-600 dark:text-red-400";
  };

  const scoreLabel = (score: number) => {
    if (score >= 80) return "양호";
    if (score >= 60) return "보통";
    return "주의 필요";
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
            <Dumbbell className="w-5 h-5" />
            AI 자세 분석 & 추천운동
          </DialogTitle>
        </DialogHeader>

        {/* ── 인트로 ── */}
        {step === "intro" && (
          <div className="space-y-5 py-2">
            <div className="bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800 rounded-xl p-5">
              <h3 className="font-semibold text-purple-800 dark:text-purple-300 mb-2">📸 3가지 자세로 AI 분석</h3>
              <p className="text-sm text-muted-foreground">
                3가지 자세 사진을 촬영하면 GPT-4o AI가 자세를 분석하고, 신체 문제에 맞는 맞춤 운동을 추천해드립니다.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {POSES.map((pose, i) => {
                const Icon = pose.icon;
                return (
                  <div key={pose.key} className={`${pose.bgColor} ${pose.borderColor} border rounded-xl p-4 flex flex-col items-center gap-2 text-center`}>
                    <div className={`w-10 h-10 rounded-full bg-white dark:bg-slate-800 flex items-center justify-center shadow-sm`}>
                      <Icon className={`w-5 h-5 ${pose.iconColor}`} />
                    </div>
                    <span className="text-xs font-semibold text-foreground">자세 {i + 1}</span>
                    <span className={`text-sm font-bold ${pose.iconColor}`}>{pose.label}</span>
                    <p className="text-[11px] text-muted-foreground">{pose.instruction}</p>
                  </div>
                );
              })}
            </div>
            <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground space-y-1">
              <p className="font-medium text-foreground mb-2">📌 촬영 전 준비사항</p>
              <p>• 전신이 보이도록 2~3m 거리에서 촬영해주세요</p>
              <p>• 밝은 공간에서 촬영하면 더 정확한 분석이 가능합니다</p>
              <p>• 몸의 윤곽이 잘 보이는 옷을 입으면 좋습니다</p>
              <p>• 카메라가 없으면 사진 파일 업로드도 가능합니다</p>
            </div>
            <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2" onClick={() => setStep(0)}>
              <Camera className="w-4 h-4" />
              촬영 시작하기
            </Button>
          </div>
        )}

        {/* ── 촬영 스텝 (0, 1, 2) ── */}
        {typeof step === "number" && currentPose && (
          <div className="space-y-4 py-2">
            {/* 진행 표시 */}
            <div className="flex items-center gap-2">
              {POSES.map((p, i) => (
                <div key={p.key} className="flex items-center gap-2 flex-1">
                  <div className={`flex-1 h-1.5 rounded-full transition-all ${
                    i < step ? "bg-purple-500" : i === step ? "bg-purple-400" : "bg-muted"
                  }`} />
                  {i < POSES.length - 1 && null}
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2 mb-1">
              <Badge variant="outline" className={`${currentPose.iconColor} border-current`}>자세 {currentPoseIdx + 1}/3</Badge>
              <span className="font-semibold">{currentPose.label}</span>
            </div>

            {/* 안내 */}
            <div className={`${currentPose.bgColor} ${currentPose.borderColor} border rounded-lg p-3 text-sm space-y-1`}>
              <p className={`font-medium ${currentPose.iconColor}`}>{currentPose.instruction}</p>
              {currentPose.details.map((d, i) => <p key={i} className="text-muted-foreground text-xs">• {d}</p>)}
            </div>

            {/* 카메라/미리보기 영역 */}
            <div className="relative bg-black rounded-xl overflow-hidden" style={{ minHeight: 280 }}>
              {!captured ? (
                <>
                  <video ref={videoRef} autoPlay playsInline muted className={`w-full object-cover ${cameraActive ? "block" : "hidden"}`} style={{ maxHeight: 320 }} />
                  {!cameraActive && !cameraError && (
                    <div className="flex flex-col items-center justify-center h-64 gap-3 text-white/60">
                      <Loader2 className="w-8 h-8 animate-spin" />
                      <p className="text-sm">카메라 연결 중...</p>
                    </div>
                  )}
                  {cameraError && (
                    <div className="flex flex-col items-center justify-center h-64 gap-4 text-white/80 p-6">
                      <Camera className="w-10 h-10 opacity-50" />
                      <p className="text-sm text-center">카메라를 사용할 수 없습니다.<br />사진 파일을 업로드해주세요.</p>
                      <Button variant="outline" size="sm" className="bg-white/10 border-white/30 text-white hover:bg-white/20 gap-2"
                        onClick={() => fileInputRef.current?.click()}>
                        <Upload className="w-4 h-4" /> 사진 업로드
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                <img src={previews[currentKey!]} alt="촬영된 사진" className="w-full object-cover" style={{ maxHeight: 320 }} />
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
                      <Camera className="w-5 h-5" /> 촬영
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
            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="gap-1" onClick={goPrevStep} disabled={currentPoseIdx === 0}>
                <ChevronLeft className="w-4 h-4" /> 이전
              </Button>
              <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2"
                disabled={!captured}
                onClick={goNextStep}>
                {currentPoseIdx === 2 ? (
                  <><Dumbbell className="w-4 h-4" /> AI 분석 시작</>
                ) : (
                  <>다음 자세 <ChevronRight className="w-4 h-4" /></>
                )}
              </Button>
            </div>

            {/* 촬영 완료 현황 */}
            <div className="flex gap-2 justify-center">
              {POSES.map((p, i) => (
                <div key={p.key} className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full ${
                  previews[p.key] ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                    : i === step ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"
                    : "bg-muted text-muted-foreground"
                }`}>
                  {previews[p.key] ? <CheckCircle2 className="w-3 h-3" /> : <Camera className="w-3 h-3" />}
                  {p.label}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 분석 중 ── */}
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
          </div>
        )}

        {/* ── 결과 ── */}
        {step === "result" && result && (
          <div className="space-y-5 py-2">
            {/* 점수 */}
            <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-950/30 dark:to-blue-950/30 border border-purple-200 dark:border-purple-800 rounded-xl p-5 text-center">
              <p className="text-sm text-muted-foreground mb-1">자세 평가 점수</p>
              <div className={`text-6xl font-black mb-1 ${scoreColor(result.overallScore)}`}>{result.overallScore}</div>
              <Badge className={`${result.overallScore >= 80 ? "bg-green-500" : result.overallScore >= 60 ? "bg-yellow-500" : "bg-red-500"} text-white text-sm px-3`}>
                {scoreLabel(result.overallScore)}
              </Badge>
              <p className="text-sm text-muted-foreground mt-3 text-left leading-relaxed">{result.summary}</p>
            </div>

            {/* 분석된 문제점 */}
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

            {/* 추천 운동 */}
            {result.exercises && result.exercises.length > 0 && (
              <div className="space-y-3">
                <h4 className="font-semibold flex items-center gap-2"><Dumbbell className="w-4 h-4 text-purple-600" /> 맞춤 추천 운동</h4>
                {result.exercises.map((ex, i) => (
                  <div key={i} className="border rounded-xl p-4 space-y-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-700 dark:text-purple-400 font-bold text-sm shrink-0">
                          {i + 1}
                        </div>
                        <div>
                          <p className="font-semibold text-sm">{ex.name}</p>
                          <Badge variant="outline" className="text-[11px] h-5">{ex.targetArea}</Badge>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 bg-muted px-2 py-1 rounded-full">{ex.frequency}</span>
                    </div>
                    <p className="text-sm text-muted-foreground leading-relaxed pl-9">{ex.description}</p>
                    {ex.caution && (
                      <p className="text-xs text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-900/20 rounded px-3 py-1.5 pl-9">
                        ⚠️ {ex.caution}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 생활 습관 조언 */}
            {result.lifestyleAdvice && (
              <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-xl p-4">
                <h4 className="font-semibold text-blue-800 dark:text-blue-300 mb-2 flex items-center gap-2">
                  💡 일상생활 자세 개선 팁
                </h4>
                <div className="text-sm text-muted-foreground space-y-1">
                  {result.lifestyleAdvice.split("\n").filter(Boolean).map((line, i) => (
                    <p key={i}>{line}</p>
                  ))}
                </div>
              </div>
            )}

            {/* 다시 분석 버튼 */}
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
