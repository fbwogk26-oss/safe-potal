import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  GraduationCap, PenTool, CheckCircle2, Users, Calendar,
  BookOpen, Loader2, X, ChevronRight, Building2,
} from "lucide-react";

interface TaskInfo {
  id: number;
  title: string;
  startDate: string;
  endDate: string;
  field: string;
  educationType: string;
  sessions: {
    id: number;
    department: string;
    educationType: string;
    totalParticipants: number;
    signedCount: number;
    status: string;
  }[];
}

function SignaturePad({ onSave, onClear }: { onSave: (data: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (ctx) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasContent(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath(); ctx.moveTo(x, y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(x, y); ctx.stroke();
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => setIsDrawing(false), []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false); onClear();
  }, [onClear]);

  const save = useCallback(() => {
    if (!hasContent || !canvasRef.current) return;
    onSave(canvasRef.current.toDataURL("image/png"));
  }, [hasContent, onSave]);

  return (
    <div className="space-y-2">
      <div className="border-2 border-dashed border-primary/40 rounded-xl overflow-hidden bg-white shadow-inner">
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair"
          style={{ height: "160px", display: "block" }}
          onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
          onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={clear} className="gap-1.5">
          <X className="w-3.5 h-3.5" /> 지우기
        </Button>
        <Button size="sm" disabled={!hasContent} onClick={save} className="gap-1.5">
          <PenTool className="w-3.5 h-3.5" /> 서명 완료
        </Button>
      </div>
    </div>
  );
}

export default function PublicTaskSign() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [selectedSessionId, setSelectedSessionId] = useState<number | null>(null);
  const [selectedDept, setSelectedDept] = useState("");
  const [signerName, setSignerName] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [consentAgreed, setConsentAgreed] = useState(false);

  const { data: task, isLoading, isError } = useQuery<TaskInfo>({
    queryKey: ["/api/public/task", id],
    queryFn: async () => {
      const res = await fetch(`/api/public/task/${id}`);
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
    enabled: !!id,
    retry: false,
  });

  const signMutation = useMutation({
    mutationFn: async () => {
      if (!selectedSessionId) throw new Error("부서를 선택해주세요");
      const res = await fetch(`/api/public/education/${selectedSessionId}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          signerName,
          signerDepartment: selectedDept,
          signatureData,
          consentAgreed,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "서명 등록 실패");
      }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
    onError: (err: any) => toast({ variant: "destructive", title: "서명 실패", description: err.message }),
  });

  const handleSelectDept = (dept: string) => {
    const session = task?.sessions.find(s => s.department === dept);
    if (session) {
      setSelectedDept(dept);
      setSelectedSessionId(session.id);
      setSignatureData("");
      setPadKey(k => k + 1);
    }
  };

  const handleSubmit = () => {
    if (!selectedSessionId) {
      toast({ variant: "destructive", title: "부서를 선택해주세요." });
      return;
    }
    if (!signerName.trim()) {
      toast({ variant: "destructive", title: "이름을 입력해주세요." });
      return;
    }
    if (!signatureData) {
      toast({ variant: "destructive", title: "서명을 먼저 완료해주세요." });
      return;
    }
    if (!consentAgreed) {
      toast({ variant: "destructive", title: "개인정보 수집 및 전자서명에 동의해주세요." });
      return;
    }
    signMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-indigo-50 to-blue-50 p-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <X className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold">교육 정보를 찾을 수 없습니다</h2>
        <p className="text-sm text-muted-foreground text-center">링크가 올바른지 확인하거나 담당자에게 문의해주세요.</p>
      </div>
    );
  }

  if (task.sessions.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-indigo-50 to-blue-50 p-6">
        <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center">
          <BookOpen className="w-8 h-8 text-amber-500" />
        </div>
        <h2 className="text-xl font-bold">{task.title}</h2>
        <p className="text-sm text-muted-foreground text-center">아직 생성된 교육일지가 없습니다. 담당자에게 문의해주세요.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-indigo-50 to-blue-50 p-6">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">서명이 완료되었습니다!</h2>
          <p className="text-muted-foreground">{signerName}님의 서명이 성공적으로 등록되었습니다.</p>
        </div>
        <Card className="w-full max-w-sm border-primary/20">
          <CardContent className="p-4 space-y-1 text-sm">
            <p><span className="text-muted-foreground">교육명:</span> <span className="font-medium">{task.title}</span></p>
            <p><span className="text-muted-foreground">기간:</span> <span className="font-medium">{task.startDate} ~ {task.endDate}</span></p>
            <p><span className="text-muted-foreground">소속:</span> <span className="font-medium">{selectedDept}</span></p>
            <p><span className="text-muted-foreground">서명자:</span> <span className="font-medium">{signerName}</span></p>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">이 창을 닫아도 됩니다.</p>
      </div>
    );
  }

  const selectedSession = task.sessions.find(s => s.id === selectedSessionId);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md space-y-4">
          {/* 헤더 */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-wide mb-1">교육 참석자 서명</p>
              <h1 className="text-xl font-bold text-foreground">{task.title}</h1>
              <div className="flex items-center justify-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">{task.field}</Badge>
                <Badge variant="outline" className="text-xs">{task.educationType}</Badge>
              </div>
            </div>
          </div>

          {/* 교육 기간 정보 */}
          <Card className="border-primary/20 bg-white/80 backdrop-blur-sm">
            <CardContent className="p-4 flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium">{task.startDate} ~ {task.endDate}</span>
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Users className="w-4 h-4 text-muted-foreground" />
                <span className="text-muted-foreground">{task.sessions.length}개 부서</span>
              </div>
            </CardContent>
          </Card>

          {/* 부서 선택 */}
          <Card className="border-primary/20 bg-white/80 backdrop-blur-sm">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
                <Building2 className="w-4 h-4" /> 내 부서 선택
              </CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="grid grid-cols-1 gap-2 max-h-56 overflow-y-auto pr-1">
                {task.sessions.map(s => {
                  const rate = s.totalParticipants > 0
                    ? Math.round((s.signedCount / s.totalParticipants) * 100)
                    : 0;
                  const isDone = s.status === "완료" || rate >= 100;
                  const isSelected = selectedSessionId === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSelectDept(s.department)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-all ${
                        isSelected
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border hover:border-primary/50 hover:bg-primary/5"
                      }`}
                      data-testid={`button-dept-${s.id}`}
                    >
                      <span className="flex-1 font-medium text-sm">{s.department}</span>
                      <Badge
                        variant={isDone ? "default" : "outline"}
                        className={`text-[10px] ${isDone ? "bg-emerald-100 text-emerald-700" : "text-amber-600 border-amber-300"}`}
                      >
                        {isDone ? "완료" : "진행중"}
                      </Badge>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {s.signedCount}/{s.totalParticipants}명
                      </span>
                      <ChevronRight className={`w-4 h-4 shrink-0 transition-transform ${isSelected ? "text-primary" : "text-muted-foreground"}`} />
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* 서명 폼 (부서 선택 후에만 표시) */}
          {selectedSessionId && (
            <Card className="border-primary/20 bg-white/80 backdrop-blur-sm">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold text-primary flex items-center gap-2">
                  <PenTool className="w-4 h-4" /> 내 서명 등록
                  <Badge variant="secondary" className="text-xs ml-auto">{selectedDept}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-4">
                {selectedSession && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="w-3 h-3" />
                    현재 서명 완료: <span className="font-semibold text-primary">{selectedSession.signedCount}/{selectedSession.totalParticipants}명</span>
                  </div>
                )}

                {/* 이름 입력 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">이름 <span className="text-destructive">*</span></Label>
                  <Input
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder="이름을 입력하세요"
                    data-testid="input-signer-name"
                  />
                </div>

                {/* 서명 패드 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">전자서명 <span className="text-destructive">*</span></Label>
                  <p className="text-xs text-muted-foreground">아래 칸에 서명해주세요</p>
                  <SignaturePad
                    key={padKey}
                    onSave={data => setSignatureData(data)}
                    onClear={() => setSignatureData("")}
                  />
                </div>

                {/* 동의 */}
                <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg">
                  <input
                    type="checkbox"
                    id="consent"
                    checked={consentAgreed}
                    onChange={e => setConsentAgreed(e.target.checked)}
                    className="mt-0.5"
                    data-testid="checkbox-consent"
                  />
                  <label htmlFor="consent" className="text-xs text-muted-foreground leading-relaxed cursor-pointer">
                    개인정보(성명, 서명) 수집·이용 및 전자서명 제출에 동의합니다.
                    수집된 정보는 교육 이수 확인 목적으로만 사용됩니다.
                  </label>
                </div>

                <Button
                  className="w-full gap-2"
                  onClick={handleSubmit}
                  disabled={signMutation.isPending}
                  data-testid="button-submit-sign"
                >
                  {signMutation.isPending
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <CheckCircle2 className="w-4 h-4" />
                  }
                  서명 제출
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
