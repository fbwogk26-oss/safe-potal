import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Team, UpdateTeamRequest } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertTeamSchema } from "@shared/schema";
import { useUpdateTeam } from "@/hooks/use-teams";
import { useEffect, useState } from "react";
import { Edit2, Save, Car } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface Props {
  team: Team;
  disabled?: boolean;
}

export function TeamEditDialog({ team, disabled }: Props) {
  const [open, setOpen] = useState(false);
  const updateTeam = useUpdateTeam();
  const { toast } = useToast();

  const form = useForm<UpdateTeamRequest>({
    resolver: zodResolver(insertTeamSchema.partial()),
    defaultValues: {
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
    },
  });

  // Reset form when dialog opens/team changes
  useEffect(() => {
    if (open) {
      form.reset({
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
      });
    }
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
    const currentAccidents = form.getValues("vehicleAccidents") as Record<string, number> || {};
    form.setValue("vehicleAccidents", {
      ...currentAccidents,
      [key]: parseInt(val || "0", 10),
    }, { shouldDirty: true });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" disabled={disabled} className="hover:bg-primary/10 hover:text-primary">
          <Edit2 className="w-4 h-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-2">
          <DialogTitle className="text-xl font-display text-primary flex items-center gap-2">
            <Edit2 className="w-5 h-5" />
            팀 편집: {team.name}
          </DialogTitle>
        </DialogHeader>
        
        <ScrollArea className="flex-1 px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 py-4">
            
            {/* Basic Info */}
            <div className="space-y-4 border rounded-xl p-4 bg-muted/20">
              <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wider">기본 정보</h3>
              <div className="grid gap-2">
                <Label>차량 수</Label>
                <Input type="number" {...form.register("vehicleCount", { valueAsNumber: true })} />
              </div>
            </div>

            {/* Deductions - Major */}
            <div className="space-y-4 border rounded-xl p-4 bg-red-50/50 border-red-100 dark:bg-red-900/10 dark:border-red-900/30">
              <h3 className="font-semibold text-sm text-red-600 uppercase tracking-wider">주요 감점</h3>
              <div className="grid gap-2">
                <Label>작업사고 (-40점)</Label>
                <Input type="number" {...form.register("workAccident", { valueAsNumber: true })} className="border-red-200" />
              </div>
              <div className="grid gap-2">
                <Label>점검 미준수 (-3점)</Label>
                <Input type="number" {...form.register("inspectionMiss", { valueAsNumber: true })} className="border-red-200" />
              </div>
            </div>

            {/* Fines */}
            <div className="space-y-4 border rounded-xl p-4 bg-orange-50/50 border-orange-100 dark:bg-orange-900/10 dark:border-orange-900/30">
              <h3 className="font-semibold text-sm text-orange-600 uppercase tracking-wider">교통 벌금 (-1점)</h3>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">과속</Label>
                  <Input type="number" {...form.register("fineSpeed", { valueAsNumber: true })} />
                </div>
                <div>
                  <Label className="text-xs">신호</Label>
                  <Input type="number" {...form.register("fineSignal", { valueAsNumber: true })} />
                </div>
                <div>
                  <Label className="text-xs">차선</Label>
                  <Input type="number" {...form.register("fineLane", { valueAsNumber: true })} />
                </div>
              </div>
            </div>

             {/* Bonus */}
             <div className="space-y-4 border rounded-xl p-4 bg-green-50/50 border-green-100 dark:bg-green-900/10 dark:border-green-900/30">
              <h3 className="font-semibold text-sm text-green-600 uppercase tracking-wider">가점 (+3점)</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">우수제안</Label>
                  <Input type="number" {...form.register("suggestion", { valueAsNumber: true })} />
                </div>
                <div>
                  <Label className="text-xs">우수활동</Label>
                  <Input type="number" {...form.register("activity", { valueAsNumber: true })} />
                </div>
              </div>
            </div>

            {/* Vehicle Accidents Detail */}
            <div className="col-span-1 md:col-span-2 space-y-4 border rounded-xl p-4 bg-slate-50 border-slate-200 dark:bg-slate-900/20 dark:border-slate-800">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Car className="w-4 h-4" />
                차량사고 상세
              </h3>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {[
                  { k: "p50_59", l: "50-59%" },
                  { k: "p60_69", l: "60-69%" },
                  { k: "p70_79", l: "70-79%" },
                  { k: "p80_89", l: "80-89%" },
                  { k: "p90_99", l: "90-99%" },
                  { k: "p100", l: "100%" },
                ].map((band) => (
                  <div key={band.k}>
                    <Label className="text-[10px] text-muted-foreground mb-1 block">{band.l}</Label>
                    <Input 
                      type="number" 
                      min={0}
                      defaultValue={(team.vehicleAccidents as any)?.[band.k] ?? 0}
                      onChange={(e) => handleAccidentChange(band.k, e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

          </div>
        </ScrollArea>
        
        <div className="p-6 border-t bg-muted/10 flex justify-end gap-3">
          <Button variant="outline" onClick={() => setOpen(false)}>취소</Button>
          <Button onClick={form.handleSubmit(onSubmit)} disabled={updateTeam.isPending}>
            {updateTeam.isPending ? "저장 중..." : "변경 사항 저장"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
