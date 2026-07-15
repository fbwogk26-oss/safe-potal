import { useState } from "react";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bone, CheckCircle2, ChevronRight, Loader2, User, Briefcase, Activity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import burdenWorksImg from "@assets/image_1784095906882.png";

/**
 * 부담작업 삽화 스프라이트 컴포넌트
 * 원본 이미지: 837 × 1102 px, 11개 항목 균등 배치 (항목당 100.18px)
 * 표시 크기: 100 × 72px, backgroundSize: auto 792px (= 11 × 72)
 */
const BurdenWorkIllus = ({ no }: { no: number }) => (
  <div
    className="flex-shrink-0 rounded-xl overflow-hidden border border-purple-100 dark:border-purple-900/40 bg-white"
    style={{
      width: 100,
      height: 72,
      backgroundImage: `url(${burdenWorksImg})`,
      backgroundRepeat: "no-repeat",
      backgroundSize: `auto ${11 * 72}px`,
      backgroundPosition: `0 -${(no - 1) * 72}px`,
    }}
    aria-hidden="true"
  />
);

const BURDEN_WORKS = [
  { no: 1, short: "키보드·마우스 조작", desc: "하루 4시간 이상 집중적으로 키보드·마우스를 사용하는 작업" },
  { no: 2, short: "목·어깨 반복동작", desc: "하루 2시간 이상 목·어깨·팔꿈치·손목·손을 반복 사용하는 작업" },
  { no: 3, short: "팔꿈치·손이 어깨 위", desc: "하루 2시간 이상 손이 머리 위·팔꿈치가 어깨 위에 있는 작업" },
  { no: 4, short: "목·허리 굽히기·비틀기", desc: "하루 2시간 이상 목이나 허리를 굽히거나 트는 작업" },
  { no: 5, short: "쪼그리기·무릎 굽히기", desc: "하루 2시간 이상 쪼그리고 앉거나 무릎을 굽힌 자세의 작업" },
  { no: 6, short: "손가락 집기·쥐기 (1 kg↑)", desc: "하루 2시간 이상 1 kg 이상 물건을 손가락으로 집거나 2 kg 힘으로 쥐는 작업" },
  { no: 7, short: "한 손으로 들기·쥐기 (4.5 kg↑)", desc: "하루 2시간 이상 4.5 kg 이상을 한 손으로 들거나 동일한 힘으로 쥐는 작업" },
  { no: 8, short: "25 kg 이상 들기 (10회↑/일)", desc: "하루 10회 이상 25 kg 이상의 물체를 드는 작업" },
  { no: 9, short: "10 kg 이상 들기 특정 위치 (25회↑)", desc: "하루 25회 이상 10 kg 이상을 무릎 아래·어깨 위·팔 뻗은 상태에서 드는 작업" },
  { no: 10, short: "4.5 kg 이상 분당 2회↑ (2시간↑)", desc: "하루 2시간 이상, 분당 2회 이상 4.5 kg 이상의 물체를 드는 작업" },
  { no: 11, short: "손·무릎 충격 (10회↑/시간)", desc: "하루 2시간 이상, 시간당 10회 이상 손·무릎을 반복 충격하는 작업" },
];

const BODY_PARTS = ["목", "어깨", "팔/팔꿈치", "손/손목/손가락", "허리", "다리/발"];
const SEVERITY_OPTIONS = ["약함", "보통", "심함"] as const;
const DURATION_OPTIONS = ["1개월 미만", "1~6개월", "6개월 이상"] as const;

type Severity = typeof SEVERITY_OPTIONS[number];
type Duration = typeof DURATION_OPTIONS[number];
type SymptomDetail = { severity: Severity; duration: Duration };
type Symptoms = Record<string, SymptomDetail>;

type Step = "info" | "work" | "symptoms" | "done";

/** 공개 자가진단 폼에 추가로 표시할 조직 단위 */
const EXTRA_DEPTS = ["대구본부", "동대구운용부", "서대구운용부", "운용지원부"];

export default function PublicMusculoskeletal() {
  const { departments: DEPARTMENTS, headquarters } = useHeadquarters();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("info");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    department: "",
    burdenWorkChecklist: [] as number[],
  });
  const [symptoms, setSymptoms] = useState<Symptoms>({});

  const allDepts = DEPARTMENTS.length > 0
    ? [...new Set([...DEPARTMENTS, ...EXTRA_DEPTS])]
    : EXTRA_DEPTS;

  const toggleWork = (no: number) => {
    setForm(f => ({
      ...f,
      burdenWorkChecklist: f.burdenWorkChecklist.includes(no)
        ? f.burdenWorkChecklist.filter(n => n !== no)
        : [...f.burdenWorkChecklist, no].sort((a, b) => a - b),
    }));
  };

  const toggleBodyPart = (part: string) => {
    setSymptoms(prev => {
      const next = { ...prev };
      if (next[part]) {
        delete next[part];
      } else {
        next[part] = { severity: "보통", duration: "1개월 미만" };
      }
      return next;
    });
  };

  const updateSymptom = (part: string, field: keyof SymptomDetail, value: string) => {
    setSymptoms(prev => ({
      ...prev,
      [part]: { ...prev[part], [field]: value },
    }));
  };

  const buildSymptomText = (): string => {
    const entries = Object.entries(symptoms);
    if (entries.length === 0) return "";
    return entries
      .map(([part, detail]) => `${part}(강도:${detail.severity}, 기간:${detail.duration})`)
      .join(", ");
  };

  const handleNextFromWork = () => {
    if (form.burdenWorkChecklist.length > 0) {
      setStep("symptoms");
    } else {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    if (!form.department) {
      toast({ variant: "destructive", title: "부서를 선택하세요" });
      return;
    }
    setSubmitting(true);
    try {
      const symptomText = buildSymptomText();
      const res = await fetch("/api/musculoskeletal-assessments/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          headquarters,
          symptomSurvey: symptomText,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "등록 실패");
      }
      setStep("done");
    } catch (e: any) {
      toast({ variant: "destructive", title: "등록 실패", description: e.message });
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setStep("info");
    setForm({ name: "", department: "", burdenWorkChecklist: [] });
    setSymptoms({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background flex flex-col">
      <div className="flex-1 flex flex-col max-w-lg mx-auto w-full px-4 py-8 gap-6">
        {/* 헤더 */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
            <Bone className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">근골격계 유해요인 자가진단</h1>
            <p className="text-sm text-muted-foreground mt-1">
              해당하는 부담작업을 선택하면 안전담당자가 확인합니다
            </p>
          </div>
        </div>

        {/* 단계 표시 */}
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          {(["info", "work", "symptoms"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s ? "bg-purple-600 text-white" :
                (step === "done" || (i < ["info","work","symptoms"].indexOf(step))) ? "bg-purple-200 text-purple-700" :
                "bg-muted text-muted-foreground"
              }`}>{i + 1}</div>
              <span className={step === s ? "text-purple-700 font-medium" : ""}>
                {s === "info" ? "기본정보" : s === "work" ? "부담작업" : "증상조사"}
              </span>
              {i < 2 && <ChevronRight className="w-3 h-3" />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── STEP 1: 기본 정보 ── */}
          {step === "info" && (
            <motion.div key="info"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="space-y-5"
            >
              <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <User className="w-4 h-4" /> 기본 정보
                </h2>

                <div className="space-y-1.5">
                  <Label>이름 <span className="text-xs text-muted-foreground">(선택)</span></Label>
                  <Input
                    placeholder="홍길동 (익명 가능)"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    data-testid="input-public-name"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>부서 <span className="text-xs text-red-500">*</span></Label>
                  <div className="grid grid-cols-2 gap-2">
                    {allDepts.map(dept => (
                      <button
                        key={dept}
                        onClick={() => setForm(f => ({ ...f, department: dept }))}
                        className={`text-sm text-left px-3 py-2 rounded-lg border transition-colors ${
                          form.department === dept
                            ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium"
                            : "border-border hover:border-purple-300 hover:bg-purple-50/50"
                        }`}
                        data-testid={`button-dept-${dept}`}
                      >
                        {dept}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Button
                className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
                disabled={!form.department}
                onClick={() => setStep("work")}
                data-testid="button-next-step"
              >
                다음 — 부담작업 선택 <ChevronRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {/* ── STEP 2: 부담작업 선택 ── */}
          {step === "work" && (
            <motion.div key="work"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-3">
                <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <Briefcase className="w-4 h-4" /> 해당하는 부담작업 선택
                </h2>
                <p className="text-xs text-muted-foreground">
                  여러 항목을 중복 선택할 수 있습니다.<br />
                  1개 이상 선택하면 증상조사로 이동합니다. 없으면 선택 없이 제출하세요.
                </p>

                <div className="space-y-2 mt-1">
                  {BURDEN_WORKS.map(bw => {
                    const selected = form.burdenWorkChecklist.includes(bw.no);
                    return (
                      <button
                        key={bw.no}
                        onClick={() => toggleWork(bw.no)}
                        className={`w-full text-left rounded-xl border transition-all overflow-hidden ${
                          selected
                            ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                            : "border-border hover:border-purple-300 hover:bg-purple-50/30"
                        }`}
                        data-testid={`button-burden-${bw.no}`}
                      >
                        <div className="flex items-stretch gap-0">
                          {/* 삽화 */}
                          <BurdenWorkIllus no={bw.no} />
                          {/* 텍스트 + 체크 */}
                          <div className="flex items-start gap-2.5 px-3 py-3 flex-1 min-w-0">
                            <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                              selected ? "border-purple-500 bg-purple-500" : "border-border"
                            }`}>
                              {selected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-medium leading-snug">
                                <span className="text-purple-600 dark:text-purple-400 mr-1">{bw.no}호.</span>
                                {bw.short}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{bw.desc}</div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.burdenWorkChecklist.length > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 px-4 py-2.5 text-sm text-purple-700 dark:text-purple-300">
                  선택된 부담작업: <span className="font-bold">{form.burdenWorkChecklist.length}가지</span>
                  {" → "}증상조사로 이동합니다
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("info")}>
                  이전
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2"
                  onClick={handleNextFromWork}
                  disabled={submitting}
                  data-testid="button-next-or-submit"
                >
                  {submitting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> 등록 중...</>
                  ) : form.burdenWorkChecklist.length > 0 ? (
                    <>다음 — 증상조사 <ChevronRight className="w-4 h-4" /></>
                  ) : (
                    <><CheckCircle2 className="w-4 h-4" /> 제출하기</>
                  )}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 3: 증상조사 ── */}
          {step === "symptoms" && (
            <motion.div key="symptoms"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <Activity className="w-4 h-4" /> 증상조사
                </h2>
                <p className="text-xs text-muted-foreground">
                  현재 통증·불편감이 있는 신체 부위를 선택하고 증상을 입력하세요.
                  증상이 없으면 선택 없이 제출하세요.
                </p>

                <div className="space-y-3">
                  {BODY_PARTS.map(part => {
                    const selected = !!symptoms[part];
                    return (
                      <div key={part} className={`rounded-xl border transition-all overflow-hidden ${
                        selected ? "border-purple-400 bg-purple-50 dark:bg-purple-900/20" : "border-border"
                      }`}>
                        {/* 부위 선택 버튼 */}
                        <button
                          className="w-full flex items-center gap-3 px-4 py-3 text-left"
                          onClick={() => toggleBodyPart(part)}
                          data-testid={`button-bodypart-${part}`}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                            selected ? "border-purple-500 bg-purple-500" : "border-border"
                          }`}>
                            {selected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                          </div>
                          <span className={`text-sm font-medium ${selected ? "text-purple-700 dark:text-purple-300" : ""}`}>
                            {part}
                          </span>
                        </button>

                        {/* 세부 증상 입력 (선택된 경우만) */}
                        {selected && (
                          <div className="px-4 pb-4 space-y-3 border-t border-purple-200 dark:border-purple-700 pt-3">
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">증상 강도</p>
                              <div className="flex gap-2">
                                {SEVERITY_OPTIONS.map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => updateSymptom(part, "severity", opt)}
                                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                                      symptoms[part]?.severity === opt
                                        ? "border-purple-500 bg-purple-500 text-white"
                                        : "border-border hover:border-purple-300"
                                    }`}
                                    data-testid={`button-severity-${part}-${opt}`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-medium text-muted-foreground">지속 기간</p>
                              <div className="flex gap-2">
                                {DURATION_OPTIONS.map(opt => (
                                  <button
                                    key={opt}
                                    onClick={() => updateSymptom(part, "duration", opt)}
                                    className={`flex-1 py-1.5 text-xs rounded-lg border transition-colors font-medium ${
                                      symptoms[part]?.duration === opt
                                        ? "border-purple-500 bg-purple-500 text-white"
                                        : "border-border hover:border-purple-300"
                                    }`}
                                    data-testid={`button-duration-${part}-${opt}`}
                                  >
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {Object.keys(symptoms).length > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 px-4 py-2.5 text-sm text-purple-700 dark:text-purple-300">
                  증상 부위: <span className="font-bold">{Object.keys(symptoms).join(", ")}</span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("work")}>
                  이전
                </Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2"
                  onClick={handleSubmit}
                  disabled={submitting}
                  data-testid="button-submit"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {submitting ? "등록 중..." : "제출하기"}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ── STEP 4: 완료 ── */}
          {step === "done" && (
            <motion.div key="done"
              initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center gap-6 text-center py-8"
            >
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold text-foreground">등록이 완료되었습니다!</h2>
                <p className="text-sm text-muted-foreground">
                  안전담당자가 검토 후 연락드릴 예정입니다.<br />
                  불편사항이 있으시면 안전담당자에게 문의하세요.
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl border px-5 py-4 text-left space-y-1.5 w-full max-w-xs">
                <div className="text-xs text-muted-foreground">제출 내용</div>
                <div className="text-sm"><span className="text-muted-foreground">이름:</span> {form.name || "익명"}</div>
                <div className="text-sm"><span className="text-muted-foreground">부서:</span> {form.department}</div>
                <div className="text-sm">
                  <span className="text-muted-foreground">부담작업:</span>{" "}
                  {form.burdenWorkChecklist.length === 0 ? "해당 없음" : `${form.burdenWorkChecklist.join("호, ")}호`}
                </div>
                {Object.keys(symptoms).length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">증상 부위:</span>{" "}
                    {Object.keys(symptoms).join(", ")}
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={resetAll}>
                새로 작성하기
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
