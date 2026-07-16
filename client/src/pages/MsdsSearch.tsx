import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import type { Chemical, InsertChemical } from "@shared/schema";
import { useHeadquarters } from "@/contexts/HeadquartersContext";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

import {
  FlaskConical,
  Search,
  Plus,
  Trash2,
  PenLine,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Shield,
  Pill,
  Package,
  HandMetal,
  Warehouse,
  StickyNote,
  FileText,
  Upload,
  Download,
  Eye,
  Loader2,
  X,
  CheckSquare,
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIES = [
  "유해화학물질",
  "인화성물질",
  "부식성물질",
  "독성물질",
  "산화성물질",
  "폭발성물질",
  "환경유해물질",
  "기타",
];

function getHazardBadgeVariant(category: string | null | undefined): {
  className: string;
  label: string;
} {
  if (!category) return { className: "bg-muted text-muted-foreground", label: "미분류" };
  if (category.includes("폭발") || category.includes("독성"))
    return { className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", label: category };
  if (category.includes("인화") || category.includes("산화"))
    return { className: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", label: category };
  if (category.includes("부식") || category.includes("유해"))
    return { className: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400", label: category };
  if (category.includes("환경"))
    return { className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", label: category };
  return { className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", label: category };
}

const EMPTY_FORM: InsertChemical = {
  name: "",
  casNumber: "",
  category: "",
  hazards: "",
  emergencyProcedures: "",
  handlingPrecautions: "",
  storageRequirements: "",
  ppe: "",
  firstAid: "",
  notes: "",
  pdfUrl: "",
  pdfFileName: "",
  pdfFileType: "",
  createdBy: "",
};

export default function MsdsSearch() {
  const { headquarters } = useHeadquarters();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canEditMsds, canDownloadMsdsPdf } = usePermissions();
  const canEdit = canEditMsds;
  const { user } = useAuth();
  const isOwner = (createdBy?: string | null) => !createdBy || user?.role === "admin" || user?.username === createdBy;

  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<InsertChemical>({ ...EMPTY_FORM });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isBulkDownloading, setIsBulkDownloading] = useState(false);
  const [previewChemical, setPreviewChemical] = useState<Chemical | null>(null);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [bulkDownloadProgress, setBulkDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: chemicals, isLoading } = useQuery<Chemical[]>({
    queryKey: ["/api/chemicals", headquarters, searchQuery],
    queryFn: () => {
      const params = new URLSearchParams({ headquarters });
      if (searchQuery) params.set("search", searchQuery);
      return fetch(`/api/chemicals?${params.toString()}`, { credentials: "include" }).then(r => r.json());
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertChemical) => {
      return apiRequest("POST", "/api/chemicals", { ...data, headquarters });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemicals"] });
      toast({ title: "등록 완료", description: "화학물질이 등록되었습니다." });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ variant: "destructive", title: "오류", description: "등록에 실패했습니다." });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: InsertChemical }) => {
      return apiRequest("PUT", `/api/chemicals/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemicals"] });
      toast({ title: "수정 완료", description: "화학물질 정보가 수정되었습니다." });
      setDialogOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ variant: "destructive", title: "오류", description: "수정에 실패했습니다." });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/chemicals/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/chemicals"] });
      toast({ title: "삭제 완료", description: "화학물질이 삭제되었습니다." });
      setDeleteConfirmId(null);
    },
    onError: () => {
      toast({ variant: "destructive", title: "오류", description: "삭제에 실패했습니다." });
    },
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("DELETE", "/api/chemicals/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/chemicals"] });
      setSelectedIds(new Set()); setSelectionMode(false);
      toast({ title: `${data.deleted ?? selectedIds.size}건 삭제 완료` });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const toggleSelect = (id: number) => setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const resetForm = () => {
    setFormData({ ...EMPTY_FORM });
    setEditingId(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEditDialog = (chemical: Chemical) => {
    setEditingId(chemical.id);
    setFormData({
      name: chemical.name,
      casNumber: chemical.casNumber || "",
      category: chemical.category || "",
      hazards: chemical.hazards || "",
      emergencyProcedures: chemical.emergencyProcedures || "",
      handlingPrecautions: chemical.handlingPrecautions || "",
      storageRequirements: chemical.storageRequirements || "",
      ppe: chemical.ppe || "",
      firstAid: chemical.firstAid || "",
      notes: chemical.notes || "",
      pdfUrl: chemical.pdfUrl || "",
      pdfFileName: chemical.pdfFileName || "",
      pdfFileType: chemical.pdfFileType || "",
      createdBy: chemical.createdBy || "",
    });
    setDialogOpen(true);
  };

  const handleSubmit = () => {
    if (!formData.name.trim()) {
      toast({ variant: "destructive", title: "물질명을 입력해주세요." });
      return;
    }
    if (editingId !== null) {
      updateMutation.mutate({ id: editingId, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const updateField = (field: keyof InsertChemical, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({ variant: "destructive", title: "PDF 파일만 업로드 가능합니다." });
      return;
    }

    const maxSize = 50 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ variant: "destructive", title: "파일 크기 초과", description: "50MB 이하의 파일만 업로드 가능합니다." });
      return;
    }

    setIsUploading(true);
    try {
      const urlRes = await fetch('/api/uploads/request-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
      });
      if (!urlRes.ok) {
        const err = await urlRes.json().catch(() => ({}));
        throw new Error(err.error || "업로드 URL 요청 실패");
      }
      const { uploadURL, objectPath } = await urlRes.json();

      const uploadRes = await fetch(uploadURL, {
        method: 'PUT',
        body: file,
        headers: { 'Content-Type': file.type },
      });
      if (!uploadRes.ok) throw new Error("파일 업로드 실패");

      setFormData(prev => ({
        ...prev,
        pdfUrl: objectPath,
        pdfFileName: file.name,
        pdfFileType: file.type,
      }));
      toast({ title: "PDF 업로드 완료" });
    } catch (err: any) {
      toast({ variant: "destructive", title: "업로드 실패", description: err?.message || "파일 업로드 중 오류가 발생했습니다." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const getSignedUrl = async (objectPath: string): Promise<string> => {
    if (objectPath.startsWith("/uploads/") || objectPath.startsWith("/public-uploads/")) {
      return objectPath;
    }
    const res = await fetch(`/api/download?path=${encodeURIComponent(objectPath)}&ttl=3600`, { credentials: "include" });
    if (!res.ok) throw new Error("서명 URL 생성 실패");
    const { url } = await res.json();
    return url;
  };

  const downloadFile = async (pdfUrl: string, pdfFileName: string): Promise<void> => {
    const url = await getSignedUrl(pdfUrl);
    const a = document.createElement("a");
    a.href = url;
    a.download = pdfFileName;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handlePreviewPdf = async (chemical: Chemical, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    setPreviewChemical(chemical);
    setIsPreviewLoading(true);
    setPreviewBlobUrl(null);
    try {
      const signedUrl = await getSignedUrl(chemical.pdfUrl!);
      setPreviewBlobUrl(signedUrl);
    } catch {
      toast({ variant: "destructive", title: "미리보기 실패", description: "PDF를 불러올 수 없습니다." });
      setPreviewChemical(null);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewBlobUrl(null);
    setPreviewChemical(null);
  };

  const handleDownloadPdf = async (pdfUrl: string, pdfFileName: string, e?: React.MouseEvent) => {
    e?.preventDefault();
    e?.stopPropagation();
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadFile(pdfUrl, pdfFileName);
    } catch (err) {
      toast({ variant: "destructive", title: "다운로드 실패", description: "PDF를 다운로드할 수 없습니다." });
    } finally {
      setIsDownloading(false);
    }
  };

  const handleBulkDownload = async () => {
    const targets = chemicals?.filter(c => selectedIds.has(c.id) && c.pdfUrl) ?? [];
    if (targets.length === 0) {
      toast({ variant: "destructive", title: "다운로드할 PDF가 없습니다", description: "선택한 항목 중 PDF가 등록된 자료가 없습니다." });
      return;
    }
    setIsBulkDownloading(true);
    setBulkDownloadProgress({ done: 0, total: targets.length });
    let success = 0;
    for (let i = 0; i < targets.length; i++) {
      const c = targets[i];
      try {
        await downloadFile(c.pdfUrl!, c.pdfFileName || `${c.name}_MSDS.pdf`);
        success++;
      } catch {}
      setBulkDownloadProgress({ done: i + 1, total: targets.length });
      if (i < targets.length - 1) await new Promise(r => setTimeout(r, 600));
    }
    setIsBulkDownloading(false);
    setBulkDownloadProgress(null);
    toast({ title: `${success}/${targets.length}건 다운로드 완료` });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <div className="bg-teal-100 p-2 sm:p-2.5 rounded-lg sm:rounded-xl text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
          <FlaskConical className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
        </div>
        <div className="min-w-0">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
            MSDS 물질안전보건자료
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            화학물질 안전 정보 검색
          </p>
        </div>
        {(canEdit || canDownloadMsdsPdf) && (
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant={selectionMode ? "default" : "outline"}
              size="sm"
              className={`gap-2 ${selectionMode ? "bg-teal-600 hover:bg-teal-700 text-white" : ""}`}
              onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
              data-testid="button-toggle-selection"
            >
              <CheckSquare className="w-4 h-4" />
              {selectionMode ? "취소" : "선택"}
            </Button>
            {canEdit && (
              <Button
                onClick={openCreateDialog}
                className="gap-2"
                data-testid="button-add-chemical"
              >
                <Plus className="w-4 h-4" />
                물질 등록
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="물질명 또는 CAS 번호로 검색..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
          data-testid="input-search-chemical"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-48" />
                <Skeleton className="h-4 w-32 mt-2" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-4 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : !chemicals || chemicals.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <FlaskConical className="w-12 h-12 mb-4 opacity-30" />
            <p className="text-lg font-medium">
              {searchQuery ? "검색 결과가 없습니다" : "등록된 화학물질이 없습니다"}
            </p>
            <p className="text-sm mt-1">
              {searchQuery
                ? "다른 검색어를 시도해보세요."
                : canEdit
                  ? "물질 등록 버튼을 눌러 새로운 화학물질을 등록하세요."
                  : "관리자에게 문의하세요."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          <AnimatePresence>
            {chemicals.map((chemical) => {
              const badge = getHazardBadgeVariant(chemical.category);
              const isExpanded = expandedId === chemical.id;
              return (
                <motion.div
                  key={chemical.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  data-testid={`card-chemical-${chemical.id}`}
                >
                  <Card className={`hover-elevate ${selectionMode && selectedIds.has(chemical.id) ? "border-red-400 bg-red-50/50 dark:bg-red-900/20" : ""}`}>
                    <CardHeader
                      className="cursor-pointer"
                      onClick={() => selectionMode ? toggleSelect(chemical.id) : toggleExpand(chemical.id)}
                      data-testid={`button-expand-chemical-${chemical.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0 flex-wrap">
                          {selectionMode && (
                            <Checkbox
                              checked={selectedIds.has(chemical.id)}
                              onCheckedChange={() => toggleSelect(chemical.id)}
                              onClick={e => e.stopPropagation()}
                              data-testid={`checkbox-chemical-${chemical.id}`}
                            />
                          )}
                          <CardTitle className="text-base sm:text-lg">
                            {chemical.name}
                          </CardTitle>
                          {chemical.casNumber && (
                            <span className="text-sm text-muted-foreground font-mono">
                              CAS: {chemical.casNumber}
                            </span>
                          )}
                          <Badge
                            variant="outline"
                            className={`no-default-hover-elevate no-default-active-elevate ${badge.className}`}
                          >
                            {badge.label}
                          </Badge>
                          {chemical.pdfUrl && (
                            <Badge variant="secondary" className="gap-1 text-[10px] px-1.5 py-0 no-default-hover-elevate no-default-active-elevate">
                              <FileText className="w-3 h-3" /> PDF
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {chemical.pdfUrl && canDownloadMsdsPdf && (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={(e) => handlePreviewPdf(chemical, e)}
                              title="PDF 미리보기"
                              data-testid={`button-preview-pdf-${chemical.id}`}
                            >
                              <Eye className="w-4 h-4 text-red-500" />
                            </Button>
                          )}
                          {canEdit && isOwner(chemical.createdBy) && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEditDialog(chemical);
                                }}
                                data-testid={`button-edit-chemical-${chemical.id}`}
                              >
                                <PenLine className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeleteConfirmId(chemical.id);
                                }}
                                data-testid={`button-delete-chemical-${chemical.id}`}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </>
                          )}
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                      {chemical.hazards && !isExpanded && (
                        <p className="text-sm text-muted-foreground line-clamp-1 mt-1">
                          {chemical.hazards}
                        </p>
                      )}
                    </CardHeader>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden"
                        >
                          <CardContent className="pt-0 space-y-4">
                            {chemical.pdfUrl && canDownloadMsdsPdf && (
                              <Button
                                variant="outline"
                                className="w-full gap-2"
                                onClick={() => handlePreviewPdf(chemical)}
                                data-testid={`button-preview-pdf-detail-${chemical.id}`}
                              >
                                <Eye className="w-4 h-4 text-red-500" />
                                {`${chemical.pdfFileName || 'MSDS.pdf'} 미리보기`}
                              </Button>
                            )}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                              {chemical.hazards && (
                                <DetailSection
                                  icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
                                  title="위험성"
                                  content={chemical.hazards}
                                />
                              )}
                              {chemical.emergencyProcedures && (
                                <DetailSection
                                  icon={<Pill className="w-4 h-4 text-orange-500" />}
                                  title="응급조치요령"
                                  content={chemical.emergencyProcedures}
                                />
                              )}
                              {chemical.handlingPrecautions && (
                                <DetailSection
                                  icon={<HandMetal className="w-4 h-4 text-yellow-600" />}
                                  title="취급주의사항"
                                  content={chemical.handlingPrecautions}
                                />
                              )}
                              {chemical.storageRequirements && (
                                <DetailSection
                                  icon={<Warehouse className="w-4 h-4 text-blue-500" />}
                                  title="저장방법"
                                  content={chemical.storageRequirements}
                                />
                              )}
                              {chemical.ppe && (
                                <DetailSection
                                  icon={<Shield className="w-4 h-4 text-green-500" />}
                                  title="보호구"
                                  content={chemical.ppe}
                                />
                              )}
                              {chemical.firstAid && (
                                <DetailSection
                                  icon={<Package className="w-4 h-4 text-purple-500" />}
                                  title="응급처치"
                                  content={chemical.firstAid}
                                />
                              )}
                              {chemical.notes && (
                                <DetailSection
                                  icon={<StickyNote className="w-4 h-4 text-muted-foreground" />}
                                  title="비고"
                                  content={chemical.notes}
                                />
                              )}
                            </div>
                          </CardContent>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId !== null ? "화학물질 수정" : "화학물질 등록"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chem-name">물질명 *</Label>
              <Input
                id="chem-name"
                placeholder="예: 아세톤"
                value={formData.name}
                onChange={(e) => updateField("name", e.target.value)}
                data-testid="input-chemical-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="chem-cas">CAS번호</Label>
                <Input
                  id="chem-cas"
                  placeholder="예: 67-64-1"
                  value={formData.casNumber || ""}
                  onChange={(e) => updateField("casNumber", e.target.value)}
                  data-testid="input-chemical-cas"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="chem-category">분류</Label>
                <Select
                  value={formData.category || ""}
                  onValueChange={(v) => updateField("category", v)}
                >
                  <SelectTrigger data-testid="select-chemical-category">
                    <SelectValue placeholder="분류 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((cat) => (
                      <SelectItem key={cat} value={cat}>
                        {cat}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>MSDS PDF 파일</Label>
              <input
                type="file"
                accept=".pdf"
                ref={fileInputRef}
                onChange={handlePdfUpload}
                className="hidden"
                data-testid="input-chemical-pdf"
              />
              {formData.pdfUrl ? (
                <div className="relative border rounded-lg p-3">
                  <div className="flex items-center gap-3 pr-8">
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center">
                      <FileText className="w-5 h-5 text-red-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{formData.pdfFileName || 'MSDS.pdf'}</p>
                      <p className="text-xs text-muted-foreground">PDF 파일</p>
                    </div>
                  </div>
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute top-2 right-2 h-6 w-6"
                    onClick={() => setFormData(prev => ({ ...prev, pdfUrl: "", pdfFileName: "", pdfFileType: "" }))}
                    data-testid="button-remove-pdf"
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-2 w-full"
                  data-testid="button-upload-pdf"
                >
                  {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                  {isUploading ? "업로드 중..." : "PDF 파일 첨부"}
                </Button>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel-chemical"
            >
              취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit-chemical"
            >
              {createMutation.isPending || updateMutation.isPending
                ? "저장 중..."
                : editingId !== null
                  ? "수정"
                  : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={deleteConfirmId !== null}
        onOpenChange={() => setDeleteConfirmId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>삭제 확인</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            이 화학물질 정보를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setDeleteConfirmId(null)}
              data-testid="button-cancel-delete"
            >
              취소
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteConfirmId !== null && deleteMutation.mutate(deleteConfirmId)}
              disabled={deleteMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteMutation.isPending ? "삭제 중..." : "삭제"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* PDF 미리보기 다이얼로그 */}
      <Dialog open={!!previewChemical} onOpenChange={open => { if (!open) closePreview(); }}>
        <DialogContent className="max-w-4xl w-[95vw] h-[90vh] flex flex-col p-0 gap-0">
          <DialogHeader className="px-5 pt-4 pb-3 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-red-500" />
              {previewChemical?.pdfFileName || 'MSDS.pdf'}
              <span className="text-muted-foreground font-normal text-sm ml-1">— {previewChemical?.name}</span>
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden flex flex-col">
            {isPreviewLoading ? (
              <div className="flex-1 flex items-center justify-center gap-2 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>PDF 불러오는 중...</span>
              </div>
            ) : previewBlobUrl ? (
              <iframe
                src={previewBlobUrl}
                className="flex-1 w-full border-0"
                title="PDF 미리보기"
              />
            ) : null}
          </div>
          <div className="px-5 py-3 border-t flex justify-between items-center flex-shrink-0 gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={!previewBlobUrl}
              onClick={() => {
                if (!previewBlobUrl || !previewChemical) return;
                const a = document.createElement("a");
                a.href = previewBlobUrl;
                a.download = previewChemical.pdfFileName || "MSDS.pdf";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
              }}
              data-testid="button-preview-download"
            >
              <Download className="w-4 h-4" />
              다운로드
            </Button>
            <Button variant="outline" size="sm" onClick={closePreview} data-testid="button-preview-close">
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 플로팅 벌크 액션 바 */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-2xl px-5 py-3">
          <span className="text-sm font-semibold text-teal-700 dark:text-teal-400">
            {selectedIds.size}건 선택됨
          </span>
          <div className="w-px h-5 bg-border" />
          <Button variant="ghost" size="sm" className="h-8"
            onClick={() => setSelectedIds(new Set())}>
            <X className="w-3.5 h-3.5 mr-1" />선택 해제
          </Button>
          {canDownloadMsdsPdf && (
            <Button
              variant="outline" size="sm" className="h-8 gap-1.5 border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-400"
              disabled={isBulkDownloading}
              onClick={handleBulkDownload}
              data-testid="button-bulk-download"
            >
              {isBulkDownloading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  {bulkDownloadProgress ? `${bulkDownloadProgress.done}/${bulkDownloadProgress.total}` : "준비 중..."}
                </>
              ) : (
                <>
                  <Download className="w-3.5 h-3.5" />
                  PDF 일괄 다운로드
                </>
              )}
            </Button>
          )}
          {canEdit && (
            <>
              <div className="w-px h-5 bg-border" />
              <Button
                variant="destructive" size="sm" className="h-8"
                disabled={bulkDeleteMutation.isPending}
                onClick={() => { if (confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`)) bulkDeleteMutation.mutate(Array.from(selectedIds)); }}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function DetailSection({
  icon,
  title,
  content,
}: {
  icon: React.ReactNode;
  title: string;
  content: string;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </div>
      <p className="text-sm text-muted-foreground whitespace-pre-wrap pl-6">
        {content}
      </p>
    </div>
  );
}
