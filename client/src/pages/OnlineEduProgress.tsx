import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Upload, Trash2, ChevronDown, Search, CheckCircle2, XCircle, Clock, AlertCircle, BarChart3, List } from "lucide-react";
import type { OnlineEduUpload, OnlineEduRecord } from "@shared/schema";

type FilterType = "전체" | "수료" | "미수료" | "미처리";
type ViewType = "list" | "dept";

function getStatusInfo(status: string | null) {
  const s = (status || "").trim();
  if (s === "수료") return { label: "수료", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
  if (s === "미수료") return { label: "미수료", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="w-3.5 h-3.5" /> };
  if (s === "미처리") return { label: "미처리", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock className="w-3.5 h-3.5" /> };
  return { label: s || "알수없음", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <AlertCircle className="w-3.5 h-3.5" /> };
}

function ProgressBar({ value, thin }: { value: number; thin?: boolean }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className={`flex-1 ${thin ? "h-1.5" : "h-2"} bg-gray-100 rounded-full overflow-hidden`}>
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`${thin ? "text-[11px]" : "text-xs"} font-medium w-10 text-right tabular-nums`}>{pct.toFixed(1)}%</span>
    </div>
  );
}

interface DeptStat {
  dept: string;
  total: number;
  completed: number;
  pending: number;
  incomplete: number;
  rate: number;
}

function buildDeptStats(records: OnlineEduRecord[]): DeptStat[] {
  const map = new Map<string, DeptStat>();
  for (const r of records) {
    const dept = r.department || "소속미상";
    if (!map.has(dept)) map.set(dept, { dept, total: 0, completed: 0, pending: 0, incomplete: 0, rate: 0 });
    const s = map.get(dept)!;
    s.total++;
    const status = (r.completionStatus || "").trim();
    if (status === "수료") s.completed++;
    else if (status === "미수료") s.incomplete++;
    else s.pending++;
  }
  return Array.from(map.values())
    .map(s => ({ ...s, rate: s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0 }))
    .sort((a, b) => a.rate - b.rate);
}

export default function OnlineEduProgress() {
  const { headquarters } = useHeadquarters();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterType>("전체");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("전체");
  const [view, setView] = useState<ViewType>("list");

  const { data: uploads = [], isLoading: uploadsLoading } = useQuery<OnlineEduUpload[]>({
    queryKey: ["/api/online-edu/uploads", headquarters],
    queryFn: () => fetch(`/api/online-edu/uploads?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
  });

  const { data: records = [], isLoading: recordsLoading } = useQuery<OnlineEduRecord[]>({
    queryKey: ["/api/online-edu/records", selectedId],
    enabled: selectedId !== null,
    queryFn: async () => {
      const res = await fetch(`/api/online-edu/records/${selectedId}`, { credentials: "include" });
      if (!res.ok) throw new Error("조회 실패");
      return res.json();
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/online-edu/upload", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const text = await res.text();
      let data: any = {};
      try { data = JSON.parse(text); } catch {
        throw new Error(`서버 응답 오류 (${res.status}): ${text.substring(0, 120)}`);
      }
      if (!res.ok) throw new Error(data.message || `업로드 실패 (HTTP ${res.status})`);
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-edu/uploads"] });
      if (data?.upload?.id) setSelectedId(data.upload.id);
      toast({ title: `업로드 완료 (${data?.count ?? 0}명)` });
    },
    onError: (e: any) => toast({ title: "업로드 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/online-edu/uploads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-edu/uploads"] });
      setSelectedId(null);
      toast({ title: "삭제되었습니다" });
    },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadMutation.mutate(f);
    e.target.value = "";
  };

  const selectedUpload = uploads.find(u => u.id === selectedId);
  const departments = ["전체", ...Array.from(new Set(records.map(r => r.department || "").filter(Boolean))).sort()];
  const deptStats = buildDeptStats(records);

  const filtered = records.filter(r => {
    const s = (r.completionStatus || "").trim();
    if (filter !== "전체" && s !== filter) return false;
    if (deptFilter !== "전체" && r.department !== deptFilter) return false;
    if (search) {
      const q = search.toLowerCase();
      return (r.name || "").toLowerCase().includes(q) || (r.department || "").toLowerCase().includes(q);
    }
    return true;
  });

  const total = records.length;
  const completed = records.filter(r => r.completionStatus?.trim() === "수료").length;
  const incomplete = records.filter(r => r.completionStatus?.trim() === "미수료").length;
  const pending = records.filter(r => r.completionStatus?.trim() === "미처리").length;
  const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

  const filterTabs: { key: FilterType; label: string; count: number; activeCls: string }[] = [
    { key: "전체", label: "전체", count: total, activeCls: "bg-gray-700 text-white" },
    { key: "수료", label: "수료", count: completed, activeCls: "bg-green-600 text-white" },
    { key: "미처리", label: "미처리", count: pending, activeCls: "bg-yellow-500 text-white" },
    { key: "미수료", label: "미수료", count: incomplete, activeCls: "bg-red-600 text-white" },
  ];

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">온라인 교육 개인별 진도율 현황</h2>
          <p className="text-xs text-gray-500 mt-0.5">XLS/XLSX 파일 업로드 → 수료 여부·진도율 확인</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFile} data-testid="input-online-edu-file" />
          <Button size="sm" onClick={() => fileRef.current?.click()} disabled={uploadMutation.isPending} data-testid="button-online-edu-upload">
            <Upload className="w-3.5 h-3.5 mr-1.5" />
            {uploadMutation.isPending ? "업로드 중..." : "엑셀 업로드"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* 업로드 이력 사이드바 */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 bg-gray-50">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wide">업로드 이력</span>
            </div>
            {uploadsLoading ? (
              <div className="p-4 text-xs text-gray-400 text-center">불러오는 중...</div>
            ) : uploads.length === 0 ? (
              <div className="p-6 text-xs text-gray-400 text-center">
                <Upload className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                업로드된 파일이 없습니다
              </div>
            ) : (
              <div className="divide-y divide-gray-100 max-h-[420px] overflow-y-auto">
                {uploads.map(u => (
                  <div
                    key={u.id}
                    onClick={() => { setSelectedId(u.id); setFilter("전체"); setDeptFilter("전체"); setSearch(""); }}
                    className={`px-3 py-2.5 cursor-pointer hover:bg-blue-50 transition-colors group ${selectedId === u.id ? "bg-blue-50 border-l-2 border-blue-500" : ""}`}
                    data-testid={`item-upload-${u.id}`}
                  >
                    <div className="flex items-start justify-between gap-1">
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium text-gray-800 truncate">{u.courseName || u.fileName}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{u.learningPeriod || "-"}</div>
                        <div className="text-[11px] text-gray-500 mt-1">
                          <span className="text-green-600 font-medium">{u.completedCount}명 수료</span>
                          <span className="text-gray-400"> / 총 {u.totalCount}명</span>
                        </div>
                      </div>
                      <button
                        onClick={e => { e.stopPropagation(); if (confirm("삭제하시겠습니까?")) deleteMutation.mutate(u.id); }}
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-red-500 p-0.5 mt-0.5 flex-shrink-0"
                        data-testid={`button-delete-${u.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 메인 콘텐츠 */}
        <div className="lg:col-span-3 space-y-4">
          {!selectedId ? (
            <div className="bg-white border border-gray-200 rounded-lg p-12 text-center">
              <Upload className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-500">왼쪽에서 업로드 이력을 선택하거나</p>
              <p className="text-sm text-gray-500">엑셀 파일을 업로드해 주세요</p>
            </div>
          ) : (
            <>
              {/* 요약 카드 */}
              {selectedUpload && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">{selectedUpload.courseName || "과정명 없음"}</div>
                      <div className="text-xs text-gray-400">{selectedUpload.learningPeriod}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-blue-600">{completionRate}%</div>
                      <div className="text-xs text-gray-400">전체 수료율</div>
                    </div>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
                    <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: `${completionRate}%` }} />
                  </div>
                  <div className="grid grid-cols-4 gap-3">
                    {[
                      { label: "전체", value: total, color: "text-gray-700", bg: "bg-gray-50" },
                      { label: "수료", value: completed, color: "text-green-700", bg: "bg-green-50" },
                      { label: "미처리", value: pending, color: "text-yellow-700", bg: "bg-yellow-50" },
                      { label: "미수료", value: incomplete, color: "text-red-700", bg: "bg-red-50" },
                    ].map(item => (
                      <div key={item.label} className={`${item.bg} rounded-lg p-3 text-center`}>
                        <div className={`text-xl font-bold ${item.color}`}>{item.value}</div>
                        <div className="text-xs text-gray-500 mt-0.5">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 뷰 전환 + 필터 */}
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-2">
                  {/* 뷰 전환 버튼 */}
                  <div className="flex items-center bg-gray-100 rounded-md p-0.5 gap-0.5">
                    <button
                      onClick={() => setView("list")}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${view === "list" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      data-testid="view-list"
                    >
                      <List className="w-3 h-3" /> 개인별
                    </button>
                    <button
                      onClick={() => setView("dept")}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${view === "dept" ? "bg-white text-gray-800 shadow-sm" : "text-gray-500 hover:text-gray-700"}`}
                      data-testid="view-dept"
                    >
                      <BarChart3 className="w-3 h-3" /> 부서별
                    </button>
                  </div>

                  {view === "list" && (
                    <>
                      <div className="flex items-center gap-1">
                        {filterTabs.map(tab => (
                          <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${filter === tab.key ? tab.activeCls : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}
                            data-testid={`filter-${tab.key}`}
                          >
                            {tab.label} <span className="ml-1 opacity-75">{tab.count}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 ml-auto">
                        {departments.length > 1 && (
                          <div className="relative">
                            <select
                              value={deptFilter}
                              onChange={e => setDeptFilter(e.target.value)}
                              className="appearance-none text-xs border border-gray-200 rounded-md pl-2.5 pr-7 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                              data-testid="select-dept"
                            >
                              {departments.map(d => <option key={d}>{d}</option>)}
                            </select>
                            <ChevronDown className="w-3 h-3 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                          </div>
                        )}
                        <div className="relative">
                          <Search className="w-3 h-3 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                          <Input
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="이름·소속 검색"
                            className="pl-7 h-7 text-xs w-36"
                            data-testid="input-search"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* 콘텐츠 */}
              {recordsLoading ? (
                <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">불러오는 중...</div>
              ) : view === "dept" ? (
                /* 부서별 현황 */
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 w-6">#</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600">소속</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-gray-600">전체</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-green-600">수료</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-yellow-600">미처리</th>
                          <th className="text-right px-4 py-2.5 font-semibold text-red-600">미수료</th>
                          <th className="text-left px-4 py-2.5 font-semibold text-gray-600 min-w-[200px]">수료율</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {deptStats.map((s, idx) => (
                          <tr
                            key={s.dept}
                            className="hover:bg-gray-50 transition-colors cursor-pointer"
                            onClick={() => { setView("list"); setDeptFilter(s.dept); setFilter("전체"); }}
                            data-testid={`row-dept-${idx}`}
                          >
                            <td className="px-4 py-2.5 text-gray-400">{idx + 1}</td>
                            <td className="px-4 py-2.5 font-medium text-gray-800">{s.dept}</td>
                            <td className="px-4 py-2.5 text-right text-gray-700">{s.total}</td>
                            <td className="px-4 py-2.5 text-right text-green-700 font-medium">{s.completed}</td>
                            <td className="px-4 py-2.5 text-right text-yellow-700">{s.pending}</td>
                            <td className="px-4 py-2.5 text-right text-red-700">{s.incomplete}</td>
                            <td className="px-4 py-2.5">
                              <ProgressBar value={s.rate} thin />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-50 border-t-2 border-gray-200">
                          <td className="px-4 py-2.5" colSpan={2}>
                            <span className="text-xs font-semibold text-gray-600">합계</span>
                          </td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-gray-700">{total}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-green-700">{completed}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-yellow-700">{pending}</td>
                          <td className="px-4 py-2.5 text-right text-xs font-bold text-red-700">{incomplete}</td>
                          <td className="px-4 py-2.5">
                            <ProgressBar value={completionRate} thin />
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                    <div className="px-4 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400">
                      * 행을 클릭하면 해당 소속의 개인별 목록으로 이동합니다
                    </div>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">조건에 맞는 데이터가 없습니다</div>
              ) : (
                /* 개인별 목록 */
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600 w-6">#</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600">성명</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600">소속</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600 min-w-[140px]">진도율</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600">수료여부</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600">학습시간</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600">취득점수</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600">미이수사유</th>
                          <th className="text-left px-3 py-2.5 font-semibold text-gray-600">수료일자</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {filtered.map((r, idx) => {
                          const statusInfo = getStatusInfo(r.completionStatus);
                          const pct = parseFloat(r.progressRate || "0") || 0;
                          const isRed = r.completionStatus?.trim() === "미수료";
                          return (
                            <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${isRed ? "bg-red-50/30" : ""}`} data-testid={`row-record-${r.id}`}>
                              <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                              <td className="px-3 py-2 font-medium text-gray-800">{r.name}</td>
                              <td className="px-3 py-2 text-gray-600">{r.department || "-"}</td>
                              <td className="px-3 py-2"><ProgressBar value={pct} /></td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusInfo.color}`}>
                                  {statusInfo.icon}{statusInfo.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600">{r.learningHours ? `${r.learningHours}시간` : "-"}</td>
                              <td className="px-3 py-2 text-gray-600">{r.score || "-"}</td>
                              <td className="px-3 py-2 text-gray-500">
                                {r.incompleteReason && r.incompleteReason !== "-" ? <span className="text-red-600">{r.incompleteReason}</span> : "-"}
                              </td>
                              <td className="px-3 py-2 text-gray-500">{r.completionDate || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-right">
                      {filtered.length}명 표시 중 (전체 {total}명)
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
