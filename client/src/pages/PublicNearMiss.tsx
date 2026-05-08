import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  AlertTriangle, CheckCircle2, Mic, MicOff, Camera, X, MapPin,
  Calendar, User, ChevronRight, Shield, Zap, Lightbulb, ScanSearch, Loader2, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const ACCIDENT_TYPES = [
  { label: "추락", icon: "⬇️", color: "bg-red-100 border-red-300 text-red-700" },
  { label: "전도(넘어짐)", icon: "🚶", color: "bg-orange-100 border-orange-300 text-orange-700" },
  { label: "감전", icon: "⚡", color: "bg-yellow-100 border-yellow-300 text-yellow-700" },
  { label: "낙하·비래", icon: "💥", color: "bg-amber-100 border-amber-300 text-amber-700" },
  { label: "협착(끼임)", icon: "🔩", color: "bg-purple-100 border-purple-300 text-purple-700" },
  { label: "충돌", icon: "💢", color: "bg-pink-100 border-pink-300 text-pink-700" },
  { label: "화재", icon: "🔥", color: "bg-rose-100 border-rose-300 text-rose-700" },
  { label: "기타", icon: "⚠️", color: "bg-slate-100 border-slate-300 text-slate-700" },
];

const RISK_FACTORS = [
  { label: "불안전한 상태", desc: "시설·장비 결함", icon: "🏗️" },
  { label: "불안전한 행동", desc: "보호구 미착용 등", icon: "🦺" },
  { label: "환경적 요인", desc: "날씨·조명 등", icon: "🌧️" },
  { label: "기타", desc: "기타 원인", icon: "❓" },
];

const TEAMS = ["동대구운용팀","포항운용팀","안동운용팀","서대구운용팀","남대구운용팀","구미운용팀","문경운용팀","운용계획팀","사업지원팀","현장경영팀"];

type Step = "type" | "detail" | "action" | "done";

const isSttSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

const EMPTY_FORM = {
  accidentType: "",
  riskFactor: "",
  riskDetail: "",
  occurredAt: new Date().toISOString().slice(0, 16),
  location: "",
  team: "",
  reporter: "",
  isAnonymous: false,
  description: "",
  immediateAction: "",
  preventionIdea: "",
};

export default function PublicNearMiss() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("type");
  const [submitting, setSubmitting] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingField, setRecordingField] = useState<string | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiApplied, setAiApplied] = useState(false);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const aiFileInputRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [images, setImages] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);

  const set = (k: string, v: any) => setForm(f => ({ ...f, [k]: v }));

  const startSTT = (field: string) => {
    if (!isSttSupported) { toast({ title: "음성입력 미지원", description: "이 브라우저에서는 음성입력을 사용할 수 없습니다", variant: "destructive" }); return; }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = "ko-KR"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onresult = (e: any) => {
      const transcript = e.results[0][0].transcript;
      set(field, (form as any)[field] ? (form as any)[field] + " " + transcript : transcript);
      setIsRecording(false); setRecordingField(null);
    };
    recognition.onerror = () => { setIsRecording(false); setRecordingField(null); };
    recognition.onend = () => { setIsRecording(false); setRecordingField(null); };
    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true); setRecordingField(field);
  };

  const stopSTT = () => { recognitionRef.current?.stop(); setIsRecording(false); setRecordingField(null); };

  const handleImages = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files).slice(0, 5 - images.length);
    setImages(prev => [...prev, ...arr]);
    arr.forEach(f => {
      const reader = new FileReader();
      reader.onload = e => setPreviews(prev => [...prev, e.target?.result as string]);
      reader.readAsDataURL(f);
    });
  };

  const removeImage = (i: number) => {
    setImages(prev => prev.filter((_, j) => j !== i));
    setPreviews(prev => prev.filter((_, j) => j !== i));
    if (images.length <= 1) setAiApplied(false);
  };

  // AI 사진 분석 — 사진 추가 + 전체 필드 자동 입력
  const analyzeWithAI = async (file: File) => {
    setAiAnalyzing(true);
    try {
      // 사진 미리보기에도 추가
      if (images.length < 5) {
        setImages(prev => [...prev, file]);
        const reader = new FileReader();
        reader.onload = e => setPreviews(prev => [...prev, e.target?.result as string]);
        reader.readAsDataURL(file);
      }

      const fd = new FormData();
      fd.append("photo", file);
      const res = await fetch("/api/near-miss/ai/analyze-photo", { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      const data = await res.json();

      // 모든 필드 자동 입력
      setForm(prev => ({
        ...prev,
        accidentType: data.accidentType && ACCIDENT_TYPES.find(t => t.label === data.accidentType) ? data.accidentType : prev.accidentType,
        riskFactor: data.riskFactor && RISK_FACTORS.find(f => f.label === data.riskFactor) ? data.riskFactor : prev.riskFactor,
        riskDetail: data.riskDetail || prev.riskDetail,
        description: data.description || prev.description,
        immediateAction: data.immediateAction || prev.immediateAction,
        preventionIdea: data.preventionIdea || prev.preventionIdea,
      }));
      setAiApplied(true);
      toast({ title: "✨ AI 분석 완료", description: "사고유형·위험요인·설명 등이 자동으로 입력되었습니다. 내용을 확인하고 수정해 주세요." });
    } catch (e: any) {
      toast({ variant: "destructive", title: "AI 분석 실패", description: e.message });
    }
    setAiAnalyzing(false);
  };

  const handleSubmit = async () => {
    if (!form.accidentType || !form.riskFactor || !form.location || !form.occurredAt) {
      toast({ title: "필수 항목 누락", description: "사고유형, 위험요인, 장소, 일시를 입력해주세요", variant: "destructive" }); return;
    }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, String(v)));
      images.forEach(img => fd.append("images", img));
      const res = await fetch("/api/near-miss/public", { method: "POST", body: fd });
      if (!res.ok) { const d = await res.json(); throw new Error(d.message); }
      setStep("done");
    } catch (e: any) {
      toast({ title: "등록 실패", description: e.message, variant: "destructive" });
    } finally { setSubmitting(false); }
  };

  const SttButton = ({ field }: { field: string }) => (
    <button type="button" onClick={() => isRecording && recordingField === field ? stopSTT() : startSTT(field)}
      className={`p-1.5 rounded-full transition-colors ${isRecording && recordingField === field ? "bg-red-100 text-red-600 animate-pulse" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
      {isRecording && recordingField === field ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
    </button>
  );

  if (step === "done") {
    return (
      <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-950 dark:to-green-950 flex items-center justify-center p-4">
        <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="text-center max-w-sm">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-10 h-10 text-emerald-600" />
          </div>
          <h1 className="text-2xl font-bold text-emerald-700 mb-2">등록 완료!</h1>
          <p className="text-muted-foreground text-sm mb-2">감사합니다. 당신의 기록이 동료의 안전을 지킵니다.</p>
          <p className="text-xs text-muted-foreground mb-6">담당자가 검토 후 조치할 예정입니다.</p>
          <Button onClick={() => { setStep("type"); setForm({ ...EMPTY_FORM, occurredAt: new Date().toISOString().slice(0,16) }); setImages([]); setPreviews([]); setAiApplied(false); }} variant="outline">
            추가 등록하기
          </Button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-amber-50 via-orange-50 to-red-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      {/* Header */}
      <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-5 shadow-md">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-bold text-lg">아차사고 등록</span>
          </div>
          <p className="text-amber-100 text-sm">당신의 기록이 동료의 생명을 구합니다 🛡️</p>
        </div>
      </div>

      {/* AI 배너 */}
      <div className="max-w-lg mx-auto px-4 pt-3">
        <div className="flex items-center gap-2.5 bg-gradient-to-r from-violet-500/10 to-indigo-500/10 border border-violet-200 dark:border-violet-700 rounded-xl px-3 py-2.5">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shrink-0">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-violet-800 dark:text-violet-300">AI 자동 분석 사용 가능</p>
            <p className="text-[10px] text-muted-foreground">사진을 찍으면 AI가 사고유형·위험요인·설명을 자동으로 입력합니다</p>
          </div>
          <label className={`shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-md cursor-pointer transition-all shadow-sm ${aiAnalyzing ? "bg-violet-200 text-violet-700 opacity-60 pointer-events-none" : "bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600"}`} data-testid="button-ai-analyze-banner">
            <input type="file" accept="image/*,image/heic,image/heif" className="sr-only"
              onChange={e => { const f = e.target.files?.[0]; if (f) analyzeWithAI(f); e.currentTarget.value = ""; }}
              disabled={aiAnalyzing} capture="environment"
            />
            {aiAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
            {aiAnalyzing ? "분석 중..." : "📸 AI 분석"}
          </label>
        </div>
      </div>

      {/* AI 적용 알림 배너 */}
      <AnimatePresence>
        {aiApplied && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-lg mx-auto px-4 mt-2">
            <div className="flex items-center gap-2 bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-700 rounded-lg px-3 py-2">
              <CheckCircle2 className="w-4 h-4 text-violet-500 shrink-0" />
              <p className="text-xs text-violet-700 dark:text-violet-300 flex-1">✨ AI가 내용을 자동으로 입력했습니다. 각 항목을 확인하고 필요하면 수정해 주세요.</p>
              <button type="button" onClick={() => setAiApplied(false)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-3.5 h-3.5" /></button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Progress */}
      <div className="max-w-lg mx-auto px-4 pt-3">
        <div className="flex items-center gap-1 mb-5">
          {(["type","detail","action"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${step === s ? "bg-amber-500 text-white" : ["type","detail","action"].indexOf(step) > i ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground"}`}>{i+1}</div>
              {i < 2 && <div className={`flex-1 h-0.5 mx-1 transition-colors ${["type","detail","action"].indexOf(step) > i ? "bg-emerald-400" : "bg-muted"}`} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* Step 1: 사고 유형 + 위험 요인 */}
          {step === "type" && (
            <motion.div key="type" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} className="space-y-5 pb-20">
              <div>
                <h2 className="text-base font-bold mb-1 flex items-center gap-2"><Zap className="w-4 h-4 text-amber-500" />어떤 일이 일어날 뻔했나요?</h2>
                {aiApplied && form.accidentType && <p className="text-[11px] text-violet-600 mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" />AI가 "{form.accidentType}"을 선택했습니다. 다른 유형으로 변경 가능합니다.</p>}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ACCIDENT_TYPES.map(t => (
                    <button key={t.label} type="button" onClick={() => set("accidentType", t.label)}
                      className={`border-2 rounded-xl p-3 text-center transition-all ${form.accidentType === t.label ? `${t.color} border-current scale-105 shadow-md` : "border-border bg-white dark:bg-slate-900 hover:border-amber-300"}`}>
                      <div className="text-2xl mb-1">{t.icon}</div>
                      <div className="text-xs font-semibold leading-tight">{t.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <h2 className="text-base font-bold mb-1 flex items-center gap-2"><Shield className="w-4 h-4 text-indigo-500" />위험 요인 분류</h2>
                {aiApplied && form.riskFactor && <p className="text-[11px] text-violet-600 mb-2 flex items-center gap-1"><Sparkles className="w-3 h-3" />AI가 "{form.riskFactor}"을 선택했습니다.</p>}
                <div className="grid grid-cols-2 gap-2">
                  {RISK_FACTORS.map(f => (
                    <button key={f.label} type="button" onClick={() => set("riskFactor", f.label)}
                      className={`border-2 rounded-xl p-3 text-left transition-all ${form.riskFactor === f.label ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 scale-105 shadow-md" : "border-border bg-white dark:bg-slate-900 hover:border-indigo-300"}`}>
                      <div className="text-xl mb-1">{f.icon}</div>
                      <div className="text-xs font-bold leading-tight">{f.label}</div>
                      <div className="text-[10px] text-muted-foreground">{f.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <Button className="w-full bg-amber-500 hover:bg-amber-600" disabled={!form.accidentType || !form.riskFactor} onClick={() => setStep("detail")}>
                다음 <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {/* Step 2: 기본 정보 + 사진 */}
          {step === "detail" && (
            <motion.div key="detail" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} className="space-y-4 pb-20">
              <h2 className="text-base font-bold flex items-center gap-2"><MapPin className="w-4 h-4 text-orange-500" />언제, 어디서?</h2>

              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <Label className="text-xs font-semibold">발생 일시 *</Label>
                  <Input type="datetime-local" value={form.occurredAt} onChange={e => set("occurredAt", e.target.value)} className="mt-1" data-testid="input-occurred-at" />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs font-semibold">발생 장소 *</Label>
                  <div className="flex gap-1 mt-1">
                    <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="예: 3층 전기실 앞" data-testid="input-location" />
                    <SttButton field="location" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs font-semibold">소속 팀</Label>
                  <select value={form.team} onChange={e => set("team", e.target.value)} className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-background" data-testid="select-team">
                    <option value="">선택</option>
                    {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">신고자</Label>
                  <Input value={form.isAnonymous ? "익명" : form.reporter} onChange={e => set("reporter", e.target.value)} disabled={form.isAnonymous} placeholder="이름" className="mt-1" data-testid="input-reporter" />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input type="checkbox" checked={form.isAnonymous} onChange={e => set("isAnonymous", e.target.checked)} className="rounded" />
                <span className="text-sm text-muted-foreground">익명으로 제출 (신고자 이름 비공개)</span>
              </label>

              <div>
                <Label className="text-xs font-semibold">상황 설명 <span className="font-normal text-muted-foreground">(어떤 일이 일어날 뻔했나요?)</span>{aiApplied && form.description && <span className="ml-1 text-violet-500 text-[10px]">✨ AI 입력됨</span>}</Label>
                <div className="relative mt-1">
                  <Textarea value={form.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="간략히 설명해주세요" className="pr-10" data-testid="input-description" />
                  <div className="absolute right-2 top-2"><SttButton field="description" /></div>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">위험요인 상세{aiApplied && form.riskDetail && <span className="ml-1 text-violet-500 text-[10px]">✨ AI 입력됨</span>}</Label>
                <div className="relative mt-1">
                  <Input value={form.riskDetail} onChange={e => set("riskDetail", e.target.value)} placeholder="구체적인 위험 요인" className="pr-10" data-testid="input-risk-detail" />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2"><SttButton field="riskDetail" /></div>
                </div>
              </div>

              {/* 사진 첨부 + AI 분석 */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <Label className="text-xs font-semibold">사진 첨부 <span className="font-normal text-muted-foreground">(최대 5장)</span></Label>
                  <label className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md cursor-pointer transition-all ${aiAnalyzing ? "bg-violet-200 text-violet-700 opacity-60 pointer-events-none" : "bg-gradient-to-r from-violet-500 to-indigo-500 text-white hover:from-violet-600 hover:to-indigo-600 shadow-sm"}`} data-testid="button-ai-photo-detail">
                    <input type="file" accept="image/*,image/heic,image/heif" className="sr-only"
                      onChange={e => { const f = e.target.files?.[0]; if (f) analyzeWithAI(f); e.currentTarget.value = ""; }}
                      disabled={aiAnalyzing} capture="environment"
                    />
                    {aiAnalyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ScanSearch className="w-3 h-3" />}
                    {aiAnalyzing ? "AI 분석 중..." : "📸 찍고 AI 분석"}
                  </label>
                </div>
                <div className="mt-1 grid grid-cols-4 gap-2">
                  {previews.map((p, i) => (
                    <div key={i} className="relative aspect-square rounded-lg overflow-hidden border">
                      <img src={p} alt="" className="w-full h-full object-cover" />
                      <button type="button" onClick={() => removeImage(i)} className="absolute top-0.5 right-0.5 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center text-white hover:bg-black">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {images.length < 5 && (
                    <button type="button" onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-amber-400 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:text-amber-600 transition-colors" data-testid="button-add-photo">
                      <Camera className="w-5 h-5" />
                      <span className="text-[10px]">사진만 추가</span>
                    </button>
                  )}
                </div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleImages(e.target.files)} capture="environment" />
                <p className="text-[10px] text-muted-foreground mt-1">📸 "찍고 AI 분석" 버튼으로 사진 업로드 시 AI가 모든 항목을 자동으로 채워줍니다</p>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("type")}>이전</Button>
                <Button className="flex-1 bg-amber-500 hover:bg-amber-600" disabled={!form.location || !form.occurredAt} onClick={() => setStep("action")}>
                  다음 <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* Step 3: 조치 + 제안 */}
          {step === "action" && (
            <motion.div key="action" initial={{ x: 30, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: -30, opacity: 0 }} className="space-y-4 pb-20">
              <h2 className="text-base font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-500" />조치 및 제안</h2>

              <div>
                <Label className="text-xs font-semibold">
                  즉시 조치 내용 <span className="font-normal text-muted-foreground">(현장에서 바로 한 일)</span>
                  {aiApplied && form.immediateAction && <span className="ml-1 text-violet-500 text-[10px]">✨ AI 입력됨</span>}
                </Label>
                <div className="relative mt-1">
                  <Textarea value={form.immediateAction} onChange={e => set("immediateAction", e.target.value)} rows={3} placeholder="예: 바닥의 기름을 닦음, 안전표지 설치 등" className="pr-10" data-testid="input-immediate-action" />
                  <div className="absolute right-2 top-2"><SttButton field="immediateAction" /></div>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold flex items-center gap-1">
                  <Lightbulb className="w-3.5 h-3.5 text-yellow-500" />재발 방지 아이디어
                  {aiApplied && form.preventionIdea && <span className="ml-1 text-violet-500 text-[10px]">✨ AI 입력됨</span>}
                </Label>
                <p className="text-[10px] text-muted-foreground mb-1">어떻게 하면 다음에는 이런 일이 없을까요?</p>
                <div className="relative">
                  <Textarea value={form.preventionIdea} onChange={e => set("preventionIdea", e.target.value)} rows={3} placeholder="자유롭게 적어주세요" className="pr-10" data-testid="input-prevention-idea" />
                  <div className="absolute right-2 top-2"><SttButton field="preventionIdea" /></div>
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white dark:bg-slate-900 rounded-xl border p-3 space-y-1.5">
                <p className="text-xs font-semibold text-muted-foreground mb-2">등록 내용 확인</p>
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="outline" className="text-[11px]">{form.accidentType}</Badge>
                  <Badge variant="outline" className="text-[11px]">{form.riskFactor.split(" ")[0]}</Badge>
                  <Badge variant="outline" className="text-[11px] flex items-center gap-1"><MapPin className="w-2.5 h-2.5" />{form.location || "장소 미입력"}</Badge>
                  {form.team && <Badge variant="outline" className="text-[11px]">{form.team}</Badge>}
                  <Badge variant="outline" className="text-[11px]">{form.isAnonymous ? "익명" : (form.reporter || "신고자 미입력")}</Badge>
                  {images.length > 0 && <Badge className="text-[11px] bg-emerald-100 text-emerald-700 border-emerald-300">사진 {images.length}장</Badge>}
                  {aiApplied && <Badge className="text-[11px] bg-violet-100 text-violet-700 border-violet-300">✨ AI 분석 적용됨</Badge>}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("detail")}>이전</Button>
                <Button className="flex-1 bg-amber-500 hover:bg-amber-600" onClick={handleSubmit} disabled={submitting} data-testid="button-submit">
                  {submitting ? "등록 중..." : "✅ 등록 완료"}
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
