import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Thermometer, CheckCircle2, ChevronRight, ChevronLeft, Loader2, User, AlertTriangle } from "lucide-react";

const CHECKLIST = [
  {
    no: 1,
    text: "오늘 아침 전과 다르게 몸 상태가 좋지 않다고 느낀다.",
    sub: null,
    reverse: false,
  },
  {
    no: 2,
    text: "최근 활동 후 쉬었으나 몸의 열이 식지 않는다고 느낀다.",
    sub: null,
    reverse: false,
  },
  {
    no: 3,
    text: "아래의 질환이 있거나, 약을 복용하였다.",
    sub: "질환 : 당뇨, 고혈압, 심장병, 신장병, 피부질환, 정신질환\n약 : 감기약, 멀미약, 수면유도제, 혈압약, 이뇨제, 신경·정신질환약",
    reverse: false,
  },
  {
    no: 4,
    text: "어젯밤 설사, 음주로 인한 숙취, 근심걱정 등으로 인해 잠을 잘 이루지 못하였다.",
    sub: null,
    reverse: false,
  },
  {
    no: 5,
    text: "최근 힘든 일이 있어 심신이 지쳐있다.",
    sub: null,
    reverse: false,
  },
  {
    no: 6,
    text: "평소 에어컨을 틀어두어도 땀이 흐를 정도로 더위를 쉽게 느낀다.",
    sub: null,
    reverse: false,
  },
  {
    no: 7,
    text: "온열질환으로 인한 증상(어지러움, 두통, 열 등)을 경험한 적이 없다.",
    sub: null,
    reverse: true, // 역문항: 아니오 = 위험(경험 있음)
  },
  {
    no: 8,
    text: "나는 일을 시작하게 되면 쉴새 없이 전념하게 된다.",
    sub: null,
    reverse: false,
  },
  {
    no: 9,
    text: "폭염기간이라도 계획대로 반드시 외부작업 혹은 활동을 진행하려 한다.",
    sub: null,
    reverse: false,
  },
  {
    no: 10,
    text: "나에게 맡겨진 일을 가급적 스스로 하며, 일일이 챙겨 끝까지 처리하려 한다.",
    sub: null,
    reverse: false,
  },
];

// 점수 계산: reverse 항목이 아닌 경우 "예"=1점, reverse 항목("아니오"=경험 있음)은 "아니오"=1점
function calcScore(answers: (string | null)[]): number {
  let score = 0;
  CHECKLIST.forEach((item, idx) => {
    const ans = answers[idx];
    if (!item.reverse && ans === "예") score++;
    if (item.reverse && ans === "아니오") score++;
  });
  return score;
}

function getRiskLevel(score: number): { level: string; color: string; bgColor: string; desc: string } {
  if (score <= 2) return { level: "낮음", color: "text-green-700", bgColor: "bg-green-50 border-green-200", desc: "현재 온열질환 취약도가 낮습니다. 작업 중 수분 보충에 유의하세요." };
  if (score <= 4) return { level: "보통", color: "text-yellow-700", bgColor: "bg-yellow-50 border-yellow-200", desc: "일부 위험요인이 있습니다. 규칙적인 휴식과 수분 보충이 필요합니다." };
  if (score <= 6) return { level: "높음", color: "text-orange-700", bgColor: "bg-orange-50 border-orange-200", desc: "온열질환 취약도가 높습니다. 관리자에게 보고하고 충분한 주의가 필요합니다." };
  return { level: "매우높음", color: "text-red-700", bgColor: "bg-red-50 border-red-200", desc: "온열질환 위험이 매우 높습니다. 즉시 관리자에게 보고하고 외부 작업을 자제하세요." };
}

const DEPTS = [
  "대구운용부", "경북운용부", "서대구운용팀", "동대구운용팀", "포항운용팀", "구미운용팀",
  "안동운용팀", "경주운용팀", "영천운용팀", "경산운용팀", "성서운용팀",
  "안전환경부", "경영지원부", "운용지원부", "기타",
];

type Step = "info" | "checklist" | "done";

export default function PublicHeatIllnessSurvey() {
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("info");
  const [name, setName] = useState("");
  const [department, setDepartment] = useState("");
  const [workArea, setWorkArea] = useState("");
  const [answers, setAnswers] = useState<(string | null)[]>(Array(10).fill(null));
  const [submitting, setSubmitting] = useState(false);
  const [resultScore, setResultScore] = useState(0);
  const [resultLevel, setResultLevel] = useState("");

  const today = new Date();
  const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

  const allAnswered = answers.every((a) => a !== null);
  const answeredCount = answers.filter((a) => a !== null).length;

  function setAnswer(idx: number, value: string) {
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = value;
      return next;
    });
  }

  function selectAll(value: string) {
    setAnswers(Array(10).fill(value));
  }

  async function handleSubmit() {
    if (!allAnswered) {
      toast({ title: "모든 항목에 답변해주세요.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    try {
      const score = calcScore(answers);
      const risk = getRiskLevel(score);
      const res = await fetch("/api/public/heat-illness-surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, department, workArea, answers, score, riskLevel: risk.level }),
      });
      if (!res.ok) throw new Error(await res.text());
      setResultScore(score);
      setResultLevel(risk.level);
      setStep("done");
    } catch (e: any) {
      toast({ title: "등록 실패", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  }

  const risk = getRiskLevel(resultScore);

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white flex flex-col">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-sky-500 to-cyan-400 text-white px-4 py-5 text-center shadow-md">
        <div className="flex items-center justify-center gap-2 mb-1">
          <Thermometer className="w-6 h-6" />
          <span className="text-sm font-medium opacity-90">야외근로자용</span>
        </div>
        <h1 className="text-xl font-bold">온열질환 특성 자가진단표</h1>
        <p className="text-xs opacity-80 mt-1">{dateStr} · 작업 전 실시</p>
      </div>

      {/* 진행 바 */}
      {step !== "done" && (
        <div className="px-4 py-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
            <span className={step === "info" ? "font-bold text-sky-600" : "text-muted-foreground"}>① 기본정보</span>
            <div className="flex-1 h-0.5 bg-muted rounded" />
            <span className={step === "checklist" ? "font-bold text-sky-600" : "text-muted-foreground"}>② 자가진단</span>
            <div className="flex-1 h-0.5 bg-muted rounded" />
            <span className="text-muted-foreground">③ 등록완료</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-sky-500 rounded-full transition-all duration-500"
              style={{ width: step === "info" ? "33%" : step === "checklist" ? `${33 + (answeredCount / 10) * 34}%` : "100%" }}
            />
          </div>
        </div>
      )}

      <div className="flex-1 px-4 pb-8 max-w-lg mx-auto w-full">
        {/* ── STEP 1: 기본정보 ── */}
        {step === "info" && (
          <div className="space-y-5 mt-2">
            <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 text-sm text-sky-800">
              <p className="font-medium mb-1">📋 진단 목적</p>
              <p className="text-xs leading-relaxed">폭염으로부터 공사장 등 야외근로자의 온열질환 취약도를 선제적으로 판별하기 위한 도움을 주는 도구입니다. 폭염기간 당일 작업 전 시행하며, 점수가 높을수록 온열질환 경험 가능성이 높습니다.</p>
            </div>

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-semibold mb-1 block">이름 <span className="text-red-500">*</span></Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="이름을 입력하세요"
                  className="text-base h-12"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1 block">부서 <span className="text-red-500">*</span></Label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="w-full h-12 rounded-md border border-input bg-background px-3 text-base focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">부서 선택</option>
                  {DEPTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div>
                <Label className="text-sm font-semibold mb-1 block">작업구역 <span className="text-xs text-muted-foreground font-normal">(선택)</span></Label>
                <Input
                  value={workArea}
                  onChange={(e) => setWorkArea(e.target.value)}
                  placeholder="예: 3구역, A동 외부 등"
                  className="text-base h-12"
                />
              </div>
            </div>

            <Button
              className="w-full h-13 text-base bg-sky-500 hover:bg-sky-600 mt-4"
              disabled={!name.trim() || !department}
              onClick={() => setStep("checklist")}
            >
              자가진단 시작
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        )}

        {/* ── STEP 2: 체크리스트 ── */}
        {step === "checklist" && (
          <div className="space-y-4 mt-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-foreground">
                {name} · {department}
              </p>
              <p className="text-xs text-muted-foreground">{answeredCount}/10 완료</p>
            </div>

            {/* 전체 선택 버튼 */}
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1 text-xs border-sky-300 text-sky-700 hover:bg-sky-50" onClick={() => selectAll("예")}>
                전체 예
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs border-gray-300 text-gray-700 hover:bg-gray-50" onClick={() => selectAll("아니오")}>
                전체 아니오
              </Button>
              <Button size="sm" variant="outline" className="flex-1 text-xs border-red-200 text-red-600 hover:bg-red-50" onClick={() => setAnswers(Array(10).fill(null))}>
                초기화
              </Button>
            </div>

            {/* 항목 헤더 */}
            <div className="grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-center px-3 py-2 bg-sky-500 rounded-t-xl text-white text-xs font-semibold">
              <span className="w-6 text-center">번호</span>
              <span>문항내용</span>
              <span className="w-10 text-center">예</span>
              <span className="w-14 text-center">아니오</span>
            </div>

            <div className="border border-sky-200 rounded-b-xl overflow-hidden divide-y divide-sky-100">
              {CHECKLIST.map((item, idx) => (
                <div
                  key={item.no}
                  className={`grid grid-cols-[auto_1fr_auto_auto] gap-x-2 items-start px-3 py-3 transition-colors
                    ${answers[idx] !== null ? "bg-sky-50/60" : "bg-white"}
                    ${idx % 2 === 1 ? "bg-gray-50/40" : ""}`}
                >
                  <span className="w-6 text-center text-sky-600 font-bold text-sm mt-0.5">{item.no}</span>
                  <div>
                    <p className="text-sm leading-snug text-foreground">{item.text}</p>
                    {item.sub && (
                      <div className="mt-1 text-xs text-sky-700 bg-sky-50 rounded p-1.5 leading-relaxed whitespace-pre-line">
                        {item.sub}
                      </div>
                    )}
                    {item.reverse && (
                      <p className="text-[10px] text-orange-500 mt-0.5">※ 역문항: '아니오'(경험 있음) 선택 시 위험도 상승</p>
                    )}
                  </div>
                  <div className="w-10 flex justify-center mt-0.5">
                    <button
                      onClick={() => setAnswer(idx, "예")}
                      className={`w-8 h-8 rounded-full border-2 transition-all flex items-center justify-center text-xs font-bold
                        ${answers[idx] === "예"
                          ? "bg-sky-500 border-sky-500 text-white shadow-md scale-110"
                          : "border-gray-300 text-gray-400 hover:border-sky-400 hover:text-sky-500"}`}
                    >
                      예
                    </button>
                  </div>
                  <div className="w-14 flex justify-center mt-0.5">
                    <button
                      onClick={() => setAnswer(idx, "아니오")}
                      className={`w-12 h-8 rounded-full border-2 transition-all flex items-center justify-center text-xs font-bold
                        ${answers[idx] === "아니오"
                          ? "bg-gray-600 border-gray-600 text-white shadow-md scale-110"
                          : "border-gray-300 text-gray-400 hover:border-gray-500 hover:text-gray-600"}`}
                    >
                      아니오
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {!allAnswered && (
              <p className="text-xs text-center text-muted-foreground">
                미응답 항목이 {10 - answeredCount}개 남아있습니다.
              </p>
            )}

            <div className="flex gap-3 mt-4">
              <Button variant="outline" className="flex-1" onClick={() => setStep("info")}>
                <ChevronLeft className="w-4 h-4 mr-1" />이전
              </Button>
              <Button
                className="flex-2 bg-sky-500 hover:bg-sky-600 px-8"
                disabled={!allAnswered || submitting}
                onClick={handleSubmit}
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                {submitting ? "등록 중..." : "자가진단 등록"}
              </Button>
            </div>
          </div>
        )}

        {/* ── STEP 3: 완료 ── */}
        {step === "done" && (
          <div className="flex flex-col items-center gap-5 mt-8">
            <div className="w-20 h-20 rounded-full bg-green-50 border-4 border-green-200 flex items-center justify-center">
              <CheckCircle2 className="w-10 h-10 text-green-500" />
            </div>
            <div className="text-center">
              <h2 className="text-xl font-bold text-foreground">자가진단 등록 완료</h2>
              <p className="text-sm text-muted-foreground mt-1">{name} · {department}</p>
            </div>

            {/* 결과 카드 */}
            <div className={`w-full rounded-2xl border-2 p-5 ${risk.bgColor}`}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-semibold text-gray-700">온열질환 취약도</p>
                <span className={`text-lg font-black ${risk.color}`}>{risk.level}</span>
              </div>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-3 bg-gradient-to-r from-green-300 via-yellow-300 via-orange-300 to-red-400 rounded-full relative">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-600 rounded-full shadow transition-all"
                    style={{ left: `${Math.min((resultScore / 10) * 100, 95)}%`, transform: "translateX(-50%) translateY(-50%)" }}
                  />
                </div>
                <span className={`text-2xl font-black ${risk.color}`}>{resultScore}점</span>
              </div>
              <div className="flex gap-1 mb-2">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className={`flex-1 h-2 rounded-sm ${i < resultScore ? "bg-orange-400" : "bg-gray-200"}`} />
                ))}
              </div>
              {resultLevel === "높음" || resultLevel === "매우높음" ? (
                <div className="flex items-start gap-2 mt-3 bg-white/60 rounded-xl p-3">
                  <AlertTriangle className={`w-5 h-5 mt-0.5 flex-shrink-0 ${risk.color}`} />
                  <p className={`text-sm font-medium ${risk.color}`}>{risk.desc}</p>
                </div>
              ) : (
                <p className={`text-sm ${risk.color} mt-2`}>{risk.desc}</p>
              )}
            </div>

            <div className="w-full bg-gray-50 border rounded-xl p-4 text-xs text-gray-500 space-y-1">
              <p>※ 행정안전부 연구과제 '폭염 직접피해자의 사회·환경 원인분석 기술개발(2020~2024, 주관연구·충북대학교)'의 연구를 기반으로 개발되었음.</p>
              <p>※ 폭염기간 당일 작업 전 시행하며, 판별점수는 해당일의 취약 정도임.</p>
            </div>

            <Button
              className="w-full h-12 bg-sky-500 hover:bg-sky-600"
              onClick={() => {
                setName(""); setDepartment(""); setWorkArea("");
                setAnswers(Array(10).fill(null));
                setStep("info");
              }}
            >
              새로 작성하기
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
