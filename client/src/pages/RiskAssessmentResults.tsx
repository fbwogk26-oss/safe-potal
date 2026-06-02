import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Upload, Trash2, FileSpreadsheet, TrendingUp, Users, Building2,
  CheckCircle2, AlertCircle, BarChart3, Download, ShieldAlert,
} from "lucide-react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface ResultRow {
  no: number | null;
  category: string;
  division: string;
  team: string;
  registrant: string;
  registeredAt: string;
  supervisor: string;
  status: string;
  responsibleTask: string;
  process: string;
  hazardCondition: string;
  hazardType: string;
  frequency: number | null;
  severity: number | null;
  riskScore: number | null;
  afterFrequency: number | null;
  afterSeverity: number | null;
  afterRiskScore: number | null;
}

interface UploadRecord {
  id: number;
  label: string;
  totalRows: number;
  rows: ResultRow[];
  uploadedBy: string | null;
  createdAt: string;
}

const TEAM_COLORS: Record<string, string> = {
  "동대구운용팀": "#f97316",
  "서대구운용팀": "#fb923c",
  "남대구운용팀": "#f59e0b",
  "구미운용팀": "#3b82f6",
  "포항운용팀": "#22c55e",
  "안동운용팀": "#a855f7",
  "문경운용팀": "#f43f5e",
  "대구운용계획팀": "#6366f1",
  "대구사업지원팀": "#14b8a6",
  "대구현장경영팀": "#84cc16",
};

function getTeamColor(team: string) {
  return TEAM_COLORS[team] ?? "#94a3b8";
}

function normalizeStatus(s: string) {
  return s === "자동종결" ? "승인요청" : (s || "기타");
}

function getRiskGrade(score: number | null) {
  if (!score) return { grade: "C", bg: "bg-blue-100 text-blue-700", dot: "#3b82f6" };
  if (score >= 8) return { grade: "A", bg: "bg-red-100 text-red-700", dot: "#ef4444" };
  if (score >= 3) return { grade: "B", bg: "bg-orange-100 text-orange-700", dot: "#f97316" };
  return { grade: "C", bg: "bg-blue-100 text-blue-700", dot: "#3b82f6" };
}

const STATUS_STYLES: Record<string, string> = {
  "승인완료": "bg-emerald-100 text-emerald-700 border-emerald-200",
  "승인대기": "bg-amber-100 text-amber-700 border-amber-200",
  "승인요청": "bg-sky-100 text-sky-700 border-sky-200",
  "임시저장": "bg-slate-100 text-slate-600 border-slate-200",
};

const STATUSES = ["승인완료", "승인요청"] as const;

export default function RiskAssessmentResults() {
  const { toast } = useToast();
  const { canEditRiskAssessment } = usePermissions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);

  const { data: uploads = [], isLoading } = useQuery<UploadRecord[]>({
    queryKey: ["/api/risk-assessment-results"],
    queryFn: () => fetch("/api/risk-assessment-results", { credentials: "include" }).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/risk-assessment-results/${id}`, { method: "DELETE", credentials: "include" })
        .then(r => { if (!r.ok) throw new Error("삭제 실패"); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessment-results"] });
      setSelectedId(null);
      toast({ title: "삭제 완료" });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("label", label || file.name.replace(/\.[^.]+$/, ""));
      const res = await fetch("/api/risk-assessment-results/upload", { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || "업로드 실패"); }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessment-results"] });
      setSelectedId(data.id);
      setLabel("");
      toast({ title: "업로드 완료", description: `${data.totalRows}건 분석 완료` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "업로드 실패", description: e.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleExport(id: number, lbl: string) {
    setDownloading(true);
    try {
      const res = await fetch(`/api/risk-assessment-results/${id}/export`, { credentials: "include" });
      if (!res.ok) throw new Error("다운로드 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${lbl}_분석결과.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ variant: "destructive", title: "다운로드 실패", description: e.message });
    } finally {
      setDownloading(false);
    }
  }

  const selected = uploads.find(u => u.id === selectedId) ?? uploads[0] ?? null;
  const rows: ResultRow[] = (selected?.rows as ResultRow[]) ?? [];

  // ── 통계 ──
  const totalCount = rows.length;

  const teamCount: Record<string, number> = {};
  for (const r of rows) teamCount[r.team || "기타"] = (teamCount[r.team || "기타"] || 0) + 1;
  const teamData = Object.entries(teamCount)
    .map(([team, count]) => ({ team, short: team.replace("운용팀", "").replace("팀", ""), count }))
    .sort((a, b) => b.count - a.count);

  const statusCount: Record<string, number> = {};
  for (const r of rows) {
    const s = normalizeStatus(r.status);
    statusCount[s] = (statusCount[s] || 0) + 1;
  }

  const gradeCount = { A: 0, B: 0, C: 0 };
  for (const r of rows) { const g = getRiskGrade(r.riskScore).grade as "A"|"B"|"C"; gradeCount[g]++; }

  const taskCount: Record<string, number> = {};
  for (const r of rows) { const t = r.responsibleTask || "미분류"; taskCount[t] = (taskCount[t] || 0) + 1; }
  const taskData = Object.entries(taskCount).sort((a, b) => b[1] - a[1]);
  const allTasks = taskData.map(([t]) => t);

  // 팀별 집계 (등록현황 요약)
  const teamSummary: Record<string, { tasks: Record<string, number>; statusMap: Record<string, number>; total: number }> = {};
  for (const r of rows) {
    const team = r.team || "기타";
    const task = r.responsibleTask || "미분류";
    const status = normalizeStatus(r.status);
    if (!teamSummary[team]) teamSummary[team] = { tasks: {}, statusMap: {}, total: 0 };
    teamSummary[team].tasks[task] = (teamSummary[team].tasks[task] || 0) + 1;
    teamSummary[team].statusMap[status] = (teamSummary[team].statusMap[status] || 0) + 1;
    teamSummary[team].total++;
  }
  const summaryTeams = Object.keys(teamSummary);

  // 인원별 집계 (부서별 등록건수)
  const personMap: Record<string, { team: string; name: string; tasks: Record<string, number>; total: number }> = {};
  for (const r of rows) {
    const key = `${r.team}||${r.registrant}`;
    if (!personMap[key]) personMap[key] = { team: r.team || "", name: r.registrant || "", tasks: {}, total: 0 };
    const task = r.responsibleTask || "미분류";
    personMap[key].tasks[task] = (personMap[key].tasks[task] || 0) + 1;
    personMap[key].total++;
  }
  const personList = Object.values(personMap).sort((a, b) => {
    if (a.team !== b.team) return a.team.localeCompare(b.team, "ko");
    return b.total - a.total;
  });
  const teamGroups: { team: string; members: typeof personList }[] = [];
  for (const p of personList) {
    const last = teamGroups[teamGroups.length - 1];
    if (!last || last.team !== p.team) teamGroups.push({ team: p.team, members: [p] });
    else last.members.push(p);
  }

  return (
    <div className="space-y-5">
      {/* ── 상단 액션 바 ── */}
      <div className="flex items-center gap-3 flex-wrap p-4 bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 rounded-xl border border-orange-100 dark:border-orange-900/30">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center">
            <ShieldAlert className="h-4 w-4 text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold">위험성평가 결과보고</p>
            <p className="text-xs text-muted-foreground">엑셀 업로드 후 자동 분석</p>
          </div>
        </div>
        <div className="h-8 w-px bg-border mx-1 hidden sm:block" />
        <Input
          placeholder="평가명 (예: 2026년 상반기)"
          className="h-8 text-sm w-48 bg-white dark:bg-background"
          value={label}
          onChange={e => setLabel(e.target.value)}
          data-testid="input-result-label"
        />
        <Button
          size="sm"
          className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white h-8 shadow-sm"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          data-testid="btn-upload-result"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? "분석 중..." : "엑셀 업로드"}
        </Button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} data-testid="input-result-file" />

        {selected && (
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 h-8 border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 ml-auto shadow-sm"
            disabled={downloading}
            onClick={() => handleExport(selected.id, selected.label)}
            data-testid="btn-export-result"
          >
            <Download className="h-3.5 w-3.5" />
            {downloading ? "생성 중..." : "엑셀 다운로드"}
          </Button>
        )}
      </div>

      {/* ── 업로드 목록 선택 ── */}
      {uploads.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground font-medium">불러올 데이터:</span>
          {uploads.map(u => (
            <button
              key={u.id}
              onClick={() => setSelectedId(u.id)}
              className={`group flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-all ${selected?.id === u.id ? "border-orange-400 bg-orange-50 text-orange-700 shadow-sm dark:bg-orange-950/30" : "border-border text-muted-foreground hover:border-orange-300 hover:text-foreground"}`}
              data-testid={`btn-select-upload-${u.id}`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {u.label}
              <span className="text-[11px] opacity-60">({u.totalRows}건)</span>
              {canEditRiskAssessment && (
                <span
                  className="ml-0.5 opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 transition-opacity"
                  onClick={e => { e.stopPropagation(); if (confirm(`"${u.label}" 데이터를 삭제하시겠습니까?`)) deleteMutation.mutate(u.id); }}
                  data-testid={`btn-delete-upload-${u.id}`}
                >
                  <Trash2 className="h-3 w-3" />
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground text-sm">
          <div className="w-4 h-4 rounded-full border-2 border-orange-400 border-t-transparent animate-spin" />
          불러오는 중...
        </div>
      )}

      {!isLoading && uploads.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <div className="w-16 h-16 rounded-2xl bg-orange-50 dark:bg-orange-950/20 flex items-center justify-center mb-4">
            <FileSpreadsheet className="h-8 w-8 text-orange-300" />
          </div>
          <p className="text-sm font-medium text-foreground mb-1">분석할 위험성평가 데이터가 없습니다</p>
          <p className="text-xs">"26년 상반기 위험성평가 내역" 시트가 포함된 엑셀 파일을 업로드하세요</p>
        </div>
      )}

      {selected && rows.length > 0 && (
        <>
          {/* ── 업로드 메타 ── */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground px-1">
            <span className="font-semibold text-foreground">{selected.label}</span>
            <span>·</span>
            <span>{format(new Date(selected.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })}</span>
            {selected.uploadedBy && <><span>·</span><span>{selected.uploadedBy}</span></>}
          </div>

          {/* ── 요약 카드 ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              {
                icon: <BarChart3 className="h-4 w-4" />,
                label: "총 등록건수",
                value: totalCount.toLocaleString(),
                sub: `${teamData.length}개 팀`,
                accent: "text-orange-600",
                bg: "from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20",
                border: "border-orange-200 dark:border-orange-800/40",
                iconBg: "bg-orange-500",
              },
              {
                icon: <AlertCircle className="h-4 w-4" />,
                label: "A등급 (중점관리)",
                value: gradeCount.A.toString(),
                sub: "위험성추정 8점 이상",
                accent: "text-red-600",
                bg: "from-red-50 to-rose-50 dark:from-red-950/20 dark:to-rose-950/20",
                border: "border-red-200 dark:border-red-800/40",
                iconBg: "bg-red-500",
              },
              {
                icon: <CheckCircle2 className="h-4 w-4" />,
                label: "승인완료",
                value: (statusCount["승인완료"] || 0).toString(),
                sub: `전체의 ${totalCount ? Math.round(((statusCount["승인완료"] || 0) / totalCount) * 100) : 0}%`,
                accent: "text-emerald-600",
                bg: "from-emerald-50 to-green-50 dark:from-emerald-950/20 dark:to-green-950/20",
                border: "border-emerald-200 dark:border-emerald-800/40",
                iconBg: "bg-emerald-500",
              },
              {
                icon: <Users className="h-4 w-4" />,
                label: "등록 인원",
                value: personList.length.toString(),
                sub: "명 참여",
                accent: "text-blue-600",
                bg: "from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20",
                border: "border-blue-200 dark:border-blue-800/40",
                iconBg: "bg-blue-500",
              },
            ].map(card => (
              <Card key={card.label} className={`border bg-gradient-to-br ${card.bg} ${card.border}`}>
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-xs text-muted-foreground">{card.label}</p>
                    <div className={`w-7 h-7 rounded-lg ${card.iconBg} flex items-center justify-center text-white`}>
                      {card.icon}
                    </div>
                  </div>
                  <p className={`text-2xl font-bold ${card.accent}`}>{card.value}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{card.sub}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* ── 차트 2개 ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 팀별 등록건수 바차트 */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-1 pt-4 px-5">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="w-6 h-6 rounded-md bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center">
                    <Building2 className="h-3.5 w-3.5 text-orange-500" />
                  </span>
                  팀별 등록건수
                </CardTitle>
              </CardHeader>
              <CardContent className="px-2 pb-4 pt-2">
                <ResponsiveContainer width="100%" height={190}>
                  <BarChart data={teamData} margin={{ top: 4, right: 12, left: -10, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                    <XAxis dataKey="short" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 8, border: "1px solid rgba(0,0,0,0.08)", fontSize: 12 }}
                      formatter={(v) => [`${v}건`, "등록건수"]}
                      labelFormatter={(l) => teamData.find(d => d.short === l)?.team || l}
                    />
                    <Bar dataKey="count" radius={[5, 5, 0, 0]}>
                      {teamData.map((entry, i) => <Cell key={i} fill={getTeamColor(entry.team)} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* 위험성 등급 + 담당업무 */}
            <div className="space-y-4">
              {/* 등급 분포 */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-1 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                      <TrendingUp className="h-3.5 w-3.5 text-red-500" />
                    </span>
                    위험성 등급 분포
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-2 space-y-2">
                  {[
                    { grade: "A", label: "A등급 · 중점관리", count: gradeCount.A, bar: "bg-red-500", text: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-950/20" },
                    { grade: "B", label: "B등급 · 일상관리", count: gradeCount.B, bar: "bg-orange-400", text: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-950/20" },
                    { grade: "C", label: "C등급 · 허용가능", count: gradeCount.C, bar: "bg-blue-400", text: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-950/20" },
                  ].map(g => (
                    <div key={g.grade} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${g.bg}`}>
                      <span className={`text-xs font-black w-4 ${g.text}`}>{g.grade}</span>
                      <div className="flex-1">
                        <div className="flex justify-between text-[11px] mb-1">
                          <span className={`${g.text} font-medium`}>{g.label}</span>
                          <span className="font-bold">{g.count}건</span>
                        </div>
                        <div className="h-1.5 bg-white/60 rounded-full overflow-hidden">
                          <div className={`h-full ${g.bar} rounded-full transition-all`} style={{ width: totalCount ? `${(g.count / totalCount) * 100}%` : "0%" }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* 담당업무별 건수 */}
              <Card className="border shadow-sm">
                <CardHeader className="pb-1 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <BarChart3 className="h-3.5 w-3.5 text-blue-500" />
                    </span>
                    담당업무별 건수
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-5 pb-4 pt-2 space-y-1.5">
                  {taskData.slice(0, 6).map(([task, count]) => (
                    <div key={task} className="flex items-center gap-2">
                      <span className="text-[11px] text-muted-foreground w-32 shrink-0 truncate" title={task}>{task}</span>
                      <div className="flex-1 h-2 bg-muted/60 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-blue-400 to-indigo-400 rounded-full" style={{ width: totalCount ? `${(count / totalCount) * 100}%` : "0%" }} />
                      </div>
                      <span className="text-[11px] font-bold w-7 text-right text-blue-700">{count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>

          {/* ── 등록현황 요약 테이블 ── */}
          <Card className="border shadow-sm">
            <CardHeader className="pb-2 pt-4 px-5">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <span className="w-6 h-6 rounded-md bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-amber-600" />
                </span>
                등록현황 요약
                <span className="ml-1 text-xs font-normal text-muted-foreground">팀별 × 담당업무 × 승인상태</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="px-0 pb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse" style={{ minWidth: Math.max(600, 120 + allTasks.length * 90 + 4 * 80 + 70) }}>
                  <thead>
                    <tr>
                      <th className="px-4 py-2.5 text-left font-semibold bg-amber-50 dark:bg-amber-950/20 border-b-2 border-amber-200 dark:border-amber-800 sticky left-0 z-10 whitespace-nowrap">팀</th>
                      {allTasks.map(t => (
                        <th key={t} className="px-3 py-2.5 text-center font-semibold bg-blue-50 dark:bg-blue-950/20 border-b-2 border-blue-200 dark:border-blue-800 whitespace-nowrap">{t}</th>
                      ))}
                      {STATUSES.map(s => (
                        <th key={s} className="px-3 py-2.5 text-center font-semibold bg-emerald-50 dark:bg-emerald-950/20 border-b-2 border-emerald-200 dark:border-emerald-800 whitespace-nowrap">{s}</th>
                      ))}
                      <th className="px-3 py-2.5 text-center font-bold bg-slate-100 dark:bg-slate-800/40 border-b-2 border-slate-300 dark:border-slate-600 whitespace-nowrap">합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summaryTeams.map((team, ti) => {
                      const t = teamSummary[team];
                      const color = getTeamColor(team);
                      return (
                        <tr key={team} className={`border-b border-border/30 hover:bg-orange-50/50 dark:hover:bg-orange-950/10 transition-colors`}>
                          <td className={`px-4 py-2 sticky left-0 border-r border-border/20 z-10 ${ti % 2 === 1 ? "bg-slate-50 dark:bg-slate-800/60" : "bg-white dark:bg-slate-900"}`}>
                            <div className="flex items-center gap-2">
                              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                              <span className="font-medium whitespace-nowrap">{team}</span>
                            </div>
                          </td>
                          {allTasks.map(task => (
                            <td key={task} className="px-3 py-2 text-center">
                              {t.tasks[task] ? <span className="font-semibold text-blue-700 dark:text-blue-400">{t.tasks[task]}</span> : <span className="text-muted-foreground/40">-</span>}
                            </td>
                          ))}
                          {STATUSES.map(s => (
                            <td key={s} className="px-3 py-2 text-center">
                              {t.statusMap[s] ? (
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold border ${STATUS_STYLES[s] ?? "bg-gray-100 text-gray-600 border-gray-200"}`}>
                                  {t.statusMap[s]}
                                </span>
                              ) : <span className="text-muted-foreground/40">-</span>}
                            </td>
                          ))}
                          <td className="px-3 py-2 text-center font-bold text-foreground">{t.total}</td>
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-100 dark:bg-slate-800/40 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                      <td className="px-4 py-2.5 sticky left-0 bg-slate-100 dark:bg-slate-800/40 z-10">합계</td>
                      {allTasks.map(task => (
                        <td key={task} className="px-3 py-2.5 text-center">{summaryTeams.reduce((s, tm) => s + (teamSummary[tm].tasks[task] || 0), 0)}</td>
                      ))}
                      {STATUSES.map(s => (
                        <td key={s} className="px-3 py-2.5 text-center">{summaryTeams.reduce((s2, tm) => s2 + (teamSummary[tm].statusMap[s] || 0), 0)}</td>
                      ))}
                      <td className="px-3 py-2.5 text-center">{totalCount}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* ── 부서별 등록건수 (좌우 탭 패널) ── */}
          {(() => {
            const activeGrp = teamGroups.find(g => g.team === selectedTeam) ?? teamGroups[0] ?? null;
            const activeTeam = activeGrp?.team ?? null;
            return (
              <Card className="border shadow-sm">
                <CardHeader className="pb-2 pt-4 px-5">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <span className="w-6 h-6 rounded-md bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <Users className="h-3.5 w-3.5 text-purple-500" />
                    </span>
                    부서별 등록건수
                    <span className="text-xs font-normal text-muted-foreground ml-1">개인별 담당업무 분야</span>
                    <span className="ml-auto text-xs font-normal text-muted-foreground">{totalCount}건 / {personList.length}명</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0">
                  <div className="flex border-t border-border/40" style={{ minHeight: 260 }}>
                    {/* 왼쪽: 팀 목록 탭 */}
                    <div className="w-44 shrink-0 border-r border-border/40 overflow-y-auto" style={{ maxHeight: 420 }}>
                      {teamGroups.map(grp => {
                        const color = getTeamColor(grp.team);
                        const teamTotal = grp.members.reduce((s, p) => s + p.total, 0);
                        const isActive = grp.team === activeTeam;
                        return (
                          <button
                            key={grp.team}
                            onClick={() => setSelectedTeam(grp.team)}
                            className={`w-full flex items-center gap-2 px-3 py-2.5 text-left transition-colors border-b border-border/20 ${isActive ? "bg-purple-50 dark:bg-purple-950/20 border-r-2 border-r-purple-400" : "hover:bg-muted/30"}`}
                            data-testid={`btn-select-team-${grp.team}`}
                          >
                            <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium truncate ${isActive ? "text-purple-700 dark:text-purple-300" : ""}`}>{grp.team}</p>
                              <p className="text-[10px] text-muted-foreground">{grp.members.length}명 · {teamTotal}건</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    {/* 오른쪽: 선택된 팀 인원 테이블 */}
                    <div className="flex-1 overflow-auto" style={{ maxHeight: 420 }}>
                      {activeGrp ? (() => {
                        const color = getTeamColor(activeGrp.team);
                        const teamTotal = activeGrp.members.reduce((s, p) => s + p.total, 0);
                        return (
                          <table className="w-full text-xs border-collapse" style={{ minWidth: Math.max(320, 110 + allTasks.length * 90 + 60) }}>
                            <thead className="sticky top-0 z-10">
                              <tr className="bg-purple-50 dark:bg-purple-950/20">
                                <th className="px-4 py-2.5 text-left font-semibold border-b border-purple-200 dark:border-purple-800 whitespace-nowrap">이름</th>
                                {allTasks.map(t => (
                                  <th key={t} className="px-3 py-2.5 text-center font-semibold border-b border-purple-200 dark:border-purple-800 whitespace-nowrap text-blue-700 dark:text-blue-400">{t}</th>
                                ))}
                                <th className="px-3 py-2.5 text-center font-bold border-b border-purple-200 dark:border-purple-800 whitespace-nowrap">합계</th>
                              </tr>
                            </thead>
                            <tbody>
                              {activeGrp.members.map((p, i) => (
                                <tr key={p.name} className={`border-b border-border/20 ${i % 2 === 1 ? "bg-slate-50/60 dark:bg-slate-800/20" : ""} hover:bg-purple-50/40 dark:hover:bg-purple-950/10 transition-colors`}>
                                  <td className="px-4 py-2 font-medium whitespace-nowrap">{p.name}</td>
                                  {allTasks.map(task => (
                                    <td key={task} className="px-3 py-2 text-center">
                                      {p.tasks[task] ? (
                                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold text-white" style={{ background: color }}>
                                          {p.tasks[task]}
                                        </span>
                                      ) : <span className="text-muted-foreground/25">-</span>}
                                    </td>
                                  ))}
                                  <td className="px-3 py-2 text-center font-bold">{p.total}</td>
                                </tr>
                              ))}
                              <tr className="bg-muted/40 font-semibold sticky bottom-0">
                                <td className="px-4 py-2 text-[11px] text-muted-foreground">소계</td>
                                {allTasks.map(task => (
                                  <td key={task} className="px-3 py-2 text-center text-[11px]">
                                    {activeGrp.members.reduce((s, p) => s + (p.tasks[task] || 0), 0) || "-"}
                                  </td>
                                ))}
                                <td className="px-3 py-2 text-center text-[11px] font-bold">{teamTotal}</td>
                              </tr>
                            </tbody>
                          </table>
                        );
                      })() : (
                        <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                          왼쪽에서 팀을 선택하세요
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })()}
        </>
      )}
    </div>
  );
}
