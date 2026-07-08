import { useState } from "react";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Plus, Edit2, Trash2, ShieldCheck, Lock, ListChecks } from "lucide-react";
import {
  useSafetyScoreItems,
  useCreateSafetyScoreItem,
  useUpdateSafetyScoreItem,
  useDeleteSafetyScoreItem,
} from "@/hooks/use-safety-score-items";
import type { SafetyScoreItem } from "@shared/schema";

interface FormState {
  key: string;
  label: string;
  points: string;
  sortOrder: string;
}

const EMPTY_FORM: FormState = { key: "", label: "", points: "", sortOrder: "0" };

export default function SafetyScoreItems() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { data: items = [], isLoading } = useSafetyScoreItems();
  const createItem = useCreateSafetyScoreItem();
  const updateItem = useUpdateSafetyScoreItem();
  const deleteItem = useDeleteSafetyScoreItem();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SafetyScoreItem | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM, sortOrder: String(items.length) });
    setDialogOpen(true);
  }

  function openEdit(item: SafetyScoreItem) {
    setEditing(item);
    setForm({
      key: item.key,
      label: item.label,
      points: String(item.points),
      sortOrder: String(item.sortOrder),
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    if (!form.label.trim()) {
      toast({ title: "항목명을 입력해주세요", variant: "destructive" });
      return;
    }
    const points = Number(form.points);
    if (Number.isNaN(points)) {
      toast({ title: "가감점은 숫자로 입력해주세요", variant: "destructive" });
      return;
    }
    const sortOrder = Number(form.sortOrder) || 0;

    if (editing) {
      updateItem.mutate(
        { id: editing.id, label: form.label.trim(), points, sortOrder },
        {
          onSuccess: () => {
            toast({ title: "수정 완료", description: "평가항목이 수정되었고 전체 팀 점수가 재계산되었습니다." });
            setDialogOpen(false);
          },
          onError: (e: any) => toast({ title: "수정 실패", description: e.message, variant: "destructive" }),
        }
      );
    } else {
      const key = form.key.trim() || `custom_${Date.now()}`;
      createItem.mutate(
        { key: `custom_${key.replace(/[^a-zA-Z0-9_가-힣]/g, "")}`, label: form.label.trim(), points, sortOrder, isActive: true },
        {
          onSuccess: () => {
            toast({ title: "추가 완료", description: "새 평가항목이 추가되었고 전체 팀 점수가 재계산되었습니다." });
            setDialogOpen(false);
          },
          onError: (e: any) => toast({ title: "추가 실패", description: e.message, variant: "destructive" }),
        }
      );
    }
  }

  function handleToggleActive(item: SafetyScoreItem, isActive: boolean) {
    updateItem.mutate(
      { id: item.id, isActive },
      {
        onSuccess: () => toast({ title: isActive ? "활성화됨" : "비활성화됨", description: "전체 팀 점수가 재계산되었습니다." }),
        onError: (e: any) => toast({ title: "변경 실패", description: e.message, variant: "destructive" }),
      }
    );
  }

  function handleDelete(item: SafetyScoreItem) {
    deleteItem.mutate(item.id, {
      onSuccess: () => toast({ title: "삭제 완료", description: "평가항목이 삭제되었고 전체 팀 점수가 재계산되었습니다." }),
      onError: (e: any) => toast({ title: "삭제 실패", description: e.message, variant: "destructive" }),
    });
  }

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/safety-scores")} data-testid="button-back">
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-display font-bold flex items-center gap-2">
            <ListChecks className="w-6 h-6 text-primary" />
            안전점수 평가항목 관리
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            항목을 추가/수정/삭제하면 모든 부서의 안전점수가 자동으로 다시 계산됩니다.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>평가항목 목록</CardTitle>
            <CardDescription>기본 제공 항목은 이름/점수만 수정 가능하며 삭제할 수 없습니다.</CardDescription>
          </div>
          <Button onClick={openCreate} data-testid="button-add-item">
            <Plus className="w-4 h-4 mr-1" />
            항목 추가
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-sm text-muted-foreground py-8 text-center">불러오는 중...</div>
          ) : sorted.length === 0 ? (
            <div className="text-sm text-muted-foreground py-8 text-center">등록된 평가항목이 없습니다.</div>
          ) : (
            <div className="space-y-2">
              {sorted.map((item) => (
                <div
                  key={item.id}
                  className="flex items-center justify-between gap-3 border rounded-lg p-3 bg-muted/10"
                  data-testid={`row-item-${item.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {item.isBuiltIn ? (
                      <Lock className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate" data-testid={`text-label-${item.id}`}>{item.label}</span>
                        {item.isBuiltIn && (
                          <Badge variant="secondary" className="text-[10px]">기본항목</Badge>
                        )}
                        {!item.isActive && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">비활성</Badge>
                        )}
                      </div>
                      <span
                        className={`text-xs ${item.points < 0 ? "text-red-500" : "text-green-600"}`}
                        data-testid={`text-points-${item.id}`}
                      >
                        {item.points > 0 ? `+${item.points}` : item.points}점 / 건
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Switch
                      checked={item.isActive}
                      onCheckedChange={(v) => handleToggleActive(item, v)}
                      data-testid={`switch-active-${item.id}`}
                    />
                    <Button variant="ghost" size="icon" onClick={() => openEdit(item)} data-testid={`button-edit-${item.id}`}>
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    {!item.isBuiltIn && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="text-red-500 hover:text-red-600" data-testid={`button-delete-${item.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>평가항목 삭제</AlertDialogTitle>
                            <AlertDialogDescription>
                              "{item.label}" 항목을 삭제하시겠습니까? 삭제 후 전체 팀 점수가 다시 계산됩니다.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>취소</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleDelete(item)} className="bg-red-500 hover:bg-red-600">
                              삭제
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "평가항목 수정" : "평가항목 추가"}</DialogTitle>
            <DialogDescription>
              {editing?.isBuiltIn
                ? "기본 제공 항목은 이름과 점수만 수정할 수 있습니다."
                : "새로운 평가항목을 추가하면 팀 편집 화면에서 건수를 입력할 수 있습니다."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>항목명</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="예: 안전모 미착용"
                data-testid="input-item-label"
              />
            </div>
            <div className="grid gap-2">
              <Label>건당 가감점 (감점은 음수, 가점은 양수)</Label>
              <Input
                type="number"
                value={form.points}
                onChange={(e) => setForm((f) => ({ ...f, points: e.target.value }))}
                placeholder="예: -2"
                data-testid="input-item-points"
              />
            </div>
            <div className="grid gap-2">
              <Label>정렬 순서</Label>
              <Input
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm((f) => ({ ...f, sortOrder: e.target.value }))}
                data-testid="input-item-sort-order"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>취소</Button>
            <Button onClick={handleSubmit} disabled={createItem.isPending || updateItem.isPending} data-testid="button-save-item">
              저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
