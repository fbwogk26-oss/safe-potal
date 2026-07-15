import { useState } from "react";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Bone, CheckCircle2, ChevronRight, Loader2, User, Briefcase, Building2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

type Step = "info" | "work" | "done";

export default function PublicMusculoskeletal() {
  const { departments: DEPARTMENTS, headquarters } = useHeadquarters();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("info");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    name: "",
    department: "",
    task: "",
    burdenWorkChecklist: [] as number[],
  });

  const toggleWork = (no: number) => {
    setForm(f => ({
      ...f,
      burdenWorkChecklist: f.burdenWorkChecklist.includes(no)
        ? f.burdenWorkChecklist.filter(n => n !== no)
        : [...f.burdenWorkChecklist, no].sort((a, b) => a - b),
    }));
  };

  const handleSubmit = async () => {
    if (!form.department || !form.task) {
      toast({ variant: "destructive", title: "부서와 작업명을 입력하세요" });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/musculoskeletal-assessments/public", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, headquarters }),
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

        <AnimatePresence mode="wait">
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
                  {DEPARTMENTS.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {DEPARTMENTS.map(dept => (
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
                  ) : (
                    <Input
                      placeholder="소속 부서명"
                      value={form.department}
                      onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                    />
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>작업명 <span className="text-xs text-red-500">*</span></Label>
                  <Input
                    placeholder="예: 케이블 배선, 장비 점검 등"
                    value={form.task}
                    onChange={e => setForm(f => ({ ...f, task: e.target.value }))}
                    data-testid="input-public-task"
                  />
                </div>
              </div>

              <Button
                className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2"
                disabled={!form.department || !form.task}
                onClick={() => setStep("work")}
                data-testid="button-next-step"
              >
                다음 — 부담작업 선택 <ChevronRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {step === "work" && (
            <motion.div key="work"
              initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }}
              className="space-y-4"
            >
              <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-3">
                <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <Briefcase className="w-4 h-4" /> 해당하는 부담작업 선택
                </h2>
                <p className="text-xs text-muted-foreground">여러 항목을 중복 선택할 수 있습니다. 없으면 선택 없이 제출하세요.</p>

                <div className="space-y-2 mt-1">
                  {BURDEN_WORKS.map(bw => (
                    <button
                      key={bw.no}
                      onClick={() => toggleWork(bw.no)}
                      className={`w-full text-left px-3 py-3 rounded-xl border transition-all ${
                        form.burdenWorkChecklist.includes(bw.no)
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30"
                          : "border-border hover:border-purple-300 hover:bg-purple-50/30"
                      }`}
                      data-testid={`button-burden-${bw.no}`}
                    >
                      <div className="flex items-start gap-2.5">
                        <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                          form.burdenWorkChecklist.includes(bw.no)
                            ? "border-purple-500 bg-purple-500"
                            : "border-border"
                        }`}>
                          {form.burdenWorkChecklist.includes(bw.no) && (
                            <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-medium">
                            <span className="text-purple-600 dark:text-purple-400 mr-1">{bw.no}호.</span>
                            {bw.short}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">{bw.desc}</div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {form.burdenWorkChecklist.length > 0 && (
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 px-4 py-2.5 text-sm text-purple-700 dark:text-purple-300">
                  선택된 부담작업: <span className="font-bold">{form.burdenWorkChecklist.length}가지</span>
                  {form.burdenWorkChecklist.length >= 3 ? " → 위험수준 높음" : form.burdenWorkChecklist.length >= 1 ? " → 위험수준 중간" : ""}
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setStep("info")}>
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
                <div className="text-sm"><span className="text-muted-foreground">작업:</span> {form.task}</div>
                <div className="text-sm">
                  <span className="text-muted-foreground">부담작업:</span>{" "}
                  {form.burdenWorkChecklist.length === 0 ? "해당 없음" : `${form.burdenWorkChecklist.join("호, ")}호`}
                </div>
              </div>
              <Button
                variant="outline"
                onClick={() => { setStep("info"); setForm({ name: "", department: "", task: "", burdenWorkChecklist: [] }); }}
              >
                새로 작성하기
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
