import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2, Trash2, Plus, FileSpreadsheet, Search,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  RotateCcw, X, Paperclip, Upload, Pencil,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { EducationTask } from "@shared/schema";

const FIELDS = ["안전/보건", "법령", "이벤트"] as const;
const SCOPES = ["전사", "본부", "지정", "안전보건업무 부서"] as const;
const FIELD_TYPES = ["Text", "Date", "Number", "Select"] as const;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

type TaskField = { type: string; title: string };

interface FormState {
  title: string;
  startDate: string;
  endDate: string;
  field: string;
  requestScope: string;
  isRecurring: boolean;
  taskFields: TaskField[];
  headquarters: string;
  department: string;
  requestedBy: string;
}

const emptyForm = (): FormState => ({
  title: "",
  startDate: "",
  endDate: "",
  field: "안전/보건",
  requestScope: "전사",
  isRecurring: false,
  taskFields: [{ type: "Text", title: "" }],
  headquarters: "",
  department: "",
  requestedBy: "",
});

export default function EducationManagement() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isEditor = user?.role === "admin" || user?.role === "deptHead" || user?.role === "manager";

  const [filterScope, setFilterScope] = useState("전체");
  const [filterField, setFilterField] = useState("전체");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [editTask, setEditTask] = useState<EducationTask | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [deleteConfirmIds, setDeleteConfirmIds] = useState<number[]>([]);
  const [confirmConfirmIds, setConfirmConfirmIds] = useState<number[]>([]);
  const [attachmentTaskId, setAttachmentTaskId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: tasks = [], isLoading } = useQuery<EducationTask[]>({
    queryKey: ["/api/education-tasks"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/education-tasks", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setRegisterOpen(false);
      setForm(emptyForm());
      toast({ title: "업무가 등록되었습니다." });
    },
    onError: (e: any) => toast({ title: "등록 실패", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest("PUT", `/api/education-tasks/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setEditTask(null);
      setRegisterOpen(false);
      setForm(emptyForm());
      toast({ title: "업무가 수정되었습니다." });
    },
    onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/education-tasks/bulk-delete", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setSelectedIds(new Set());
      setDeleteConfirmIds([]);
      toast({ title: "삭제되었습니다." });
    },
    onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
  });

  const bulkConfirmMutation = useMutation({
    mutationFn: (ids: number[]) => apiRequest("POST", "/api/education-tasks/bulk-confirm", { ids }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setSelectedIds(new Set());
      setConfirmConfirmIds([]);
      toast({ title: "완료 처리되었습니다." });
    },
    onError: (e: any) => toast({ title: "처리 실패", description: e.message, variant: "destructive" }),
  });

  const attachmentMutation = useMutation({
    mutationFn: ({ id, file }: { id: number; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return fetch(`/api/education-tasks/${id}/attachment`, { method: "POST", body: fd }).then(r => r.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/education-tasks"] });
      setAttachmentTaskId(null);
      toast({ title: "증빙자료가 업로드되었습니다." });
    },
    onError: (e: any) => toast({ title: "업로드 실패", description: e.message, variant: "destructive" }),
  });

  const filtered = tasks.filter(t => {
    if (filterScope !== "전체" && t.requestScope !== filterScope) return false;
    if (filterField !== "전체" && t.field !== filterField) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const allChecked = paged.length > 0 && paged.every(t => selectedIds.has(t.id));
  const toggleAll = () => {
    const s = new Set(selectedIds);
    if (allChecked) paged.forEach(t => s.delete(t.id));
    else paged.forEach(t => s.add(t.id));
    setSelectedIds(s);
  };
  const toggleOne = (id: number) => {
    const s = new Set(selectedIds);
    s.has(id) ? s.delete(id) : s.add(id);
    setSelectedIds(s);
  };

  const openRegister = () => {
    setEditTask(null);
    setForm(emptyForm());
    setRegisterOpen(true);
  };
  const openEdit = (t: EducationTask) => {
    setEditTask(t);
    setForm({
      title: t.title,
      startDate: t.startDate,
      endDate: t.endDate,
      field: t.field,
      requestScope: t.requestScope,
      isRecurring: t.isRecurring,
      taskFields: (t.taskFields as TaskField[]) || [{ type: "Text", title: "" }],
      headquarters: t.headquarters || "",
      department: t.department || "",
      requestedBy: t.requestedBy || "",
    });
    setRegisterOpen(true);
  };

  const handleSubmit = () => {
    if (!form.title.trim() || !form.startDate || !form.endDate) {
      toast({ title: "업무명, 시작일, 종료일은 필수입니다.", variant: "destructive" });
      return;
    }
    const payload = { ...form };
    if (editTask) {
      updateMutation.mutate({ id: editTask.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const addTaskField = () => setForm(f => ({ ...f, taskFields: [...f.taskFields, { type: "Text", title: "" }] }));
  const removeTaskField = (i: number) => setForm(f => ({ ...f, taskFields: f.taskFields.filter((_, idx) => idx !== i) }));
  const updateTaskField = (i: number, key: keyof TaskField, value: string) => {
    setForm(f => ({ ...f, taskFields: f.taskFields.map((tf, idx) => idx === i ? { ...tf, [key]: value } : tf) }));
  };

  const handleExport = () => { window.location.href = "/api/education-tasks/export"; };

  const statusBadge = (t: EducationTask) => {
    if (t.status === "완료") return <Badge className="bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 text-[10px]">완료</Badge>;
    return <Badge variant="outline" className="text-amber-600 border-amber-300 text-[10px]">미완료</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
          <CheckCircle2 className="w-6 h-6 text-primary" />
          교육업무 관리
        </h1>
      </div>

      {/* 필터 영역 */}
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">요청 범위</Label>
            <Select value={filterScope} onValueChange={v => { setFilterScope(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-9" data-testid="select-filter-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                {SCOPES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">업무 분야</Label>
            <Select value={filterField} onValueChange={v => { setFilterField(v); setPage(1); }}>
              <SelectTrigger className="w-32 h-9" data-testid="select-filter-field">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="전체">전체</SelectItem>
                {FIELDS.map(f => <SelectItem key={f} value={f}>{f}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <Label className="text-xs text-muted-foreground">업무 검색</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-9"
                placeholder="업무명을 입력하세요"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                data-testid="input-search"
              />
            </div>
          </div>
          {(filterScope !== "전체" || filterField !== "전체" || search) && (
            <Button variant="ghost" size="sm" className="h-9" onClick={() => { setFilterScope("전체"); setFilterField("전체"); setSearch(""); setPage(1); }}>
              <RotateCcw className="w-3.5 h-3.5 mr-1" /> 초기화
            </Button>
          )}
        </div>
      </div>

      {/* 액션 바 + 테이블 */}
      <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
        <div className="flex flex-wrap gap-2 items-center justify-end px-4 py-3 border-b bg-muted/30">
          {isEditor && (
            <>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1"
                disabled={selectedIds.size === 0}
                onClick={() => setConfirmConfirmIds(Array.from(selectedIds))}
                data-testid="button-bulk-confirm"
              >
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs gap-1 text-destructive hover:text-destructive"
                disabled={selectedIds.size === 0}
                onClick={() => setDeleteConfirmIds(Array.from(selectedIds))}
                data-testid="button-bulk-delete"
              >
                <Trash2 className="w-3.5 h-3.5" /> 삭제
              </Button>
              <Button
                size="sm"
                className="h-8 text-xs gap-1"
                onClick={openRegister}
                data-testid="button-register"
              >
                <Plus className="w-3.5 h-3.5" /> 등록
              </Button>
            </>
          )}
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs gap-1 text-emerald-700 border-emerald-300 hover:bg-emerald-50"
            onClick={handleExport}
            data-testid="button-excel-export"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Excel 다운로드
          </Button>
        </div>

        {/* 테이블 */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/20">
                <th className="w-10 px-3 py-3">
                  <Checkbox checked={allChecked} onCheckedChange={toggleAll} data-testid="checkbox-all" />
                </th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs">ID</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs min-w-[180px]">제목</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">시작일</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">종료일</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs">완료율</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs">분야</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs">부서</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs">요청자</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs">반복</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs">상태</th>
                <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs whitespace-nowrap">등록일</th>
                {isEditor && <th className="px-3 py-3 text-left font-medium text-muted-foreground text-xs">작업</th>}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">
                    {Array.from({ length: 13 }).map((_, j) => (
                      <td key={j} className="px-3 py-3"><div className="h-4 bg-muted rounded animate-pulse" /></td>
                    ))}
                  </tr>
                ))
              ) : paged.length === 0 ? (
                <tr>
                  <td colSpan={13} className="px-3 py-16 text-center text-muted-foreground text-sm">
                    등록된 업무가 없습니다.
                  </td>
                </tr>
              ) : (
                paged.map(t => (
                  <motion.tr
                    key={t.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="border-b hover:bg-muted/30 transition-colors group"
                    data-testid={`row-task-${t.id}`}
                  >
                    <td className="px-3 py-3">
                      <Checkbox
                        checked={selectedIds.has(t.id)}
                        onCheckedChange={() => toggleOne(t.id)}
                        data-testid={`checkbox-task-${t.id}`}
                      />
                    </td>
                    <td className="px-3 py-3 text-muted-foreground text-xs">{t.id}</td>
                    <td className="px-3 py-3 max-w-[220px]">
                      <span className="font-medium line-clamp-2 text-xs sm:text-sm">{t.title}</span>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.startDate}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.endDate}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 min-w-[70px]">
                        <div className="flex-1 bg-muted/50 rounded-full h-1.5 overflow-hidden">
                          <div
                            className={`h-full rounded-full ${t.completionRate >= 100 ? "bg-emerald-500" : t.completionRate >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                            style={{ width: `${t.completionRate}%` }}
                          />
                        </div>
                        <span className="text-xs font-medium w-8 text-right">{t.completionRate}%</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Badge variant="secondary" className="text-[10px] whitespace-nowrap">{t.field}</Badge>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground max-w-[100px] truncate">{t.department || "-"}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">{t.requestedBy || "-"}</td>
                    <td className="px-3 py-3 text-xs text-center">{t.isRecurring ? "Y" : "-"}</td>
                    <td className="px-3 py-3">{statusBadge(t)}</td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {t.createdAt ? format(new Date(t.createdAt), "yyyy.M.d") : "-"}
                    </td>
                    {isEditor && (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => openEdit(t)}
                            data-testid={`button-edit-task-${t.id}`}
                          >
                            <Pencil className="w-3.5 h-3.5 text-blue-500" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setAttachmentTaskId(t.id)}
                            title="증빙자료 업로드"
                            data-testid={`button-attach-task-${t.id}`}
                          >
                            <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => setDeleteConfirmIds([t.id])}
                            data-testid={`button-delete-task-${t.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5 text-destructive" />
                          </Button>
                        </div>
                      </td>
                    )}
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 페이지네이션 */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-t bg-muted/10 text-sm text-muted-foreground">
          <div className="flex items-center gap-2">
            <span className="text-xs">Page Size:</span>
            <Select value={String(pageSize)} onValueChange={v => { setPageSize(Number(v)); setPage(1); }}>
              <SelectTrigger className="h-7 w-16 text-xs" data-testid="select-page-size">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map(n => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs mr-2">
              {filtered.length > 0 ? `${(page - 1) * pageSize + 1} to ${Math.min(page * pageSize, filtered.length)} of ${filtered.length}` : "0 건"}
            </span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(1)} data-testid="button-page-first"><ChevronsLeft className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === 1} onClick={() => setPage(p => p - 1)} data-testid="button-page-prev"><ChevronLeft className="w-3.5 h-3.5" /></Button>
            <span className="text-xs px-2">Page {page} of {totalPages}</span>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} data-testid="button-page-next"><ChevronRight className="w-3.5 h-3.5" /></Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" disabled={page === totalPages} onClick={() => setPage(totalPages)} data-testid="button-page-last"><ChevronsRight className="w-3.5 h-3.5" /></Button>
          </div>
        </div>
      </div>

      {/* 등록/수정 모달 */}
      <Dialog open={registerOpen} onOpenChange={v => { if (!v) { setRegisterOpen(false); setEditTask(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              {editTask ? "업무 수정" : "업무 등록"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-5 py-2">
            {/* 업무명 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 font-semibold text-sm">
                <Pencil className="w-3.5 h-3.5 text-primary" /> 업무명 <span className="text-destructive">*</span>
              </Label>
              <Input
                placeholder="업무 이름을 입력하세요"
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                data-testid="input-task-title"
              />
            </div>

            {/* 시행기간 */}
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5 font-semibold text-sm">
                📅 시행기간 <span className="text-destructive">*</span>
              </Label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">시작일</Label>
                  <Input
                    type="date"
                    value={form.startDate}
                    onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))}
                    data-testid="input-start-date"
                  />
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground mb-1 block">종료일</Label>
                  <Input
                    type="date"
                    value={form.endDate}
                    onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))}
                    data-testid="input-end-date"
                  />
                </div>
              </div>
            </div>

            {/* 업무 분야 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 font-semibold text-sm">
                🏷️ 업무 분야 <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={form.field}
                onValueChange={v => setForm(f => ({ ...f, field: v }))}
                className="flex flex-wrap gap-x-6 gap-y-2"
                data-testid="radio-field"
              >
                {FIELDS.map(fd => (
                  <div key={fd} className="flex items-center gap-2">
                    <RadioGroupItem value={fd} id={`field-${fd}`} data-testid={`radio-field-${fd}`} />
                    <Label htmlFor={`field-${fd}`} className="cursor-pointer text-sm">{fd}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* 요청 구분 */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5 font-semibold text-sm">
                👥 요청 구분 <span className="text-destructive">*</span>
              </Label>
              <RadioGroup
                value={form.requestScope}
                onValueChange={v => setForm(f => ({ ...f, requestScope: v }))}
                className="flex flex-wrap gap-x-5 gap-y-2"
                data-testid="radio-scope"
              >
                {SCOPES.map(sc => (
                  <div key={sc} className="flex items-center gap-2">
                    <RadioGroupItem value={sc} id={`scope-${sc}`} data-testid={`radio-scope-${sc}`} />
                    <Label htmlFor={`scope-${sc}`} className="cursor-pointer text-sm">{sc}</Label>
                  </div>
                ))}
              </RadioGroup>
            </div>

            {/* 본부/부서/요청자 */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">본부</Label>
                <Input
                  placeholder="예: 대구본부"
                  value={form.headquarters}
                  onChange={e => setForm(f => ({ ...f, headquarters: e.target.value }))}
                  data-testid="input-headquarters"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">부서/팀</Label>
                <Input
                  placeholder="예: 현장경영팀"
                  value={form.department}
                  onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  data-testid="input-department"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">요청자</Label>
                <Input
                  placeholder="이름"
                  value={form.requestedBy}
                  onChange={e => setForm(f => ({ ...f, requestedBy: e.target.value }))}
                  data-testid="input-requested-by"
                />
              </div>
            </div>

            {/* 반복 여부 */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="recurring"
                checked={form.isRecurring}
                onCheckedChange={v => setForm(f => ({ ...f, isRecurring: !!v }))}
                data-testid="checkbox-recurring"
              />
              <Label htmlFor="recurring" className="cursor-pointer text-sm flex items-center gap-1.5">
                <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" /> 반복 업무로 등록
              </Label>
            </div>

            {/* 요청 내역 */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5 font-semibold text-sm">
                  ≡ 요청 내역
                </Label>
                <Button type="button" size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={addTaskField} data-testid="button-add-field">
                  <Plus className="w-3 h-3" /> 행 추가
                </Button>
              </div>
              <div className="space-y-2">
                <AnimatePresence>
                  {form.taskFields.map((tf, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -5 }}
                      className="flex gap-2 items-start p-3 border rounded-lg bg-muted/20"
                    >
                      <div className="flex flex-col gap-1 shrink-0">
                        <Label className="text-[10px] text-muted-foreground">타입</Label>
                        <Select value={tf.type} onValueChange={v => updateTaskField(i, "type", v)}>
                          <SelectTrigger className="h-8 w-24 text-xs" data-testid={`select-field-type-${i}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {FIELD_TYPES.map(ft => <SelectItem key={ft} value={ft}>{ft}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex-1 flex flex-col gap-1">
                        <Label className="text-[10px] text-muted-foreground">입력 필드</Label>
                        <Input
                          className="h-8 text-sm"
                          placeholder="질문 제목을 입력하세요"
                          value={tf.title}
                          onChange={e => updateTaskField(i, "title", e.target.value)}
                          data-testid={`input-field-title-${i}`}
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="destructive"
                        className="h-8 w-8 shrink-0 mt-5"
                        onClick={() => removeTaskField(i)}
                        data-testid={`button-remove-field-${i}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setRegisterOpen(false); setEditTask(null); setForm(emptyForm()); }} data-testid="button-cancel">
              <X className="w-4 h-4 mr-1" /> 취소
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-submit"
            >
              <CheckCircle2 className="w-4 h-4 mr-1" />
              {editTask ? "수정 완료" : "업무 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 증빙자료 업로드 다이얼로그 */}
      <Dialog open={attachmentTaskId !== null} onOpenChange={v => { if (!v) setAttachmentTaskId(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="w-4 h-4" /> 증빙자료 업로드
            </DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xlsx,.xls,.hwp,.hwpx"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file && attachmentTaskId !== null) {
                  attachmentMutation.mutate({ id: attachmentTaskId, file });
                }
              }}
            />
            <Button
              className="w-full gap-2"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={attachmentMutation.isPending}
              data-testid="button-file-select"
            >
              <Paperclip className="w-4 h-4" />
              {attachmentMutation.isPending ? "업로드 중..." : "파일 선택 (PDF, 이미지, 문서)"}
            </Button>
            <p className="text-xs text-muted-foreground mt-2 text-center">
              업로드 시 해당 업무가 자동으로 완료 처리됩니다.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* 삭제 확인 */}
      <AlertDialog open={deleteConfirmIds.length > 0} onOpenChange={v => { if (!v) setDeleteConfirmIds([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {deleteConfirmIds.length}개 업무를 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => bulkDeleteMutation.mutate(deleteConfirmIds)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm 확인 */}
      <AlertDialog open={confirmConfirmIds.length > 0} onOpenChange={v => { if (!v) setConfirmConfirmIds([]); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>업무 완료 처리</AlertDialogTitle>
            <AlertDialogDescription>
              선택한 {confirmConfirmIds.length}개 업무를 완료 처리하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={() => bulkConfirmMutation.mutate(confirmConfirmIds)}>
              완료 처리
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
