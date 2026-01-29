import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DoorOpen, Plus, Trash2, FileText, Download, UserPlus, X } from "lucide-react";
import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "@/components/ui/label";

interface PersonData {
  department: string;
  applicantName: string;
  idNumber: string;
  phone: string;
  hasVehicle: string;
  vehicleNumber: string;
}

interface AccessFormData {
  visitPeriodStartDate: string;
  visitPeriodStartTime: string;
  visitPeriodEndDate: string;
  visitPeriodEndTime: string;
  visitPurpose: string;
  entranceLocation: string;
  supervisorDepartment: string;
  supervisorName: string;
  supervisorPhone: string;
  people: PersonData[];
}

const emptyPerson: PersonData = {
  department: "",
  applicantName: "",
  idNumber: "",
  phone: "",
  hasVehicle: "없음",
  vehicleNumber: "",
};

export default function AccessRequest() {
  const { data: materials, isLoading } = useNotices("access");
  const { mutate: createMaterial, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteMaterial } = useDeleteNotice();
  // 출입신청은 잠금 상태에서도 사용 가능
  const isLocked = false;
  const { toast } = useToast();

  const [formData, setFormData] = useState<AccessFormData>({
    visitPeriodStartDate: "",
    visitPeriodStartTime: "09:00",
    visitPeriodEndDate: "",
    visitPeriodEndTime: "18:00",
    visitPurpose: "",
    entranceLocation: "",
    supervisorDepartment: "",
    supervisorName: "",
    supervisorPhone: "",
    people: [{ ...emptyPerson }],
  });

  const handleChange = (field: keyof Omit<AccessFormData, 'people'>, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handlePersonChange = (index: number, field: keyof PersonData, value: string) => {
    setFormData(prev => {
      const newPeople = [...prev.people];
      newPeople[index] = { ...newPeople[index], [field]: value };
      return { ...prev, people: newPeople };
    });
  };

  const addPerson = () => {
    if (formData.people.length >= 30) {
      toast({ variant: "destructive", title: "최대 30명까지만 등록할 수 있습니다" });
      return;
    }
    setFormData(prev => ({ ...prev, people: [...prev.people, { ...emptyPerson }] }));
  };

  const removePerson = (index: number) => {
    if (formData.people.length <= 1) return;
    setFormData(prev => ({
      ...prev,
      people: prev.people.filter((_, i) => i !== index)
    }));
  };

  const handleAdd = () => {
    if (!formData.visitPurpose) {
      toast({ variant: "destructive", title: "방문목적을 입력해주세요" });
      return;
    }
    
    const validPeople = formData.people.filter(p => p.applicantName.trim());
    if (validPeople.length === 0) {
      toast({ variant: "destructive", title: "최소 1명의 신청자 이름을 입력해주세요" });
      return;
    }

    const title = `${formData.visitPurpose} (${validPeople.length}명)`;
    const content = JSON.stringify({
      ...formData,
      people: validPeople,
    });
    
    createMaterial({ title, content, category: "access" }, {
      onSuccess: () => {
        setFormData({
          visitPeriodStartDate: "",
          visitPeriodStartTime: "09:00",
          visitPeriodEndDate: "",
          visitPeriodEndTime: "18:00",
          visitPurpose: "",
          entranceLocation: "",
          supervisorDepartment: "",
          supervisorName: "",
          supervisorPhone: "",
          people: [{ ...emptyPerson }],
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

  const handleSingleExcelDownload = async (id: number) => {
    try {
      const response = await fetch(`/api/access/excel/${id}`);
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
      </div>

      <Card className="glass-card overflow-hidden border-purple-200 dark:border-purple-900/30">
        <CardContent className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>방문기간 (시작)</Label>
              <div className="flex gap-2">
                <Input 
                  type="date"
                  value={formData.visitPeriodStartDate}
                  onChange={e => handleChange("visitPeriodStartDate", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-visit-start-date"
                  className="flex-1"
                />
                <Input 
                  type="time"
                  value={formData.visitPeriodStartTime}
                  onChange={e => handleChange("visitPeriodStartTime", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-visit-start-time"
                  className="w-28"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>방문기간 (종료)</Label>
              <div className="flex gap-2">
                <Input 
                  type="date"
                  value={formData.visitPeriodEndDate}
                  onChange={e => handleChange("visitPeriodEndDate", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-visit-end-date"
                  className="flex-1"
                />
                <Input 
                  type="time"
                  value={formData.visitPeriodEndTime}
                  onChange={e => handleChange("visitPeriodEndTime", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-visit-end-time"
                  className="w-28"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>방문목적 *</Label>
              <Input 
                placeholder="예: 주간업무회의" 
                value={formData.visitPurpose}
                onChange={e => handleChange("visitPurpose", e.target.value)}
                disabled={isLocked}
                data-testid="input-visit-purpose"
              />
            </div>
            <div className="space-y-2">
              <Label>출입장소</Label>
              <Input 
                placeholder="예: 9층" 
                value={formData.entranceLocation}
                onChange={e => handleChange("entranceLocation", e.target.value)}
                disabled={isLocked}
                data-testid="input-entrance-location"
              />
            </div>
          </div>

          <div className="border-t pt-4">
            <h3 className="font-semibold mb-3 text-purple-700 dark:text-purple-400">인솔자 정보</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>인솔자 소속</Label>
                <Input 
                  placeholder="예: kt MOS남부 대구본부 현장경영팀" 
                  value={formData.supervisorDepartment}
                  onChange={e => handleChange("supervisorDepartment", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-supervisor-department"
                />
              </div>
              <div className="space-y-2">
                <Label>인솔자 이름</Label>
                <Input 
                  placeholder="이름" 
                  value={formData.supervisorName}
                  onChange={e => handleChange("supervisorName", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-supervisor-name"
                />
              </div>
              <div className="space-y-2">
                <Label>인솔자 연락처</Label>
                <Input 
                  placeholder="010-0000-0000" 
                  value={formData.supervisorPhone}
                  onChange={e => handleChange("supervisorPhone", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-supervisor-phone"
                />
              </div>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex justify-between items-center mb-3">
              <h3 className="font-semibold text-purple-700 dark:text-purple-400">
                신청자 목록 ({formData.people.length}/30명)
              </h3>
              <Button 
                type="button"
                variant="outline"
                size="sm"
                onClick={addPerson}
                disabled={isLocked || formData.people.length >= 30}
                className="gap-1"
                data-testid="button-add-person"
              >
                <UserPlus className="w-4 h-4" />
                인원 추가
              </Button>
            </div>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
              {formData.people.map((person, index) => (
                <div key={index} className="p-4 border rounded-lg bg-muted/30 relative">
                  {formData.people.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removePerson(index)}
                      className="absolute top-2 right-2 p-1 hover:bg-destructive/20 rounded"
                      disabled={isLocked}
                      data-testid={`button-remove-person-${index}`}
                    >
                      <X className="w-4 h-4 text-destructive" />
                    </button>
                  )}
                  <div className="text-xs text-muted-foreground mb-2">#{index + 1}</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">소속</Label>
                      <Input 
                        placeholder="소속" 
                        value={person.department}
                        onChange={e => handlePersonChange(index, "department", e.target.value)}
                        disabled={isLocked}
                        className="h-8 text-sm"
                        data-testid={`input-person-department-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">이름 *</Label>
                      <Input 
                        placeholder="이름" 
                        value={person.applicantName}
                        onChange={e => handlePersonChange(index, "applicantName", e.target.value)}
                        disabled={isLocked}
                        className="h-8 text-sm"
                        data-testid={`input-person-name-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">신분확인번호</Label>
                      <Input 
                        placeholder="사번/생년월일" 
                        value={person.idNumber}
                        onChange={e => handlePersonChange(index, "idNumber", e.target.value)}
                        disabled={isLocked}
                        className="h-8 text-sm"
                        data-testid={`input-person-id-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">연락처</Label>
                      <Input 
                        placeholder="010-0000-0000" 
                        value={person.phone}
                        onChange={e => handlePersonChange(index, "phone", e.target.value)}
                        disabled={isLocked}
                        className="h-8 text-sm"
                        data-testid={`input-person-phone-${index}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">차량유무</Label>
                      <select 
                        className="w-full h-8 px-2 rounded-md border border-input bg-background text-sm"
                        value={person.hasVehicle}
                        onChange={e => handlePersonChange(index, "hasVehicle", e.target.value)}
                        disabled={isLocked}
                        data-testid={`select-person-vehicle-${index}`}
                      >
                        <option value="없음">없음</option>
                        <option value="있음">있음</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">차량번호</Label>
                      <Input 
                        placeholder="12가 3456" 
                        value={person.vehicleNumber}
                        onChange={e => handlePersonChange(index, "vehicleNumber", e.target.value)}
                        disabled={isLocked || person.hasVehicle === "없음"}
                        className="h-8 text-sm"
                        data-testid={`input-person-vehicle-number-${index}`}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Button 
              onClick={handleAdd} 
              disabled={isLocked || isCreating || !formData.visitPurpose} 
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
                    <div className="flex gap-1">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        onClick={() => handleSingleExcelDownload(item.id)}
                        data-testid={`button-excel-access-${item.id}`}
                        title="엑셀 다운로드"
                      >
                        <Download className="w-4 h-4 text-green-600" />
                      </Button>
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
                  </div>
                  {parsed ? (
                    <div className="space-y-2 text-sm">
                      <h3 className="font-bold text-lg">{parsed.visitPurpose}</h3>
                      <div className="grid grid-cols-2 gap-1 text-muted-foreground">
                        <span>출입장소:</span><span>{parsed.entranceLocation || "-"}</span>
                        <span>기간:</span>
                        <span>
                          {parsed.visitPeriodStartDate} {parsed.visitPeriodStartTime} ~ {parsed.visitPeriodEndDate} {parsed.visitPeriodEndTime}
                        </span>
                        <span>인솔자:</span>
                        <span>{parsed.supervisorName ? `${parsed.supervisorDepartment} / ${parsed.supervisorName}` : "-"}</span>
                        <span>인원:</span><span>{parsed.people?.length || 0}명</span>
                      </div>
                      {parsed.people && parsed.people.length > 0 && (
                        <div className="mt-2 pt-2 border-t">
                          <div className="text-xs text-muted-foreground">
                            {parsed.people.map((p, i) => p.applicantName).join(", ")}
                          </div>
                        </div>
                      )}
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
