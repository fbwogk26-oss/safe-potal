import { useNotices, useCreateNotice, useDeleteNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { DoorOpen, Plus, Trash2, FileText, Download, UserPlus, X, Calendar } from "lucide-react";
import { useState, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, isSameDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  const { toast } = useToast();

  const [filterVisitDate, setFilterVisitDate] = useState("");
  const [filterRegistrationDate, setFilterRegistrationDate] = useState("");

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

  const filteredMaterials = useMemo(() => {
    if (!materials) return [];
    
    let filtered = [...materials];
    
    if (filterVisitDate && filterVisitDate !== "all") {
      filtered = filtered.filter(item => {
        const parsed = parseContent(item.content);
        if (!parsed) return false;
        return parsed.visitPeriodStartDate === filterVisitDate || parsed.visitPeriodEndDate === filterVisitDate;
      });
    }
    
    if (filterRegistrationDate && filterRegistrationDate !== "all") {
      filtered = filtered.filter(item => {
        if (!item.createdAt) return false;
        const createdDate = format(new Date(item.createdAt), "yyyy-MM-dd");
        return createdDate === filterRegistrationDate;
      });
    }
    
    return filtered.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
  }, [materials, filterVisitDate, filterRegistrationDate]);

  const uniqueRegistrationDates = useMemo(() => {
    if (!materials) return [];
    const dates = new Set<string>();
    materials.forEach(item => {
      if (item.createdAt) {
        dates.add(format(new Date(item.createdAt), "yyyy-MM-dd"));
      }
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [materials]);

  const uniqueVisitDates = useMemo(() => {
    if (!materials) return [];
    const dates = new Set<string>();
    materials.forEach(item => {
      const parsed = parseContent(item.content);
      if (parsed?.visitPeriodStartDate) dates.add(parsed.visitPeriodStartDate);
      if (parsed?.visitPeriodEndDate) dates.add(parsed.visitPeriodEndDate);
    });
    return Array.from(dates).sort((a, b) => b.localeCompare(a));
  }, [materials]);

  const clearFilters = () => {
    setFilterVisitDate("");
    setFilterRegistrationDate("");
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
                  
                  data-testid="input-visit-start-date"
                  className="flex-1 h-9 text-sm"
                />
                <Input 
                  type="time"
                  value={formData.visitPeriodStartTime}
                  onChange={e => handleChange("visitPeriodStartTime", e.target.value)}
                  
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
                  
                  data-testid="input-visit-end-date"
                  className="flex-1 h-9 text-sm"
                />
                <Input 
                  type="time"
                  value={formData.visitPeriodEndTime}
                  onChange={e => handleChange("visitPeriodEndTime", e.target.value)}
                  
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
                disabled={formData.people.length >= 30}
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
                        disabled={person.hasVehicle === "없음"}
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
              disabled={isCreating || !formData.visitPurpose} 
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2" 
              data-testid="button-submit-access"
            >
              <Plus className="w-4 h-4" /> 신청 등록
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-purple-200/50 dark:border-purple-900/30 overflow-hidden">
        <div className="bg-gradient-to-r from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border-b px-4 py-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-br from-purple-500 to-violet-600 p-2 rounded-lg text-white">
                <FileText className="w-4 h-4" />
              </div>
              <div>
                <span className="text-sm font-bold">신청 목록</span>
                <p className="text-xs text-muted-foreground">총 {filteredMaterials.length}건</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">방문:</Label>
                <Select value={filterVisitDate} onValueChange={setFilterVisitDate}>
                  <SelectTrigger className="h-8 w-28 text-xs bg-white/80 dark:bg-background/80" data-testid="select-filter-visit-date">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {uniqueVisitDates.map(date => (
                      <SelectItem key={date} value={date}>{date}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-1.5">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">등록:</Label>
                <Select value={filterRegistrationDate} onValueChange={setFilterRegistrationDate}>
                  <SelectTrigger className="h-8 w-28 text-xs bg-white/80 dark:bg-background/80" data-testid="select-filter-registration-date">
                    <SelectValue placeholder="전체" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">전체</SelectItem>
                    {uniqueRegistrationDates.map(date => (
                      <SelectItem key={date} value={date}>{date}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {((filterVisitDate && filterVisitDate !== "all") || (filterRegistrationDate && filterRegistrationDate !== "all")) && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 text-xs px-2">
                  <X className="w-3 h-3 mr-1" /> 초기화
                </Button>
              )}
            </div>
          </div>
        </div>
        <div className="divide-y divide-border/50">
          {isLoading ? (
            [1,2,3,4,5].map(i => (
              <div key={i} className="h-16 bg-muted/20 animate-pulse" />
            ))
          ) : filteredMaterials.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">신청 내역이 없습니다.</p>
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredMaterials.map((item, idx) => {
                const parsed = parseContent(item.content);
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ delay: idx * 0.03 }}
                    className="group flex items-center gap-3 px-4 py-3 hover:bg-purple-50/50 dark:hover:bg-purple-900/10 cursor-pointer transition-colors"
                    data-testid={`row-access-${item.id}`}
                  >
                    <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                      <DoorOpen className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {parsed ? (
                        <>
                          <div className="flex items-center gap-2">
                            <h3 className="font-medium text-sm truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                              {parsed.visitPurpose}
                            </h3>
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                              {parsed.people?.length || 0}명
                            </span>
                            {parsed.entranceLocation && (
                              <span className="text-[10px] text-muted-foreground hidden sm:inline">{parsed.entranceLocation}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {parsed.visitPeriodStartDate}
                            </span>
                            {parsed.supervisorName && (
                              <>
                                <span className="hidden sm:inline">-</span>
                                <span className="hidden sm:inline">인솔: {parsed.supervisorName}</span>
                              </>
                            )}
                            <span className="hidden sm:inline truncate">
                              ({parsed.people?.map(p => p.applicantName).join(", ")})
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <h3 className="font-medium text-sm truncate">{item.title}</h3>
                          <p className="text-xs text-muted-foreground truncate">{item.content}</p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground hidden sm:flex items-center gap-1 whitespace-nowrap">
                        {item.createdAt && format(new Date(item.createdAt), "MM.dd HH:mm")}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                        onClick={(e) => { e.stopPropagation(); handleSingleExcelDownload(item.id); }}
                        data-testid={`button-excel-access-${item.id}`}
                        title="엑셀 다운로드"
                      >
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-500"
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                        data-testid={`button-delete-access-${item.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
        {filteredMaterials.length > 0 && (
          <div className="px-4 py-2 bg-muted/20 border-t text-xs text-muted-foreground flex items-center justify-between">
            <span>총 {filteredMaterials.length}건</span>
            <span>엑셀 아이콘으로 개별 다운로드</span>
          </div>
        )}
      </Card>
    </div>
  );
}
