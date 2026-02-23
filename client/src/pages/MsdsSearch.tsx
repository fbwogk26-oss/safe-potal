import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import type { Chemical, InsertChemical } from "@shared/schema";

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
} from "lucide-react";
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
  createdBy: "",
};

export default function MsdsSearch() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canManageEquipmentRequests, isAdmin } = usePermissions();
  const canEdit = isAdmin || canManageEquipmentRequests;

  const [searchQuery, setSearchQuery] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState<InsertChemical>({ ...EMPTY_FORM });
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);

  const { data: chemicals, isLoading } = useQuery<Chemical[]>({
    queryKey: ["/api/chemicals", searchQuery ? `?search=${encodeURIComponent(searchQuery)}` : ""],
  });

  const createMutation = useMutation({
    mutationFn: async (data: InsertChemical) => {
      return apiRequest("POST", "/api/chemicals", data);
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
        {canEdit && (
          <Button
            onClick={openCreateDialog}
            className="ml-auto gap-2"
            data-testid="button-add-chemical"
          >
            <Plus className="w-4 h-4" />
            물질 등록
          </Button>
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
                  <Card className="hover-elevate">
                    <CardHeader
                      className="cursor-pointer"
                      onClick={() => toggleExpand(chemical.id)}
                      data-testid={`button-expand-chemical-${chemical.id}`}
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-3 min-w-0 flex-wrap">
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
                        </div>
                        <div className="flex items-center gap-1">
                          {canEdit && (
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
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId !== null ? "화학물질 수정" : "화학물질 등록"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            <div className="space-y-2">
              <Label htmlFor="chem-hazards">위험성</Label>
              <Textarea
                id="chem-hazards"
                placeholder="위험성 정보를 입력하세요"
                value={formData.hazards || ""}
                onChange={(e) => updateField("hazards", e.target.value)}
                data-testid="input-chemical-hazards"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chem-emergency">응급조치요령</Label>
              <Textarea
                id="chem-emergency"
                placeholder="응급조치 요령을 입력하세요"
                value={formData.emergencyProcedures || ""}
                onChange={(e) => updateField("emergencyProcedures", e.target.value)}
                data-testid="input-chemical-emergency"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chem-handling">취급주의사항</Label>
              <Textarea
                id="chem-handling"
                placeholder="취급 시 주의사항을 입력하세요"
                value={formData.handlingPrecautions || ""}
                onChange={(e) => updateField("handlingPrecautions", e.target.value)}
                data-testid="input-chemical-handling"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chem-storage">저장방법</Label>
              <Textarea
                id="chem-storage"
                placeholder="저장 및 보관 방법을 입력하세요"
                value={formData.storageRequirements || ""}
                onChange={(e) => updateField("storageRequirements", e.target.value)}
                data-testid="input-chemical-storage"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chem-ppe">보호구</Label>
              <Textarea
                id="chem-ppe"
                placeholder="필요한 보호구를 입력하세요"
                value={formData.ppe || ""}
                onChange={(e) => updateField("ppe", e.target.value)}
                data-testid="input-chemical-ppe"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chem-firstaid">응급처치</Label>
              <Textarea
                id="chem-firstaid"
                placeholder="응급처치 방법을 입력하세요"
                value={formData.firstAid || ""}
                onChange={(e) => updateField("firstAid", e.target.value)}
                data-testid="input-chemical-firstaid"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="chem-notes">비고</Label>
              <Textarea
                id="chem-notes"
                placeholder="추가 참고사항을 입력하세요"
                value={formData.notes || ""}
                onChange={(e) => updateField("notes", e.target.value)}
                data-testid="input-chemical-notes"
              />
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
