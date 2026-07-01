import { useState, useRef, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Plus, Trash2, Eye, Thermometer, Sun, Mail, Loader2, PenLine, RotateCcw, FileDown, FileText } from "lucide-react";
import type { HeatWaveChecklist } from "@shared/schema";
import { format } from "date-fns";

const CHECKS_31 = [
  "그늘 준비",
  "시원하고 깨끗한 물 준비",
  "민감군 사전 확인",
];

const CHECKS_33 = [
  "매시간 10분씩 그늘에서 휴식하도록 조치",
  "오후 2시~5시 옥외작업 단축 또는 작업시간대 조정",
  "민감군 휴식시간 추가",
  "아이스조끼, 아이스팩 등 보냉장구 준비",
];

const CHECKS_35 = [
  "매시간 15분씩 그늘에서 휴식하도록 조치",
  "오후 2시~5시 옥외작업 중지",
  "민감군 옥외작업 중지",
];

const CHECKS_38 = [
  "사업장 전체 옥외작업 중지",
];

const ALERT_STATUS_OPTIONS = ["해당없음", "폭염주의보", "폭염경보"];

const alertBadgeVariant = (status: string) => {
  if (status === "폭염경보") return "destructive";
  if (status === "폭염주의보") return "secondary";
  return "outline";
};

type FormData = {
  checkDate: string;
  checkTime: string;
  targetArea: string;
  heatAlertStatus: string;
  currentTemperature: string;
  currentHumidity: string;
  currentFeelsLike: string;
  maxFeelsLikeForecast: string;
  checks31: boolean[];
  checks33: boolean[];
  checks35: boolean[];
  stopTime35Start: string;
  stopTime35End: string;
  checks38: boolean[];
  stopTime38Start: string;
  stopTime38End: string;
  author: string;
  safetyManager: string;
  authorSignature: string;
  safetyManagerSignature: string;
};

function emptyForm(): FormData {
  const now = new Date();
  return {
    checkDate: format(now, "yyyy-MM-dd"),
    checkTime: format(now, "HH:mm"),
    targetArea: "대구 / 경북",
    heatAlertStatus: "해당없음",
    currentTemperature: "",
    currentHumidity: "",
    currentFeelsLike: "",
    maxFeelsLikeForecast: "",
    checks31: [false, false, false],
    checks33: [false, false, false, false],
    checks35: [false, false, false],
    stopTime35Start: "",
    stopTime35End: "",
    checks38: [false],
    stopTime38Start: "",
    stopTime38End: "",
    author: "",
    safetyManager: "",
    authorSignature: "",
    safetyManagerSignature: "",
  };
}

function formFromRecord(r: HeatWaveChecklist): FormData {
  return {
    checkDate: r.checkDate,
    checkTime: r.checkTime,
    targetArea: r.targetArea,
    heatAlertStatus: r.heatAlertStatus,
    currentTemperature: r.currentTemperature?.toString() ?? "",
    currentHumidity: r.currentHumidity?.toString() ?? "",
    currentFeelsLike: r.currentFeelsLike?.toString() ?? "",
    maxFeelsLikeForecast: r.maxFeelsLikeForecast?.toString() ?? "",
    checks31: (r.checks31 as boolean[]) ?? [false, false, false],
    checks33: (r.checks33 as boolean[]) ?? [false, false, false, false],
    checks35: (r.checks35 as boolean[]) ?? [false, false, false],
    stopTime35Start: r.stopTime35Start ?? "",
    stopTime35End: r.stopTime35End ?? "",
    checks38: (r.checks38 as boolean[]) ?? [false],
    stopTime38Start: r.stopTime38Start ?? "",
    stopTime38End: r.stopTime38End ?? "",
    author: r.author ?? "",
    safetyManager: r.safetyManager ?? "",
    authorSignature: r.authorSignature ?? "",
    safetyManagerSignature: r.safetyManagerSignature ?? "",
  };
}

function formToPayload(f: FormData) {
  return {
    checkDate: f.checkDate,
    checkTime: f.checkTime,
    targetArea: f.targetArea,
    heatAlertStatus: f.heatAlertStatus,
    currentTemperature: f.currentTemperature ? parseFloat(f.currentTemperature) : null,
    currentHumidity: f.currentHumidity ? parseFloat(f.currentHumidity) : null,
    currentFeelsLike: f.currentFeelsLike ? parseFloat(f.currentFeelsLike) : null,
    maxFeelsLikeForecast: f.maxFeelsLikeForecast ? parseFloat(f.maxFeelsLikeForecast) : null,
    checks31: f.checks31,
    checks33: f.checks33,
    checks35: f.checks35,
    stopTime35Start: f.stopTime35Start || null,
    stopTime35End: f.stopTime35End || null,
    checks38: f.checks38,
    stopTime38Start: f.stopTime38Start || null,
    stopTime38End: f.stopTime38End || null,
    author: f.author || null,
    safetyManager: f.safetyManager || null,
    authorSignature: f.authorSignature || null,
    safetyManagerSignature: f.safetyManagerSignature || null,
  };
}

function SignaturePad({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (data: string) => void;
  label: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const [mode, setMode] = useState<"view" | "draw">(value ? "view" : "draw");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    canvas.width = canvas.offsetWidth;
    canvas.height = 100;
    ctx.strokeStyle = "#1d4ed8";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }, [mode]);

  const getPos = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return { x: ((e as React.MouseEvent).clientX - rect.left) * scaleX, y: ((e as React.MouseEvent).clientY - rect.top) * scaleY };
  }, []);

  const startDraw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setIsDrawing(true);
    setHasContent(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.TouchEvent | React.MouseEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const endDraw = useCallback(() => setIsDrawing(false), []);

  const clearCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
  }, []);

  const handleSave = useCallback(() => {
    if (!hasContent || !canvasRef.current) return;
    const data = canvasRef.current.toDataURL("image/png");
    onChange(data);
    setMode("view");
  }, [hasContent, onChange]);

  const handleReset = useCallback(() => {
    onChange("");
    setMode("draw");
    setHasContent(false);
  }, [onChange]);

  if (mode === "view" && value) {
    return (
      <div className="space-y-1">
        <div className="border rounded-lg overflow-hidden bg-white dark:bg-zinc-900 p-2 flex items-center justify-between gap-2">
          <img src={value} alt={`${label} 서명`} className="h-14 object-contain" />
          <Button type="button" variant="ghost" size="sm" onClick={handleReset} className="text-muted-foreground shrink-0">
            <RotateCcw className="w-3.5 h-3.5 mr-1" />다시
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <div className="border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900">
        <canvas
          ref={canvasRef}
          className="w-full touch-none cursor-crosshair block"
          style={{ height: "100px" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={clearCanvas} className="text-xs h-7">
          <RotateCcw className="w-3 h-3 mr-1" />지우기
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={handleSave}
          disabled={!hasContent}
          className="text-xs h-7"
        >
          <PenLine className="w-3 h-3 mr-1" />서명 완료
        </Button>
      </div>
    </div>
  );
}


function ChecklistPDFView({ record, pdfRef }: { record: HeatWaveChecklist; pdfRef: React.RefObject<HTMLDivElement | null> }) {
  const checks31 = (record.checks31 as boolean[]) ?? [];
  const checks33 = (record.checks33 as boolean[]) ?? [];
  const checks35 = (record.checks35 as boolean[]) ?? [];
  const checks38 = (record.checks38 as boolean[]) ?? [];

  const CheckRow = ({ done, label }: { done: boolean; label: string }) => (
    <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
      <span style={{ width: "16px", height: "16px", border: "1.5px solid #555", borderRadius: "3px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px", background: done ? "#1d4ed8" : "white" }}>
        {done && <span style={{ color: "white", fontSize: "11px", fontWeight: "bold" }}>✓</span>}
      </span>
      <span style={{ fontSize: "12px", lineHeight: "1.4" }}>{label}</span>
    </div>
  );

  const SectionHeader = ({ title, temp, color }: { title: string; temp: string; color: string }) => (
    <div style={{ background: color, padding: "5px 10px", fontWeight: "bold", fontSize: "12px", marginBottom: "6px", borderRadius: "4px 4px 0 0" }}>
      {title} <span style={{ fontWeight: "normal", fontSize: "11px" }}>({temp})</span>
    </div>
  );

  const alertColor = record.heatAlertStatus === "폭염경보" ? "#fee2e2" : record.heatAlertStatus === "폭염주의보" ? "#fef3c7" : "#f0fdf4";
  const alertTextColor = record.heatAlertStatus === "폭염경보" ? "#dc2626" : record.heatAlertStatus === "폭염주의보" ? "#d97706" : "#16a34a";

  return (
    <div ref={pdfRef} style={{ width: "794px", minHeight: "1123px", background: "white", padding: "40px", fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif", color: "#111", boxSizing: "border-box" }}>
      {/* 제목 */}
      <div style={{ textAlign: "center", marginBottom: "24px", borderBottom: "2.5px solid #1d4ed8", paddingBottom: "16px" }}>
        <div style={{ fontSize: "10px", color: "#555", letterSpacing: "2px", marginBottom: "4px" }}>산업안전보건법 시행규칙 별지 제95호 서식</div>
        <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: 0 }}>폭염 일일 체크리스트</h1>
        <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>Heat Wave Daily Safety Checklist</div>
      </div>

      {/* 기본 정보 */}
      <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "16px", fontSize: "12px" }}>
        <tbody>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "7px 12px", background: "#f8fafc", fontWeight: "bold", width: "22%" }}>작성일자</td>
            <td style={{ border: "1px solid #ddd", padding: "7px 12px", width: "28%" }}>{record.checkDate}</td>
            <td style={{ border: "1px solid #ddd", padding: "7px 12px", background: "#f8fafc", fontWeight: "bold", width: "22%" }}>작성시간</td>
            <td style={{ border: "1px solid #ddd", padding: "7px 12px", width: "28%" }}>{record.checkTime}</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "7px 12px", background: "#f8fafc", fontWeight: "bold" }}>대상 지역</td>
            <td style={{ border: "1px solid #ddd", padding: "7px 12px" }} colSpan={3}>{record.targetArea}</td>
          </tr>
          <tr>
            <td style={{ border: "1px solid #ddd", padding: "7px 12px", background: "#f8fafc", fontWeight: "bold" }}>폭염특보 현황</td>
            <td style={{ border: "1px solid #ddd", padding: "7px 12px" }} colSpan={3}>
              <span style={{ background: alertColor, color: alertTextColor, padding: "2px 10px", borderRadius: "12px", fontWeight: "bold", fontSize: "12px" }}>
                {record.heatAlertStatus}
              </span>
            </td>
          </tr>
        </tbody>
      </table>

      {/* 기상 정보 */}
      <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "12px 16px", marginBottom: "16px" }}>
        <div style={{ fontWeight: "bold", fontSize: "12px", color: "#1d4ed8", marginBottom: "8px" }}>▶ 현재 기상 정보</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
          {[
            ["현재 기온", record.currentTemperature != null ? `${record.currentTemperature}°C` : "-"],
            ["현재 습도", record.currentHumidity != null ? `${record.currentHumidity}%` : "-"],
            ["현재 체감온도", record.currentFeelsLike != null ? `${record.currentFeelsLike}°C` : "-"],
            ["최고 체감온도 예보", record.maxFeelsLikeForecast != null ? `${record.maxFeelsLikeForecast}°C` : "-"],
          ].map(([label, value]) => (
            <div key={label} style={{ textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#555", marginBottom: "2px" }}>{label}</div>
              <div style={{ fontSize: "16px", fontWeight: "bold", color: "#1d4ed8" }}>{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 단계별 체크리스트 */}
      <div style={{ fontWeight: "bold", fontSize: "13px", marginBottom: "10px", borderLeft: "4px solid #1d4ed8", paddingLeft: "8px" }}>단계별 조치사항 체크리스트</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
        <div style={{ border: "1px solid #fde68a", borderRadius: "6px", overflow: "hidden" }}>
          <SectionHeader title="폭염 관심" temp="31°C 이상" color="#fef9c3" />
          <div style={{ padding: "8px 12px" }}>
            {CHECKS_31.map((item, i) => <CheckRow key={i} done={checks31[i] ?? false} label={item} />)}
          </div>
        </div>
        <div style={{ border: "1px solid #fed7aa", borderRadius: "6px", overflow: "hidden" }}>
          <SectionHeader title="폭염 주의" temp="33°C 이상" color="#ffedd5" />
          <div style={{ padding: "8px 12px" }}>
            {CHECKS_33.map((item, i) => <CheckRow key={i} done={checks33[i] ?? false} label={item} />)}
          </div>
        </div>
        <div style={{ border: "1px solid #fca5a5", borderRadius: "6px", overflow: "hidden" }}>
          <SectionHeader title="폭염 경고" temp="35°C 이상" color="#fee2e2" />
          <div style={{ padding: "8px 12px" }}>
            {CHECKS_35.map((item, i) => <CheckRow key={i} done={checks35[i] ?? false} label={item} />)}
            {(record.stopTime35Start || record.stopTime35End) && (
              <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                작업중지 시간: {record.stopTime35Start ?? ""} ~ {record.stopTime35End ?? ""}
              </div>
            )}
          </div>
        </div>
        <div style={{ border: "1px solid #f87171", borderRadius: "6px", overflow: "hidden" }}>
          <SectionHeader title="폭염 위험" temp="38°C 이상" color="#fecaca" />
          <div style={{ padding: "8px 12px" }}>
            {CHECKS_38.map((item, i) => <CheckRow key={i} done={checks38[i] ?? false} label={item} />)}
            {(record.stopTime38Start || record.stopTime38End) && (
              <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>
                작업중지 시간: {record.stopTime38Start ?? ""} ~ {record.stopTime38End ?? ""}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 서명 영역 */}
      <div style={{ border: "1.5px solid #ddd", borderRadius: "6px", overflow: "hidden" }}>
        <div style={{ background: "#f8fafc", padding: "6px 14px", fontWeight: "bold", fontSize: "12px", borderBottom: "1px solid #ddd" }}>서명</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
          <div style={{ padding: "12px 16px", borderRight: "1px solid #ddd" }}>
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>작성자</div>
            <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "8px" }}>{record.author ?? ""}</div>
            {record.authorSignature ? (
              <img src={record.authorSignature} alt="작성자 서명" style={{ height: "60px", objectFit: "contain" }} />
            ) : (
              <div style={{ height: "60px", border: "1px dashed #ccc", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#aaa" }}>서명 없음</div>
            )}
          </div>
          <div style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>안전보건관리책임자</div>
            <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "8px" }}>{record.safetyManager ?? ""}</div>
            {record.safetyManagerSignature ? (
              <img src={record.safetyManagerSignature} alt="안전보건관리책임자 서명" style={{ height: "60px", objectFit: "contain" }} />
            ) : (
              <div style={{ height: "60px", border: "1px dashed #ccc", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#aaa" }}>서명 없음</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CheckSection({
  title,
  tempLabel,
  colorClass,
  items,
  checks,
  onChange,
  stopStart,
  stopEnd,
  onStopStartChange,
  onStopEndChange,
  hasStopTime = false,
  readOnly = false,
}: {
  title: string;
  tempLabel: string;
  colorClass: string;
  items: string[];
  checks: boolean[];
  onChange?: (idx: number, val: boolean) => void;
  stopStart?: string;
  stopEnd?: string;
  onStopStartChange?: (v: string) => void;
  onStopEndChange?: (v: string) => void;
  hasStopTime?: boolean;
  readOnly?: boolean;
}) {
  return (
    <div className={`border rounded-lg overflow-hidden ${colorClass}`}>
      <div className="px-4 py-2 flex items-center gap-2">
        <Thermometer className="w-4 h-4" />
        <span className="font-bold text-sm">{title}</span>
        <span className="text-xs opacity-75 ml-1">{tempLabel}</span>
      </div>
      <div className="bg-white dark:bg-zinc-900 px-4 py-3 space-y-2">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-start gap-2">
            <Checkbox
              id={`${title}-${idx}`}
              checked={checks[idx] ?? false}
              onCheckedChange={readOnly ? undefined : (v) => onChange?.(idx, !!v)}
              disabled={readOnly}
              data-testid={`checkbox-${title}-${idx}`}
              className="mt-0.5"
            />
            <label
              htmlFor={`${title}-${idx}`}
              className="text-sm leading-snug cursor-pointer select-none"
            >
              {item}
            </label>
          </div>
        ))}
        {hasStopTime && (
          <div className="flex items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground w-14">중지시간</span>
            <Input
              type="time"
              value={stopStart ?? ""}
              onChange={(e) => onStopStartChange?.(e.target.value)}
              disabled={readOnly}
              className="h-7 text-xs w-28"
              data-testid={`input-stop-start-${title}`}
            />
            <span className="text-xs">~</span>
            <Input
              type="time"
              value={stopEnd ?? ""}
              onChange={(e) => onStopEndChange?.(e.target.value)}
              disabled={readOnly}
              className="h-7 text-xs w-28"
              data-testid={`input-stop-end-${title}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function ChecklistForm({
  initial,
  onSubmit,
  isPending,
  readOnly = false,
}: {
  initial: FormData;
  onSubmit?: (data: FormData) => void;
  isPending?: boolean;
  readOnly?: boolean;
}) {
  const { toast } = useToast();
  const [form, setForm] = useState<FormData>(initial);
  const [emlParsing, setEmlParsing] = useState(false);
  const [emlSummary, setEmlSummary] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const set = (k: keyof FormData, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const setCheck = (field: "checks31" | "checks33" | "checks35" | "checks38", idx: number, val: boolean) => {
    setForm((f) => {
      const arr = [...(f[field] as boolean[])];
      arr[idx] = val;
      return { ...f, [field]: arr };
    });
  };

  const handleEmlFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.eml')) {
      toast({ title: ".eml 파일만 업로드 가능합니다", variant: "destructive" });
      return;
    }
    setEmlParsing(true);
    setEmlSummary(null);
    try {
      const fd = new FormData();
      fd.append("eml", file);
      const resp = await fetch("/api/heat-wave-checklists/parse-email", {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.message || "파싱 실패");
      setForm((f) => ({
        ...f,
        checkDate: data.checkDate || f.checkDate,
        targetArea: data.targetArea || f.targetArea,
        currentTemperature: data.currentTemperature?.toString() ?? f.currentTemperature,
        currentHumidity: data.currentHumidity?.toString() ?? f.currentHumidity,
        currentFeelsLike: data.currentFeelsLike?.toString() ?? f.currentFeelsLike,
        maxFeelsLikeForecast: data.maxFeelsLikeForecast?.toString() ?? f.maxFeelsLikeForecast,
        heatAlertStatus: data.heatAlertStatus || f.heatAlertStatus,
      }));
      setEmlSummary(data.summary || "기상 데이터가 자동으로 입력되었습니다");
      toast({ title: "이메일에서 기상 데이터를 불러왔습니다" });
    } catch (err: any) {
      toast({ title: err.message || "이메일 파싱 실패", variant: "destructive" });
    } finally {
      setEmlParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="space-y-5">
      {/* 이메일에서 불러오기 */}
      {!readOnly && (
        <div className="flex items-center gap-2 p-3 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20">
          <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-blue-700 dark:text-blue-300">이메일에서 기상 데이터 자동 입력</p>
            {emlSummary ? (
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-0.5 truncate">{emlSummary}</p>
            ) : (
              <p className="text-xs text-muted-foreground mt-0.5">「권역별 체감온도 안내」 .eml 파일을 올리면 기온·습도·체감온도를 자동으로 채웁니다</p>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".eml"
            className="hidden"
            onChange={handleEmlFile}
            data-testid="input-eml-file"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={emlParsing}
            onClick={() => fileInputRef.current?.click()}
            className="flex-shrink-0 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700"
            data-testid="button-load-email"
          >
            {emlParsing ? (
              <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> 분석 중...</>
            ) : (
              <><Mail className="w-3.5 h-3.5 mr-1" /> .eml 불러오기</>
            )}
          </Button>
        </div>
      )}

      {/* 기본 정보 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs">작성일자</Label>
          <Input
            type="date"
            value={form.checkDate}
            onChange={(e) => set("checkDate", e.target.value)}
            disabled={readOnly}
            data-testid="input-check-date"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">작성시간</Label>
          <Input
            type="time"
            value={form.checkTime}
            onChange={(e) => set("checkTime", e.target.value)}
            disabled={readOnly}
            data-testid="input-check-time"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">대상 지역</Label>
        <Input
          value={form.targetArea}
          onChange={(e) => set("targetArea", e.target.value)}
          disabled={readOnly}
          placeholder="예: 대구 / 경북"
          data-testid="input-target-area"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">폭염특보 현황</Label>
        <RadioGroup
          value={form.heatAlertStatus}
          onValueChange={(v) => set("heatAlertStatus", v)}
          disabled={readOnly}
          className="flex gap-4 pt-1"
          data-testid="radio-heat-alert-status"
        >
          {ALERT_STATUS_OPTIONS.map((opt) => (
            <div key={opt} className="flex items-center gap-1.5">
              <RadioGroupItem value={opt} id={`alert-${opt}`} />
              <Label htmlFor={`alert-${opt}`} className="text-sm cursor-pointer">{opt}</Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* 기상 정보 */}
      <div className="bg-blue-50 dark:bg-blue-950/30 rounded-lg p-3 space-y-3">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 flex items-center gap-1">
          <Sun className="w-3.5 h-3.5" /> 현재 기상 정보
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">현재 기온 (°C)</Label>
            <Input
              type="number"
              step="0.1"
              value={form.currentTemperature}
              onChange={(e) => set("currentTemperature", e.target.value)}
              disabled={readOnly}
              placeholder="예: 32.5"
              data-testid="input-current-temperature"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">현재 습도 (%)</Label>
            <Input
              type="number"
              step="0.1"
              value={form.currentHumidity}
              onChange={(e) => set("currentHumidity", e.target.value)}
              disabled={readOnly}
              placeholder="예: 75"
              data-testid="input-current-humidity"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">현재 체감온도 (°C)</Label>
            <Input
              type="number"
              step="0.1"
              value={form.currentFeelsLike}
              onChange={(e) => set("currentFeelsLike", e.target.value)}
              disabled={readOnly}
              placeholder="예: 35.2"
              data-testid="input-current-feels-like"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">최고 체감온도 예보 (°C)</Label>
            <Input
              type="number"
              step="0.1"
              value={form.maxFeelsLikeForecast}
              onChange={(e) => set("maxFeelsLikeForecast", e.target.value)}
              disabled={readOnly}
              placeholder="예: 38.0"
              data-testid="input-max-feels-like"
            />
          </div>
        </div>
      </div>

      {/* 단계별 체크리스트 */}
      <div className="space-y-3">
        <p className="text-xs font-semibold">단계별 조치사항 체크리스트</p>
        <CheckSection
          title="폭염 관심"
          tempLabel="31°C 이상"
          colorClass="border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-950/30 [&_.px-4]:bg-yellow-50 [&_.px-4]:dark:bg-yellow-950/30"
          items={CHECKS_31}
          checks={form.checks31 as boolean[]}
          onChange={readOnly ? undefined : (i, v) => setCheck("checks31", i, v)}
          readOnly={readOnly}
        />
        <CheckSection
          title="폭염 주의"
          tempLabel="33°C 이상"
          colorClass="border-orange-300 dark:border-orange-700 bg-orange-50 dark:bg-orange-950/30 [&_.px-4]:bg-orange-50 [&_.px-4]:dark:bg-orange-950/30"
          items={CHECKS_33}
          checks={form.checks33 as boolean[]}
          onChange={readOnly ? undefined : (i, v) => setCheck("checks33", i, v)}
          readOnly={readOnly}
        />
        <CheckSection
          title="폭염 경고"
          tempLabel="35°C 이상"
          colorClass="border-red-300 dark:border-red-700 bg-red-50 dark:bg-red-950/30 [&_.px-4]:bg-red-50 [&_.px-4]:dark:bg-red-950/30"
          items={CHECKS_35}
          checks={form.checks35 as boolean[]}
          onChange={readOnly ? undefined : (i, v) => setCheck("checks35", i, v)}
          stopStart={form.stopTime35Start}
          stopEnd={form.stopTime35End}
          onStopStartChange={(v) => set("stopTime35Start", v)}
          onStopEndChange={(v) => set("stopTime35End", v)}
          hasStopTime
          readOnly={readOnly}
        />
        <CheckSection
          title="폭염 위험"
          tempLabel="38°C 이상"
          colorClass="border-red-600 dark:border-red-800 bg-red-100 dark:bg-red-950/50 [&_.px-4]:bg-red-100 [&_.px-4]:dark:bg-red-950/50"
          items={CHECKS_38}
          checks={form.checks38 as boolean[]}
          onChange={readOnly ? undefined : (i, v) => setCheck("checks38", i, v)}
          stopStart={form.stopTime38Start}
          stopEnd={form.stopTime38End}
          onStopStartChange={(v) => set("stopTime38Start", v)}
          onStopEndChange={(v) => set("stopTime38End", v)}
          hasStopTime
          readOnly={readOnly}
        />
      </div>

      {/* 서명 영역 */}
      <div className="border rounded-lg overflow-hidden">
        <div className="bg-muted/40 px-3 py-2 flex items-center gap-1.5">
          <PenLine className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-xs font-semibold">서명</span>
        </div>
        <div className="grid grid-cols-2 divide-x">
          <div className="p-3 space-y-2">
            <Label className="text-xs font-medium">작성자</Label>
            <Input
              value={form.author}
              onChange={(e) => set("author", e.target.value)}
              disabled={readOnly}
              placeholder="성명"
              className="h-8 text-sm"
              data-testid="input-author"
            />
            {!readOnly ? (
              <SignaturePad
                value={form.authorSignature}
                onChange={(v) => set("authorSignature", v)}
                label="작성자"
              />
            ) : form.authorSignature ? (
              <div className="border rounded-lg bg-white dark:bg-zinc-900 p-2">
                <img src={form.authorSignature} alt="작성자 서명" className="h-14 object-contain" />
              </div>
            ) : (
              <div className="border rounded-lg bg-muted/30 h-14 flex items-center justify-center text-xs text-muted-foreground">
                서명 없음
              </div>
            )}
          </div>
          <div className="p-3 space-y-2">
            <Label className="text-xs font-medium">안전보건관리책임자</Label>
            <Input
              value={form.safetyManager}
              onChange={(e) => set("safetyManager", e.target.value)}
              disabled={readOnly}
              placeholder="성명"
              className="h-8 text-sm"
              data-testid="input-safety-manager"
            />
            {!readOnly ? (
              <SignaturePad
                value={form.safetyManagerSignature}
                onChange={(v) => set("safetyManagerSignature", v)}
                label="안전보건관리책임자"
              />
            ) : form.safetyManagerSignature ? (
              <div className="border rounded-lg bg-white dark:bg-zinc-900 p-2">
                <img src={form.safetyManagerSignature} alt="안전보건관리책임자 서명" className="h-14 object-contain" />
              </div>
            ) : (
              <div className="border rounded-lg bg-muted/30 h-14 flex items-center justify-center text-xs text-muted-foreground">
                서명 없음
              </div>
            )}
          </div>
        </div>
      </div>

      {!readOnly && onSubmit && (
        <Button
          className="w-full"
          onClick={() => onSubmit(form)}
          disabled={isPending}
          data-testid="button-submit-checklist"
        >
          {isPending ? "저장 중..." : "저장"}
        </Button>
      )}
    </div>
  );
}

export default function HeatWaveChecklist() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState<HeatWaveChecklist | null>(null);
  const [editing, setEditing] = useState<HeatWaveChecklist | null>(null);
  const [pdfViewing, setPdfViewing] = useState<HeatWaveChecklist | null>(null);
  const [isPdfDownloading, setIsPdfDownloading] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const handleDownloadPDF = async (record: HeatWaveChecklist) => {
    setPdfViewing(record);
    setIsPdfDownloading(true);
    // wait for DOM to render
    await new Promise((r) => setTimeout(r, 600));
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).jsPDF;
      const el = document.getElementById("heatwave-pdf-capture");
      if (!el) return;
      const canvas = await html2canvas(el, { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" });
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const ratio = canvas.height / canvas.width;
      const imgHeight = pageWidth * ratio;
      if (imgHeight <= pageHeight) {
        pdf.addImage(imgData, "JPEG", 0, 0, pageWidth, imgHeight);
      } else {
        let y = 0;
        while (y < canvas.height) {
          const sliceCanvas = document.createElement("canvas");
          sliceCanvas.width = canvas.width;
          sliceCanvas.height = Math.min(canvas.height - y, Math.floor((canvas.width * pageHeight) / pageWidth));
          const ctx = sliceCanvas.getContext("2d")!;
          ctx.drawImage(canvas, 0, -y);
          const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.95);
          const sliceH = (sliceCanvas.height / canvas.width) * pageWidth;
          if (y > 0) pdf.addPage();
          pdf.addImage(sliceData, "JPEG", 0, 0, pageWidth, sliceH);
          y += sliceCanvas.height;
        }
      }
      pdf.save(`폭염체크리스트_${record.checkDate}_${record.checkTime.replace(":", "")}.pdf`);
    } catch (e) {
      toast({ title: "PDF 생성 실패", variant: "destructive" });
    } finally {
      setIsPdfDownloading(false);
    }
  };

  const { data: records = [], isLoading } = useQuery<HeatWaveChecklist[]>({
    queryKey: ["/api/heat-wave-checklists"],
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/heat-wave-checklists", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heat-wave-checklists"] });
      toast({ title: "체크리스트가 저장되었습니다" });
      setShowForm(false);
    },
    onError: () => toast({ title: "저장 실패", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PUT", `/api/heat-wave-checklists/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heat-wave-checklists"] });
      toast({ title: "수정되었습니다" });
      setEditing(null);
    },
    onError: () => toast({ title: "수정 실패", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/heat-wave-checklists/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/heat-wave-checklists"] });
      toast({ title: "삭제되었습니다" });
    },
    onError: () => toast({ title: "삭제 실패", variant: "destructive" }),
  });

  const handleDelete = (id: number) => {
    if (confirm("이 체크리스트를 삭제하시겠습니까?")) {
      deleteMutation.mutate(id);
    }
  };

  const totalChecks = (r: HeatWaveChecklist) => {
    const c31 = (r.checks31 as boolean[])?.filter(Boolean).length ?? 0;
    const c33 = (r.checks33 as boolean[])?.filter(Boolean).length ?? 0;
    const c35 = (r.checks35 as boolean[])?.filter(Boolean).length ?? 0;
    const c38 = (r.checks38 as boolean[])?.filter(Boolean).length ?? 0;
    return c31 + c33 + c35 + c38;
  };

  const totalPossible = CHECKS_31.length + CHECKS_33.length + CHECKS_35.length + CHECKS_38.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sun className="w-6 h-6 text-orange-500" />
            폭염 일일 체크리스트
          </h1>
          <p className="text-sm text-muted-foreground mt-1">폭염 단계별 조치사항을 일별로 기록·관리합니다</p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-new-checklist">
          <Plus className="w-4 h-4 mr-1" /> 체크리스트 작성
        </Button>
      </div>

      {/* 목록 테이블 */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>작성일시</TableHead>
              <TableHead>대상지역</TableHead>
              <TableHead>폭염특보</TableHead>
              <TableHead className="text-center">기온 / 체감</TableHead>
              <TableHead className="text-center">조치 완료</TableHead>
              <TableHead>작성자</TableHead>
              <TableHead className="w-20 text-right">관리</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-10 text-muted-foreground">불러오는 중...</TableCell>
              </TableRow>
            ) : records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-14 text-muted-foreground">
                  <Sun className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p>등록된 체크리스트가 없습니다</p>
                  <p className="text-xs mt-1">우측 상단 버튼으로 작성하세요</p>
                </TableCell>
              </TableRow>
            ) : (
              records.map((r) => (
                <TableRow key={r.id} data-testid={`row-checklist-${r.id}`}>
                  <TableCell className="font-medium text-sm">
                    {r.checkDate}<br />
                    <span className="text-xs text-muted-foreground">{r.checkTime}</span>
                  </TableCell>
                  <TableCell className="text-sm">{r.targetArea}</TableCell>
                  <TableCell>
                    <Badge variant={alertBadgeVariant(r.heatAlertStatus)} data-testid={`badge-alert-${r.id}`}>
                      {r.heatAlertStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    {r.currentTemperature != null ? `${r.currentTemperature}°C` : "-"}
                    {r.currentFeelsLike != null && (
                      <span className="text-muted-foreground"> / {r.currentFeelsLike}°C</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className="font-medium">{totalChecks(r)}</span>
                    <span className="text-muted-foreground">/{totalPossible}</span>
                  </TableCell>
                  <TableCell className="text-sm">{r.author ?? "-"}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setViewing(r)}
                        data-testid={`button-view-${r.id}`}
                      >
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-blue-600 hover:text-blue-700"
                        onClick={() => setPdfViewing(r)}
                        title="PDF 미리보기"
                        data-testid={`button-pdf-${r.id}`}
                      >
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive hover:text-destructive"
                        onClick={() => handleDelete(r.id)}
                        disabled={deleteMutation.isPending}
                        data-testid={`button-delete-${r.id}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* 작성 다이얼로그 */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-orange-500" /> 폭염 일일 체크리스트 작성
            </DialogTitle>
          </DialogHeader>
          <ChecklistForm
            initial={emptyForm()}
            onSubmit={(data) => createMutation.mutate(formToPayload(data))}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* 상세보기 다이얼로그 */}
      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-orange-500" />
              폭염 일일 체크리스트 — {viewing?.checkDate} {viewing?.checkTime}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <ChecklistForm initial={formFromRecord(viewing)} readOnly />
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setPdfViewing(viewing); }}>
                  <FileText className="w-4 h-4 mr-1" /> PDF 미리보기
                </Button>
                <Button variant="outline" onClick={() => { setEditing(viewing); setViewing(null); }}>
                  수정
                </Button>
                <Button variant="ghost" onClick={() => setViewing(null)}>닫기</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 수정 다이얼로그 */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-orange-500" /> 체크리스트 수정
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <ChecklistForm
              initial={formFromRecord(editing)}
              onSubmit={(data) =>
                updateMutation.mutate({ id: editing.id, data: formToPayload(data) })
              }
              isPending={updateMutation.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* PDF 미리보기 다이얼로그 */}
      <Dialog open={!!pdfViewing} onOpenChange={() => { setPdfViewing(null); setIsPdfDownloading(false); }}>
        <DialogContent className="max-w-[900px] w-[95vw] max-h-[95vh] overflow-y-auto p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b sticky top-0 bg-background z-10">
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-blue-600" />
                PDF 미리보기 — {pdfViewing?.checkDate} {pdfViewing?.checkTime}
              </DialogTitle>
              <Button
                size="sm"
                onClick={() => pdfViewing && handleDownloadPDF(pdfViewing)}
                disabled={isPdfDownloading}
                className="mr-8"
                data-testid="button-download-pdf"
              >
                {isPdfDownloading ? (
                  <><Loader2 className="w-4 h-4 mr-1 animate-spin" />생성 중...</>
                ) : (
                  <><FileDown className="w-4 h-4 mr-1" />PDF 다운로드</>
                )}
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-auto bg-gray-100 p-6 flex justify-center">
            <div id="heatwave-pdf-capture" className="shadow-xl">
              {pdfViewing && <ChecklistPDFView record={pdfViewing} pdfRef={pdfRef} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
