import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Download, Upload, Save, PackageCheck,
  Pencil, X, Check, Copy, ChevronRight, FileSpreadsheet,
} from "lucide-react";

type Survey = { id: number; year: number; half: number; title: string; createdBy: string | null; createdAt: string };
type Item = { id: number; surveyId: number; itemName: string; unitPrice: number; supplyStandard: string; sortOrder: number };
type DeptEntry = { id: number; surveyId: number; deptName: string; deptCount: number; quantities: Record<string, number>; sortOrder: number };

const CURRENT_YEAR = new Date().getFullYear();
const fmt = (n: number) => n.toLocaleString("ko-KR");

type CreateMode = "new" | "copy";

export default function SafetySupplySurvey() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // ── 다이얼로그 상태 ──────────────────────────────────
  const [showDialog, setShowDialog] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("new");
  const [copySrcId, setCopySrcId] = useState<number | null>(null);
  const [dlgYear, setDlgYear] = useState(String(CURRENT_YEAR));
  const [dlgHalf, setDlgHalf] = useState("1");
  const [dlgTitle, setDlgTitle] = useState("");

  // ── 물품 편집 상태 ───────────────────────────────────
  const [editingItems, setEditingItems] = useState(false);
  const [localItems, setLocalItems] = useState<Omit<Item, "id" | "surveyId" | "sortOrder">[]>([]);

  // ── 부서 로컬 편집 ───────────────────────────────────
  const [localDepts, setLocalDepts] = useState<Omit<DeptEntry, "id" | "surveyId" | "sortOrder">[]>([]);
  const [deptsDirty, setDeptsDirty] = useState(false);

  // ── 쿼리 ──────────────────────────────────────────────
  const { data: surveys = [] } = useQuery<Survey[]>({ queryKey: ["/api/safety-supply/surveys"] });
  const { data: items = [], isLoading: itemsLoading } = useQuery<Item[]>({
    queryKey: ["/api/safety-supply/surveys", selectedId, "items"],
    queryFn: () => selectedId ? apiRequest("GET", `/api/safety-supply/surveys/${selectedId}/items`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedId,
  });
  const { data: depts = [], isLoading: deptsLoading } = useQuery<DeptEntry[]>({
    queryKey: ["/api/safety-supply/surveys", selectedId, "dept-entries"],
    queryFn: () => selectedId ? apiRequest("GET", `/api/safety-supply/surveys/${selectedId}/dept-entries`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedId,
  });

  const selected = surveys.find(s => s.id === selectedId) ?? null;

  // ── 뮤테이션 ──────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/safety-supply/surveys", body).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys"] });
      selectSurvey(data.id);
      closeDialog();
      toast({ title: "새 조사가 생성됐습니다." });
    },
  });

  const copyMut = useMutation({
    mutationFn: ({ srcId, body }: { srcId: number; body: any }) =>
      apiRequest("POST", `/api/safety-supply/surveys/${srcId}/copy`, body).then(r => r.json()),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys"] });
      selectSurvey(data.id);
      closeDialog();
      toast({ title: "조사가 복사됐습니다.", description: "부서·물품·수량 데이터가 모두 복사됐습니다." });
    },
  });

  const deleteSurveyMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-supply/surveys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys"] });
      setSelectedId(null);
      toast({ title: "조사가 삭제됐습니다." });
    },
  });

  const saveItemsMut = useMutation({
    mutationFn: (its: any[]) => apiRequest("PUT", `/api/safety-supply/surveys/${selectedId}/items`, its).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys", selectedId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys", selectedId, "dept-entries"] });
      setEditingItems(false);
      toast({ title: "물품 목록이 저장됐습니다." });
    },
  });

  const saveDeptsMut = useMutation({
    mutationFn: (entries: any[]) => apiRequest("PUT", `/api/safety-supply/surveys/${selectedId}/dept-entries`, entries).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys", selectedId, "dept-entries"] });
      setDeptsDirty(false);
      toast({ title: "저장됐습니다." });
    },
  });

  // ── 헬퍼 ──────────────────────────────────────────────
  const selectSurvey = (id: number) => {
    setSelectedId(id);
    setDeptsDirty(false);
    setEditingItems(false);
  };

  const openNewDialog = () => {
    setCreateMode("new");
    setCopySrcId(null);
    setDlgYear(String(CURRENT_YEAR));
    setDlgHalf("1");
    setDlgTitle("");
    setShowDialog(true);
  };

  const openCopyDialog = (srcId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCreateMode("copy");
    setCopySrcId(srcId);
    const src = surveys.find(s => s.id === srcId);
    // 복사 기본값: 다음 반기
    const nextHalf = src?.half === 1 ? 2 : 1;
    const nextYear = src?.half === 2 ? (src?.year ?? CURRENT_YEAR) + 1 : (src?.year ?? CURRENT_YEAR);
    setDlgYear(String(nextYear));
    setDlgHalf(String(nextHalf));
    setDlgTitle("");
    setShowDialog(true);
  };

  const closeDialog = () => { setShowDialog(false); setDlgTitle(""); };

  const handleDialogSubmit = () => {
    const titleFallback = `${dlgYear}년 ${dlgHalf === "1" ? "상" : "하"}반기 필요용품 조사`;
    const body = { year: parseInt(dlgYear), half: parseInt(dlgHalf), title: dlgTitle || titleFallback };
    if (createMode === "copy" && copySrcId) {
      copyMut.mutate({ srcId: copySrcId, body });
    } else {
      createMut.mutate(body);
    }
  };

  // ── 물품 편집 ─────────────────────────────────────────
  const startEditItems = () => {
    setLocalItems(items.map(it => ({ itemName: it.itemName, unitPrice: it.unitPrice, supplyStandard: it.supplyStandard })));
    setEditingItems(true);
  };

  // ── 부서 편집 헬퍼 ───────────────────────────────────
  const getDisplayDepts = () => deptsDirty
    ? localDepts
    : depts.map(d => ({ deptName: d.deptName, deptCount: d.deptCount, quantities: { ...d.quantities } }));

  const mutateDepts = (fn: (current: typeof localDepts) => typeof localDepts) => {
    const current = getDisplayDepts();
    setLocalDepts(fn(current));
    setDeptsDirty(true);
  };

  const setQty = (di: number, itemId: number, val: string) =>
    mutateDepts(c => c.map((d, i) => i === di ? { ...d, quantities: { ...d.quantities, [itemId]: parseInt(val) || 0 } } : d));

  const setDeptCount = (di: number, val: string) =>
    mutateDepts(c => c.map((d, i) => i === di ? { ...d, deptCount: parseInt(val) || 0 } : d));

  const setDeptName = (di: number, val: string) =>
    mutateDepts(c => c.map((d, i) => i === di ? { ...d, deptName: val } : d));

  const addDept = () => mutateDepts(c => [...c, { deptName: "새 부서", deptCount: 0, quantities: {} }]);

  const removeDept = (di: number) => mutateDepts(c => c.filter((_, i) => i !== di));

  // ── 집계 ──────────────────────────────────────────────
  const displayDepts = getDisplayDepts();
  const itemTotal = (itemId: number) => displayDepts.reduce((s, d) => s + (Number(d.quantities[itemId]) || 0), 0);
  const itemAmt = (item: Item) => itemTotal(item.id) * item.unitPrice;
  const rowQty = (d: typeof displayDepts[0]) => items.reduce((s, it) => s + (Number(d.quantities[it.id]) || 0), 0);
  const rowAmt = (d: typeof displayDepts[0]) => items.reduce((s, it) => s + (Number(d.quantities[it.id]) || 0) * it.unitPrice, 0);
  const grandQty = displayDepts.reduce((s, d) => s + rowQty(d), 0);
  const grandAmt = displayDepts.reduce((s, d) => s + rowAmt(d), 0);
  const totalHeadcount = displayDepts.reduce((s, d) => s + d.deptCount, 0);

  // ── 엑셀 다운로드 ─────────────────────────────────────
  const handleExport = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/safety-supply/surveys/${selectedId}/export`, { credentials: "include" });
      if (!res.ok) throw new Error("다운로드 실패");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${selected?.year}년 ${selected?.half === 1 ? "상반기" : "하반기"} 필요용품 조사.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { toast({ title: "다운로드 실패", description: e.message, variant: "destructive" }); }
  };

  // ── 엑셀 업로드 ───────────────────────────────────────
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedId) return;
    e.target.value = "";
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(`/api/safety-supply/surveys/${selectedId}/import`, { method: "POST", body: fd, credentials: "include" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys", selectedId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys", selectedId, "dept-entries"] });
      setDeptsDirty(false);
      toast({ title: "업로드 완료", description: `물품 ${data.items}개, 부서 ${data.depts}개 불러옴` });
    } catch (e: any) { toast({ title: "업로드 실패", description: e.message, variant: "destructive" }); }
  };

  const isPending = createMut.isPending || copyMut.isPending;

  return (
    <div className="flex h-full min-h-0" data-testid="page-safety-supply-survey">

      {/* ── 사이드바 ──────────────────────────────────── */}
      <div className="w-60 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-3 border-b border-gray-200 flex items-center justify-between">
          <span className="font-bold text-gray-800 text-sm flex items-center gap-1.5">
            <PackageCheck className="w-4 h-4 text-amber-500" />
            필요용품 조사
          </span>
          <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={openNewDialog} data-testid="button-create-survey">
            <Plus className="w-3 h-3" /> 새 조사
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {surveys.length === 0 && (
            <div className="py-10 text-center text-xs text-gray-400">등록된 조사가 없습니다</div>
          )}
          {surveys.map(s => {
            const isActive = selectedId === s.id;
            return (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => selectSurvey(s.id)}
                onKeyDown={e => e.key === "Enter" && selectSurvey(s.id)}
                className={`w-full text-left px-3 py-2.5 flex items-center gap-2 border-b border-gray-100 transition-colors group cursor-pointer
                  ${isActive ? "bg-amber-50 border-l-[3px] border-l-amber-500" : "hover:bg-gray-50"}`}
                data-testid={`card-survey-${s.id}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className="text-xs font-bold text-gray-800">{s.year}년</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-4 font-medium ${s.half === 1 ? "border-blue-300 text-blue-700 bg-blue-50" : "border-orange-300 text-orange-700 bg-orange-50"}`}>
                      {s.half === 1 ? "상반기" : "하반기"}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-gray-500 truncate">{s.title}</div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={e => openCopyDialog(s.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-amber-100 text-amber-600 transition-all"
                    title="이 조사 복사"
                    data-testid={`button-copy-survey-${s.id}`}
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  {isActive && <ChevronRight className="w-3 h-3 text-amber-500" />}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 메인 영역 ─────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-3">
              <div className="w-16 h-16 mx-auto rounded-full bg-amber-50 flex items-center justify-center">
                <PackageCheck className="w-8 h-8 text-amber-300" />
              </div>
              <p className="text-sm text-gray-500">왼쪽에서 조사를 선택하거나</p>
              <Button size="sm" variant="outline" className="gap-1" onClick={openNewDialog}>
                <Plus className="w-3.5 h-3.5" /> 새 조사 만들기
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* 상단 툴바 */}
            <div className="bg-white border-b border-gray-200 px-5 py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="font-bold text-gray-800 text-base">{selected.year}년 {selected.half === 1 ? "상반기" : "하반기"}</h2>
                    <Badge variant="outline" className={`text-xs ${selected.half === 1 ? "border-blue-300 text-blue-700 bg-blue-50" : "border-orange-300 text-orange-700 bg-orange-50"}`}>
                      {selected.half === 1 ? "상반기" : "하반기"}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-500">{selected.title}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5">
                {deptsDirty && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1 h-8" onClick={() => saveDeptsMut.mutate(displayDepts)} disabled={saveDeptsMut.isPending} data-testid="button-save-depts">
                    <Save className="w-3.5 h-3.5" /> {saveDeptsMut.isPending ? "저장중..." : "저장"}
                  </Button>
                )}
                <Button size="sm" variant="outline" className="gap-1 h-8" onClick={() => openCopyDialog(selected.id, { stopPropagation: () => {} } as any)} data-testid="button-copy-this-survey">
                  <Copy className="w-3.5 h-3.5" /> 복사
                </Button>
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} data-testid="input-import-excel" />
                  <span className="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-gray-300 bg-white text-xs font-medium text-gray-700 hover:bg-gray-50 cursor-pointer">
                    <Upload className="w-3.5 h-3.5" /> 엑셀 업로드
                  </span>
                </label>
                <Button size="sm" variant="outline" className="gap-1 h-8" onClick={handleExport} data-testid="button-export-excel">
                  <FileSpreadsheet className="w-3.5 h-3.5" /> 엑셀 다운로드
                </Button>
                <Button size="sm" variant="outline" className="gap-1 h-8 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50" onClick={() => { if (confirm("이 조사를 삭제하시겠습니까?")) deleteSurveyMut.mutate(selected.id); }} data-testid="button-delete-survey">
                  <Trash2 className="w-3.5 h-3.5" /> 삭제
                </Button>
              </div>
            </div>

            {/* 물품 목록 패널 */}
            <div className="bg-white border-b border-gray-200 px-5 py-2.5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-semibold text-gray-700">물품 목록</span>
                {!editingItems ? (
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-amber-700 hover:bg-amber-50" onClick={startEditItems} data-testid="button-edit-items">
                    <Pencil className="w-3 h-3" /> 편집
                  </Button>
                ) : (
                  <div className="flex gap-1">
                    <Button size="sm" className="h-6 px-2 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => saveItemsMut.mutate(localItems)} disabled={saveItemsMut.isPending} data-testid="button-save-items">
                      <Check className="w-3 h-3" /> {saveItemsMut.isPending ? "저장중..." : "저장"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={() => setEditingItems(false)} data-testid="button-cancel-items">
                      <X className="w-3 h-3" /> 취소
                    </Button>
                  </div>
                )}
              </div>

              {editingItems ? (
                <div className="space-y-1.5">
                  {localItems.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2 bg-gray-50 rounded px-2 py-1">
                      <span className="text-xs text-gray-400 w-5 text-center">{idx + 1}</span>
                      <Input className="h-7 text-xs flex-1" placeholder="품명" value={it.itemName}
                        onChange={e => { const u = [...localItems]; u[idx] = { ...u[idx], itemName: e.target.value }; setLocalItems(u); }}
                        data-testid={`input-item-name-${idx}`} />
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">단가</span>
                        <Input className="h-7 text-xs w-24" placeholder="0" type="number" value={it.unitPrice || ""}
                          onChange={e => { const u = [...localItems]; u[idx] = { ...u[idx], unitPrice: parseInt(e.target.value) || 0 }; setLocalItems(u); }}
                          data-testid={`input-item-price-${idx}`} />
                        <span className="text-xs text-gray-400">원</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-gray-400">지급기준</span>
                        <Input className="h-7 text-xs w-24" placeholder="예: 인당 1개" value={it.supplyStandard}
                          onChange={e => { const u = [...localItems]; u[idx] = { ...u[idx], supplyStandard: e.target.value }; setLocalItems(u); }}
                          data-testid={`input-item-standard-${idx}`} />
                      </div>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-400 hover:text-red-600" onClick={() => setLocalItems(localItems.filter((_, i) => i !== idx))} data-testid={`button-remove-item-${idx}`}>
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setLocalItems([...localItems, { itemName: "", unitPrice: 0, supplyStandard: "" }])} data-testid="button-add-item">
                    <Plus className="w-3 h-3" /> 물품 추가
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {itemsLoading && <span className="text-xs text-gray-400">불러오는 중...</span>}
                  {!itemsLoading && items.length === 0 && <span className="text-xs text-gray-400 italic">등록된 물품 없음 — 편집 버튼을 눌러 추가하세요</span>}
                  {items.map((it, idx) => (
                    <div key={it.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-md px-3 py-1.5 shadow-sm">
                      <span className="w-5 h-5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold flex items-center justify-center shrink-0">{idx + 1}</span>
                      <span className="text-xs font-semibold text-gray-800">{it.itemName}</span>
                      <span className="text-[11px] text-gray-400">|</span>
                      <span className="text-[11px] text-gray-600">{fmt(it.unitPrice)}원</span>
                      <span className="text-[11px] text-gray-400">/</span>
                      <span className="text-[11px] text-gray-600">{it.supplyStandard || "—"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 조사 그리드 */}
            <div className="flex-1 overflow-auto p-4">
              {(itemsLoading || deptsLoading) && (
                <div className="text-center py-16 text-gray-400 text-sm">불러오는 중...</div>
              )}
              {!itemsLoading && !deptsLoading && items.length === 0 && (
                <div className="text-center py-16 space-y-2">
                  <PackageCheck className="w-10 h-10 mx-auto text-gray-200" />
                  <p className="text-sm text-gray-400">먼저 위의 <strong>물품 목록 편집</strong>에서 물품을 추가하세요.</p>
                </div>
              )}

              {!itemsLoading && !deptsLoading && items.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="overflow-auto max-h-[calc(100vh-360px)]">
                    <table className="text-xs border-collapse w-max min-w-full">
                      <thead className="sticky top-0 z-10">
                        {/* ── 헤더 1행: 물품명 ── */}
                        <tr>
                          <th className="border border-gray-300 bg-gray-700 text-white px-2 py-2 text-center whitespace-nowrap font-semibold" rowSpan={2}>번호</th>
                          <th className="border border-gray-300 bg-gray-700 text-white px-4 py-2 text-center whitespace-nowrap font-semibold min-w-[130px]" rowSpan={2}>부서</th>
                          <th className="border border-gray-300 bg-gray-700 text-white px-3 py-2 text-center whitespace-nowrap font-semibold" rowSpan={2}>인원</th>
                          {items.map(it => (
                            <th key={it.id} className="border border-gray-300 bg-amber-600 text-white px-2 py-2 text-center whitespace-nowrap font-semibold" colSpan={2}>
                              <div>{it.itemName}</div>
                              <div className="font-normal text-amber-100 text-[10px] mt-0.5">
                                {fmt(it.unitPrice)}원 / {it.supplyStandard || "—"}
                              </div>
                            </th>
                          ))}
                          <th className="border border-gray-300 bg-green-700 text-white px-3 py-2 text-center whitespace-nowrap font-semibold" rowSpan={2}>총수량</th>
                          <th className="border border-gray-300 bg-green-700 text-white px-3 py-2 text-center whitespace-nowrap font-semibold" rowSpan={2}>총금액</th>
                          <th className="border border-gray-300 bg-gray-600 text-white w-8" rowSpan={2}></th>
                        </tr>
                        {/* ── 헤더 2행: 수량/금액 ── */}
                        <tr>
                          {items.map(it => (
                            <th key={`h2-${it.id}`} className="border border-gray-300 bg-amber-50 text-amber-800 px-3 py-1.5 text-center whitespace-nowrap font-semibold" colSpan={2}>
                              <span className="inline-block w-12 text-center">수량</span>
                              <span className="inline-block mx-1 text-amber-300">|</span>
                              <span className="inline-block w-16 text-center">금액</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {displayDepts.map((dept, di) => {
                          const tQty = rowQty(dept);
                          const tAmt = rowAmt(dept);
                          const isEven = di % 2 === 1;
                          return (
                            <tr key={di} className={`group/row transition-colors hover:bg-amber-50/60 ${isEven ? "bg-gray-50/60" : "bg-white"}`}>
                              <td className="border border-gray-200 px-2 py-1.5 text-center text-gray-400 font-medium whitespace-nowrap">{di + 1}</td>
                              <td className="border border-gray-200 px-1 py-1 min-w-[130px]">
                                <Input
                                  className="h-7 text-xs border-0 focus-visible:ring-1 focus-visible:ring-amber-300 px-2 bg-transparent font-medium text-gray-800"
                                  value={dept.deptName}
                                  onChange={e => setDeptName(di, e.target.value)}
                                  data-testid={`input-dept-name-${di}`}
                                />
                              </td>
                              <td className="border border-gray-200 px-1 py-1 w-16">
                                <Input
                                  className="h-7 text-xs border-0 focus-visible:ring-1 focus-visible:ring-blue-300 px-1 bg-blue-50/80 text-center text-blue-800 font-medium"
                                  type="number"
                                  value={dept.deptCount || ""}
                                  placeholder="0"
                                  onChange={e => setDeptCount(di, e.target.value)}
                                  data-testid={`input-dept-count-${di}`}
                                />
                              </td>
                              {items.map(it => {
                                const qty = Number(dept.quantities[it.id]) || 0;
                                const amt = qty * it.unitPrice;
                                return (
                                  <>
                                    <td key={`${di}-${it.id}-qty`} className="border border-gray-200 px-1 py-1 w-16">
                                      <Input
                                        className="h-7 text-xs border-0 focus-visible:ring-1 focus-visible:ring-amber-300 px-1 bg-transparent text-center text-gray-800 font-medium"
                                        type="number"
                                        value={qty || ""}
                                        placeholder="—"
                                        onChange={e => setQty(di, it.id, e.target.value)}
                                        data-testid={`input-qty-${di}-${it.id}`}
                                      />
                                    </td>
                                    <td key={`${di}-${it.id}-amt`} className={`border border-gray-200 px-3 py-1.5 text-right whitespace-nowrap ${amt ? "text-gray-800 font-medium" : "text-gray-300"}`}>
                                      {amt ? fmt(amt) : "—"}
                                    </td>
                                  </>
                                );
                              })}
                              <td className={`border border-gray-200 px-3 py-1.5 text-center font-bold whitespace-nowrap ${tQty ? "bg-green-50 text-green-800" : "text-gray-300"}`}>
                                {tQty || "—"}
                              </td>
                              <td className={`border border-gray-200 px-3 py-1.5 text-right font-bold whitespace-nowrap ${tAmt ? "bg-green-50 text-green-800" : "text-gray-300"}`}>
                                {tAmt ? fmt(tAmt) : "—"}
                              </td>
                              <td className="border border-gray-200 px-1 py-1 w-8 bg-white">
                                <button
                                  onClick={() => removeDept(di)}
                                  className="w-6 h-6 rounded flex items-center justify-center text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover/row:opacity-100"
                                  data-testid={`button-remove-dept-${di}`}
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {/* ── 합계 행 ── */}
                        <tr className="bg-gray-800 text-white font-bold">
                          <td className="border border-gray-600 px-2 py-2.5 text-center text-gray-300 text-xs">합계</td>
                          <td className="border border-gray-600 px-4 py-2.5 text-center text-sm">합 계</td>
                          <td className="border border-gray-600 px-3 py-2.5 text-center text-blue-300">{totalHeadcount}</td>
                          {items.map(it => (
                            <>
                              <td key={`sum-${it.id}-qty`} className="border border-gray-600 px-3 py-2.5 text-center text-amber-300">
                                {itemTotal(it.id) || "—"}
                              </td>
                              <td key={`sum-${it.id}-amt`} className="border border-gray-600 px-3 py-2.5 text-right text-amber-200 whitespace-nowrap">
                                {itemAmt(it) ? fmt(itemAmt(it)) : "—"}
                              </td>
                            </>
                          ))}
                          <td className="border border-gray-600 px-3 py-2.5 text-center text-green-300 text-sm">{grandQty || "—"}</td>
                          <td className="border border-gray-600 px-3 py-2.5 text-right text-green-200 whitespace-nowrap text-sm">{grandAmt ? fmt(grandAmt) : "—"}</td>
                          <td className="border border-gray-600 bg-gray-700"></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* 부서 추가 + 요약 */}
                  <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between bg-gray-50">
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={addDept} data-testid="button-add-dept">
                      <Plus className="w-3 h-3" /> 부서 추가
                    </Button>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>부서 <strong className="text-gray-700">{displayDepts.length}</strong>개</span>
                      <span>총 인원 <strong className="text-gray-700">{totalHeadcount}</strong>명</span>
                      <span>총 수량 <strong className="text-green-700">{grandQty}</strong>개</span>
                      <span>총 금액 <strong className="text-green-700">{fmt(grandAmt)}</strong>원</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 생성/복사 다이얼로그 ──────────────────────── */}
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-create-survey">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {createMode === "copy" ? (
                <><Copy className="w-4 h-4 text-amber-500" /> 조사 복사하기</>
              ) : (
                <><Plus className="w-4 h-4 text-amber-500" /> 새 조사 만들기</>
              )}
            </DialogTitle>
          </DialogHeader>

          {createMode === "copy" && copySrcId && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-800">
              <strong>{surveys.find(s => s.id === copySrcId)?.year}년 {surveys.find(s => s.id === copySrcId)?.half === 1 ? "상반기" : "하반기"}</strong> 조사의 부서·물품·수량을 그대로 복사합니다.
            </div>
          )}

          <div className="space-y-3 py-1">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-600 mb-1 block font-medium">연도</label>
                <Select value={dlgYear} onValueChange={setDlgYear}>
                  <SelectTrigger className="h-9" data-testid="select-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[CURRENT_YEAR - 1, CURRENT_YEAR, CURRENT_YEAR + 1].map(y => (
                      <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-600 mb-1 block font-medium">반기</label>
                <Select value={dlgHalf} onValueChange={setDlgHalf}>
                  <SelectTrigger className="h-9" data-testid="select-half">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">상반기</SelectItem>
                    <SelectItem value="2">하반기</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-600 mb-1 block font-medium">제목 (선택)</label>
              <Input
                className="h-9"
                placeholder={`${dlgYear}년 ${dlgHalf === "1" ? "상" : "하"}반기 필요용품 조사`}
                value={dlgTitle}
                onChange={e => setDlgTitle(e.target.value)}
                data-testid="input-survey-title"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>취소</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white gap-1"
              disabled={isPending}
              onClick={handleDialogSubmit}
              data-testid="button-confirm-create"
            >
              {isPending ? "처리중..." : createMode === "copy" ? <><Copy className="w-3.5 h-3.5" /> 복사 생성</> : <><Plus className="w-3.5 h-3.5" /> 만들기</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
