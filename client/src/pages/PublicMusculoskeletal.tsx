import { useState } from "react";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Bone, CheckCircle2, ChevronRight, Loader2, User, Briefcase,
  Activity, HeartPulse, ChevronLeft, CircleAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import bw01 from "@assets/burden_works/item_01.png";
import bw02 from "@assets/burden_works/item_02.png";
import bw03 from "@assets/burden_works/item_03.png";
import bw04 from "@assets/burden_works/item_04.png";
import bw05 from "@assets/burden_works/item_05.png";
import bw06 from "@assets/burden_works/item_06.png";
import bw07 from "@assets/burden_works/item_07.png";
import bw08 from "@assets/burden_works/item_08.png";
import bw09 from "@assets/burden_works/item_09.png";
import bw10 from "@assets/burden_works/item_10.png";
import bw11 from "@assets/burden_works/item_11.png";

const BURDEN_ILLUS = [bw01,bw02,bw03,bw04,bw05,bw06,bw07,bw08,bw09,bw10,bw11];

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

const BODY_PARTS: { key: string; label: string; hasSide: boolean }[] = [
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
const LEISURE_OPTS = ["게임 등 컴퓨터 관련 활동","피아노·악기 연주","뜨개질·붓글씨 등","테니스·축구·농구·골프 등 스포츠","해당사항 없음"];
const HOUSEWORK_OPTS = ["거의 하지 않는다","1시간 미만","1~2시간 미만","2~3시간 미만","3시간 이상"];
const MEDICAL_CONDITIONS = ["류머티스 관절염","당뇨병","루프스병","통풍","알코올중독"];
const INJURY_PARTS = ["손/손가락/손목","팔/팔꿈치","어깨","목","허리","다리/발"];
const BURDEN_LEVELS = ["전혀 힘들지 않음","견딜만 함","약간 힘듦","힘듦","매우 힘듦"];

type Step = "info" | "health" | "burden" | "symptoms" | "done";

interface BodySym {
  side: string;
  duration: string;
  intensity: string;
  frequency: string;
  pastWeek: string;
  treatments: string[];
}

const EXTRA_DEPTS = ["대구본부","동대구운용부","서대구운용부","운용지원부"];

function MultiChip({ opts, selected, onChange, cols = 2 }: { opts: string[]; selected: string[]; onChange: (v: string[]) => void; cols?: number }) {
  const toggle = (v: string) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {opts.map(o => (
        <button key={o} type="button" onClick={() => toggle(o)}
          className={`text-left text-sm px-3 py-2 rounded-lg border transition-all ${selected.includes(o) ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium" : "border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
          data-testid={`chip-${o}`}
        >
          <span className={`inline-flex items-center gap-1.5`}>
            <span className={`w-4 h-4 rounded flex-shrink-0 border-2 flex items-center justify-center ${selected.includes(o) ? "border-purple-500 bg-purple-500" : "border-muted-foreground/30"}`}>
              {selected.includes(o) && <CheckCircle2 className="w-2.5 h-2.5 text-white" />}
            </span>
            {o}
          </span>
        </button>
      ))}
    </div>
  );
}

function RadioGroup({ opts, value, onChange, cols = 2 }: { opts: string[]; value: string; onChange: (v: string) => void; cols?: number }) {
  return (
    <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {opts.map(o => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`text-left text-sm px-3 py-2 rounded-lg border transition-all ${value === o ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 font-medium" : "border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
          data-testid={`radio-${o}`}
        >
          <span className="inline-flex items-center gap-1.5">
            <span className={`w-4 h-4 rounded-full flex-shrink-0 border-2 flex items-center justify-center ${value === o ? "border-purple-500" : "border-muted-foreground/30"}`}>
              {value === o && <span className="w-2 h-2 rounded-full bg-purple-500" />}
            </span>
            {o}
          </span>
        </button>
      ))}
    </div>
  );
}

function SectionCard({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) {
  return (
    <div className="bg-card rounded-2xl border shadow-sm p-5 space-y-4">
      <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
        <Icon className="w-4 h-4" />{title}
      </h2>
      {children}
    </div>
  );
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</Label>
      {children}
    </div>
  );
}

const STEP_LABELS: { key: Step; label: string; icon: React.ElementType }[] = [
  { key:"info",     label:"기본정보",   icon:User },
  { key:"health",   label:"건강이력",   icon:HeartPulse },
  { key:"burden",   label:"부담작업",   icon:Briefcase },
  { key:"symptoms", label:"증상조사",   icon:Activity },
];

function StepIndicator({ current }: { current: Step }) {
  const idx = STEP_LABELS.findIndex(s => s.key === current);
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {STEP_LABELS.map((s, i) => {
        const done = i < idx || current === "done";
        const active = s.key === current;
        const Icon = s.icon;
        return (
          <div key={s.key} className="flex items-center gap-1 sm:gap-2">
            <div className="flex flex-col items-center gap-1">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${active ? "bg-purple-600 text-white" : done ? "bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300" : "bg-muted text-muted-foreground"}`}>
                {done && !active ? <CheckCircle2 className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
              </div>
              <span className={`text-[10px] hidden sm:block font-medium ${active ? "text-purple-700 dark:text-purple-400" : "text-muted-foreground"}`}>{s.label}</span>
            </div>
            {i < STEP_LABELS.length - 1 && <div className={`h-px w-4 sm:w-8 transition-colors ${i < idx ? "bg-purple-400" : "bg-border"}`} />}
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
    workExpYears: "", workExpMonths: "", maritalStatus: "",
    currentWorkContent: "", currentWorkPeriodYears: "", currentWorkPeriodMonths: "",
    dailyWorkHours: "", breakMinutes: "", breakTimes: "",
    prevWorkContent: "", prevWorkPeriodYears: "", prevWorkPeriodMonths: "",
  });

  // ── Step 2: 건강 이력 (Q1~Q5)
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

  // ── Step 3: 부담작업
  const [burdenList, setBurdenList] = useState<number[]>([]);

  // ── Step 4: 증상조사
  const [hasPain, setHasPain] = useState("");
  const [symptoms, setSymptoms] = useState<Record<string, BodySym>>({});

  const toggleBurden = (no: number) => setBurdenList(prev =>
    prev.includes(no) ? prev.filter(n => n !== no) : [...prev, no].sort((a,b)=>a-b)
  );

  const toggleBodyPart = (key: string) => setSymptoms(prev => {
    const next = { ...prev };
    if (next[key]) { delete next[key]; } else {
      next[key] = { side:"", duration:"", intensity:"", frequency:"", pastWeek:"", treatments:[] };
    }
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
          basic: { age: info.age, gender: info.gender, workExp: `${info.workExpYears}년 ${info.workExpMonths}개월`, marital: info.maritalStatus, currentWork: info.currentWorkContent, currentWorkPeriod: `${info.currentWorkPeriodYears}년 ${info.currentWorkPeriodMonths}개월`, dailyHours: info.dailyWorkHours, break: `${info.breakMinutes}분 ${info.breakTimes}회`, prevWork: info.prevWorkContent, prevWorkPeriod: `${info.prevWorkPeriodYears}년 ${info.prevWorkPeriodMonths}개월` },
          q1Leisure: health.q1Leisure,
          q2Housework: health.q2Housework,
          q3Medical: health.q3Medical, q3Conditions: health.q3Conditions, q3Status: health.q3Status,
          q4Injury: health.q4Injury, q4Parts: health.q4Parts,
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
        }),
      });
      if (!res.ok) { const err = await res.json().catch(()=>({})); throw new Error(err.message||"등록 실패"); }
      setStep("done");
    } catch (e:any) {
      toast({ variant:"destructive", title:"등록 실패", description: e.message });
    } finally { setSubmitting(false); }
  };

  const resetAll = () => {
    setStep("info");
    setInfo({ name:"",age:"",gender:"",department:"",workExpYears:"",workExpMonths:"",maritalStatus:"",currentWorkContent:"",currentWorkPeriodYears:"",currentWorkPeriodMonths:"",dailyWorkHours:"",breakMinutes:"",breakTimes:"",prevWorkContent:"",prevWorkPeriodYears:"",prevWorkPeriodMonths:"" });
    setHealth({ q1Leisure:[],q2Housework:"",q3Medical:"",q3Conditions:[],q3Status:"",q4Injury:"",q4Parts:[],q5Burden:"" });
    setBurdenList([]);
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
            <h1 className="text-2xl font-bold">근골격계질환 증상조사표</h1>
            <p className="text-sm text-muted-foreground mt-1">산업안전보건법에 따른 유해요인 조사 · 작성 내용은 안전담당자만 열람합니다</p>
          </div>
        </div>

        {/* 단계 표시 */}
        {step !== "done" && <StepIndicator current={step} />}

        <AnimatePresence mode="wait">

          {/* ════════ STEP 1: 기본 정보 ════════ */}
          {step === "info" && (
            <motion.div key="info" initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }} className="space-y-4">

              <SectionCard title="I. 기본 인적 사항" icon={User}>
                {/* 이름·나이·성별 */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  <FieldRow label="성명">
                    <Input placeholder="홍길동 (익명 가능)" value={info.name} onChange={e=>setInfo(p=>({...p,name:e.target.value}))} data-testid="input-name" />
                  </FieldRow>
                  <FieldRow label="연령">
                    <Input placeholder="만 ○○ 세" value={info.age} onChange={e=>setInfo(p=>({...p,age:e.target.value}))} data-testid="input-age" />
                  </FieldRow>
                  <FieldRow label="성별">
                    <div className="flex gap-2">
                      {["남","여"].map(g=>(
                        <button key={g} type="button" onClick={()=>setInfo(p=>({...p,gender:g}))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${info.gender===g?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                          data-testid={`button-gender-${g}`}>{g}</button>
                      ))}
                    </div>
                  </FieldRow>
                </div>

                {/* 부서 */}
                <FieldRow label="작업부서" required>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {allDepts.map(d=>(
                      <button key={d} type="button" onClick={()=>setInfo(p=>({...p,department:d}))}
                        className={`text-sm text-left px-3 py-2 rounded-lg border transition-all ${info.department===d?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 font-medium":"border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
                        data-testid={`button-dept-${d}`}>{d}</button>
                    ))}
                  </div>
                </FieldRow>

                {/* 현 직장 경력 + 결혼여부 */}
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="현 직장 경력">
                    <div className="flex gap-1 items-center">
                      <Input placeholder="년" value={info.workExpYears} onChange={e=>setInfo(p=>({...p,workExpYears:e.target.value}))} className="w-14 text-center" />
                      <span className="text-xs text-muted-foreground flex-shrink-0">년</span>
                      <Input placeholder="월" value={info.workExpMonths} onChange={e=>setInfo(p=>({...p,workExpMonths:e.target.value}))} className="w-14 text-center" />
                      <span className="text-xs text-muted-foreground flex-shrink-0">개월</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="결혼 여부">
                    <div className="flex gap-2">
                      {["기혼","미혼"].map(m=>(
                        <button key={m} type="button" onClick={()=>setInfo(p=>({...p,maritalStatus:m}))}
                          className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${info.maritalStatus===m?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                          data-testid={`button-marital-${m}`}>{m}</button>
                      ))}
                    </div>
                  </FieldRow>
                </div>
              </SectionCard>

              <SectionCard title="현재 작업 정보" icon={Briefcase}>
                <FieldRow label="현재 작업 내용">
                  <Input placeholder="수행 중인 작업을 구체적으로 기재" value={info.currentWorkContent} onChange={e=>setInfo(p=>({...p,currentWorkContent:e.target.value}))} data-testid="input-current-work" />
                </FieldRow>
                <div className="grid grid-cols-2 gap-3">
                  <FieldRow label="작업 기간">
                    <div className="flex gap-1 items-center">
                      <Input placeholder="년" value={info.currentWorkPeriodYears} onChange={e=>setInfo(p=>({...p,currentWorkPeriodYears:e.target.value}))} className="w-14 text-center" />
                      <span className="text-xs text-muted-foreground">년</span>
                      <Input placeholder="월" value={info.currentWorkPeriodMonths} onChange={e=>setInfo(p=>({...p,currentWorkPeriodMonths:e.target.value}))} className="w-14 text-center" />
                      <span className="text-xs text-muted-foreground">개월</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="1일 근무시간">
                    <div className="flex gap-1 items-center">
                      <Input placeholder="8" value={info.dailyWorkHours} onChange={e=>setInfo(p=>({...p,dailyWorkHours:e.target.value}))} className="w-16 text-center" />
                      <span className="text-xs text-muted-foreground">시간</span>
                    </div>
                  </FieldRow>
                </div>
                <FieldRow label="휴식 시간 (식사 제외)">
                  <div className="flex gap-1 items-center flex-wrap">
                    <Input placeholder="10" value={info.breakMinutes} onChange={e=>setInfo(p=>({...p,breakMinutes:e.target.value}))} className="w-14 text-center" />
                    <span className="text-xs text-muted-foreground">분씩</span>
                    <Input placeholder="2" value={info.breakTimes} onChange={e=>setInfo(p=>({...p,breakTimes:e.target.value}))} className="w-14 text-center" />
                    <span className="text-xs text-muted-foreground">회 휴식</span>
                  </div>
                </FieldRow>
                <div className="border-t pt-3 space-y-3">
                  <p className="text-xs font-medium text-muted-foreground">이전에 했던 작업 (있는 경우)</p>
                  <FieldRow label="이전 작업 내용">
                    <Input placeholder="이전에 했던 작업 내용" value={info.prevWorkContent} onChange={e=>setInfo(p=>({...p,prevWorkContent:e.target.value}))} />
                  </FieldRow>
                  <FieldRow label="이전 작업 기간">
                    <div className="flex gap-1 items-center">
                      <Input placeholder="년" value={info.prevWorkPeriodYears} onChange={e=>setInfo(p=>({...p,prevWorkPeriodYears:e.target.value}))} className="w-14 text-center" />
                      <span className="text-xs text-muted-foreground">년</span>
                      <Input placeholder="월" value={info.prevWorkPeriodMonths} onChange={e=>setInfo(p=>({...p,prevWorkPeriodMonths:e.target.value}))} className="w-14 text-center" />
                      <span className="text-xs text-muted-foreground">개월</span>
                    </div>
                  </FieldRow>
                </div>
              </SectionCard>

              <Button className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2" disabled={!info.department} onClick={()=>setStep("health")} data-testid="button-next-info">
                다음 — 건강 이력 <ChevronRight className="w-4 h-4" />
              </Button>
            </motion.div>
          )}

          {/* ════════ STEP 2: 건강 이력 (Q1~Q5) ════════ */}
          {step === "health" && (
            <motion.div key="health" initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }} className="space-y-4">

              <SectionCard title="I. 생활 습관 및 건강 이력" icon={HeartPulse}>

                {/* Q1 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">1. 규칙적인 여가·취미 활동을 하고 있는 것에 표시하세요 <span className="text-xs text-muted-foreground font-normal">(중복 선택 가능)</span></p>
                  <p className="text-xs text-muted-foreground">한 번에 30분 이상, 1주일에 2~3회 이상 기준</p>
                  <MultiChip opts={LEISURE_OPTS} selected={health.q1Leisure} onChange={v=>setHealth(p=>({...p,q1Leisure:v}))} cols={2} />
                </div>

                <div className="border-t" />

                {/* Q2 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">2. 하루 평균 가사노동 시간은 얼마나 됩니까?</p>
                  <p className="text-xs text-muted-foreground">밥하기·빨래·청소·2살 미만 아이 돌보기 등</p>
                  <RadioGroup opts={HOUSEWORK_OPTS} value={health.q2Housework} onChange={v=>setHealth(p=>({...p,q2Housework:v}))} cols={2} />
                </div>

                <div className="border-t" />

                {/* Q3 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">3. 다음 질병을 진단받은 적이 있습니까?</p>
                  <div className="flex gap-2">
                    {["아니오","예"].map(v=>(
                      <button key={v} type="button" onClick={()=>setHealth(p=>({...p,q3Medical:v,q3Conditions:[],q3Status:""}))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${health.q3Medical===v?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                        data-testid={`button-q3-${v}`}>{v}</button>
                    ))}
                  </div>
                  {health.q3Medical === "예" && (
                    <div className="pl-3 border-l-2 border-purple-300 space-y-3 mt-2">
                      <MultiChip opts={MEDICAL_CONDITIONS} selected={health.q3Conditions} onChange={v=>setHealth(p=>({...p,q3Conditions:v}))} cols={2} />
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">현재 상태</p>
                        <div className="flex gap-2">
                          {["완치","치료나 관찰 중"].map(s=>(
                            <button key={s} type="button" onClick={()=>setHealth(p=>({...p,q3Status:s}))}
                              className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${health.q3Status===s?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                              data-testid={`button-q3status-${s}`}>{s}</button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="border-t" />

                {/* Q4 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">4. 과거에 운동 중 혹은 사고(교통사고·넘어짐·추락 등)로 다친 적이 있습니까?</p>
                  <div className="flex gap-2">
                    {["아니오","예"].map(v=>(
                      <button key={v} type="button" onClick={()=>setHealth(p=>({...p,q4Injury:v,q4Parts:[]}))}
                        className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${health.q4Injury===v?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                        data-testid={`button-q4-${v}`}>{v}</button>
                    ))}
                  </div>
                  {health.q4Injury === "예" && (
                    <div className="pl-3 border-l-2 border-purple-300 mt-2">
                      <p className="text-xs text-muted-foreground mb-2">상해 부위 선택 (중복 가능)</p>
                      <MultiChip opts={INJURY_PARTS} selected={health.q4Parts} onChange={v=>setHealth(p=>({...p,q4Parts:v}))} cols={3} />
                    </div>
                  )}
                </div>

                <div className="border-t" />

                {/* Q5 */}
                <div className="space-y-2">
                  <p className="text-sm font-semibold">5. 현재 하시는 일의 육체적 부담 정도는 어느 정도입니까?</p>
                  <RadioGroup opts={BURDEN_LEVELS} value={health.q5Burden} onChange={v=>setHealth(p=>({...p,q5Burden:v}))} cols={2} />
                </div>

              </SectionCard>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1" onClick={()=>setStep("info")}><ChevronLeft className="w-4 h-4" />이전</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2" onClick={()=>setStep("burden")} data-testid="button-next-health">
                  다음 — 부담작업 <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </motion.div>
          )}

          {/* ════════ STEP 3: 부담작업 ════════ */}
          {step === "burden" && (
            <motion.div key="burden" initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }} className="space-y-4">

              <SectionCard title="해당하는 부담작업 선택" icon={Briefcase}>
                <p className="text-xs text-muted-foreground -mt-2">여러 항목을 중복 선택할 수 있습니다. 해당 없으면 선택 없이 다음으로 이동하세요.</p>

                <div className="space-y-2">
                  {BURDEN_WORKS.map(bw => {
                    const sel = burdenList.includes(bw.no);
                    return (
                      <button key={bw.no} type="button" onClick={()=>toggleBurden(bw.no)}
                        className={`w-full text-left rounded-xl border transition-all overflow-hidden ${sel?"border-purple-500 bg-purple-50 dark:bg-purple-900/30":"border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
                        data-testid={`button-burden-${bw.no}`}
                      >
                        <div className="flex items-stretch">
                          <div className="flex-shrink-0 w-20 h-16 bg-white flex items-center justify-center p-1 border-r border-border/50">
                            <img src={BURDEN_ILLUS[bw.no-1]} alt={`${bw.no}호`} className="w-full h-full object-contain" />
                          </div>
                          <div className="flex items-center gap-3 px-3 py-2 flex-1 min-w-0">
                            <div className={`w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${sel?"border-purple-500 bg-purple-500":"border-muted-foreground/40"}`}>
                              {sel && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                            </div>
                            <div className="min-w-0">
                              <div className="text-sm font-semibold leading-snug">
                                <span className="text-purple-600 dark:text-purple-400">{bw.no}호.</span>{" "}{bw.short}
                              </div>
                              <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{bw.desc}</div>
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              {burdenList.length > 0 && (
                <div className="flex items-center gap-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl border border-purple-200 dark:border-purple-800 px-4 py-2.5">
                  <CircleAlert className="w-4 h-4 text-purple-600 flex-shrink-0" />
                  <span className="text-sm text-purple-700 dark:text-purple-300">
                    <span className="font-bold">{burdenList.length}가지</span> 선택됨 · 다음에 증상조사를 진행합니다
                  </span>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1" onClick={()=>setStep("health")}><ChevronLeft className="w-4 h-4" />이전</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2" onClick={()=>{ if(burdenList.length>0) setStep("symptoms"); else handleSubmit(); }} disabled={submitting} data-testid="button-next-burden">
                  {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : burdenList.length > 0 ? <><span>다음 — 증상조사</span><ChevronRight className="w-4 h-4" /></> : <><CheckCircle2 className="w-4 h-4" /><span>제출하기</span></>}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ════════ STEP 4: 증상조사 II ════════ */}
          {step === "symptoms" && (
            <motion.div key="symptoms" initial={{ opacity:0, x:30 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-30 }} className="space-y-4">

              <SectionCard title="II. 신체 부위별 증상조사" icon={Activity}>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                  <p className="font-semibold">지난 1년 동안 통증·불편함(통증, 쑤시는 느낌, 뻣뻣함, 화끈거리는 느낌, 무감각, 찌릿찌릿함 등)을 느끼신 적이 있습니까?</p>
                </div>

                <div className="flex gap-2">
                  {["예","아니오"].map(v=>(
                    <button key={v} type="button" onClick={()=>{ setHasPain(v); if(v==="아니오") setSymptoms({}); }}
                      className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-all ${hasPain===v?"border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700":"border-border hover:border-purple-300"}`}
                      data-testid={`button-haspain-${v}`}>{v}</button>
                  ))}
                </div>

                {hasPain === "예" && (
                  <div className="space-y-4 pt-1">
                    <p className="text-xs text-muted-foreground">통증이 있는 부위를 선택하고 세부 정보를 입력하세요 (중복 가능)</p>

                    {/* 신체 부위 탭 선택 */}
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {BODY_PARTS.map(bp => {
                        const sel = !!symptoms[bp.key];
                        return (
                          <button key={bp.key} type="button" onClick={()=>toggleBodyPart(bp.key)}
                            className={`py-2 px-1 rounded-xl border text-xs font-semibold text-center transition-all ${sel?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300 hover:bg-purple-50/30 text-foreground"}`}
                            data-testid={`button-bodypart-${bp.key}`}
                          >
                            {bp.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* 선택된 부위별 세부 조사 */}
                    {BODY_PARTS.filter(bp=>symptoms[bp.key]).map(bp => {
                      const sym = symptoms[bp.key];
                      return (
                        <div key={bp.key} className="rounded-xl border border-purple-300 dark:border-purple-700 overflow-hidden">
                          <div className="bg-purple-50 dark:bg-purple-900/30 px-4 py-2.5 flex items-center justify-between">
                            <span className="text-sm font-bold text-purple-700 dark:text-purple-300">{bp.label}</span>
                            <button type="button" onClick={()=>toggleBodyPart(bp.key)} className="text-xs text-muted-foreground hover:text-destructive">제거</button>
                          </div>
                          <div className="p-4 space-y-4">

                            {/* 1. 구체적 부위 (좌/우/양쪽) */}
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

                            {/* 2. 통증 지속기간 */}
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">2. 한 번 아프기 시작하면 통증 기간은?</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {DURATION_OPTS.map(d=>(
                                  <button key={d} type="button" onClick={()=>updateSym(bp.key,"duration",d)}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${sym.duration===d?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-duration-${bp.key}-${d}`}>{d}</button>
                                ))}
                              </div>
                            </div>

                            {/* 3. 통증 강도 */}
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">3. 그때의 아픈 정도는?</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {INTENSITY_OPTS.map(it=>(
                                  <button key={it} type="button" onClick={()=>updateSym(bp.key,"intensity",it)}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${sym.intensity===it?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-intensity-${bp.key}-${it}`}>{it}</button>
                                ))}
                              </div>
                              <div className="bg-muted/60 rounded-lg p-2 text-[10px] text-muted-foreground space-y-0.5">
                                <p>· 약한 통증: 약간 불편하나 작업에 열중할 때는 못 느낀다</p>
                                <p>· 중간 통증: 작업 중 통증이 있으나 귀가 후 휴식하면 괜찮다</p>
                                <p>· 심한 통증: 비교적 심하고 귀가 후에도 계속된다</p>
                                <p>· 매우 심한 통증: 통증 때문에 일상생활이 어렵다</p>
                              </div>
                            </div>

                            {/* 4. 증상 빈도 */}
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">4. 지난 1년 동안 이러한 증상을 얼마나 자주 경험했습니까?</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {FREQUENCY_OPTS.map(f=>(
                                  <button key={f} type="button" onClick={()=>updateSym(bp.key,"frequency",f)}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${sym.frequency===f?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-freq-${bp.key}-${f}`}>{f}</button>
                                ))}
                              </div>
                            </div>

                            {/* 5. 지난 1주일 */}
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">5. 지난 1주일 동안에도 이러한 증상이 있었습니까?</p>
                              <div className="flex gap-2">
                                {["예","아니오"].map(v=>(
                                  <button key={v} type="button" onClick={()=>updateSym(bp.key,"pastWeek",v)}
                                    className={`flex-1 py-1.5 text-xs rounded-lg border font-semibold transition-all ${sym.pastWeek===v?"border-purple-500 bg-purple-500 text-white":"border-border hover:border-purple-300"}`}
                                    data-testid={`button-pastweek-${bp.key}-${v}`}>{v}</button>
                                ))}
                              </div>
                            </div>

                            {/* 6. 지난 1년 치료 */}
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">6. 지난 1년 동안 이러한 통증으로 인해 어떤 일이 있었습니까? (중복 선택)</p>
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
              </SectionCard>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1 gap-1" onClick={()=>setStep("burden")}><ChevronLeft className="w-4 h-4" />이전</Button>
                <Button className="flex-1 bg-purple-600 hover:bg-purple-700 text-white gap-2" onClick={handleSubmit} disabled={submitting||hasPain===""} data-testid="button-submit">
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" />등록 중...</> : <><CheckCircle2 className="w-4 h-4" />제출하기</>}
                </Button>
              </div>
            </motion.div>
          )}

          {/* ════════ DONE ════════ */}
          {step === "done" && (
            <motion.div key="done" initial={{ opacity:0, scale:0.95 }} animate={{ opacity:1, scale:1 }} className="flex flex-col items-center gap-6 text-center py-8">
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                <CheckCircle2 className="w-10 h-10 text-green-600 dark:text-green-400" />
              </div>
              <div className="space-y-2">
                <h2 className="text-xl font-bold">등록이 완료되었습니다!</h2>
                <p className="text-sm text-muted-foreground">안전담당자가 검토 후 연락드릴 예정입니다.<br />불편사항이 있으시면 안전담당자에게 문의하세요.</p>
              </div>
              <div className="bg-muted/50 rounded-xl border px-5 py-4 text-left space-y-2 w-full max-w-sm">
                <p className="text-xs font-semibold text-muted-foreground">제출 내용 요약</p>
                {[
                  { label:"이름", value: info.name || "익명" },
                  { label:"부서", value: info.department },
                  { label:"부담작업", value: burdenList.length === 0 ? "해당 없음" : `${burdenList.join("호, ")}호 (${burdenList.length}가지)` },
                  { label:"증상 부위", value: Object.keys(symptoms).length === 0 ? (hasPain==="아니오"?"해당 없음":"미선택") : BODY_PARTS.filter(b=>symptoms[b.key]).map(b=>b.label).join(", ") },
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

        {/* 하단 유의사항 */}
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
