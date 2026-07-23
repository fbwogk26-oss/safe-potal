import { useState, useRef, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Camera, ChevronRight, ChevronLeft, Loader2, CheckCircle2,
  AlertTriangle, AlertCircle, Dumbbell, RefreshCw, Upload, SwitchCamera,
  FileDown, User,
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

interface CompletedPerson {
  id: number;
  name: string;
  department: string;
  age: string;
  gender: string;
}

export default function PostureAnalysisDialog({ open, onClose }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState<"intro" | 0 | 1 | 2 | "analyzing" | "result">("intro");
  const [photos, setPhotos] = useState<Record<string, File | null>>({ front: null, spread: null, side: null });
  const [previews, setPreviews] = useState<Record<string, string>>({ front: "", spread: "", side: "" });
  const [result, setResult] = useState<PostureResult | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState(false);
  const [cameraRequested, setCameraRequested] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("environment");
  const [captured, setCaptured] = useState(false);
  const [workerInfo, setWorkerInfo] = useState<CompletedPerson | null>(null);

  const { data: completedPersons = [] } = useQuery<CompletedPerson[]>({
    queryKey: ["/api/musculoskeletal/completed-persons"],
    enabled: open,
  });

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

  const startCamera = useCallback(async (facing?: "user" | "environment") => {
    setCameraError(false);
    setCaptured(false);

    if (!navigator?.mediaDevices?.getUserMedia) {
      setCameraError(true);
      return;
    }

    // 지정된 방향 우선, 없으면 기본값(environment) → 반대 방향 → 제약 없음
    const preferred = facing ?? "environment";
    const fallback = preferred === "environment" ? "user" : "environment";
    const constraints: MediaStreamConstraints[] = [
      { video: { facingMode: preferred, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: fallback, width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: true },
    ];

    for (const c of constraints) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(c);
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setCameraActive(true);
        return;
      } catch {
        // 다음 제약 조건으로 재시도
      }
    }
    setCameraError(true);
  }, []);

  const flipCamera = useCallback(async () => {
    const next = facingMode === "environment" ? "user" : "environment";
    setFacingMode(next);
    stopCamera();
    await startCamera(next);
  }, [facingMode, stopCamera, startCamera]);

  // step이 바뀌면 카메라 정리 + 선택 화면으로 되돌리기 (자동 시작 안 함)
  useEffect(() => {
    stopCamera();
    setCameraRequested(false);
    setCameraError(false);
    setCaptured(false);
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
      setCameraRequested(false);
      setCameraError(false);
      setWorkerInfo(null);
    }
  }, [open]);

  const handlePdfExport = () => {
    if (!result) return;
    const w = window.open("", "_blank", "width=860,height=700");
    if (!w) {
      toast({ variant: "destructive", title: "팝업 차단됨", description: "브라우저에서 팝업을 허용한 후 다시 시도해주세요." });
      return;
    }
    const today = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
    const sc = result.overallScore >= 80 ? "#16a34a" : result.overallScore >= 60 ? "#ca8a04" : "#dc2626";
    const sl = result.overallScore >= 80 ? "양호" : result.overallScore >= 60 ? "보통" : "주의 필요";

    const personHtml = workerInfo ? `
      <div style="display:flex;gap:32px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:20px;">
        <div><p style="font-size:11px;color:#6b7280;margin:0 0 4px;">성명</p><p style="font-weight:700;font-size:16px;margin:0;">${workerInfo.name}</p></div>
        ${workerInfo.department ? `<div><p style="font-size:11px;color:#6b7280;margin:0 0 4px;">부서</p><p style="font-weight:700;font-size:16px;margin:0;">${workerInfo.department}</p></div>` : ""}
        ${workerInfo.age ? `<div><p style="font-size:11px;color:#6b7280;margin:0 0 4px;">연령</p><p style="font-weight:700;font-size:16px;margin:0;">${workerInfo.age}</p></div>` : ""}
        ${workerInfo.gender ? `<div><p style="font-size:11px;color:#6b7280;margin:0 0 4px;">성별</p><p style="font-weight:700;font-size:16px;margin:0;">${workerInfo.gender}</p></div>` : ""}
      </div>` : "";

    const issuesHtml = (result.issues ?? []).map(issue => {
      const bg = issue.severity === "경고" ? "#fef2f2" : issue.severity === "주의" ? "#fffbeb" : "#f0fdf4";
      const fg = issue.severity === "경고" ? "#991b1b" : issue.severity === "주의" ? "#92400e" : "#14532d";
      const bd = issue.severity === "경고" ? "#fecaca" : issue.severity === "주의" ? "#fde68a" : "#bbf7d0";
      return `<div style="background:${bg};border:1px solid ${bd};border-radius:8px;padding:12px 14px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span style="font-weight:600;font-size:13px;color:${fg};">${issue.area}</span>
          <span style="font-size:11px;color:${fg};border:1px solid ${bd};padding:2px 8px;border-radius:4px;">${issue.severity}</span>
        </div>
        <p style="font-size:12px;color:${fg};opacity:0.9;margin:6px 0 0;">${issue.description}</p>
      </div>`;
    }).join("");

    const exercisesHtml = (result.exercises ?? []).map((ex, i) => `
      <div style="border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:12px;">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
          <span style="width:26px;height:26px;background:#ede9fe;color:#7c3aed;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0;">${i + 1}</span>
          <div style="flex:1;">
            <p style="font-weight:600;margin:0;font-size:14px;">${ex.name}</p>
            <span style="font-size:11px;color:#6b7280;border:1px solid #e5e7eb;padding:1px 6px;border-radius:4px;">${ex.targetArea}</span>
          </div>
          <span style="font-size:11px;color:#6b7280;background:#f3f4f6;padding:4px 10px;border-radius:12px;">${ex.frequency}</span>
        </div>
        <p style="font-size:13px;color:#374151;margin:0 0 0 36px;">${ex.description}</p>
        ${ex.caution ? `<p style="font-size:12px;color:#92400e;background:#fffbeb;border-radius:4px;padding:6px 12px;margin:8px 0 0 36px;">⚠️ ${ex.caution}</p>` : ""}
      </div>`).join("");

    const lifestyleHtml = result.lifestyleAdvice ? `
      <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:16px;margin-top:20px;">
        <p style="font-weight:600;color:#1e40af;margin:0 0 8px;font-size:14px;">💡 일상생활 자세 개선 팁</p>
        ${result.lifestyleAdvice.split("\n").filter(Boolean).map(l => `<p style="font-size:13px;color:#374151;margin:4px 0;">${l}</p>`).join("")}
      </div>` : "";

    w.document.write(`<!DOCTYPE html><html lang="ko"><head><meta charset="UTF-8">
<title>AI 자세 분석 결과</title>
<style>
  body{font-family:'Malgun Gothic',sans-serif;margin:0;padding:36px;color:#111827;max-width:760px;margin:auto;}
  @media print{.no-print{display:none!important;}}
</style>
</head><body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;">
    <div>
      <h1 style="font-size:20px;font-weight:800;color:#7c3aed;margin:0 0 2px;">🏋️ AI 자세 분석 & 추천운동 결과</h1>
      <p style="color:#6b7280;font-size:12px;margin:0;">분석일: ${today}</p>
    </div>
    <button class="no-print" onclick="window.print()" style="background:#7c3aed;color:white;border:none;padding:9px 22px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:600;">📄 PDF 저장</button>
  </div>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0 20px;">
  ${personHtml}
  <div style="background:linear-gradient(135deg,#faf5ff,#eff6ff);border:1px solid #ddd6fe;border-radius:12px;padding:24px;text-align:center;margin-bottom:20px;">
    <p style="color:#6b7280;font-size:13px;margin:0 0 6px;">자세 평가 점수</p>
    <p style="font-size:64px;font-weight:900;color:${sc};margin:0 0 8px;">${result.overallScore}</p>
    <span style="background:${sc};color:white;padding:5px 18px;border-radius:999px;font-size:14px;font-weight:600;">${sl}</span>
    <p style="font-size:13px;color:#4b5563;margin:16px 0 0;text-align:left;line-height:1.6;">${result.summary}</p>
  </div>
  ${(result.issues ?? []).length > 0 ? `<h3 style="font-size:15px;font-weight:700;margin:0 0 10px;">🔍 자세 분석 결과</h3>${issuesHtml}` : ""}
  <h3 style="font-size:15px;font-weight:700;margin:20px 0 10px;">💪 맞춤 추천 운동</h3>
  ${exercisesHtml}
  ${lifestyleHtml}
  <p style="font-size:11px;color:#9ca3af;margin-top:28px;border-top:1px solid #e5e7eb;padding-top:12px;">
    * AI 분석 결과는 참고용이며, 정확한 진단은 전문의 상담을 권장합니다.
  </p>
</body></html>`);
    w.document.close();
  };

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
    setCameraRequested(false);
    setCameraError(false);
    stopCamera();
  };

  const requestCamera = async () => {
    setCameraRequested(true);
    await startCamera(facingMode);
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

            {/* 대상자 선택 (증상조사+면담 완료자) */}
            <div className="border rounded-xl p-4 space-y-2.5">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-purple-600" />
                <p className="font-medium text-sm">대상자 선택 <span className="text-xs text-muted-foreground font-normal">(선택사항 — PDF에 인적사항 자동 포함)</span></p>
              </div>
              {completedPersons.length === 0 ? (
                <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
                  증상조사 및 면담이 완료된 근로자가 없습니다. 선택 없이 분석만 진행할 수 있습니다.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {completedPersons.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setWorkerInfo(workerInfo?.id === p.id ? null : p)}
                      className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-full border transition-all ${
                        workerInfo?.id === p.id
                          ? "bg-purple-600 text-white border-purple-600"
                          : "bg-white dark:bg-background border-border text-foreground hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      }`}
                      data-testid={`button-select-person-${p.id}`}
                    >
                      <User className="w-3 h-3" />
                      {p.name}
                      {p.department && <span className="opacity-70">({p.department})</span>}
                    </button>
                  ))}
                </div>
              )}
              {workerInfo && (
                <div className="flex gap-4 bg-purple-50 dark:bg-purple-950/30 rounded-lg px-3 py-2 text-sm">
                  <span><span className="text-muted-foreground text-xs">성명</span> <strong>{workerInfo.name}</strong></span>
                  {workerInfo.department && <span><span className="text-muted-foreground text-xs">부서</span> <strong>{workerInfo.department}</strong></span>}
                  {workerInfo.age && <span><span className="text-muted-foreground text-xs">연령</span> <strong>{workerInfo.age}</strong></span>}
                  {workerInfo.gender && <span><span className="text-muted-foreground text-xs">성별</span> <strong>{workerInfo.gender}</strong></span>}
                </div>
              )}
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

              {/* 숨겨진 유틸 요소 - 항상 DOM에 존재 */}
              <canvas ref={canvasRef} className="hidden" />
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />

              {/* ── 카메라 영상 컨테이너 (video는 항상 DOM에 마운트, display로만 토글) ── */}
              <div
                className="relative rounded-xl overflow-hidden bg-black"
                style={{ display: cameraActive && !captured ? "block" : "none" }}
              >
                <video ref={videoRef} autoPlay playsInline muted
                  className="w-full object-cover block" style={{ maxHeight: 300 }} />
                {/* 전면/후면 카메라 전환 버튼 */}
                <button
                  onClick={flipCamera}
                  className="absolute top-2 right-2 z-20 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 backdrop-blur-sm transition-colors"
                  title={facingMode === "environment" ? "셀프 카메라로 전환" : "후면 카메라로 전환"}
                >
                  <SwitchCamera className="w-5 h-5" />
                </button>
                {/* 자세 실루엣 오버레이 */}
                {currentPose && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                    <div style={{
                      width: currentPose.key === "spread" ? "80%" : "26%",
                      height: "84%",
                      opacity: 0.25,
                      filter: "drop-shadow(0 0 8px rgba(255,255,255,0.9))",
                    }}>
                      {currentPose.key === "front" && (
                        <svg viewBox="0 0 100 220" className="w-full h-full" fill="white">
                          <circle cx="50" cy="20" r="16"/>
                          <rect x="44" y="35" width="12" height="11" rx="4"/>
                          <rect x="28" y="46" width="44" height="50" rx="9"/>
                          <rect x="12" y="50" width="16" height="42" rx="8"/>
                          <rect x="72" y="50" width="16" height="42" rx="8"/>
                          <ellipse cx="20" cy="97" rx="8" ry="7"/>
                          <ellipse cx="80" cy="97" rx="8" ry="7"/>
                          <rect x="29" y="96" width="18" height="62" rx="9"/>
                          <rect x="53" y="96" width="18" height="62" rx="9"/>
                          <ellipse cx="38" cy="162" rx="14" ry="8"/>
                          <ellipse cx="62" cy="162" rx="14" ry="8"/>
                        </svg>
                      )}
                      {currentPose.key === "spread" && (
                        <svg viewBox="0 0 220 220" className="w-full h-full" fill="white">
                          <circle cx="110" cy="20" r="16"/>
                          <rect x="104" y="35" width="12" height="11" rx="4"/>
                          <rect x="88" y="46" width="44" height="50" rx="9"/>
                          <rect x="4" y="52" width="84" height="16" rx="8"/>
                          <rect x="132" y="52" width="84" height="16" rx="8"/>
                          <ellipse cx="9" cy="60" rx="8" ry="7"/>
                          <ellipse cx="211" cy="60" rx="8" ry="7"/>
                          <rect x="89" y="96" width="18" height="62" rx="9"/>
                          <rect x="113" y="96" width="18" height="62" rx="9"/>
                          <ellipse cx="98" cy="162" rx="14" ry="8"/>
                          <ellipse cx="122" cy="162" rx="14" ry="8"/>
                        </svg>
                      )}
                      {currentPose.key === "side" && (
                        <svg viewBox="0 0 90 220" className="w-full h-full" fill="white">
                          <ellipse cx="50" cy="20" rx="14" ry="16"/>
                          <path d="M 62 20 Q 68 18 66 24" opacity="0.7"/>
                          <rect x="43" y="35" width="12" height="11" rx="4"/>
                          <rect x="34" y="46" width="28" height="50" rx="8"/>
                          <rect x="20" y="52" width="14" height="38" rx="7"/>
                          <rect x="56" y="52" width="11" height="34" rx="5" opacity="0.4"/>
                          <ellipse cx="27" cy="95" rx="7" ry="6" opacity="0.6"/>
                          <rect x="34" y="96" width="16" height="62" rx="8"/>
                          <rect x="44" y="96" width="14" height="58" rx="7" opacity="0.4"/>
                          <ellipse cx="38" cy="162" rx="18" ry="8"/>
                        </svg>
                      )}
                    </div>
                    <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                      <span className="bg-black/55 text-white/90 text-[11px] px-3 py-1 rounded-full backdrop-blur-sm">
                        실루엣에 자세를 맞춰보세요
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {/* ── 상태별 UI ── */}
              {captured ? (
                /* 촬영 완료: 미리보기 */
                <div className="space-y-2">
                  <div className="relative rounded-xl overflow-hidden bg-black">
                    <img src={previews[currentKey!]} alt="촬영된 사진"
                      className="w-full object-cover" style={{ maxHeight: 300 }} />
                    <div className="absolute top-2 right-2">
                      <span className="bg-green-500 text-white text-xs px-2.5 py-1 rounded-full font-semibold flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> 촬영 완료
                      </span>
                    </div>
                  </div>
                  <Button variant="outline" className="w-full gap-2 h-11" onClick={retakePhoto}>
                    <RefreshCw className="w-4 h-4" /> 다시 촬영
                  </Button>
                </div>
              ) : !cameraRequested ? (
                /* 선택 화면 */
                <div className="rounded-xl border-2 border-dashed border-muted-foreground/20 bg-muted/30 flex flex-col items-center justify-center gap-4 py-8 px-4">
                  <p className="text-sm text-muted-foreground font-medium">사진을 어떻게 등록할까요?</p>
                  <div className="flex gap-3 w-full max-w-xs">
                    <Button
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white h-16 flex-col gap-1"
                      onClick={requestCamera}
                    >
                      <Camera className="w-6 h-6" />
                      <span className="text-xs">카메라 촬영</span>
                    </Button>
                    <Button
                      variant="outline"
                      className="flex-1 h-16 flex-col gap-1"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Upload className="w-6 h-6" />
                      <span className="text-xs">파일 업로드</span>
                    </Button>
                  </div>
                </div>
              ) : cameraError ? (
                /* 카메라 오류 */
                <div className="rounded-xl bg-black flex flex-col items-center justify-center gap-4 py-8 px-4 text-white/90" style={{ minHeight: 180 }}>
                  <div className="text-center">
                    <p className="font-semibold">카메라를 사용할 수 없습니다</p>
                    <p className="text-xs text-white/50 mt-1">브라우저에서 카메라 권한을 허용하거나<br />파일로 업로드해 주세요</p>
                  </div>
                  <Button size="lg" className="bg-purple-600 hover:bg-purple-500 text-white gap-2 px-8 font-semibold"
                    onClick={() => fileInputRef.current?.click()}>
                    <Upload className="w-5 h-5" /> 사진 파일 선택하기
                  </Button>
                  <button className="text-xs text-white/40 underline" onClick={requestCamera}>카메라 다시 시도</button>
                </div>
              ) : cameraActive ? (
                /* 카메라 활성: 촬영 버튼 */
                <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 h-12 text-base" onClick={capturePhoto}>
                  <Camera className="w-5 h-5" /> 지금 촬영하기
                </Button>
              ) : (
                /* 연결 중 */
                <div className="rounded-xl bg-black flex flex-col items-center justify-center gap-3 text-white/60" style={{ minHeight: 160 }}>
                  <Loader2 className="w-8 h-8 animate-spin" />
                  <p className="text-sm">카메라 연결 중...</p>
                </div>
              )}

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
            {/* 인적사항 카드 (대상자 선택된 경우) */}
            {workerInfo && (
              <div className="border rounded-xl p-4 flex flex-wrap gap-x-6 gap-y-2 bg-muted/30">
                <div>
                  <p className="text-[10px] text-muted-foreground">성명</p>
                  <p className="font-semibold text-sm">{workerInfo.name}</p>
                </div>
                {workerInfo.department && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">부서</p>
                    <p className="font-semibold text-sm">{workerInfo.department}</p>
                  </div>
                )}
                {workerInfo.age && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">연령</p>
                    <p className="font-semibold text-sm">{workerInfo.age}</p>
                  </div>
                )}
                {workerInfo.gender && (
                  <div>
                    <p className="text-[10px] text-muted-foreground">성별</p>
                    <p className="font-semibold text-sm">{workerInfo.gender}</p>
                  </div>
                )}
              </div>
            )}

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
              <Button variant="outline" className="gap-2" onClick={handlePdfExport} data-testid="button-pdf-export">
                <FileDown className="w-4 h-4" /> PDF 저장
              </Button>
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
