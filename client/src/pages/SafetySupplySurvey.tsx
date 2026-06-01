import { useState, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Trash2, Download, Upload, Save, ChevronRight, PackageCheck, Pencil, X, Check } from "lucide-react";

type Survey = { id: number; year: number; half: number; title: string; createdBy: string | null; createdAt: string };
type Item = { id: number; surveyId: number; itemName: string; unitPrice: number; supplyStandard: string; sortOrder: number };
type DeptEntry = { id: number; surveyId: number; deptName: string; deptCount: number; quantities: Record<string, number>; sortOrder: number };

const CURRENT_YEAR = new Date().getFullYear();

export default function SafetySupplySurvey() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newYear, setNewYear] = useState(String(CURRENT_YEAR));
  const [newHalf, setNewHalf] = useState("1");
  const [newTitle, setNewTitle] = useState("");
  const [editingItems, setEditingItems] = useState(false);
  const [localItems, setLocalItems] = useState<Omit<Item, "id" | "surveyId" | "sortOrder">[]>([]);
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
      setSelectedId(data.id);
      setShowCreate(false);
      setNewTitle("");
      toast({ title: "조사 생성 완료" });
    },
  });

  const deleteSurveyMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-supply/surveys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys"] });
      setSelectedId(null);
      toast({ title: "조사 삭제 완료" });
    },
  });

  const saveItemsMut = useMutation({
    mutationFn: (items: any[]) => apiRequest("PUT", `/api/safety-supply/surveys/${selectedId}/items`, items).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys", selectedId, "items"] });
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys", selectedId, "dept-entries"] });
      setEditingItems(false);
      toast({ title: "물품 목록 저장 완료" });
    },
  });

  const saveDeptsMut = useMutation({
    mutationFn: (entries: any[]) => apiRequest("PUT", `/api/safety-supply/surveys/${selectedId}/dept-entries`, entries).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys", selectedId, "dept-entries"] });
      setDeptsDirty(false);
      toast({ title: "저장 완료" });
    },
  });

  // ── 물품 편집 시작 ────────────────────────────────────
  const startEditItems = () => {
    setLocalItems(items.map(it => ({ itemName: it.itemName, unitPrice: it.unitPrice, supplyStandard: it.supplyStandard })));
    setEditingItems(true);
  };

  // ── 부서 데이터 로컬 동기화 ───────────────────────────
  const initDepts = useCallback(() => {
    setLocalDepts(depts.map(d => ({ deptName: d.deptName, deptCount: d.deptCount, quantities: { ...d.quantities } })));
    setDeptsDirty(false);
  }, [depts]);

  const getLocalDepts = (): typeof localDepts => {
    if (!deptsDirty) return depts.map(d => ({ deptName: d.deptName, deptCount: d.deptCount, quantities: { ...d.quantities } }));
    return localDepts;
  };

  const setQty = (deptIdx: number, itemId: number, val: string) => {
    const n = parseInt(val) || 0;
    const current = getLocalDepts();
    const updated = current.map((d, i) => i === deptIdx ? { ...d, quantities: { ...d.quantities, [itemId]: n } } : d);
    setLocalDepts(updated);
    setDeptsDirty(true);
  };

  const setDeptCount = (deptIdx: number, val: string) => {
    const n = parseInt(val) || 0;
    const current = getLocalDepts();
    const updated = current.map((d, i) => i === deptIdx ? { ...d, deptCount: n } : d);
    setLocalDepts(updated);
    setDeptsDirty(true);
  };

  const addDept = () => {
    const current = getLocalDepts();
    setLocalDepts([...current, { deptName: "새 부서", deptCount: 0, quantities: {} }]);
    setDeptsDirty(true);
  };

  const removeDept = (idx: number) => {
    const current = getLocalDepts();
    setLocalDepts(current.filter((_, i) => i !== idx));
    setDeptsDirty(true);
  };

  const setDeptName = (idx: number, val: string) => {
    const current = getLocalDepts();
    const updated = current.map((d, i) => i === idx ? { ...d, deptName: val } : d);
    setLocalDepts(updated);
    setDeptsDirty(true);
  };

  // ── 합계 계산 ─────────────────────────────────────────
  const displayDepts = getLocalDepts();
  const totalQtyByItem = (itemId: number) => displayDepts.reduce((s, d) => s + (Number(d.quantities[itemId]) || 0), 0);
  const totalAmtByItem = (item: Item) => totalQtyByItem(item.id) * item.unitPrice;
  const rowTotalQty = (d: typeof displayDepts[0]) => items.reduce((s, it) => s + (Number(d.quantities[it.id]) || 0), 0);
  const rowTotalAmt = (d: typeof displayDepts[0]) => items.reduce((s, it) => s + (Number(d.quantities[it.id]) || 0) * it.unitPrice, 0);
  const grandTotalQty = displayDepts.reduce((s, d) => s + rowTotalQty(d), 0);
  const grandTotalAmt = displayDepts.reduce((s, d) => s + rowTotalAmt(d), 0);

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
      const halfLabel = selected?.half === 1 ? "상반기" : "하반기";
      a.download = `${selected?.year}년 ${halfLabel} 필요용품 조사.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast({ title: "다운로드 실패", description: e.message, variant: "destructive" });
    }
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
    } catch (e: any) {
      toast({ title: "업로드 실패", description: e.message, variant: "destructive" });
    }
  };

  const fmt = (n: number) => n.toLocaleString("ko-KR");

  return (
    <div className="flex h-full min-h-0" data-testid="page-safety-supply-survey">
      {/* 사이드바: 조사 목록 */}
      <div className="w-64 shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <span className="font-bold text-gray-800 text-sm">필요용품 조사</span>
          <Button size="sm" variant="outline" className="h-7 px-2 gap-1 text-xs" onClick={() => setShowCreate(true)} data-testid="button-create-survey">
            <Plus className="w-3 h-3" /> 새 조사
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {surveys.length === 0 && (
            <div className="p-6 text-center text-sm text-gray-400">조사 없음</div>
          )}
          {surveys.map(s => (
            <button
              key={s.id}
              onClick={() => { setSelectedId(s.id); setDeptsDirty(false); setEditingItems(false); }}
              className={`w-full text-left px-4 py-3 flex items-center gap-2 border-b border-gray-100 hover:bg-amber-50 transition-colors ${selectedId === s.id ? "bg-amber-50 border-l-2 border-l-amber-500" : ""}`}
              data-testid={`card-survey-${s.id}`}
            >
              <PackageCheck className="w-4 h-4 text-amber-500 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800 truncate">{s.year}년 {s.half === 1 ? "상" : "하"}반기</div>
                <div className="text-xs text-gray-500 truncate">{s.title}</div>
              </div>
              {selectedId === s.id && <ChevronRight className="w-3 h-3 text-amber-500 shrink-0" />}
            </button>
          ))}
        </div>
      </div>

      {/* 메인 영역 */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-50">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
            <div className="text-center space-y-2">
              <PackageCheck className="w-12 h-12 mx-auto text-gray-300" />
              <p>조사를 선택하거나 새 조사를 만드세요.</p>
            </div>
          </div>
        ) : (
          <>
            {/* 상단 바 */}
            <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
              <div>
                <h2 className="font-bold text-gray-800">{selected.year}년 {selected.half === 1 ? "상반기" : "하반기"} 필요용품 조사</h2>
                <p className="text-xs text-gray-500">{selected.title}</p>
              </div>
              <div className="flex items-center gap-2">
                {deptsDirty && (
                  <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white gap-1" onClick={() => saveDeptsMut.mutate(displayDepts)} disabled={saveDeptsMut.isPending} data-testid="button-save-depts">
                    <Save className="w-3 h-3" /> {saveDeptsMut.isPending ? "저장중..." : "저장"}
                  </Button>
                )}
                <label className="cursor-pointer">
                  <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} data-testid="input-import-excel" />
                  <Button size="sm" variant="outline" className="gap-1 pointer-events-none" asChild>
                    <span><Upload className="w-3 h-3" /> 엑셀 업로드</span>
                  </Button>
                </label>
                <Button size="sm" variant="outline" className="gap-1" onClick={handleExport} data-testid="button-export-excel">
                  <Download className="w-3 h-3" /> 엑셀 다운로드
                </Button>
                <Button size="sm" variant="outline" className="gap-1 text-red-600 hover:text-red-700 border-red-200 hover:bg-red-50" onClick={() => { if (confirm("이 조사를 삭제하시겠습니까?")) deleteSurveyMut.mutate(selected.id); }} data-testid="button-delete-survey">
                  <Trash2 className="w-3 h-3" /> 삭제
                </Button>
              </div>
            </div>

            {/* 물품 설정 패널 */}
            <div className="bg-white border-b border-gray-200 px-6 py-3">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-semibold text-gray-700">물품 목록</span>
                {!editingItems ? (
                  <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={startEditItems} data-testid="button-edit-items">
                    <Pencil className="w-3 h-3" /> 편집
                  </Button>
                ) : (
                  <>
                    <Button size="sm" className="h-6 px-2 text-xs gap-1 bg-amber-600 hover:bg-amber-700 text-white" onClick={() => saveItemsMut.mutate(localItems)} disabled={saveItemsMut.isPending} data-testid="button-save-items">
                      <Check className="w-3 h-3" /> {saveItemsMut.isPending ? "저장중..." : "저장"}
                    </Button>
                    <Button size="sm" variant="outline" className="h-6 px-2 text-xs gap-1" onClick={() => setEditingItems(false)} data-testid="button-cancel-items">
                      <X className="w-3 h-3" /> 취소
                    </Button>
                  </>
                )}
              </div>

              {editingItems ? (
                <div className="space-y-1">
                  {localItems.map((it, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        className="h-7 text-xs flex-1"
                        placeholder="품명"
                        value={it.itemName}
                        onChange={e => { const u = [...localItems]; u[idx] = { ...u[idx], itemName: e.target.value }; setLocalItems(u); }}
                        data-testid={`input-item-name-${idx}`}
                      />
                      <Input
                        className="h-7 text-xs w-28"
                        placeholder="단가"
                        type="number"
                        value={it.unitPrice || ""}
                        onChange={e => { const u = [...localItems]; u[idx] = { ...u[idx], unitPrice: parseInt(e.target.value) || 0 }; setLocalItems(u); }}
                        data-testid={`input-item-price-${idx}`}
                      />
                      <Input
                        className="h-7 text-xs w-28"
                        placeholder="지급기준"
                        value={it.supplyStandard}
                        onChange={e => { const u = [...localItems]; u[idx] = { ...u[idx], supplyStandard: e.target.value }; setLocalItems(u); }}
                        data-testid={`input-item-standard-${idx}`}
                      />
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500" onClick={() => setLocalItems(localItems.filter((_, i) => i !== idx))} data-testid={`button-remove-item-${idx}`}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 mt-1" onClick={() => setLocalItems([...localItems, { itemName: "", unitPrice: 0, supplyStandard: "" }])} data-testid="button-add-item">
                    <Plus className="w-3 h-3" /> 물품 추가
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {itemsLoading && <span className="text-xs text-gray-400">불러오는 중...</span>}
                  {!itemsLoading && items.length === 0 && <span className="text-xs text-gray-400">물품이 없습니다. 편집 버튼을 눌러 추가하세요.</span>}
                  {items.map(it => (
                    <div key={it.id} className="bg-amber-50 border border-amber-200 rounded px-2 py-1 text-xs text-gray-700">
                      <span className="font-medium">{it.itemName}</span>
                      <span className="text-gray-500 ml-1">({fmt(it.unitPrice)}원 / {it.supplyStandard})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 조사표 그리드 */}
            <div className="flex-1 overflow-auto p-4">
              {(itemsLoading || deptsLoading) && (
                <div className="text-center py-10 text-gray-400 text-sm">불러오는 중...</div>
              )}
              {!itemsLoading && !deptsLoading && items.length === 0 && (
                <div className="text-center py-10 text-gray-400 text-sm">
                  <p>먼저 물품 목록을 설정하세요.</p>
                </div>
              )}
              {!itemsLoading && !deptsLoading && items.length > 0 && (
                <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
                  <table className="text-xs border-collapse w-max min-w-full">
                    <thead>
                      <tr className="bg-amber-50">
                        <th className="border border-gray-300 px-3 py-2 font-bold text-center text-gray-700 bg-amber-100 whitespace-nowrap" rowSpan={2}>구분</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold text-center text-gray-700 bg-amber-100 whitespace-nowrap" rowSpan={2}>부서</th>
                        <th className="border border-gray-300 px-3 py-2 font-bold text-center text-gray-700 bg-amber-100 whitespace-nowrap" rowSpan={2}>인원</th>
                        {items.map(it => (
                          <th key={it.id} className="border border-gray-300 px-2 py-1 font-bold text-center text-gray-700 bg-amber-50 whitespace-nowrap" colSpan={4}>
                            {it.itemName}
                          </th>
                        ))}
                        <th className="border border-gray-300 px-2 py-1 font-bold text-center text-gray-700 bg-green-100 whitespace-nowrap" rowSpan={2}>총수량</th>
                        <th className="border border-gray-300 px-2 py-1 font-bold text-center text-gray-700 bg-green-100 whitespace-nowrap" rowSpan={2}>총금액</th>
                      </tr>
                      <tr className="bg-amber-50">
                        {items.map(it => (
                          <>
                            <th key={`${it.id}-price`} className="border border-gray-300 px-2 py-1 text-center text-gray-600 whitespace-nowrap">단가</th>
                            <th key={`${it.id}-std`} className="border border-gray-300 px-2 py-1 text-center text-gray-600 whitespace-nowrap">지급기준</th>
                            <th key={`${it.id}-qty`} className="border border-gray-300 px-2 py-1 text-center text-gray-600 whitespace-nowrap">수량</th>
                            <th key={`${it.id}-amt`} className="border border-gray-300 px-2 py-1 text-center text-gray-600 whitespace-nowrap">금액</th>
                          </>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {displayDepts.map((dept, di) => {
                        const tQty = rowTotalQty(dept);
                        const tAmt = rowTotalAmt(dept);
                        return (
                          <tr key={di} className="hover:bg-amber-50/30">
                            <td className="border border-gray-200 px-2 py-1 text-center text-gray-500 whitespace-nowrap">
                              {di === 0 ? "부서" : ""}
                            </td>
                            <td className="border border-gray-200 px-1 py-0.5 min-w-[100px]">
                              <Input
                                className="h-6 text-xs border-0 focus-visible:ring-0 px-1 bg-transparent"
                                value={dept.deptName}
                                onChange={e => setDeptName(di, e.target.value)}
                                data-testid={`input-dept-name-${di}`}
                              />
                            </td>
                            <td className="border border-gray-200 px-1 py-0.5 w-14">
                              <Input
                                className="h-6 text-xs border-0 focus-visible:ring-0 px-1 bg-blue-50 text-center"
                                type="number"
                                value={dept.deptCount || ""}
                                onChange={e => setDeptCount(di, e.target.value)}
                                data-testid={`input-dept-count-${di}`}
                              />
                            </td>
                            {items.map(it => {
                              const qty = Number(dept.quantities[it.id]) || 0;
                              const amt = qty * it.unitPrice;
                              return (
                                <>
                                  <td key={`${di}-${it.id}-price`} className="border border-gray-200 px-2 py-1 text-center text-gray-500 whitespace-nowrap">{fmt(it.unitPrice)}</td>
                                  <td key={`${di}-${it.id}-std`} className="border border-gray-200 px-2 py-1 text-center text-gray-500 whitespace-nowrap">{it.supplyStandard}</td>
                                  <td key={`${di}-${it.id}-qty`} className="border border-gray-200 px-1 py-0.5 w-14">
                                    <Input
                                      className="h-6 text-xs border-0 focus-visible:ring-0 px-1 bg-transparent text-center"
                                      type="number"
                                      value={qty || ""}
                                      onChange={e => setQty(di, it.id, e.target.value)}
                                      data-testid={`input-qty-${di}-${it.id}`}
                                    />
                                  </td>
                                  <td key={`${di}-${it.id}-amt`} className="border border-gray-200 px-2 py-1 text-right text-gray-700 whitespace-nowrap">{amt ? fmt(amt) : ""}</td>
                                </>
                              );
                            })}
                            <td className="border border-gray-200 px-2 py-1 text-center font-medium text-gray-700 bg-green-50">{tQty || ""}</td>
                            <td className="border border-gray-200 px-2 py-1 text-right font-medium text-gray-700 bg-green-50 whitespace-nowrap">{tAmt ? fmt(tAmt) : ""}</td>
                            <td className="border border-gray-200 px-1 py-0.5 w-6">
                              <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400 hover:text-red-600" onClick={() => removeDept(di)} data-testid={`button-remove-dept-${di}`}>
                                <X className="w-3 h-3" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}

                      {/* 합계 행 */}
                      <tr className="bg-green-50 font-bold">
                        <td className="border border-gray-300 px-2 py-2 text-center text-gray-700" colSpan={2}>합 계</td>
                        <td className="border border-gray-300 px-2 py-2 text-center text-gray-700">{displayDepts.reduce((s, d) => s + d.deptCount, 0)}</td>
                        {items.map(it => (
                          <>
                            <td key={`sum-${it.id}-price`} className="border border-gray-300 px-2 py-2 text-center text-gray-500">{fmt(it.unitPrice)}</td>
                            <td key={`sum-${it.id}-std`} className="border border-gray-300 px-2 py-2 text-center text-gray-500">{it.supplyStandard}</td>
                            <td key={`sum-${it.id}-qty`} className="border border-gray-300 px-2 py-2 text-center text-gray-800">{totalQtyByItem(it.id) || ""}</td>
                            <td key={`sum-${it.id}-amt`} className="border border-gray-300 px-2 py-2 text-right text-gray-800 whitespace-nowrap">{totalAmtByItem(it) ? fmt(totalAmtByItem(it)) : ""}</td>
                          </>
                        ))}
                        <td className="border border-gray-300 px-2 py-2 text-center text-gray-800">{grandTotalQty || ""}</td>
                        <td className="border border-gray-300 px-2 py-2 text-right text-gray-800 whitespace-nowrap">{grandTotalAmt ? fmt(grandTotalAmt) : ""}</td>
                        <td className="border border-gray-200"></td>
                      </tr>
                    </tbody>
                  </table>

                  {/* 부서 추가 버튼 */}
                  <div className="p-3 border-t border-gray-200">
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={addDept} data-testid="button-add-dept">
                      <Plus className="w-3 h-3" /> 부서 추가
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 새 조사 만들기 다이얼로그 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-sm" data-testid="dialog-create-survey">
          <DialogHeader>
            <DialogTitle>새 조사 만들기</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-600 mb-1 block">연도</label>
                <Select value={newYear} onValueChange={setNewYear}>
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
                <label className="text-xs text-gray-600 mb-1 block">반기</label>
                <Select value={newHalf} onValueChange={setNewHalf}>
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
              <label className="text-xs text-gray-600 mb-1 block">제목 (선택)</label>
              <Input
                className="h-9"
                placeholder={`${newYear}년 ${newHalf === "1" ? "상" : "하"}반기 필요용품 조사`}
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                data-testid="input-survey-title"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>취소</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={createMut.isPending}
              onClick={() => createMut.mutate({
                year: parseInt(newYear),
                half: parseInt(newHalf),
                title: newTitle || `${newYear}년 ${newHalf === "1" ? "상" : "하"}반기 필요용품 조사`,
              })}
              data-testid="button-confirm-create"
            >
              {createMut.isPending ? "생성중..." : "만들기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
