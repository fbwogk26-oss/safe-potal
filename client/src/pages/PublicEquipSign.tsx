import { useState, useRef, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { maskName } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  ShoppingCart, PenTool, CheckCircle2, Package, Calendar,
  Loader2, X, AlertCircle, Users,
} from "lucide-react";

interface EquipInfo {
  id: number;
  title: string;
  team: string;
  requester: string;
  items: Array<{ name: string; quantity: number; category: string }>;
  status: string;
  createdAt: string;
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
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={clear} className="gap-1 flex-1" data-testid="button-clear-sig">
          <X className="w-3.5 h-3.5" />다시 쓰기
        </Button>
        <Button size="sm" onClick={save} disabled={!hasContent} className="gap-1.5 flex-1" data-testid="button-save-sig">
          <PenTool className="w-3.5 h-3.5" />서명 완료
        </Button>
      </div>
    </div>
  );
}

export default function PublicEquipSign() {
  const { id } = useParams<{ id: string }>();
  const { toast } = useToast();
  const [signerName, setSignerName] = useState("");
  const [signatureData, setSignatureData] = useState("");
  const [consentAgreed, setConsentAgreed] = useState(false);
  const [disposed, setDisposed] = useState<boolean | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [submitted, setSubmitted] = useState(false);

  const { data: equip, isLoading, isError } = useQuery<EquipInfo>({
    queryKey: ["/api/public/equipment", id],
    queryFn: async () => {
      const res = await fetch(`/api/public/equipment/${id}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "not found");
      }
      return res.json();
    },
    enabled: !!id,
    retry: false,
  });

  useEffect(() => {
    if (equip?.requester) setSignerName(equip.requester);
  }, [equip]);

  const signMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/public/equipment/${id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName, signatureData, consentAgreed, disposed: disposed ?? false }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "서명 등록 실패");
      }
      return res.json();
    },
    onSuccess: () => setSubmitted(true),
    onError: (err: any) => toast({ title: err.message || "서명 등록에 실패했습니다.", variant: "destructive" }),
  });

  const handleSubmit = () => {
    if (!signerName.trim()) { toast({ title: "이름을 입력해주세요.", variant: "destructive" }); return; }
    if (!signatureData) { toast({ title: "서명을 해주세요.", variant: "destructive" }); return; }
    if (!consentAgreed) { toast({ title: "개인정보 수집 및 전자서명에 동의해주세요.", variant: "destructive" }); return; }
    if (disposed === null) { toast({ title: "기존 보호구 반납·폐기 여부를 선택해주세요.", variant: "destructive" }); return; }
    signMutation.mutate();
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isError || !equip) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <AlertCircle className="w-8 h-8 text-destructive" />
        </div>
        <h2 className="text-xl font-bold">서명 링크를 찾을 수 없습니다</h2>
        <p className="text-muted-foreground text-sm">이미 서명이 완료되었거나 잘못된 링크입니다.</p>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 p-6">
        <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold text-foreground">수령 서명 완료!</h2>
          <p className="text-muted-foreground">{maskName(signerName)}님의 보호구 수령이 확인되었습니다.</p>
        </div>
        <Card className="w-full max-w-sm border-primary/20">
          <CardContent className="p-4 space-y-1 text-sm">
            <p><span className="text-muted-foreground">팀:</span> <span className="font-medium">{equip.team}</span></p>
            <p><span className="text-muted-foreground">지급 항목:</span> <span className="font-medium">{equip.title}</span></p>
            <p><span className="text-muted-foreground">서명자:</span> <span className="font-medium">{maskName(signerName)}</span></p>
          </CardContent>
        </Card>
        <p className="text-xs text-muted-foreground">이 창을 닫아도 됩니다.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-md space-y-4">

          {/* 헤더 */}
          <div className="text-center space-y-3">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500/10 text-orange-600">
              <ShoppingCart className="w-7 h-7" />
            </div>
            <div>
              <p className="text-xs font-medium text-orange-600 uppercase tracking-wide mb-1">보호구 수령 서명</p>
              <h1 className="text-xl font-bold text-foreground">{equip.title}</h1>
            </div>
          </div>

          {/* 지급 정보 */}
          <Card className="border-orange-200/60 bg-white/80 dark:bg-card/80 backdrop-blur-sm">
            <CardContent className="p-4 space-y-3 text-sm">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">팀</span>
                <span className="font-medium ml-auto">{equip.team}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground shrink-0" />
                <span className="text-muted-foreground">신청일</span>
                <span className="font-medium ml-auto">
                  {equip.createdAt ? new Date(equip.createdAt).toLocaleDateString("ko-KR") : "-"}
                </span>
              </div>
              <div className="border-t border-border/50 pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <Package className="w-3.5 h-3.5" />지급 품목
                </p>
                <div className="space-y-1">
                  {equip.items.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-xs bg-muted/40 rounded-lg px-3 py-1.5">
                      <span className="font-medium">{item.name}</span>
                      <Badge variant="secondary" className="text-xs">{item.quantity}개</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 서명 폼 */}
          <Card className="border-orange-200/60 bg-white/80 dark:bg-card/80 backdrop-blur-sm">
            <CardHeader className="pb-3 pt-4 px-4">
              <CardTitle className="text-sm font-semibold text-orange-600">수령자 서명</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              {/* 이름 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">수령자 이름 <span className="text-destructive">*</span></Label>
                <Input
                  value={signerName}
                  onChange={e => setSignerName(e.target.value)}
                  placeholder="이름 입력"
                  data-testid="input-signer-name"
                />
              </div>

              {/* 서명 패드 */}
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
                        variant="ghost" size="sm"
                        onClick={() => { setSignatureData(""); setPadKey(k => k + 1); }}
                        className="gap-1 text-muted-foreground h-7 text-xs"
                      >
                        <X className="w-3 h-3" />다시
                      </Button>
                    </div>
                    <img src={signatureData} alt="서명" className="h-16 rounded-lg border bg-white p-1 object-contain" />
                  </div>
                ) : (
                  <SignaturePad
                    key={padKey}
                    onSave={data => setSignatureData(data)}
                    onClear={() => setSignatureData("")}
                  />
                )}
              </div>

              {/* 기존 보호구 처리 */}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">기존 보호구 반납·폐기 여부 <span className="text-destructive">*</span></Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setDisposed(true)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${disposed === true ? "border-orange-500 bg-orange-50 dark:bg-orange-950/30 text-orange-700 dark:text-orange-300" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}
                    data-testid="button-disposed-yes"
                  >
                    ✅ 폐기 완료
                  </button>
                  <button
                    type="button"
                    onClick={() => setDisposed(false)}
                    className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-all ${disposed === false ? "border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300" : "border-border bg-muted/30 text-muted-foreground hover:bg-muted/60"}`}
                    data-testid="button-disposed-no"
                  >
                    📦 계속 사용
                  </button>
                </div>
              </div>

              {/* 개인정보 수집·이용 동의 */}
              <div className="space-y-2">
                <div className="max-h-28 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground leading-relaxed">
                  <p className="font-semibold text-foreground mb-1">개인정보 수집·이용 동의 (필수)</p>
                  <p>본 전자서명은 「개인정보 보호법」 및 「산업안전보건법」에 따라 보호구 수령 증빙을 목적으로 다음 정보를 수집합니다.</p>
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    <li>수집 항목: 성명, 서명 이미지, 수령 일시</li>
                    <li>수집 목적: 보호구 지급 이력 증빙 (중대재해처벌법 대응)</li>
                    <li>보존 기간: 수령일로부터 <strong>3년</strong> (산업안전보건법 제165조)</li>
                    <li>제3자 제공: 관계 법령에 의한 경우 외 제공 없음</li>
                  </ul>
                  <p className="mt-1">귀하는 동의를 거부할 권리가 있으나, 거부 시 보호구 수령 서명 등록이 불가합니다.</p>
                </div>
                <label className="flex items-start gap-2 cursor-pointer select-none" data-testid="label-consent">
                  <input
                    type="checkbox"
                    checked={consentAgreed}
                    onChange={e => setConsentAgreed(e.target.checked)}
                    className="mt-0.5 w-4 h-4 accent-orange-500 shrink-0"
                    data-testid="checkbox-consent"
                  />
                  <span className="text-xs text-foreground">
                    위 내용을 숙지하였으며, 본인의 필적으로 전자서명함에 동의합니다. <span className="text-destructive font-medium">(필수)</span>
                  </span>
                </label>
              </div>

              <Button
                className="w-full gap-2 bg-orange-600 hover:bg-orange-700 text-white"
                onClick={handleSubmit}
                disabled={signMutation.isPending || !signerName || !signatureData || !consentAgreed || disposed === null}
                data-testid="button-submit-signature"
              >
                {signMutation.isPending ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />제출 중...</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4" />수령 서명 제출</>
                )}
              </Button>
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
