import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Upload, Trash2, FileSpreadsheet, TrendingUp, Users, Building2,
  CheckCircle2, Clock, AlertCircle, ChevronDown, ChevronUp, BarChart3,
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

function getRiskGrade(score: number | null) {
  if (!score) return { grade: "C", color: "bg-blue-100 text-blue-700", label: "C등급" };
  if (score >= 8) return { grade: "A", color: "bg-red-100 text-red-700", label: "A등급(중점관리)" };
  if (score >= 3) return { grade: "B", color: "bg-orange-100 text-orange-700", label: "B등급(일상관리)" };
  return { grade: "C", color: "bg-blue-100 text-blue-700", label: "C등급(허용가능)" };
}

export default function RiskAssessmentResults() {
  const { toast } = useToast();
  const { canEditRiskAssessment } = usePermissions();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState("");
  const [uploading, setUploading] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showPersonTable, setShowPersonTable] = useState(false);
  const [showDetailTable, setShowDetailTable] = useState(false);

  const { data: uploads = [], isLoading } = useQuery<UploadRecord[]>({
    queryKey: ["/api/risk-assessment-results"],
    queryFn: () => fetch("/api/risk-assessment-results", { credentials: "include" }).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => fetch(`/api/risk-assessment-results/${id}`, { method: "DELETE", credentials: "include" }).then(r => { if (!r.ok) throw new Error("삭제 실패"); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessment-results"] });
      if (selectedId !== null) setSelectedId(null);
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
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "업로드 실패");
      }
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/risk-assessment-results"] });
      setSelectedId(data.id);
      setLabel("");
      toast({ title: "업로드 완료", description: `${data.totalRows}건 등록됨` });
    } catch (e: any) {
      toast({ variant: "destructive", title: "업로드 실패", description: e.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const selected = uploads.find(u => u.id === selectedId) ?? uploads[0] ?? null;
  const rows: ResultRow[] = (selected?.rows as ResultRow[]) ?? [];

  // ── 통계 계산 ──
  const totalCount = rows.length;

  // 부서별 등록건수
  const teamCount: Record<string, number> = {};
  for (const r of rows) {
    const t = r.team || "기타";
    teamCount[t] = (teamCount[t] || 0) + 1;
  }
  const teamData = Object.entries(teamCount)
    .map(([team, count]) => ({ team, short: team.replace("운용팀", "").replace("팀", ""), count }))
    .sort((a, b) => b.count - a.count);

  // 인원별 등록건수
  const personKey: Record<string, { team: string; name: string; count: number }> = {};
  for (const r of rows) {
    const key = `${r.team}__${r.registrant}`;
    if (!personKey[key]) personKey[key] = { team: r.team, name: r.registrant, count: 0 };
    personKey[key].count++;
  }
  const personData = Object.values(personKey).sort((a, b) => {
    if (a.team !== b.team) return a.team.localeCompare(b.team);
    return b.count - a.count;
  });

  // 상태별 건수
  const statusCount: Record<string, number> = {};
  for (const r of rows) {
    const s = r.status || "미확인";
    statusCount[s] = (statusCount[s] || 0) + 1;
  }

  // 위험성 등급별 건수
  const gradeCount = { A: 0, B: 0, C: 0 };
  for (const r of rows) {
    const g = getRiskGrade(r.riskScore).grade as "A" | "B" | "C";
    gradeCount[g]++;
  }

  // 담당업무별 건수
  const taskCount: Record<string, number> = {};
  for (const r of rows) {
    const t = r.responsibleTask || "미분류";
    taskCount[t] = (taskCount[t] || 0) + 1;
  }
  const taskData = Object.entries(taskCount).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      {/* 업로드 영역 */}
      {canEditRiskAssessment && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <FileSpreadsheet className="h-5 w-5 text-orange-500 shrink-0" />
              <span className="text-sm font-medium">엑셀 업로드</span>
              <Input
                placeholder="평가명 (선택사항, 예: 2026년 상반기)"
                className="h-8 text-sm w-52"
                value={label}
                onChange={e => setLabel(e.target.value)}
                data-testid="input-result-label"
              />
              <Button
                size="sm"
                className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white h-8"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
                data-testid="btn-upload-result"
              >
                <Upload className="h-3.5 w-3.5" />
                {uploading ? "업로드 중..." : "엑셀 파일 선택"}
              </Button>
              <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleUpload} data-testid="input-result-file" />
              <span className="text-xs text-muted-foreground">첫 번째 시트의 데이터를 자동 분석합니다</span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 업로드 목록 선택 */}
      {uploads.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          {uploads.map(u => (
            <button
              key={u.id}
              onClick={() => setSelectedId(u.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-medium transition-colors ${(selected?.id === u.id) ? "border-orange-500 bg-orange-50 text-orange-700" : "border-border text-muted-foreground hover:border-orange-300"}`}
              data-testid={`btn-select-upload-${u.id}`}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {u.label}
              <span className="text-xs opacity-70">({u.totalRows}건)</span>
              {canEditRiskAssessment && (
                <span
                  className="ml-0.5 text-muted-foreground hover:text-red-500"
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

      {isLoading && <div className="text-center py-10 text-muted-foreground text-sm">불러오는 중...</div>}

      {!isLoading && uploads.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <FileSpreadsheet className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p className="text-sm">엑셀 파일을 업로드하면 대시보드가 생성됩니다</p>
        </div>
      )}

      {selected && rows.length > 0 && (
        <>
          {/* 업로드 정보 */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{selected.label}</span>
            <span>·</span>
            <span>{format(new Date(selected.createdAt), "yyyy.MM.dd HH:mm", { locale: ko })} 업로드</span>
            {selected.uploadedBy && <><span>·</span><span>{selected.uploadedBy}</span></>}
          </div>

          {/* 요약 카드 4개 */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="border-orange-200">
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <BarChart3 className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground">총 등록건수</span>
                </div>
                <p className="text-2xl font-bold text-orange-600">{totalCount.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{teamData.length}개 팀</p>
              </CardContent>
            </Card>

            <Card className={gradeCount.A > 0 ? "border-red-200" : ""}>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="h-4 w-4 text-red-500" />
                  <span className="text-xs text-muted-foreground">A등급 (중점관리)</span>
                </div>
                <p className="text-2xl font-bold text-red-600">{gradeCount.A}</p>
                <p className="text-xs text-muted-foreground mt-0.5">위험성추정 8점 이상</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground">승인완료</span>
                </div>
                <p className="text-2xl font-bold text-green-600">{statusCount["승인완료"] || 0}</p>
                <p className="text-xs text-muted-foreground mt-0.5">전체의 {totalCount ? Math.round(((statusCount["승인완료"] || 0) / totalCount) * 100) : 0}%</p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-4 pb-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground">등록 인원</span>
                </div>
                <p className="text-2xl font-bold text-blue-600">{personData.length}</p>
                <p className="text-xs text-muted-foreground mt-0.5">명 참여</p>
              </CardContent>
            </Card>
          </div>

          {/* 부서별 등록건수 차트 */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-4 w-4 text-orange-500" />
                팀별 등록건수
              </CardTitle>
            </CardHeader>
            <CardContent className="px-2 pb-4">
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={teamData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="short" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <Tooltip formatter={(v) => [`${v}건`, "등록건수"]} labelFormatter={(l) => teamData.find(d => d.short === l)?.team || l} />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {teamData.map((entry, i) => (
                      <Cell key={i} fill={TEAM_COLORS[entry.team] ?? "#94a3b8"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 위험성 등급 + 담당업무별 분포 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-orange-500" />
                  위험성 등급 분포
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {([
                  { grade: "A", label: "A등급 (중점관리)", count: gradeCount.A, color: "bg-red-500", text: "text-red-700", bg: "bg-red-50" },
                  { grade: "B", label: "B등급 (일상관리)", count: gradeCount.B, color: "bg-orange-400", text: "text-orange-700", bg: "bg-orange-50" },
                  { grade: "C", label: "C등급 (허용가능)", count: gradeCount.C, color: "bg-blue-400", text: "text-blue-700", bg: "bg-blue-50" },
                ] as const).map(({ grade, label, count, color, text, bg }) => (
                  <div key={grade} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${bg}`}>
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${text}`}>{grade}</span>
                    <div className="flex-1">
                      <div className="flex justify-between text-xs mb-1">
                        <span className={text}>{label}</span>
                        <span className="font-semibold">{count}건</span>
                      </div>
                      <div className="h-1.5 bg-white rounded-full overflow-hidden">
                        <div className={`h-full ${color} rounded-full`} style={{ width: totalCount ? `${(count / totalCount) * 100}%` : "0%" }} />
                      </div>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-blue-500" />
                  담당업무별 건수
                </CardTitle>
              </CardHeader>
              <CardContent className="px-4 pb-4 space-y-2">
                {taskData.slice(0, 6).map(([task, count]) => (
                  <div key={task} className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground w-28 shrink-0 truncate">{task}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-orange-400 rounded-full" style={{ width: totalCount ? `${(count / totalCount) * 100}%` : "0%" }} />
                    </div>
                    <span className="text-xs font-semibold w-8 text-right">{count}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* 인원별 등록건수 테이블 (접기/펼치기) */}
          <Card>
            <CardHeader
              className="pb-2 pt-3 px-4 cursor-pointer select-none"
              onClick={() => setShowPersonTable(v => !v)}
            >
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-500" />
                인원별 등록건수
                <span className="text-xs font-normal text-muted-foreground ml-1">({personData.length}명)</span>
                <span className="ml-auto">{showPersonTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
              </CardTitle>
            </CardHeader>
            {showPersonTable && (
              <CardContent className="px-0 pb-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="px-4 py-2 text-left font-semibold border-b">팀</th>
                        <th className="px-4 py-2 text-left font-semibold border-b">이름</th>
                        <th className="px-4 py-2 text-center font-semibold border-b">등록건수</th>
                      </tr>
                    </thead>
                    <tbody>
                      {personData.map((p, i) => (
                        <tr key={i} className="hover:bg-muted/30 border-b border-border/40">
                          <td className="px-4 py-1.5">
                            <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: TEAM_COLORS[p.team] ? TEAM_COLORS[p.team] + "20" : "#f0f0f0", color: TEAM_COLORS[p.team] ?? "#666" }}>
                              {p.team}
                            </span>
                          </td>
                          <td className="px-4 py-1.5 font-medium">{p.name}</td>
                          <td className="px-4 py-1.5 text-center">
                            <span className="font-bold">{p.count}</span>
                            <span className="text-muted-foreground ml-0.5">건</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-muted/40 font-semibold">
                        <td className="px-4 py-2" colSpan={2}>합계</td>
                        <td className="px-4 py-2 text-center">{totalCount}건</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>

          {/* 상세 데이터 테이블 (접기/펼치기) */}
          <Card>
            <CardHeader
              className="pb-2 pt-3 px-4 cursor-pointer select-none"
              onClick={() => setShowDetailTable(v => !v)}
            >
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-green-500" />
                전체 데이터 목록
                <span className="text-xs font-normal text-muted-foreground ml-1">({totalCount}건)</span>
                <span className="ml-auto">{showDetailTable ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</span>
              </CardTitle>
            </CardHeader>
            {showDetailTable && (
              <CardContent className="px-0 pb-3">
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] border-collapse" style={{ minWidth: 900 }}>
                    <thead>
                      <tr className="bg-muted/40">
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">No</th>
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">구분</th>
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">팀</th>
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">등록자</th>
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">등록일</th>
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">상태</th>
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">담당업무</th>
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">공정명</th>
                        <th className="px-3 py-2 text-left font-semibold border-b whitespace-nowrap">유해위험요인</th>
                        <th className="px-3 py-2 text-center font-semibold border-b whitespace-nowrap">가능성</th>
                        <th className="px-3 py-2 text-center font-semibold border-b whitespace-nowrap">중대성</th>
                        <th className="px-3 py-2 text-center font-semibold border-b whitespace-nowrap">위험성</th>
                        <th className="px-3 py-2 text-center font-semibold border-b whitespace-nowrap">등급</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const grade = getRiskGrade(r.riskScore);
                        return (
                          <tr key={i} className="hover:bg-muted/30 border-b border-border/40">
                            <td className="px-3 py-1.5 text-muted-foreground">{r.no ?? i + 1}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.category}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: TEAM_COLORS[r.team] ? TEAM_COLORS[r.team] + "20" : "#f0f0f0", color: TEAM_COLORS[r.team] ?? "#666" }}>
                                {r.team}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.registrant}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap text-muted-foreground">{r.registeredAt?.slice(0, 10)}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${r.status === "승인완료" ? "bg-green-100 text-green-700" : r.status === "승인대기" ? "bg-yellow-100 text-yellow-700" : "bg-muted text-muted-foreground"}`}>
                                {r.status || "-"}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.responsibleTask}</td>
                            <td className="px-3 py-1.5 whitespace-nowrap">{r.process}</td>
                            <td className="px-3 py-1.5 max-w-[120px] truncate" title={r.hazardType}>{r.hazardType}</td>
                            <td className="px-3 py-1.5 text-center">{r.frequency ?? "-"}</td>
                            <td className="px-3 py-1.5 text-center">{r.severity ?? "-"}</td>
                            <td className="px-3 py-1.5 text-center font-semibold">{r.riskScore ?? "-"}</td>
                            <td className="px-3 py-1.5 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${grade.color}`}>{grade.grade}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
