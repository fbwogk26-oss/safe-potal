import { useNotices, useCreateNotice, useDeleteNotice, useUpdateNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ShieldCheck, Plus, Trash2, Search, ImagePlus, X, Eye, FileText,
  Calendar, Image, CheckSquare, FileUp, Download, Loader2, Pencil, ZoomIn,
} from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";

type Attachment = { url: string; name: string; type: "image" | "pdf" };

const MAX_IMAGES = 3;

async function uploadFile(file: File): Promise<string> {
  const urlRes = await fetch("/api/uploads/request-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
  });
  if (!urlRes.ok) throw new Error("URL 요청 실패");
  const { uploadURL, objectPath } = await urlRes.json();
  const putRes = await fetch(uploadURL, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!putRes.ok) throw new Error("업로드 실패");
  return objectPath as string;
}

type RuleRecord = {
  id: number;
  category: string;
  title: string;
  content: string;
  imageUrl: string | null;
  attachments?: Attachment[] | null;
  createdAt: Date | null;
  createdBy?: string | null;
};

function useAttachmentForm(initial?: Attachment[]) {
  const [attachments, setAttachments] = useState<Attachment[]>(initial || []);
  const [uploadingIdx, setUploadingIdx] = useState<string | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const imageAttachments = attachments.filter((a) => a.type === "image");
  const pdfAttachment = attachments.find((a) => a.type === "pdf");
  const isUploading = uploadingIdx !== null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    const remaining = MAX_IMAGES - imageAttachments.length;
    const toUpload = files.slice(0, remaining);
    for (const file of toUpload) {
      setUploadingIdx(file.name);
      try {
        const url = await uploadFile(file);
        setAttachments((prev) => [...prev, { url, name: file.name, type: "image" }]);
      } catch {
        toast({ variant: "destructive", title: `${file.name} 업로드 실패` });
      }
    }
    setUploadingIdx(null);
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingIdx("pdf");
    try {
      const url = await uploadFile(file);
      setAttachments((prev) => {
        const withoutPdf = prev.filter((a) => a.type !== "pdf");
        return [...withoutPdf, { url, name: file.name, type: "pdf" }];
      });
      toast({ title: "PDF 업로드 완료" });
    } catch {
      toast({ variant: "destructive", title: "PDF 업로드 실패" });
    } finally {
      setUploadingIdx(null);
      if (pdfInputRef.current) pdfInputRef.current.value = "";
    }
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const reset = (initial?: Attachment[]) => {
    setAttachments(initial || []);
    setUploadingIdx(null);
  };

  return {
    attachments, setAttachments, imageAttachments, pdfAttachment, isUploading, uploadingIdx,
    imageInputRef, pdfInputRef, handleImageUpload, handlePdfUpload, removeAttachment, reset,
  };
}

function AttachmentUI({
  imageAttachments, pdfAttachment, attachments, isUploading, uploadingIdx,
  imageInputRef, pdfInputRef, handleImageUpload, handlePdfUpload, removeAttachment,
}: ReturnType<typeof useAttachmentForm>) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-muted-foreground">파일 첨부</p>
        <span className="text-xs text-muted-foreground">
          이미지 {imageAttachments.length}/{MAX_IMAGES}
        </span>
      </div>

      {imageAttachments.length > 0 && (
        <div className="grid grid-cols-3 gap-2">
          {imageAttachments.map((att, i) => (
            <div key={i} className="relative aspect-square rounded-lg overflow-hidden border bg-muted/20">
              <img
                src={att.url}
                alt={att.name}
                className="w-full h-full object-cover"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
              />
              <button
                className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-0.5 transition-colors"
                onClick={() => removeAttachment(attachments.indexOf(att))}
                data-testid={`button-remove-image-${i}`}
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
          {imageAttachments.length < MAX_IMAGES && (
            <button
              onClick={() => imageInputRef.current?.click()}
              disabled={isUploading}
              className="aspect-square rounded-lg border-2 border-dashed border-muted-foreground/30 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-emerald-400 hover:text-emerald-600 transition-colors"
              data-testid="button-add-more-image"
            >
              {isUploading && uploadingIdx !== "pdf" ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px]">추가</span>
                </>
              )}
            </button>
          )}
        </div>
      )}

      {imageAttachments.length === 0 && (
        <Button
          variant="outline"
          onClick={() => imageInputRef.current?.click()}
          disabled={isUploading}
          className="w-full gap-2 border-dashed h-16 flex-col"
          data-testid="button-add-rule-image"
        >
          {isUploading && uploadingIdx !== "pdf" ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <ImagePlus className="w-5 h-5" />
              <span className="text-sm">이미지 추가 (최대 3개)</span>
            </>
          )}
        </Button>
      )}

      {pdfAttachment ? (
        <div className="flex items-center gap-3 px-3 py-2 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900/50">
          <FileText className="w-5 h-5 text-blue-600 shrink-0" />
          <span className="text-sm text-blue-700 dark:text-blue-300 flex-1 truncate">{pdfAttachment.name}</span>
          <button
            onClick={() => removeAttachment(attachments.indexOf(pdfAttachment))}
            className="text-blue-400 hover:text-red-500 transition-colors"
            data-testid="button-remove-pdf"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <Button
          variant="outline"
          onClick={() => pdfInputRef.current?.click()}
          disabled={isUploading}
          className="w-full gap-2 text-blue-600 border-blue-200 hover:bg-blue-50 hover:border-blue-400"
          data-testid="button-add-rule-pdf"
        >
          {isUploading && uploadingIdx === "pdf" ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <FileUp className="w-4 h-4" />
          )}
          {isUploading && uploadingIdx === "pdf" ? "업로드 중..." : "PDF 파일 첨부"}
        </Button>
      )}

      <input
        type="file"
        accept="image/*"
        multiple
        ref={imageInputRef}
        onChange={handleImageUpload}
        className="hidden"
      />
      <input
        type="file"
        accept=".pdf,application/pdf"
        ref={pdfInputRef}
        onChange={handlePdfUpload}
        className="hidden"
      />
    </div>
  );
}

export default function Rules() {
  const { canRegisterRules } = usePermissions();
  const { user } = useAuth();
  const isOwner = (createdBy?: string | null) =>
    !createdBy || user?.role === "admin" || user?.username === createdBy;

  const { data: rules, isLoading } = useNotices("rule");
  const { mutate: createRule, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteRule } = useDeleteNotice();
  const { mutate: updateRule, isPending: isUpdating } = useUpdateNotice();
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedRule, setSelectedRule] = useState<RuleRecord | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRule, setEditingRule] = useState<RuleRecord | null>(null);

  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const [addTitle, setAddTitle] = useState("");
  const [addContent, setAddContent] = useState("");
  const addAttachForm = useAttachmentForm();

  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const editAttachForm = useAttachmentForm();

  const filteredRules = useMemo(() => {
    if (!rules) return [];
    if (!searchQuery.trim()) return rules;
    const query = searchQuery.toLowerCase();
    return rules.filter(
      (rule) =>
        rule.title.toLowerCase().includes(query) ||
        rule.content.toLowerCase().includes(query)
    );
  }, [rules, searchQuery]);

  const getRuleAttachments = (rule: any): Attachment[] => {
    if (rule.attachments && Array.isArray(rule.attachments)) return rule.attachments;
    if (rule.imageUrl) return [{ url: rule.imageUrl, name: "이미지", type: "image" }];
    return [];
  };

  const getRuleBadge = (rule: any) => {
    const atts = getRuleAttachments(rule);
    const imgs = atts.filter((a: Attachment) => a.type === "image");
    const pdf = atts.find((a: Attachment) => a.type === "pdf");
    if (pdf && imgs.length > 0) return `이미지${imgs.length}·PDF`;
    if (pdf) return "PDF";
    if (imgs.length > 0) return `이미지 ${imgs.length}`;
    return null;
  };

  const openEdit = (rule: RuleRecord, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const atts = getRuleAttachments(rule);
    setEditingRule(rule);
    setEditTitle(rule.title);
    setEditContent(rule.content);
    editAttachForm.reset(atts);
  };

  const handleAdd = () => {
    if (!addTitle || !addContent) return;
    const atts = addAttachForm.attachments;
    createRule(
      {
        title: addTitle,
        content: addContent,
        category: "rule",
        imageUrl: atts.find(a => a.type === "image")?.url || undefined,
        attachments: atts.length > 0 ? atts : undefined,
      } as any,
      {
        onSuccess: () => {
          setAddTitle("");
          setAddContent("");
          addAttachForm.reset();
          setShowAddForm(false);
          toast({ title: "수칙 추가 완료" });
        },
      }
    );
  };

  const handleUpdate = () => {
    if (!editingRule || !editTitle || !editContent) return;
    const atts = editAttachForm.attachments;
    updateRule(
      {
        id: editingRule.id,
        title: editTitle,
        content: editContent,
        imageUrl: atts.find(a => a.type === "image")?.url || null,
        attachments: atts.length > 0 ? atts : null,
      } as any,
      {
        onSuccess: () => {
          toast({ title: "수칙 수정 완료" });
          setEditingRule(null);
          if (selectedRule?.id === editingRule.id) setSelectedRule(null);
        },
        onError: (e: any) => toast({ variant: "destructive", title: "수정 실패", description: e.message }),
      }
    );
  };

  const handleDelete = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("이 수칙을 삭제하시겠습니까?")) {
      deleteRule(id);
      setSelectedRule(null);
    }
  };

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/notices/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      setSelectedIds(new Set());
      setSelectionMode(false);
      toast({ title: `${data.deleted ?? selectedIds.size}건 삭제 완료` });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      <Card className="border-emerald-200/50 dark:border-emerald-900/30 overflow-hidden">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-b p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-2 rounded-lg text-white">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <span className="text-lg font-bold">안전 수칙</span>
                <p className="text-xs font-normal text-muted-foreground">필수 안전 가이드라인</p>
              </div>
            </CardTitle>
            <div className="flex items-center gap-2">
              <div className="relative flex-1 sm:w-48">
                <Input
                  placeholder="검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pr-8 h-9 text-sm bg-white/80 dark:bg-background/80"
                  data-testid="input-search-rules"
                />
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              </div>
              {canRegisterRules && (
                <>
                  <Button
                    variant={selectionMode ? "default" : "outline"}
                    size="sm"
                    className={`gap-1.5 h-9 ${selectionMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                    onClick={() => { setSelectionMode((v) => !v); setSelectedIds(new Set()); }}
                    data-testid="button-toggle-selection"
                  >
                    <CheckSquare className="w-4 h-4" />
                    {selectionMode ? "취소" : "선택"}
                  </Button>
                  <Button
                    onClick={() => setShowAddForm(true)}
                    size="sm"
                    className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white gap-1.5 h-9"
                    data-testid="button-open-add-rule"
                  >
                    <Plus className="w-4 h-4" />
                    새 수칙
                  </Button>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y divide-border/50">
            {isLoading ? (
              [1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-muted/20 animate-pulse" />
              ))
            ) : filteredRules.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <ShieldCheck className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">
                  {searchQuery
                    ? `"${searchQuery}"에 대한 검색 결과가 없습니다.`
                    : "아직 등록된 수칙이 없습니다."}
                </p>
                {!searchQuery && canRegisterRules && (
                  <Button
                    onClick={() => setShowAddForm(true)}
                    variant="outline"
                    size="sm"
                    className="mt-3 gap-1.5"
                  >
                    <Plus className="w-4 h-4" /> 첫 번째 수칙 추가
                  </Button>
                )}
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredRules.map((rule, idx) => {
                  const badge = getRuleBadge(rule);
                  return (
                    <motion.div
                      key={rule.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ delay: idx * 0.03 }}
                      onClick={() =>
                        selectionMode ? toggleSelect(rule.id) : setSelectedRule(rule as any)
                      }
                      className={`group flex items-center gap-4 px-4 py-3 cursor-pointer transition-colors ${
                        selectionMode && selectedIds.has(rule.id)
                          ? "bg-red-50 dark:bg-red-900/20"
                          : "hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10"
                      }`}
                      data-testid={`row-rule-${rule.id}`}
                    >
                      {selectionMode && (
                        <Checkbox
                          checked={selectedIds.has(rule.id)}
                          onCheckedChange={() => toggleSelect(rule.id)}
                          onClick={(e) => e.stopPropagation()}
                          data-testid={`checkbox-rule-${rule.id}`}
                        />
                      )}
                      <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                        {badge?.includes("PDF") ? (
                          <FileText className="w-4 h-4" />
                        ) : badge ? (
                          <Image className="w-4 h-4" />
                        ) : (
                          <FileText className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-sm truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                            {rule.title}
                          </h3>
                          {badge && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                              {badge}
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {rule.content}
                        </p>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <span className="text-xs text-muted-foreground flex items-center gap-0.5 mr-1 whitespace-nowrap">
                          <Calendar className="w-3 h-3" />
                          {rule.createdAt && format(new Date(rule.createdAt), "MM.dd")}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-emerald-600"
                          onClick={(e) => { e.stopPropagation(); setSelectedRule(rule as any); }}
                          data-testid={`button-view-rule-${rule.id}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        {canRegisterRules && isOwner(rule.createdBy) && (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-blue-500"
                              onClick={(e) => openEdit(rule as any, e)}
                              data-testid={`button-edit-rule-${rule.id}`}
                            >
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                              onClick={(e) => handleDelete(rule.id, e)}
                              data-testid={`button-delete-rule-${rule.id}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            )}
          </div>
          {filteredRules.length > 0 && (
            <div className="px-4 py-2 bg-muted/20 border-t text-xs text-muted-foreground flex items-center justify-between">
              <span>총 {filteredRules.length}개</span>
              <span>클릭하여 상세보기</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ── 새 수칙 등록 다이얼로그 ── */}
      <Dialog open={showAddForm} onOpenChange={setShowAddForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-500" />
              새 안전 수칙 등록
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="수칙 제목 (예: 필수 보호구 착용)"
              value={addTitle}
              onChange={(e) => setAddTitle(e.target.value)}
              className="font-medium"
              data-testid="input-rule-title"
            />
            <Textarea
              placeholder="안전 수칙에 대한 상세 설명을 입력하세요..."
              value={addContent}
              onChange={(e) => setAddContent(e.target.value)}
              className="min-h-[120px]"
              data-testid="input-rule-content"
            />
            <AttachmentUI {...addAttachForm} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowAddForm(false)}>취소</Button>
              <Button
                onClick={handleAdd}
                disabled={isCreating || addAttachForm.isUploading || !addTitle || !addContent}
                className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white gap-2"
                data-testid="button-add-rule"
              >
                <Plus className="w-4 h-4" /> 수칙 추가
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 수칙 수정 다이얼로그 ── */}
      <Dialog open={!!editingRule} onOpenChange={(open) => { if (!open) setEditingRule(null); }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-blue-500" />
              안전 수칙 수정
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-4">
            <Input
              placeholder="수칙 제목"
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="font-medium"
              data-testid="input-edit-rule-title"
            />
            <Textarea
              placeholder="안전 수칙 내용"
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="min-h-[120px]"
              data-testid="input-edit-rule-content"
            />
            <AttachmentUI {...editAttachForm} />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingRule(null)}>취소</Button>
              <Button
                onClick={handleUpdate}
                disabled={isUpdating || editAttachForm.isUploading || !editTitle || !editContent}
                className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white gap-2"
                data-testid="button-update-rule"
              >
                {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                수정 완료
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── 상세보기 다이얼로그 ── */}
      <Dialog open={!!selectedRule} onOpenChange={() => setSelectedRule(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedRule && (() => {
            const atts = getRuleAttachments(selectedRule);
            const imgs = atts.filter((a) => a.type === "image");
            const pdf = atts.find((a) => a.type === "pdf");
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-xl pr-8">{selectedRule.title}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-4">
                  {imgs.length === 1 && (
                    <div className="relative group cursor-zoom-in" onClick={() => setLightboxSrc(imgs[0].url)}>
                      <img
                        src={imgs[0].url}
                        alt={imgs[0].name}
                        className="w-full max-h-80 object-contain rounded-xl border bg-muted/20"
                        onError={(e) => { e.currentTarget.style.display = "none"; }}
                      />
                      <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                        <div className="bg-black/60 text-white rounded-full p-2">
                          <ZoomIn className="w-5 h-5" />
                        </div>
                      </div>
                    </div>
                  )}
                  {imgs.length > 1 && (
                    <div className={`grid gap-2 ${imgs.length === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                      {imgs.map((img, i) => (
                        <div key={i} className="relative group cursor-zoom-in" onClick={() => setLightboxSrc(img.url)}>
                          <img
                            src={img.url}
                            alt={img.name}
                            className="w-full aspect-square object-cover rounded-lg border bg-muted/20"
                            onError={(e) => { e.currentTarget.style.display = "none"; }}
                          />
                          <div className="absolute inset-0 rounded-lg flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/20 transition-opacity">
                            <div className="bg-black/60 text-white rounded-full p-1.5">
                              <ZoomIn className="w-4 h-4" />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {pdf && (
                    <a
                      href={pdf.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-900/50 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors group"
                      data-testid="link-view-pdf"
                    >
                      <FileText className="w-5 h-5 text-blue-600 shrink-0" />
                      <span className="text-sm text-blue-700 dark:text-blue-300 flex-1 truncate font-medium">{pdf.name}</span>
                      <Download className="w-4 h-4 text-blue-400 group-hover:text-blue-600 transition-colors shrink-0" />
                    </a>
                  )}
                  <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap">{selectedRule.content}</p>
                  <div className="flex items-center justify-between pt-4 border-t text-sm text-muted-foreground">
                    <span className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      {selectedRule.createdAt && format(new Date(selectedRule.createdAt), "yyyy년 MM월 dd일")}
                    </span>
                    {canRegisterRules && isOwner(selectedRule.createdBy) && (
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-blue-600 hover:text-blue-700 border-blue-200 hover:bg-blue-50"
                          onClick={() => { setSelectedRule(null); openEdit(selectedRule); }}
                        >
                          <Pencil className="w-4 h-4 mr-1" /> 수정
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(selectedRule.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" /> 삭제
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* ── 이미지 라이트박스 ── */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            className="absolute top-4 right-4 text-white bg-white/10 hover:bg-white/20 rounded-full p-2 transition-colors"
            onClick={() => setLightboxSrc(null)}
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxSrc}
            alt="확대 이미지"
            className="max-w-[92vw] max-h-[92vh] object-contain rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── 플로팅 벌크 삭제 바 ── */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-full px-5 py-3">
          <span className="text-sm font-semibold text-red-600">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border" />
          <Button
            variant="ghost" size="sm" className="h-8"
            onClick={() => setSelectedIds(new Set())}
          >
            <X className="w-3.5 h-3.5 mr-1" />선택 해제
          </Button>
          <Button
            variant="destructive" size="sm" className="h-8"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => {
              if (confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`))
                bulkDeleteMutation.mutate(Array.from(selectedIds));
            }}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
        </div>
      )}
    </div>
  );
}
