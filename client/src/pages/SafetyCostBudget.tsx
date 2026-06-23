import { useState, useRef } from "react";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
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
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, Edit2, Upload, FileText, ImageIcon, Loader2,
  BarChart3, List, X, Download, Receipt, FileCheck, PackagePlus, CheckSquare, FileScan, ScrollText, Wallet
} from "lucide-react";
import type { SafetyCostRecord, SafetyCostTaxInvoice } from "@shared/schema";

// ── 상수 ────────────────────────────────────────────────────────────
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
const CAT_COLORS = [
  { bar: "bg-blue-500", badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300" },
  { bar: "bg-emerald-500", badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300" },
  { bar: "bg-amber-500", badge: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300" },
  { bar: "bg-violet-500", badge: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-900/30 dark:text-violet-300" },
  { bar: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300" },
  { bar: "bg-pink-500", badge: "bg-pink-50 text-pink-700 border-pink-200 dark:bg-pink-900/30 dark:text-pink-300" },
  { bar: "bg-teal-500", badge: "bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-300" },
  { bar: "bg-rose-500", badge: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300" },
  { bar: "bg-indigo-500", badge: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300" },
];
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const currentYear = new Date().getFullYear();

// ── 포맷 헬퍼 ───────────────────────────────────────────────────────
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
function fmtMan(n: number) {
  if (n === 0) return "-";
  if (n >= 100000000) return `${(n / 100000000).toFixed(1)}억`;
  if (n >= 10000) return `${Math.round(n / 10000).toLocaleString("ko-KR")}만`;
  return n.toLocaleString("ko-KR");
}
function toNum(v: any): number { return v ? parseFloat(v.toString()) || 0 : 0; }

// ── 빈 폼 ──────────────────────────────────────────────────────────
const emptyForm = {
  year: currentYear, month: new Date().getMonth() + 1,
  category: "", subCategory: "", itemName: "", specification: "",
  unit: "EA", quantity: "", unitPrice: "", supplyAmount: "", vatAmount: "",
  totalAmount: "", purchaseDate: "", vendorName: "", notes: "",
  documentNumber: "", paymentRequestDate: "",
  quoteFileUrl: "", transactionFileUrl: "", certificateFileUrl: "", resolutionFileUrl: "",
};

interface ExtractedItem {
  itemName?: string; specification?: string; unit?: string;
  quantity?: number; unitPrice?: number; supplyAmount?: number; vatAmount?: number; totalAmount?: number;
}
interface ExtractedData {
  vendorName?: string; documentDate?: string; totalAmount?: number; items?: ExtractedItem[];
  _fileUrl?: string;
}

// 일괄 등록 품목 행
interface BulkItemRow extends ExtractedItem {
  checked: boolean;
}
// 일괄 등록 공통 필드
interface BulkCommon {
  year: number; month: number; category: string; subCategory: string;
  purchaseDate: string; vendorName: string; documentNumber: string; paymentRequestDate: string;
  quoteFileUrl: string; transactionFileUrl: string;
}
// 다중 결의서 일괄 업로드 행
interface MultiResRow {
  id: string;
  file: File;
  status: "pending" | "processing" | "done" | "error";
  error?: string;
  checked: boolean;
  documentType?: string;
  documentNumber?: string;
  paymentRequestDate?: string;
  purchaseDate?: string;
  vendorName?: string;
  itemName?: string;
  totalAmount?: string;
  supplyAmount?: string;
  vatAmount?: string;
  category?: string;
  fileUrl?: string;
  quoteFileUrl?: string;
  transactionFileUrl?: string;
  quoteUploading?: boolean;
  transactionUploading?: boolean;
  year: number;
  month: number;
  subCategory?: string;
  quantity?: string;
  unit?: string;
  unitPrice?: string;
  notes?: string;
}

// ══════════════════════════════════════════════════════════════════
export default function SafetyCostBudget() {
  const { headquarters } = useHeadquarters();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [year, setYear] = useState(currentYear);
  const [activeTab, setActiveTab] = useState<"list" | "summary" | "tax">("list");
  const [filterCat, setFilterCat] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");

  // 사용내역 다이얼로그
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editRec, setEditRec] = useState<SafetyCostRecord | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [vatExcluded, setVatExcluded] = useState(true);
  const [extracting, setExtracting] = useState<"quote"|"transaction"|null>(null);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [selItemIdx, setSelItemIdx] = useState(0);

  // 일괄 등록 다이얼로그
  const [bulkDlgOpen, setBulkDlgOpen] = useState(false);
  const [bulkCommon, setBulkCommon] = useState<BulkCommon>({
    year: currentYear, month: new Date().getMonth() + 1,
    category: "", subCategory: "", purchaseDate: "", vendorName: "",
    documentNumber: "", paymentRequestDate: "",
    quoteFileUrl: "", transactionFileUrl: "",
  });
  const [resolutionExtracting, setResolutionExtracting] = useState(false);
  const [bulkItems, setBulkItems] = useState<BulkItemRow[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // 다중 결의서 일괄 업로드 다이얼로그
  const [multiResDlgOpen, setMultiResDlgOpen] = useState(false);
  const [multiResRows, setMultiResRows] = useState<MultiResRow[]>([]);
  const [multiResSaving, setMultiResSaving] = useState(false);
  const [multiResQuoteUrl, setMultiResQuoteUrl] = useState<string>("");
  const [multiResQuoteUploading, setMultiResQuoteUploading] = useState(false);
  const [multiResGlobalYear, setMultiResGlobalYear] = useState(currentYear);

  // 사용내역 행 선택
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkTransUploading, setBulkTransUploading] = useState(false);

  // 예산 다이얼로그
  const [budgetDlgOpen, setBudgetDlgOpen] = useState(false);
  const [budgetHalf, setBudgetHalf] = useState<"h1"|"h2">("h1");
  const [budgetInput, setBudgetInput] = useState<{ h1: Record<string, string>; h2: Record<string, string> }>({ h1: {}, h2: {} });

  // 개별 세금계산서 다이얼로그 (레코드별)
  const [recTaxDlg, setRecTaxDlg] = useState<SafetyCostRecord | null>(null);
  const [recTaxYear, setRecTaxYear] = useState(currentYear);
  const [recTaxMonth, setRecTaxMonth] = useState(1);
  const [recTaxFile, setRecTaxFile] = useState<File | null>(null);
  const [recTaxUploading, setRecTaxUploading] = useState(false);
  const [recTaxSaving, setRecTaxSaving] = useState(false);

  // ── 세금계산서 탭 state ────────────────────────────────────────────
  const [taxDlgOpen, setTaxDlgOpen] = useState(false);
  const [editTax, setEditTax] = useState<SafetyCostTaxInvoice | null>(null);
  const [taxForm, setTaxForm] = useState({
    year: currentYear, month: new Date().getMonth() + 1,
    vendorName: "", supplyAmount: "", vatAmount: "", totalAmount: "",
    notes: "", fileUrl: "",
  });
  const [taxFile, setTaxFile] = useState<File | null>(null);
  const [taxFileUploading, setTaxFileUploading] = useState(false);
  const [taxExtracting, setTaxExtracting] = useState(false);
  const [taxDelConfirm, setTaxDelConfirm] = useState<{ id: number } | null>(null);
  const taxFileRef = useRef<HTMLInputElement>(null);

  // 첨부파일 미리보기
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [delConfirm, setDelConfirm] = useState<{ id: number } | null>(null);
  const [bulkDelConfirm, setBulkDelConfirm] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportStartYear, setExportStartYear] = useState(currentYear);
  const [exportStartMonth, setExportStartMonth] = useState(1);
  const [exportEndYear, setExportEndYear] = useState(currentYear);
  const [exportEndMonth, setExportEndMonth] = useState(new Date().getMonth() + 1);
  const [certUploading, setCertUploading] = useState(false);

  const quoteRef = useRef<HTMLInputElement>(null);
  const transRef = useRef<HTMLInputElement>(null);
  const recTaxFileRef = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);
  const resolutionRef = useRef<HTMLInputElement>(null);
  const multiResRef = useRef<HTMLInputElement>(null);
  const multiResQuoteRef = useRef<HTMLInputElement>(null);
  const bulkTransRef = useRef<HTMLInputElement>(null);

  // ── Queries ──────────────────────────────────────────────────────
  const { data: records = [], isLoading } = useQuery<SafetyCostRecord[]>({
    queryKey: ["/api/safety-cost-records", year, headquarters],
    queryFn: () => fetch(`/api/safety-cost-records?year=${year}&headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
  });
  const { data: budgets = {} } = useQuery<Record<string, number>>({
    queryKey: ["/api/safety-cost-budget", year],
    queryFn: () => fetch(`/api/safety-cost-budget?year=${year}`, { credentials: "include" }).then(r => r.json()),
  });
  const { data: budgetDetail = { h1: {}, h2: {} } } = useQuery<{ h1: Record<string, number>; h2: Record<string, number> }>({
    queryKey: ["/api/safety-cost-budget-detail", year],
    queryFn: () => fetch(`/api/safety-cost-budget-detail?year=${year}`, { credentials: "include" }).then(r => r.json()),
  });

  // ── Mutations ────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/safety-cost-records", { ...d, headquarters }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-records"] }); toast({ title: "저장 완료" }); closeDlg(); },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });
  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PUT", `/api/safety-cost-records/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-records"] }); toast({ title: "수정 완료" }); closeDlg(); },
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });
  const deleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-cost-records/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-records"] }); toast({ title: "삭제 완료" }); setDelConfirm(null); },
  });
  const updateRecTaxMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PUT", `/api/safety-cost-records/${id}`, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/safety-cost-records"] });
      toast({ title: "개별 세금계산서 저장 완료" });
      setRecTaxDlg(null);
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });
  const bulkDeleteMut = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/safety-cost-records/bulk-delete", { ids }),
    onSuccess: (_: any, ids: number[]) => {
      qc.invalidateQueries({ queryKey: ["/api/safety-cost-records"] });
      toast({ title: `${ids.length}건 일괄 삭제 완료` });
      setSelectedIds(new Set());
      setBulkDelConfirm(false);
    },
    onError: (e: any) => toast({ title: "일괄 삭제 실패", description: e.message, variant: "destructive" }),
  });
  const saveBudgetMut = useMutation({
    mutationFn: (b: { h1: Record<string, number>; h2: Record<string, number> }) =>
      apiRequest("PUT", "/api/safety-cost-budget", { year, h1: b.h1, h2: b.h2 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/safety-cost-budget"] });
      qc.invalidateQueries({ queryKey: ["/api/safety-cost-budget-detail"] });
      toast({ title: "예산 저장 완료" });
      setBudgetDlgOpen(false);
    },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });

  // ── 세금계산서 Query/Mutation ─────────────────────────────────────
  const { data: taxInvoices = [] } = useQuery<SafetyCostTaxInvoice[]>({
    queryKey: ["/api/safety-cost-tax-invoices", year, headquarters],
    queryFn: () => fetch(`/api/safety-cost-tax-invoices?year=${year}&headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
  });
  const taxCreateMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/safety-cost-tax-invoices", { ...d, headquarters }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-tax-invoices"] }); toast({ title: "저장 완료" }); closeTaxDlg(); },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });
  const taxUpdateMut = useMutation({
    mutationFn: ({ id, d }: { id: number; d: any }) => apiRequest("PUT", `/api/safety-cost-tax-invoices/${id}`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-tax-invoices"] }); toast({ title: "수정 완료" }); closeTaxDlg(); },
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });
  const taxDeleteMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-cost-tax-invoices/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-tax-invoices"] }); toast({ title: "삭제 완료" }); setTaxDelConfirm(null); },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  // ── 단일 등록 다이얼로그 헬퍼 ─────────────────────────────────────
  function openAdd() { setEditRec(null); setForm({ ...emptyForm, year }); setVatExcluded(true); setExtractedItems([]); setDlgOpen(true); }
  function openEdit(r: SafetyCostRecord) {
    setEditRec(r);
    const excluded = r.vatAmount !== null && r.vatAmount !== undefined && Number(r.vatAmount) === 0;
    setVatExcluded(excluded);
    setForm({ year: r.year, month: r.month, category: r.category, subCategory: r.subCategory||"", itemName: r.itemName,
      specification: r.specification||"", unit: r.unit||"EA", quantity: r.quantity?.toString()||"",
      unitPrice: r.unitPrice?.toString()||"", supplyAmount: r.supplyAmount?.toString()||"",
      vatAmount: r.vatAmount?.toString()||"", totalAmount: r.totalAmount?.toString()||"",
      purchaseDate: r.purchaseDate||"", vendorName: r.vendorName||"", notes: r.notes||"",
      documentNumber: (r as any).documentNumber||"", paymentRequestDate: (r as any).paymentRequestDate||"",
      quoteFileUrl: r.quoteFileUrl||"", transactionFileUrl: r.transactionFileUrl||"",
      certificateFileUrl: r.certificateFileUrl||"", resolutionFileUrl: (r as any).resolutionFileUrl||"" });
    setExtractedItems([]); setDlgOpen(true);
  }
  function closeDlg() { setDlgOpen(false); setEditRec(null); setExtractedItems([]); setVatExcluded(true); }
  function setF(k: string, v: any) { setForm(p => ({ ...p, [k]: v })); }
  function autoCalc(k: string, v: string) {
    const up = { ...form, [k]: v };
    const q = parseFloat(up.quantity||"0"), u = parseFloat(up.unitPrice||"0");
    if ((k==="quantity"||k==="unitPrice") && !isNaN(q) && !isNaN(u) && q>0 && u>0) {
      const supply = q*u;
      const vat = vatExcluded ? 0 : Math.round(supply*0.1);
      up.supplyAmount = supply.toString(); up.vatAmount = vat.toString(); up.totalAmount = (supply+vat).toString();
    }
    setForm(up);
  }
  function toggleVatExcluded(checked: boolean) {
    setVatExcluded(checked);
    const supply = parseFloat(form.supplyAmount||"0");
    if (checked) {
      setForm(p => ({ ...p, vatAmount: "0", totalAmount: supply > 0 ? supply.toString() : p.totalAmount }));
    } else {
      const vat = supply > 0 ? Math.round(supply*0.1) : 0;
      setForm(p => ({ ...p, vatAmount: vat > 0 ? vat.toString() : "", totalAmount: supply > 0 ? (supply+vat).toString() : p.totalAmount }));
    }
  }
  function applyItem(item: ExtractedItem) {
    setForm(p => ({ ...p,
      itemName: item.itemName||p.itemName, specification: item.specification||p.specification,
      unit: item.unit||p.unit, quantity: item.quantity?.toString()||p.quantity,
      unitPrice: item.unitPrice?.toString()||p.unitPrice, supplyAmount: item.supplyAmount?.toString()||p.supplyAmount,
      vatAmount: item.vatAmount?.toString()||p.vatAmount, totalAmount: item.totalAmount?.toString()||p.totalAmount,
    }));
  }

  // ── 일괄 등록 헬퍼 ───────────────────────────────────────────────
  function openBulkDlg(data: ExtractedData & { documentNumber?: string; paymentRequestDate?: string }) {
    const items: BulkItemRow[] = (data.items || []).map(it => ({ ...it, checked: true }));
    setBulkItems(items);
    setBulkCommon({
      year, month: new Date().getMonth() + 1,
      category: "", subCategory: "",
      purchaseDate: data.documentDate || "",
      vendorName: data.vendorName || "",
      documentNumber: data.documentNumber || "",
      paymentRequestDate: data.paymentRequestDate || "",
      quoteFileUrl: data._fileUrl || "",
      transactionFileUrl: "",
    });
    setBulkDlgOpen(true);
  }
  function closeBulkDlg() { setBulkDlgOpen(false); setBulkItems([]); }
  function setBC(k: keyof BulkCommon, v: any) { setBulkCommon(p => ({ ...p, [k]: v })); }
  function setBulkItem(idx: number, k: keyof BulkItemRow, v: any) {
    setBulkItems(p => p.map((it, i) => i === idx ? { ...it, [k]: v } : it));
  }
  function bulkAutoCalc(idx: number, k: "quantity"|"unitPrice", v: string) {
    setBulkItems(p => p.map((it, i) => {
      if (i !== idx) return it;
      const up = { ...it, [k]: v === "" ? undefined : Number(v) };
      const q = Number(up.quantity || 0), u = Number(up.unitPrice || 0);
      if (q > 0 && u > 0) {
        const supply = q * u, vat = Math.round(supply * 0.1);
        return { ...up, supplyAmount: supply, vatAmount: vat, totalAmount: supply + vat };
      }
      return up;
    }));
  }

  async function handleBulkSubmit() {
    if (!bulkCommon.category) {
      toast({ title: "항목 구분 선택 필요", description: "공통 항목 구분을 선택하세요.", variant: "destructive" });
      return;
    }
    const selected = bulkItems.filter(it => it.checked && it.totalAmount);
    if (selected.length === 0) {
      toast({ title: "등록할 품목 없음", description: "체크된 품목이 없거나 합계금액이 없습니다.", variant: "destructive" });
      return;
    }
    setBulkSaving(true);
    let success = 0, fail = 0;
    const toStr = (v: any) => (v !== null && v !== undefined && v !== "") ? String(v) : null;
    for (const it of selected) {
      try {
        await apiRequest("POST", "/api/safety-cost-records", {
          headquarters,
          year: Number(bulkCommon.year), month: Number(bulkCommon.month),
          category: bulkCommon.category, subCategory: bulkCommon.subCategory || null,
          itemName: it.itemName || "품명 미상",
          specification: it.specification || null, unit: it.unit || null,
          quantity: toStr(it.quantity), unitPrice: toStr(it.unitPrice),
          supplyAmount: toStr(it.supplyAmount), vatAmount: toStr(it.vatAmount),
          totalAmount: toStr(it.totalAmount) ?? "0",
          purchaseDate: bulkCommon.purchaseDate || null,
          vendorName: bulkCommon.vendorName || null,
          notes: null,
          documentNumber: bulkCommon.documentNumber || null,
          paymentRequestDate: bulkCommon.paymentRequestDate || null,
          quoteFileUrl: bulkCommon.quoteFileUrl || null,
          transactionFileUrl: bulkCommon.transactionFileUrl || null,
        });
        success++;
      } catch (e: any) {
        console.error("[bulk-create] 품목 등록 실패:", it.itemName, e);
        fail++;
      }
    }
    setBulkSaving(false);
    qc.invalidateQueries({ queryKey: ["/api/safety-cost-records"] });
    if (fail === 0) {
      toast({ title: `${success}개 품목 일괄 등록 완료 ✓` });
      closeBulkDlg();
      setDlgOpen(false);
    } else {
      toast({ title: `${success}개 등록 성공, ${fail}개 실패`, variant: "destructive" });
    }
  }

  // ── 수료증 업로드 ─────────────────────────────────────────────────
  async function handleCertUpload(file: File) {
    setCertUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/upload/general", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) throw new Error("업로드 실패");
      const d = await r.json();
      const url = d.url || d.fileUrl || d.imageUrl || "";
      setF("certificateFileUrl", url);
      toast({ title: "수료증 업로드 완료" });
    } catch (e: any) {
      toast({ title: "업로드 실패", description: e.message, variant: "destructive" });
    } finally { setCertUploading(false); }
  }

  // ── 결의서(구매/지출) PDF AI 추출 ──────────────────────────────────
  async function handleExtractResolution(file: File) {
    setResolutionExtracting(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch("/api/safety-cost-records/extract-resolution", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) { const e = await r.json().catch(() => ({ message: "분석 실패" })); throw new Error(e.message); }
      const data = await r.json();

      let changed: string[] = [];
      if (data.documentNumber) { setF("documentNumber", data.documentNumber); changed.push("품의번호"); }
      if (data.paymentRequestDate) { setF("paymentRequestDate", data.paymentRequestDate); changed.push("지급요청일자"); }
      if (data.documentDate && !form.purchaseDate) { setF("purchaseDate", data.documentDate); changed.push("구매일자"); }
      if (data.vendorName && !form.vendorName) { setF("vendorName", data.vendorName); changed.push("업체명"); }
      if (data.supplyAmount && !form.supplyAmount) { setF("supplyAmount", data.supplyAmount.toString()); }
      if (data.vatAmount && !form.vatAmount) { setF("vatAmount", data.vatAmount.toString()); }
      if (data.totalAmount && !form.totalAmount) { setF("totalAmount", data.totalAmount.toString()); changed.push("합계금액"); }

      // 문서 유형에 따라 항목구분 자동 설정
      const docType: string = data.documentType || data.documentNumber || "";
      if (docType.includes("지출결의서")) {
        setF("category", "1. 안전관리자 등 인건비 및 각종 업무수당 등");
        changed.push("항목구분(인건비)");
      } else if (docType.includes("구매결의서") || docType.includes("기안서")) {
        setF("category", "3. 개인보호구 및 안전장구 구입비 등");
        changed.push("항목구분(보호구)");
      }

      if (data._fileUrl) setF("resolutionFileUrl", data._fileUrl);

      if (data.items && data.items.length > 0) {
        setExtractedItems(data.items);
        setSelItemIdx(0);
        applyItem(data.items[0]);
      }

      toast({
        title: "결의서 분석 완료",
        description: changed.length > 0 ? `${changed.join(", ")} 자동 입력됨` : "내용을 확인하세요.",
      });
    } catch (e: any) {
      toast({ title: "결의서 분석 실패", description: e.message, variant: "destructive" });
    } finally { setResolutionExtracting(false); }
  }

  // ── 다중 결의서 일괄 업로드 ───────────────────────────────────────
  function openMultiResDlg() { setMultiResRows([]); setMultiResGlobalYear(currentYear); setMultiResDlgOpen(true); }
  function closeMultiResDlg() { setMultiResDlgOpen(false); setMultiResRows([]); setMultiResQuoteUrl(""); setMultiResGlobalYear(currentYear); }

  function applyGlobalYearToAll(y: number) {
    setMultiResGlobalYear(y);
    setMultiResRows(p => p.map(r => ({ ...r, year: y })));
  }
  function updateMultiResRow(id: string, updates: Partial<MultiResRow>) {
    setMultiResRows(p => p.map(r => r.id === id ? { ...r, ...updates } : r));
  }

  function applyNoVatToChecked() {
    setMultiResRows(p => p.map(r => {
      if (!r.checked || r.status !== "done") return r;
      const supply = parseFloat(r.supplyAmount || "0") || 0;
      const total  = parseFloat(r.totalAmount  || "0") || 0;
      // 세액제외: 공급가액이 있으면 그것이 실제 금액, 없으면 합계에서 VAT 역산
      const baseAmount = supply > 0 ? supply : (total > 0 ? Math.round(total / 1.1) : total);
      return {
        ...r,
        supplyAmount: baseAmount.toString(),
        vatAmount:    "0",
        totalAmount:  baseAmount.toString(),   // 세액 0이므로 합계 = 공급가액
      };
    }));
  }

  async function handleMultiResFilesSelected(files: FileList | null) {
    if (!files || files.length === 0) return;
    const newRows: MultiResRow[] = Array.from(files).map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      status: "pending",
      checked: true,
      year: multiResGlobalYear,
      month: new Date().getMonth() + 1,
    }));
    setMultiResRows(p => [...p, ...newRows]);
    // 바로 분석 시작
    let totalItemCount = 0;
    for (const row of newRows) {
      setMultiResRows(p => p.map(r => r.id === row.id ? { ...r, status: "processing" } : r));
      try {
        const fd = new FormData(); fd.append("file", row.file);
        const resp = await fetch("/api/safety-cost-records/extract-resolution", { method: "POST", body: fd, credentials: "include" });
        if (!resp.ok) throw new Error("분석 실패");
        const data = await resp.json();
        const docType: string = data.documentType || data.documentNumber || "";
        let autoCategory = "";
        if (docType.includes("지출결의서")) autoCategory = "1. 안전관리자 등 인건비 및 각종 업무수당 등";
        else if (docType.includes("구매결의서") || docType.includes("기안서")) autoCategory = "3. 개인보호구 및 안전장구 구입비 등";

        const items: any[] = data.items && data.items.length > 0 ? data.items : [{}];
        const commonFields = {
          documentType: data.documentType || "",
          documentNumber: data.documentNumber || "",
          paymentRequestDate: data.paymentRequestDate || "",
          purchaseDate: data.documentDate || "",
          vendorName: data.vendorName || "",
          category: autoCategory,
          fileUrl: data._fileUrl || "",
          year: row.year,
          month: row.month,
        };

        if (items.length === 1) {
          // 단일 품목 → 기존 행 업데이트
          const it = items[0];
          setMultiResRows(p => p.map(r => r.id === row.id ? {
            ...r, ...commonFields, status: "done",
            itemName: it.itemName || "",
            totalAmount: (it.totalAmount ?? data.totalAmount ?? "").toString(),
            supplyAmount: (it.supplyAmount ?? data.supplyAmount ?? "").toString(),
            vatAmount: (it.vatAmount ?? data.vatAmount ?? "").toString(),
            quantity: it.quantity?.toString() || "",
            unit: it.unit || "",
            unitPrice: it.unitPrice?.toString() || "",
          } : r));
          totalItemCount += 1;
        } else {
          // 다중 품목 → 첫 번째 행을 첫 품목으로 교체, 나머지는 새 행으로 추가
          const expandedRows: MultiResRow[] = items.map((it, idx) => ({
            id: idx === 0 ? row.id : `${Date.now()}-${Math.random().toString(36).slice(2)}-${idx}`,
            file: row.file,
            status: "done" as const,
            checked: true,
            ...commonFields,
            itemName: it.itemName || "",
            totalAmount: (it.totalAmount ?? "").toString(),
            supplyAmount: (it.supplyAmount ?? "").toString(),
            vatAmount: (it.vatAmount ?? "").toString(),
            quantity: it.quantity?.toString() || "",
            unit: it.unit || "",
            unitPrice: it.unitPrice?.toString() || "",
          }));
          setMultiResRows(p => {
            // 원래 pending 행을 제거하고 확장된 행들로 교체
            const without = p.filter(r => r.id !== row.id);
            return [...without, ...expandedRows];
          });
          totalItemCount += items.length;
        }
      } catch (e: any) {
        setMultiResRows(p => p.map(r => r.id === row.id ? { ...r, status: "error", error: e.message } : r));
      }
    }
    toast({ title: `${newRows.length}개 파일 분석 완료`, description: `총 ${totalItemCount}개 품목 추출됨` });
  }

  async function submitMultiResRows() {
    const selected = multiResRows.filter(r => r.checked && r.status === "done");
    if (selected.length === 0) {
      toast({ title: "등록할 항목 없음", description: "체크된 분석 완료 항목이 없습니다.", variant: "destructive" });
      return;
    }
    setMultiResSaving(true);
    let success = 0, fail = 0;
    for (const r of selected) {
      try {
        await apiRequest("POST", "/api/safety-cost-records", {
          headquarters,
          year: Number(r.year), month: Number(r.month),
          category: r.category || null,
          subCategory: r.subCategory || null,
          itemName: r.itemName || "품명 미상",
          specification: null,
          unit: r.unit || null,
          quantity: r.quantity || null,
          unitPrice: r.unitPrice || null,
          supplyAmount: r.supplyAmount || null,
          vatAmount: r.vatAmount || null,
          totalAmount: r.totalAmount || "0",
          purchaseDate: r.purchaseDate || null,
          vendorName: r.vendorName || null,
          notes: r.notes || null,
          documentNumber: r.documentNumber || null,
          paymentRequestDate: r.paymentRequestDate || null,
          resolutionFileUrl: r.fileUrl || null,
          quoteFileUrl: multiResQuoteUrl || null,
          transactionFileUrl: null,
        });
        success++;
      } catch { fail++; }
    }
    setMultiResSaving(false);
    qc.invalidateQueries({ queryKey: ["/api/safety-cost-records"] });
    if (fail === 0) {
      toast({ title: `${success}건 일괄 등록 완료 ✓` });
      closeMultiResDlg();
    } else {
      toast({ title: `${success}건 성공, ${fail}건 실패`, variant: "destructive" });
    }
  }

  async function uploadSharedQuote(file: File) {
    setMultiResQuoteUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "quote");
      const resp = await fetch("/api/safety-cost-records/upload-file", { method: "POST", body: fd, credentials: "include" });
      if (!resp.ok) throw new Error("업로드 실패");
      const data = await resp.json();
      setMultiResQuoteUrl(data.url);
    } catch {
      toast({ title: "견적서 업로드 실패", variant: "destructive" });
    } finally {
      setMultiResQuoteUploading(false);
    }
  }

  async function uploadBulkTransaction(file: File) {
    if (selectedIds.size === 0) return;
    setBulkTransUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("type", "transaction");
      const upResp = await fetch("/api/safety-cost-records/upload-file", { method: "POST", body: fd, credentials: "include" });
      if (!upResp.ok) throw new Error("업로드 실패");
      const { url } = await upResp.json();
      await apiRequest("PATCH", "/api/safety-cost-records/bulk-transaction", {
        ids: Array.from(selectedIds),
        transactionFileUrl: url,
      });
      qc.invalidateQueries({ queryKey: ["/api/safety-cost-records"] });
      toast({ title: `${selectedIds.size}건 거래명세서 첨부 완료 ✓` });
      setSelectedIds(new Set());
    } catch {
      toast({ title: "거래명세서 일괄 첨부 실패", variant: "destructive" });
    } finally {
      setBulkTransUploading(false);
    }
  }

  // ── 개별 세금계산서 헬퍼 ────────────────────────────────────────────
  function openRecTaxDlg(rec: SafetyCostRecord) {
    setRecTaxDlg(rec);
    setRecTaxYear(rec.taxInvoiceYear ?? rec.year);
    setRecTaxMonth(rec.taxInvoiceMonth ?? rec.month);
    setRecTaxFile(null);
  }
  async function saveRecTax() {
    if (!recTaxDlg) return;
    setRecTaxSaving(true);
    try {
      let fileUrl = recTaxDlg.taxInvoiceFileUrl ?? null;
      if (recTaxFile) {
        setRecTaxUploading(true);
        const fd = new FormData();
        fd.append("file", recTaxFile);
        fd.append("type", "tax");
        const r = await fetch("/api/safety-cost-records/upload-file", { method: "POST", body: fd, credentials: "include" });
        if (!r.ok) throw new Error("파일 업로드 실패");
        const data = await r.json();
        fileUrl = data.url;
        setRecTaxUploading(false);
      }
      await updateRecTaxMut.mutateAsync({
        id: recTaxDlg.id,
        d: { taxInvoiceYear: recTaxYear, taxInvoiceMonth: recTaxMonth, taxInvoiceFileUrl: fileUrl },
      });
    } catch (e: any) {
      toast({ title: "저장 실패", description: e.message, variant: "destructive" });
    } finally {
      setRecTaxSaving(false);
      setRecTaxUploading(false);
    }
  }
  async function clearRecTax(rec: SafetyCostRecord) {
    await updateRecTaxMut.mutateAsync({
      id: rec.id,
      d: { taxInvoiceYear: null, taxInvoiceMonth: null, taxInvoiceFileUrl: null },
    });
  }

  // ── 세금계산서 탭 헬퍼 ───────────────────────────────────────────
  function openTaxAdd() {
    setEditTax(null);
    setTaxForm({ year, month: new Date().getMonth() + 1, vendorName: "", supplyAmount: "", vatAmount: "", totalAmount: "", notes: "", fileUrl: "" });
    setTaxFile(null);
    setTaxDlgOpen(true);
  }
  function openTaxEdit(t: SafetyCostTaxInvoice) {
    setEditTax(t);
    setTaxForm({ year: t.year, month: t.month, vendorName: t.vendorName || "", supplyAmount: t.supplyAmount?.toString() || "", vatAmount: t.vatAmount?.toString() || "", totalAmount: t.totalAmount?.toString() || "", notes: t.notes || "", fileUrl: t.fileUrl || "" });
    setTaxFile(null);
    setTaxDlgOpen(true);
  }
  function closeTaxDlg() { setTaxDlgOpen(false); setEditTax(null); setTaxFile(null); }
  function setTaxF(k: string, v: any) { setTaxForm(p => ({ ...p, [k]: v })); }
  function autoCalcTax(k: string, v: string) {
    const up = { ...taxForm, [k]: v };
    const s = parseFloat(up.supplyAmount || "0");
    if (k === "supplyAmount" && !isNaN(s) && s > 0) {
      const vat = Math.round(s * 0.1);
      up.vatAmount = vat.toString();
      up.totalAmount = (s + vat).toString();
    }
    setTaxForm(up);
  }
  async function saveTax() {
    let fileUrl = taxForm.fileUrl;
    if (taxFile) {
      setTaxFileUploading(true);
      try {
        const fd = new FormData();
        fd.append("file", taxFile);
        const r = await fetch("/api/safety-cost-records/upload-file", { method: "POST", body: fd, credentials: "include" });
        if (!r.ok) throw new Error("파일 업로드 실패");
        const data = await r.json();
        fileUrl = data.url;
      } finally {
        setTaxFileUploading(false);
      }
    }
    const payload = { ...taxForm, supplyAmount: toNum(taxForm.supplyAmount), vatAmount: toNum(taxForm.vatAmount), totalAmount: toNum(taxForm.totalAmount), fileUrl };
    if (editTax) {
      taxUpdateMut.mutate({ id: editTax.id, d: payload });
    } else {
      taxCreateMut.mutate(payload);
    }
  }
  async function handleTaxExtract(file: File) {
    setTaxExtracting(true);
    setTaxFile(file);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/safety-cost-tax-invoices/extract", { method: "POST", body: fd, credentials: "include" });
      if (!r.ok) {
        const errText = await r.text();
        let errMsg = "추출 실패";
        try { errMsg = JSON.parse(errText).message || errMsg; } catch { errMsg = errText || errMsg; }
        throw new Error(errMsg);
      }
      const data = await r.json();
      // 자동 입력
      setTaxForm(p => ({
        ...p,
        vendorName: data.vendorName || p.vendorName,
        supplyAmount: data.supplyAmount != null ? String(data.supplyAmount) : p.supplyAmount,
        vatAmount: data.vatAmount != null ? String(data.vatAmount) : p.vatAmount,
        totalAmount: data.totalAmount != null ? String(data.totalAmount) : p.totalAmount,
        // 발행일이 있으면 연/월 자동 설정
        ...(data.issueDate ? (() => {
          const d = new Date(data.issueDate);
          if (!isNaN(d.getTime())) return { year: d.getFullYear(), month: d.getMonth() + 1 };
          return {};
        })() : {}),
        // 추출 API에서 파일 URL 반환 시 바로 적용
        fileUrl: data._fileUrl || p.fileUrl,
      }));
      // 파일 URL을 서버에서 받았으면 로컬 File 객체 제거 (중복 업로드 방지)
      if (data._fileUrl) setTaxFile(null);
      toast({ title: "AI 자동입력 완료", description: "내용을 확인 후 저장하세요." });
    } catch (e: any) {
      toast({ title: "AI 추출 실패", description: e.message, variant: "destructive" });
    } finally {
      setTaxExtracting(false);
    }
  }

  // ── AI 추출 ───────────────────────────────────────────────────────
  async function handleExtract(docType: "quote"|"transaction", file: File) {
    setExtracting(docType);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(`/api/safety-cost-records/extract?docType=${docType}`, { method:"POST", body:fd, credentials:"include" });
      if (!r.ok) {
        const errText = await r.text();
        let errMsg = "추출 실패";
        try { errMsg = JSON.parse(errText).message || errMsg; } catch { errMsg = errText || errMsg; }
        throw new Error(errMsg);
      }
      const data: ExtractedData = await r.json();
      if (data.vendorName) setF("vendorName", data.vendorName);
      if (data.documentDate) setF("purchaseDate", data.documentDate);

      // 파일 URL 적용
      if (data._fileUrl) {
        if (docType==="quote") setF("quoteFileUrl", data._fileUrl);
        else setF("transactionFileUrl", data._fileUrl);
      } else {
        const uFd = new FormData(); uFd.append("file", file);
        const ur = await fetch("/api/upload/general", { method:"POST", body:uFd, credentials:"include" });
        if (ur.ok) {
          const ud = await ur.json();
          const url = ud.fileUrl||ud.imageUrl||ud.url||"";
          data._fileUrl = url;
          if (docType==="quote") setF("quoteFileUrl", url); else setF("transactionFileUrl", url);
        }
      }

      const itemCount = data.items?.length || 0;
      if (itemCount > 0) {
        setExtractedItems(data.items!);
        setSelItemIdx(0);
        applyItem(data.items![0]);
      } else if (data.totalAmount) {
        setF("totalAmount", data.totalAmount.toString());
      }

      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      toast({
        title: isPdf ? "PDF 분석 완료" : "추출 완료",
        description: itemCount > 1
          ? `${itemCount}개 품목 감지 — 아래에서 일괄 등록을 이용하세요.`
          : itemCount === 1 ? "1개 항목 적용됨" : "업체명·금액을 확인하세요.",
      });

      // 2개 이상 품목이면 일괄 등록 다이얼로그 자동 오픈
      if (itemCount >= 2 && docType === "quote") {
        openBulkDlg(data);
      }
    } catch (e: any) { toast({ title: "분석 실패", description: e.message, variant:"destructive" }); }
    finally { setExtracting(null); }
  }

  // ── 단일 제출 ────────────────────────────────────────────────────
  function handleSubmit() {
    if (!form.category || !form.itemName || !form.totalAmount) {
      toast({ title: "필수 항목 누락", description: "항목·품명·합계금액은 필수입니다.", variant:"destructive" }); return;
    }
    const payload = {
      headquarters,
      year: Number(form.year), month: Number(form.month), category: form.category,
      subCategory: form.subCategory||null, itemName: form.itemName,
      specification: form.specification||null, unit: form.unit||null,
      quantity: form.quantity||null, unitPrice: form.unitPrice||null,
      supplyAmount: form.supplyAmount||null, vatAmount: form.vatAmount||null,
      totalAmount: form.totalAmount, purchaseDate: form.purchaseDate||null,
      vendorName: form.vendorName||null, notes: form.notes||null,
      documentNumber: form.documentNumber||null, paymentRequestDate: form.paymentRequestDate||null,
      quoteFileUrl: form.quoteFileUrl||null, transactionFileUrl: form.transactionFileUrl||null,
      certificateFileUrl: form.certificateFileUrl||null, resolutionFileUrl: form.resolutionFileUrl||null,
    };
    if (editRec) updateMut.mutate({ id: editRec.id, d: payload }); else createMut.mutate(payload);
  }

  // ── 다운로드 ──────────────────────────────────────────────────────
  async function handleDownload() {
    setShowExportDialog(false);
    setDownloading(true);
    try {
      const sy2 = String(exportStartYear).slice(2);
      const ey2 = String(exportEndYear).slice(2);
      const label = `${sy2}년_${exportStartMonth}월_${ey2}년_${exportEndMonth}월`;
      const url = `/api/safety-cost-records/export?startYear=${exportStartYear}&startMonth=${exportStartMonth}&endYear=${exportEndYear}&endMonth=${exportEndMonth}&headquarters=${encodeURIComponent(headquarters)}`;
      const r = await fetch(url, { credentials:"include" });
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.message || `서버 오류 (${r.status})`);
      }
      const blob = await r.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=blobUrl;
      a.download=`산업안전보건관리비_법정경비_${label}.xlsx`; a.click();
      URL.revokeObjectURL(blobUrl);
      toast({ title: "다운로드 완료" });
    } catch (e: any) { toast({ title: "다운로드 실패", description: e.message, variant:"destructive" }); }
    finally { setDownloading(false); }
  }

  async function handleDownloadTemplate() {
    setDownloadingTemplate(true);
    try {
      const r = await fetch(`/api/safety-cost-records/export-template?year=${year}`, { credentials: "include" });
      if (!r.ok) throw new Error("다운로드 실패");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href = url;
      a.download = `${year}년_산업안전보건관리비_사용내역.xlsx`; a.click();
      URL.revokeObjectURL(url);
      toast({ title: "다운로드 완료" });
    } catch (e: any) { toast({ title: "다운로드 실패", description: e.message, variant: "destructive" }); }
    finally { setDownloadingTemplate(false); }
  }

  // ── 계산 ─────────────────────────────────────────────────────────
  const filtered = records.filter(r =>
    (filterCat==="all" || r.category===filterCat) &&
    (filterMonth==="all" || r.month===Number(filterMonth))
  );
  const grandTotal = records.reduce((s, r) => s + toNum(r.totalAmount), 0);
  const catTotals = CATEGORIES.map((cat, i) => {
    const catRecs = records.filter(r => r.category===cat);
    const total = catRecs.reduce((s, r) => s+toNum(r.totalAmount), 0);
    const monthly = MONTHS.map((_, mi) => catRecs.filter(r=>r.month===mi+1).reduce((s,r)=>s+toNum(r.totalAmount),0));
    const pct = grandTotal>0 ? (total/grandTotal)*100 : 0;
    return { cat, total, monthly, count: catRecs.length, pct, color: CAT_COLORS[i] };
  });
  const monthlyTotals = MONTHS.map((_,i) => records.filter(r=>r.month===i+1).reduce((s,r)=>s+toNum(r.totalAmount),0));
  const totalBudget = Object.values(budgets).reduce((s, v) => s + (Number(v) || 0), 0);
  const catIdx = (cat: string) => CATEGORIES.indexOf(cat);

  // 선택 관련 computed
  const allFilteredSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));
  const someFilteredSelected = !allFilteredSelected && filtered.some(r => selectedIds.has(r.id));
  const selectedRecords = records.filter(r => selectedIds.has(r.id));
  const selectedTotal = selectedRecords.reduce((s, r) => s + toNum(r.totalAmount), 0);
  const selectedCatBreakdown = CATEGORIES.map((cat, i) => {
    const recs = selectedRecords.filter(r => r.category === cat);
    return { cat, i, count: recs.length, total: recs.reduce((s, r) => s + toNum(r.totalAmount), 0) };
  }).filter(c => c.count > 0);
  const bulkSelectedTotal = bulkItems.filter(it => it.checked).reduce((s, it) => s + toNum(it.totalAmount), 0);
  const bulkSelectedCount = bulkItems.filter(it => it.checked).length;

  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── 헤더 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">산업안전보건관리비 사용내역</h1>
          <p className="text-sm text-muted-foreground">{headquarters} · {year}년 법정경비 관리</p>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
          <Select value={year.toString()} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24" data-testid="select-year"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear-1, currentYear, currentYear+1].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" className="px-2.5 sm:px-4" title="예산 입력" onClick={() => {
            const init = { h1: {} as Record<string, string>, h2: {} as Record<string, string> };
            CATEGORIES.forEach((_, i) => {
              const k = String(i + 1);
              init.h1[k] = String(budgetDetail.h1[k] ?? 0);
              init.h2[k] = String(budgetDetail.h2[k] ?? 0);
            });
            setBudgetInput(init);
            setBudgetHalf("h1");
            setBudgetDlgOpen(true);
          }} data-testid="button-open-budget">
            <Wallet className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">예산 입력</span>
          </Button>
          <Button variant="outline" className="px-2.5 sm:px-4" title="사용내역 다운로드" onClick={handleDownloadTemplate} disabled={downloadingTemplate} data-testid="button-download-template">
            {downloadingTemplate ? <Loader2 className="w-4 h-4 sm:mr-1.5 animate-spin" /> : <Download className="w-4 h-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">사용내역 다운로드</span>
          </Button>
          <Button variant="outline" className="px-2.5 sm:px-4" title="법정경비 다운로드" onClick={() => { setExportStartYear(year); setExportStartMonth(1); setExportEndYear(year); setExportEndMonth(12); setShowExportDialog(true); }} disabled={downloading} data-testid="button-download">
            {downloading ? <Loader2 className="w-4 h-4 sm:mr-1.5 animate-spin" /> : <Download className="w-4 h-4 sm:mr-1.5" />}
            <span className="hidden sm:inline">법정경비 다운로드</span>
          </Button>
          <Button variant="outline" className="px-2.5 sm:px-4" title="결의서 일괄 업로드" onClick={() => { openMultiResDlg(); setTimeout(() => multiResRef.current?.click(), 50); }} data-testid="btn-multi-res-upload">
            <FileScan className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">결의서 일괄</span>
          </Button>
          <input ref={multiResRef} type="file" multiple accept="image/*,application/pdf" className="hidden"
            onChange={e => { handleMultiResFilesSelected(e.target.files); e.target.value = ""; }} />
          <Button className="px-2.5 sm:px-4" onClick={openAdd} data-testid="button-add-record">
            <Plus className="w-4 h-4 sm:mr-1.5" /><span className="hidden sm:inline">지출 등록</span>
          </Button>
        </div>
      </div>

      {/* ── 요약 카드 ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3">
        <Card className="col-span-2 sm:col-span-3 md:col-span-1 border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">연간 총 지출</div>
            <div className="text-2xl font-bold text-primary mt-1">{fmtMan(grandTotal)}</div>
            {totalBudget > 0 && (
              <>
                <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${grandTotal > totalBudget ? "bg-red-500" : "bg-primary"}`} style={{ width: `${Math.min((grandTotal / totalBudget) * 100, 100)}%` }} />
                </div>
                <div className={`text-xs mt-1 ${grandTotal > totalBudget ? "text-red-500 font-semibold" : "text-muted-foreground"}`}>
                  예산 {fmtMan(totalBudget)} 중 {Math.min((grandTotal / totalBudget) * 100, 100).toFixed(1)}% 사용
                </div>
              </>
            )}
            <div className="text-xs text-muted-foreground mt-1">
              <span>사용내역 {records.length}건</span>
            </div>
          </CardContent>
        </Card>
        {catTotals.filter(c=>c.total>0).map((c,i) => (
          <Card key={i}>
            <CardContent className="pt-4 pb-3">
              <div className="text-xs text-muted-foreground truncate">{c.cat.split(". ")[1]?.split(" 등")[0]}</div>
              <div className="text-lg font-bold mt-1">{fmtMan(c.total)}</div>
              <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                <div className={`h-full rounded-full ${c.color.bar}`} style={{ width:`${c.pct}%` }} />
              </div>
              <div className="text-xs text-muted-foreground mt-1">{c.count}건 · {c.pct.toFixed(1)}%</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── 탭 ── */}
      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="list" data-testid="tab-list"><List className="w-4 h-4 mr-1 hidden sm:inline" />사용내역</TabsTrigger>
          <TabsTrigger value="summary" data-testid="tab-summary"><BarChart3 className="w-4 h-4 mr-1 hidden sm:inline" />항목별 요약</TabsTrigger>
          <TabsTrigger value="tax" data-testid="tab-tax"><Receipt className="w-4 h-4 mr-1 hidden sm:inline" />세금계산서</TabsTrigger>
        </TabsList>

        {/* ══ 사용내역 탭 ══ */}
        <TabsContent value="list" className="mt-3 space-y-3">
          <div className="flex flex-wrap gap-2 items-center">
            <Select value={filterCat} onValueChange={setFilterCat}>
              <SelectTrigger className="w-48" data-testid="select-filter-category">
                <SelectValue placeholder="전체 항목" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 항목</SelectItem>
                {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c.substring(0,22)}...</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterMonth} onValueChange={setFilterMonth}>
              <SelectTrigger className="w-24" data-testid="select-filter-month">
                <SelectValue placeholder="전체 월" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 월</SelectItem>
                {MONTHS.map((m,i) => <SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
            {(filterCat!=="all"||filterMonth!=="all") && (
              <Button variant="ghost" size="sm" onClick={() => { setFilterCat("all"); setFilterMonth("all"); }}>
                <X className="w-3 h-3 mr-1" />초기화
              </Button>
            )}
            <span className="text-sm text-muted-foreground ml-auto">{filtered.length}건 · {fmt(filtered.reduce((s,r)=>s+toNum(r.totalAmount),0))}</span>
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
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-8 px-2">
                      <Checkbox
                        checked={allFilteredSelected}
                        data-state={someFilteredSelected ? "indeterminate" : undefined}
                        onCheckedChange={v => {
                          if (v) setSelectedIds(prev => new Set([...prev, ...filtered.map(r => r.id)]));
                          else setSelectedIds(prev => { const n = new Set(prev); filtered.forEach(r => n.delete(r.id)); return n; });
                        }}
                        data-testid="chk-select-all"
                      />
                    </TableHead>
                    <TableHead className="w-10 text-center">월</TableHead>
                    <TableHead className="w-10">항목</TableHead>
                    <TableHead className="min-w-[180px]">품명</TableHead>
                    <TableHead className="w-28">업체명</TableHead>
                    <TableHead className="text-right w-16 hidden md:table-cell">수량</TableHead>
                    <TableHead className="text-right w-20 hidden lg:table-cell">단가</TableHead>
                    <TableHead className="text-right w-24 hidden lg:table-cell">공급가액</TableHead>
                    <TableHead className="text-right w-20 hidden xl:table-cell">세액</TableHead>
                    <TableHead className="text-right font-semibold w-28">합계</TableHead>
                    <TableHead className="w-36 text-center">
                      <div className="flex items-center justify-center gap-1 text-xs leading-tight">
                        <span className="text-blue-500"><FileText className="w-3.5 h-3.5 inline" /></span>
                        <span className="text-emerald-500"><FileText className="w-3.5 h-3.5 inline" /></span>
                        <span className="text-indigo-500"><ScrollText className="w-3.5 h-3.5 inline" /></span>
                        <span className="text-amber-500"><Receipt className="w-3.5 h-3.5 inline" /></span>
                        <span className="text-violet-500"><Receipt className="w-3.5 h-3.5 inline" /></span>
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-0.5">첨부·결의서·세금(개별·월)</div>
                    </TableHead>
                    <TableHead className="w-14 text-center">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(rec => {
                    const ci = catIdx(rec.category);
                    const isSelected = selectedIds.has(rec.id);
                    return (
                      <TableRow key={rec.id} className={`hover:bg-muted/30 ${isSelected ? "bg-primary/5" : ""}`} data-testid={`row-record-${rec.id}`}>
                        <TableCell className="px-2">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={v => setSelectedIds(prev => { const n = new Set(prev); v ? n.add(rec.id) : n.delete(rec.id); return n; })}
                            data-testid={`chk-row-${rec.id}`}
                          />
                        </TableCell>
                        <TableCell className="text-center font-medium text-sm">{rec.month}월</TableCell>
                        <TableCell>
                          <Badge className={`text-xs border ${CAT_COLORS[ci]?.badge||""}`} variant="outline">
                            {rec.category.split(". ")[0]}항
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="font-medium text-sm leading-tight">{rec.itemName}</div>
                          {rec.specification && <div className="text-xs text-muted-foreground truncate max-w-36">{rec.specification}</div>}
                        </TableCell>
                        <TableCell className="text-sm w-28 truncate max-w-[7rem]">{rec.vendorName||"-"}</TableCell>
                        <TableCell className="text-right text-sm hidden md:table-cell">{rec.quantity ? `${fmtNum(rec.quantity)}${rec.unit?" "+rec.unit:""}` : "-"}</TableCell>
                        <TableCell className="text-right text-sm hidden lg:table-cell">{rec.unitPrice ? fmt(rec.unitPrice) : "-"}</TableCell>
                        <TableCell className="text-right text-sm hidden lg:table-cell">{rec.supplyAmount ? fmt(rec.supplyAmount) : "-"}</TableCell>
                        <TableCell className="text-right text-sm hidden xl:table-cell">{rec.vatAmount ? fmt(rec.vatAmount) : "-"}</TableCell>
                        <TableCell className="text-right font-bold text-sm">{fmt(rec.totalAmount)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-1.5 justify-center items-center">
                            {/* 견적서 */}
                            {rec.quoteFileUrl ? (
                              <button onClick={() => setPreview({ url: rec.quoteFileUrl!, title: "견적서" })}
                                className="text-blue-500 hover:text-blue-700 transition-colors" title="견적서" data-testid={`btn-quote-${rec.id}`}>
                                <FileText className="w-4 h-4" />
                              </button>
                            ) : (
                              <FileText className="w-4 h-4 text-muted-foreground/20" />
                            )}
                            {/* 거래명세서 */}
                            {rec.transactionFileUrl ? (
                              <button onClick={() => setPreview({ url: rec.transactionFileUrl!, title: "거래명세서" })}
                                className="text-emerald-500 hover:text-emerald-700 transition-colors" title="거래명세서" data-testid={`btn-trans-${rec.id}`}>
                                <FileText className="w-4 h-4" />
                              </button>
                            ) : (
                              <FileText className="w-4 h-4 text-muted-foreground/20" />
                            )}
                            {/* 결의서(구매/지출/기안서) */}
                            {(rec as any).resolutionFileUrl ? (
                              <button onClick={() => setPreview({ url: (rec as any).resolutionFileUrl, title: "결의서" })}
                                className="text-indigo-500 hover:text-indigo-700 transition-colors" title="결의서(구매/지출/기안서)" data-testid={`btn-resolution-${rec.id}`}>
                                <ScrollText className="w-4 h-4" />
                              </button>
                            ) : (
                              <ScrollText className="w-4 h-4 text-muted-foreground/20" />
                            )}
                            {/* 개별 세금계산서 (amber) */}
                            {rec.taxInvoiceYear ? (
                              <button
                                onClick={() => openRecTaxDlg(rec)}
                                className="text-amber-500 hover:text-amber-700 transition-colors relative"
                                title={`개별 세금계산서 수정/삭제: ${rec.taxInvoiceYear}년 ${rec.taxInvoiceMonth}월${rec.taxInvoiceMonth !== rec.month ? " ⚠ 구매월과 다름" : ""}`}
                                data-testid={`btn-rec-tax-${rec.id}`}>
                                <Receipt className="w-4 h-4" />
                                {rec.taxInvoiceMonth !== rec.month && (
                                  <span className="absolute -top-1 -right-1 w-1.5 h-1.5 rounded-full bg-orange-400" />
                                )}
                              </button>
                            ) : (
                              <button onClick={() => openRecTaxDlg(rec)}
                                className="text-muted-foreground/20 hover:text-amber-400 transition-colors" title="개별 세금계산서 등록"
                                data-testid={`btn-rec-tax-add-${rec.id}`}>
                                <Receipt className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => openEdit(rec)} className="text-muted-foreground hover:text-foreground" data-testid={`btn-edit-${rec.id}`}>
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => setDelConfirm({ type:"record", id:rec.id })} className="text-muted-foreground hover:text-red-500" data-testid={`btn-del-${rec.id}`}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}

          {/* ── 선택 요약 바 ── */}
          {selectedIds.size > 0 && (
            <div className="mt-3 rounded-xl bg-primary text-primary-foreground px-4 py-3 flex flex-wrap items-center gap-2 shadow-md">
              <span className="font-bold text-sm">{selectedIds.size}건 선택</span>
              <span className="opacity-60">·</span>
              <span className="font-bold">{fmt(selectedTotal)}</span>
              <div className="flex flex-wrap gap-1.5 ml-2">
                {selectedCatBreakdown.map(c => (
                  <span key={c.i} className="text-[11px] bg-white/20 rounded-full px-2 py-0.5">
                    {c.cat.split(". ")[0]}항 {c.count}건 · {fmtMan(c.total)}
                  </span>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs bg-white/20 hover:bg-white/30 text-primary-foreground border-0"
                  onClick={() => bulkTransRef.current?.click()}
                  disabled={bulkTransUploading}
                  data-testid="btn-bulk-trans-upload"
                >
                  {bulkTransUploading
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />첨부 중...</>
                    : <><FileText className="w-3 h-3 mr-1" />거래명세서 일괄 첨부</>}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs bg-red-500/80 hover:bg-red-600/80 text-white border-0"
                  onClick={() => setBulkDelConfirm(true)}
                  data-testid="btn-bulk-delete"
                >
                  <Trash2 className="w-3 h-3 mr-1" />{selectedIds.size}건 삭제
                </Button>
                <button onClick={() => setSelectedIds(new Set())}
                  className="text-xs underline opacity-70 hover:opacity-100" data-testid="btn-clear-selection">
                  선택 해제
                </button>
              </div>
            </div>
          )}
          {/* 숨김 파일 입력 — 거래명세서 일괄 첨부용 */}
          <input ref={bulkTransRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { if (e.target.files?.[0]) { uploadBulkTransaction(e.target.files[0]); } e.target.value = ""; }} />
        </TabsContent>

        {/* ══ 항목별 요약 탭 ══ */}
        <TabsContent value="summary" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {catTotals.map((c, i) => {
              const catNum = String(i + 1);
              const budget = Number(budgets[catNum]) || 0;
              const budgetPct = budget > 0 ? Math.min((c.total / budget) * 100, 100) : 0;
              const overBudget = budget > 0 && c.total > budget;
              return (
                <div key={i} className={`rounded-xl border p-4 transition-all ${c.total===0 && budget===0 ? "opacity-40" : "hover:shadow-sm"}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="text-xs text-muted-foreground mb-0.5">항목 {i+1}</div>
                      <div className="text-sm font-semibold leading-tight text-foreground">{c.cat.split(". ")[1]}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold text-foreground">{c.total>0 ? fmtMan(c.total) : "-"}</div>
                      <div className="text-xs text-muted-foreground">{c.count}건</div>
                    </div>
                  </div>
                  {budget > 0 ? (
                    <>
                      <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                        <span>예산 {fmtMan(budget)}</span>
                        <span className={overBudget ? "text-red-500 font-semibold" : "text-foreground"}>
                          {budgetPct.toFixed(1)}% 사용
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                        <div
                          className={`h-full rounded-full transition-all ${overBudget ? "bg-red-500" : c.color.bar}`}
                          style={{ width: `${budgetPct}%` }}
                        />
                      </div>
                      {overBudget && (
                        <div className="text-[10px] text-red-500 font-medium mb-1">
                          ⚠ 예산 초과 {fmtMan(c.total - budget)}
                        </div>
                      )}
                      {!overBudget && budget > 0 && (
                        <div className="text-[10px] text-muted-foreground mb-1">
                          잔액 {fmtMan(budget - c.total)}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-2 rounded-full bg-muted overflow-hidden mb-2">
                      <div className={`h-full rounded-full transition-all ${c.color.bar}`} style={{ width:`${c.pct}%` }} />
                    </div>
                  )}
                  {c.total > 0 && (
                    <div className="flex gap-0.5 items-end h-8 mt-1">
                      {c.monthly.map((v, mi) => {
                        const maxM = Math.max(...c.monthly);
                        const barH = maxM > 0 ? Math.max(2, (v / maxM) * 32) : 2;
                        return (
                          <div key={mi} className="flex-1 flex flex-col items-center gap-0.5" title={`${mi+1}월: ${fmt(v)}`}>
                            <div className={`w-full rounded-sm ${c.color.bar} opacity-70`} style={{ height: `${barH}px` }} />
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {c.total > 0 && (
                    <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                      <span>1월</span><span>6월</span><span>12월</span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div className="rounded-xl border overflow-hidden">
            <div className="px-4 py-3 bg-muted/40 border-b">
              <span className="font-semibold text-sm">월별 총계</span>
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    {MONTHS.map(m => <TableHead key={m} className="text-center text-xs">{m}</TableHead>)}
                    <TableHead className="text-right text-xs font-bold">연간합계</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    {monthlyTotals.map((v, i) => (
                      <TableCell key={i} className="text-center text-sm">
                        {v > 0 ? <span className="font-medium text-foreground">{fmtMan(v)}</span> : <span className="text-muted-foreground/40 text-xs">-</span>}
                      </TableCell>
                    ))}
                    <TableCell className="text-right font-bold text-primary">{fmt(grandTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* ══ 세금계산서 탭 ══ */}
        <TabsContent value="tax" className="mt-3">
          <div className="flex justify-between items-center mb-3">
            <p className="text-sm text-muted-foreground">월별 세금계산서를 등록하고 관리합니다.</p>
            <Button size="sm" onClick={openTaxAdd} data-testid="btn-add-tax-invoice">
              <Plus className="w-4 h-4 mr-1" />세금계산서 등록
            </Button>
          </div>
          {taxInvoices.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
              <Receipt className="w-10 h-10 opacity-30" />
              <p className="text-sm">등록된 세금계산서가 없습니다.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {(() => {
                const byMonth: Record<number, SafetyCostTaxInvoice[]> = {};
                for (const t of taxInvoices) {
                  if (!byMonth[t.month]) byMonth[t.month] = [];
                  byMonth[t.month].push(t);
                }
                return Object.keys(byMonth).sort((a, b) => Number(a) - Number(b)).map(mStr => {
                  const m = Number(mStr);
                  const mTaxes = byMonth[m];
                  return (
                    <div key={m}>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="font-semibold text-sm text-primary">{year}년 {m}월</span>
                        <Badge variant="secondary" className="text-xs">{mTaxes.length}건</Badge>
                        <span className="text-xs text-muted-foreground ml-auto">
                          합계: {fmt(mTaxes.reduce((s, t) => s + toNum(t.totalAmount), 0))}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        {mTaxes.map(t => (
                          <Card key={t.id} className="w-72 shrink-0" data-testid={`card-tax-invoice-${t.id}`}>
                            <CardContent className="p-3 space-y-2">
                              <div className="flex justify-between items-start">
                                <div>
                                  <p className="font-medium text-sm truncate max-w-[160px]" title={t.vendorName || ""}>{t.vendorName || "업체명 없음"}</p>
                                  <p className="text-xs text-muted-foreground">{year}년 {t.month}월</p>
                                </div>
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openTaxEdit(t)} data-testid={`btn-edit-tax-${t.id}`}><Edit2 className="w-3.5 h-3.5" /></Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setTaxDelConfirm({ id: t.id })} data-testid={`btn-del-tax-${t.id}`}><Trash2 className="w-3.5 h-3.5" /></Button>
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-x-2 text-xs text-muted-foreground">
                                <span>공급가액</span><span className="text-right font-medium text-foreground">{fmt(t.supplyAmount)}</span>
                                <span>세액</span><span className="text-right font-medium text-foreground">{fmt(t.vatAmount)}</span>
                                <span className="font-semibold text-foreground">합계</span><span className="text-right font-bold text-primary">{fmt(t.totalAmount)}</span>
                              </div>
                              {t.notes && <p className="text-xs text-muted-foreground border-t pt-1 truncate">{t.notes}</p>}
                              {t.fileUrl ? (
                                <Button variant="outline" size="sm" className="w-full h-7 text-xs gap-1" onClick={() => setPreview({ url: t.fileUrl!, title: `${t.vendorName || "세금계산서"} (${year}년 ${t.month}월)` })} data-testid={`btn-preview-tax-${t.id}`}>
                                  <ImageIcon className="w-3.5 h-3.5" />첨부파일 보기
                                </Button>
                              ) : (
                                <p className="text-xs text-muted-foreground/50 text-center py-1">첨부파일 없음</p>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </TabsContent>

      </Tabs>

      {/* ══ 세금계산서 등록/수정 다이얼로그 ══ */}
      <Dialog open={taxDlgOpen} onOpenChange={v => { if (!v) closeTaxDlg(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-primary" />
              {editTax ? "세금계산서 수정" : "세금계산서 등록"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">연도</Label>
                <Select value={taxForm.year.toString()} onValueChange={v => setTaxF("year", Number(v))}>
                  <SelectTrigger data-testid="select-tax-year"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[currentYear - 1, currentYear, currentYear + 1].map(y => <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">월</Label>
                <Select value={taxForm.month.toString()} onValueChange={v => setTaxF("month", Number(v))}>
                  <SelectTrigger data-testid="select-tax-month"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MONTHS.map((m, i) => <SelectItem key={i + 1} value={(i + 1).toString()}>{m}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">업체명</Label>
              <Input value={taxForm.vendorName} onChange={e => setTaxF("vendorName", e.target.value)} placeholder="업체명 입력" data-testid="input-tax-vendor" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">공급가액</Label>
                <Input type="number" value={taxForm.supplyAmount} onChange={e => autoCalcTax("supplyAmount", e.target.value)} placeholder="0" data-testid="input-tax-supply" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">세액</Label>
                <Input type="number" value={taxForm.vatAmount} onChange={e => setTaxF("vatAmount", e.target.value)} placeholder="0" data-testid="input-tax-vat" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">합계금액</Label>
                <Input type="number" value={taxForm.totalAmount} onChange={e => setTaxF("totalAmount", e.target.value)} placeholder="0" data-testid="input-tax-total" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">비고</Label>
              <Textarea value={taxForm.notes} onChange={e => setTaxF("notes", e.target.value)} placeholder="비고 (선택)" rows={2} data-testid="textarea-tax-notes" />
            </div>
            {/* AI 자동입력 섹션 */}
            <div className="border rounded-xl p-3 bg-muted/20 space-y-2">
              <div className="text-sm font-semibold flex items-center gap-2 text-foreground">
                <Upload className="w-4 h-4" /> AI 자동입력
                <span className="text-xs font-normal text-muted-foreground">· 이미지 및 PDF 지원</span>
              </div>
              <input ref={taxFileRef} type="file" accept="image/*,.pdf,application/pdf" className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleTaxExtract(e.target.files[0]); e.target.value = ""; }} />
              <Button type="button" variant="outline" size="sm" className="w-full gap-1.5 border-blue-300 hover:border-blue-500"
                disabled={taxExtracting} onClick={() => taxFileRef.current?.click()} data-testid="btn-tax-ai-extract">
                {taxExtracting
                  ? <><Loader2 className="w-4 h-4 animate-spin" />AI 분석 중...</>
                  : <><FileScan className="w-4 h-4" />세금계산서 첨부 (AI 자동입력)</>}
              </Button>
              {taxExtracting && (
                <p className="text-xs text-blue-600 text-center">업체명·공급가액·세액·합계·발행월을 자동으로 입력합니다...</p>
              )}
              {(taxForm.fileUrl || taxFile) && !taxExtracting && (
                <div className="flex items-center gap-2 mt-1">
                  {taxForm.fileUrl && (
                    <button type="button" onClick={() => setPreview({ url: taxForm.fileUrl, title: "세금계산서 미리보기" })}
                      className="text-xs text-blue-600 flex items-center gap-1 hover:underline" data-testid="btn-tax-preview-inline">
                      <FileText className="w-3 h-3" />첨부된 파일 보기
                    </button>
                  )}
                  {taxFile && !taxForm.fileUrl && (
                    <span className="text-xs text-muted-foreground truncate max-w-[200px]">{taxFile.name}</span>
                  )}
                  <Button type="button" variant="ghost" size="icon" className="h-6 w-6 text-destructive ml-auto"
                    onClick={() => { setTaxFile(null); setTaxF("fileUrl", ""); }}>
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeTaxDlg}>취소</Button>
            <Button onClick={saveTax} disabled={taxCreateMut.isPending || taxUpdateMut.isPending || taxFileUploading} data-testid="btn-save-tax">
              {(taxCreateMut.isPending || taxUpdateMut.isPending || taxFileUploading) ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 세금계산서 삭제 확인 ══ */}
      <Dialog open={!!taxDelConfirm} onOpenChange={v => { if (!v) setTaxDelConfirm(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>세금계산서 삭제</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">이 세금계산서를 삭제하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTaxDelConfirm(null)}>취소</Button>
            <Button variant="destructive" onClick={() => taxDelConfirm && taxDeleteMut.mutate(taxDelConfirm.id)} disabled={taxDeleteMut.isPending}>삭제</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 예산 입력 다이얼로그 ══ */}
      <Dialog open={budgetDlgOpen} onOpenChange={setBudgetDlgOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-primary" />
              {year}년 항목별 예산 입력 (상반기/하반기)
            </DialogTitle>
          </DialogHeader>

          {/* 상반기/하반기 탭 */}
          <Tabs value={budgetHalf} onValueChange={v => setBudgetHalf(v as "h1"|"h2")}>
            <TabsList className="w-full">
              <TabsTrigger value="h1" className="flex-1" data-testid="tab-budget-h1">
                상반기 (1~6월)
                <span className="ml-2 text-xs text-muted-foreground">
                  {Object.values(budgetInput.h1).reduce((s, v) => s + (Number(v) || 0), 0).toLocaleString("ko-KR")}원
                </span>
              </TabsTrigger>
              <TabsTrigger value="h2" className="flex-1" data-testid="tab-budget-h2">
                하반기 (7~12월)
                <span className="ml-2 text-xs text-muted-foreground">
                  {Object.values(budgetInput.h2).reduce((s, v) => s + (Number(v) || 0), 0).toLocaleString("ko-KR")}원
                </span>
              </TabsTrigger>
            </TabsList>

            {(["h1", "h2"] as const).map(half => (
              <TabsContent key={half} value={half} className="space-y-2 py-2">
                <p className="text-xs text-muted-foreground">
                  {half === "h1" ? "1~6월" : "7~12월"} 예산액을 원 단위로 입력하세요.
                </p>
                {CATEGORIES.map((cat, i) => {
                  const catNum = String(i + 1);
                  const CAT_COLORS_HEX = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#f97316','#ec4899','#14b8a6','#f43f5e','#6366f1'];
                  return (
                    <div key={catNum} className="flex items-center gap-3">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                        style={{ backgroundColor: CAT_COLORS_HEX[i] }}>
                        {i + 1}
                      </div>
                      <Label className="flex-1 text-xs leading-tight text-foreground min-w-0 truncate" title={cat.split(". ")[1]}>
                        {cat.split(". ")[1]}
                      </Label>
                      <div className="relative w-28 sm:w-40 shrink-0">
                        <Input
                          type="text"
                          inputMode="numeric"
                          className="pr-6 text-right text-sm h-8"
                          value={Number(budgetInput[half][catNum] || 0).toLocaleString("ko-KR")}
                          onChange={e => {
                            const raw = e.target.value.replace(/[^0-9]/g, "");
                            setBudgetInput(prev => ({ ...prev, [half]: { ...prev[half], [catNum]: raw } }));
                          }}
                          data-testid={`input-budget-${half}-cat-${catNum}`}
                        />
                        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">원</span>
                      </div>
                    </div>
                  );
                })}
                <div className="pt-2 border-t flex items-center justify-between text-sm font-semibold">
                  <span className="text-muted-foreground">{half === "h1" ? "상반기" : "하반기"} 소계</span>
                  <span className="text-primary">
                    {Object.values(budgetInput[half]).reduce((s, v) => s + (Number(v) || 0), 0).toLocaleString("ko-KR")}원
                  </span>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* 연간 총 예산 합계 */}
          <div className="border rounded-lg p-3 bg-muted/30 flex items-center justify-between text-sm font-semibold">
            <span className="text-muted-foreground">연간 총 예산</span>
            <span className="text-primary text-base">
              {(
                Object.values(budgetInput.h1).reduce((s, v) => s + (Number(v) || 0), 0) +
                Object.values(budgetInput.h2).reduce((s, v) => s + (Number(v) || 0), 0)
              ).toLocaleString("ko-KR")}원
            </span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBudgetDlgOpen(false)}>취소</Button>
            <Button
              onClick={() => {
                const h1: Record<string, number> = {};
                const h2: Record<string, number> = {};
                CATEGORIES.forEach((_, i) => {
                  const k = String(i + 1);
                  h1[k] = Number(budgetInput.h1[k] || 0);
                  h2[k] = Number(budgetInput.h2[k] || 0);
                });
                saveBudgetMut.mutate({ h1, h2 });
              }}
              disabled={saveBudgetMut.isPending}
              data-testid="button-save-budget"
            >
              {saveBudgetMut.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 지출 등록/수정 다이얼로그 ══ */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRec ? "사용내역 수정" : "사용내역 등록"}</DialogTitle>
          </DialogHeader>

          {/* AI 첨부 */}
          <div className="space-y-3 border rounded-xl p-3 bg-muted/20">
            <div className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Upload className="w-4 h-4" /> AI 자동 입력
              <span className="text-xs font-normal text-muted-foreground">· 이미지 및 PDF 지원</span>
            </div>

            {/* 결의서 (구매결의서/지출결의서) — 품의번호·지급요청일자 추출 */}
            <div className="bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-2 space-y-2">
              <p className="text-xs font-semibold text-violet-700 dark:text-violet-300 flex items-center gap-1">
                <FileScan className="w-3.5 h-3.5" /> 결의서 업로드 (품의번호 · 지급요청일자 자동 입력)
              </p>
              <input ref={resolutionRef} type="file" accept="image/*,application/pdf" className="hidden"
                onChange={e => { if (e.target.files?.[0]) handleExtractResolution(e.target.files[0]); e.target.value=""; }} />
              <Button variant="outline" size="sm" className="w-full border-violet-300 hover:border-violet-500" disabled={resolutionExtracting}
                onClick={() => resolutionRef.current?.click()} data-testid="btn-upload-resolution">
                {resolutionExtracting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileScan className="w-4 h-4 mr-1" />}
                구매결의서 / 지출결의서 첨부 (AI 분석)
              </Button>
              {form.resolutionFileUrl && (
                <button onClick={() => setPreview({ url: form.resolutionFileUrl, title: "결의서" })}
                  className="text-xs text-violet-600 flex items-center gap-1 hover:underline">
                  <FileCheck className="w-3 h-3" />첨부된 결의서 보기
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <input ref={quoteRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleExtract("quote", e.target.files[0]); e.target.value=""; }} />
                <Button variant="outline" size="sm" className="w-full" disabled={extracting!==null}
                  onClick={() => quoteRef.current?.click()} data-testid="btn-upload-quote">
                  {extracting==="quote" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ImageIcon className="w-4 h-4 mr-1" />}
                  견적서 첨부 (AI 분석)
                </Button>
                {form.quoteFileUrl && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><FileText className="w-3 h-3" />견적서 업로드됨</p>}
              </div>
              <div>
                <input ref={transRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleExtract("transaction", e.target.files[0]); e.target.value=""; }} />
                <Button variant="outline" size="sm" className="w-full" disabled={extracting!==null}
                  onClick={() => transRef.current?.click()} data-testid="btn-upload-trans">
                  {extracting==="transaction" ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <FileText className="w-4 h-4 mr-1" />}
                  거래명세서 첨부 (AI 분석)
                </Button>
                {form.transactionFileUrl && <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><FileText className="w-3 h-3" />거래명세서 업로드됨</p>}
              </div>
            </div>

            {/* 수료증/이수증 — 1항(인건비) 또는 5항(교육비) 선택 시 표시 */}
            {(form.category === CATEGORIES[0] || form.category === CATEGORIES[4]) && (
              <div className="border-t pt-2 mt-1">
                <div className="text-xs font-semibold text-orange-600 flex items-center gap-1 mb-1.5">
                  <FileCheck className="w-3.5 h-3.5" /> 수료증 / 이수증 첨부
                </div>
                <input ref={certRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) handleCertUpload(e.target.files[0]); e.target.value=""; }} />
                <Button variant="outline" size="sm" className="w-full border-orange-200 hover:border-orange-400" disabled={certUploading}
                  onClick={() => certRef.current?.click()} data-testid="btn-upload-cert">
                  {certUploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                  {form.certificateFileUrl ? "수료증 교체" : "수료증/이수증 첨부 (이미지/PDF)"}
                </Button>
                {form.certificateFileUrl && (
                  <button onClick={() => setPreview({ url: form.certificateFileUrl, title: "수료증" })}
                    className="text-xs text-orange-600 mt-1 flex items-center gap-1 hover:underline">
                    <FileCheck className="w-3 h-3" />첨부된 수료증 보기
                  </button>
                )}
              </div>
            )}

            {/* 다중 품목 감지 시 일괄 등록 안내 */}
            {extractedItems.length >= 2 && (
              <div className="flex items-center gap-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2">
                <PackagePlus className="w-4 h-4 text-blue-600 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                    {extractedItems.length}개 품목 감지됨
                  </p>
                  <p className="text-xs text-blue-600 dark:text-blue-400">일괄 등록으로 한 번에 추가할 수 있습니다.</p>
                </div>
                <Button size="sm" variant="default" className="shrink-0 bg-blue-600 hover:bg-blue-700 text-white"
                  onClick={() => openBulkDlg({ items: extractedItems, vendorName: form.vendorName, documentDate: form.purchaseDate, _fileUrl: form.quoteFileUrl })}
                  data-testid="btn-open-bulk">
                  <CheckSquare className="w-3.5 h-3.5 mr-1" /> 일괄 등록
                </Button>
              </div>
            )}

            {/* 단일 품목 선택 */}
            {extractedItems.length >= 2 && (
              <div>
                <p className="text-xs text-muted-foreground mb-1">또는 단일 품목만 등록:</p>
                <div className="flex flex-wrap gap-1">
                  {extractedItems.map((item, i) => (
                    <button key={i} onClick={() => { setSelItemIdx(i); applyItem(item); }}
                      className={`text-xs px-2 py-1 rounded border transition-colors ${selItemIdx===i ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}
                      data-testid={`btn-item-${i}`}>
                      {item.itemName || `품목 ${i+1}`} ({fmtNum(item.quantity)}{item.unit || ""})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 품의번호 / 지급요청일자 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="flex items-center gap-1">
                <FileScan className="w-3 h-3 text-violet-500" /> 품의번호
              </Label>
              <Input placeholder="결의서 업로드 시 자동 입력" value={form.documentNumber}
                onChange={e => setF("documentNumber", e.target.value)} data-testid="input-document-number" />
            </div>
            <div>
              <Label className="flex items-center gap-1">
                <FileScan className="w-3 h-3 text-violet-500" /> 지급요청일자
              </Label>
              <Input type="date" value={form.paymentRequestDate}
                onChange={e => setF("paymentRequestDate", e.target.value)} data-testid="input-payment-request-date" />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><Label>연도 *</Label>
              <Select value={form.year.toString()} onValueChange={v => setF("year", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[currentYear-1,currentYear,currentYear+1].map(y=><SelectItem key={y} value={y.toString()}>{y}년</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>월 *</Label>
              <Select value={form.month.toString()} onValueChange={v => setF("month", Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m,i)=><SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>구매일자</Label>
              <Input type="date" value={form.purchaseDate} onChange={e=>setF("purchaseDate",e.target.value)} data-testid="input-purchase-date" />
            </div>
          </div>
          <div><Label>항목 구분 *</Label>
            <Select value={form.category} onValueChange={v=>setF("category",v)}>
              <SelectTrigger data-testid="select-category"><SelectValue placeholder="항목 선택" /></SelectTrigger>
              <SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><Label>세부항목</Label><Input placeholder="세부항목" value={form.subCategory} onChange={e=>setF("subCategory",e.target.value)} /></div>
            <div><Label>업체명</Label><Input placeholder="공급업체명" value={form.vendorName} onChange={e=>setF("vendorName",e.target.value)} data-testid="input-vendor" /></div>
          </div>
          <div><Label>품명 *</Label><Input placeholder="품명" value={form.itemName} onChange={e=>setF("itemName",e.target.value)} data-testid="input-item-name" /></div>
          <div><Label>규격</Label><Input placeholder="규격" value={form.specification} onChange={e=>setF("specification",e.target.value)} /></div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><Label>단위</Label>
              <Select value={form.unit} onValueChange={v=>setF("unit",v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["EA","개","식","세트","쌍","묶음","kg","L","m"].map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>수량</Label><Input type="number" placeholder="0" value={form.quantity} onChange={e=>autoCalc("quantity",e.target.value)} data-testid="input-quantity" /></div>
            <div><Label>단가</Label><Input type="number" placeholder="0" value={form.unitPrice} onChange={e=>autoCalc("unitPrice",e.target.value)} data-testid="input-unit-price" /></div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div><Label>공급가액</Label><Input type="number" placeholder="0" value={form.supplyAmount} onChange={e=>setF("supplyAmount",e.target.value)} /></div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <Label>세액</Label>
                <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs text-muted-foreground">
                  <Checkbox checked={vatExcluded} onCheckedChange={v=>toggleVatExcluded(!!v)} data-testid="checkbox-vat-excluded" />
                  세액 제외
                </label>
              </div>
              <Input type="number" placeholder="0" value={form.vatAmount} onChange={e=>setF("vatAmount",e.target.value)} disabled={vatExcluded} className={vatExcluded ? "bg-muted text-muted-foreground" : ""} />
            </div>
            <div><Label className="font-semibold">합계 *</Label><Input type="number" placeholder="0" value={form.totalAmount} onChange={e=>setF("totalAmount",e.target.value)} className="font-semibold" data-testid="input-total" /></div>
          </div>
          <div><Label>비고</Label><Textarea rows={2} value={form.notes} onChange={e=>setF("notes",e.target.value)} /></div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDlg}>취소</Button>
            <Button onClick={handleSubmit} disabled={createMut.isPending||updateMut.isPending} data-testid="btn-submit">
              {(createMut.isPending||updateMut.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editRec ? "수정 저장" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 일괄 등록 다이얼로그 ══ */}
      <Dialog open={bulkDlgOpen} onOpenChange={v => { if (!v) closeBulkDlg(); }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-primary" />
              다중 품목 일괄 등록
            </DialogTitle>
          </DialogHeader>

          {/* 공통 필드 */}
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">공통 정보 (모든 품목에 적용)</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div><Label>연도</Label>
                <Select value={bulkCommon.year.toString()} onValueChange={v=>setBC("year",Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{[currentYear-1,currentYear,currentYear+1].map(y=><SelectItem key={y} value={y.toString()}>{y}년</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>월</Label>
                <Select value={bulkCommon.month.toString()} onValueChange={v=>setBC("month",Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m,i)=><SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>구매일자</Label>
                <Input type="date" value={bulkCommon.purchaseDate} onChange={e=>setBC("purchaseDate",e.target.value)} />
              </div>
              <div><Label>업체명</Label>
                <Input placeholder="업체명" value={bulkCommon.vendorName} onChange={e=>setBC("vendorName",e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="flex items-center gap-1"><FileScan className="w-3 h-3 text-violet-500" />품의번호</Label>
                <Input placeholder="품의번호 (선택)" value={bulkCommon.documentNumber} onChange={e=>setBC("documentNumber",e.target.value)} />
              </div>
              <div>
                <Label className="flex items-center gap-1"><FileScan className="w-3 h-3 text-violet-500" />지급요청일자</Label>
                <Input type="date" value={bulkCommon.paymentRequestDate} onChange={e=>setBC("paymentRequestDate",e.target.value)} />
              </div>
            </div>
            <div><Label>항목 구분 * <span className="text-destructive">필수</span></Label>
              <Select value={bulkCommon.category} onValueChange={v=>setBC("category",v)}>
                <SelectTrigger data-testid="bulk-select-category"><SelectValue placeholder="항목 구분 선택" /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c=><SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* 품목 테이블 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">품목 목록</p>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => setBulkItems(p => p.map(it => ({ ...it, checked: true })))}>
                  전체 선택
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setBulkItems(p => p.map(it => ({ ...it, checked: false })))}>
                  전체 해제
                </Button>
              </div>
            </div>
            <div className="rounded-lg border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40">
                    <TableHead className="w-10 text-center">선택</TableHead>
                    <TableHead>품명</TableHead>
                    <TableHead>규격</TableHead>
                    <TableHead className="w-14">단위</TableHead>
                    <TableHead className="w-16 text-right">수량</TableHead>
                    <TableHead className="w-24 text-right">단가</TableHead>
                    <TableHead className="w-24 text-right">공급가액</TableHead>
                    <TableHead className="w-20 text-right">세액</TableHead>
                    <TableHead className="w-24 text-right font-semibold">합계</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bulkItems.map((it, idx) => (
                    <TableRow key={idx} className={it.checked ? "" : "opacity-40 bg-muted/10"} data-testid={`bulk-row-${idx}`}>
                      <TableCell className="text-center">
                        <Checkbox checked={it.checked} onCheckedChange={v => setBulkItem(idx, "checked", !!v)}
                          data-testid={`bulk-check-${idx}`} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-7 text-sm min-w-28" value={it.itemName||""} placeholder="품명"
                          onChange={e => setBulkItem(idx, "itemName", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-7 text-sm min-w-20" value={it.specification||""} placeholder="규격"
                          onChange={e => setBulkItem(idx, "specification", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input className="h-7 text-sm w-14" value={it.unit||""} placeholder="EA"
                          onChange={e => setBulkItem(idx, "unit", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-7 text-sm w-16 text-right" value={it.quantity ?? ""}
                          onChange={e => bulkAutoCalc(idx, "quantity", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-7 text-sm w-24 text-right" value={it.unitPrice ?? ""}
                          onChange={e => bulkAutoCalc(idx, "unitPrice", e.target.value)} />
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {it.supplyAmount ? fmtNum(it.supplyAmount) : "-"}
                      </TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">
                        {it.vatAmount ? fmtNum(it.vatAmount) : "-"}
                      </TableCell>
                      <TableCell>
                        <Input type="number" className="h-7 text-sm w-24 text-right font-semibold" value={it.totalAmount ?? ""}
                          onChange={e => setBulkItem(idx, "totalAmount", e.target.value === "" ? undefined : Number(e.target.value))} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* 합계 행 */}
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell colSpan={8} className="text-right text-sm">선택 {bulkSelectedCount}개 합계</TableCell>
                    <TableCell className="text-right text-primary">{fmt(bulkSelectedTotal)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeBulkDlg}>취소</Button>
            <Button onClick={handleBulkSubmit} disabled={bulkSaving || bulkSelectedCount === 0}
              className="gap-1" data-testid="btn-bulk-submit">
              {bulkSaving
                ? <><Loader2 className="w-4 h-4 animate-spin" />등록 중...</>
                : <><PackagePlus className="w-4 h-4" />{bulkSelectedCount}개 품목 일괄 등록</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 다중 결의서 일괄 등록 다이얼로그 ══ */}
      <Dialog open={multiResDlgOpen} onOpenChange={v => { if (!v) closeMultiResDlg(); }}>
        <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileScan className="w-5 h-5 text-primary" />
              결의서 일괄 등록
            </DialogTitle>
          </DialogHeader>

          {/* 파일 추가 버튼 */}
          <div className="flex items-center gap-3 py-2 border-b flex-wrap">
            <Button variant="outline" size="sm" onClick={() => multiResRef.current?.click()} data-testid="btn-multi-res-add-more">
              <Upload className="w-3.5 h-3.5 mr-1" /> 파일 추가
            </Button>
            {/* 전체 연도 일괄 선택 */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-foreground whitespace-nowrap">전체 연도:</span>
              <Select value={multiResGlobalYear.toString()} onValueChange={v => applyGlobalYearToAll(Number(v))}>
                <SelectTrigger className="h-7 text-xs w-24" data-testid="sel-global-year">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(y => (
                    <SelectItem key={y} value={y.toString()} className="text-xs">{y}년</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {multiResRows.some(r => r.checked && r.status === "done") && (
              <Button variant="outline" size="sm"
                className="h-7 text-xs border-orange-300 text-orange-600 hover:bg-orange-50"
                onClick={applyNoVatToChecked}
                data-testid="btn-bulk-no-vat"
                title="선택 항목의 세액을 0으로 설정하고 공급가액 = 합계금액으로 변경">
                <span className="text-sm mr-1">⊘</span> 일괄 세액제외
              </Button>
            )}
            <span className="text-xs text-muted-foreground">
              PDF·이미지 여러 개 동시 선택 가능 · AI가 자동으로 내용을 추출합니다
            </span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">견적서 (전체 공유):</span>
              {multiResQuoteUrl ? (
                <div className="flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs text-blue-600 max-w-[120px] truncate">첨부됨</span>
                  <button onClick={() => setMultiResQuoteUrl("")} className="text-muted-foreground hover:text-red-500" title="제거">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-xs border-blue-300 text-blue-600 hover:bg-blue-50"
                  onClick={() => multiResQuoteRef.current?.click()}
                  disabled={multiResQuoteUploading}
                  data-testid="btn-shared-quote-upload">
                  {multiResQuoteUploading
                    ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />업로드 중...</>
                    : <><FileText className="w-3 h-3 mr-1" />견적서 첨부</>}
                </Button>
              )}
            </div>
            {multiResRows.length > 0 && (
              <span className="ml-auto text-xs text-muted-foreground">
                {multiResRows.filter(r=>r.status==="done" && r.checked).length}건 선택됨 / {multiResRows.length}건 전체
              </span>
            )}
          </div>

          {/* 행 없을 때 안내 */}
          {multiResRows.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 py-16 text-muted-foreground">
              <FileScan className="w-12 h-12 opacity-20" />
              <p className="text-sm">파일 추가 버튼을 눌러 구매결의서·지출결의서·기안서를 선택하세요</p>
            </div>
          )}

          {/* 결과 테이블 */}
          {multiResRows.length > 0 && (
            <div className="flex-1 overflow-auto border rounded-lg">
              <Table className="min-w-[1000px]">
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="w-9 px-3">
                      <Checkbox
                        checked={multiResRows.filter(r=>r.status==="done").every(r=>r.checked)}
                        onCheckedChange={v => setMultiResRows(p => p.map(r => r.status==="done" ? { ...r, checked: !!v } : r))}
                        data-testid="chk-multi-res-all"
                      />
                    </TableHead>
                    <TableHead className="w-16 text-xs whitespace-nowrap">상태</TableHead>
                    <TableHead className="w-40 text-xs whitespace-nowrap">파일명</TableHead>
                    <TableHead className="w-28 text-xs whitespace-nowrap">문서유형</TableHead>
                    <TableHead className="w-36 text-xs whitespace-nowrap">업체명</TableHead>
                    <TableHead className="w-44 text-xs whitespace-nowrap">품명</TableHead>
                    <TableHead className="w-48 text-xs whitespace-nowrap">항목구분</TableHead>
                    <TableHead className="w-32 text-xs whitespace-nowrap">날짜</TableHead>
                    <TableHead className="w-36 text-xs whitespace-nowrap">연월</TableHead>
                    <TableHead className="w-28 text-xs whitespace-nowrap">합계금액</TableHead>
                    <TableHead className="w-8"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {multiResRows.map(row => (
                    <TableRow key={row.id} className={row.status === "error" ? "opacity-50" : ""}>
                      <TableCell className="px-3">
                        <Checkbox
                          checked={row.checked && row.status === "done"}
                          disabled={row.status !== "done"}
                          onCheckedChange={v => updateMultiResRow(row.id, { checked: !!v })}
                          data-testid={`chk-multi-res-${row.id}`}
                        />
                      </TableCell>
                      <TableCell>
                        {row.status === "pending" && <Badge variant="secondary" className="text-xs">대기</Badge>}
                        {row.status === "processing" && <Badge variant="outline" className="text-xs gap-1"><Loader2 className="w-3 h-3 animate-spin" />분석중</Badge>}
                        {row.status === "done" && <Badge className="text-xs bg-green-500 hover:bg-green-600">완료</Badge>}
                        {row.status === "error" && <Badge variant="destructive" className="text-xs" title={row.error}>오류</Badge>}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px]">
                        <span className="block truncate" title={row.file.name}>{row.file.name}</span>
                      </TableCell>
                      <TableCell>
                        {row.status === "done" ? (
                          <Input value={row.documentType || ""} onChange={e => updateMultiResRow(row.id, { documentType: e.target.value })}
                            className="h-7 text-xs w-24" placeholder="문서유형" data-testid={`inp-doc-type-${row.id}`} />
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {row.status === "done" ? (
                          <Input value={row.vendorName || ""} onChange={e => updateMultiResRow(row.id, { vendorName: e.target.value })}
                            className="h-7 text-xs w-32" placeholder="업체명" data-testid={`inp-vendor-${row.id}`} />
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {row.status === "done" ? (
                          <Input value={row.itemName || ""} onChange={e => updateMultiResRow(row.id, { itemName: e.target.value })}
                            className="h-7 text-xs w-40" placeholder="품명" data-testid={`inp-item-${row.id}`} />
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {row.status === "done" ? (
                          <Select value={row.category || ""} onValueChange={v => updateMultiResRow(row.id, { category: v })}>
                            <SelectTrigger className="h-7 text-xs w-44" data-testid={`sel-cat-${row.id}`}>
                              <SelectValue placeholder="항목선택" />
                            </SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(c => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {row.status === "done" ? (
                          <Input value={row.purchaseDate || ""} onChange={e => updateMultiResRow(row.id, { purchaseDate: e.target.value })}
                            className="h-7 text-xs w-28" placeholder="YYYY-MM-DD" data-testid={`inp-date-${row.id}`} />
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {row.status === "done" ? (
                          <div className="flex gap-1">
                            <Select value={row.year.toString()} onValueChange={v => updateMultiResRow(row.id, { year: Number(v) })}>
                              <SelectTrigger className="h-7 text-xs w-[4.5rem]" data-testid={`sel-year-${row.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(y => (
                                  <SelectItem key={y} value={y.toString()} className="text-xs">{String(y).slice(2)}년({y})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <Select value={row.month.toString()} onValueChange={v => updateMultiResRow(row.id, { month: Number(v) })}>
                              <SelectTrigger className="h-7 text-xs w-14" data-testid={`sel-month-${row.id}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {MONTHS.map((m, i) => <SelectItem key={i} value={(i+1).toString()} className="text-xs">{m}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        {row.status === "done" ? (
                          <div className="flex flex-col gap-0.5">
                            <Input value={row.totalAmount || ""} onChange={e => updateMultiResRow(row.id, { totalAmount: e.target.value })}
                              className={`h-7 text-xs text-right w-24 ${row.vatAmount === "0" ? "border-orange-400 text-orange-700" : ""}`}
                              placeholder="0" data-testid={`inp-total-${row.id}`} />
                            {row.vatAmount === "0" && (
                              <span className="text-[10px] text-orange-500 text-right">세액제외</span>
                            )}
                          </div>
                        ) : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell>
                        <button onClick={() => setMultiResRows(p => p.filter(r => r.id !== row.id))}
                          className="text-muted-foreground hover:text-red-500" data-testid={`btn-del-multi-${row.id}`}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {/* 숨김 파일 입력 — 결의서 일괄 견적서 공유 업로드용 */}
          <input ref={multiResQuoteRef} type="file" accept="image/*,application/pdf" className="hidden"
            onChange={e => { if (e.target.files?.[0]) { uploadSharedQuote(e.target.files[0]); } e.target.value = ""; }} />

          <DialogFooter className="pt-2 border-t gap-2">
            <Button variant="ghost" onClick={closeMultiResDlg} data-testid="btn-multi-res-cancel">취소</Button>
            <Button
              onClick={submitMultiResRows}
              disabled={multiResSaving || multiResRows.filter(r => r.checked && r.status === "done").length === 0}
              data-testid="btn-multi-res-submit"
            >
              {multiResSaving
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />등록 중...</>
                : <><PackagePlus className="w-4 h-4 mr-1" />{multiResRows.filter(r => r.checked && r.status === "done").length}건 일괄 등록</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 개별 세금계산서 다이얼로그 ══ */}
      <Dialog open={recTaxDlg !== null} onOpenChange={v => { if (!v) setRecTaxDlg(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Receipt className="w-4 h-4 text-amber-500" />
              개별 세금계산서 {recTaxDlg?.taxInvoiceYear ? "수정" : "등록"}
            </DialogTitle>
          </DialogHeader>
          {recTaxDlg && (
            <div className="space-y-4">
              <div className="rounded-md bg-muted/50 px-3 py-2 text-sm">
                <span className="text-muted-foreground">구매 항목: </span>
                <span className="font-medium">{recTaxDlg.itemName}</span>
                <span className="text-muted-foreground ml-2">({recTaxDlg.year}년 {recTaxDlg.month}월 구매)</span>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">세금계산서 발행 연월</Label>
                <div className="grid grid-cols-2 gap-2">
                  <Select value={recTaxYear.toString()} onValueChange={v => setRecTaxYear(Number(v))}>
                    <SelectTrigger data-testid="sel-rec-tax-year"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[currentYear - 1, currentYear, currentYear + 1].map(y => (
                        <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={recTaxMonth.toString()} onValueChange={v => setRecTaxMonth(Number(v))}>
                    <SelectTrigger data-testid="sel-rec-tax-month"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map((m, i) => <SelectItem key={i} value={(i + 1).toString()}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {recTaxMonth !== recTaxDlg.month && (
                  <p className="text-xs text-amber-600 mt-1">⚠ 구매월({recTaxDlg.month}월)과 세금계산서 발행월({recTaxMonth}월)이 다릅니다</p>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">세금계산서 파일 (이미지/PDF)</Label>
                <input ref={recTaxFileRef} type="file" accept="image/*,application/pdf" className="hidden"
                  onChange={e => { if (e.target.files?.[0]) setRecTaxFile(e.target.files[0]); }} />
                <Button variant="outline" size="sm" className="w-full" onClick={() => recTaxFileRef.current?.click()}
                  data-testid="btn-rec-tax-file" disabled={recTaxUploading}>
                  {recTaxUploading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Upload className="w-4 h-4 mr-1" />}
                  {recTaxFile ? recTaxFile.name : (recTaxDlg.taxInvoiceFileUrl ? "파일 교체" : "세금계산서 첨부")}
                </Button>
                {recTaxDlg.taxInvoiceFileUrl && !recTaxFile && (
                  <button onClick={() => setPreview({ url: recTaxDlg.taxInvoiceFileUrl!, title: "개별 세금계산서" })}
                    className="text-xs text-amber-600 flex items-center gap-1 hover:underline">
                    <FileCheck className="w-3 h-3" />현재 첨부파일 보기
                  </button>
                )}
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            {recTaxDlg?.taxInvoiceYear && (
              <Button variant="ghost" size="sm" className="text-red-500 hover:text-red-700 mr-auto"
                onClick={() => recTaxDlg && clearRecTax(recTaxDlg)}
                disabled={updateRecTaxMut.isPending}
                data-testid="btn-rec-tax-clear">
                등록 취소
              </Button>
            )}
            <Button variant="outline" onClick={() => setRecTaxDlg(null)}>닫기</Button>
            <Button onClick={saveRecTax} disabled={recTaxSaving || recTaxUploading}
              className="bg-amber-500 hover:bg-amber-600 text-white"
              data-testid="btn-rec-tax-save">
              {(recTaxSaving || recTaxUploading) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 삭제 확인 ══ */}
      <Dialog open={delConfirm!==null} onOpenChange={() => setDelConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>삭제 확인</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">삭제 후 복구할 수 없습니다. 계속하시겠습니까?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDelConfirm(null)}>취소</Button>
            <Button variant="destructive" data-testid="btn-confirm-delete"
              disabled={deleteMut.isPending}
              onClick={() => {
                if (!delConfirm) return;
                deleteMut.mutate(delConfirm.id);
              }}>
              {deleteMut.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}삭제
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 일괄 삭제 확인 ══ */}
      <Dialog open={bulkDelConfirm} onOpenChange={setBulkDelConfirm}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>일괄 삭제 확인</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            선택한 <span className="font-bold text-destructive">{selectedIds.size}건</span>을 삭제합니다.
            삭제 후 복구할 수 없습니다. 계속하시겠습니까?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDelConfirm(false)}>취소</Button>
            <Button variant="destructive" data-testid="btn-confirm-bulk-delete"
              disabled={bulkDeleteMut.isPending}
              onClick={() => bulkDeleteMut.mutate(Array.from(selectedIds))}>
              {bulkDeleteMut.isPending
                ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />삭제 중...</>
                : `${selectedIds.size}건 삭제`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 법정경비 다운로드 기간 선택 ══ */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Download className="w-4 h-4" />법정경비 다운로드 기간 선택</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <p className="text-sm font-medium mb-2">시작 연월</p>
              <div className="flex gap-2">
                <Select value={String(exportStartYear)} onValueChange={v => setExportStartYear(Number(v))}>
                  <SelectTrigger className="flex-1" data-testid="select-export-start-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(exportStartMonth)} onValueChange={v => setExportStartMonth(Number(v))}>
                  <SelectTrigger className="flex-1" data-testid="select-export-start-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <p className="text-sm font-medium mb-2">종료 연월</p>
              <div className="flex gap-2">
                <Select value={String(exportEndYear)} onValueChange={v => setExportEndYear(Number(v))}>
                  <SelectTrigger className="flex-1" data-testid="select-export-end-year">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(y => (
                      <SelectItem key={y} value={String(y)}>{y}년</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={String(exportEndMonth)} onValueChange={v => setExportEndMonth(Number(v))}>
                  <SelectTrigger className="flex-1" data-testid="select-export-end-month">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <SelectItem key={m} value={String(m)}>{m}월</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              선택 기간의 사용내역(견적서·거래명세서) + 세금계산서가 Excel에 포함됩니다.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExportDialog(false)}>취소</Button>
            <Button
              onClick={handleDownload}
              disabled={downloading || (exportStartYear * 100 + exportStartMonth > exportEndYear * 100 + exportEndMonth)}
              data-testid="btn-confirm-export"
            >
              {downloading ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" />생성 중...</> : <><Download className="w-4 h-4 mr-1" />다운로드</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══ 첨부파일 미리보기 ══ */}
      {preview && (
        <div className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center p-4"
          onClick={() => setPreview(null)}>
          <div className="bg-background rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b">
              <span className="font-semibold text-foreground">{preview.title}</span>
              <button onClick={() => setPreview(null)} data-testid="btn-close-preview" className="text-muted-foreground hover:text-foreground">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5">
              {(preview.url.toLowerCase().endsWith(".pdf") || preview.url.includes("pdf")) ? (
                <iframe src={preview.url} className="w-full h-[70vh] rounded" title={preview.title} />
              ) : (
                <img src={preview.url} alt={preview.title} className="w-full object-contain rounded" />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
