import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Thermometer, RefreshCw, Trash2, QrCode, Copy, Search, Calendar, ChevronDown, ChevronUp,
  AlertTriangle, CheckCircle2, TrendingUp, Users, Download,
} from "lucide-react";

const CHECKLIST_LABELS = [
  "몸 상태 이상",
  "열이 식지 않음",
  "기저질환·약복용",
  "수면 부족",
  "심신 피로",
  "더위 민감",
  "온열증상 경험 없음 (역)",
  "작업 전념",
  "계획대로 외부작업",
  "스스로 처리",
];

const RISK_BADGE: Record<string, { label: string; class: string }> = {
  낮음: { label: "낮음", class: "bg-green-100 text-green-700 border-green-200" },
  보통: { label: "보통", class: "bg-yellow-100 text-yellow-700 border-yellow-200" },
  높음: { label: "높음", class: "bg-orange-100 text-orange-700 border-orange-200" },
  매우높음: { label: "매우높음", class: "bg-red-100 text-red-700 border-red-200" },
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

function SurveyDetail({ survey }: { survey: Survey }) {
  return (
    <div className="px-4 pb-4 pt-2 bg-sky-50/60 border-t border-sky-100">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1 text-xs">
        {CHECKLIST_LABELS.map((label, idx) => {
          const ans = survey.answers[idx];
          const isRisk =
            idx === 6 ? ans === "아니오" : ans === "예";
          return (
            <div
              key={idx}
              className={`rounded p-1.5 text-center border ${isRisk
                ? "bg-orange-50 border-orange-200 text-orange-700"
                : ans !== null
                  ? "bg-gray-50 border-gray-200 text-gray-500"
                  : "bg-white border-dashed border-gray-200 text-gray-300"}`}
            >
              <div className="font-semibold">{idx + 1}. {label}</div>
              <div className="mt-0.5 font-bold">{ans ?? "—"}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function HeatIllnessSurveyList() {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showQr, setShowQr] = useState(false);

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
    const header = ["번호", "이름", "부서", "작업구역", "점수", "취약도", "등록일시", ...CHECKLIST_LABELS];
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
            placeholder="이름·부서·작업구역 검색"
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
              const rb = RISK_BADGE[s.riskLevel] ?? RISK_BADGE["낮음"];
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
                      <Badge variant="outline" className={`text-xs px-1.5 ${rb.class}`}>{rb.label}</Badge>
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
                  {isExpanded && <SurveyDetail survey={s} />}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
