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
import { GraduationCap, PenTool, CheckCircle2, Users, Calendar, BookOpen, Loader2, X, Info } from "lucide-react";

const DEPARTMENTS = [
  "동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀",
  "안동운용팀", "구미운용팀", "문경운용팀",
  "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀", "공공망관제팀"
];

interface SessionInfo {
  id: number;
  title: string;
  educationDate: string;
  department: string;
  educationType: string;
  instructor: string;
  totalParticipants: number;
  status: string;
}

interface SignatureInfo {
  id: number;
  signerName: string;
  signerDepartment?: string;
}

function SignaturePad({ onSave, onClear }: { onSave: (data: string) => void; onClear: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const imageData = canvas.getContext("2d")?.getImageData(0, 0, canvas.width, canvas.height);
      canvas.width = rect.width;
      canvas.height = rect.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (imageData) ctx.putImageData(imageData, 0, 0);
    };
    resize();
  }, []);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasContent(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#1e293b";
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => setIsDrawing(false), []);

  const clear = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onClear();
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
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2 justify-end">
        <Button variant="outline" size="sm" onClick={clear} className="gap-1.5">
          <X className="w-3.5 h-3.5" />
          지우기
        </Button>
        <Button size="sm" disabled={!hasContent} onClick={save} className="gap-1.5">
          <PenTool className="w-3.5 h-3.5" />
          서명 완료
        </Button>
      </div>
    </div>
  );
}

export default function PublicSign() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [signerName, setSignerName] = useState("");
  const [signerDept, setSignerDept] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [padKey, setPadKey] = useState(0);
  const [consentAgreed, setConsentAgreed] = useState(false);

  const { data: session, isLoading, isError } = useQuery<SessionInfo>({
    queryKey: ["/api/public/education", id],
    queryFn: async () => {
      const res = await fetch(`/api/public/education/${id}`);
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
    enabled: !!id,
    retry: false,
  });

  const { data: signatures = [] } = useQuery<SignatureInfo[]>({
    queryKey: ["/api/public/education", id, "signatures"],
    queryFn: async () => {
      const res = await fetch(`/api/public/education/${id}/signatures`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!id,
    refetchInterval: 10000,
  });

  const deptDiffers = !!session && !!signerDept && signerDept !== session.department;

  const signMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/education/${id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName, signerDepartment: signerDept, signatureData, consentAgreed }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "서명 등록 실패");
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err: any) => {
      toast({ variant: "destructive", title: "서명 실패", description: err.message });
    },
  });

  const handleSubmit = () => {
    if (!signerName.trim()) {
      toast({ variant: "destructive", title: "이름을 입력해주세요." });
      return;
    }
    if (!signatureData) {
      toast({ variant: "destructive", title: "서명을 먼저 완료해주세요." });
      return;
    }
    signMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !session) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 p-6">
        <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
          <X className="w-8 h-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-foreground">교육 세션을 찾을 수 없습니다</h2>
        <p className="text-sm text-muted-foreground text-center">링크가 올바른지 확인하거나 담당자에게 문의해주세요.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 p-6">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">서명이 완료되었습니다!</h2>
          <p className="text-muted-foreground">{signerName}님의 서명이 성공적으로 등록되었습니다.</p>
        </div>
        <Card className="w-full max-w-sm border-primary/20">
          <CardContent className="p-4 space-y-1 text-sm">
            <p><span className="text-muted-foreground">교육명:</span> <span className="font-medium">{session.title}</span></p>
            <p><span className="text-muted-foreground">일자:</span> <span className="font-medium">{session.educationDate}</span></p>
            <p><span className="text-muted-foreground">서명자:</span> <span className="font-medium">{signerName} ({signerDept || session.department})</span></p>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">이 창을 닫아도 됩니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md space-y-4">
          {/* 헤더 */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 text-primary">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-medium text-primary uppercase tracking-wide mb-1">교육 참석자 서명</p>
              <h1 className="text-xl font-bold text-foreground">{session.title}</h1>
            </div>
          </div>

          {/* 교육 정보 */}
          <Card className="border-primary/20 bg-white/80 dark:bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">일자</span>
                <span className="font-medium ml-auto">{session.educationDate}</span>
              </div>
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">유형</span>
                <Badge variant="secondary" className="ml-auto text-xs">{session.educationType}</Badge>
              </div>
              <div className="flex items-center gap-2 col-span-2">
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">강사</span>
                <span className="font-medium ml-auto">{session.instructor || session.department}</span>
              </div>
              <div className="col-span-2 pt-1 border-t border-border/50">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>현재 서명 완료</span>
                  <span className="font-semibold text-primary">{signatures.length} / {session.totalParticipants}명</span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all"
                    style={{ width: `${session.totalParticipants > 0 ? Math.min(100, Math.round(signatures.length / session.totalParticipants * 100)) : 0}%` }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 서명 폼 */}
          <Card className="border-primary/20 bg-white/80 dark:bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-primary">내 서명 등록</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">이름 <span className="text-destructive">*</span></Label>
                  <Input
                    value={signerName}
                    onChange={e => setSignerName(e.target.value)}
                    placeholder="이름 입력"
                    data-testid="input-signer-name"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">소속팀</Label>
                  <Select value={signerDept} onValueChange={setSignerDept}>
                    <SelectTrigger data-testid="select-signer-dept">
                      <SelectValue placeholder={session.department} />
                    </SelectTrigger>
                    <SelectContent>
                      {DEPARTMENTS.map(d => (
                        <SelectItem key={d} value={d}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {deptDiffers && (
                <div className="flex items-start gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-3 text-xs text-blue-700 dark:text-blue-300">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                  <span>
                    소속팀이 <strong>{signerDept}</strong>으로 선택되어, 해당 팀 교육 세션에 서명이 등록됩니다.
                    <br />
                    <span className="text-blue-500 dark:text-blue-400">(같은 교육명·날짜의 {signerDept} 세션이 없으면 이 세션에 등록됩니다.)</span>
                  </span>
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-medium flex items-center gap-1">
                  <PenTool className="w-3.5 h-3.5" />
                  서명 <span className="text-destructive">*</span>
                </Label>
                {signatureData ? (
                  <div className="space-y-2">
                    <div className="border rounded-xl p-3 bg-white flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-green-600 font-medium">서명 완료</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => { setSignatureData(""); setPadKey(k => k + 1); }}
                        className="gap-1 text-muted-foreground h-7 text-xs"
                      >
                        <X className="w-3 h-3" />
                        다시
                      </Button>
                    </div>
                    <img src={signatureData} alt="서명" className="h-16 rounded-lg border bg-white p-1 object-contain" />
                  </div>
                ) : (
                  <SignaturePad
                    key={padKey}
                    onSave={(data) => setSignatureData(data)}
                    onClear={() => setSignatureData("")}
                  />
                )}
              </div>

              {/* 개인정보 수집·이용 동의 */}
              <div className="space-y-2">
                <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
                  <p className="font-semibold text-foreground mb-1">개인정보 수집·이용 동의 (필수)</p>
                  <p>본 전자서명은 「개인정보 보호법」 및 「산업안전보건법」에 따라 교육 이수 증빙을 목적으로 다음 정보를 수집합니다.</p>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>수집 항목: 성명, 소속팀, 서명 이미지, 서명 일시</li>
                    <li>수집 목적: 안전교육 이수 증빙 (중대재해처벌법 대응)</li>
                    <li>보존 기간: 서명일로부터 <strong>3년</strong> (산업안전보건법 제165조)</li>
                    <li>제3자 제공: 관계 법령에 의한 경우 외 제공 없음</li>
                  </ul>
                  <p className="mt-1">귀하는 동의를 거부할 권리가 있으나, 거부 시 교육 서명 등록이 불가합니다.</p>
                </div>
                <label className="flex items-start gap-2 cursor-pointer select-none" data-testid="label-consent">
                  <input
                    type="checkbox"
                    checked={consentAgreed}
                    onChange={e => setConsentAgreed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-primary shrink-0"
                    data-testid="checkbox-consent"
                  />
                  <span className="text-xs text-foreground">
                    위 내용을 숙지하였으며, 본인의 필적으로 전자서명함에 동의합니다. <span className="text-destructive font-medium">(필수)</span>
                  </span>
                </label>
              </div>

              <Button
                className="w-full gap-2"
                onClick={handleSubmit}
                disabled={signMutation.isPending || !signerName || !signatureData || !consentAgreed}
                data-testid="button-submit-signature"
              >
                {signMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />등록 중...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" />서명 등록</>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* 이미 서명한 참석자 목록 */}
          {signatures.length > 0 && (
            <Card className="border-primary/20 bg-white/80 dark:bg-card/80 backdrop-blur-sm">
              <CardHeader className="pb-2 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-muted-foreground">서명 완료 ({signatures.length}명)</CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-3">
                <div className="flex flex-wrap gap-1.5">
                  {signatures.map(s => (
                    <Badge key={s.id} variant="secondary" className="text-xs gap-1">
                      <CheckCircle2 className="w-2.5 h-2.5 text-green-500" />
                      {s.signerName}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <div className="py-4 text-center text-xs text-muted-foreground">
        KT MOS 안전관리 시스템
      </div>
    </div>
  );
}
