import { useVehicles, useCreateVehicle, useUpdateVehicle, useDeleteVehicle } from "@/hooks/use-vehicles";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { 
  Car, Plus, Trash2, Edit2, Search, Calendar, Phone, User, MapPin, 
  Gauge, Shield, AlertTriangle, CheckCircle, XCircle, Wrench, X, ImagePlus
} from "lucide-react";
import { useState, useMemo, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import type { Vehicle, InsertVehicle } from "@shared/schema";

const TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀"];
const VEHICLE_TYPES = ["승용차", "SUV", "트럭", "밴", "전기차", "하이브리드", "기타"];
const STATUS_OPTIONS = ["운행중", "정비중", "대기", "폐차예정"];

const getStatusColor = (status: string) => {
  switch (status) {
    case "운행중": return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400";
    case "정비중": return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400";
    case "대기": return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400";
    case "폐차예정": return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400";
    default: return "bg-gray-100 text-gray-700 border-gray-200";
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case "운행중": return <CheckCircle className="w-3 h-3" />;
    case "정비중": return <Wrench className="w-3 h-3" />;
    case "대기": return <Shield className="w-3 h-3" />;
    case "폐차예정": return <XCircle className="w-3 h-3" />;
    default: return null;
  }
};

export default function VehicleManagement() {
  const { data: vehicles, isLoading } = useVehicles();
  const { mutate: createVehicle, isPending: isCreating } = useCreateVehicle();
  const { mutate: updateVehicle } = useUpdateVehicle();
  const { mutate: deleteVehicle } = useDeleteVehicle();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [searchQuery, setSearchQuery] = useState("");
  const [filterTeam, setFilterTeam] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<Vehicle | null>(null);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  
  const [formData, setFormData] = useState<Partial<InsertVehicle>>({
    plateNumber: "",
    vehicleType: "승용차",
    model: "",
    year: new Date().getFullYear(),
    team: TEAMS[0],
    driver: "",
    contact: "",
    status: "운행중",
    purchaseDate: "",
    inspectionDate: "",
    insuranceExpiry: "",
    mileage: 0,
    notes: "",
    imageUrl: "",
  });
  
  const [isUploading, setIsUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const filteredVehicles = useMemo(() => {
    if (!vehicles) return [];
    return vehicles.filter(v => {
      const matchesSearch = !searchQuery || 
        v.plateNumber.toLowerCase().includes(searchQuery.toLowerCase()) ||
        v.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (v.driver || "").toLowerCase().includes(searchQuery.toLowerCase());
      const matchesTeam = filterTeam === "all" || v.team === filterTeam;
      const matchesStatus = filterStatus === "all" || v.status === filterStatus;
      return matchesSearch && matchesTeam && matchesStatus;
    });
  }, [vehicles, searchQuery, filterTeam, filterStatus]);

  const stats = useMemo(() => {
    if (!vehicles) return { total: 0, operating: 0, maintenance: 0, idle: 0 };
    const filtered = filterTeam === "all" ? vehicles : vehicles.filter(v => v.team === filterTeam);
    return {
      total: filtered.length,
      operating: filtered.filter(v => v.status === "운행중").length,
      maintenance: filtered.filter(v => v.status === "정비중").length,
      idle: filtered.filter(v => v.status === "대기").length,
    };
  }, [vehicles, filterTeam]);

  const handleStatClick = (status: string) => {
    setFilterStatus(prev => prev === status ? "all" : status);
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsUploading(true);
    const formDataObj = new FormData();
    formDataObj.append('image', file);
    
    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formDataObj,
      });
      const data = await res.json();
      if (data.imageUrl) {
        setFormData(prev => ({ ...prev, imageUrl: data.imageUrl }));
        toast({ title: "이미지 업로드 완료" });
      }
    } catch (err) {
      toast({ variant: "destructive", title: "업로드 실패" });
    } finally {
      setIsUploading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      plateNumber: "",
      vehicleType: "승용차",
      model: "",
      year: new Date().getFullYear(),
      team: TEAMS[0],
      driver: "",
      contact: "",
      status: "운행중",
      purchaseDate: "",
      inspectionDate: "",
      insuranceExpiry: "",
      mileage: 0,
      notes: "",
      imageUrl: "",
    });
  };

  const handleAdd = () => {
    if (!formData.plateNumber || !formData.model) {
      toast({ variant: "destructive", title: "차량번호와 모델명은 필수입니다." });
      return;
    }
    createVehicle(formData as InsertVehicle, {
      onSuccess: () => {
        resetForm();
        setShowAddDialog(false);
        toast({ title: "차량 등록 완료" });
      }
    });
  };

  const handleEdit = () => {
    if (!editingVehicle || !formData.plateNumber || !formData.model) return;
    updateVehicle({ id: editingVehicle.id, data: formData }, {
      onSuccess: () => {
        resetForm();
        setEditingVehicle(null);
        toast({ title: "차량 정보 수정 완료" });
      }
    });
  };

  const handleDelete = (id: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (confirm("이 차량을 삭제하시겠습니까?")) {
      deleteVehicle(id);
      setSelectedVehicle(null);
    }
  };

  const openEditDialog = (vehicle: Vehicle) => {
    setFormData({
      plateNumber: vehicle.plateNumber,
      vehicleType: vehicle.vehicleType,
      model: vehicle.model,
      year: vehicle.year || new Date().getFullYear(),
      team: vehicle.team,
      driver: vehicle.driver || "",
      contact: vehicle.contact || "",
      status: vehicle.status,
      purchaseDate: vehicle.purchaseDate || "",
      inspectionDate: vehicle.inspectionDate || "",
      insuranceExpiry: vehicle.insuranceExpiry || "",
      mileage: vehicle.mileage || 0,
      notes: vehicle.notes || "",
      imageUrl: vehicle.imageUrl || "",
    });
    setEditingVehicle(vehicle);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="bg-gradient-to-br from-cyan-500 to-blue-600 p-4 rounded-2xl text-white shadow-lg shadow-cyan-500/30">
            <Car className="w-8 h-8" />
          </div>
          <div>
            <h2 className="text-3xl font-display font-bold text-foreground">차량 관리</h2>
            <p className="text-muted-foreground mt-1">회사 업무용 차량을 관리합니다.</p>
          </div>
        </div>
        {!isLocked && (
          <Button 
            onClick={() => { resetForm(); setShowAddDialog(true); }}
            className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white gap-2 shadow-lg"
            data-testid="button-add-vehicle"
          >
            <Plus className="w-4 h-4" /> 차량 등록
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card 
          className={`bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 border-slate-200 dark:border-slate-700 cursor-pointer transition-all hover:shadow-lg ${filterStatus === "all" ? "ring-2 ring-slate-400 dark:ring-slate-500" : ""}`}
          onClick={() => setFilterStatus("all")}
          data-testid="stat-card-total"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-slate-200 dark:bg-slate-700 rounded-xl">
              <Car className="w-6 h-6 text-slate-600 dark:text-slate-300" />
            </div>
            <div>
              <p className="text-2xl font-bold">{stats.total}</p>
              <p className="text-sm text-muted-foreground">전체 차량</p>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/30 dark:to-green-800/20 border-green-200 dark:border-green-800 cursor-pointer transition-all hover:shadow-lg ${filterStatus === "운행중" ? "ring-2 ring-green-400 dark:ring-green-500" : ""}`}
          onClick={() => handleStatClick("운행중")}
          data-testid="stat-card-operating"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-green-200 dark:bg-green-800 rounded-xl">
              <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-300" />
            </div>
            <div>
              <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.operating}</p>
              <p className="text-sm text-muted-foreground">운행중</p>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`bg-gradient-to-br from-amber-50 to-amber-100 dark:from-amber-900/30 dark:to-amber-800/20 border-amber-200 dark:border-amber-800 cursor-pointer transition-all hover:shadow-lg ${filterStatus === "정비중" ? "ring-2 ring-amber-400 dark:ring-amber-500" : ""}`}
          onClick={() => handleStatClick("정비중")}
          data-testid="stat-card-maintenance"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-amber-200 dark:bg-amber-800 rounded-xl">
              <Wrench className="w-6 h-6 text-amber-600 dark:text-amber-300" />
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{stats.maintenance}</p>
              <p className="text-sm text-muted-foreground">정비중</p>
            </div>
          </CardContent>
        </Card>
        <Card 
          className={`bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/30 dark:to-blue-800/20 border-blue-200 dark:border-blue-800 cursor-pointer transition-all hover:shadow-lg ${filterStatus === "대기" ? "ring-2 ring-blue-400 dark:ring-blue-500" : ""}`}
          onClick={() => handleStatClick("대기")}
          data-testid="stat-card-idle"
        >
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 bg-blue-200 dark:bg-blue-800 rounded-xl">
              <Shield className="w-6 h-6 text-blue-600 dark:text-blue-300" />
            </div>
            <div>
              <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.idle}</p>
              <p className="text-sm text-muted-foreground">대기</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Input 
                placeholder="차량번호, 모델, 담당자 검색..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pr-9"
                data-testid="input-search-vehicles"
              />
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            </div>
            <Select value={filterTeam} onValueChange={setFilterTeam}>
              <SelectTrigger className="w-[160px]" data-testid="select-filter-team">
                <SelectValue placeholder="팀 선택" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 팀</SelectItem>
                {TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]" data-testid="select-filter-status">
                <SelectValue placeholder="상태" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체 상태</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {isLoading ? (
          [1,2,3,4,5,6].map(i => (
            <div key={i} className="h-56 bg-gradient-to-br from-muted/30 to-muted/10 rounded-2xl animate-pulse" />
          ))
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredVehicles.map((vehicle, idx) => (
              <motion.div
                key={vehicle.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: idx * 0.03 }}
                onClick={() => setSelectedVehicle(vehicle)}
                className="group relative bg-card rounded-2xl overflow-hidden border border-border/50 shadow-sm hover:shadow-xl hover:border-cyan-300 dark:hover:border-cyan-700 transition-all duration-300 cursor-pointer"
                data-testid={`card-vehicle-${vehicle.id}`}
              >
                {vehicle.imageUrl ? (
                  <div className="h-32 overflow-hidden bg-muted">
                    <img 
                      src={vehicle.imageUrl} 
                      alt={vehicle.model}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                  </div>
                ) : (
                  <div className="h-32 bg-gradient-to-br from-cyan-500/10 via-blue-500/10 to-indigo-500/10 flex items-center justify-center">
                    <Car className="w-16 h-16 text-cyan-500/30" />
                  </div>
                )}
                
                <div className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h3 className="font-bold text-lg">{vehicle.plateNumber}</h3>
                      <p className="text-sm text-muted-foreground">{vehicle.model} {vehicle.year && `(${vehicle.year})`}</p>
                    </div>
                    <Badge className={`${getStatusColor(vehicle.status)} gap-1 border`}>
                      {getStatusIcon(vehicle.status)}
                      {vehicle.status}
                    </Badge>
                  </div>
                  
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {vehicle.team}
                    </span>
                    {vehicle.driver && (
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3" /> {vehicle.driver}
                      </span>
                    )}
                  </div>
                  
                  {vehicle.mileage !== null && vehicle.mileage > 0 && (
                    <div className="flex items-center gap-1 text-sm text-muted-foreground">
                      <Gauge className="w-3 h-3" /> {vehicle.mileage.toLocaleString()} km
                    </div>
                  )}
                </div>

                {!isLocked && (
                  <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="bg-black/30 backdrop-blur-sm text-white hover:bg-blue-500 hover:text-white h-8 w-8"
                      onClick={(e) => { e.stopPropagation(); openEditDialog(vehicle); }}
                      data-testid={`button-edit-vehicle-${vehicle.id}`}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="bg-black/30 backdrop-blur-sm text-white hover:bg-red-500 hover:text-white h-8 w-8"
                      onClick={(e) => handleDelete(vehicle.id, e)}
                      data-testid={`button-delete-vehicle-${vehicle.id}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      {!isLoading && filteredVehicles.length === 0 && (
        <div className="text-center py-16 text-muted-foreground bg-gradient-to-br from-muted/20 to-transparent rounded-2xl border border-dashed">
          <Car className="w-16 h-16 mx-auto mb-4 text-muted-foreground/30" />
          <p className="text-lg font-medium">
            {searchQuery || filterTeam !== "all" || filterStatus !== "all" 
              ? "검색 결과가 없습니다." 
              : "등록된 차량이 없습니다."}
          </p>
          {!isLocked && !searchQuery && filterTeam === "all" && filterStatus === "all" && (
            <Button onClick={() => { resetForm(); setShowAddDialog(true); }} variant="outline" className="mt-4 gap-2">
              <Plus className="w-4 h-4" /> 첫 번째 차량 등록하기
            </Button>
          )}
        </div>
      )}

      <Dialog open={showAddDialog || !!editingVehicle} onOpenChange={(open) => { 
        if (!open) { setShowAddDialog(false); setEditingVehicle(null); resetForm(); }
      }}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Car className="w-5 h-5 text-cyan-500" />
              {editingVehicle ? "차량 정보 수정" : "새 차량 등록"}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">차량번호 *</label>
              <Input 
                placeholder="12가 3456" 
                value={formData.plateNumber || ""}
                onChange={e => setFormData(prev => ({ ...prev, plateNumber: e.target.value }))}
                data-testid="input-vehicle-plate"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">모델명 *</label>
              <Input 
                placeholder="아반떼, 쏘나타 등" 
                value={formData.model || ""}
                onChange={e => setFormData(prev => ({ ...prev, model: e.target.value }))}
                data-testid="input-vehicle-model"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">차종</label>
              <Select value={formData.vehicleType} onValueChange={v => setFormData(prev => ({ ...prev, vehicleType: v }))}>
                <SelectTrigger data-testid="select-vehicle-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VEHICLE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">연식</label>
              <Input 
                type="number" 
                value={formData.year || ""}
                onChange={e => setFormData(prev => ({ ...prev, year: parseInt(e.target.value) || undefined }))}
                data-testid="input-vehicle-year"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">사용팀 *</label>
              <Select value={formData.team} onValueChange={v => setFormData(prev => ({ ...prev, team: v }))}>
                <SelectTrigger data-testid="select-vehicle-team"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">상태</label>
              <Select value={formData.status} onValueChange={v => setFormData(prev => ({ ...prev, status: v }))}>
                <SelectTrigger data-testid="select-vehicle-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">담당자</label>
              <Input 
                placeholder="홍길동" 
                value={formData.driver || ""}
                onChange={e => setFormData(prev => ({ ...prev, driver: e.target.value }))}
                data-testid="input-vehicle-driver"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">연락처</label>
              <Input 
                placeholder="010-1234-5678" 
                value={formData.contact || ""}
                onChange={e => setFormData(prev => ({ ...prev, contact: e.target.value }))}
                data-testid="input-vehicle-contact"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">주행거리 (km)</label>
              <Input 
                type="number" 
                value={formData.mileage || ""}
                onChange={e => setFormData(prev => ({ ...prev, mileage: parseInt(e.target.value) || 0 }))}
                data-testid="input-vehicle-mileage"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">구매일</label>
              <Input 
                type="date" 
                value={formData.purchaseDate || ""}
                onChange={e => setFormData(prev => ({ ...prev, purchaseDate: e.target.value }))}
                data-testid="input-vehicle-purchase"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">정기점검일</label>
              <Input 
                type="date" 
                value={formData.inspectionDate || ""}
                onChange={e => setFormData(prev => ({ ...prev, inspectionDate: e.target.value }))}
                data-testid="input-vehicle-inspection"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">보험만료일</label>
              <Input 
                type="date" 
                value={formData.insuranceExpiry || ""}
                onChange={e => setFormData(prev => ({ ...prev, insuranceExpiry: e.target.value }))}
                data-testid="input-vehicle-insurance"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium">메모</label>
              <Input 
                placeholder="특이사항..." 
                value={formData.notes || ""}
                onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                data-testid="input-vehicle-notes"
              />
            </div>
            <div className="md:col-span-2 space-y-2">
              <label className="text-sm font-medium">차량 사진</label>
              <input
                type="file"
                accept="image/*"
                ref={imageInputRef}
                onChange={handleImageUpload}
                className="hidden"
                data-testid="input-vehicle-image"
              />
              {formData.imageUrl ? (
                <div className="relative inline-block">
                  <img src={formData.imageUrl} alt="차량 사진" className="max-h-40 rounded-lg border" />
                  <Button
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => setFormData(prev => ({ ...prev, imageUrl: "" }))}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isUploading}
                  className="gap-2"
                >
                  <ImagePlus className="w-4 h-4" />
                  {isUploading ? "업로드 중..." : "사진 추가"}
                </Button>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => { setShowAddDialog(false); setEditingVehicle(null); resetForm(); }}>
              취소
            </Button>
            <Button 
              onClick={editingVehicle ? handleEdit : handleAdd}
              disabled={isCreating || !formData.plateNumber || !formData.model}
              className="bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white gap-2"
              data-testid="button-save-vehicle"
            >
              {editingVehicle ? "수정" : "등록"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!selectedVehicle} onOpenChange={() => setSelectedVehicle(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedVehicle && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  <span className="text-2xl">{selectedVehicle.plateNumber}</span>
                  <Badge className={`${getStatusColor(selectedVehicle.status)} gap-1 border`}>
                    {getStatusIcon(selectedVehicle.status)}
                    {selectedVehicle.status}
                  </Badge>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-6 pt-4">
                {selectedVehicle.imageUrl && (
                  <img 
                    src={selectedVehicle.imageUrl} 
                    alt={selectedVehicle.model}
                    className="w-full max-h-64 object-cover rounded-xl border"
                  />
                )}
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">모델</p>
                    <p className="font-medium">{selectedVehicle.model}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">차종</p>
                    <p className="font-medium">{selectedVehicle.vehicleType}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">연식</p>
                    <p className="font-medium">{selectedVehicle.year || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">사용팀</p>
                    <p className="font-medium">{selectedVehicle.team}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">담당자</p>
                    <p className="font-medium">{selectedVehicle.driver || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">연락처</p>
                    <p className="font-medium">{selectedVehicle.contact || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">주행거리</p>
                    <p className="font-medium">{selectedVehicle.mileage?.toLocaleString() || 0} km</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">구매일</p>
                    <p className="font-medium">{selectedVehicle.purchaseDate || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">정기점검일</p>
                    <p className="font-medium">{selectedVehicle.inspectionDate || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">보험만료일</p>
                    <p className="font-medium">{selectedVehicle.insuranceExpiry || "-"}</p>
                  </div>
                </div>

                {selectedVehicle.notes && (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">메모</p>
                    <p className="font-medium">{selectedVehicle.notes}</p>
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t">
                  <span className="text-sm text-muted-foreground flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    등록일: {selectedVehicle.createdAt && format(new Date(selectedVehicle.createdAt), "yyyy-MM-dd")}
                  </span>
                  {!isLocked && (
                    <div className="flex gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => { openEditDialog(selectedVehicle); setSelectedVehicle(null); }}
                      >
                        <Edit2 className="w-4 h-4 mr-1" /> 수정
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={() => handleDelete(selectedVehicle.id)}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> 삭제
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
