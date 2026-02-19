import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { usePermissions } from "@/hooks/use-permissions";
import {
  BookOpen,
  Plus,
  Trash2,
  Car,
  MapPin,
  Clock,
  Fuel,
  Search,
  Calendar,
  User,
  ChevronDown
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Vehicle, VehicleLog } from "@shared/schema";

export default function VehicleLogs() {
  const { toast } = useToast();
  const { canEditVehicleLogs } = usePermissions();
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTeam, setFilterTeam] = useState("all");

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: logs, isLoading } = useQuery<VehicleLog[]>({
    queryKey: ["/api/vehicle-logs"],
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/vehicle-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-logs"] });
      toast({ title: "운행일지가 삭제되었습니다." });
    },
    onError: () => {
      toast({ variant: "destructive", title: "삭제에 실패했습니다." });
    },
  });

  const teams = useMemo(() => {
    if (!vehicles) return [];
    const teamSet = new Set(vehicles.map(v => v.team));
    return Array.from(teamSet).sort();
  }, [vehicles]);

  const filteredLogs = useMemo(() => {
    if (!logs) return [];
    return logs.filter(log => {
      const matchSearch = searchTerm === "" ||
        log.plateNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.driver.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.vehicleModel?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        log.purpose?.toLowerCase().includes(searchTerm.toLowerCase());
      const matchTeam = filterTeam === "all" || log.team === filterTeam;
      return matchSearch && matchTeam;
    });
  }, [logs, searchTerm, filterTeam]);

  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex items-center gap-2 sm:gap-3">
        <div className="bg-emerald-100 p-2 sm:p-2.5 md:p-3 rounded-lg sm:rounded-xl text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground">차량운행일지</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">차량별 운행 기록 관리</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="차량번호, 운전자, 모델명, 용도 검색..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
            data-testid="input-search-logs"
          />
        </div>
        <Select value={filterTeam} onValueChange={setFilterTeam}>
          <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-filter-team">
            <SelectValue placeholder="팀 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 팀</SelectItem>
            {teams.map(team => (
              <SelectItem key={team} value={team}>{team}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {canEditVehicleLogs && vehicles && vehicles.length > 0 && (
          <CreateLogDialog vehicles={vehicles} />
        )}
      </div>

      <Card>
        <CardHeader className="bg-emerald-50/50 dark:bg-emerald-900/10 border-b p-3 sm:p-4">
          <CardTitle className="text-sm sm:text-base flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-emerald-600" />
            운행 기록 ({filteredLogs.length}건)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-12 text-center text-muted-foreground">로딩 중...</div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p>등록된 운행일지가 없습니다.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="p-3 sm:p-4 hover:bg-muted/30 transition-colors"
                  data-testid={`log-row-${log.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="gap-1 font-mono text-xs">
                          <Car className="w-3 h-3" />
                          {log.plateNumber}
                        </Badge>
                        <span className="text-sm font-medium">{log.vehicleModel}</span>
                        <Badge variant="secondary" className="text-xs">{log.team}</Badge>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {log.logDate}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-sm">
                        <div className="flex items-center gap-2">
                          <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="text-muted-foreground">운전자:</span>
                          <span className="font-medium">{log.driver}</span>
                        </div>

                        {(log.departureTime || log.arrivalTime) && (
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">시간:</span>
                            <span>{log.departureTime || "-"} ~ {log.arrivalTime || "-"}</span>
                          </div>
                        )}

                        {(log.departureLocation || log.arrivalLocation) && (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">경로:</span>
                            <span className="truncate">{log.departureLocation || "-"} → {log.arrivalLocation || "-"}</span>
                          </div>
                        )}

                        {log.purpose && (
                          <div className="flex items-center gap-2">
                            <BookOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">용도:</span>
                            <span className="truncate">{log.purpose}</span>
                          </div>
                        )}

                        {(log.beforeMileage || log.afterMileage) ? (
                          <div className="flex items-center gap-2">
                            <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">주행:</span>
                            <span>{(log.beforeMileage || 0).toLocaleString()}km → {(log.afterMileage || 0).toLocaleString()}km</span>
                            {(log.afterMileage || 0) > (log.beforeMileage || 0) && (
                              <span className="text-emerald-600 text-xs">({((log.afterMileage || 0) - (log.beforeMileage || 0)).toLocaleString()}km)</span>
                            )}
                          </div>
                        ) : null}

                        {log.fuelAmount && (
                          <div className="flex items-center gap-2">
                            <Fuel className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">주유:</span>
                            <span>{log.fuelAmount}</span>
                          </div>
                        )}
                      </div>

                      {log.notes && (
                        <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2 mt-1">{log.notes}</p>
                      )}

                      {log.createdBy && (
                        <p className="text-xs text-muted-foreground">작성자: {log.createdBy}</p>
                      )}
                    </div>

                    {canEditVehicleLogs && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive shrink-0"
                        onClick={() => {
                          if (confirm("이 운행일지를 삭제하시겠습니까?")) {
                            deleteMutation.mutate(log.id);
                          }
                        }}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-log-${log.id}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function CreateLogDialog({ vehicles }: { vehicles: Vehicle[] }) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [logDate, setLogDate] = useState(new Date().toISOString().split("T")[0]);
  const [departureTime, setDepartureTime] = useState("");
  const [arrivalTime, setArrivalTime] = useState("");
  const [departureLocation, setDepartureLocation] = useState("");
  const [arrivalLocation, setArrivalLocation] = useState("");
  const [purpose, setPurpose] = useState("");
  const [beforeMileage, setBeforeMileage] = useState("");
  const [afterMileage, setAfterMileage] = useState("");
  const [fuelAmount, setFuelAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [vehicleSearch, setVehicleSearch] = useState("");
  const [showVehicleList, setShowVehicleList] = useState(false);

  const selectedVehicle = vehicles.find(v => v.id.toString() === selectedVehicleId);

  const filteredVehicles = useMemo(() => {
    if (!vehicleSearch) return vehicles;
    const s = vehicleSearch.toLowerCase();
    return vehicles.filter(v =>
      v.plateNumber.toLowerCase().includes(s) ||
      v.model.toLowerCase().includes(s) ||
      v.team.toLowerCase().includes(s) ||
      (v.driver || "").toLowerCase().includes(s)
    );
  }, [vehicles, vehicleSearch]);

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/vehicle-logs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-logs"] });
      toast({ title: "운행일지가 등록되었습니다." });
      setOpen(false);
      resetForm();
    },
    onError: () => {
      toast({ variant: "destructive", title: "등록에 실패했습니다." });
    },
  });

  const resetForm = () => {
    setSelectedVehicleId("");
    setLogDate(new Date().toISOString().split("T")[0]);
    setDepartureTime("");
    setArrivalTime("");
    setDepartureLocation("");
    setArrivalLocation("");
    setPurpose("");
    setBeforeMileage("");
    setAfterMileage("");
    setFuelAmount("");
    setNotes("");
    setVehicleSearch("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !logDate) {
      toast({ variant: "destructive", title: "차량과 날짜를 선택해주세요." });
      return;
    }
    createMutation.mutate({
      vehicleId: selectedVehicle.id,
      plateNumber: selectedVehicle.plateNumber,
      vehicleModel: selectedVehicle.model,
      team: selectedVehicle.team,
      driver: selectedVehicle.driver || "",
      logDate,
      departureTime: departureTime || null,
      arrivalTime: arrivalTime || null,
      departureLocation: departureLocation || null,
      arrivalLocation: arrivalLocation || null,
      purpose: purpose || null,
      beforeMileage: beforeMileage ? parseInt(beforeMileage) : 0,
      afterMileage: afterMileage ? parseInt(afterMileage) : 0,
      fuelAmount: fuelAmount || null,
      notes: notes || null,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
      <DialogTrigger asChild>
        <Button className="gap-2" data-testid="button-create-log">
          <Plus className="w-4 h-4" />
          일지 작성
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-emerald-600" />
            차량운행일지 작성
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">차량 선택 <span className="text-destructive">*</span></label>
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="차량번호, 모델, 팀, 운전자로 검색..."
                  value={vehicleSearch}
                  onChange={(e) => { setVehicleSearch(e.target.value); setShowVehicleList(true); }}
                  onFocus={() => setShowVehicleList(true)}
                  className="pl-9"
                  data-testid="input-vehicle-search"
                />
              </div>
              {showVehicleList && (
                <div className="absolute z-50 w-full mt-1 max-h-48 overflow-y-auto bg-background border rounded-md shadow-lg">
                  {filteredVehicles.length === 0 ? (
                    <div className="p-3 text-sm text-muted-foreground text-center">검색 결과 없음</div>
                  ) : (
                    filteredVehicles.slice(0, 20).map(v => (
                      <button
                        key={v.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/50 transition-colors flex items-center justify-between gap-2 ${selectedVehicleId === v.id.toString() ? "bg-primary/10" : ""}`}
                        onClick={() => {
                          setSelectedVehicleId(v.id.toString());
                          setVehicleSearch(`${v.plateNumber} - ${v.model}`);
                          setShowVehicleList(false);
                        }}
                        data-testid={`vehicle-option-${v.id}`}
                      >
                        <div className="flex items-center gap-2">
                          <Car className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                          <span className="font-mono font-medium">{v.plateNumber}</span>
                          <span className="text-muted-foreground">{v.model}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{v.team}</span>
                          {v.driver && <span>({v.driver})</span>}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
            {selectedVehicle && (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-900/20 rounded-md text-sm">
                <Car className="w-4 h-4 text-emerald-600" />
                <span className="font-medium">{selectedVehicle.plateNumber}</span>
                <span className="text-muted-foreground">{selectedVehicle.model}</span>
                <Badge variant="secondary" className="text-xs">{selectedVehicle.team}</Badge>
                {selectedVehicle.driver && <span className="text-muted-foreground">({selectedVehicle.driver})</span>}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">운행일 <span className="text-destructive">*</span></label>
              <Input
                type="date"
                value={logDate}
                onChange={(e) => setLogDate(e.target.value)}
                data-testid="input-log-date"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">운행 용도</label>
              <Input
                placeholder="업무, 출장 등"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                data-testid="input-purpose"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">출발 시간</label>
              <Input
                type="time"
                value={departureTime}
                onChange={(e) => setDepartureTime(e.target.value)}
                data-testid="input-departure-time"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">도착 시간</label>
              <Input
                type="time"
                value={arrivalTime}
                onChange={(e) => setArrivalTime(e.target.value)}
                data-testid="input-arrival-time"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">출발지</label>
              <Input
                placeholder="출발 위치"
                value={departureLocation}
                onChange={(e) => setDepartureLocation(e.target.value)}
                data-testid="input-departure-location"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">도착지</label>
              <Input
                placeholder="도착 위치"
                value={arrivalLocation}
                onChange={(e) => setArrivalLocation(e.target.value)}
                data-testid="input-arrival-location"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">출발 전 주행거리 (km)</label>
              <Input
                type="number"
                placeholder="0"
                value={beforeMileage}
                onChange={(e) => setBeforeMileage(e.target.value)}
                data-testid="input-before-mileage"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">도착 후 주행거리 (km)</label>
              <Input
                type="number"
                placeholder="0"
                value={afterMileage}
                onChange={(e) => setAfterMileage(e.target.value)}
                data-testid="input-after-mileage"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">주유량</label>
            <Input
              placeholder="예: 30L"
              value={fuelAmount}
              onChange={(e) => setFuelAmount(e.target.value)}
              data-testid="input-fuel-amount"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">비고</label>
            <Textarea
              placeholder="추가 메모 사항"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none"
              rows={2}
              data-testid="input-notes"
            />
          </div>

          <Button
            type="submit"
            className="w-full gap-2"
            disabled={createMutation.isPending || !selectedVehicle}
            data-testid="button-submit-log"
          >
            <BookOpen className="w-4 h-4" />
            {createMutation.isPending ? "등록 중..." : "운행일지 등록"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
