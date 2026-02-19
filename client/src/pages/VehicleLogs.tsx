import { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
  Download,
  Image,
  Upload,
  FileSpreadsheet,
  Eye,
  ArrowLeft,
  Camera
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
  const [selectedVehicleForHistory, setSelectedVehicleForHistory] = useState<Vehicle | null>(null);

  const { data: vehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: logs, isLoading } = useQuery<VehicleLog[]>({
    queryKey: ["/api/vehicle-logs"],
  });

  const { data: vehicleHistoryLogs } = useQuery<VehicleLog[]>({
    queryKey: ["/api/vehicle-logs/by-vehicle", selectedVehicleForHistory?.id],
    enabled: !!selectedVehicleForHistory,
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest("DELETE", `/api/vehicle-logs/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-logs/by-vehicle"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-logs/last"] });
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

  const vehiclesWithLogs = useMemo(() => {
    if (!vehicles || !logs) return [];
    const logCountMap = new Map<number, number>();
    logs.forEach(log => {
      logCountMap.set(log.vehicleId, (logCountMap.get(log.vehicleId) || 0) + 1);
    });
    return vehicles
      .filter(v => logCountMap.has(v.id))
      .map(v => ({ ...v, logCount: logCountMap.get(v.id) || 0 }))
      .sort((a, b) => b.logCount - a.logCount);
  }, [vehicles, logs]);

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

  const handleExcelDownload = useCallback(async (vehicleId: number) => {
    try {
      const response = await fetch(`/api/vehicle-logs/export/${vehicleId}`, { credentials: "include" });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || "Export failed");
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = response.headers.get("content-disposition");
      let filename = "vehicle_log.xlsx";
      if (disposition) {
        const utf8Match = disposition.match(/filename\*=UTF-8''(.+)/);
        if (utf8Match) {
          filename = decodeURIComponent(utf8Match[1]);
        } else {
          const basicMatch = disposition.match(/filename="?(.+?)"?$/);
          if (basicMatch) filename = basicMatch[1];
        }
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: "엑셀 파일이 다운로드되었습니다." });
    } catch (err: any) {
      toast({ variant: "destructive", title: err?.message || "엑셀 다운로드에 실패했습니다." });
    }
  }, [toast]);

  if (selectedVehicleForHistory) {
    const historyLogs = vehicleHistoryLogs || [];
    const sortedHistory = [...historyLogs].sort((a, b) => a.logDate.localeCompare(b.logDate));
    let totalDistance = 0;
    sortedHistory.forEach(l => { totalDistance += Math.max(0, (l.afterMileage || 0) - (l.beforeMileage || 0)); });

    return (
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button variant="ghost" size="icon" onClick={() => setSelectedVehicleForHistory(null)} data-testid="button-back-history">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="bg-emerald-100 p-2 sm:p-2.5 rounded-lg text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
            <Car className="w-5 h-5 sm:w-6 sm:h-6" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg sm:text-xl font-display font-bold text-foreground truncate">
              {selectedVehicleForHistory.plateNumber} 누적 운행일지
            </h2>
            <p className="text-xs text-muted-foreground">{selectedVehicleForHistory.model} / {selectedVehicleForHistory.team}</p>
          </div>
          {canEditVehicleLogs && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => handleExcelDownload(selectedVehicleForHistory.id)}
              data-testid="button-export-excel"
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">엑셀 다운로드</span>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">총 운행 횟수</p>
              <p className="text-xl font-bold text-emerald-600">{historyLogs.length}회</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">총 운행거리</p>
              <p className="text-xl font-bold text-blue-600">{totalDistance.toLocaleString()}km</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">최근 주행거리</p>
              <p className="text-xl font-bold text-foreground">
                {sortedHistory.length > 0 ? (sortedHistory[sortedHistory.length - 1].afterMileage || 0).toLocaleString() : 0}km
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <p className="text-xs text-muted-foreground">마지막 운행일</p>
              <p className="text-xl font-bold text-foreground">
                {sortedHistory.length > 0 ? sortedHistory[sortedHistory.length - 1].logDate : "-"}
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="bg-emerald-50/50 dark:bg-emerald-900/10 border-b p-3 sm:p-4">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              운행 기록 ({historyLogs.length}건)
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/30">
                  <th className="px-3 py-2 text-left font-medium text-xs">No</th>
                  <th className="px-3 py-2 text-left font-medium text-xs">운행일</th>
                  <th className="px-3 py-2 text-left font-medium text-xs">운전자</th>
                  <th className="px-3 py-2 text-left font-medium text-xs">출발/도착</th>
                  <th className="px-3 py-2 text-left font-medium text-xs">경로</th>
                  <th className="px-3 py-2 text-left font-medium text-xs">용도</th>
                  <th className="px-3 py-2 text-right font-medium text-xs">출발전(km)</th>
                  <th className="px-3 py-2 text-right font-medium text-xs">도착후(km)</th>
                  <th className="px-3 py-2 text-right font-medium text-xs">운행(km)</th>
                  <th className="px-3 py-2 text-center font-medium text-xs">영수증</th>
                  {canEditVehicleLogs && <th className="px-3 py-2 text-center font-medium text-xs w-10"></th>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortedHistory.map((log, idx) => {
                  const distance = Math.max(0, (log.afterMileage || 0) - (log.beforeMileage || 0));
                  return (
                    <tr key={log.id} className="hover:bg-muted/20" data-testid={`history-row-${log.id}`}>
                      <td className="px-3 py-2 text-muted-foreground">{idx + 1}</td>
                      <td className="px-3 py-2 font-medium">{log.logDate}</td>
                      <td className="px-3 py-2">{log.driver}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">
                        {log.departureTime || "-"} ~ {log.arrivalTime || "-"}
                      </td>
                      <td className="px-3 py-2 text-xs max-w-[200px] truncate">
                        {log.departureLocation || "-"} → {log.arrivalLocation || "-"}
                      </td>
                      <td className="px-3 py-2 text-xs">{log.purpose || "-"}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{(log.beforeMileage || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs">{(log.afterMileage || 0).toLocaleString()}</td>
                      <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600 font-medium">{distance.toLocaleString()}</td>
                      <td className="px-3 py-2 text-center">
                        {log.fuelReceiptUrl ? (
                          <ReceiptImageViewer url={log.fuelReceiptUrl} />
                        ) : log.fuelAmount ? (
                          <span className="text-xs text-muted-foreground">{log.fuelAmount}</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">-</span>
                        )}
                      </td>
                      {canEditVehicleLogs && (
                        <td className="px-3 py-2 text-center">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive h-7 w-7"
                            onClick={() => {
                              if (confirm("이 운행일지를 삭제하시겠습니까?")) {
                                deleteMutation.mutate(log.id);
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            data-testid={`button-delete-history-${log.id}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              {sortedHistory.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 bg-muted/30 font-bold">
                    <td colSpan={8} className="px-3 py-2 text-right text-xs">합계</td>
                    <td className="px-3 py-2 text-right font-mono text-xs text-emerald-600">{totalDistance.toLocaleString()}</td>
                    <td colSpan={canEditVehicleLogs ? 2 : 1}></td>
                  </tr>
                </tfoot>
              )}
            </table>
            {historyLogs.length === 0 && (
              <div className="py-12 text-center text-muted-foreground">
                <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-30" />
                <p>운행 기록이 없습니다.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

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

      {vehiclesWithLogs.length > 0 && (
        <Card>
          <CardHeader className="bg-blue-50/50 dark:bg-blue-900/10 border-b p-3 sm:p-4">
            <CardTitle className="text-sm sm:text-base flex items-center gap-2">
              <Car className="w-4 h-4 text-blue-600" />
              차량별 누적 관리
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {vehiclesWithLogs.map(v => (
                <div
                  key={v.id}
                  className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                  onClick={() => setSelectedVehicleForHistory(v)}
                  data-testid={`vehicle-history-${v.id}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Badge variant="outline" className="font-mono text-xs gap-1 shrink-0">
                      <Car className="w-3 h-3" />
                      {v.plateNumber}
                    </Badge>
                    <span className="text-sm text-muted-foreground truncate">{v.model}</span>
                    <Badge variant="secondary" className="text-xs shrink-0">{v.team}</Badge>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge className="text-xs">{v.logCount}건</Badge>
                    <Button variant="ghost" size="icon" className="h-7 w-7" data-testid={`button-view-history-${v.id}`}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {canEditVehicleLogs && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={(e) => { e.stopPropagation(); handleExcelDownload(v.id); }}
                        data-testid={`button-download-${v.id}`}
                      >
                        <Download className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
            최근 운행 기록 ({filteredLogs.length}건)
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

                        {log.fuelReceiptUrl && (
                          <div className="flex items-center gap-2">
                            <Fuel className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                            <span className="text-muted-foreground">주유 영수증:</span>
                            <ReceiptImageViewer url={log.fuelReceiptUrl} />
                          </div>
                        )}

                        {log.fuelAmount && !log.fuelReceiptUrl && (
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

function ReceiptImageViewer({ url }: { url: string }) {
  const [showImage, setShowImage] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="gap-1 text-blue-600 text-xs h-auto py-0.5 px-1.5"
        onClick={() => setShowImage(true)}
        data-testid="button-view-receipt"
      >
        <Image className="w-3 h-3" />
        보기
      </Button>
      <Dialog open={showImage} onOpenChange={setShowImage}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Fuel className="w-5 h-5 text-emerald-600" />
              주유 영수증
            </DialogTitle>
          </DialogHeader>
          <div className="flex items-center justify-center">
            <img src={url} alt="주유 영수증" className="max-w-full max-h-[60vh] object-contain rounded-md" />
          </div>
        </DialogContent>
      </Dialog>
    </>
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
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedVehicle = vehicles.find(v => v.id.toString() === selectedVehicleId);

  const { data: lastLog } = useQuery<VehicleLog | null>({
    queryKey: ["/api/vehicle-logs/last", selectedVehicleId],
    enabled: !!selectedVehicleId,
  });

  useEffect(() => {
    if (lastLog && selectedVehicleId) {
      if (lastLog.arrivalLocation) {
        setDepartureLocation(lastLog.arrivalLocation);
      }
      if (lastLog.afterMileage) {
        setBeforeMileage(lastLog.afterMileage.toString());
      }
    }
  }, [lastLog, selectedVehicleId]);

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

  const handleReceiptChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        toast({ variant: "destructive", title: "파일 크기는 10MB 이하여야 합니다." });
        return;
      }
      setReceiptFile(file);
      const reader = new FileReader();
      reader.onload = (ev) => setReceiptPreview(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const uploadReceipt = async (): Promise<string | null> => {
    if (!receiptFile) return null;
    setUploadingReceipt(true);
    try {
      const reqRes = await fetch("/api/uploads/request-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name: receiptFile.name,
          size: receiptFile.size,
          contentType: receiptFile.type,
        }),
      });
      if (!reqRes.ok) throw new Error("Failed to get upload URL");
      const { uploadURL, objectPath } = await reqRes.json();
      const uploadRes = await fetch(uploadURL, {
        method: "PUT",
        headers: { "Content-Type": receiptFile.type },
        body: receiptFile,
      });
      if (!uploadRes.ok) throw new Error("Upload failed");
      return objectPath;
    } catch (error) {
      console.error("Receipt upload error:", error);
      toast({ variant: "destructive", title: "영수증 업로드에 실패했습니다." });
      return null;
    } finally {
      setUploadingReceipt(false);
    }
  };

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest("POST", "/api/vehicle-logs", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-logs/by-vehicle"] });
      queryClient.invalidateQueries({ queryKey: ["/api/vehicle-logs/last"] });
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
    setReceiptFile(null);
    setReceiptPreview(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedVehicle || !logDate) {
      toast({ variant: "destructive", title: "차량과 날짜를 선택해주세요." });
      return;
    }
    let fuelReceiptUrl: string | null = null;
    if (receiptFile) {
      fuelReceiptUrl = await uploadReceipt();
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
      fuelReceiptUrl,
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
            {lastLog && selectedVehicleId && (
              <div className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-900/20 p-2 rounded-md flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                이전 기록 ({lastLog.logDate}): 도착지 "{lastLog.arrivalLocation || '-'}", 주행거리 {(lastLog.afterMileage || 0).toLocaleString()}km 자동 반영됨
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
            <label className="text-sm font-medium flex items-center gap-2">
              <Camera className="w-4 h-4" />
              주유 영수증 사진
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleReceiptChange}
              className="hidden"
              data-testid="input-receipt-file"
            />
            {receiptPreview ? (
              <div className="relative">
                <img src={receiptPreview} alt="영수증 미리보기" className="w-full max-h-40 object-contain rounded-md border" />
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  className="absolute top-2 right-2 gap-1"
                  onClick={() => { setReceiptFile(null); setReceiptPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  data-testid="button-remove-receipt"
                >
                  <Trash2 className="w-3 h-3" />
                  삭제
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                className="w-full gap-2 h-20 border-dashed"
                onClick={() => fileInputRef.current?.click()}
                data-testid="button-upload-receipt"
              >
                <Upload className="w-5 h-5 text-muted-foreground" />
                <span className="text-muted-foreground">영수증 사진 촬영 또는 선택</span>
              </Button>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">주유량 (선택)</label>
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
            disabled={createMutation.isPending || uploadingReceipt || !selectedVehicle}
            data-testid="button-submit-log"
          >
            <BookOpen className="w-4 h-4" />
            {uploadingReceipt ? "영수증 업로드 중..." : createMutation.isPending ? "등록 중..." : "운행일지 등록"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
