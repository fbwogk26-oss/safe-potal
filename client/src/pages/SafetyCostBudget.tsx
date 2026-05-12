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
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Plus, Trash2, Edit2, Upload, FileText, ImageIcon, Loader2,
  BarChart3, List, X, Download, Receipt, FileCheck, PackagePlus, CheckSquare
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
  quoteFileUrl: "", transactionFileUrl: "", certificateFileUrl: "",
};
const emptyTaxForm = {
  year: currentYear, month: new Date().getMonth() + 1,
  vendorName: "", supplyAmount: "", vatAmount: "", totalAmount: "", notes: "",
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
  purchaseDate: string; vendorName: string; quoteFileUrl: string; transactionFileUrl: string;
}

// ══════════════════════════════════════════════════════════════════
export default function SafetyCostBudget() {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [year, setYear] = useState(currentYear);
  const [activeTab, setActiveTab] = useState<"list" | "summary">("list");
  const [filterCat, setFilterCat] = useState("all");
  const [filterMonth, setFilterMonth] = useState("all");

  // 사용내역 다이얼로그
  const [dlgOpen, setDlgOpen] = useState(false);
  const [editRec, setEditRec] = useState<SafetyCostRecord | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [extracting, setExtracting] = useState<"quote"|"transaction"|null>(null);
  const [extractedItems, setExtractedItems] = useState<ExtractedItem[]>([]);
  const [selItemIdx, setSelItemIdx] = useState(0);

  // 일괄 등록 다이얼로그
  const [bulkDlgOpen, setBulkDlgOpen] = useState(false);
  const [bulkCommon, setBulkCommon] = useState<BulkCommon>({
    year: currentYear, month: new Date().getMonth() + 1,
    category: "", subCategory: "", purchaseDate: "", vendorName: "",
    quoteFileUrl: "", transactionFileUrl: "",
  });
  const [bulkItems, setBulkItems] = useState<BulkItemRow[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);

  // 세금계산서 다이얼로그
  const [taxDlgOpen, setTaxDlgOpen] = useState(false);
  const [editTax, setEditTax] = useState<SafetyCostTaxInvoice | null>(null);
  const [taxForm, setTaxForm] = useState({ ...emptyTaxForm });
  const [taxFile, setTaxFile] = useState<File | null>(null);

  // 첨부파일 미리보기
  const [preview, setPreview] = useState<{ url: string; title: string } | null>(null);
  const [delConfirm, setDelConfirm] = useState<{ type: "record"|"tax"; id: number } | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = useState(false);
  const [certUploading, setCertUploading] = useState(false);

  const quoteRef = useRef<HTMLInputElement>(null);
  const transRef = useRef<HTMLInputElement>(null);
  const taxFileRef = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);

  // ── Queries ──────────────────────────────────────────────────────
  const { data: records = [], isLoading } = useQuery<SafetyCostRecord[]>({
    queryKey: ["/api/safety-cost-records", year],
    queryFn: () => fetch(`/api/safety-cost-records?year=${year}`, { credentials: "include" }).then(r => r.json()),
  });
  const { data: taxInvoices = [] } = useQuery<SafetyCostTaxInvoice[]>({
    queryKey: ["/api/safety-cost-tax-invoices", year],
    queryFn: () => fetch(`/api/safety-cost-tax-invoices?year=${year}`, { credentials: "include" }).then(r => r.json()),
  });

  // ── Mutations ────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: (d: any) => apiRequest("POST", "/api/safety-cost-records", d),
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
  const createTaxMut = useMutation({
    mutationFn: (fd: FormData) => fetch("/api/safety-cost-tax-invoices", { method: "POST", body: fd, credentials: "include" }).then(r => { if (!r.ok) throw new Error("저장 실패"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-tax-invoices"] }); toast({ title: "세금계산서 저장 완료" }); closeTaxDlg(); },
    onError: (e: any) => toast({ title: "저장 실패", description: e.message, variant: "destructive" }),
  });
  const updateTaxMut = useMutation({
    mutationFn: ({ id, fd }: { id: number; fd: FormData }) => fetch(`/api/safety-cost-tax-invoices/${id}`, { method: "PUT", body: fd, credentials: "include" }).then(r => { if (!r.ok) throw new Error("수정 실패"); return r.json(); }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-tax-invoices"] }); toast({ title: "수정 완료" }); closeTaxDlg(); },
  });
  const deleteTaxMut = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/safety-cost-tax-invoices/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/safety-cost-tax-invoices"] }); toast({ title: "삭제 완료" }); setDelConfirm(null); },
  });

  // ── 단일 등록 다이얼로그 헬퍼 ─────────────────────────────────────
  function openAdd() { setEditRec(null); setForm({ ...emptyForm, year }); setExtractedItems([]); setDlgOpen(true); }
  function openEdit(r: SafetyCostRecord) {
    setEditRec(r);
    setForm({ year: r.year, month: r.month, category: r.category, subCategory: r.subCategory||"", itemName: r.itemName,
      specification: r.specification||"", unit: r.unit||"EA", quantity: r.quantity?.toString()||"",
      unitPrice: r.unitPrice?.toString()||"", supplyAmount: r.supplyAmount?.toString()||"",
      vatAmount: r.vatAmount?.toString()||"", totalAmount: r.totalAmount?.toString()||"",
      purchaseDate: r.purchaseDate||"", vendorName: r.vendorName||"", notes: r.notes||"",
      quoteFileUrl: r.quoteFileUrl||"", transactionFileUrl: r.transactionFileUrl||"",
      certificateFileUrl: r.certificateFileUrl||"" });
    setExtractedItems([]); setDlgOpen(true);
  }
  function closeDlg() { setDlgOpen(false); setEditRec(null); setExtractedItems([]); }
  function setF(k: string, v: any) { setForm(p => ({ ...p, [k]: v })); }
  function autoCalc(k: string, v: string) {
    const up = { ...form, [k]: v };
    const q = parseFloat(up.quantity||"0"), u = parseFloat(up.unitPrice||"0");
    if ((k==="quantity"||k==="unitPrice") && !isNaN(q) && !isNaN(u) && q>0 && u>0) {
      const supply = q*u, vat = Math.round(supply*0.1);
      up.supplyAmount = supply.toString(); up.vatAmount = vat.toString(); up.totalAmount = (supply+vat).toString();
    }
    setForm(up);
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
  function openBulkDlg(data: ExtractedData) {
    const items: BulkItemRow[] = (data.items || []).map(it => ({ ...it, checked: true }));
    setBulkItems(items);
    setBulkCommon({
      year, month: new Date().getMonth() + 1,
      category: "", subCategory: "",
      purchaseDate: data.documentDate || "",
      vendorName: data.vendorName || "",
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
    for (const it of selected) {
      try {
        await apiRequest("POST", "/api/safety-cost-records", {
          year: Number(bulkCommon.year), month: Number(bulkCommon.month),
          category: bulkCommon.category, subCategory: bulkCommon.subCategory || null,
          itemName: it.itemName || "품명 미상",
          specification: it.specification || null, unit: it.unit || null,
          quantity: it.quantity || null, unitPrice: it.unitPrice || null,
          supplyAmount: it.supplyAmount || null, vatAmount: it.vatAmount || null,
          totalAmount: String(it.totalAmount),
          purchaseDate: bulkCommon.purchaseDate || null,
          vendorName: bulkCommon.vendorName || null,
          notes: null,
          quoteFileUrl: bulkCommon.quoteFileUrl || null,
          transactionFileUrl: bulkCommon.transactionFileUrl || null,
        });
        success++;
      } catch { fail++; }
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

  // ── 세금계산서 헬퍼 ───────────────────────────────────────────────
  function openAddTax() { setEditTax(null); setTaxForm({ ...emptyTaxForm, year }); setTaxFile(null); setTaxDlgOpen(true); }
  function openAddTaxForMonth(month: number) {
    setEditTax(null); setTaxForm({ ...emptyTaxForm, year, month }); setTaxFile(null); setTaxDlgOpen(true);
  }
  function openEditTax(t: SafetyCostTaxInvoice) {
    setEditTax(t);
    setTaxForm({ year: t.year, month: t.month, vendorName: t.vendorName||"",
      supplyAmount: t.supplyAmount?.toString()||"", vatAmount: t.vatAmount?.toString()||"",
      totalAmount: t.totalAmount?.toString()||"", notes: t.notes||"" });
    setTaxFile(null); setTaxDlgOpen(true);
  }
  function closeTaxDlg() { setTaxDlgOpen(false); setEditTax(null); setTaxFile(null); }
  function setTF(k: string, v: any) { setTaxForm(p => ({ ...p, [k]: v })); }
  function taxAutoCalc(k: string, v: string) {
    const up = { ...taxForm, [k]: v };
    const s = parseFloat(up.supplyAmount||"0"), va = parseFloat(up.vatAmount||"0");
    if ((k==="supplyAmount"||k==="vatAmount") && !isNaN(s) && !isNaN(va) && s>0) {
      up.totalAmount = (s + (isNaN(va)?0:va)).toString();
      if (k==="supplyAmount" && !taxForm.vatAmount) up.vatAmount = Math.round(s*0.1).toString(), up.totalAmount=(s+Math.round(s*0.1)).toString();
    }
    setTaxForm(up);
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
      year: Number(form.year), month: Number(form.month), category: form.category,
      subCategory: form.subCategory||null, itemName: form.itemName,
      specification: form.specification||null, unit: form.unit||null,
      quantity: form.quantity||null, unitPrice: form.unitPrice||null,
      supplyAmount: form.supplyAmount||null, vatAmount: form.vatAmount||null,
      totalAmount: form.totalAmount, purchaseDate: form.purchaseDate||null,
      vendorName: form.vendorName||null, notes: form.notes||null,
      quoteFileUrl: form.quoteFileUrl||null, transactionFileUrl: form.transactionFileUrl||null,
      certificateFileUrl: form.certificateFileUrl||null,
    };
    if (editRec) updateMut.mutate({ id: editRec.id, d: payload }); else createMut.mutate(payload);
  }

  function handleTaxSubmit() {
    if (!taxForm.totalAmount) { toast({ title: "합계금액 필수", variant:"destructive" }); return; }
    const fd = new FormData();
    const body = { year: Number(taxForm.year), month: Number(taxForm.month),
      vendorName: taxForm.vendorName||null, supplyAmount: taxForm.supplyAmount||null,
      vatAmount: taxForm.vatAmount||null, totalAmount: taxForm.totalAmount, notes: taxForm.notes||null };
    fd.append("data", JSON.stringify(body));
    if (taxFile) fd.append("file", taxFile);
    if (editTax) updateTaxMut.mutate({ id: editTax.id, fd }); else createTaxMut.mutate(fd);
  }

  // ── 다운로드 ──────────────────────────────────────────────────────
  async function handleDownload() {
    setDownloading(true);
    try {
      const r = await fetch(`/api/safety-cost-records/export?year=${year}`, { credentials:"include" });
      if (!r.ok) throw new Error("다운로드 실패");
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a"); a.href=url;
      a.download=`${year}년_산업안전보건관리비_법정경비.xlsx`; a.click();
      URL.revokeObjectURL(url);
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
  const taxGrandTotal = taxInvoices.reduce((s,t) => s+toNum(t.totalAmount), 0);
  const catIdx = (cat: string) => CATEGORIES.indexOf(cat);
  // 월별 세금계산서 map (month → invoice)
  const monthTaxMap: Record<number, SafetyCostTaxInvoice> = {};
  taxInvoices.forEach(t => { if (!monthTaxMap[t.month]) monthTaxMap[t.month] = t; });

  const bulkSelectedTotal = bulkItems.filter(it => it.checked).reduce((s, it) => s + toNum(it.totalAmount), 0);
  const bulkSelectedCount = bulkItems.filter(it => it.checked).length;

  // ══════════════════════════════════════════════════════════════════
  return (
    <div className="p-4 md:p-6 space-y-4">
      {/* ── 헤더 ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-foreground">산업안전보건관리비 사용내역</h1>
          <p className="text-sm text-muted-foreground">대구본부 · {year}년 법정경비 관리</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={year.toString()} onValueChange={v => setYear(Number(v))}>
            <SelectTrigger className="w-24" data-testid="select-year"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[currentYear-1, currentYear, currentYear+1].map(y => (
                <SelectItem key={y} value={y.toString()}>{y}년</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={handleDownloadTemplate} disabled={downloadingTemplate} data-testid="button-download-template">
            {downloadingTemplate ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            사용내역 다운로드
          </Button>
          <Button variant="outline" onClick={handleDownload} disabled={downloading} data-testid="button-download">
            {downloading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Download className="w-4 h-4 mr-1" />}
            법정경비 다운로드
          </Button>
          <Button onClick={openAdd} data-testid="button-add-record">
            <Plus className="w-4 h-4 mr-1" /> 지출 등록
          </Button>
        </div>
      </div>

      {/* ── 요약 카드 ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="col-span-2 md:col-span-1 border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-3">
            <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">연간 총 지출</div>
            <div className="text-2xl font-bold text-primary mt-1">{fmtMan(grandTotal)}</div>
            <div className="text-xs text-muted-foreground mt-1 flex gap-2">
              <span>사용내역 {records.length}건</span>
              <span>·</span>
              <span>세금계산서 {taxInvoices.length}건</span>
            </div>
          </CardContent>
        </Card>
        {catTotals.filter(c=>c.total>0).slice(0,3).map((c,i) => (
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
                    <TableHead className="w-10 text-center">월</TableHead>
                    <TableHead>항목</TableHead>
                    <TableHead>품명</TableHead>
                    <TableHead>업체명</TableHead>
                    <TableHead className="text-right">수량</TableHead>
                    <TableHead className="text-right">단가</TableHead>
                    <TableHead className="text-right">공급가액</TableHead>
                    <TableHead className="text-right">세액</TableHead>
                    <TableHead className="text-right font-semibold">합계</TableHead>
                    <TableHead className="w-24 text-center">첨부/세금계산서</TableHead>
                    <TableHead className="w-14 text-center">관리</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map(rec => {
                    const ci = catIdx(rec.category);
                    return (
                      <TableRow key={rec.id} className="hover:bg-muted/30" data-testid={`row-record-${rec.id}`}>
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
                        <TableCell className="text-sm">{rec.vendorName||"-"}</TableCell>
                        <TableCell className="text-right text-sm">{rec.quantity ? `${fmtNum(rec.quantity)}${rec.unit?" "+rec.unit:""}` : "-"}</TableCell>
                        <TableCell className="text-right text-sm">{rec.unitPrice ? fmt(rec.unitPrice) : "-"}</TableCell>
                        <TableCell className="text-right text-sm">{rec.supplyAmount ? fmt(rec.supplyAmount) : "-"}</TableCell>
                        <TableCell className="text-right text-sm">{rec.vatAmount ? fmt(rec.vatAmount) : "-"}</TableCell>
                        <TableCell className="text-right font-bold text-sm">{fmt(rec.totalAmount)}</TableCell>
                        <TableCell className="text-center">
                          <div className="flex gap-1 justify-center flex-wrap">
                            {rec.quoteFileUrl && (
                              <button onClick={() => setPreview({ url: rec.quoteFileUrl!, title: "견적서" })}
                                className="text-blue-500 hover:text-blue-700 transition-colors" title="견적서" data-testid={`btn-quote-${rec.id}`}>
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                            {rec.transactionFileUrl && (
                              <button onClick={() => setPreview({ url: rec.transactionFileUrl!, title: "거래명세서" })}
                                className="text-emerald-500 hover:text-emerald-700 transition-colors" title="거래명세서" data-testid={`btn-trans-${rec.id}`}>
                                <FileText className="w-4 h-4" />
                              </button>
                            )}
                            {rec.certificateFileUrl && (
                              <button onClick={() => setPreview({ url: rec.certificateFileUrl!, title: "수료증" })}
                                className="text-orange-500 hover:text-orange-700 transition-colors" title="수료증/이수증" data-testid={`btn-cert-${rec.id}`}>
                                <FileCheck className="w-4 h-4" />
                              </button>
                            )}
                            {/* 월별 세금계산서 */}
                            {monthTaxMap[rec.month] ? (
                              <button
                                onClick={() => monthTaxMap[rec.month].fileUrl
                                  ? setPreview({ url: monthTaxMap[rec.month].fileUrl!, title: `${rec.month}월 세금계산서` })
                                  : openEditTax(monthTaxMap[rec.month])
                                }
                                className="text-violet-500 hover:text-violet-700 transition-colors" title={`${rec.month}월 세금계산서`}
                                data-testid={`btn-tax-month-${rec.id}`}>
                                <Receipt className="w-4 h-4" />
                              </button>
                            ) : (
                              <button onClick={() => openAddTaxForMonth(rec.month)}
                                className="text-muted-foreground/30 hover:text-violet-400 transition-colors" title={`${rec.month}월 세금계산서 등록`}
                                data-testid={`btn-tax-add-month-${rec.id}`}>
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
        </TabsContent>

        {/* ══ 항목별 요약 탭 ══ */}
        <TabsContent value="summary" className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {catTotals.map((c, i) => (
              <div key={i} className={`rounded-xl border p-4 transition-all ${c.total===0 ? "opacity-40" : "hover:shadow-sm"}`}>
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-0.5">항목 {i+1}</div>
                    <div className="text-sm font-semibold leading-tight text-foreground">{c.cat.split(". ")[1]}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-bold text-foreground">{c.total>0 ? fmtMan(c.total) : "-"}</div>
                    <div className="text-xs text-muted-foreground">{c.count}건</div>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden mb-3">
                  <div className={`h-full rounded-full transition-all ${c.color.bar}`} style={{ width:`${c.pct}%` }} />
                </div>
                {c.total > 0 && (
                  <div className="flex gap-0.5 items-end h-8">
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
            ))}
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

      </Tabs>

      {/* ══ 지출 등록/수정 다이얼로그 ══ */}
      <Dialog open={dlgOpen} onOpenChange={setDlgOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editRec ? "사용내역 수정" : "사용내역 등록"}</DialogTitle>
          </DialogHeader>

          {/* AI 첨부 */}
          <div className="space-y-3 border rounded-xl p-3 bg-muted/20">
            <div className="text-sm font-semibold flex items-center gap-2 text-foreground">
              <Upload className="w-4 h-4" /> AI 자동 입력 (견적서 / 거래명세서)
              <span className="text-xs font-normal text-muted-foreground">· 이미지 및 PDF 지원</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
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

            {/* 수료증/이수증 — 안전교육비(5항) 선택 시 표시 */}
            {form.category === CATEGORIES[4] && (
              <div className="border-t pt-2 mt-1">
                <div className="text-xs font-semibold text-orange-600 flex items-center gap-1 mb-1.5">
                  <FileCheck className="w-3.5 h-3.5" /> 수료증 / 이수증 첨부 (5항 교육비)
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

          <div className="grid grid-cols-3 gap-3">
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
          <div className="grid grid-cols-2 gap-3">
            <div><Label>세부항목</Label><Input placeholder="세부항목" value={form.subCategory} onChange={e=>setF("subCategory",e.target.value)} /></div>
            <div><Label>업체명</Label><Input placeholder="공급업체명" value={form.vendorName} onChange={e=>setF("vendorName",e.target.value)} data-testid="input-vendor" /></div>
          </div>
          <div><Label>품명 *</Label><Input placeholder="품명" value={form.itemName} onChange={e=>setF("itemName",e.target.value)} data-testid="input-item-name" /></div>
          <div><Label>규격</Label><Input placeholder="규격" value={form.specification} onChange={e=>setF("specification",e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>단위</Label>
              <Select value={form.unit} onValueChange={v=>setF("unit",v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["EA","개","식","세트","쌍","묶음","kg","L","m"].map(u=><SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>수량</Label><Input type="number" placeholder="0" value={form.quantity} onChange={e=>autoCalc("quantity",e.target.value)} data-testid="input-quantity" /></div>
            <div><Label>단가</Label><Input type="number" placeholder="0" value={form.unitPrice} onChange={e=>autoCalc("unitPrice",e.target.value)} data-testid="input-unit-price" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>공급가액</Label><Input type="number" placeholder="0" value={form.supplyAmount} onChange={e=>setF("supplyAmount",e.target.value)} /></div>
            <div><Label>세액</Label><Input type="number" placeholder="0" value={form.vatAmount} onChange={e=>setF("vatAmount",e.target.value)} /></div>
            <div><Label className="font-semibold">합계(VAT포함) *</Label><Input type="number" placeholder="0" value={form.totalAmount} onChange={e=>setF("totalAmount",e.target.value)} className="font-semibold" data-testid="input-total" /></div>
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

      {/* ══ 세금계산서 등록/수정 다이얼로그 ══ */}
      <Dialog open={taxDlgOpen} onOpenChange={setTaxDlgOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTax ? "세금계산서 수정" : "세금계산서 등록"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div><Label>연도 *</Label>
              <Select value={taxForm.year.toString()} onValueChange={v=>setTF("year",Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{[currentYear-1,currentYear,currentYear+1].map(y=><SelectItem key={y} value={y.toString()}>{y}년</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>월 *</Label>
              <Select value={taxForm.month.toString()} onValueChange={v=>setTF("month",Number(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{MONTHS.map((m,i)=><SelectItem key={i} value={(i+1).toString()}>{m}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <div><Label>업체명</Label><Input placeholder="공급업체명" value={taxForm.vendorName} onChange={e=>setTF("vendorName",e.target.value)} data-testid="input-tax-vendor" /></div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label>공급가액</Label><Input type="number" placeholder="0" value={taxForm.supplyAmount} onChange={e=>taxAutoCalc("supplyAmount",e.target.value)} /></div>
            <div><Label>세액</Label><Input type="number" placeholder="0" value={taxForm.vatAmount} onChange={e=>taxAutoCalc("vatAmount",e.target.value)} /></div>
            <div><Label className="font-semibold">합계 *</Label><Input type="number" placeholder="0" value={taxForm.totalAmount} onChange={e=>setTF("totalAmount",e.target.value)} className="font-semibold" data-testid="input-tax-total" /></div>
          </div>
          <div><Label>비고</Label><Input placeholder="비고" value={taxForm.notes} onChange={e=>setTF("notes",e.target.value)} /></div>
          <div className="space-y-2">
            <Label>세금계산서 파일</Label>
            <input ref={taxFileRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={e => { if (e.target.files?.[0]) setTaxFile(e.target.files[0]); }} />
            <Button variant="outline" size="sm" className="w-full" onClick={() => taxFileRef.current?.click()} data-testid="btn-tax-file">
              <Upload className="w-4 h-4 mr-1" />
              {taxFile ? taxFile.name : (editTax?.fileUrl ? "파일 교체" : "세금계산서 첨부 (이미지/PDF)")}
            </Button>
            {editTax?.fileUrl && !taxFile && (
              <button onClick={() => setPreview({ url: editTax.fileUrl!, title: "세금계산서" })}
                className="text-xs text-violet-600 flex items-center gap-1 hover:underline">
                <FileCheck className="w-3 h-3" />현재 첨부파일 보기
              </button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeTaxDlg}>취소</Button>
            <Button onClick={handleTaxSubmit} disabled={createTaxMut.isPending||updateTaxMut.isPending} data-testid="btn-tax-submit">
              {(createTaxMut.isPending||updateTaxMut.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {editTax ? "수정 저장" : "등록"}
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
              disabled={deleteMut.isPending||deleteTaxMut.isPending}
              onClick={() => {
                if (!delConfirm) return;
                if (delConfirm.type==="record") deleteMut.mutate(delConfirm.id);
                else deleteTaxMut.mutate(delConfirm.id);
              }}>
              {(deleteMut.isPending||deleteTaxMut.isPending) && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}삭제
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
