import { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
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
import { Plus, Trash2, Eye, Thermometer, Sun, Mail, Loader2, PenLine, RotateCcw, FileDown, FileText, Pencil, RefreshCw } from "lucide-react";
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
}: {
  value: string;
  onChange: (data: string) => void;
  label: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [paths, setPaths] = useState<string[]>([]);
  const [currentPath, setCurrentPath] = useState<string>("");
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSig, setHasSig] = useState(!!value);
  const [showExisting, setShowExisting] = useState(!!value);

  const getXY = (e: React.TouchEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    const clientX = "touches" in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = "touches" in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    return {
      x: +((clientX - rect.left) / rect.width * 600).toFixed(1),
      y: +((clientY - rect.top) / rect.height * 120).toFixed(1),
    };
  };

  const startDraw = (e: React.TouchEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    e.preventDefault();
    if (showExisting) return;
    const { x, y } = getXY(e);
    setIsDrawing(true);
    setCurrentPath(`M${x},${y}`);
  };

  const draw = (e: React.TouchEvent<SVGSVGElement> | React.MouseEvent<SVGSVGElement>) => {
    if (!isDrawing) return;
    e.preventDefault();
    const { x, y } = getXY(e);
    setCurrentPath((p) => p + ` L${x},${y}`);
  };

  const endDraw = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (!currentPath) return;
    const newPaths = [...paths, currentPath];
    setPaths(newPaths);
    setCurrentPath("");
    const pathEls = newPaths.map((d) => `<path d="${d}" stroke="#1d4ed8" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 120" width="600" height="120">${pathEls}</svg>`;
    const dataUrl = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgStr)))}`;
    onChange(dataUrl);
    setHasSig(true);
  };

  const clearSig = () => {
    setPaths([]);
    setCurrentPath("");
    setHasSig(false);
    setShowExisting(false);
    onChange("");
  };

  return (
    <div className="space-y-1.5">
      <div className="relative border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg overflow-hidden bg-white dark:bg-zinc-900" style={{ height: "80px" }}>
        {showExisting && value ? (
          <img src={value} alt="서명" className="w-full h-full object-contain" />
        ) : (
          <svg
            ref={svgRef}
            viewBox="0 0 600 120"
            className="w-full touch-none cursor-crosshair block"
            style={{ height: "80px" }}
            onMouseDown={startDraw}
            onMouseMove={draw}
            onMouseUp={endDraw}
            onMouseLeave={endDraw}
            onTouchStart={startDraw}
            onTouchMove={draw}
            onTouchEnd={endDraw}
          >
            {paths.map((d, i) => (
              <path key={i} d={d} stroke="#1d4ed8" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            ))}
            {currentPath && (
              <path d={currentPath} stroke="#1d4ed8" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
            )}
          </svg>
        )}
        {!hasSig && !showExisting && !isDrawing && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-xs text-muted-foreground/50 flex items-center gap-1">
              <PenLine className="w-3.5 h-3.5" />여기에 서명하세요
            </p>
          </div>
        )}
        {(hasSig || showExisting) && (
          <div className="absolute top-1 right-1.5 text-[10px] text-green-600 font-semibold bg-green-50 px-1.5 py-0.5 rounded">✓ 저장됨</div>
        )}
      </div>
      <Button type="button" variant="outline" size="sm" onClick={clearSig} className="text-xs h-7">
        <RotateCcw className="w-3 h-3 mr-1" />지우기
      </Button>
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
      <div className="px-3 sm:px-4 py-2 flex items-center gap-2">
        <Thermometer className="w-4 h-4" />
        <span className="font-bold text-sm">{title}</span>
        <span className="text-xs opacity-75 ml-1">{tempLabel}</span>
      </div>
      <div className="bg-white dark:bg-zinc-900 px-3 sm:px-4 py-3 space-y-2">
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
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <span className="text-xs text-muted-foreground">중지시간</span>
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
    <div className="space-y-4">
      {/* 이메일에서 불러오기 */}
      {!readOnly && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 p-3 rounded-lg border border-dashed border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-950/20">
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
            className="flex-shrink-0 w-full sm:w-auto text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:border-blue-700"
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
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          className="flex flex-wrap gap-x-4 gap-y-2 pt-1"
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
        <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-y sm:divide-y-0">
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
                <img src={form.authorSignature} alt="작성자 서명" className="h-12 object-contain" />
              </div>
            ) : (
              <div className="border rounded-lg bg-muted/30 h-12 flex items-center justify-center text-xs text-muted-foreground">
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
                <img src={form.safetyManagerSignature} alt="안전보건관리책임자 서명" className="h-12 object-contain" />
              </div>
            ) : (
              <div className="border rounded-lg bg-muted/30 h-12 flex items-center justify-center text-xs text-muted-foreground">
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

// ─── 대구·경북 체감온도 지도 ──────────────────────────────────
// 좌표계: 640×622 (지도 픽셀 영역 x=20~600, y=9~621)
// 위경도→픽셀 변환: LON_W=127.90 LON_E=129.57 LAT_N=37.57 LAT_S=35.49
// 캘리브레이션: 이미지 픽셀 분석 기반 (봉화↔청도 y축, 봉화↔울진 x축)
// y_scale=394.4 px/deg, x_scale=250.0 px/deg, ref=(351,69) @ (36.893N,128.732E)
const DGKB_CITIES: { name: string; x: number; y: number; r?: number }[] = [
  { name: "울릉", x: 570, y: 28, r: 20 }, // 울릉도 — 지도 우상단 고정
  { name: "봉화", x: 351, y: 69 },
  { name: "울진", x: 518, y: 30 },
  { name: "영주", x: 324, y: 104 },
  { name: "영양", x: 446, y: 161 },
  { name: "문경", x: 215, y: 187 },
  { name: "예천", x: 281, y: 165 },
  { name: "안동", x: 349, y: 198 },
  { name: "청송", x: 432, y: 251 },
  { name: "영덕", x: 509, y: 258 },
  { name: "상주", x: 208, y: 259 },
  { name: "의성", x: 342, y: 282 },
  { name: "구미", x: 254, y: 374 },
  { name: "군위", x: 311, y: 325 },
  { name: "포항", x: 513, y: 426 },
  { name: "영천", x: 402, y: 432 },
  { name: "칠곡", x: 268, y: 424 },
  { name: "경주", x: 474, y: 478 },
  { name: "성주", x: 239, y: 453 },
  { name: "고령", x: 234, y: 529 },
  { name: "대구", x: 316, y: 472 },
  { name: "경산", x: 353, y: 490 },
  { name: "청도", x: 352, y: 560 },
];

function getHeatFill(t: number | undefined): string {
  if (t === undefined) return "#e5e7eb";
  if (t >= 38) return "#ef4444";
  if (t >= 35) return "#f97316";
  if (t >= 33) return "#fde047";
  if (t >= 31) return "#7dd3fc";
  return "#dbeafe";
}
function getHeatText(t: number | undefined): string {
  if (t === undefined) return "#9ca3af";
  if (t >= 38 || t >= 35) return "#fff";
  if (t >= 33) return "#713f12";
  return "#075985";
}
function getHeatStroke(t: number | undefined): string {
  if (t === undefined) return "#d1d5db";
  if (t >= 38) return "#dc2626";
  if (t >= 35) return "#ea580c";
  if (t >= 33) return "#ca8a04";
  if (t >= 31) return "#0284c7";
  return "#3b82f6";
}

type CityHeat = { feelsLike: number; heatLevel: string };
type ParsedCSVData = {
  date: string;
  maxFeelsLike: number;
  avgTemp: number;
  avgHumidity: number;
  dominantHeatLevel: string;
};





// ─── Three.js 3D 지도 ─────────────────────────────────────────
interface MapRegion { name: string; type: string; color: string; polys: number[][][]; label: number[]; }
interface PanelOpts {
  height: number; bevel: number; radius: number; theta: number; phi: number;
  baseRadius: number; fogNear: number; fogFar: number; sun: [number,number,number];
  labels: boolean; fontSize: number; spin: boolean;
}
interface RegionEntry { meshes: THREE.Mesh[]; topMat: THREE.MeshStandardMaterial; sideMat: THREE.MeshStandardMaterial; baseColor: THREE.Color; baseDepth: number; sprite: THREE.Sprite | null; }
interface ThreePanel { scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; tick: () => void; cleanup: () => void; }
interface RegionWeather { feels: number; temp: number | null; hum: number | null; stage: string; time: string; }

function heatColorHex(t: number): string {
  const stops: [number, [number,number,number]][] = [
    [20, [0x3a,0xa0,0xa0]], [28, [0xf2,0xd2,0x4b]], [31, [0xf7,0xb7,0x33]],
    [33, [0xf2,0x71,0x1c]], [35, [0xe0,0x39,0x2b]], [38, [0x8b,0x1e,0x1e]],
  ];
  if (t <= stops[0][0]) return rgbHex(stops[0][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i], [t1, c1] = stops[i+1];
    if (t >= t0 && t <= t1) {
      const f = (t - t0) / (t1 - t0);
      return rgbHex(c0.map((v, idx) => Math.round(v + (c1[idx] - v) * f)) as [number,number,number]);
    }
  }
  return rgbHex(stops[stops.length-1][1]);
}
function rgbHex(c: [number,number,number]): string { return '#' + c.map(v => v.toString(16).padStart(2,'0')).join(''); }
function heatHeightScale(t: number, base: number): number {
  const h = 10 + (t - 20) * 4.2;
  return Math.max(8, Math.min(95, h)) / base;
}

function RegionInfoCard({
  info,
  onClose,
  heatColorFn,
}: {
  info: { name: string; weather: RegionWeather | null };
  onClose: () => void;
  heatColorFn: (t: number) => string;
}) {
  const w = info.weather;
  return (
    <div style={{
      position:'absolute', top:8, left:8, zIndex:20,
      background:'rgba(10,14,22,0.93)',
      border:'1px solid rgba(255,255,255,0.13)',
      borderRadius:12, padding:'10px 14px',
      backdropFilter:'blur(6px)',
      WebkitBackdropFilter:'blur(6px)',
      minWidth:160, maxWidth:220,
      boxShadow:'0 8px 24px rgba(0,0,0,0.5)',
      pointerEvents:'auto',
    }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8}}>
        <span style={{fontSize:15, fontWeight:700, color:'#e8ecf1', lineHeight:1.2}}>{info.name}</span>
        <button
          onClick={onClose}
          style={{background:'none',border:'none',color:'#697384',cursor:'pointer',fontSize:16,padding:'0 0 0 8px',lineHeight:1,flexShrink:0}}
        >✕</button>
      </div>
      {w ? (
        <>
          <div style={{display:'flex', alignItems:'baseline', gap:4, marginBottom:6}}>
            <span style={{fontSize:32, fontWeight:800, color: heatColorFn(w.feels), lineHeight:1}}>{w.feels}</span>
            <span style={{fontSize:14, color: heatColorFn(w.feels), fontWeight:600}}>°C</span>
            <span style={{fontSize:11, color:'#9aa5b3', marginLeft:2}}>체감</span>
          </div>
          <div style={{display:'grid', gridTemplateColumns:'auto 1fr', columnGap:10, rowGap:4, fontSize:12}}>
            <span style={{color:'#697384'}}>기온</span>
            <span style={{color:'#c5cdd7', fontWeight:600}}>{w.temp != null ? `${w.temp}°C` : '-'}</span>
            <span style={{color:'#697384'}}>습도</span>
            <span style={{color:'#7dd3fc', fontWeight:600}}>{w.hum != null ? `${w.hum}%` : '-'}</span>
          </div>
          {w.stage && (
            <div style={{marginTop:8, fontSize:11, fontWeight:600, color:'#ffd9a0',
              background:'rgba(255,200,100,0.08)', borderRadius:5, padding:'3px 7px',
              display:'inline-block'}}>
              {w.stage}
            </div>
          )}
          {w.time && (
            <div style={{marginTop:4, fontSize:10, color:'#4a5568'}}>{w.time} 기준</div>
          )}
        </>
      ) : (
        <div style={{fontSize:12, color:'#697384'}}>
          데이터 없음
          <div style={{fontSize:10, marginTop:4, color:'#4a5568'}}>CSV를 업로드하면 표시됩니다</div>
        </div>
      )}
    </div>
  );
}

function makeLabelSprite3D(text: string, fontSize: number): THREE.Sprite {
  const c2 = document.createElement('canvas');
  const ctx2 = c2.getContext('2d')!;
  ctx2.font = `700 ${fontSize}px 'Malgun Gothic', sans-serif`;
  const padX = 16, tw = Math.ceil(ctx2.measureText(text).width) + padX*2, th = fontSize + 20;
  c2.width = tw*2; c2.height = th*2;
  ctx2.scale(2,2);
  ctx2.font = `700 ${fontSize}px 'Malgun Gothic', sans-serif`;
  ctx2.textBaseline = 'middle'; ctx2.textAlign = 'center';
  ctx2.fillStyle = 'rgba(12,15,20,0.72)';
  const rr = 8;
  ctx2.beginPath();
  ctx2.moveTo(rr,0); ctx2.arcTo(tw,0,tw,th,rr); ctx2.arcTo(tw,th,0,th,rr);
  ctx2.arcTo(0,th,0,0,rr); ctx2.arcTo(0,0,tw,0,rr);
  ctx2.closePath(); ctx2.fill();
  ctx2.fillStyle = '#f2f5f8';
  ctx2.fillText(text, tw/2, th/2+1);
  const tex = new THREE.CanvasTexture(c2);
  tex.minFilter = THREE.LinearFilter;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: true, depthWrite: false, transparent: true });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(tw*0.36, th*0.36, 1);
  return sprite;
}

function initThreePanel(
  mount: HTMLElement,
  regions: MapRegion[],
  opts: PanelOpts,
  registry: Record<string, RegionEntry>,
  tooltipEl: HTMLElement | null,
  weatherRef: React.MutableRefObject<Record<string, RegionWeather>>,
  onRegionClick?: (name: string, weather: RegionWeather | null) => void
): ThreePanel {
  const W = () => mount.clientWidth, H = () => mount.clientHeight;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1117);
  scene.fog = new THREE.Fog(0x0d1117, opts.fogNear, opts.fogFar);
  const camera = new THREE.PerspectiveCamera(42, W()/H(), 1, 5000);
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(W(), H());
  renderer.shadowMap.enabled = true;
  mount.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xd4e8ff, 0x1a1f28, 1.2));
  const sun = new THREE.DirectionalLight(0xfff8f0, 1.6);
  sun.position.set(...opts.sun); sun.castShadow = true;
  sun.shadow.mapSize.set(1024,1024);
  const fs = opts.fogFar*0.6;
  (sun.shadow.camera as any).left=-fs; (sun.shadow.camera as any).right=fs;
  (sun.shadow.camera as any).top=fs; (sun.shadow.camera as any).bottom=-fs;
  (sun.shadow.camera as any).near=10; (sun.shadow.camera as any).far=opts.fogFar*2;
  sun.shadow.bias=-0.0018; scene.add(sun);
  const root = new THREE.Group(); scene.add(root);
  const base = new THREE.Mesh(new THREE.CircleGeometry(opts.baseRadius,64), new THREE.MeshStandardMaterial({color:0x0c1018,roughness:0.9,metalness:0.12}));
  base.rotation.x = -Math.PI/2; base.position.y = -2; base.receiveShadow = true; root.add(base);
  const grid = new THREE.GridHelper(opts.baseRadius*2, 28, 0x1e2535, 0x141b26);
  (grid as any).position.y = -1.8; root.add(grid);
  const HEIGHT = opts.height, raycastTargets: THREE.Mesh[] = [];
  regions.forEach(region => {
    const baseColor = new THREE.Color(region.color);
    const topMat = new THREE.MeshStandardMaterial({color:baseColor.clone(),roughness:0.6,metalness:0.12,side:THREE.DoubleSide});
    const sideMat = new THREE.MeshStandardMaterial({color:baseColor.clone().multiplyScalar(0.65),roughness:0.85,metalness:0.06,side:THREE.DoubleSide});
    const entry: RegionEntry = { meshes: [], topMat, sideMat, baseColor, baseDepth: HEIGHT, sprite: null };
    registry[region.name] = entry;
    region.polys.forEach(ring => {
      if (ring.length < 3) return;
      const shape = new THREE.Shape();
      shape.moveTo(ring[0][0], ring[0][1]);
      for (let i=1;i<ring.length;i++) shape.lineTo(ring[i][0], ring[i][1]);
      shape.closePath();
      const geo = new THREE.ExtrudeGeometry(shape,{depth:HEIGHT,bevelEnabled:true,bevelThickness:opts.bevel,bevelSize:opts.bevel,bevelSegments:2,steps:1});
      geo.rotateX(-Math.PI/2);
      const mesh = new THREE.Mesh(geo,[topMat,sideMat]);
      mesh.castShadow = true; mesh.receiveShadow = true;
      mesh.userData.name = region.name; mesh.userData.type = region.type;
      mesh.userData.topMat = topMat; mesh.userData.baseColor = baseColor;
      root.add(mesh); raycastTargets.push(mesh); entry.meshes.push(mesh);
    });
    if (opts.labels && region.label) {
      const sprite = makeLabelSprite3D(region.name, opts.fontSize);
      sprite.position.set(region.label[0], HEIGHT+10, -region.label[1]);
      sprite.renderOrder = 2; root.add(sprite); entry.sprite = sprite;
    }
  });
  let radius = opts.radius, theta = opts.theta, phi = opts.phi;
  const target = new THREE.Vector3(0,0,0);
  function updateCam() {
    camera.position.x = target.x + radius*Math.sin(phi)*Math.sin(theta);
    camera.position.y = target.y + radius*Math.cos(phi);
    camera.position.z = target.z + radius*Math.sin(phi)*Math.cos(theta);
    camera.lookAt(target);
  }
  updateCam();
  let dragging = false, lastX = 0, lastY = 0, autoRotate = false;
  const dom = renderer.domElement;
  const raycaster = new THREE.Raycaster(), mouseNDC = new THREE.Vector2();
  let hovered: THREE.Mesh | null = null;
  function setHi(mesh: THREE.Mesh | null, on: boolean) {
    if (!mesh) return;
    const c = (mesh.userData.baseColor as THREE.Color).clone();
    if (on) c.multiplyScalar(1.35);
    (mesh.userData.topMat as THREE.MeshStandardMaterial).color.copy(c);
  }
  function pick(cx: number, cy: number): THREE.Mesh | null {
    const rect = dom.getBoundingClientRect();
    mouseNDC.x = ((cx-rect.left)/rect.width)*2-1;
    mouseNDC.y = -((cy-rect.top)/rect.height)*2+1;
    raycaster.setFromCamera(mouseNDC, camera);
    const hits = raycaster.intersectObjects(raycastTargets);
    return hits.length ? hits[0].object as THREE.Mesh : null;
  }
  let downX = 0, downY = 0;
  const onPD = (e: PointerEvent) => { dragging=true; lastX=e.clientX; lastY=e.clientY; downX=e.clientX; downY=e.clientY; autoRotate=false; };
  const onPM = (e: PointerEvent) => {
    if (dragging) {
      const dx=e.clientX-lastX, dy=e.clientY-lastY;
      lastX=e.clientX; lastY=e.clientY;
      if (tooltipEl) tooltipEl.style.display='none';
      // 팬: 카메라의 right/up 벡터 방향으로 target 이동
      const camDir=new THREE.Vector3(target.x-camera.position.x,target.y-camera.position.y,target.z-camera.position.z).normalize();
      const right=new THREE.Vector3().crossVectors(camDir,new THREE.Vector3(0,1,0)).normalize();
      const up=new THREE.Vector3().crossVectors(right,camDir).normalize();
      const panScale=radius*0.0015;
      target.addScaledVector(right,-dx*panScale);
      target.addScaledVector(up,dy*panScale);
      updateCam();
      return;
    }
    const obj = pick(e.clientX, e.clientY);
    if (obj !== hovered) { setHi(hovered,false); hovered=obj; setHi(hovered,true); }
    if (tooltipEl) {
      if (obj) {
        tooltipEl.style.display='block';
        tooltipEl.style.left=e.clientX+'px'; tooltipEl.style.top=e.clientY+'px';
        const typeLabel = obj.userData.type==='daegu' ? '대구광역시' : (obj.userData.type==='si' ? '경북 · 시' : '경북 · 군');
        const w = weatherRef.current[obj.userData.name];
        let html = `<strong>${obj.userData.name}</strong><span class="tt-sub">${typeLabel}</span>`;
        if (w) html += `<span class="tt-weather">체감 ${w.feels}°C · 기온 ${w.temp??'-'}°C · 습도 ${w.hum??'-'}%${w.stage?'<br>'+w.stage:''}${w.time?' ('+w.time+' 기준)':''}</span>`;
        tooltipEl.innerHTML = html;
      } else tooltipEl.style.display='none';
    }
  };
  const onPL = () => { if (tooltipEl) tooltipEl.style.display='none'; };
  const onPU = (e: PointerEvent) => {
    dragging=false;
    if (Math.abs(e.clientX-downX) < 5 && Math.abs(e.clientY-downY) < 5) {
      const obj = pick(e.clientX, e.clientY);
      if (obj && onRegionClick) onRegionClick(obj.userData.name, weatherRef.current[obj.userData.name] ?? null);
    }
  };
  const onWh = (e: WheelEvent) => {
    e.preventDefault();
    const rect=dom.getBoundingClientRect();
    const ndcX=((e.clientX-rect.left)/rect.width)*2-1;
    const ndcY=-((e.clientY-rect.top)/rect.height)*2+1;
    const oldRadius=radius;
    radius=Math.max(opts.radius*0.35,Math.min(opts.radius*2.2,radius+e.deltaY*(opts.radius*0.0006)));
    const moved=oldRadius-radius; // 양수=확대(카메라 가까워짐)
    if (Math.abs(moved)>0.01) {
      // 커서가 가리키는 방향으로 target 보정 → 커서 위치 중심 확대/축소
      const camDir=new THREE.Vector3(target.x-camera.position.x,target.y-camera.position.y,target.z-camera.position.z).normalize();
      const right=new THREE.Vector3().crossVectors(camDir,new THREE.Vector3(0,1,0)).normalize();
      const up=new THREE.Vector3().crossVectors(right,camDir).normalize();
      const shift=moved*0.38;
      target.addScaledVector(right,ndcX*shift);
      target.addScaledVector(up,ndcY*shift);
    }
    updateCam();
  };
  const onRS = () => { camera.aspect=W()/H(); camera.updateProjectionMatrix(); renderer.setSize(W(),H()); };
  dom.addEventListener('pointerdown',onPD);
  window.addEventListener('pointermove',onPM as any);
  window.addEventListener('pointerup',onPU);
  dom.addEventListener('pointerleave',onPL);
  dom.addEventListener('wheel',onWh,{passive:false});
  window.addEventListener('resize',onRS);
  function tick() { if(opts.spin){ theta+=0.0016; updateCam(); } }
  function cleanup() {
    dom.removeEventListener('pointerdown',onPD);
    window.removeEventListener('pointermove',onPM as any);
    window.removeEventListener('pointerup',onPU);
    dom.removeEventListener('pointerleave',onPL);
    dom.removeEventListener('wheel',onWh);
    window.removeEventListener('resize',onRS);
    renderer.dispose();
    if (dom.parentElement) dom.parentElement.removeChild(dom);
  }
  return { scene, camera, renderer, tick, cleanup };
}

function DaeguGyeongbukHeatMap({ onDataParsed }: { onDataParsed?: (d: ParsedCSVData) => void }) {
  const [statusMsg, setStatusMsg] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [heatActive, setHeatActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{maxFeels:number;avgTemp:number;avgHum:number;maxLoc:string;count:number}|null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [selectedInfo, setSelectedInfo] = useState<{name:string; weather:RegionWeather|null}|null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const daeguRef = useRef<HTMLDivElement>(null);
  const gbRef = useRef<HTMLDivElement>(null);
  const ulleungRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<ThreePanel[]>([]);
  const rafRef = useRef<number>(0);
  const registryRef = useRef<Record<string, RegionEntry>>({});
  const weatherRef = useRef<Record<string, RegionWeather>>({});
  const mapDataRef = useRef<{ gb: MapRegion[]; daegu: MapRegion[]; ulleung: MapRegion[] } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const CSV_NAME_MAP: Record<string, string[]> = {
    '포항':['포항시'],'경주':['경주시'],'김천':['김천시'],'안동':['안동시'],'구미':['구미시'],
    '영주':['영주시'],'영천':['영천시'],'상주':['상주시'],'문경':['문경시'],'경산':['경산시'],
    '의성':['의성군'],'청송':['청송군'],'영양':['영양군'],'영덕':['영덕군'],'청도':['청도군'],
    '고령':['고령군'],'성주':['성주군'],'칠곡':['칠곡군'],'예천':['예천군'],'봉화':['봉화군'],
    '울진':['울진군'],'울릉':['울릉군'],'군위':['군위군'],
    '대구':['중구','동구','서구','남구','북구','수성구','달서구','달성군'],
  };

  useEffect(() => {
    Promise.all([
      fetch('/map-data-gb.json').then(r=>r.json()),
      fetch('/map-data-daegu.json').then(r=>r.json()),
      fetch('/map-data-ulleung.json').then(r=>r.json()),
    ]).then(([gb,daegu,ulleung]) => { mapDataRef.current={gb,daegu,ulleung}; setMapReady(true); });
  }, []);

  useEffect(() => {
    if (!mapReady || !daeguRef.current || !gbRef.current || !ulleungRef.current) return;
    cancelAnimationFrame(rafRef.current);
    panelsRef.current.forEach(p=>p.cleanup());
    panelsRef.current = [];
    registryRef.current = {};
    const {gb,daegu,ulleung} = mapDataRef.current!;
    const tt = tooltipRef.current;
    const handleClick = (name: string, weather: RegionWeather | null) => setSelectedInfo({name, weather});
    const p1 = initThreePanel(daeguRef.current, daegu, {height:22,bevel:1.8,radius:900,theta:Math.PI*0.25,phi:Math.PI*0.27,baseRadius:900,fogNear:1200,fogFar:3000,sun:[320,480,220],labels:true,fontSize:44,spin:false}, registryRef.current, tt, weatherRef, handleClick);
    const p2 = initThreePanel(gbRef.current, gb, {height:28,bevel:2.2,radius:1180,theta:Math.PI*0.25,phi:Math.PI*0.27,baseRadius:1200,fogNear:1500,fogFar:3800,sun:[420,620,280],labels:true,fontSize:46,spin:false}, registryRef.current, tt, weatherRef, handleClick);
    const p3 = initThreePanel(ulleungRef.current, ulleung, {height:14,bevel:0.8,radius:320,theta:Math.PI*0.25,phi:Math.PI*0.25,baseRadius:260,fogNear:280,fogFar:900,sun:[140,200,90],labels:true,fontSize:26,spin:false}, registryRef.current, tt, weatherRef, handleClick);
    panelsRef.current = [p1,p2,p3];
    function animate() { rafRef.current=requestAnimationFrame(animate); panelsRef.current.forEach(p=>{p.tick();p.renderer.render(p.scene,p.camera);}); }
    animate();
    // 이전 데이터 복원 — 서버(DB)에서 로드 (기기 간 공유)
    fetch('/api/heatwave-map/data', { credentials: 'include' })
      .then(r => r.json())
      .then(json => {
        if (json?.data?.weather && Object.keys(json.data.weather).length > 0) {
          weatherRef.current = json.data.weather;
          Object.entries(json.data.weather).forEach(([n, info]) => updateRegionVisual(n, info as RegionWeather));
          setHeatActive(true);
          if (json.data.stats) setStats(json.data.stats);
        }
      })
      .catch(() => {});
    return () => { cancelAnimationFrame(rafRef.current); panelsRef.current.forEach(p=>p.cleanup()); panelsRef.current=[]; };
  }, [mapReady]);

  function updateRegionVisual(name: string, info: RegionWeather) {
    const entry = registryRef.current[name];
    if (!entry) return;
    const col = new THREE.Color(heatColorHex(info.feels));
    entry.baseColor.copy(col);
    entry.topMat.color.copy(col);
    entry.sideMat.color.copy(col.clone().multiplyScalar(0.7));
    const scale = heatHeightScale(info.feels, entry.baseDepth);
    entry.meshes.forEach(m => { m.scale.y = scale; });
    if (entry.sprite) entry.sprite.position.y = entry.baseDepth * scale + 10;
  }

  function resetVisuals() {
    if (!mapDataRef.current) return;
    [...mapDataRef.current.daegu, ...mapDataRef.current.gb, ...mapDataRef.current.ulleung].forEach(region => {
      const entry = registryRef.current[region.name];
      if (!entry) return;
      const col = new THREE.Color(region.color);
      entry.baseColor.copy(col);
      entry.topMat.color.copy(col);
      entry.sideMat.color.copy(col.clone().multiplyScalar(0.72));
      entry.meshes.forEach(m => { m.scale.y = 1; });
      if (entry.sprite) entry.sprite.position.y = entry.baseDepth + 10;
    });
    weatherRef.current = {};
    setHeatActive(false); setStatusMsg(""); setStatusErr(false); setStats(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  function findKey(headers: string[], candidates: string[]): string | null {
    for (const c of candidates) { const hit = headers.find(h => h.includes(c)); if (hit) return hit; }
    return null;
  }

  function applyCSVRows(rows: Record<string,string>[]) {
    if (!rows.length) return { count: 0 };
    const headers = Object.keys(rows[0]);
    const kLoc = findKey(headers,['지역']); const kFeels = findKey(headers,['체감온도']);
    const kTemp = findKey(headers,['기온']); const kHum = findKey(headers,['습도']);
    const kStage = findKey(headers,['폭염단계']); const kTime = findKey(headers,['예보시간','관측시간','시간']);
    const kGroup = findKey(headers,['권역']);
    if (!kLoc || !kFeels) return { count: 0, error: '지역/체감온도 컬럼을 찾을 수 없어요' };
    const filtered = kGroup ? rows.filter(r=>(r[kGroup]||'').includes('대구')||(r[kGroup]||'').includes('경북')) : rows;
    const peak: Record<string, RegionWeather> = {};
    filtered.forEach(r => {
      const loc=r[kLoc], t=parseFloat(r[kFeels]);
      if (!loc||isNaN(t)) return;
      if (!peak[loc] || t > peak[loc].feels) {
        peak[loc]={feels:t,temp:kTemp?parseFloat(r[kTemp]):null,hum:kHum?parseFloat(r[kHum]):null,stage:kStage?r[kStage]:'',time:kTime?r[kTime]:''};
      }
    });
    let matched=0, maxLoc='', maxT=-999;
    Object.entries(peak).forEach(([loc,info]) => {
      const targets = CSV_NAME_MAP[loc]; if (!targets) return;
      if (info.feels>maxT) { maxT=info.feels; maxLoc=loc; }
      targets.forEach(name => { weatherRef.current[name]=info; updateRegionVisual(name,info); });
      matched++;
    });
    if (matched > 0 && onDataParsed) {
      const allWeathers = Object.values(peak);
      const temps = allWeathers.map(w=>w.temp).filter((v): v is number => v!==null);
      const hums = allWeathers.map(w=>w.hum).filter((v): v is number => v!==null);
      const stageCounts: Record<string,number> = {};
      allWeathers.forEach(w => { if(w.stage) stageCounts[w.stage]=(stageCounts[w.stage]??0)+1; });
      const dominantHeatLevel = Object.entries(stageCounts).sort((a,b)=>b[1]-a[1])[0]?.[0]??'';
      onDataParsed({
        date: Object.values(peak)[0]?.time ?? '',
        maxFeelsLike: maxT,
        avgTemp: temps.length ? temps.reduce((a,b)=>a+b,0)/temps.length : 0,
        avgHumidity: hums.length ? hums.reduce((a,b)=>a+b,0)/hums.length : 0,
        dominantHeatLevel,
      });
    }
    if (matched > 0) {
      const allWeathers2 = Object.values(peak);
      const temps2 = allWeathers2.map(w=>w.temp).filter((v): v is number => v!==null);
      const hums2 = allWeathers2.map(w=>w.hum).filter((v): v is number => v!==null);
      const statsData = {
        maxFeels: maxT,
        avgTemp: temps2.length ? Math.round((temps2.reduce((a,b)=>a+b,0)/temps2.length)*10)/10 : 0,
        avgHum: hums2.length ? Math.round(hums2.reduce((a,b)=>a+b,0)/hums2.length) : 0,
        maxLoc, count: matched,
      };
      setStats(statsData);
      fetch('/api/heatwave-map/data', { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ weather: weatherRef.current, stats: statsData }) }).catch(()=>{});
    }
    return { count: matched, maxLoc, maxT };
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setLoading(true);
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const buf = evt.target?.result as ArrayBuffer;
        let text = new TextDecoder('utf-8').decode(buf);
        if ((text.match(/\uFFFD/g)||[]).length > 3) text = new TextDecoder('euc-kr').decode(buf);
        const lines = text.split(/\r?\n/).filter(l=>l.trim());
        if (!lines.length) { setStatusErr(true); setStatusMsg('파일이 비어있어요'); setLoading(false); return; }
        const delim = lines[0].includes('\t') ? '\t' : ',';
        const headers = lines[0].split(delim).map(h=>h.trim());
        const rows: Record<string,string>[] = [];
        for (let i=1;i<lines.length;i++) {
          const cols=lines[i].split(delim); const obj: Record<string,string>={};
          headers.forEach((h,idx)=>{ obj[h]=(cols[idx]!==undefined?cols[idx]:'').trim(); });
          rows.push(obj);
        }
        const result = applyCSVRows(rows);
        if (!result.count) { setStatusErr(true); setStatusMsg((result as any).error||'반영할 대구·경북 지점을 찾지 못했어요'); }
        else { setStatusErr(false); setStatusMsg(`${result.count}개 지점 반영됨 · 최고 체감 ${result.maxT}°C (${result.maxLoc})`); setHeatActive(true); }
      } catch(err) { setStatusErr(true); setStatusMsg('파일을 읽는 중 오류가 발생했어요'); }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  function applyAutoWeatherData(regions: {name:string;feels:number;temp:number;hum:number;stage:string;time:string}[]) {
    weatherRef.current = {};
    regions.forEach(r => {
      const info: RegionWeather = { feels: r.feels, temp: r.temp, hum: r.hum, stage: r.stage, time: r.time };
      weatherRef.current[r.name] = info;
      updateRegionVisual(r.name, info);
    });
    const maxFeels = Math.max(...regions.map(r => r.feels));
    const maxLoc = regions.find(r => r.feels === maxFeels)?.name ?? '';
    const avgTemp = Math.round(regions.map(r => r.temp).reduce((a,b) => a+b, 0) / regions.length * 10) / 10;
    const avgHum = Math.round(regions.map(r => r.hum).reduce((a,b) => a+b, 0) / regions.length);
    const statsData = { maxFeels, avgTemp, avgHum, maxLoc, count: regions.length };
    setStats(statsData);
    setHeatActive(true);
    fetch('/api/heatwave-map/data', { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ weather: weatherRef.current, stats: statsData }) }).catch(()=>{});
    if (onDataParsed) {
      const stageCounts: Record<string,number> = {};
      regions.forEach(r => { if (r.stage) stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1; });
      const dominantHeatLevel = Object.entries(stageCounts).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '';
      onDataParsed({ date: regions[0]?.time ?? '', maxFeelsLike: maxFeels, avgTemp, avgHumidity: avgHum, dominantHeatLevel });
    }
  }

  async function handleAutoWeather() {
    setLoading(true);
    setStatusMsg('');
    try {
      const resp = await fetch('/api/weather/current-heat', { credentials: 'include' });
      const json = await resp.json();
      if (!json.ok) throw new Error(json.message);
      applyAutoWeatherData(json.data);
      setStatusErr(false);
      setStatusMsg(`실시간 ${json.data.length}개 지역 반영`);
    } catch (e: any) {
      setStatusErr(true);
      setStatusMsg(e.message || '기상 데이터 수신 실패');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded-xl bg-card shadow-sm overflow-hidden">
      {/* 툴팁 */}
      <div ref={tooltipRef} style={{position:'fixed',pointerEvents:'none',zIndex:9999,background:'rgba(18,22,30,0.96)',color:'#f0f3f7',padding:'8px 14px',borderRadius:8,fontSize:13,fontWeight:600,border:'1px solid rgba(255,255,255,0.12)',display:'none',transform:'translate(-50%,-130%)',boxShadow:'0 6px 18px rgba(0,0,0,0.4)',maxWidth:260,lineHeight:1.6}} />
      <style>{`.tt-sub{display:block;font-size:10px;font-weight:400;color:#9aa5b3;margin-top:1px}.tt-weather{display:block;font-size:11.5px;font-weight:600;color:#ffd9a0;margin-top:5px;line-height:1.55}`}</style>

      {/* ─ 헤더 ─ */}
      <div className="px-3 sm:px-4 py-2.5 flex items-center justify-between border-b bg-gradient-to-r from-orange-50/80 to-amber-50/60 dark:from-orange-950/20 dark:to-amber-950/10">
        <div className="flex items-center gap-2 min-w-0">
          <Thermometer className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="font-semibold text-xs sm:text-sm truncate">대구·경북 권역별 체감온도</span>
          {statusMsg && statusErr && <span className="text-xs text-red-500 hidden sm:inline">{statusMsg}</span>}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
          {heatActive && <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 px-2" onClick={resetVisuals}>초기화</Button>}
          <Button size="sm" variant="default" className="h-7 text-xs gap-1 px-2 sm:px-3 bg-sky-600 hover:bg-sky-700 text-white" onClick={handleAutoWeather} disabled={loading} data-testid="button-auto-weather">
            <RefreshCw className="w-3.5 h-3.5" /><span className="hidden sm:inline">실시간 날씨</span>
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2 sm:px-3" onClick={()=>fileRef.current?.click()} data-testid="button-upload-heatmap-csv">
            <FileDown className="w-3.5 h-3.5" /><span className="hidden sm:inline">CSV 업로드</span>
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* ─ 온도·습도 통계 바 (CSV 반영 후) ─ */}
      {stats && (
        <div className="px-3 sm:px-4 py-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-b" style={{background:'#0f141c'}}>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">최고체감</span>
            <span className="text-sm font-bold tabular-nums" style={{color: heatColorHex(stats.maxFeels)}}>{stats.maxFeels}°C</span>
            <span className="text-[10px] text-slate-500 hidden sm:inline">({stats.maxLoc})</span>
          </div>
          <div className="hidden sm:block h-3 w-px bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">평균기온</span>
            <span className="text-sm font-semibold tabular-nums text-amber-400">{stats.avgTemp}°C</span>
          </div>
          <div className="hidden sm:block h-3 w-px bg-slate-700" />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] text-slate-400">평균습도</span>
            <span className="text-sm font-semibold tabular-nums text-sky-400">{stats.avgHum}%</span>
          </div>
          <div className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-500">
            <div style={{width:80,height:6,borderRadius:3,background:'linear-gradient(to right,#3aa0a0,#f2d24b 42%,#f7b733 58%,#f2711c 74%,#e0392b 88%,#8b1e1e)'}} />
            <span className="hidden sm:inline">20→38+°C</span>
          </div>
        </div>
      )}

      {/* ─ 지도 패널 ─ */}
      <div className="p-2 sm:p-3 flex gap-2 sm:gap-3"
        style={{
          background:'#0a0d12',
          height: isMobile ? 'auto' : 580,
          flexDirection: isMobile ? 'column' : 'row',
        }}>

        {/* 대구 */}
        <div className="flex flex-col rounded-xl border border-[#232a35] overflow-hidden"
          style={{
            background:'#11151c',
            flex: isMobile ? 'none' : '0 0 38%',
            height: isMobile ? 260 : undefined,
            minWidth: 0,
          }}>
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#232a35] flex-shrink-0">
            <span className="text-xs font-semibold text-slate-300">대구광역시</span>
            <span className="text-[10px] text-slate-500">클릭하면 상세 보기</span>
          </div>
          <div style={{position:'relative', flex:1, minHeight:0}}>
            <div ref={daeguRef} style={{position:'absolute',inset:0}} />
            {/* 대구 선택 카드 */}
            {selectedInfo && ['중구','동구','서구','남구','북구','수성구','달서구','달성군'].includes(selectedInfo.name) && (
              <RegionInfoCard info={selectedInfo} onClose={()=>setSelectedInfo(null)} heatColorFn={heatColorHex} />
            )}
          </div>
        </div>

        {/* 경북 (울릉 인셋 포함) */}
        <div className="flex flex-col rounded-xl border border-[#232a35] overflow-hidden"
          style={{
            background:'#11151c',
            flex: isMobile ? 'none' : '1 1 0',
            height: isMobile ? 360 : undefined,
            minWidth: 0,
          }}>
          <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#232a35] flex-shrink-0">
            <span className="text-xs font-semibold text-slate-300">경상북도</span>
            <span className="text-[10px] text-slate-500">클릭하면 상세 보기</span>
          </div>
          <div style={{position:'relative', flex:1, minHeight:0, background:'#0d1117'}}>
            <div ref={gbRef} style={{position:'absolute',inset:0}} />
            {/* 울릉 인셋 */}
            <div style={{position:'absolute',bottom:8,right:8,zIndex:4,width: isMobile ? 130 : 190,height: isMobile ? 115 : 165,border:'2px dashed #3d4757',borderRadius:10,background:'#0d1117',overflow:'hidden'}}>
              <div style={{position:'absolute',top:-8,left:8,zIndex:2,background:'#11151c',padding:'0 5px',fontSize:8,letterSpacing:'1.5px',color:'#697384'}}>INSET</div>
              <span style={{position:'absolute',top:5,left:9,zIndex:2,fontSize:10.5,fontWeight:700,color:'#e8ecf1',textShadow:'0 1px 3px rgba(0,0,0,0.6)',pointerEvents:'none'}}>울릉군</span>
              <div ref={ulleungRef} style={{position:'absolute',inset:0}} />
            </div>
            {/* 경북 선택 카드 */}
            {selectedInfo && !['중구','동구','서구','남구','북구','수성구','달서구','달성군'].includes(selectedInfo.name) && (
              <RegionInfoCard info={selectedInfo} onClose={()=>setSelectedInfo(null)} heatColorFn={heatColorHex} />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}



export default function HeatWaveChecklist() {
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [csvForm, setCsvForm] = useState<FormData | null>(null);
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

  const handleCsvParsed = (d: ParsedCSVData) => {
    const hl = d.dominantHeatLevel;
    const heatAlertStatus =
      hl.includes("위험") || hl.includes("경고") ? "폭염경보" :
      hl.includes("주의") || hl.includes("관심") ? "폭염주의보" :
      "해당없음";
    const ml = d.maxFeelsLike;
    const now = new Date();
    setCsvForm({
      ...emptyForm(),
      checkDate: d.date || format(now, "yyyy-MM-dd"),
      checkTime: format(now, "HH:mm"),
      heatAlertStatus,
      currentTemperature: d.avgTemp ? d.avgTemp.toFixed(1) : "",
      currentHumidity: d.avgHumidity ? d.avgHumidity.toFixed(0) : "",
      currentFeelsLike: ml ? ml.toFixed(1) : "",
      maxFeelsLikeForecast: ml ? ml.toFixed(1) : "",
      checks31: ml >= 31 ? [true, true, true] : [false, false, false],
      checks33: ml >= 33 ? [true, true, true, true] : [false, false, false, false],
      checks35: ml >= 35 ? [true, true, true] : [false, false, false],
      stopTime35Start: "", stopTime35End: "",
      checks38: ml >= 38 ? [true] : [false],
      stopTime38Start: "", stopTime38End: "",
    });
    setShowForm(true);
    toast({ title: "CSV 데이터로 체크리스트가 자동완성되었습니다", description: `최고 체감온도 ${ml}°C · ${heatAlertStatus}` });
  };

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
          <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <Sun className="w-6 h-6 text-orange-500" />
            폭염 일일 체크리스트
          </h1>
          <p className="text-sm text-muted-foreground mt-1 hidden sm:block">폭염 단계별 조치사항을 일별로 기록·관리합니다</p>
        </div>
        <Button onClick={() => setShowForm(true)} data-testid="button-new-checklist">
          <Plus className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline"> 체크리스트 작성</span>
        </Button>
      </div>

      {/* 대구·경북 체감온도 지도 */}
      <DaeguGyeongbukHeatMap onDataParsed={handleCsvParsed} />

      {/* 목록 테이블 */}
      <div className="border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>작성일시</TableHead>
              <TableHead className="hidden sm:table-cell">대상지역</TableHead>
              <TableHead>폭염특보</TableHead>
              <TableHead className="text-center hidden sm:table-cell">기온 / 체감</TableHead>
              <TableHead className="text-center">조치 완료</TableHead>
              <TableHead className="hidden md:table-cell">작성자</TableHead>
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
                  <TableCell className="text-sm hidden sm:table-cell">{r.targetArea}</TableCell>
                  <TableCell>
                    <Badge variant={alertBadgeVariant(r.heatAlertStatus)} data-testid={`badge-alert-${r.id}`}>
                      {r.heatAlertStatus}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center text-sm hidden sm:table-cell">
                    {r.currentTemperature != null ? `${r.currentTemperature}°C` : "-"}
                    {r.currentFeelsLike != null && (
                      <span className="text-muted-foreground"> / {r.currentFeelsLike}°C</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className="font-medium">{totalChecks(r)}</span>
                    <span className="text-muted-foreground">/{totalPossible}</span>
                  </TableCell>
                  <TableCell className="text-sm hidden md:table-cell">{r.author ?? "-"}</TableCell>
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
                        className="h-7 w-7 text-orange-500 hover:text-orange-700"
                        onClick={() => setEditing(r)}
                        title="수정"
                        data-testid={`button-edit-${r.id}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
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
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setCsvForm(null); }}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-orange-500" />
              폭염 일일 체크리스트 작성
              {csvForm && <Badge variant="outline" className="text-xs text-green-600 border-green-400">CSV 자동완성</Badge>}
            </DialogTitle>
          </DialogHeader>
          <ChecklistForm
            key={csvForm ? "csv" : "empty"}
            initial={csvForm ?? emptyForm()}
            onSubmit={(data) => createMutation.mutate(formToPayload(data))}
            isPending={createMutation.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* 상세보기 다이얼로그 */}
      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sun className="w-5 h-5 text-orange-500" />
              폭염 일일 체크리스트 — {viewing?.checkDate} {viewing?.checkTime}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="space-y-4">
              <ChecklistForm initial={formFromRecord(viewing)} readOnly />
              <div className="flex flex-wrap gap-2 justify-end pt-2">
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
        <DialogContent className="w-[95vw] max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
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
          <DialogHeader className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 border-b sticky top-0 bg-background z-10">
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
                  <><Loader2 className="w-4 h-4 sm:mr-1 animate-spin" /><span className="hidden sm:inline">생성 중...</span></>
                ) : (
                  <><FileDown className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">PDF 다운로드</span></>
                )}
              </Button>
            </div>
          </DialogHeader>
          <div className="overflow-auto bg-gray-100 p-2 sm:p-6 flex justify-center">
            <div id="heatwave-pdf-capture" className="shadow-xl">
              {pdfViewing && <ChecklistPDFView record={pdfViewing} pdfRef={pdfRef} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
