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
    <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6 md:space-y-8">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="bg-purple-100 p-2 sm:p-2.5 rounded-lg sm:rounded-xl text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
          <DoorOpen className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">
            출입신청(효목)
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground">효목 사업소 출입신청</p>
        </div>
      </div>

      <Card className="glass-card overflow-hidden border-purple-200 dark:border-purple-900/30">
        <CardContent className="p-3 sm:p-4 md:p-6 space-y-4 sm:space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">방문기간 (시작)</Label>
              <div className="flex gap-1.5 sm:gap-2">
                <Input 
                  type="date"
                  value={formData.visitPeriodStartDate}
                  onChange={e => handleChange("visitPeriodStartDate", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-visit-start-date"
                  className="flex-1 h-9 text-sm"
                />
                <Input 
                  type="time"
                  value={formData.visitPeriodStartTime}
                  onChange={e => handleChange("visitPeriodStartTime", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-visit-start-time"
                  className="w-20 sm:w-24 h-9 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">방문기간 (종료)</Label>
              <div className="flex gap-1.5 sm:gap-2">
                <Input 
                  type="date"
                  value={formData.visitPeriodEndDate}
                  onChange={e => handleChange("visitPeriodEndDate", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-visit-end-date"
                  className="flex-1 h-9 text-sm"
                />
                <Input 
                  type="time"
                  value={formData.visitPeriodEndTime}
                  onChange={e => handleChange("visitPeriodEndTime", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-visit-end-time"
                  className="w-20 sm:w-24 h-9 text-sm"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">방문목적 *</Label>
              <Input 
                placeholder="예: 주간업무회의" 
                value={formData.visitPurpose}
                onChange={e => handleChange("visitPurpose", e.target.value)}
                disabled={isLocked}
                data-testid="input-visit-purpose"
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              <Label className="text-xs sm:text-sm">출입장소</Label>
              <Input 
                placeholder="예: 9층" 
                value={formData.entranceLocation}
                onChange={e => handleChange("entranceLocation", e.target.value)}
                disabled={isLocked}
                data-testid="input-entrance-location"
                className="h-9 text-sm"
              />
            </div>
          </div>

          <div className="border-t pt-3 sm:pt-4">
            <h3 className="font-semibold mb-2 sm:mb-3 text-sm sm:text-base text-purple-700 dark:text-purple-400">인솔자 정보</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">인솔자 소속</Label>
                <Input 
                  placeholder="소속" 
                  value={formData.supervisorDepartment}
                  onChange={e => handleChange("supervisorDepartment", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-supervisor-department"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">인솔자 이름</Label>
                <Input 
                  placeholder="이름" 
                  value={formData.supervisorName}
                  onChange={e => handleChange("supervisorName", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-supervisor-name"
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5 sm:space-y-2">
                <Label className="text-xs sm:text-sm">인솔자 연락처</Label>
                <Input 
                  placeholder="010-0000-0000" 
                  value={formData.supervisorPhone}
                  onChange={e => handleChange("supervisorPhone", e.target.value)}
                  disabled={isLocked}
                  data-testid="input-supervisor-phone"
                  className="h-9 text-sm"
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

      <div className="flex flex-col gap-4">
        <AnimatePresence>
          {[...(materials || [])].sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()).map((item) => {
            const parsed = parseContent(item.content);
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="group bg-card rounded-xl p-4 sm:p-5 border border-border/50 shadow-sm hover:shadow-lg transition-all duration-300"
                data-testid={`card-access-${item.id}`}
              >
                <div className="flex items-start gap-3 sm:gap-4">
                  <div className="p-2.5 bg-purple-50 text-purple-600 rounded-lg dark:bg-purple-900/20 shrink-0">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    {parsed ? (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="flex-1 min-w-0">
                          <h3 className="font-bold text-base sm:text-lg truncate">{parsed.visitPurpose}</h3>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm text-muted-foreground mt-1">
                            <span>{parsed.entranceLocation || "장소 미지정"}</span>
                            <span className="hidden sm:inline text-border">|</span>
                            <span>{parsed.visitPeriodStartDate} ~ {parsed.visitPeriodEndDate}</span>
                            <span className="hidden sm:inline text-border">|</span>
                            <span>{parsed.people?.length || 0}명</span>
                            {parsed.supervisorName && (
                              <>
                                <span className="hidden sm:inline text-border">|</span>
                                <span>인솔: {parsed.supervisorName}</span>
                              </>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {parsed.people && parsed.people.length > 0 && parsed.people.map((p) => p.applicantName).join(", ")}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {item.createdAt && format(new Date(item.createdAt), "MM/dd HH:mm")}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => handleSingleExcelDownload(item.id)}
                            data-testid={`button-excel-access-${item.id}`}
                            title="엑셀 다운로드"
                          >
                            <Download className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 opacity-0 group-hover:opacity-100"
                            onClick={() => handleDelete(item.id)}
                            disabled={isLocked}
                            data-testid={`button-delete-access-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="font-bold text-base mb-1">{item.title}</h3>
                          <p className="text-sm text-muted-foreground">{item.content}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground">
                            {item.createdAt && format(new Date(item.createdAt), "MM/dd HH:mm")}
                          </span>
                          <Button 
                            variant="ghost" 
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => handleSingleExcelDownload(item.id)}
                            data-testid={`button-excel-access-${item.id}`}
                          >
                            <Download className="w-4 h-4 text-green-600" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 opacity-0 group-hover:opacity-100"
                            onClick={() => handleDelete(item.id)}
                            disabled={isLocked}
                            data-testid={`button-delete-access-${item.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
