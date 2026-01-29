import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DoorOpen, Plus, Trash2, FileText, Download } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "@/components/ui/label";

interface AccessFormData {
  visitPeriodStart: string;
  visitPeriodEnd: string;
  visitPurpose: string;
  department: string;
  applicantName: string;
  idNumber: string;
  phone: string;
  hasVehicle: string;
  vehicleNumber: string;
}

export default function AccessRequest() {
  const { data: materials, isLoading } = useNotices("access");
  const { mutate: createMaterial, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteMaterial } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [formData, setFormData] = useState<AccessFormData>({
    visitPeriodStart: "",
    visitPeriodEnd: "",
    visitPurpose: "",
    department: "",
    applicantName: "",
    idNumber: "",
    phone: "",
    hasVehicle: "없음",
    vehicleNumber: "",
  });

  const handleChange = (field: keyof AccessFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAdd = () => {
    if (!formData.applicantName || !formData.visitPurpose) {
      toast({ variant: "destructive", title: "필수 항목을 입력해주세요" });
      return;
    }
    
    const title = `${formData.applicantName} - ${formData.department}`;
    const content = JSON.stringify(formData);
    
    createMaterial({ title, content, category: "access" }, {
      onSuccess: () => {
        setFormData({
          visitPeriodStart: "",
          visitPeriodEnd: "",
          visitPurpose: "",
          department: "",
          applicantName: "",
          idNumber: "",
          phone: "",
          hasVehicle: "없음",
          vehicleNumber: "",
        });
        toast({ title: "신청 완료", description: "출입신청이 등록되었습니다." });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("이 신청을 삭제하시겠습니까?")) deleteMaterial(id);
  };

  const parseContent = (content: string): AccessFormData | null => {
    try {
      return JSON.parse(content);
    } catch {
      return null;
    }
  };

  const handleExcelDownload = async () => {
    if (!materials || materials.length === 0) {
      toast({ variant: "destructive", title: "다운로드할 데이터가 없습니다" });
      return;
    }

    try {
      const response = await fetch('/api/access/excel');
      if (!response.ok) throw new Error('Download failed');
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `효목사옥_출입신청서_${format(new Date(), "yyyy.MM.dd")}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({ title: "엑셀 다운로드 완료" });
    } catch (err) {
      toast({ variant: "destructive", title: "다운로드 실패" });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-xl text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <DoorOpen className="w-8 h-8" />
            </div>
            출입신청(효목)
          </h2>
          <p className="text-muted-foreground mt-2">효목 사업소 출입신청을 관리합니다.</p>
        </div>
        <Button 
          variant="outline" 
          onClick={handleExcelDownload}
          className="gap-2"
          data-testid="button-excel-download"
        >
          <Download className="w-4 h-4" />
          엑셀 다운로드
        </Button>
      </div>

      <Card className="glass-card overflow-hidden border-purple-200 dark:border-purple-900/30">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>방문기간 (시작)</Label>
              <Input 
                type="date"
                value={formData.visitPeriodStart}
                onChange={e => handleChange("visitPeriodStart", e.target.value)}
                disabled={isLocked}
                data-testid="input-visit-start"
              />
            </div>
            <div className="space-y-2">
              <Label>방문기간 (종료)</Label>
              <Input 
                type="date"
                value={formData.visitPeriodEnd}
                onChange={e => handleChange("visitPeriodEnd", e.target.value)}
                disabled={isLocked}
                data-testid="input-visit-end"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>방문목적 *</Label>
            <Input 
              placeholder="방문 목적을 입력하세요" 
              value={formData.visitPurpose}
              onChange={e => handleChange("visitPurpose", e.target.value)}
              disabled={isLocked}
              data-testid="input-visit-purpose"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>소속</Label>
              <Input 
                placeholder="소속 회사/부서" 
                value={formData.department}
                onChange={e => handleChange("department", e.target.value)}
                disabled={isLocked}
                data-testid="input-department"
              />
            </div>
            <div className="space-y-2">
              <Label>신청자 *</Label>
              <Input 
                placeholder="신청자 이름" 
                value={formData.applicantName}
                onChange={e => handleChange("applicantName", e.target.value)}
                disabled={isLocked}
                data-testid="input-applicant-name"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>신분확인번호 (사번/생년월일)</Label>
              <Input 
                placeholder="예: 123456 또는 900101" 
                value={formData.idNumber}
                onChange={e => handleChange("idNumber", e.target.value)}
                disabled={isLocked}
                data-testid="input-id-number"
              />
            </div>
            <div className="space-y-2">
              <Label>연락처</Label>
              <Input 
                placeholder="010-0000-0000" 
                value={formData.phone}
                onChange={e => handleChange("phone", e.target.value)}
                disabled={isLocked}
                data-testid="input-phone"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>차량유무</Label>
              <select 
                className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
                value={formData.hasVehicle}
                onChange={e => handleChange("hasVehicle", e.target.value)}
                disabled={isLocked}
                data-testid="select-has-vehicle"
              >
                <option value="없음">없음</option>
                <option value="있음">있음</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>차량번호</Label>
              <Input 
                placeholder="예: 12가 3456" 
                value={formData.vehicleNumber}
                onChange={e => handleChange("vehicleNumber", e.target.value)}
                disabled={isLocked || formData.hasVehicle === "없음"}
                data-testid="input-vehicle-number"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button 
              onClick={handleAdd} 
              disabled={isLocked || isCreating || !formData.applicantName || !formData.visitPurpose} 
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2" 
              data-testid="button-submit-access"
            >
              <Plus className="w-4 h-4" /> 신청 등록
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <AnimatePresence>
          {materials?.map((item) => {
            const parsed = parseContent(item.content);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="group bg-card rounded-2xl p-6 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300 flex flex-col justify-between h-full"
                data-testid={`card-access-${item.id}`}
              >
                <div className="space-y-3">
                  <div className="flex justify-between items-start">
                    <div className="p-3 bg-purple-50 text-purple-600 rounded-lg dark:bg-purple-900/20">
                      <FileText className="w-6 h-6" />
                    </div>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="opacity-0 group-hover:opacity-100"
                      onClick={() => handleDelete(item.id)}
                      disabled={isLocked}
                      data-testid={`button-delete-access-${item.id}`}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </div>
                  {parsed ? (
                    <div className="space-y-2 text-sm">
                      <h3 className="font-bold text-lg">{parsed.applicantName}</h3>
                      <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                        <span>소속:</span><span>{parsed.department || "-"}</span>
                        <span>기간:</span><span>{parsed.visitPeriodStart} ~ {parsed.visitPeriodEnd}</span>
                        <span>목적:</span><span>{parsed.visitPurpose}</span>
                        <span>연락처:</span><span>{parsed.phone || "-"}</span>
                        <span>차량:</span><span>{parsed.hasVehicle === "있음" ? parsed.vehicleNumber : "없음"}</span>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <h3 className="font-bold text-lg mb-1">{item.title}</h3>
                      <p className="text-sm text-muted-foreground">{item.content}</p>
                    </div>
                  )}
                </div>
                <div className="mt-4 pt-4 border-t text-xs text-muted-foreground">
                  신청일: {item.createdAt && format(new Date(item.createdAt), "yyyy-MM-dd HH:mm")}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
