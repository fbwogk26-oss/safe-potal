import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Trash2, Edit2, Upload, FileText, ImageIcon, Loader2, ChevronDown, ChevronUp, BarChart3, List, X, Eye } from "lucide-react";
import type { SafetyCostRecord } from "@shared/schema";

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

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const CATEGORY_COLORS = [
  "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
  "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
  "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  "bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-300",
  "bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300",
  "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
  "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300",
];

function fmt(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "-";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "-";
  return num.toLocaleString("ko-KR") + "원";
}
function fmtNum(n: number | string | null | undefined) {
  if (n === null || n === undefined || n === "") return "-";
  const num = typeof n === "string" ? parseFloat(n) : n;
  if (isNaN(num)) return "-";
  return num.toLocaleString("ko-KR");
}

const currentYear = new Date().getFullYear();

interface ExtractedItem {
  itemName: string;
  specification: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  supplyAmount: number;
  vatAmount: number;
  totalAmount: number;
}

interface ExtractedData {
  vendorName: string;
  documentDate: string;
  totalAmount: number;
  items: ExtractedItem[];
}

const emptyForm = {
  year: currentYear,
  month: new Date().getMonth() + 1,
  category: "",
  subCategory: "",
  itemName: "",
  specification: "",
  unit: "EA",
  quantity: "",
  unitPrice: "",
  supplyAmount: "",
  vatAmount: "",
  totalAmount: "",
  purchaseDate: "",
  vendorName: "",
  notes: "",
  quoteFileUrl: "",
  transactionFileUrl: "",
};

export default function SafetyCostBudget() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const [activeTab, setActiveTab] = useState<"list" | "summary">("list");
  const [filterCategory, setFilterCategory] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editRecord, setEditRecord] = useState<SafetyCostRecord | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [extracting, setExtracting] = useState<"quote" | "transaction" | null>(null);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [selectedItemIdx, setSelectedItemIdx] = useState<number>(0);
  const [imagePreview, setImagePreview] = useState<{ url: string; title: string } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const quoteInputRef = useRef<HTMLInputElement>(null);
  const transactionInputRef = useRef<HTMLInputElement>(null);

  const { data: records = [], isLoading } = useQuery<SafetyCostRecord[]>({
    queryKey: ["/api/safety-cost-records", selectedYear],
    queryFn: () => fetch(`/api/safety-cost-records?year=${selectedYear}`, { credentials: "include" }).then(r => r.json()),
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/safety-cost-records", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-cost-records"] });
      toast({ title: "저장 완료", description: "사용내역이 등록되었습니다." });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/safety-cost-records/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-cost-records"] });
      toast({ title: "수정 완료" });
      closeDialog();
    },
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-cost-records/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/safety-cost-records"] });
      toast({ title: "삭제 완료" });
      setDeleteConfirmId(null);
    },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  function openAdd() {
    setEditRecord(null);
    setForm({ ...emptyForm, year: selectedYear });
    setExtractedItems([]);
    setSelectedItemIdx(0);
    setDialogOpen(true);
  }

  function openEdit(rec: SafetyCostRecord) {
    setEditRecord(rec);
    setForm({
      year: rec.year,
      month: rec.month,
      category: rec.category,
      subCategory: rec.subCategory || "",
      itemName: rec.itemName,
      specification: rec.specification || "",
      unit: rec.unit || "EA",
      quantity: rec.quantity?.toString() || "",
      unitPrice: rec.unitPrice?.toString() || "",
      supplyAmount: rec.supplyAmount?.toString() || "",
      vatAmount: rec.vatAmount?.toString() || "",
      totalAmount: rec.totalAmount?.toString() || "",
      purchaseDate: rec.purchaseDate || "",
      vendorName: rec.vendorName || "",
      notes: rec.notes || "",
      quoteFileUrl: rec.quoteFileUrl || "",
      transactionFileUrl: rec.transactionFileUrl || "",
    });
    setExtractedItems([]);
    setSelectedItemIdx(0);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    setEditRecord(null);
    setExtractedItems([]);
  }

  function setField(key: string, val: string | number) {
    setForm(prev => ({ ...prev, [key]: val }));
  }

  function autoCalc(field: string, val: string) {
    const updated = { ...form, [field]: val };
    if (field === "quantity" || field === "unitPrice") {
      const q = parseFloat(updated.quantity?.toString() || "0");
      const u = parseFloat(updated.unitPrice?.toString() || "0");
      if (!isNaN(q) && !isNaN(u) && q > 0 && u > 0) {
        const supply = q * u;
        const vat = Math.round(supply * 0.1);
        updated.supplyAmount = supply.toString();
        updated.vatAmount = vat.toString();
        updated.totalAmount = (supply + vat).toString();
      }
    }
    setForm(updated);
  }

  async function handleExtract(docType: "quote" | "transaction", file: File) {
    setExtracting(docType);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/safety-cost-records/extract?docType=${docType}`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      const data: ExtractedData = await res.json();

      if (data.vendorName) setField("vendorName", data.vendorName);
      if (data.documentDate) setField("purchaseDate", data.documentDate);

      if (data.items && data.items.length > 0) {
        setExtractedItems(data.items);
        setSelectedItemIdx(0);
        applyItem(data.items[0]);
      } else {
        if (data.totalAmount) setField("totalAmount", data.totalAmount.toString());
      }

      // upload file to get URL
      const uploadFd = new FormData();
      uploadFd.append("file", file);
      const uploadRes = await fetch("/api/upload/general", { method: "POST", body: uploadFd, credentials: "include" });
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        const url = uploadData.fileUrl || uploadData.imageUrl || uploadData.url || "";
        if (docType === "quote") setField("quoteFileUrl", url);
        else setField("transactionFileUrl", url);
      }

      toast({ title: "추출 완료", description: `${data.items?.length || 0}개 항목이 감지되었습니다.` });
    } catch (e: any) {
      toast({ title: "추출 실패", description: e.message, variant: "destructive" });
    } finally {
      setExtracting(null);
    }
  }

  function applyItem(item: ExtractedItem) {
    setForm(prev => ({
      ...prev,
      itemName: item.itemName || prev.itemName,
      specification: item.specification || prev.specification,
      unit: item.unit || prev.unit,
      quantity: item.quantity?.toString() || prev.quantity,
      unitPrice: item.unitPrice?.toString() || prev.unitPrice,
      supplyAmount: item.supplyAmount?.toString() || prev.supplyAmount,
      vatAmount: item.vatAmount?.toString() || prev.vatAmount,
      totalAmount: item.totalAmount?.toString() || prev.totalAmount,
    }));
  }

  function handleSubmit() {
    if (!form.category || !form.itemName || !form.totalAmount) {
      toast({ title: "필수 항목 누락", description: "항목, 품명, 합계금액은 필수입니다.", variant: "destructive" });
      return;
    }
    const payload = {
      year: Number(form.year),
      month: Number(form.month),
      category: form.category,
      subCategory: form.subCategory || null,
      itemName: form.itemName,
      specification: form.specification || null,
      unit: form.unit || null,
      quantity: form.quantity ? form.quantity.toString() : null,
      unitPrice: form.unitPrice ? form.unitPrice.toString() : null,
      supplyAmount: form.supplyAmount ? form.supplyAmount.toString() : null,
      vatAmount: form.vatAmount ? form.vatAmount.toString() : null,
      totalAmount: form.totalAmount.toString(),
      purchaseDate: form.purchaseDate || null,
      vendorName: form.vendorName || null,
      notes: form.notes || null,
      quoteFileUrl: form.quoteFileUrl || null,
      transactionFileUrl: form.transactionFileUrl || null,
    };
    if (editRecord) {
      updateMutation.mutate({ id: editRecord.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  }

  // Filter
  const filtered = records.filter(r => {
    if (filterCategory !== "all" && r.category !== filterCategory) return false;
    if (filterMonth !== "all" && r.month !== Number(filterMonth)) return false;
    return true;
  });

  // Summary by category
  const categoryTotals = CATEGORIES.map(cat => {
    const catRecords = records.filter(r => r.category === cat);
    const total = catRecords.reduce((s, r) => s + parseFloat(r.totalAmount?.toString() || "0"), 0);
    const monthly = MONTHS.map((_, i) => {
      const m = i + 1;
      return catRecords.filter(r => r.month === m).reduce((s, r) => s + parseFloat(r.totalAmount?.toString() || "0"), 0);
    });
    return { cat, total, monthly, count: catRecords.length };
  });

  const grandTotal = categoryTotals.reduce((s, c) => s + c.total, 0);
  const monthlyTotals = MONTHS.map((_, i) =>
    records.filter(r => r.month === i + 1).reduce((s, r) => s + parseFloat(r.totalAmount?.toString() || "0"), 0)
  );

  const catIndex = (cat: string) => CATEGORIES.indexOf(cat);

  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">산업안전보건관리비 사용내역</h1>
          <p className="text-sm text-muted-foreground">대구본부 산업안전보건관리비 지출 현황 관리</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear.toString()} onValueChange={v => setSelectedYear(Number(v))}>
            <SelectTrigger className="w-24" data-testid="select-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={openAdd} data-testid="button-add-record">
            <Plus className="w-4 h-4 mr-1" /> 지출 등록
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="col-span-2 md:col-span-1">
          <CardContent className="pt-4 pb-4">
            <div className="text-xs text-muted-foreground">연간 총 지출</div>
            <div className="text-xl font-bold text-primary mt-1">{fmt(grandTotal)}</div>
            <div className="text-xs text-muted-foreground mt-1">총 {records.length}건</div>
          </CardContent>
        </Card>
        {categoryTotals.filter(c => c.total > 0).slice(0, 3).map((c, i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-4">
              <div className="text-xs text-muted-foreground truncate">{c.cat.split(". ")[1]?.split(" ")[0]}</div>
              <div className="text-lg font-semibold mt-1">{fmt(c.total)}</div>
              <div className="text-xs text-muted-foreground">{c.count}건</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="list" data-testid="tab-list"><List className="w-4 h-4 mr-1" />사용내역</TabsTrigger>
          <TabsTrigger value="summary" data-testid="tab-summary"><BarChart3 className="w-4 h-4 mr-1" />항목별 요약</TabsTrigger>
        </TabsList>

        {/* === LIST TAB === */}
        <TabsContent value="list" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-52" data-testid="select-filter-category">
                <SelectValue placeholder="전체 항목" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 항목</SelectItem>
                {CATEGORIES.map(c => (
                  <SelectItem key={c} value={c}>{c.substring(0, 20)}...</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-24" data-testid="select-filter-month">
                <SelectValue placeholder="전체 월" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 월</SelectItem>
                {MONTHS.map((m, i) => (
                  <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {(filterCategory !== "all" || filterMonth !== "all") && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterCategory("all"); setFilterMonth("all"); }}>
                <X className="w-3 h-3 mr-1" /> 초기화
              </Button>
            )}
          </div>

          {isLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>등록된 사용내역이 없습니다.</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={openAdd}>첫 지출 등록</Button>
            </div>
          ) : (
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">월</TableHead>
                    <TableHead>항목</TableHead>
                    <TableHead>품명</TableHead>
                    <TableHead>업체명</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">단가</TableHead>
                    <TableHead className="text-right">공급가액</TableHead>
                    <TableHead className="text-right">세액</TableHead>
                    <TableHead className="text-right">합계(VAT포함)</TableHead>
                    <TableHead className="w-20">첨부</TableHead>
                    <TableHead className="w-16">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(rec => (
                    <TableRow key={rec.id} data-testid={`row-record-${rec.id}`}>
                      <TableCell className="font-medium">{rec.month}월</TableCell>
                      <TableCell>
                        <Badge className={`text-xs ${CATEGORY_COLORS[catIndex(rec.category)] || ""}`} variant="outline">
                          {rec.category.split(". ")[0]}항
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-sm">{rec.itemName}</div>
                        {rec.specification && <div className="text-xs text-muted-foreground truncate max-w-32">{rec.specification}</div>}
                      </TableCell>
                      <TableCell className="text-sm">{rec.vendorName || "-"}</TableCell>
                      <TableCell className="text-right text-sm">{rec.quantity ? `${fmtNum(rec.quantity)}${rec.unit ? " " + rec.unit : ""}` : "-"}</TableCell>
                      <TableCell className="text-right text-sm">{rec.unitPrice ? fmt(rec.unitPrice) : "-"}</TableCell>
                      <TableCell className="text-right text-sm">{rec.supplyAmount ? fmt(rec.supplyAmount) : "-"}</TableCell>
                      <TableCell className="text-right text-sm">{rec.vatAmount ? fmt(rec.vatAmount) : "-"}</TableCell>
                      <TableCell className="text-right font-semibold">{fmt(rec.totalAmount)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {rec.quoteFileUrl && (
                            <button onClick={() => setImagePreview({ url: rec.quoteFileUrl!, title: "견적서" })}
                              className="text-blue-500 hover:text-blue-700" title="견적서 보기" data-testid={`button-view-quote-${rec.id}`}>
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                          {rec.transactionFileUrl && (
                            <button onClick={() => setImagePreview({ url: rec.transactionFileUrl!, title: "거래명세서" })}
                              className="text-green-500 hover:text-green-700" title="거래명세서 보기" data-testid={`button-view-transaction-${rec.id}`}>
                              <FileText className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <button onClick={() => openEdit(rec)} className="text-muted-foreground hover:text-foreground" data-testid={`button-edit-${rec.id}`}>
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => setDeleteConfirmId(rec.id)} className="text-muted-foreground hover:text-red-500" data-testid={`button-delete-${rec.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* === SUMMARY TAB === */}
        <TabsContent value="summary" className="mt-3">
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-48">항목</TableHead>
                  {MONTHS.map(m => <TableHead key={m} className="text-right min-w-20">{m}</TableHead>)}
                  <TableHead className="text-right min-w-28 font-bold">합계</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categoryTotals.map((c, i) => (
                  <TableRow key={i} className={c.total === 0 ? "opacity-40" : ""}>
                    <TableCell>
                      <div className="text-sm font-medium">{c.cat}</div>
                      <div className="text-xs text-muted-foreground">{c.count}건</div>
                    </TableCell>
                    {c.monthly.map((val, mi) => (
                      <TableCell key={mi} className="text-right text-sm">
                        {val > 0 ? <span className="text-foreground">{(val / 10000).toFixed(0)}만</span> : <span className="text-muted-foreground/40">-</span>}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold">{c.total > 0 ? fmt(c.total) : "-"}</TableCell>
                  </TableRow>
                ))}
                <TableRow className="bg-muted/50 font-bold">
                  <TableCell>합계</TableCell>
                  {monthlyTotals.map((val, i) => (
                    <TableCell key={i} className="text-right text-sm">
                      {val > 0 ? fmt(val) : "-"}
                    </TableCell>
                  ))}
                  <TableCell className="text-right text-primary font-bold">{fmt(grandTotal)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>

      {/* === ADD/EDIT DIALOG === */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRecord ? "사용내역 수정" : "사용내역 등록"}</DialogTitle>
          </DialogHeader>

          {/* AI 문서 첨부 */}
          <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
            <div className="text-sm font-semibold flex items-center gap-2">
              <Upload className="w-4 h-4" />
              AI 자동 입력 (견적서 / 거래명세서 첨부)
            </div>
            <div className="grid grid-cols-2 gap-3">
              {/* 견적서 */}
              <div>
                <input ref={quoteInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleExtract("quote", e.target.files[0]); e.target.value = ""; }} />
                <Button variant="outline" size="sm" className="w-full" data-testid="button-upload-quote"
                  disabled={extracting !== null}
                  onClick={() => quoteInputRef.current?.click()}>
                  {extracting === "quote" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-1" />}
                  견적서 첨부
                </Button>
                {form.quoteFileUrl && (
                  <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> 견적서 업로드됨
                  </div>
                )}
              </div>
              {/* 거래명세서 */}
              <div>
                <input ref={transactionInputRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleExtract("transaction", e.target.files[0]); e.target.value = ""; }} />
                <Button variant="outline" size="sm" className="w-full" data-testid="button-upload-transaction"
                  disabled={extracting !== null}
                  onClick={() => transactionInputRef.current?.click()}>
                  {extracting === "transaction" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
                  거래명세서 첨부
                </Button>
                {form.transactionFileUrl && (
                  <div className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <FileText className="w-3 h-3" /> 거래명세서 업로드됨
                  </div>
                )}
              </div>
            </div>

            {/* 다중 항목 선택 */}
            {extractedItems.length > 1 && (
              <div className="space-y-2">
                <div className="text-xs text-muted-foreground">감지된 품목 ({extractedItems.length}개) — 적용할 항목을 선택하세요:</div>
                <div className="flex flex-wrap gap-1">
                  {extractedItems.map((item, i) => (
                    <button key={i}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${selectedItemIdx === i ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted"}`}
                      onClick={() => { setSelectedItemIdx(i); applyItem(item); }}
                      data-testid={`button-select-item-${i}`}>
                      {item.itemName} ({fmtNum(item.quantity)}{item.unit})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 기본 정보 */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>연도 *</Label>
              <Select value={form.year.toString()} onValueChange={v => setField("year", Number(v))}>
                <SelectTrigger data-testid="select-form-year"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                    <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>월 *</Label>
              <Select value={form.month.toString()} onValueChange={v => setField("month", Number(v))}>
                <SelectTrigger data-testid="select-form-month"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>구매일자</Label>
              <Input type="date" value={form.purchaseDate} onChange={e => setField("purchaseDate", e.target.value)}
                data-testid="input-purchase-date" />
            </div>
          </div>

          <div>
            <Label>항목 구분 *</Label>
            <Select value={form.category} onValueChange={v => setField("category", v)}>
              <SelectTrigger data-testid="select-form-category"><SelectValue placeholder="항목을 선택하세요" /></SelectTrigger>
              <SelectContent>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>세부항목</Label>
              <Input placeholder="세부항목 (예: 안전화, 쿨토시 등)" value={form.subCategory}
                onChange={e => setField("subCategory", e.target.value)} data-testid="input-sub-category" />
            </div>
            <div>
              <Label>업체명</Label>
              <Input placeholder="공급업체명" value={form.vendorName}
                onChange={e => setField("vendorName", e.target.value)} data-testid="input-vendor-name" />
            </div>
          </div>

          <div>
            <Label>품명 *</Label>
            <Input placeholder="품명을 입력하세요" value={form.itemName}
              onChange={e => setField("itemName", e.target.value)} data-testid="input-item-name" />
          </div>

          <div>
            <Label>규격</Label>
            <Input placeholder="규격 (예: 70×125mm, 125g...)" value={form.specification}
              onChange={e => setField("specification", e.target.value)} data-testid="input-specification" />
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>단위</Label>
              <Select value={form.unit} onValueChange={v => setField("unit", v)}>
                <SelectTrigger data-testid="select-unit"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["EA","개","식","세트","쌍","묶음","롤","kg","L","m"].map(u => (
                    <SelectItem key={u} value={u}>{u}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>수량</Label>
              <Input type="number" placeholder="0" value={form.quantity}
                onChange={e => autoCalc("quantity", e.target.value)} data-testid="input-quantity" />
            </div>
            <div>
              <Label>단가</Label>
              <Input type="number" placeholder="0" value={form.unitPrice}
                onChange={e => autoCalc("unitPrice", e.target.value)} data-testid="input-unit-price" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>공급가액</Label>
              <Input type="number" placeholder="0" value={form.supplyAmount}
                onChange={e => setField("supplyAmount", e.target.value)} data-testid="input-supply-amount" />
            </div>
            <div>
              <Label>세액</Label>
              <Input type="number" placeholder="0" value={form.vatAmount}
                onChange={e => setField("vatAmount", e.target.value)} data-testid="input-vat-amount" />
            </div>
            <div>
              <Label>합계(VAT포함) *</Label>
              <Input type="number" placeholder="0" value={form.totalAmount}
                onChange={e => setField("totalAmount", e.target.value)} data-testid="input-total-amount"
                className="font-semibold" />
            </div>
          </div>

          <div>
            <Label>비고</Label>
            <Textarea placeholder="비고 사항" value={form.notes} rows={2}
              onChange={e => setField("notes", e.target.value)} data-testid="input-notes" />
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-record">
              {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editRecord ? "수정 저장" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 다이얼로그 */}
      <Dialog open={deleteConfirmId !== null} onOpenChange={() => setDeleteConfirmId(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>삭제 확인</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">이 사용내역을 삭제하시겠습니까? 삭제 후 복구할 수 없습니다.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmId(null)}>취소</Button>
            <Button variant="destructive" onClick={() => deleteConfirmId && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending} data-testid="button-confirm-delete">
              {deleteMutation.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 첨부파일 미리보기 */}
      {imagePreview && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setImagePreview(null)}>
          <div className="bg-background rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-4 border-b">
              <span className="font-semibold">{imagePreview.title}</span>
              <button onClick={() => setImagePreview(null)} data-testid="button-close-preview">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4">
              {imagePreview.url.toLowerCase().endsWith(".pdf") || imagePreview.url.includes("pdf") ? (
                <iframe src={imagePreview.url} className="w-full h-[70vh]" title={imagePreview.title} />
              ) : (
                <img src={imagePreview.url} alt={imagePreview.title} className="w-full object-contain" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
