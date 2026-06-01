import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Trash2, Download, Upload, Save, PackageCheck,
  Pencil, X, Check, Copy, ChevronRight, FileSpreadsheet,
  Wallet, TrendingDown, PiggyBank, ReceiptText,
} from "lucide-react";

const CATEGORIES = [
  "1. 안전관리자 등 인건비 및 각종 업무수당 등",
  "2. 안전시설비 등",
  "3. 개인보호구 및 안전장구 구입비 등",
  "4. 안전진단비 등",
  "5. 안전보건교육비 및 행사비 등",
  "6. 근로자 건강관리비 등",
  "7. 건설재해예방 기술지도비",
  "8. 본사사용비",
  "9. 위험성평가 및 산보위 안건 비용",
];

type Survey = { id: number; year: number; half: number; title: string; budget: number | null; createdBy: string | null; createdAt: string };
type Item = { id: number; surveyId: number; itemName: string; unitPrice: number; supplyStandard: string; sortOrder: number };
type DeptEntry = { id: number; surveyId: number; deptName: string; deptCount: number; quantities: Record<string, number>; sortOrder: number };

const CURRENT_YEAR = new Date().getFullYear();
const fmt = (n: number) => n.toLocaleString("ko-KR");

type CreateMode = "new" | "copy";

export default function SafetySupplySurvey() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // ── 조사 생성/복사 다이얼로그 ────────────────────────
  const [showDialog, setShowDialog] = useState(false);
  const [createMode, setCreateMode] = useState<CreateMode>("new");
  const [copySrcId, setCopySrcId] = useState<number | null>(null);
  const [dlgYear, setDlgYear] = useState(String(CURRENT_YEAR));
  const [dlgHalf, setDlgHalf] = useState("1");
  const [dlgTitle, setDlgTitle] = useState("");

  // ── 예산 인라인 편집 ─────────────────────────────────
  const [editingBudget, setEditingBudget] = useState(false);
  const [budgetInput, setBudgetInput] = useState("");

  // ── 물품 편집 ────────────────────────────────────────
  const [editingItems, setEditingItems] = useState(false);
  const [localItems, setLocalItems] = useState<Omit<Item, "id" | "surveyId" | "sortOrder">[]>([]);

  // ── 부서 로컬 편집 ───────────────────────────────────
  const [localDepts, setLocalDepts] = useState<Omit<DeptEntry, "id" | "surveyId" | "sortOrder">[]>([]);
  const [deptsDirty, setDeptsDirty] = useState(false);

  // ── 지출등록 다이얼로그 ──────────────────────────────
  const [showRegDlg, setShowRegDlg] = useState(false);
  const [regDate, setRegDate] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [regCategory, setRegCategory] = useState("3. 개인보호구 및 안전장구 구입비 등");
  const [regVendor, setRegVendor] = useState("");
  const [regNotes, setRegNotes] = useState("");
  const [regItemIds, setRegItemIds] = useState<Set<number>>(new Set());

  // ── 쿼리 ─────────────────────────────────────────────
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

  // ── 뮤테이션 ─────────────────────────────────────────
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

  const updateSurveyMut = useMutation({
    mutationFn: (body: any) => apiRequest("PUT", `/api/safety-supply/surveys/${selectedId}`, body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-supply/surveys"] });
      setEditingBudget(false);
      toast({ title: "예산이 저장됐습니다." });
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

  const registerCostMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", `/api/safety-supply/surveys/${selectedId}/register-cost`, body).then(r => r.json()),
    onSuccess: (data) => {
      setShowRegDlg(false);
      toast({
        title: "지출등록 완료",
        description: `${data.created}개 항목이 산업안전보건관리비에 등록됐습니다. 견적서·거래명세서는 해당 메뉴에서 첨부하세요.`,
      });
    },
    onError: (e: any) => toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });

  // ── 헬퍼 ─────────────────────────────────────────────
  const selectSurvey = (id: number) => {
    setSelectedId(id);
    setDeptsDirty(false);
    setEditingItems(false);
    setEditingBudget(false);
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

  // ── 예산 편집 ─────────────────────────────────────────
  const startEditBudget = () => {
    setBudgetInput(selected?.budget ? String(selected.budget) : "");
    setEditingBudget(true);
  };
  const saveBudget = () => {
    const val = parseInt(budgetInput.replace(/,/g, "")) || null;
    updateSurveyMut.mutate({ budget: val });
  };

  // ── 지출등록 다이얼로그 열기 ─────────────────────────
  const openRegDlg = () => {
    const now = new Date();
    setRegDate(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
    setRegCategory("3. 개인보호구 및 안전장구 구입비 등");
    setRegVendor("");
    setRegNotes("");
    setRegItemIds(new Set(items.map(it => it.id)));
    setShowRegDlg(true);
  };
  const toggleRegItem = (id: number) => {
    setRegItemIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const handleRegisterCost = () => {
    if (!regDate) return;
    const purchaseDate = `${regDate}-01`;
    registerCostMut.mutate({
      purchaseDate,
      category: regCategory,
      vendorName: regVendor || null,
      notes: regNotes || null,
      itemIds: Array.from(regItemIds),
    });
  };

  // ── 물품 편집 헬퍼 ───────────────────────────────────
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

  const addItemAndEdit = () => {
    if (!editingItems) {
      setLocalItems([
        ...items.map(it => ({ itemName: it.itemName, unitPrice: it.unitPrice, supplyStandard: it.supplyStandard })),
        { itemName: "", unitPrice: 0, supplyStandard: "" },
      ]);
      setEditingItems(true);
    } else {
      setLocalItems([...localItems, { itemName: "", unitPrice: 0, supplyStandard: "" }]);
    }
  };

  const removeDept = (di: number) => mutateDepts(c => c.filter((_, i) => i !== di));

  // ── 집계 ─────────────────────────────────────────────
  const displayDepts = getDisplayDepts();
  const itemTotal = (itemId: number) => displayDepts.reduce((s, d) => s + (Number(d.quantities[itemId]) || 0), 0);
  const itemAmt = (item: Item) => itemTotal(item.id) * item.unitPrice;
  const rowQty = (d: typeof displayDepts[0]) => items.reduce((s, it) => s + (Number(d.quantities[it.id]) || 0), 0);
  const rowAmt = (d: typeof displayDepts[0]) => items.reduce((s, it) => s + (Number(d.quantities[it.id]) || 0) * it.unitPrice, 0);
  const grandQty = displayDepts.reduce((s, d) => s + rowQty(d), 0);
  const grandAmt = displayDepts.reduce((s, d) => s + rowAmt(d), 0);
  const totalHeadcount = displayDepts.reduce((s, d) => s + d.deptCount, 0);
  const budget = selected?.budget ?? null;
  const remaining = budget !== null ? budget - grandAmt : null;

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
                  {s.budget && (
                    <div className="text-[10px] text-amber-600 font-medium mt-0.5">예산 {fmt(s.budget)}원</div>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    onClick={e => openCopyDialog(s.id, e)}
                    className="p-1.5 rounded hover:bg-amber-100 text-amber-500 hover:text-amber-700 transition-colors"
                    title="이 조사 복사하기"
                    data-testid={`button-copy-survey-${s.id}`}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-amber-500" />}
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
            {/* ── 상단 툴바 ── */}
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
                {items.length > 0 && grandAmt > 0 && (
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white gap-1 h-8" onClick={openRegDlg} data-testid="button-register-cost">
                    <ReceiptText className="w-3.5 h-3.5" /> 지출등록
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

            {/* ── 예산 카드 바 ── */}
            <div className="bg-white border-b border-gray-200 px-5 py-2 flex items-center gap-6">
              {/* 예산 */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                  <Wallet className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-medium">예산</div>
                  {editingBudget ? (
                    <div className="flex items-center gap-1 mt-0.5">
                      <Input
                        className="h-6 text-xs w-28 px-2"
                        placeholder="금액 입력"
                        value={budgetInput}
                        onChange={e => setBudgetInput(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter") saveBudget(); if (e.key === "Escape") setEditingBudget(false); }}
                        autoFocus
                        data-testid="input-budget"
                      />
                      <span className="text-xs text-gray-400">원</span>
                      <button onClick={saveBudget} className="text-green-600 hover:text-green-700" title="저장"><Check className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditingBudget(false)} className="text-gray-400 hover:text-gray-600" title="취소"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ) : (
                    <button onClick={startEditBudget} className="flex items-center gap-1 group/budget" data-testid="button-edit-budget">
                      <span className={`text-sm font-bold ${budget !== null ? "text-amber-700" : "text-gray-300 italic"}`}>
                        {budget !== null ? fmt(budget) + "원" : "미설정"}
                      </span>
                      <Pencil className="w-3 h-3 text-gray-300 group-hover/budget:text-amber-400 transition-colors" />
                    </button>
                  )}
                </div>
              </div>

              <div className="w-px h-8 bg-gray-200" />

              {/* 사용금액 */}
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-red-50 flex items-center justify-center shrink-0">
                  <TrendingDown className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-medium">사용금액</div>
                  <div className={`text-sm font-bold ${grandAmt > 0 ? "text-red-600" : "text-gray-300"}`}>
                    {grandAmt > 0 ? fmt(grandAmt) + "원" : "—"}
                  </div>
                </div>
              </div>

              <div className="w-px h-8 bg-gray-200" />

              {/* 잔여예산 */}
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${remaining !== null ? (remaining >= 0 ? "bg-green-50" : "bg-red-50") : "bg-gray-50"}`}>
                  <PiggyBank className={`w-3.5 h-3.5 ${remaining !== null ? (remaining >= 0 ? "text-green-600" : "text-red-500") : "text-gray-300"}`} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 font-medium">잔여예산</div>
                  <div className={`text-sm font-bold ${remaining !== null ? (remaining >= 0 ? "text-green-700" : "text-red-600") : "text-gray-300"}`}>
                    {remaining !== null ? (
                      <>{remaining >= 0 ? "" : "△ "}{fmt(Math.abs(remaining))}원{remaining < 0 ? " 초과" : ""}</>
                    ) : "—"}
                  </div>
                </div>
              </div>

              {budget === null && (
                <button onClick={startEditBudget} className="ml-2 text-xs text-amber-600 hover:text-amber-700 underline underline-offset-2 font-medium">
                  예산 입력하기
                </button>
              )}

              {/* 잔여예산 비율 바 */}
              {budget !== null && budget > 0 && (
                <div className="flex-1 ml-4">
                  <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                    <span>사용률 {Math.min(Math.round((grandAmt / budget) * 100), 100)}%</span>
                    {remaining < 0 && <span className="text-red-500 font-medium">예산 초과</span>}
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${grandAmt > budget ? "bg-red-500" : "bg-amber-400"}`}
                      style={{ width: `${Math.min((grandAmt / budget) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* ── 물품 목록 패널 ── */}
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

            {/* ── 조사 그리드 ── */}
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

                  {/* 부서/물품 추가 버튼 — 테이블 위 */}
                  <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between bg-gray-50">
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7" onClick={addDept} data-testid="button-add-dept">
                        <Plus className="w-3 h-3" /> 부서 추가
                      </Button>
                      <Button size="sm" variant="outline" className="gap-1 text-xs h-7 text-amber-700 border-amber-300 hover:bg-amber-50" onClick={addItemAndEdit} data-testid="button-add-item-quick">
                        <Plus className="w-3 h-3" /> 물품 추가
                      </Button>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>부서 <strong className="text-gray-700">{displayDepts.length}</strong>개</span>
                      <span>총 인원 <strong className="text-gray-700">{totalHeadcount}</strong>명</span>
                      <span>총 수량 <strong className="text-green-700">{grandQty}</strong>개</span>
                      <span>총 금액 <strong className="text-green-700">{fmt(grandAmt)}</strong>원</span>
                    </div>
                  </div>

                  <div className="overflow-auto max-h-[calc(100vh-480px)]">
                    <table className="text-xs border-collapse w-max min-w-full">
                      <thead className="sticky top-0 z-10">
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
                              <td className="border border-gray-200 px-1 py-1 bg-blue-50/50">
                                <Input
                                  className="h-7 text-xs border-0 focus-visible:ring-1 focus-visible:ring-blue-300 px-2 bg-transparent text-center text-blue-700 font-semibold w-14"
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
                                    <td key={`${di}-${it.id}-qty`} className="border border-gray-200 px-1 py-1">
                                      <Input
                                        className="h-7 text-xs border-0 focus-visible:ring-1 focus-visible:ring-amber-300 px-2 bg-transparent text-center w-16"
                                        type="number"
                                        min={0}
                                        value={qty || ""}
                                        placeholder="0"
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

                        {/* 합계 행 */}
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

                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* ── 조사 생성/복사 다이얼로그 ──────────────────── */}
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

      {/* ── 지출등록 다이얼로그 ─────────────────────────── */}
      <Dialog open={showRegDlg} onOpenChange={setShowRegDlg}>
        <DialogContent className="sm:max-w-md" data-testid="dialog-register-cost">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ReceiptText className="w-4 h-4 text-blue-500" />
              산업안전보건관리비 지출등록
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-1">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-600 mb-1 block font-medium">구매년월</label>
                <Input
                  type="month"
                  className="h-9"
                  value={regDate}
                  onChange={e => setRegDate(e.target.value)}
                  data-testid="input-reg-date"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block font-medium">항목 분류</label>
              <Select value={regCategory} onValueChange={setRegCategory}>
                <SelectTrigger className="h-9" data-testid="select-reg-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block font-medium">업체명 (선택)</label>
              <Input className="h-9" placeholder="납품 업체명" value={regVendor} onChange={e => setRegVendor(e.target.value)} data-testid="input-reg-vendor" />
            </div>

            <div>
              <label className="text-xs text-gray-600 mb-1 block font-medium">비고 (선택)</label>
              <Input className="h-9" placeholder="메모" value={regNotes} onChange={e => setRegNotes(e.target.value)} data-testid="input-reg-notes" />
            </div>

            {/* 물품 선택 */}
            <div>
              <label className="text-xs text-gray-600 mb-1.5 block font-medium">등록할 물품 선택</label>
              <div className="space-y-1.5 max-h-52 overflow-y-auto rounded-lg border border-gray-200 p-2">
                {items.map(it => {
                  const qty = displayDepts.reduce((s, d) => s + (Number(d.quantities[it.id]) || 0), 0);
                  const amt = qty * it.unitPrice;
                  const checked = regItemIds.has(it.id);
                  return (
                    <div
                      key={it.id}
                      className={`flex items-center gap-2.5 rounded-md px-2.5 py-2 cursor-pointer transition-colors ${checked ? "bg-blue-50 border border-blue-200" : "bg-gray-50 border border-transparent hover:bg-gray-100"}`}
                      onClick={() => toggleRegItem(it.id)}
                      data-testid={`checkbox-reg-item-${it.id}`}
                    >
                      <Checkbox checked={checked} className="pointer-events-none" />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold text-gray-800">{it.itemName}</div>
                        <div className="text-[10px] text-gray-400">{fmt(it.unitPrice)}원 × {qty}개 = {fmt(amt)}원</div>
                      </div>
                      {qty === 0 && <span className="text-[10px] text-orange-500 font-medium">수량 0</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2 text-xs text-blue-700">
              물품별로 각각 지출내역이 등록됩니다. 견적서·거래명세서는 <strong>산업안전보건관리비</strong> 메뉴에서 나중에 첨부할 수 있습니다.
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegDlg(false)}>취소</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white gap-1"
              disabled={registerCostMut.isPending || regItemIds.size === 0 || !regDate}
              onClick={handleRegisterCost}
              data-testid="button-confirm-register-cost"
            >
              {registerCostMut.isPending ? "등록중..." : <><ReceiptText className="w-3.5 h-3.5" /> 지출등록</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
