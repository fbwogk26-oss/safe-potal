import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Upload, Trash2, ChevronDown, Search, CheckCircle2, XCircle, Clock, AlertCircle } from "lucide-react";
import type { OnlineEduUpload, OnlineEduRecord } from "@shared/schema";

type FilterType = "전체" | "수료" | "미수료" | "미처리";

function getStatusInfo(status: string | null) {
  const s = (status || "").trim();
  if (s === "수료") return { label: "수료", color: "bg-green-100 text-green-700 border-green-200", icon: <CheckCircle2 className="w-3.5 h-3.5" /> };
  if (s === "미수료") return { label: "미수료", color: "bg-red-100 text-red-700 border-red-200", icon: <XCircle className="w-3.5 h-3.5" /> };
  if (s === "미처리") return { label: "미처리", color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: <Clock className="w-3.5 h-3.5" /> };
  return { label: s || "알수없음", color: "bg-gray-100 text-gray-600 border-gray-200", icon: <AlertCircle className="w-3.5 h-3.5" /> };
}

function ProgressBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 100 ? "bg-green-500" : pct >= 50 ? "bg-blue-500" : "bg-red-400";
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-medium w-10 text-right tabular-nums">{pct.toFixed(1)}%</span>
    </div>
  );
}

export default function OnlineEduProgress() {
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filter, setFilter] = useState<FilterType>("전체");
  const [search, setSearch] = useState("");
  const [deptFilter, setDeptFilter] = useState("전체");

  const { data: uploads = [], isLoading: uploadsLoading } = useQuery<OnlineEduUpload[]>({
    queryKey: ["/api/online-edu/uploads"],
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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "업로드 실패");
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/online-edu/uploads"] });
      setSelectedId(data.upload.id);
      toast({ title: `업로드 완료 (${data.count}명)` });
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

  const filterTabs: { key: FilterType; label: string; count: number; color: string }[] = [
    { key: "전체", label: "전체", count: total, color: "bg-gray-100 text-gray-700 data-[active=true]:bg-gray-700 data-[active=true]:text-white" },
    { key: "수료", label: "수료", count: completed, color: "bg-green-50 text-green-700 data-[active=true]:bg-green-600 data-[active=true]:text-white" },
    { key: "미처리", label: "미처리", count: pending, color: "bg-yellow-50 text-yellow-700 data-[active=true]:bg-yellow-500 data-[active=true]:text-white" },
    { key: "미수료", label: "미수료", count: incomplete, color: "bg-red-50 text-red-700 data-[active=true]:bg-red-600 data-[active=true]:text-white" },
  ];

  return (
    <div className="space-y-5">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-gray-900">온라인 교육 개인별 진도율 현황</h2>
          <p className="text-xs text-gray-500 mt-0.5">XLS/XLSX 파일을 업로드하면 수료 여부와 진도율을 확인할 수 있습니다</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".xls,.xlsx" className="hidden" onChange={handleFile} data-testid="input-online-edu-file" />
          <Button
            size="sm"
            onClick={() => fileRef.current?.click()}
            disabled={uploadMutation.isPending}
            data-testid="button-online-edu-upload"
          >
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
                    onClick={() => setSelectedId(u.id)}
                    className={`px-3 py-2.5 cursor-pointer hover:bg-blue-50 transition-colors group ${selectedId === u.id ? "bg-blue-50 border-l-2 border-blue-500" : ""}`}
                    data-testid={`item-online-edu-upload-${u.id}`}
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
                        data-testid={`button-delete-upload-${u.id}`}
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
                      <div className="text-xs text-gray-400">수료율</div>
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

              {/* 필터 바 */}
              <div className="bg-white border border-gray-200 rounded-lg p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1">
                    {filterTabs.map(tab => (
                      <button
                        key={tab.key}
                        data-active={filter === tab.key}
                        onClick={() => setFilter(tab.key)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab.color}`}
                        data-testid={`filter-${tab.key}`}
                      >
                        {tab.label} <span className="ml-1 opacity-70">{tab.count}</span>
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
                          data-testid="select-dept-filter"
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
                </div>
              </div>

              {/* 데이터 테이블 */}
              <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                {recordsLoading ? (
                  <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
                ) : filtered.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">조건에 맞는 데이터가 없습니다</div>
                ) : (
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
                          const isIncomplete = r.completionStatus?.trim() !== "수료";
                          return (
                            <tr
                              key={r.id}
                              className={`hover:bg-gray-50 transition-colors ${isIncomplete && r.completionStatus?.trim() === "미수료" ? "bg-red-50/30" : ""}`}
                              data-testid={`row-edu-record-${r.id}`}
                            >
                              <td className="px-3 py-2 text-gray-400">{idx + 1}</td>
                              <td className="px-3 py-2">
                                <span className={`font-medium ${isIncomplete ? "text-gray-800" : "text-gray-600"}`}>{r.name}</span>
                              </td>
                              <td className="px-3 py-2 text-gray-600">{r.department || "-"}</td>
                              <td className="px-3 py-2">
                                <ProgressBar value={pct} />
                              </td>
                              <td className="px-3 py-2">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-medium ${statusInfo.color}`}>
                                  {statusInfo.icon}
                                  {statusInfo.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-gray-600">{r.learningHours ? `${r.learningHours}시간` : "-"}</td>
                              <td className="px-3 py-2 text-gray-600">{r.score || "-"}</td>
                              <td className="px-3 py-2 text-gray-500">
                                {r.incompleteReason && r.incompleteReason !== "-" ? (
                                  <span className="text-red-600">{r.incompleteReason}</span>
                                ) : "-"}
                              </td>
                              <td className="px-3 py-2 text-gray-500">{r.completionDate || "-"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="px-3 py-2 border-t border-gray-100 bg-gray-50 text-xs text-gray-400 text-right">
                      총 {filtered.length}명 표시 중 (전체 {total}명)
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
