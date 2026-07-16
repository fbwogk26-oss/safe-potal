import { useState } from "react";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Bone, CheckCircle2, ChevronRight, ChevronLeft, Loader2, User,
  Briefcase, Activity, HeartPulse, CircleAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import bImg1 from "@assets/image_1784166150891.png";
import bImg2 from "@assets/image_1784166156751.png";
import bImg3 from "@assets/image_1784166161213.png";
import bImg4 from "@assets/image_1784166165979.png";
import bImg5 from "@assets/image_1784166170155.png";
import bImg6 from "@assets/image_1784166174449.png";
import bImg7 from "@assets/image_1784166181439.png";
import bImg8 from "@assets/image_1784166185512.png";
import bImg9 from "@assets/image_1784166189177.png";
import bImg10 from "@assets/image_1784166192887.png";
import bImg11 from "@assets/image_1784166197700.png";
const BURDEN_ILLUS = [bImg1, bImg2, bImg3, bImg4, bImg5, bImg6, bImg7, bImg8, bImg9, bImg10, bImg11];

const BURDEN_WORKS = [
  { no:1,  short:"키보드·마우스 조작",          desc:"하루 4시간 이상 집중적으로 키보드·마우스를 사용하는 작업" },
  { no:2,  short:"목·어깨 반복동작",             desc:"하루 2시간 이상 목·어깨·팔꿈치·손목·손을 반복 사용하는 작업" },
  { no:3,  short:"팔꿈치·손이 어깨 위",          desc:"하루 2시간 이상 손이 머리 위·팔꿈치가 어깨 위에 있는 작업" },
  { no:4,  short:"목·허리 굽히기·비틀기",        desc:"하루 2시간 이상 목이나 허리를 굽히거나 트는 작업" },
  { no:5,  short:"쪼그리기·무릎 굽히기",          desc:"하루 2시간 이상 쪼그리고 앉거나 무릎을 굽힌 자세의 작업" },
  { no:6,  short:"손가락 집기·쥐기 (1kg↑)",     desc:"하루 2시간 이상 1kg 이상 물건을 손가락으로 집거나 2kg 힘으로 쥐는 작업" },
  { no:7,  short:"한 손 들기·쥐기 (4.5kg↑)",   desc:"하루 2시간 이상 4.5kg 이상을 한 손으로 들거나 같은 힘으로 쥐는 작업" },
  { no:8,  short:"25kg 이상 들기 (10회↑/일)",   desc:"하루 10회 이상 25kg 이상의 물체를 드는 작업" },
  { no:9,  short:"10kg 이상 특정자세 (25회↑)",  desc:"하루 25회 이상 10kg 이상을 무릎 아래·어깨 위·팔 뻗은 상태에서 드는 작업" },
  { no:10, short:"4.5kg↑ 분당 2회↑ (2시간↑)",  desc:"하루 2시간 이상, 분당 2회 이상 4.5kg 이상의 물체를 드는 작업" },
  { no:11, short:"손·무릎 충격 (10회↑/시간)",   desc:"하루 2시간 이상, 시간당 10회 이상 손·무릎을 반복 충격하는 작업" },
];

const BODY_PARTS = [
  { key:"neck",     label:"목",              hasSide:false },
  { key:"shoulder", label:"어깨",            hasSide:true },
  { key:"elbow",    label:"팔/팔꿈치",       hasSide:true },
  { key:"wrist",    label:"손/손목/손가락",  hasSide:true },
  { key:"back",     label:"허리",            hasSide:false },
  { key:"leg",      label:"다리/발",         hasSide:true },
];

const DURATION_OPTS = ["1일 미만","1일~1주일 미만","1주일~1달 미만","1달~6개월 미만","6개월 이상"];
const INTENSITY_OPTS = ["약한 통증","중간 통증","심한 통증","매우 심한 통증"];
const FREQUENCY_OPTS = ["6개월에 1번","2~3달에 1번","1달에 1번","1주일에 1번","매일"];
const TREATMENT_OPTS = ["병원·한의원 치료","약국치료","병가·산재","작업 전환","해당사항 없음"];
const SIDE_OPTS = ["오른쪽","왼쪽","양쪽 모두"];
const LEISURE_OPTS = ["게임 등 컴퓨터 관련 활동","피아노·악기 연주","뜨개질·붓글씨 등","테니스·축구·골프 등 스포츠","해당사항 없음"];
const HOUSEWORK_OPTS = ["거의 하지 않는다","1시간 미만","1~2시간 미만","2~3시간 미만","3시간 이상"];
const MEDICAL_CONDITIONS = ["류머티스 관절염","당뇨병","루프스병","통풍","알코올중독"];
const INJURY_PARTS = ["손/손가락/손목","팔/팔꿈치","어깨","목","허리","다리/발"];
const BURDEN_LEVELS = ["전혀 힘들지 않음","견딜만 함","약간 힘듦","힘듦","매우 힘듦"];
const WORK_TYPES = ["현장운용","일반사무"];

type Step = "info" | "burden" | "symptoms" | "done";
const ALL_STEPS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key:"info",     label:"기본정보",  icon:User },
  { key:"burden",   label:"부담작업",  icon:Briefcase },
  { key:"symptoms", label:"증상조사",  icon:Activity },
  { key:"done",     label:"등록완료",  icon:CheckCircle2 },
];

interface BodySym {
  side: string;
  duration: string;
  intensity: string;
  frequency: string;
  pastWeek: string;
  treatments: string[];
}

// 부서에 추가할 예외 항목 (headquarters.ts에 없는 실제 소속)
const EXTRA_DEPTS = ["운용지원부"];

function Chip({ label, selected, onClick }: { label: string; selected: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-all text-left ${selected ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium" : "border-border hover:border-purple-300 hover:bg-purple-50/30"}`}>
      <span className={`w-4 h-4 rounded flex-shrink-0 border-2 inline-flex items-center justify-center transition-colors ${selected ? "border-purple-500 bg-purple-500" : "border-muted-foreground/30"}`}>
        {selected && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
      </span>
      {label}
    </button>
  );
}

function MultiChip({ opts, selected, onChange, cols = 2 }: { opts: string[]; selected: string[]; onChange: (v: string[]) => void; cols?: number }) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x=>x!==v) : [...selected, v]);
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {opts.map(o => <Chip key={o} label={o} selected={selected.includes(o)} onClick={() => toggle(o)} />)}
    </div>
  );
}

function RadioGroup({ opts, value, onChange, cols = 2 }: { opts: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {opts.map(o => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border transition-all text-left ${value === o ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium" : "border-border hover:border-purple-300 hover:bg-purple-50/30"}`}>
          <span className={`w-4 h-4 rounded-full flex-shrink-0 border-2 inline-flex items-center justify-center ${value === o ? "border-purple-500" : "border-muted-foreground/30"}`}>
            {value === o && <span className="w-2 h-2 rounded-full bg-purple-500" />}
          </span>
          {o}
        </button>
      ))}
    </div>
  );
}

const STEP_TITLES: Record<Step, string> = {
  info:     "근골격계 유해요인조사\n기본정보 입력",
  burden:   "근골격계 부담작업 조사",
  symptoms: "근골격계질환 증상조사",
  done:     "등록 완료",
};
const STEP_SUBTITLES: Record<Step, string> = {
  info:     "산업안전보건법에 따른 근골격계 유해요인조사 · 결과는 안전담당자만 열람합니다",
  burden:   "현재 수행 중인 작업의 유해요인을 파악합니다",
  symptoms: "신체 부위별 통증 및 불편 증상을 기입해 주세요",
  done:     "안전담당자가 검토 후 연락드릴 예정입니다",
};

function StepBar({ current }: { current: Step }) {
  const idx = ALL_STEPS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center justify-center gap-0.5 sm:gap-2">
      {ALL_STEPS.map((s, i) => {
        const isDone = i < idx;
        const isActive = s.key === current;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center gap-0.5 sm:gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-colors ${isActive ? "bg-purple-600 text-white" : isDone ? "bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300" : "bg-muted text-muted-foreground"}`}>
                {isDone ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
              </div>
              <span className={`text-[9px] sm:text-[10px] font-medium ${isActive ? "text-purple-700 dark:text-purple-400" : "text-muted-foreground"}`}>{s.label}</span>
            </div>
            {i < ALL_STEPS.length - 1 && <div className={`h-px w-4 sm:w-10 mb-3 transition-colors ${i < idx ? "bg-purple-400" : "bg-border"}`} />}
          </div>
        );
      })}
    </div>
  );
}

export default function PublicMusculoskeletal() {
  const { departments: DEPARTMENTS, headquarters } = useHeadquarters();
  const { toast } = useToast();
  const [step, setStep] = useState<Step>("info");
  const [submitting, setSubmitting] = useState(false);

  const allDepts = DEPARTMENTS.length > 0
    ? [...new Set([...DEPARTMENTS, ...EXTRA_DEPTS])]
    : EXTRA_DEPTS;

  // ── Step 1: 기본 정보
  const [info, setInfo] = useState({
    name: "", age: "", gender: "", department: "",
    workType: "", // 현장운용 / 일반사무
    workExpYears: "", workExpMonths: "", maritalStatus: "",
  });

  // ── Step 2: 부담작업
  const [burdenList, setBurdenList] = useState<number[]>([]);

  // ── Step 3: 증상조사표
  const [health, setHealth] = useState({
    q1Leisure: [] as string[],
    q2Housework: "",
    q3Medical: "",
    q3Conditions: [] as string[],
    q3Status: "",
    q4Injury: "",
    q4Parts: [] as string[],
    q5Burden: "",
  });
  const [hasPain, setHasPain] = useState("");
  const [symptoms, setSymptoms] = useState<Record<string, BodySym>>({});

  const toggleBurden = (no: number) => setBurdenList(prev =>
    prev.includes(no) ? prev.filter(n=>n!==no) : [...prev, no].sort((a,b)=>a-b)
  );

  const toggleBodyPart = (key: string) => setSymptoms(prev => {
    const next = { ...prev };
    if (next[key]) { delete next[key]; }
    else { next[key] = { side:"", duration:"", intensity:"", frequency:"", pastWeek:"", treatments:[] }; }
    return next;
  });

  const updateSym = (key: string, field: keyof BodySym, value: string | string[]) =>
    setSymptoms(prev => ({ ...prev, [key]: { ...prev[key], [field]: value } }));

  const toggleTreatment = (key: string, t: string) => {
    const cur = symptoms[key]?.treatments ?? [];
    updateSym(key, "treatments", cur.includes(t) ? cur.filter(x=>x!==t) : [...cur, t]);
  };

  const handleSubmit = async () => {
    if (!info.department) { toast({ variant:"destructive", title:"부서를 선택하세요" }); return; }
    setSubmitting(true);
    try {
      const symptomSurveyData = {
        partI: {
          age: info.age, gender: info.gender,
          workType: info.workType,
          workExp: info.workExpYears || info.workExpMonths ? `${info.workExpYears}년 ${info.workExpMonths}개월` : "",
          marital: info.maritalStatus,
          q1Leisure: health.q1Leisure,
          q2Housework: health.q2Housework,
          q3Medical: health.q3Medical,
          q3Conditions: health.q3Conditions,
          q3Status: health.q3Status,
          q4Injury: health.q4Injury,
          q4Parts: health.q4Parts,
          q5Burden: health.q5Burden,
        },
        partII: hasPain === "아니오" ? null : Object.fromEntries(
          Object.entries(symptoms).map(([k, v]) => {
            const part = BODY_PARTS.find(b=>b.key===k);
            return [part?.label ?? k, v];
          })
        ),
      };
      const res = await fetch("/api/musculoskeletal-assessments/public", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          name: info.name || "익명",
          department: info.department,
          burdenWorkChecklist: burdenList,
          headquarters,
          symptomSurvey: JSON.stringify(symptomSurveyData),
          hasPain,
          bodyPartData: hasPain === "예" ? symptoms : {},
          generalHealth: health,
        }),
      });
      if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.message||"등록 실패"); }
      setStep("done");
    } catch (e: any) {
      toast({ variant:"destructive", title:"등록 실패", description: e.message });
    } finally { setSubmitting(false); }
  };

  const resetAll = () => {
    setStep("info");
    setInfo({ name:"", age:"", gender:"", department:"", workType:"", workExpYears:"", workExpMonths:"", maritalStatus:"" });
    setBurdenList([]);
    setHealth({ q1Leisure:[],q2Housework:"",q3Medical:"",q3Conditions:[],q3Status:"",q4Injury:"",q4Parts:[],q5Burden:"" });
    setHasPain("");
    setSymptoms({});
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background">
      <div className="max-w-2xl mx-auto w-full px-4 py-8 space-y-6">

        {/* 헤더 */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
            <Bone className="w-8 h-8 text-purple-600 dark:text-purple-400" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold whitespace-pre-line leading-tight">
              {STEP_TITLES[step]}
            </h1>
            <p className="text-sm text-muted-foreground mt-1.5">{STEP_SUBTITLES[step]}</p>
          </div>
        </div>

        <StepBar current={step} />

        <AnimatePresence mode="wait">

          {/* ══════ STEP 1: 기본 정보 ══════ */}
          {step === "info" && (
            <motion.div key="info" initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }} className="space-y-4">

              <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <User className="w-4 h-4" /> I. 기본적 인 사항
                </h2>

                {/* 이름·나이·성별 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">성명 <span className="text-xs text-muted-foreground">(선택)</span></Label>
                    <Input placeholder="홍길동" value={info.name} onChange={e=>setInfo(p=>({...p,name:e.target.value}))} data-testid="input-name" />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">연령</Label>
                    <Input placeholder="만 ○○ 세" value={info.age} onChange={e=>setInfo(p=>({...p,age:e.target.value}))} data-testid="input-age" />
                  </div>
                  <div className="space-y-1.5 col-span-2 sm:col-span-1">
                    <Label className="text-sm">성별</Label>
                    <div className="flex gap-2">
                      {["남","여"].map(g=>(
                        <button key={g} type="button" onClick={()=>setInfo(p=>({...p,gender:g}))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${info.gender===g?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                          data-testid={`button-gender-${g}`}>{g}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* 부서 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">작업부서 <span className="text-red-500">*</span></Label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {allDepts.map(d=>(
                      <button key={d} type="button" onClick={()=>setInfo(p=>({...p,department:d}))}
                        className={`text-sm text-left px-3 py-2 rounded-lg border transition-all ${info.department===d?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 font-medium":"border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
                        data-testid={`button-dept-${d}`}>{d}</button>
                    ))}
                  </div>
                </div>

                {/* 현재 작업 유형 */}
                <div className="space-y-1.5">
                  <Label className="text-sm">현재 작업 유형</Label>
                  <div className="flex gap-2">
                    {WORK_TYPES.map(wt=>(
                      <button key={wt} type="button" onClick={()=>setInfo(p=>({...p,workType:wt}))}
                        className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${info.workType===wt?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                        data-testid={`button-worktype-${wt}`}>{wt}</button>
                    ))}
                  </div>
                </div>

                {/* 현 직장 경력 + 결혼여부 */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-sm">현 직장 경력</Label>
                    <div className="flex gap-1 items-center">
                      <Input placeholder="0" value={info.workExpYears} onChange={e=>setInfo(p=>({...p,workExpYears:e.target.value}))} className="w-14 text-center px-1" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">년</span>
                      <Input placeholder="0" value={info.workExpMonths} onChange={e=>setInfo(p=>({...p,workExpMonths:e.target.value}))} className="w-14 text-center px-1" />
                      <span className="text-xs text-muted-foreground whitespace-nowrap">개월</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-sm">결혼 여부</Label>
                    <div className="flex gap-2">
                      {["기혼","미혼"].map(m=>(
                        <button key={m} type="button" onClick={()=>setInfo(p=>({...p,maritalStatus:m}))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${info.maritalStatus===m?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                          data-testid={`button-marital-${m}`}>{m}</button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2" disabled={!info.department} onClick={()=>setStep("burden")} data-testid="button-next-info">
                다음 — 부담작업 선택 <ChevronRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {/* ══════ STEP 2: 부담작업 (유해요인조사) ══════ */}
          {step === "burden" && (
            <motion.div key="burden" initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }} className="space-y-4">

              <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-3">
                <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <Briefcase className="w-4 h-4" /> 근골격계 부담작업 해당 여부
                </h2>
                <p className="text-xs text-muted-foreground -mt-1">
                  현재 수행하는 작업 중 해당하는 항목을 모두 선택하세요. 없으면 선택 없이 제출하세요.
                </p>

                <div className="space-y-2 mt-1">
                  {BURDEN_WORKS.map(bw => {
                    const sel = burdenList.includes(bw.no);
                    return (
                      <button key={bw.no} type="button" onClick={()=>toggleBurden(bw.no)}
                        className={`w-full text-left rounded-xl border transition-all overflow-hidden ${sel?"border-purple-500 bg-purple-50 dark:bg-purple-900/30":"border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
                        data-testid={`button-burden-${bw.no}`}>
                        <div className="flex items-stretch">
                          <div className="flex-shrink-0 w-16 sm:w-20 bg-white dark:bg-white/90 flex items-center justify-center p-1.5 border-r border-border/40">
                            <img src={BURDEN_ILLUS[bw.no-1]} alt={`${bw.no}호`} className="w-14 h-14 sm:w-16 sm:h-16 object-contain" />
                          </div>
                          <div className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0">
                            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${sel?"border-purple-500 bg-purple-500":"border-muted-foreground/40"}`}>
                              {sel && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-snug">
                                <span className="text-purple-600 dark:text-purple-400">{bw.no}호.</span>{" "}{bw.short}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{bw.desc}</p>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {burdenList.length > 0 && (
                <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 px-4 py-2.5">
                  <CircleAlert className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <span className="text-sm text-purple-700 dark:text-purple-300">
                    <span className="font-bold">{burdenList.length}가지</span> 선택 · 다음 단계에서 증상조사표를 작성합니다
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1" onClick={()=>setStep("info")}><ChevronLeft className="w-4 h-4" />이전</Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2"
                  onClick={()=>{ if(burdenList.length>0) setStep("symptoms"); else handleSubmit(); }}
                  disabled={submitting}
                  data-testid="button-next-burden"
                >
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> :
                    burdenList.length > 0
                      ? <><span>다음 — 증상조사</span><ChevronRight className="w-4 h-4" /></>
                      : <><CheckCircle2 className="w-4 h-4" /><span>부담작업 없음 · 제출</span></>
                  }
                </Button>
              </div>
            </motion.div>
          )}

          {/* ══════ STEP 3: 증상조사표 ══════ */}
          {step === "symptoms" && (
            <motion.div key="symptoms" initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }} className="space-y-4">

              {/* Part I: Q1~Q5 */}
              <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <HeartPulse className="w-4 h-4" /> I. 일반 문항
                </h2>

                {/* Q1 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">1. 규칙적인 여가·취미 활동 <span className="text-xs font-normal text-muted-foreground">(30분 이상, 주 2~3회↑ 기준, 중복 가능)</span></p>
                  <MultiChip opts={LEISURE_OPTS} selected={health.q1Leisure} onChange={v=>setHealth(p=>({...p,q1Leisure:v}))} cols={2} />
                </div>

                <div className="border-t" />

                {/* Q2 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">2. 하루 평균 가사노동 시간 <span className="text-xs font-normal text-muted-foreground">(밥·빨래·청소·영아 돌봄 등)</span></p>
                  <RadioGroup opts={HOUSEWORK_OPTS} value={health.q2Housework} onChange={v=>setHealth(p=>({...p,q2Housework:v}))} cols={2} />
                </div>

                <div className="border-t" />

                {/* Q3 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">3. 의사 진단을 받은 질병이 있습니까?</p>
                  <div className="flex gap-2">
                    {["아니오","예"].map(v=>(
                      <button key={v} type="button" onClick={()=>setHealth(p=>({...p,q3Medical:v,q3Conditions:[],q3Status:""}))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${health.q3Medical===v?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                        data-testid={`button-q3-${v}`}>{v}</button>
                    ))}
                  </div>
                  {health.q3Medical === "예" && (
                    <div className="pl-3 border-l-2 border-purple-300 space-y-2 mt-1">
                      <MultiChip opts={MEDICAL_CONDITIONS} selected={health.q3Conditions} onChange={v=>setHealth(p=>({...p,q3Conditions:v}))} cols={2} />
                      <div className="flex gap-2 mt-1">
                        {["완치","치료나 관찰 중"].map(s=>(
                          <button key={s} type="button" onClick={()=>setHealth(p=>({...p,q3Status:s}))}
                            className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${health.q3Status===s?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                            data-testid={`button-q3status-${s}`}>{s}</button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t" />

                {/* Q4 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">4. 과거 운동/사고로 부위를 다친 적이 있습니까?</p>
                  <div className="flex gap-2">
                    {["아니오","예"].map(v=>(
                      <button key={v} type="button" onClick={()=>setHealth(p=>({...p,q4Injury:v,q4Parts:[]}))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${health.q4Injury===v?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                        data-testid={`button-q4-${v}`}>{v}</button>
                    ))}
                  </div>
                  {health.q4Injury === "예" && (
                    <div className="pl-3 border-l-2 border-purple-300 mt-1">
                      <MultiChip opts={INJURY_PARTS} selected={health.q4Parts} onChange={v=>setHealth(p=>({...p,q4Parts:v}))} cols={3} />
                    </div>
                  )}
                </div>

                <div className="border-t" />

                {/* Q5 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">5. 현재 일의 육체적 부담 정도</p>
                  <RadioGroup opts={BURDEN_LEVELS} value={health.q5Burden} onChange={v=>setHealth(p=>({...p,q5Burden:v}))} cols={2} />
                </div>
              </div>

              {/* Part II: 신체 부위별 증상 */}
              <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
                <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                  <Activity className="w-4 h-4" /> II. 신체 부위별 증상조사
                </h2>

                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 space-y-2">
                  <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                    지난 1년 동안 작업과 관련하여 통증·불편함(통증, 쑤시는 느낌, 뻣뻣함, 화끈거리는 느낌, 무감각, 찌릿찌릿함 등)을 느끼신 적이 있습니까?
                  </p>
                  <div className="flex gap-2">
                    {["예","아니오"].map(v=>(
                      <button key={v} type="button" onClick={()=>{ setHasPain(v); if(v==="아니오") setSymptoms({}); }}
                        className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-all ${hasPain===v?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-amber-200 dark:border-amber-700 hover:border-purple-300 bg-white dark:bg-card"}`}
                        data-testid={`button-haspain-${v}`}>{v}</button>
                    ))}
                  </div>
                </div>

                {hasPain === "예" && (
                  <div className="space-y-4">
                    <div className="space-y-1.5">
                      <p className="text-xs text-muted-foreground">통증 있는 부위를 선택하세요 (중복 가능)</p>
                      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                        {BODY_PARTS.map(bp => {
                          const sel = !!symptoms[bp.key];
                          return (
                            <button key={bp.key} type="button" onClick={()=>toggleBodyPart(bp.key)}
                              className={`py-2 px-1 rounded-xl border text-xs font-bold text-center transition-all ${sel?"border-purple-500 bg-purple-500 text-white shadow-sm":"border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
                              data-testid={`button-bodypart-${bp.key}`}>{bp.label}</button>
                          );
                        })}
                      </div>
                    </div>

                    {BODY_PARTS.filter(bp=>symptoms[bp.key]).map(bp => {
                      const sym = symptoms[bp.key];
                      return (
                        <div key={bp.key} className="rounded-xl border border-purple-300 dark:border-purple-700 overflow-hidden">
                          <div className="bg-purple-50 dark:bg-purple-900/30 px-4 py-2.5 flex items-center justify-between">
                            <span className="text-sm font-bold text-purple-700 dark:text-purple-300">{bp.label}</span>
                            <button type="button" onClick={()=>toggleBodyPart(bp.key)} className="text-xs text-muted-foreground hover:text-destructive">제거</button>
                          </div>
                          <div className="p-4 space-y-3.5">

                            {bp.hasSide && (
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground">1. 구체적 부위</p>
                                <div className="flex gap-2">
                                  {SIDE_OPTS.map(s=>(
                                    <button key={s} type="button" onClick={()=>updateSym(bp.key,"side",s)}
                                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-all ${sym.side===s?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                      data-testid={`button-side-${bp.key}-${s}`}>{s}</button>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{bp.hasSide ? "2." : "1."} 통증 지속 기간</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {DURATION_OPTS.map(d=>(
                                  <button key={d} type="button" onClick={()=>updateSym(bp.key,"duration",d)}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${sym.duration===d?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-duration-${bp.key}-${d}`}>{d}</button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{bp.hasSide ? "3." : "2."} 통증 강도</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {INTENSITY_OPTS.map(it=>(
                                  <button key={it} type="button" onClick={()=>updateSym(bp.key,"intensity",it)}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${sym.intensity===it?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-intensity-${bp.key}-${it}`}>{it}</button>
                                ))}
                              </div>
                              <div className="bg-muted/60 rounded-lg p-2 text-[10px] text-muted-foreground space-y-0.5">
                                <p>· 약한: 약간 불편하나 작업 집중 시 못 느낀다</p>
                                <p>· 중간: 통증 있으나 귀가 후 휴식하면 괜찮다</p>
                                <p>· 심한: 귀가 후에도 통증이 계속된다</p>
                                <p>· 매우 심한: 통증으로 일상생활이 어렵다</p>
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{bp.hasSide ? "4." : "3."} 지난 1년간 경험 빈도</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {FREQUENCY_OPTS.map(f=>(
                                  <button key={f} type="button" onClick={()=>updateSym(bp.key,"frequency",f)}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${sym.frequency===f?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-freq-${bp.key}-${f}`}>{f}</button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{bp.hasSide ? "5." : "4."} 지난 1주일에도 증상이 있었습니까?</p>
                              <div className="flex gap-2">
                                {["예","아니오"].map(v=>(
                                  <button key={v} type="button" onClick={()=>updateSym(bp.key,"pastWeek",v)}
                                    className={`flex-1 py-1.5 text-xs rounded-lg border font-semibold transition-all ${sym.pastWeek===v?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-pastweek-${bp.key}-${v}`}>{v}</button>
                                ))}
                              </div>
                            </div>

                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{bp.hasSide ? "6." : "5."} 지난 1년간 이 통증으로 어떤 일이 있었습니까? <span className="font-normal">(중복)</span></p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {TREATMENT_OPTS.map(t=>(
                                  <button key={t} type="button" onClick={()=>toggleTreatment(bp.key,t)}
                                    className={`text-left py-1.5 px-2 text-xs rounded-lg border font-medium transition-all ${sym.treatments.includes(t)?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-treatment-${bp.key}-${t}`}>
                                    <span className="flex items-center gap-1">
                                      <span className={`w-3 h-3 rounded flex-shrink-0 border ${sym.treatments.includes(t)?"bg-purple-500 border-purple-500":"border-muted-foreground/40"}`} />
                                      {t}
                                    </span>
                                  </button>
                                ))}
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1" onClick={()=>setStep("burden")}><ChevronLeft className="w-4 h-4" />이전</Button>
                <Button
                  className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2"
                  onClick={handleSubmit}
                  disabled={submitting || hasPain === ""}
                  data-testid="button-submit"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />등록 중...</> : hasPain === "예" ? <><HeartPulse className="w-4 h-4" />면담요청</> : <><CheckCircle2 className="w-4 h-4" />제출하기</>}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ══════ DONE ══════ */}
          {step === "done" && (
            <motion.div key="done" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} className="flex flex-col items-center gap-6 text-center py-8">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center ${hasPain === "예" ? "bg-orange-100 dark:bg-orange-900/30" : "bg-green-100 dark:bg-green-900/30"}`}>
                {hasPain === "예"
                  ? <HeartPulse className="w-10 h-10 text-orange-500 dark:text-orange-400" />
                  : <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />}
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold">
                  {hasPain === "예" ? "면담요청이 접수되었습니다!" : "등록이 완료되었습니다!"}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {hasPain === "예"
                    ? <>부서장에게 면담 요청이 전달되었습니다.<br />담당자가 면담 일정을 안내드릴 예정입니다.</>
                    : <>안전담당자가 검토 후 연락드릴 예정입니다.<br />불편사항이 있으시면 안전담당자에게 문의하세요.</>}
                </p>
              </div>
              <div className="bg-muted/50 rounded-xl border px-5 py-4 text-left space-y-2 w-full max-w-sm">
                <p className="text-xs font-semibold text-muted-foreground">제출 내용 요약</p>
                {[
                  { label:"이름",   value: info.name || "익명" },
                  { label:"부서",   value: info.department },
                  { label:"작업유형", value: info.workType || "-" },
                  { label:"부담작업", value: burdenList.length === 0 ? "해당 없음" : `${burdenList.join("호, ")}호 (${burdenList.length}가지)` },
                  { label:"증상 부위", value: Object.keys(symptoms).length === 0 ? (hasPain==="아니오"?"해당 없음":"-") : BODY_PARTS.filter(b=>symptoms[b.key]).map(b=>b.label).join(", ") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-right">{value}</span>
                  </div>
                ))}
              </div>
              <Button variant="outline" onClick={resetAll} data-testid="button-reset">새로 작성하기</Button>
            </motion.div>
          )}

        </AnimatePresence>

        {step !== "done" && (
          <div className="text-center text-[10px] text-muted-foreground/60 space-y-0.5 pb-4">
            <p>· 증상을 과대 또는 과소 평가해서는 안 됩니다.</p>
            <p>· 조사 결과는 근골격계질환 이환을 입증 또는 부정하는 자료로 활용할 수 없습니다.</p>
          </div>
        )}
      </div>
    </div>
  );
}
