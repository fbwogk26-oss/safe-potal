import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Team, UpdateTeamRequest } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema } from "@shared/schema";
import { useUpdateTeam } from "@/hooks/use-teams";
import { useSafetyScoreItems } from "@/hooks/use-safety-score-items";
import { useEffect, useState } from "react";
import { Edit2, Car } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  team: Team;
  disabled?: boolean;
}

const VEHICLE_ACCIDENT_KEYS = new Set([
  "accident_p50_59",
  "accident_p60_69",
  "accident_p70_79",
  "accident_p80_89",
  "accident_p90_99",
  "accident_p100",
]);

const DIRECT_FIELD_KEYS = new Set([
  "workAccident",
  "fineSpeed",
  "fineSignal",
  "fineLane",
  "inspectionMiss",
  "suggestion",
  "activity",
]);

function pointsLabel(points: number) {
  return points > 0 ? `+${points}점` : `${points}점`;
}

export function TeamEditDialog({ team, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const updateTeam = useUpdateTeam();
  const { toast } = useToast();
  const { data: items = [] } = useSafetyScoreItems();

  const sortedItems = [...items].sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  const deductionItems = sortedItems.filter((i) => DIRECT_FIELD_KEYS.has(i.key) && i.points < 0 && i.key !== "workAccident");
  const workAccidentItem = sortedItems.find((i) => i.key === "workAccident");
  const inspectionItem = sortedItems.find((i) => i.key === "inspectionMiss");
  const fineItems = sortedItems.filter((i) => i.key === "fineSpeed" || i.key === "fineSignal" || i.key === "fineLane");
  const bonusItems = sortedItems.filter((i) => (i.key === "suggestion" || i.key === "activity") && i.points > 0);
  const vehicleAccidentItems = sortedItems.filter((i) => VEHICLE_ACCIDENT_KEYS.has(i.key));
  const customItems = sortedItems.filter(
    (i) => !DIRECT_FIELD_KEYS.has(i.key) && !VEHICLE_ACCIDENT_KEYS.has(i.key)
  );

  const buildDefaults = (): UpdateTeamRequest => ({
    name: team.name,
    vehicleCount: team.vehicleCount,
    workAccident: team.workAccident,
    fineSpeed: team.fineSpeed,
    fineSignal: team.fineSignal,
    fineLane: team.fineLane,
    inspectionMiss: team.inspectionMiss,
    suggestion: team.suggestion,
    activity: team.activity,
    vehicleAccidents: team.vehicleAccidents,
    customItemValues: team.customItemValues || {},
  });

  const form = useForm<UpdateTeamRequest>({
    resolver: zodResolver(insertTeamSchema.partial()),
    defaultValues: buildDefaults(),
  });

  // Reset form when dialog opens/team changes
  useEffect(() => {
    if (open) {
      form.reset(buildDefaults());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, team, form]);

  const onSubmit = (data: UpdateTeamRequest) => {
    updateTeam.mutate(
      { id: team.id, ...data },
      {
        onSuccess: () => {
          setOpen(false);
          toast({ title: "업데이트 완료", description: "부서 데이터가 성공적으로 저장되었습니다." });
        },
      }
    );
  };

  const handleAccidentChange = (key: string, val: string) => {
    const currentAccidents = (form.getValues("vehicleAccidents") as Record<string, number>) || {};
    form.setValue(
      "vehicleAccidents",
      {
        ...currentAccidents,
        [key]: parseInt(val || "0", 10),
      },
      { shouldDirty: true }
    );
  };

  const handleCustomItemChange = (key: string, val: string) => {
    const current = (form.getValues("customItemValues") as Record<string, number>) || {};
    form.setValue(
      "customItemValues",
      {
        ...current,
        [key]: parseInt(val || "0", 10),
      },
      { shouldDirty: true }
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" disabled={disabled} className="hover:bg-primary/10 hover:text-primary">
          <Edit2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="w-[92vw] max-w-2xl max-h-[88vh] flex flex-col p-0 gap-0 rounded-xl">
        <DialogHeader className="p-4 sm:p-6 pb-2">
          <DialogTitle className="text-base sm:text-xl font-display text-primary flex items-center gap-2">
            <Edit2 className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
            <span className="truncate">팀 편집: {team.name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6" style={{ WebkitOverflowScrolling: "touch" }}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-6 py-4">
            {/* Basic Info */}
            <div className="space-y-3 sm:space-y-4 border rounded-xl p-3 sm:p-4 bg-muted/20">
              <h3 className="font-semibold text-xs sm:text-sm text-muted-foreground uppercase tracking-wider">기본 정보</h3>
              <div className="grid gap-2">
                <Label className="text-xs sm:text-sm">차량 수</Label>
                <Input type="number" {...form.register("vehicleCount", { valueAsNumber: true })} />
              </div>
            </div>

            {/* Deductions - Major */}
            {(workAccidentItem || inspectionItem) && (
              <div className="space-y-3 sm:space-y-4 border rounded-xl p-3 sm:p-4 bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30">
                <h3 className="font-semibold text-xs sm:text-sm text-red-600 uppercase tracking-wider">주요 감점</h3>
                {workAccidentItem && (
                  <div className="grid gap-2">
                    <Label className="text-xs sm:text-sm">
                      {workAccidentItem.label} ({pointsLabel(workAccidentItem.points)})
                    </Label>
                    <Input
                      type="number"
                      {...form.register("workAccident", { valueAsNumber: true })}
                      className="border-red-200"
                    />
                  </div>
                )}
                {inspectionItem && (
                  <div className="grid gap-2">
                    <Label className="text-xs sm:text-sm">
                      {inspectionItem.label} ({pointsLabel(inspectionItem.points)})
                    </Label>
                    <Input
                      type="number"
                      {...form.register("inspectionMiss", { valueAsNumber: true })}
                      className="border-red-200"
                    />
                  </div>
                )}
              </div>
            )}

            {/* Fines */}
            {fineItems.length > 0 && (
              <div className="space-y-3 sm:space-y-4 border rounded-xl p-3 sm:p-4 bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/30">
                <h3 className="font-semibold text-xs sm:text-sm text-orange-600 uppercase tracking-wider">교통 벌금</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  {fineItems.map((item) => (
                    <div key={item.key}>
                      <Label className="text-xs block truncate" title={`${item.label} (${pointsLabel(item.points)})`}>
                        {item.label} <span className="text-orange-600">({pointsLabel(item.points)})</span>
                      </Label>
                      <Input
                        type="number"
                        {...form.register(item.key as "fineSpeed" | "fineSignal" | "fineLane", { valueAsNumber: true })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bonus */}
            {bonusItems.length > 0 && (
              <div className="space-y-3 sm:space-y-4 border rounded-xl p-3 sm:p-4 bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30">
                <h3 className="font-semibold text-xs sm:text-sm text-green-600 uppercase tracking-wider">가점</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  {bonusItems.map((item) => (
                    <div key={item.key}>
                      <Label className="text-xs block truncate" title={`${item.label} (${pointsLabel(item.points)})`}>
                        {item.label} <span className="text-green-600">({pointsLabel(item.points)})</span>
                      </Label>
                      <Input
                        type="number"
                        {...form.register(item.key as "suggestion" | "activity", { valueAsNumber: true })}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Vehicle Accidents Detail */}
            {vehicleAccidentItems.length > 0 && (
              <div className="col-span-1 sm:col-span-2 space-y-3 sm:space-y-4 border rounded-xl p-3 sm:p-4 bg-slate-50 border-slate-200 dark:bg-slate-900/20 dark:border-slate-800">
                <h3 className="font-semibold text-xs sm:text-sm flex items-center gap-2">
                  <Car className="w-4 h-4" />
                  차량사고 상세
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {vehicleAccidentItems.map((item) => {
                    const bandKey = item.key.replace("accident_", "");
                    return (
                      <div key={item.key}>
                        <Label
                          className="text-[10px] text-muted-foreground mb-1 block truncate"
                          title={`${item.label} (${pointsLabel(item.points)})`}
                        >
                          {item.label} <span className="text-red-500">({pointsLabel(item.points)})</span>
                        </Label>
                        <Input
                          type="number"
                          min={0}
                          defaultValue={(team.vehicleAccidents as any)?.[bandKey] ?? 0}
                          onChange={(e) => handleAccidentChange(bandKey, e.target.value)}
                          className="h-8 text-sm"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Custom Items */}
            {customItems.length > 0 && (
              <div className="col-span-1 sm:col-span-2 space-y-3 sm:space-y-4 border rounded-xl p-3 sm:p-4 bg-blue-50/50 border-blue-100 dark:bg-blue-900/10 dark:border-blue-900/30">
                <h3 className="font-semibold text-xs sm:text-sm text-blue-600 uppercase tracking-wider">추가 평가항목</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                  {customItems.map((item) => (
                    <div key={item.key}>
                      <Label className="text-xs block truncate" title={`${item.label} (${pointsLabel(item.points)})`}>
                        {item.label} ({pointsLabel(item.points)})
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        defaultValue={(team.customItemValues as any)?.[item.key] ?? 0}
                        onChange={(e) => handleCustomItemChange(item.key, e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-3 sm:p-6 border-t bg-muted/10 flex justify-end gap-2 sm:gap-3">
          <Button variant="outline" size="sm" className="sm:h-10 sm:px-4 sm:text-sm" onClick={() => setOpen(false)}>
            취소
          </Button>
          <Button size="sm" className="sm:h-10 sm:px-4 sm:text-sm" onClick={form.handleSubmit(onSubmit)} disabled={updateTeam.isPending}>
            {updateTeam.isPending ? "저장 중..." : "변경 사항 저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
