import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Thermometer, RefreshCw, Trash2, QrCode, Copy, Search, Calendar, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, TrendingUp, Users, Download, Loader2, FileArchive,
} from "lucide-react";

const CHECKLIST_FULL = [
  { label: "몸 상태 이상", text: "오늘 아침 전과 다르게 몸 상태가 좋지 않다고 느낀다.", reverse: false },
  { label: "열이 식지 않음", text: "최근 활동 후 쉬었으나 몸의 열이 식지 않는다고 느낀다.", reverse: false },
  { label: "기저질환·약복용", text: "아래의 질환이 있거나, 약을 복용하였다.", reverse: false },
  { label: "수면 부족", text: "어젯밤 설사, 음주로 인한 숙취, 근심걱정 등으로 인해 잠을 잘 이루지 못하였다.", reverse: false },
  { label: "심신 피로", text: "최근 힘든 일이 있어 심신이 지쳐있다.", reverse: false },
  { label: "더위 민감", text: "평소 에어컨을 틀어두어도 땀이 흐를 정도로 더위를 쉽게 느낀다.", reverse: false },
  { label: "온열증상 경험 없음", text: "온열질환으로 인한 증상(어지러움, 두통, 열 등)을 경험한 적이 없다.", reverse: true },
  { label: "작업 전념", text: "나는 일을 시작하게 되면 쉴새 없이 전념하게 된다.", reverse: false },
  { label: "계획대로 외부작업", text: "폭염기간이라도 계획대로 반드시 외부작업 혹은 활동을 진행하려 한다.", reverse: false },
  { label: "스스로 처리", text: "나에게 맡겨진 일을 가급적 스스로 하며, 일일이 챙겨 끝까지 처리하려 한다.", reverse: false },
];

const RISK_META: Record<string, { label: string; badgeClass: string; cardClass: string; textClass: string; desc: string }> = {
  낮음:    { label: "낮음",   badgeClass: "bg-green-100 text-green-700 border-green-200",   cardClass: "bg-green-50 border-green-200",   textClass: "text-green-700",  desc: "현재 온열질환 취약도가 낮습니다. 작업 중 수분 보충에 유의하세요." },
  보통:    { label: "보통",   badgeClass: "bg-yellow-100 text-yellow-700 border-yellow-200", cardClass: "bg-yellow-50 border-yellow-200", textClass: "text-yellow-700", desc: "일부 위험요인이 있습니다. 규칙적인 휴식과 수분 보충이 필요합니다." },
  높음:    { label: "높음",   badgeClass: "bg-orange-100 text-orange-700 border-orange-200", cardClass: "bg-orange-50 border-orange-200", textClass: "text-orange-700", desc: "온열질환 취약도가 높습니다. 관리자에게 보고하고 충분한 주의가 필요합니다." },
  매우높음:{ label: "매우높음",badgeClass: "bg-red-100 text-red-700 border-red-200",         cardClass: "bg-red-50 border-red-200",       textClass: "text-red-700",    desc: "온열질환 위험이 매우 높습니다. 즉시 관리자에게 보고하고 외부 작업을 자제하세요." },
};

interface Survey {
  id: number;
  name: string;
  department: string;
  workArea: string | null;
  answers: (string | null)[];
  score: number;
  riskLevel: string;
  createdAt: string;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** 모바일 결과 화면을 그대로 재현한 카드 */
function SurveyResultCard({ survey }: { survey: Survey }) {
  const rm = RISK_META[survey.riskLevel] ?? RISK_META["낮음"];
  const dateStr = (() => {
    const d = new Date(survey.createdAt);
    return `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;
  })();

  return (
    <div className="border-t border-sky-100 bg-gradient-to-b from-sky-50/60 to-white px-4 py-5">
      <div className="max-w-sm mx-auto space-y-4">

        {/* ── 모바일 헤더 미니 재현 ── */}
        <div className="bg-gradient-to-r from-sky-500 to-cyan-400 rounded-xl px-4 py-3 text-white text-center shadow-sm">
          <div className="flex items-center justify-center gap-1.5 mb-0.5">
            <Thermometer className="w-4 h-4 opacity-80" />
            <span className="text-xs opacity-80">야외근로자용</span>
          </div>
          <p className="text-sm font-bold leading-tight">온열질환 특성 자가진단표</p>
          <p className="text-[10px] opacity-70 mt-0.5">{dateStr} · 작업 전 실시</p>
        </div>

        {/* ── 완료 아이콘 ── */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-14 h-14 rounded-full bg-green-50 border-4 border-green-200 flex items-center justify-center">
            <CheckCircle2 className="w-7 h-7 text-green-500" />
          </div>
          <p className="text-base font-bold text-foreground">자가진단 등록 완료</p>
        </div>

        {/* ── 제출자 정보 ── */}
        <div className="bg-white border border-sky-100 rounded-xl px-4 py-3 text-sm space-y-1.5 shadow-sm">
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground w-14 flex-shrink-0">이름</span>
            <span className="font-semibold">{survey.name}</span>
          </div>
          <div className="flex gap-2">
            <span className="text-xs text-muted-foreground w-14 flex-shrink-0">부서</span>
            <span className="font-semibold">{survey.department}</span>
          </div>
          {survey.workArea && (
            <div className="flex gap-2">
              <span className="text-xs text-muted-foreground w-14 flex-shrink-0">국소명</span>
              <span className="font-semibold">{survey.workArea}</span>
            </div>
          )}
        </div>

        {/* ── 취약도 결과 카드 ── */}
        <div className={`rounded-xl border-2 px-4 py-4 ${rm.cardClass} shadow-sm`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-gray-600">온열질환 취약도</p>
            <span className={`text-lg font-black ${rm.textClass}`}>{rm.label}</span>
          </div>
          {/* 점수 바 */}
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-3 bg-gradient-to-r from-green-300 via-yellow-300 via-orange-300 to-red-400 rounded-full relative">
              <div
                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-600 rounded-full shadow"
                style={{ left: `${Math.min((survey.score / 10) * 100, 95)}%`, transform: "translateX(-50%) translateY(-50%)" }}
              />
            </div>
            <span className={`text-2xl font-black ${rm.textClass}`}>{survey.score}점</span>
          </div>
          {/* 점수 칸 */}
          <div className="flex gap-0.5 mb-2">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className={`flex-1 h-2 rounded-sm ${i < survey.score ? "bg-orange-400" : "bg-gray-200"}`} />
            ))}
          </div>
          {(survey.riskLevel === "높음" || survey.riskLevel === "매우높음") && (
            <div className="flex items-start gap-1.5 bg-white/60 rounded-lg p-2 mt-1">
              <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${rm.textClass}`} />
              <p className={`text-xs font-medium ${rm.textClass}`}>{rm.desc}</p>
            </div>
          )}
          {(survey.riskLevel === "낮음" || survey.riskLevel === "보통") && (
            <p className={`text-xs ${rm.textClass} mt-1`}>{rm.desc}</p>
          )}
        </div>

        {/* ── 항목별 응답 ── */}
        <div>
          <p className="text-xs font-semibold text-muted-foreground mb-2">항목별 응답</p>
          <div className="grid grid-cols-2 gap-1">
            {CHECKLIST_FULL.map((item, idx) => {
              const ans = survey.answers[idx];
              const isRisk = item.reverse ? ans === "아니오" : ans === "예";
              return (
                <div
                  key={idx}
                  className={`rounded-lg px-2.5 py-2 border text-xs ${
                    isRisk
                      ? "bg-orange-50 border-orange-200"
                      : "bg-white border-gray-100"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1">
                    <span className={`leading-snug flex-1 ${isRisk ? "text-orange-700 font-medium" : "text-gray-500"}`}>
                      <span className="font-bold mr-0.5">{idx + 1}.</span> {item.label}
                    </span>
                    <span className={`font-black flex-shrink-0 text-sm ${
                      isRisk ? "text-orange-500" : ans === null ? "text-gray-300" : "text-gray-400"
                    }`}>
                      {ans === "예" ? "예" : ans === "아니오" ? "아니오" : "—"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/** 결과카드 HTML 문자열 생성 (html2canvas 캡쳐용, inline style 전용) */
function buildCardHtml(s: Survey): string {
  const rm = RISK_META[s.riskLevel] ?? RISK_META["낮음"];
  const d = new Date(s.createdAt);
  const dateStr = `${d.getFullYear()}년 ${d.getMonth() + 1}월 ${d.getDate()}일`;

  const riskColors: Record<string, { bar: string; text: string; bg: string; border: string }> = {
    낮음:    { bar: "#22c55e", text: "#15803d", bg: "#f0fdf4", border: "#86efac" },
    보통:    { bar: "#eab308", text: "#a16207", bg: "#fefce8", border: "#fde047" },
    높음:    { bar: "#f97316", text: "#c2410c", bg: "#fff7ed", border: "#fdba74" },
    매우높음:{ bar: "#ef4444", text: "#b91c1c", bg: "#fef2f2", border: "#fca5a5" },
  };
  const rc = riskColors[s.riskLevel] ?? riskColors["낮음"];

  const answerRows = CHECKLIST_FULL.map((item, idx) => {
    const ans = s.answers[idx] ?? "—";
    const isRisk = item.reverse ? ans === "아니오" : ans === "예";
    return `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;border-radius:6px;background:${isRisk ? "#fff7ed" : "#f8fafc"};border:1px solid ${isRisk ? "#fed7aa" : "#e2e8f0"};margin-bottom:4px;">
      <span style="font-size:11px;color:${isRisk ? "#c2410c" : "#64748b"};flex:1;">${idx + 1}. ${item.label}</span>
      <span style="font-size:12px;font-weight:700;color:${isRisk ? "#ea580c" : "#94a3b8"};margin-left:8px;">${ans}</span>
    </div>`;
  }).join("");

  const scoreBarPct = Math.min((s.score / 10) * 100, 95);

  const infoRows = [
    `<div style="display:flex;gap:12px;padding:5px 0;border-bottom:1px solid #f1f5f9;"><span style="font-size:11px;color:#94a3b8;width:48px;flex-shrink:0;">이름</span><span style="font-size:13px;font-weight:600;color:#0f172a;">${s.name}</span></div>`,
    `<div style="display:flex;gap:12px;padding:5px 0;border-bottom:1px solid #f1f5f9;"><span style="font-size:11px;color:#94a3b8;width:48px;flex-shrink:0;">부서</span><span style="font-size:13px;font-weight:600;color:#0f172a;">${s.department}</span></div>`,
    s.workArea ? `<div style="display:flex;gap:12px;padding:5px 0;"><span style="font-size:11px;color:#94a3b8;width:48px;flex-shrink:0;">국소명</span><span style="font-size:13px;font-weight:600;color:#0f172a;">${s.workArea}</span></div>` : "",
  ].join("");

  return `<div style="width:380px;background:linear-gradient(180deg,#f0f9ff 0%,#ffffff 100%);font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;padding:16px;">
    <!-- 헤더 -->
    <div style="background:linear-gradient(90deg,#0ea5e9,#22d3ee);border-radius:12px;padding:14px 16px;text-align:center;color:white;margin-bottom:14px;">
      <div style="font-size:11px;opacity:0.85;margin-bottom:3px;">야외근로자용</div>
      <div style="font-size:15px;font-weight:700;">온열질환 특성 자가진단표</div>
      <div style="font-size:10px;opacity:0.75;margin-top:3px;">${dateStr} · 작업 전 실시</div>
    </div>
    <!-- 완료 아이콘 -->
    <div style="text-align:center;margin-bottom:14px;">
      <div style="display:inline-flex;align-items:center;justify-content:center;width:52px;height:52px;border-radius:50%;background:#f0fdf4;border:3px solid #86efac;margin-bottom:6px;">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div style="font-size:15px;font-weight:700;color:#0f172a;">자가진단 등록 완료</div>
    </div>
    <!-- 정보 카드 -->
    <div style="background:white;border:1px solid #e0f2fe;border-radius:12px;padding:12px 14px;margin-bottom:12px;">${infoRows}</div>
    <!-- 취약도 카드 -->
    <div style="background:${rc.bg};border:2px solid ${rc.border};border-radius:12px;padding:14px;margin-bottom:12px;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
        <span style="font-size:11px;color:#475569;font-weight:600;">온열질환 취약도</span>
        <span style="font-size:18px;font-weight:900;color:${rc.text};">${rm.label}</span>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
        <div style="flex:1;height:10px;border-radius:999px;background:linear-gradient(90deg,#86efac,#fde047,#fb923c,#f87171);position:relative;">
          <div style="position:absolute;top:50%;left:${scoreBarPct}%;transform:translate(-50%,-50%);width:14px;height:14px;background:white;border:2px solid #374151;border-radius:50%;box-shadow:0 1px 3px rgba(0,0,0,.2);"></div>
        </div>
        <span style="font-size:20px;font-weight:900;color:${rc.text};">${s.score}점</span>
      </div>
      <div style="display:flex;gap:2px;margin-bottom:8px;">
        ${Array.from({length:10}).map((_,i)=>`<div style="flex:1;height:6px;border-radius:3px;background:${i < s.score ? rc.bar : "#e2e8f0"};"></div>`).join("")}
      </div>
      <div style="font-size:11px;color:${rc.text};">${rm.desc}</div>
    </div>
    <!-- 항목별 응답 -->
    <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:6px;">항목별 응답</div>
    ${answerRows}
  </div>`;
}

export default function HeatIllnessSurveyList() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [exporting, setExporting] = useState(false);

  const publicUrl = `${window.location.origin}/heat-illness/submit`;

  const { data: surveys = [], isLoading, refetch } = useQuery<Survey[]>({
    queryKey: ["/api/heat-illness-surveys", dateFrom, dateTo],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (dateFrom) params.set("from", dateFrom);
      if (dateTo) params.set("to", dateTo);
      const res = await fetch(`/api/heat-illness-surveys?${params}`);
      if (!res.ok) throw new Error("조회 실패");
      return res.json();
    },
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/heat-illness-surveys/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("삭제 실패");
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/heat-illness-surveys"] }); toast({ title: "삭제되었습니다." }); },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const filtered = surveys.filter((s) => {
    const q = search.toLowerCase();
    return !q || s.name.includes(q) || s.department.includes(q) || (s.workArea ?? "").includes(q);
  });

  // 통계
  const stats = {
    total: filtered.length,
    high: filtered.filter((s) => s.riskLevel === "높음" || s.riskLevel === "매우높음").length,
    avgScore: filtered.length ? (filtered.reduce((a, b) => a + b.score, 0) / filtered.length).toFixed(1) : "0",
  };

  function copyUrl() {
    navigator.clipboard.writeText(publicUrl);
    toast({ title: "링크가 복사되었습니다." });
  }

  function exportCsv() {
    const header = ["번호", "이름", "부서", "국소명", "점수", "취약도", "등록일시", ...CHECKLIST_FULL.map(c => c.label)];
    const rows = filtered.map((s) => [
      s.id, s.name, s.department, s.workArea ?? "",
      s.score, s.riskLevel, formatDate(s.createdAt),
      ...s.answers.map((a) => a ?? ""),
    ]);
    const csv = [header, ...rows].map((r) => r.map(String).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `온열질환자가진단_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  async function exportZip() {
    if (filtered.length === 0) { toast({ title: "다운로드할 데이터가 없습니다." }); return; }
    setExporting(true);
    try {
      const [{ default: JSZip }, { default: html2canvas }] = await Promise.all([
        import("jszip"),
        import("html2canvas"),
      ]);

      const zip = new JSZip();

      // CSV
      const header = ["번호", "이름", "부서", "국소명", "점수", "취약도", "등록일시", ...CHECKLIST_FULL.map(c => c.label)];
      const rows = filtered.map((s) => [s.id, s.name, s.department, s.workArea ?? "", s.score, s.riskLevel, formatDate(s.createdAt), ...s.answers.map((a) => a ?? "")]);
      const csv = [header, ...rows].map((r) => r.map(String).join(",")).join("\n");
      zip.file("자가진단_목록.csv", "\uFEFF" + csv);

      // 결과카드 이미지
      const cardsFolder = zip.folder("결과카드")!;
      const wrapper = document.createElement("div");
      wrapper.style.cssText = "position:fixed;left:-9999px;top:0;z-index:-1;background:transparent;";
      document.body.appendChild(wrapper);

      for (const s of filtered) {
        wrapper.innerHTML = buildCardHtml(s);
        const el = wrapper.firstElementChild as HTMLElement;
        const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: "#f0f9ff" });
        const blob = await new Promise<Blob>((res) => canvas.toBlob((b) => res(b!), "image/png"));
        const d = new Date(s.createdAt);
        const datePart = `${d.getMonth()+1}월${d.getDate()}일`;
        cardsFolder.file(`${String(s.id).padStart(3,"0")}_${s.name}_${s.department}_${datePart}.png`, blob);
      }

      document.body.removeChild(wrapper);

      const zipBlob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `온열질환자가진단_${new Date().toISOString().slice(0,10)}.zip`;
      a.click();
      toast({ title: `ZIP 다운로드 완료 (${filtered.length}건)` });
    } catch (e: any) {
      toast({ title: "다운로드 실패", description: e.message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* 타이틀 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 flex items-center justify-center">
            <Thermometer className="w-5 h-5 text-sky-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">온열질환 자가진단 목록</h1>
            <p className="text-xs text-muted-foreground">야외근로자 자가진단 제출 현황</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowQr(!showQr)}>
            <QrCode className="w-4 h-4 mr-1" /> QR / 링크
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}>
            <Download className="w-4 h-4 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={exportZip} disabled={exporting}>
            {exporting
              ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> 생성 중...</>
              : <><FileArchive className="w-4 h-4 mr-1" /> ZIP+이미지</>}
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> 새로고침
          </Button>
        </div>
      </div>

      {/* QR/링크 패널 */}
      {showQr && (
        <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex flex-col sm:flex-row items-center gap-4">
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(publicUrl)}`}
            alt="QR코드"
            className="w-28 h-28 rounded-lg border border-sky-200 bg-white p-1"
          />
          <div className="flex-1 space-y-2 text-center sm:text-left">
            <p className="text-sm font-semibold text-sky-800">직원 자가진단 링크</p>
            <p className="text-xs text-muted-foreground">QR코드를 현장에 부착하거나 링크를 공유하세요.<br />로그인 없이 모바일에서 바로 작성 가능합니다.</p>
            <div className="flex flex-col sm:flex-row gap-2">
              <code className="flex-1 text-xs bg-white border rounded px-2 py-1.5 break-all">{publicUrl}</code>
              <Button size="sm" variant="outline" onClick={copyUrl} className="border-sky-300 text-sky-700">
                <Copy className="w-3 h-3 mr-1" /> 복사
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 통계 카드 */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white border rounded-xl p-3 text-center">
          <Users className="w-5 h-5 mx-auto text-sky-500 mb-1" />
          <div className="text-2xl font-black text-foreground">{stats.total}</div>
          <div className="text-xs text-muted-foreground">총 제출</div>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <AlertTriangle className="w-5 h-5 mx-auto text-orange-500 mb-1" />
          <div className="text-2xl font-black text-orange-600">{stats.high}</div>
          <div className="text-xs text-muted-foreground">고위험(높음+)</div>
        </div>
        <div className="bg-white border rounded-xl p-3 text-center">
          <TrendingUp className="w-5 h-5 mx-auto text-blue-500 mb-1" />
          <div className="text-2xl font-black text-foreground">{stats.avgScore}</div>
          <div className="text-xs text-muted-foreground">평균 점수</div>
        </div>
      </div>

      {/* 필터 */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-sm"
            placeholder="이름·부서·국소명 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <Input type="date" className="h-9 text-sm w-36" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <span className="text-muted-foreground text-sm">~</span>
          <Input type="date" className="h-9 text-sm w-36" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </div>
      </div>

      {/* 목록 */}
      {isLoading ? (
        <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-muted-foreground gap-2">
          <CheckCircle2 className="w-10 h-10 opacity-30" />
          <p className="text-sm">제출된 자가진단이 없습니다.</p>
        </div>
      ) : (
        <div className="bg-white border rounded-xl overflow-hidden">
          {/* 헤더 */}
          <div className="grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 items-center px-4 py-2 bg-sky-500 text-white text-xs font-semibold">
            <span className="w-8 text-center">번호</span>
            <span>이름 · 부서</span>
            <span className="w-12 text-center">점수</span>
            <span className="w-16 text-center hidden sm:block">취약도</span>
            <span className="w-28 hidden md:block">등록일시</span>
            <span className="w-16 text-center">관리</span>
          </div>

          <div className="divide-y divide-gray-100">
            {filtered.map((s) => {
              const rb = RISK_META[s.riskLevel] ?? RISK_META["낮음"];
              const isExpanded = expandedId === s.id;
              return (
                <div key={s.id}>
                  <div
                    className={`grid grid-cols-[auto_1fr_auto_auto_auto_auto] gap-x-3 items-center px-4 py-3 hover:bg-sky-50/40 cursor-pointer transition-colors
                      ${(s.riskLevel === "높음" || s.riskLevel === "매우높음") ? "border-l-4 border-orange-400" : "border-l-4 border-transparent"}`}
                    onClick={() => setExpandedId(isExpanded ? null : s.id)}
                  >
                    <span className="w-8 text-center text-xs text-muted-foreground">{s.id}</span>
                    <div>
                      <span className="font-semibold text-sm text-foreground">{s.name}</span>
                      <span className="text-xs text-muted-foreground ml-2">{s.department}</span>
                      {s.workArea && <span className="text-xs text-sky-600 ml-1">· {s.workArea}</span>}
                    </div>
                    <span className="w-12 text-center font-bold text-sm text-foreground">{s.score}점</span>
                    <span className="w-16 hidden sm:flex justify-center">
                      <Badge variant="outline" className={`text-xs px-1.5 ${rb.badgeClass}`}>{rb.label}</Badge>
                    </span>
                    <span className="w-28 hidden md:block text-xs text-muted-foreground">{formatDate(s.createdAt)}</span>
                    <div className="w-16 flex items-center justify-center gap-1">
                      {isExpanded
                        ? <ChevronUp className="w-4 h-4 text-muted-foreground" />
                        : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                      <button
                        className="p-1 text-red-400 hover:text-red-600 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (confirm(`${s.name}의 자가진단 기록을 삭제하시겠습니까?`)) deleteMut.mutate(s.id);
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  {isExpanded && <SurveyResultCard survey={s} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
