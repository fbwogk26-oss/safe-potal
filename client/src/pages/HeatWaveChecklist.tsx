import { useState, useRef, useEffect, useCallback } from "react";
import * as THREE from "three";
import { MapRegion, PanelOpts, RegionEntry, ThreePanel, RegionWeather, RegionKey, REGION_TABS, heatColorHex, heatHeightScale, makeLabelSprite3D, initThreePanel, RegionInfoCard } from '@/lib/heatwave3d';
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
import { Plus, Trash2, Eye, Thermometer, Sun, Mail, Loader2, PenLine, RotateCcw, FileDown, FileText, Pencil, RefreshCw, X, Send } from "lucide-react";
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
  weatherSnapshot?: Record<string, any>;
  mapSnapshot?: string;
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
    weatherSnapshot: (r as any).weatherSnapshot ?? undefined,
    mapSnapshot: (r as any).mapSnapshot ?? undefined,
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
    weatherSnapshot: f.weatherSnapshot ?? null,
    mapSnapshot: f.mapSnapshot ?? null,
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
  const snap = (record as any).weatherSnapshot as Record<string, { feels: number; temp: number; hum: number; stage?: string; time?: string }> | undefined;
  const mapImg = (record as any).mapSnapshot as string | undefined;
  const hasPage2 = !!(snap || mapImg);
  const sorted = snap ? filterWeatherByTargetArea(snap, record.targetArea ?? '') : [];
  const regionLabel = REGION_CITIES_BY_TARGET[record.targetArea ?? ''] ? record.targetArea : '전체 권역';

  const pdfStyle: React.CSSProperties = {
    width: "794px", background: "white", padding: "40px",
    fontFamily: "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif",
    color: "#111", boxSizing: "border-box",
  };
  const alertColor = record.heatAlertStatus === "폭염경보" ? "#fee2e2" : record.heatAlertStatus === "폭염주의보" ? "#fef3c7" : "#f0fdf4";
  const alertTextColor = record.heatAlertStatus === "폭염경보" ? "#dc2626" : record.heatAlertStatus === "폭염주의보" ? "#d97706" : "#16a34a";

  return (
    <div ref={pdfRef}>
      {/* ── 1페이지: 체크리스트 + 서명 ── */}
      <div id="heatwave-pdf-page1" style={{ ...pdfStyle, minHeight: "1123px" }}>
        <div style={{ textAlign: "center", marginBottom: "24px", borderBottom: "2.5px solid #1d4ed8", paddingBottom: "16px" }}>
          <div style={{ fontSize: "10px", color: "#555", letterSpacing: "2px", marginBottom: "4px" }}>산업안전보건법 시행규칙 별지 제95호 서식</div>
          <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: 0 }}>폭염 일일 체크리스트</h1>
          <div style={{ fontSize: "11px", color: "#555", marginTop: "4px" }}>Heat Wave Daily Safety Checklist</div>
        </div>
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
        <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "6px", padding: "12px 16px", marginBottom: "16px" }}>
          <div style={{ fontWeight: "bold", fontSize: "12px", color: "#1d4ed8", marginBottom: "8px" }}>▶ 현재 기상 정보</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "8px" }}>
            {([
              ["현재 기온", record.currentTemperature != null ? `${record.currentTemperature}°C` : "-"],
              ["현재 습도", record.currentHumidity != null ? `${record.currentHumidity}%` : "-"],
              ["현재 체감온도", record.currentFeelsLike != null ? `${record.currentFeelsLike}°C` : "-"],
              ["최고 체감온도 예보", record.maxFeelsLikeForecast != null ? `${record.maxFeelsLikeForecast}°C` : "-"],
            ] as [string, string][]).map(([label, value]) => (
              <div key={label} style={{ textAlign: "center" }}>
                <div style={{ fontSize: "10px", color: "#555", marginBottom: "2px" }}>{label}</div>
                <div style={{ fontSize: "16px", fontWeight: "bold", color: "#1d4ed8" }}>{value}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontWeight: "bold", fontSize: "13px", marginBottom: "10px", borderLeft: "4px solid #1d4ed8", paddingLeft: "8px" }}>단계별 조치사항 체크리스트</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
          {([
            { title: "폭염 관심", temp: "31°C 이상", color: "#fef9c3", border: "#fde68a", checks: checks31, items: CHECKS_31, stop35: false, stop38: false },
            { title: "폭염 주의", temp: "33°C 이상", color: "#ffedd5", border: "#fed7aa", checks: checks33, items: CHECKS_33, stop35: false, stop38: false },
            { title: "폭염 경고", temp: "35°C 이상", color: "#fee2e2", border: "#fca5a5", checks: checks35, items: CHECKS_35, stop35: true, stop38: false },
            { title: "폭염 위험", temp: "38°C 이상", color: "#fecaca", border: "#f87171", checks: checks38, items: CHECKS_38, stop35: false, stop38: true },
          ] as Array<{ title: string; temp: string; color: string; border: string; checks: boolean[]; items: string[]; stop35: boolean; stop38: boolean }>).map(({ title, temp, color, border, checks, items, stop35, stop38 }) => (
            <div key={title} style={{ border: `1px solid ${border}`, borderRadius: "6px", overflow: "hidden" }}>
              <div style={{ background: color, padding: "5px 10px", fontWeight: "bold", fontSize: "12px", marginBottom: "6px", borderRadius: "4px 4px 0 0" }}>
                {title} <span style={{ fontWeight: "normal", fontSize: "11px" }}>({temp})</span>
              </div>
              <div style={{ padding: "8px 12px" }}>
                {items.map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "6px", marginBottom: "4px" }}>
                    <span style={{ width: "16px", height: "16px", border: "1.5px solid #555", borderRadius: "3px", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: "1px", background: (checks[i] ?? false) ? "#1d4ed8" : "white" }}>
                      {(checks[i] ?? false) && <span style={{ color: "white", fontSize: "11px", fontWeight: "bold" }}>✓</span>}
                    </span>
                    <span style={{ fontSize: "12px", lineHeight: "1.4" }}>{item}</span>
                  </div>
                ))}
                {stop35 && (record.stopTime35Start || record.stopTime35End) && (
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>작업중지 시간: {record.stopTime35Start ?? ""} ~ {record.stopTime35End ?? ""}</div>
                )}
                {stop38 && (record.stopTime38Start || record.stopTime38End) && (
                  <div style={{ fontSize: "11px", color: "#666", marginTop: "4px" }}>작업중지 시간: {record.stopTime38Start ?? ""} ~ {record.stopTime38End ?? ""}</div>
                )}
              </div>
            </div>
          ))}
        </div>
        <div style={{ border: "1.5px solid #ddd", borderRadius: "6px", overflow: "hidden" }}>
          <div style={{ background: "#f8fafc", padding: "6px 14px", fontWeight: "bold", fontSize: "12px", borderBottom: "1px solid #ddd" }}>서명</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
            <div style={{ padding: "12px 16px", borderRight: "1px solid #ddd" }}>
              <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>작성자</div>
              <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "8px" }}>{record.author ?? ""}</div>
              {record.authorSignature
                ? <img src={record.authorSignature} alt="작성자 서명" style={{ height: "60px", objectFit: "contain" }} />
                : <div style={{ height: "60px", border: "1px dashed #ccc", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#aaa" }}>서명 없음</div>}
            </div>
            <div style={{ padding: "12px 16px" }}>
              <div style={{ fontSize: "11px", color: "#555", marginBottom: "6px" }}>안전보건관리책임자</div>
              <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "8px" }}>{record.safetyManager ?? ""}</div>
              {record.safetyManagerSignature
                ? <img src={record.safetyManagerSignature} alt="안전보건관리책임자 서명" style={{ height: "60px", objectFit: "contain" }} />
                : <div style={{ height: "60px", border: "1px dashed #ccc", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "11px", color: "#aaa" }}>서명 없음</div>}
            </div>
          </div>
        </div>
      </div>

      {/* ── 2페이지: 체감온도 현황 ── */}
      {hasPage2 && (
        <div id="heatwave-pdf-page2" style={{ ...pdfStyle }}>
          <div style={{ textAlign: "center", marginBottom: "20px", borderBottom: "2.5px solid #f97316", paddingBottom: "14px" }}>
            <h2 style={{ fontSize: "18px", fontWeight: "bold", margin: 0, color: "#ea580c" }}>{regionLabel} 체감온도 현황</h2>
            <div style={{ fontSize: "10px", color: "#888", marginTop: "4px" }}>실시간 날씨 기준 · {sorted.length}개 지역</div>
          </div>
          {mapImg && (
            <div style={{ textAlign: "center", marginBottom: "20px" }}>
              <img src={mapImg} alt="폭염 지도" style={{ maxWidth: "100%", height: "280px", objectFit: "contain", borderRadius: "8px", border: "1px solid #fed7aa" }} />
            </div>
          )}
          {sorted.length > 0 && (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "11px" }}>
              <thead>
                <tr style={{ background: "#fff7ed" }}>
                  <th style={{ border: "1px solid #fde68a", padding: "5px 8px", textAlign: "center" }}>순위</th>
                  <th style={{ border: "1px solid #fde68a", padding: "5px 8px", textAlign: "left" }}>지역</th>
                  <th style={{ border: "1px solid #fde68a", padding: "5px 8px", textAlign: "center" }}>체감온도</th>
                  <th style={{ border: "1px solid #fde68a", padding: "5px 8px", textAlign: "center" }}>기온</th>
                  <th style={{ border: "1px solid #fde68a", padding: "5px 8px", textAlign: "center" }}>습도</th>
                  <th style={{ border: "1px solid #fde68a", padding: "5px 8px", textAlign: "center" }}>단계</th>
                  <th style={{ border: "1px solid #fde68a", padding: "5px 8px", textAlign: "center" }}>기준시각</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(([name, w], i) => {
                  const bg = w.feels >= 38 ? "#fecaca" : w.feels >= 35 ? "#fed7aa" : w.feels >= 33 ? "#fef9c3" : w.feels >= 31 ? "#dcfce7" : "#fff";
                  return (
                    <tr key={name} style={{ background: bg }}>
                      <td style={{ border: "1px solid #e5e7eb", padding: "4px 8px", textAlign: "center", fontWeight: i < 3 ? "bold" : "normal" }}>{i + 1}</td>
                      <td style={{ border: "1px solid #e5e7eb", padding: "4px 8px", fontWeight: "bold" }}>{name}</td>
                      <td style={{ border: "1px solid #e5e7eb", padding: "4px 8px", textAlign: "center", fontWeight: "bold", color: w.feels >= 35 ? "#dc2626" : w.feels >= 33 ? "#d97706" : "#111" }}>{w.feels}°C</td>
                      <td style={{ border: "1px solid #e5e7eb", padding: "4px 8px", textAlign: "center" }}>{w.temp != null ? `${w.temp}°C` : "-"}</td>
                      <td style={{ border: "1px solid #e5e7eb", padding: "4px 8px", textAlign: "center" }}>{w.hum != null ? `${w.hum}%` : "-"}</td>
                      <td style={{ border: "1px solid #e5e7eb", padding: "4px 8px", textAlign: "center" }}>{w.stage ?? "-"}</td>
                      <td style={{ border: "1px solid #e5e7eb", padding: "4px 8px", textAlign: "center" }}>{w.time ?? "-"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
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
  const set = (k: keyof FormData, v: any) => setForm((f) => ({ ...f, [k]: v }));

  const setCheck = (field: "checks31" | "checks33" | "checks35" | "checks38", idx: number, val: boolean) => {
    setForm((f) => {
      const arr = [...(f[field] as boolean[])];
      arr[idx] = val;
      return { ...f, [field]: arr };
    });
  };

  return (
    <div className="space-y-4">
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

// ─── 권역별 도시 목록 (날씨 데이터 필터링용) ──────────────────
const REGION_CITIES_BY_TARGET: Record<string, string[]> = {
  '대구 / 경북': ['대구','군위','포항','경주','김천','안동','구미','영주','영천','상주','문경','경산','의성','청송','영양','영덕','청도','고령','성주','칠곡','예천','봉화','울진','울릉'],
  '충청권': ['대전','세종','청주','충주','제천','보은','옥천','영동','증평','진천','괴산','음성','단양','천안','공주','보령','아산','서산','논산','계룡','당진','금산','부여','서천','청양','홍성','예산','태안'],
  '호남권': ['광주','전주','군산','익산','정읍','남원','김제','완주','진안','무주','장수','임실','순창','고창','부안','목포','여수','순천','나주','광양','담양','곡성','구례','고흥','보성','화순','장흥','강진','해남','영암','무안','함평','영광','장성','완도','진도','신안','제주시','서귀포'],
  '부산 / 울산 / 경남': ['부산','울산','창원','마산','진해','진주','통영','사천','김해','밀양','거제','양산','의령','함안','창녕','고성','남해','하동','산청','함양','거창','합천'],
};

function filterWeatherByTargetArea(
  snap: Record<string, { feels: number; temp: number; hum: number; stage?: string; time?: string }>,
  targetArea: string
): [string, { feels: number; temp: number; hum: number; stage?: string; time?: string }][] {
  const cities = REGION_CITIES_BY_TARGET[targetArea];
  const entries = Object.entries(snap).sort((a, b) => b[1].feels - a[1].feels);
  if (!cities) return entries; // 전체 표시 (targetArea 불일치)
  const filtered = entries.filter(([name]) => cities.includes(name));
  return filtered.length > 0 ? filtered : entries; // 필터 결과 없으면 전체 표시
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
  selectedRegion?: 'all' | 'daegubuk' | 'chungcheong' | 'honam' | 'buulgyeong';
  weatherSnapshot?: Record<string, any>;
  mapSnapshot?: string;
};






function DaeguGyeongbukHeatMap({ onDataParsed, checklistTriggerRef, onPreviewEmail, onSaveMap, mapSaving, previewLoading, mapCaptureRef, warnings }: {
  onDataParsed?: (d: ParsedCSVData) => void;
  checklistTriggerRef?: React.MutableRefObject<(() => void) | null>;
  onPreviewEmail?: () => void;
  onSaveMap?: () => void;
  mapSaving?: boolean;
  previewLoading?: boolean;
  mapCaptureRef?: React.MutableRefObject<(() => string | null) | null>;
  warnings?: { type: string; regions: string }[];
}) {
  const [selectedRegion, setSelectedRegion] = useState<RegionKey>('daegubuk');
  const [warningOpen, setWarningOpen] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  const [statusErr, setStatusErr] = useState(false);
  const [heatActive, setHeatActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [stats, setStats] = useState<{maxFeels:number;avgTemp:number;avgHum:number;maxLoc:string;count:number}|null>(null);
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 640);
  const [selectedInfo, setSelectedInfo] = useState<{name:string; weather:RegionWeather|null}|null>(null);
  const [showDataTable, setShowDataTable] = useState(false);
  const [weatherData, setWeatherData] = useState<Record<string, RegionWeather>>({});
  const [autoUpdatedAt, setAutoUpdatedAt] = useState<string | null>(null);
  const [autoSource, setAutoSource] = useState<string>('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const allRef = useRef<HTMLDivElement>(null);
  const ulleungAllRef = useRef<HTMLDivElement>(null);
  const jejuAllRef = useRef<HTMLDivElement>(null);
  const daegubukRef = useRef<HTMLDivElement>(null);
  const ulleungRef = useRef<HTMLDivElement>(null);
  const chungcheongRef = useRef<HTMLDivElement>(null);
  const honamRef = useRef<HTMLDivElement>(null);
  const jejuRef = useRef<HTMLDivElement>(null);
  const buulgyeongRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<ThreePanel[]>([]);
  const rafRef = useRef<number>(0);
  const registryRef = useRef<Record<string, RegionEntry>>({});
  const weatherRef = useRef<Record<string, RegionWeather>>({});
  const mapDataRef = useRef<{
    all: MapRegion[]; daegubuk: MapRegion[]; ulleung: MapRegion[];
    chungcheong: MapRegion[]; honam: MapRegion[]; jeju: MapRegion[]; buulgyeong: MapRegion[];
  } | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const CSV_NAME_MAP: Record<string, string[]> = {
    // 대구경북
    '대구':['대구'],
    '군위':['군위'],
    '포항':['포항'],'경주':['경주'],'김천':['김천'],'안동':['안동'],'구미':['구미'],
    '영주':['영주'],'영천':['영천'],'상주':['상주'],'문경':['문경'],'경산':['경산'],
    '의성':['의성'],'청송':['청송'],'영양':['영양'],'영덕':['영덕'],'청도':['청도'],
    '고령':['고령'],'성주':['성주'],'칠곡':['칠곡'],'예천':['예천'],'봉화':['봉화'],
    '울진':['울진'],'울릉':['울릉'],
    // 충청권
    '대전':['대전'],'세종':['세종'],
    '청주':['청주'],'충주':['충주'],'제천':['제천'],
    '보은':['보은'],'옥천':['옥천'],'영동':['영동'],'증평':['증평'],
    '진천':['진천'],'괴산':['괴산'],'음성':['음성'],'단양':['단양'],
    '천안':['천안'],'공주':['공주'],'보령':['보령'],'아산':['아산'],
    '서산':['서산'],'논산':['논산'],'계룡':['계룡'],'당진':['당진'],
    '금산':['금산'],'부여':['부여'],'서천':['서천'],'청양':['청양'],
    '홍성':['홍성'],'예산':['예산'],'태안':['태안'],
    // 호남권
    '광주':['광주'],
    '전주':['전주'],'군산':['군산'],'익산':['익산'],'정읍':['정읍'],
    '남원':['남원'],'김제':['김제'],
    '완주':['완주'],'진안':['진안'],'무주':['무주'],'장수':['장수'],
    '임실':['임실'],'순창':['순창'],'고창':['고창'],'부안':['부안'],
    '목포':['목포'],'여수':['여수'],'순천':['순천'],'나주':['나주'],'광양':['광양'],
    '담양':['담양'],'곡성':['곡성'],'구례':['구례'],'고흥':['고흥'],
    '보성':['보성'],'화순':['화순'],'장흥':['장흥'],'강진':['강진'],
    '해남':['해남'],'영암':['영암'],'무안':['무안'],'함평':['함평'],
    '영광':['영광'],'장성':['장성'],'완도':['완도'],'진도':['진도'],'신안':['신안'],
    '제주시':['제주시'],'서귀포':['서귀포'],
    // 부산권
    '부산':['부산'],'울산':['울산'],
    '창원':['창원'],
    '마산':['마산'],   // 구 마산시 → 창원시 통합, 지도에 별도 폴리곤
    '진해':['진해'],   // 구 진해시 → 창원시 통합, 지도에 별도 폴리곤
    '진주':['진주'],'통영':['통영'],'사천':['사천'],'김해':['김해'],
    '밀양':['밀양'],'거제':['거제'],'양산':['양산'],
    '의령':['의령'],'함안':['함안'],'창녕':['창녕'],
    '고성':['고성'],'남해':['남해'],'하동':['하동'],
    '산청':['산청'],'함양':['함양'],'거창':['거창'],'합천':['합천'],
  };

  useEffect(() => {
    Promise.all([
      fetch('/map-data-all.json').then(r=>r.json()),
      fetch('/map-data-daegubuk.json').then(r=>r.json()),
      fetch('/map-data-ulleung.json').then(r=>r.json()),
      fetch('/map-data-chungcheong.json').then(r=>r.json()),
      fetch('/map-data-honam.json').then(r=>r.json()),
      fetch('/map-data-jeju.json').then(r=>r.json()),
      fetch('/map-data-buulgyeong.json').then(r=>r.json()),
    ]).then(([all,daegubuk,ulleung,chungcheong,honam,jeju,buulgyeong]) => {
      mapDataRef.current={all,daegubuk,ulleung,chungcheong,honam,jeju,buulgyeong};
      setMapReady(true);
    });
  }, []);

  useEffect(() => {
    if (!mapReady) return;
    cancelAnimationFrame(rafRef.current);
    panelsRef.current.forEach(p=>p.cleanup());
    panelsRef.current = [];
    registryRef.current = {};

    let destroyed = false;
    let initRafId: number;

    // rAF으로 1프레임 지연 — 브라우저 레이아웃 완료 후 Three.js가 컨테이너 크기를 올바르게 읽도록
    initRafId = requestAnimationFrame(() => {
      if (destroyed) return;
      const d = mapDataRef.current!;
      const tt = tooltipRef.current;
      const handleClick = (name: string, weather: RegionWeather | null) => setSelectedInfo({name, weather});

      let newPanels: ThreePanel[] = [];

      if (selectedRegion === 'all') {
        if (!allRef.current || !ulleungAllRef.current || !jejuAllRef.current) return;
        newPanels = [
          initThreePanel(allRef.current, d.all.filter((r: MapRegion) => r.name !== '제주시' && r.name !== '서귀포'), {height:18,bevel:1.4,radius:2200,theta:0,phi:Math.PI*0.27,baseRadius:2200,fogNear:2400,fogFar:6000,sun:[800,1200,550],labels:true,fontSize:38,spin:false,lockView:true}, registryRef.current, tt, weatherRef, handleClick),
          initThreePanel(ulleungAllRef.current,d.ulleung,{height:14,bevel:0.8,radius:320, theta:0,phi:Math.PI*0.25,baseRadius:260, fogNear:280, fogFar:900, sun:[140,200,90], labels:true,fontSize:42,spin:false}, registryRef.current, tt, weatherRef, handleClick),
          initThreePanel(jejuAllRef.current,   d.jeju,   {height:18,bevel:1.2,radius:400, theta:0,phi:Math.PI*0.25,baseRadius:380, fogNear:400, fogFar:1200,sun:[160,240,100],labels:true,fontSize:38,spin:false}, registryRef.current, tt, weatherRef, handleClick),
        ];
      } else if (selectedRegion === 'daegubuk') {
        if (!daegubukRef.current || !ulleungRef.current) return;
        newPanels = [
          initThreePanel(daegubukRef.current, d.daegubuk, {height:26,bevel:2.0,radius:1700,theta:0,phi:Math.PI*0.27,baseRadius:1700,fogNear:1900,fogFar:5000,sun:[600,900,400],labels:true,fontSize:48,spin:false,lockView:true,ty:-70,tz:60}, registryRef.current, tt, weatherRef, handleClick),
          initThreePanel(ulleungRef.current,  d.ulleung,  {height:14,bevel:0.8,radius:320, theta:0,phi:Math.PI*0.25,baseRadius:260, fogNear:280, fogFar:900, sun:[140,200,90], labels:true,fontSize:32,spin:false,lockView:true}, registryRef.current, tt, weatherRef, handleClick),
        ];
      } else if (selectedRegion === 'chungcheong') {
        if (!chungcheongRef.current) return;
        newPanels = [
          initThreePanel(chungcheongRef.current, d.chungcheong, {height:24,bevel:2.0,radius:1200,theta:0,phi:Math.PI*0.24,baseRadius:1300,fogNear:1400,fogFar:3800,sun:[420,630,280],labels:true,fontSize:46,spin:false,lockView:true}, registryRef.current, tt, weatherRef, handleClick),
        ];
      } else if (selectedRegion === 'honam') {
        if (!honamRef.current || !jejuRef.current) return;
        newPanels = [
          initThreePanel(honamRef.current, d.honam, {height:24,bevel:2.0,radius:1200,theta:0,phi:Math.PI*0.27,baseRadius:1300,fogNear:1400,fogFar:3800,sun:[420,630,280],labels:true,fontSize:46,spin:false,lockView:true}, registryRef.current, tt, weatherRef, handleClick),
          initThreePanel(jejuRef.current,  d.jeju,  {height:18,bevel:1.2,radius:400, theta:0,phi:Math.PI*0.25,baseRadius:380, fogNear:400, fogFar:1200,sun:[160,240,100],labels:true,fontSize:36,spin:false,lockView:true}, registryRef.current, tt, weatherRef, handleClick),
        ];
      } else if (selectedRegion === 'buulgyeong') {
        if (!buulgyeongRef.current) return;
        newPanels = [
          initThreePanel(buulgyeongRef.current, d.buulgyeong, {height:22,bevel:1.8,radius:1200,theta:0,phi:Math.PI*0.27,baseRadius:1300,fogNear:1400,fogFar:3800,sun:[420,630,280],labels:true,fontSize:44,spin:false,lockView:true}, registryRef.current, tt, weatherRef, handleClick),
        ];
      }

      if (destroyed) return;
      panelsRef.current = newPanels;
      function animate() { rafRef.current=requestAnimationFrame(animate); panelsRef.current.forEach(p=>{p.tick();p.renderer.render(p.scene,p.camera);}); }
      animate();

      // 로컬 weatherRef 즉시 적용 — 탭 전환 시 깜빡임 없이 기존 색상 복원
      if (Object.keys(weatherRef.current).length > 0) {
        Object.entries(weatherRef.current).forEach(([n, info]) => updateRegionVisual(n, info as RegionWeather));
      }

      // 이전 데이터 복원 — 서버(DB)에서 로드 (최초 페이지 로드 시에만 weatherRef 덮어씀)
      fetch('/api/heatwave-map/data', { credentials: 'include' })
        .then(r => r.json())
        .then(json => {
          if (destroyed) return;
          if (json?.data?.weather && Object.keys(json.data.weather).length > 0) {
            if (Object.keys(weatherRef.current).length === 0) {
              weatherRef.current = json.data.weather;
              Object.entries(json.data.weather).forEach(([n, info]) => updateRegionVisual(n, info as RegionWeather));
            }
            const regionEntries = Object.entries(json.data.weather).filter(([n]) => !!registryRef.current[n]);
            if (regionEntries.length > 0) {
              setHeatActive(true);
              setWeatherData({...json.data.weather});
              if (json.data.stats) setStats(json.data.stats);
              if (json.data.autoUpdatedAt) setAutoUpdatedAt(json.data.autoUpdatedAt);
              if (json.data.source) setAutoSource(json.data.source);
            }
          }
        })
        .catch(() => {});
    });

    return () => {
      destroyed = true;
      cancelAnimationFrame(initRafId);
      cancelAnimationFrame(rafRef.current);
      panelsRef.current.forEach(p=>p.cleanup());
      panelsRef.current = [];
    };
  }, [mapReady, selectedRegion]);

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
    const d = mapDataRef.current;
    const allRegions = [...d.all, ...d.daegubuk, ...d.ulleung, ...d.chungcheong, ...d.honam, ...d.jeju, ...d.buulgyeong];
    allRegions.forEach(region => {
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
    setWeatherData({}); setShowDataTable(false);
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
    const kRainType = findKey(headers,['강수형태']); const kRain = findKey(headers,['강수량']);
    const kWind = findKey(headers,['풍속']); const kWindLevel = findKey(headers,['풍속단계']);
    if (!kLoc || !kFeels) return { count: 0, error: '지역/체감온도 컬럼을 찾을 수 없어요' };
    const filtered = rows;
    const peak: Record<string, RegionWeather> = {};
    filtered.forEach(r => {
      const loc=r[kLoc], t=parseFloat(r[kFeels]);
      if (!loc||isNaN(t)) return;
      if (!peak[loc] || t > peak[loc].feels) {
        const wRaw = kWind ? parseFloat(r[kWind]) : NaN;
        peak[loc]={feels:t,temp:kTemp?parseFloat(r[kTemp]):null,hum:kHum?parseFloat(r[kHum]):null,stage:kStage?r[kStage]:'',time:kTime?r[kTime]:'',rainType:kRainType?r[kRainType]:'없음',rain:kRain?r[kRain]:'강수없음',wind:!isNaN(wRaw)?wRaw:null,windLevel:kWindLevel?r[kWindLevel]:'정상'};
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
        selectedRegion,
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
      setWeatherData({...weatherRef.current});
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
        if (!result.count) { setStatusErr(true); setStatusMsg((result as any).error||'반영할 지점을 찾지 못했어요. 권역별 체감온도 CSV 파일인지 확인해 주세요.'); }
        else { setStatusErr(false); setStatusMsg(`${result.count}개 지점 반영됨 · 최고 체감 ${result.maxT}°C (${result.maxLoc})`); setHeatActive(true); }
      } catch(err) { setStatusErr(true); setStatusMsg('파일을 읽는 중 오류가 발생했어요'); }
      setLoading(false);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  function applyAutoWeatherData(regions: {name:string;feels:number;temp:number;hum:number;stage:string;time:string;rainType?:string;rain?:string;wind?:number|null;windLevel?:string}[]) {
    weatherRef.current = {};
    regions.forEach(r => {
      const info: RegionWeather = { feels: r.feels, temp: r.temp, hum: r.hum, stage: r.stage, time: r.time, rainType: r.rainType, rain: r.rain, wind: r.wind, windLevel: r.windLevel };
      weatherRef.current[r.name] = info;
      updateRegionVisual(r.name, info);
    });
    // 창원 데이터를 마산·진해에도 적용 (기상청 API는 창원 단일 좌표만 제공)
    if (weatherRef.current['창원']) {
      const wonData = weatherRef.current['창원'];
      ['마산', '진해'].forEach(alias => {
        if (!weatherRef.current[alias]) {
          weatherRef.current[alias] = wonData;
          updateRegionVisual(alias, wonData);
        }
      });
    }
    const maxFeels = Math.max(...regions.map(r => r.feels));
    const maxLoc = regions.find(r => r.feels === maxFeels)?.name ?? '';
    const avgTemp = Math.round(regions.map(r => r.temp).reduce((a,b) => a+b, 0) / regions.length * 10) / 10;
    const avgHum = Math.round(regions.map(r => r.hum).reduce((a,b) => a+b, 0) / regions.length);
    const statsData = { maxFeels, avgTemp, avgHum, maxLoc, count: regions.length };
    setStats(statsData);
    setHeatActive(true);
    setWeatherData({...weatherRef.current});
    const nowIso = new Date().toISOString();
    setAutoUpdatedAt(nowIso);
    setAutoSource('기상청 단기예보 (수동)');
    fetch('/api/heatwave-map/data', { method:'PUT', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ weather: weatherRef.current, stats: statsData, autoUpdatedAt: nowIso, source: '기상청 단기예보 (수동)' }) }).catch(()=>{});
    if (onDataParsed) {
      const stageCounts: Record<string,number> = {};
      regions.forEach(r => { if (r.stage) stageCounts[r.stage] = (stageCounts[r.stage] ?? 0) + 1; });
      const dominantHeatLevel = Object.entries(stageCounts).sort((a,b) => b[1]-a[1])[0]?.[0] ?? '';
      onDataParsed({ date: regions[0]?.time ?? '', maxFeelsLike: maxFeels, avgTemp, avgHumidity: avgHum, dominantHeatLevel, selectedRegion, weatherSnapshot: { ...weatherRef.current } });
    }
  }

  // 현재 선택 권역의 날씨 데이터로 체크리스트 작성 요청
  function handleWriteChecklistNow() {
    if (!onDataParsed) return;
    const wr = weatherRef.current;
    if (!wr || Object.keys(wr).length === 0) {
      setStatusErr(true);
      setStatusMsg('날씨 데이터가 없습니다. 실시간 날씨 조회 또는 CSV 업로드 먼저 해주세요.');
      return;
    }
    // 현재 권역에 해당하는 도시 목록
    const md = mapDataRef.current;
    let cityNames: string[] = [];
    if (selectedRegion === 'all') {
      cityNames = Object.keys(wr);
    } else if (selectedRegion === 'daegubuk' && md) {
      cityNames = [...md.daegubuk, ...md.ulleung].map(r => r.name);
    } else if (selectedRegion === 'chungcheong' && md) {
      cityNames = md.chungcheong.map(r => r.name);
    } else if (selectedRegion === 'honam' && md) {
      cityNames = [...md.honam, ...md.jeju].map(r => r.name);
    } else if (selectedRegion === 'buulgyeong' && md) {
      cityNames = md.buulgyeong.map(r => r.name);
    }
    // 해당 권역 도시의 날씨만 필터링 (없으면 전체 사용)
    const entries = cityNames.length > 0
      ? cityNames.map(n => wr[n]).filter(Boolean)
      : Object.values(wr);
    if (entries.length === 0) {
      setStatusErr(true);
      setStatusMsg('해당 권역의 날씨 데이터가 없습니다.');
      return;
    }
    const maxFeelsLike = Math.max(...entries.map(w => w.feels));
    const temps = entries.map(w => w.temp).filter((v): v is number => v != null);
    const hums  = entries.map(w => w.hum).filter((v): v is number => v != null);
    const avgTemp = temps.length ? Math.round(temps.reduce((a,b)=>a+b,0)/temps.length*10)/10 : 0;
    const avgHumidity = hums.length ? Math.round(hums.reduce((a,b)=>a+b,0)/hums.length) : 0;
    const stageCounts: Record<string,number> = {};
    entries.forEach(w => { if (w.stage) stageCounts[w.stage] = (stageCounts[w.stage]??0)+1; });
    const dominantHeatLevel = Object.entries(stageCounts).sort((a,b)=>b[1]-a[1])[0]?.[0] ?? '';
    onDataParsed({ date: entries[0]?.time ?? '', maxFeelsLike, avgTemp, avgHumidity, dominantHeatLevel, selectedRegion, weatherSnapshot: { ...wr } });
  }

  // 외부에서 현재 권역 체크리스트 작성 함수를 호출할 수 있도록 ref 업데이트
  useEffect(() => {
    if (checklistTriggerRef) {
      checklistTriggerRef.current = handleWriteChecklistNow;
    }
    if (mapCaptureRef) {
      mapCaptureRef.current = () => {
        try {
          const canvas = panelsRef.current[0]?.renderer?.domElement;
          if (!canvas) return null;
          // 렌더 한 프레임 후 즉시 캡처
          panelsRef.current.forEach(p => p.renderer.render(p.scene, p.camera));
          return canvas.toDataURL('image/jpeg', 0.85);
        } catch { return null; }
      };
    }
  });

  async function handleSendDailyEmail() {
    if (!weatherRef.current || Object.keys(weatherRef.current).length === 0) {
      setStatusErr(true);
      setStatusMsg('지도에 날씨 데이터가 없어요. 실시간 날씨 또는 CSV 업로드 후 발송해 주세요.');
      return;
    }
    setEmailSending(true);
    try {
      const resp = await fetch('/api/heatwave-daily-email/send-now', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather: weatherRef.current }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.message || '발송 실패');
      setStatusErr(false);
      setStatusMsg(`✉️ ${data.message || '메일 발송 완료'}`);
    } catch (e: any) {
      setStatusErr(true);
      setStatusMsg(e.message || '메일 발송 중 오류가 발생했어요');
    } finally {
      setEmailSending(false);
    }
  }

  async function handleDownloadWeather() {
    if (!weatherRef.current || Object.keys(weatherRef.current).length === 0) {
      setStatusErr(true);
      setStatusMsg('날씨 데이터가 없습니다. 실시간 날씨 또는 CSV 업로드 후 저장해 주세요.');
      return;
    }
    setLoading(true);
    try {
      const resp = await fetch('/api/heatwave-daily-email/export-excel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather: weatherRef.current }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: '다운로드 실패' }));
        throw new Error(err.message);
      }
      const blob = await resp.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      const dateStr = new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'2-digit',day:'2-digit'}).replace(/\.\s*/g,'-').replace(/-$/,'');
      a.download = `폭염현황_${dateStr}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setStatusErr(true);
      setStatusMsg(e.message || '다운로드 실패');
    } finally {
      setLoading(false);
    }
  }

  async function handleAutoWeather() {
    setLoading(true);
    setStatusMsg('');
    try {
      const regions = ['daegubuk', 'chungcheong', 'honam', 'buulgyeong'];
      const results = await Promise.allSettled(
        regions.map(r => fetch(`/api/weather/current-heat?region=${r}`, { credentials: 'include' }).then(res => res.json()))
      );
      const allData: any[] = [];
      results.forEach(result => {
        if (result.status === 'fulfilled' && result.value?.ok) {
          allData.push(...(result.value.data || []));
        }
      });
      if (allData.length === 0) throw new Error('기상 데이터를 가져올 수 없습니다');
      applyAutoWeatherData(allData);
      setStatusErr(false);
      setStatusMsg(`실시간 ${allData.length}개 지역 반영`);
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
      <div className="px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-y-1.5 border-b bg-gradient-to-r from-orange-50/80 to-amber-50/60 dark:from-orange-950/20 dark:to-amber-950/10">
        <div className="flex items-center gap-2 min-w-0">
          <Thermometer className="w-4 h-4 text-orange-500 flex-shrink-0" />
          <span className="font-semibold text-xs sm:text-sm truncate">권역별 체감온도 3D 지도</span>
          {autoUpdatedAt && (
            <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-medium whitespace-nowrap">
              {autoSource?.includes('자동') ? '🕘 09:00 자동' : '🔄 수동'}
              {' · '}
              {new Date(autoUpdatedAt).toLocaleString('ko-KR',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false})}
            </span>
          )}
          {statusMsg && statusErr && <span className="text-xs text-red-500 hidden sm:inline">{statusMsg}</span>}
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
          {loading && <Loader2 className="w-4 h-4 animate-spin text-orange-500" />}
          {heatActive && <Button size="sm" variant="ghost" className="h-7 text-xs text-slate-500 px-2" onClick={resetVisuals}>초기화</Button>}
          {heatActive && (
            <Button size="sm" variant="ghost" className={`h-7 text-xs gap-1 px-2 ${showDataTable ? 'text-sky-400' : 'text-slate-400 hover:text-slate-200'}`} onClick={() => setShowDataTable(v => !v)} data-testid="button-toggle-data-table">
              <Eye className="w-3.5 h-3.5" /><span className="hidden sm:inline">{showDataTable ? '테이블 숨기기' : '데이터 보기'}</span>
            </Button>
          )}
          {heatActive && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2 sm:px-3 border-emerald-400 text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/30" onClick={handleDownloadWeather} disabled={loading} data-testid="button-download-weather">
              <FileDown className="w-3.5 h-3.5" /><span className="hidden sm:inline">엑셀 저장</span>
            </Button>
          )}
          {heatActive && onSaveMap && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2 sm:px-3 border-teal-400 text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-950/30" onClick={onSaveMap} disabled={mapSaving} data-testid="button-save-map">
              {mapSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">지도 저장</span>
            </Button>
          )}
          {onPreviewEmail && (
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1 px-2 sm:px-3 border-orange-400 text-orange-700 hover:bg-orange-50 dark:text-orange-400 dark:hover:bg-orange-950/30" onClick={onPreviewEmail} disabled={previewLoading || emailSending} data-testid="button-send-daily-email">
              {previewLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Mail className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">메일 발송</span>
            </Button>
          )}
          <Button size="sm" variant="default" className="h-7 text-xs gap-1 px-2 sm:px-3 bg-sky-600 hover:bg-sky-700 text-white" onClick={handleAutoWeather} disabled={loading} data-testid="button-auto-weather">
            <RefreshCw className="w-3.5 h-3.5" /><span className="hidden sm:inline">실시간 날씨</span>
          </Button>
          <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFile} />
        </div>
      </div>

      {/* ─ 권역 탭 ─ */}
      <div className="flex border-b" style={{background:'#0d1117'}}>
        {REGION_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => { setSelectedRegion(tab.key); setSelectedInfo(null); setStatusMsg(''); }}
            data-testid={`tab-region-${tab.key}`}
            style={{
              flex:1, padding:'8px 4px', fontSize:12, fontWeight:600,
              color: selectedRegion === tab.key ? '#f97316' : '#6b7280',
              borderBottom: selectedRegion === tab.key ? '2px solid #f97316' : '2px solid transparent',
              background:'transparent', cursor:'pointer', transition:'color 0.15s',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
              outline:'none',
            }}
          >
            <span className="block">{tab.label}</span>
            <span style={{display:'block',fontSize:9,fontWeight:400,color: selectedRegion===tab.key ? '#fb923c' : '#4b5563',marginTop:1}}>{tab.sub}</span>
          </button>
        ))}
      </div>

      {/* ─ 온도·습도 통계 바 (데이터 반영 후) ─ */}
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
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <div style={{width:60,height:6,borderRadius:3,background:'linear-gradient(to right,#3aa0a0,#f2d24b 42%,#f7b733 58%,#f2711c 74%,#e0392b 88%,#8b1e1e)'}} />
              <span className="hidden sm:inline">20→38+°C</span>
            </div>
            {onDataParsed && (
              <button
                onClick={handleWriteChecklistNow}
                data-testid="button-write-checklist-from-map"
                style={{
                  display:'flex', alignItems:'center', gap:4, padding:'3px 10px',
                  borderRadius:6, border:'1px solid #f97316', background:'rgba(249,115,22,0.12)',
                  color:'#fb923c', fontSize:11, fontWeight:700, cursor:'pointer',
                  whiteSpace:'nowrap', transition:'background 0.15s',
                }}
                onMouseEnter={e=>(e.currentTarget.style.background='rgba(249,115,22,0.25)')}
                onMouseLeave={e=>(e.currentTarget.style.background='rgba(249,115,22,0.12)')}
              >
                ✏️ 체크리스트 작성
              </button>
            )}
          </div>
        </div>
      )}

      {/* ─ 지도 패널 ─ */}
      {isMobile && (
        <div style={{ background: '#0a0d12', padding: '4px 12px', display: 'flex', gap: 12, alignItems: 'center', fontSize: 10, color: '#6b7280' }}>
          <span>👆 탭 — 상세 정보</span>
          <span>☝️ 드래그 — 이동</span>
          <span>🤏 핀치 — 확대/축소</span>
        </div>
      )}
      <div className="p-2 sm:p-3 flex gap-2 sm:gap-3"
        style={{
          background:'#0a0d12',
          height: isMobile ? 560 : 680,
          flexDirection: isMobile ? 'column' : 'row',
          touchAction: isMobile ? 'none' : undefined,
        }}>

        {/* 대구·경북 */}
        {/* 전체 지도 */}
        {selectedRegion === 'all' && (
          <div className="flex flex-col rounded-xl border border-[#232a35] overflow-hidden"
            style={{ background:'#11151c', flex:'1 1 0', minWidth: 0 }}>
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#232a35] flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">전체 권역 (대구본부·충청본부·호남본부·부산본부)</span>
                {warnings.length > 0 && (
                  <button onClick={()=>setWarningOpen(v=>!v)} style={{fontSize:9,fontWeight:700,color:'#f87171',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',padding:'1px 6px',borderRadius:10,cursor:'pointer',lineHeight:'16px'}}>
                    🚨 기상특보 {warnings.length}건{warningOpen?' ▲':' ▼'}
                  </button>
                )}
              </div>
              {!isMobile && <span className="text-[10px] text-slate-500">클릭하면 상세 보기</span>}
            </div>
            {warningOpen && warnings.length > 0 && (
              <div style={{background:'#090e14',borderBottom:'1px solid #232a35',padding:'8px 12px',flexShrink:0}}>
                {warnings.map((w,i)=>{const isKyungbo=w.type.includes('경보')&&!w.type.includes('주의');const bc=isKyungbo?'#ef4444':w.type.includes('주의')&&!w.type.includes('경보')?'#f97316':'#3b82f6';return(<div key={i} style={{marginTop:i===0?0:7,borderTop:i===0?'none':'1px solid rgba(255,255,255,0.06)',paddingTop:i===0?0:5}}><span style={{fontSize:9,fontWeight:700,color:bc,background:`${bc}22`,border:`1px solid ${bc}44`,padding:'1px 5px',borderRadius:3,lineHeight:'15px',display:'inline-block'}}>{w.type}</span>{w.type.includes('중대경보')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 38도 이상]</span>:w.type.includes('경보')&&!w.type.includes('주의')&&!w.type.includes('중대')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 35도 이상]</span>:w.type.includes('주의')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 33도 이상]</span>:w.type.includes('관심')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 31도 이상]</span>:null}<div style={{fontSize:9,color:'#fca5a5',lineHeight:1.5,marginTop:3}}>{w.regions}</div></div>);})}
              </div>
            )}
            <div style={{position:'relative', flex:1, minHeight:0, background:'#0d1117'}}>
              <div ref={allRef} style={{position:'absolute',inset:0}} />
              {/* 울릉도 인셋 — 우하단 */}
              <div style={{position:'absolute',bottom:8,right:8,zIndex:4,width:isMobile?130:180,height:isMobile?105:140,border:'2px dashed #3d4757',borderRadius:10,background:'#0d1117',overflow:'hidden'}}>
                <div style={{position:'absolute',top:-8,left:8,zIndex:2,background:'#11151c',padding:'0 5px',fontSize:9,letterSpacing:'1.5px',color:'#697384'}}>INSET</div>
                <span style={{position:'absolute',top:5,left:9,zIndex:2,fontSize:13,fontWeight:700,color:'#e8ecf1',textShadow:'0 1px 3px rgba(0,0,0,0.8)',pointerEvents:'none'}}>울릉군</span>
                <div ref={ulleungAllRef} style={{position:'absolute',inset:0}} />
              </div>
              {/* 제주도 인셋 — 울릉도 왼쪽 (나란히) */}
              <div style={{position:'absolute',bottom:8,right:isMobile?146:196,zIndex:4,width:isMobile?130:180,height:isMobile?105:140,border:'2px dashed #3d4757',borderRadius:10,background:'#0d1117',overflow:'hidden'}}>
                <div style={{position:'absolute',top:-8,left:8,zIndex:2,background:'#11151c',padding:'0 5px',fontSize:9,letterSpacing:'1.5px',color:'#697384'}}>INSET</div>
                <span style={{position:'absolute',top:5,left:9,zIndex:2,fontSize:13,fontWeight:700,color:'#e8ecf1',textShadow:'0 1px 3px rgba(0,0,0,0.8)',pointerEvents:'none'}}>제주도</span>
                <div ref={jejuAllRef} style={{position:'absolute',inset:0}} />
              </div>
              {selectedInfo && <RegionInfoCard info={selectedInfo} onClose={()=>setSelectedInfo(null)} heatColorFn={heatColorHex} warnings={warnings} />}
            </div>
          </div>
        )}

        {selectedRegion === 'daegubuk' && (
          <div className="flex flex-col rounded-xl border border-[#232a35] overflow-hidden"
            style={{ background:'#11151c', flex:'1 1 0', minWidth: 0 }}>
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#232a35] flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">대구광역시 · 경상북도</span>
                {warnings.filter(w=>['대구','경상북도','경북','울릉'].some(k=>w.regions.includes(k))).length > 0 && (
                  <button onClick={()=>setWarningOpen(v=>!v)} style={{fontSize:9,fontWeight:700,color:'#f87171',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',padding:'1px 6px',borderRadius:10,cursor:'pointer',lineHeight:'16px'}}>
                    🚨 기상특보 {warnings.filter(w=>['대구','경상북도','경북','울릉'].some(k=>w.regions.includes(k))).length}건{warningOpen?' ▲':' ▼'}
                  </button>
                )}
              </div>
              {!isMobile && <span className="text-[10px] text-slate-500">클릭하면 상세 보기</span>}
            </div>
            {warningOpen && warnings.filter(w=>['대구','경상북도','경북','울릉'].some(k=>w.regions.includes(k))).length > 0 && (
              <div style={{background:'#090e14',borderBottom:'1px solid #232a35',padding:'8px 12px',flexShrink:0}}>
                {warnings.filter(w=>['대구','경상북도','경북','울릉'].some(k=>w.regions.includes(k))).map((w,i)=>{const isKyungbo=w.type.includes('경보')&&!w.type.includes('주의');const bc=isKyungbo?'#ef4444':w.type.includes('주의')&&!w.type.includes('경보')?'#f97316':'#3b82f6';const rs=extractRegionClause(w.regions,['대구','경상북도','경북','울릉']);return(<div key={i} style={{marginTop:i===0?0:7,borderTop:i===0?'none':'1px solid rgba(255,255,255,0.06)',paddingTop:i===0?0:5}}><span style={{fontSize:9,fontWeight:700,color:bc,background:`${bc}22`,border:`1px solid ${bc}44`,padding:'1px 5px',borderRadius:3,lineHeight:'15px',display:'inline-block'}}>{w.type}</span>{w.type.includes('중대경보')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 38도 이상]</span>:w.type.includes('경보')&&!w.type.includes('주의')&&!w.type.includes('중대')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 35도 이상]</span>:w.type.includes('주의')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 33도 이상]</span>:w.type.includes('관심')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 31도 이상]</span>:null}<div style={{fontSize:9,color:'#fca5a5',lineHeight:1.5,marginTop:3}}>{rs}</div></div>);})}
              </div>
            )}
            <div style={{position:'relative', flex:1, minHeight:0, background:'#0d1117'}}>
              <div ref={daegubukRef} style={{position:'absolute',inset:0}} />
              <div style={{position:'absolute',bottom:8,right:8,zIndex:4,width: isMobile ? 130 : 190,height: isMobile ? 115 : 165,border:'2px dashed #3d4757',borderRadius:10,background:'#0d1117',overflow:'hidden'}}>
                <div style={{position:'absolute',top:-8,left:8,zIndex:2,background:'#11151c',padding:'0 5px',fontSize:8,letterSpacing:'1.5px',color:'#697384'}}>INSET</div>
                <span style={{position:'absolute',top:5,left:9,zIndex:2,fontSize:10.5,fontWeight:700,color:'#e8ecf1',textShadow:'0 1px 3px rgba(0,0,0,0.6)',pointerEvents:'none'}}>울릉군</span>
                <div ref={ulleungRef} style={{position:'absolute',inset:0}} />
              </div>
              {selectedInfo && (
                <RegionInfoCard info={selectedInfo} onClose={()=>setSelectedInfo(null)} heatColorFn={heatColorHex} warnings={warnings} />
              )}
            </div>
          </div>
        )}

        {/* 충청권 */}
        {selectedRegion === 'chungcheong' && (
          <div className="flex flex-col rounded-xl border border-[#232a35] overflow-hidden"
            style={{ background:'#11151c', flex:'1 1 0', minWidth: 0 }}>
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#232a35] flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">충청권 (대전·세종·충북·충남)</span>
                {warnings.filter(w=>['충청','충북','충남','대전','세종'].some(k=>w.regions.includes(k))).length > 0 && (
                  <button onClick={()=>setWarningOpen(v=>!v)} style={{fontSize:9,fontWeight:700,color:'#f87171',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',padding:'1px 6px',borderRadius:10,cursor:'pointer',lineHeight:'16px'}}>
                    🚨 기상특보 {warnings.filter(w=>['충청','충북','충남','대전','세종'].some(k=>w.regions.includes(k))).length}건{warningOpen?' ▲':' ▼'}
                  </button>
                )}
              </div>
              {!isMobile && <span className="text-[10px] text-slate-500">클릭하면 상세 보기</span>}
            </div>
            {warningOpen && warnings.filter(w=>['충청','충북','충남','대전','세종'].some(k=>w.regions.includes(k))).length > 0 && (
              <div style={{background:'#090e14',borderBottom:'1px solid #232a35',padding:'8px 12px',flexShrink:0}}>
                {warnings.filter(w=>['충청','충북','충남','대전','세종'].some(k=>w.regions.includes(k))).map((w,i)=>{const isKyungbo=w.type.includes('경보')&&!w.type.includes('주의');const bc=isKyungbo?'#ef4444':w.type.includes('주의')&&!w.type.includes('경보')?'#f97316':'#3b82f6';const rs=extractRegionClause(w.regions,['충청','충북','충남','대전','세종']);return(<div key={i} style={{marginTop:i===0?0:7,borderTop:i===0?'none':'1px solid rgba(255,255,255,0.06)',paddingTop:i===0?0:5}}><span style={{fontSize:9,fontWeight:700,color:bc,background:`${bc}22`,border:`1px solid ${bc}44`,padding:'1px 5px',borderRadius:3,lineHeight:'15px',display:'inline-block'}}>{w.type}</span>{w.type.includes('중대경보')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 38도 이상]</span>:w.type.includes('경보')&&!w.type.includes('주의')&&!w.type.includes('중대')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 35도 이상]</span>:w.type.includes('주의')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 33도 이상]</span>:w.type.includes('관심')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 31도 이상]</span>:null}<div style={{fontSize:9,color:'#fca5a5',lineHeight:1.5,marginTop:3}}>{rs}</div></div>);})}
              </div>
            )}
            <div style={{position:'relative', flex:1, minHeight:0, background:'#0d1117'}}>
              <div ref={chungcheongRef} style={{position:'absolute',inset:0}} />
              {selectedInfo && <RegionInfoCard info={selectedInfo} onClose={()=>setSelectedInfo(null)} heatColorFn={heatColorHex} warnings={warnings} />}
            </div>
          </div>
        )}

        {/* 호남권 (전남북·광주 + 제주 인셋) */}
        {selectedRegion === 'honam' && (
          <div className="flex flex-col rounded-xl border border-[#232a35] overflow-hidden"
            style={{ background:'#11151c', flex:'1 1 0', minWidth: 0 }}>
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#232a35] flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">호남권 (광주·전북·전남·제주)</span>
                {warnings.filter(w=>['전라남도','전라북도','전북자치도','광주','제주'].some(k=>w.regions.includes(k))).length > 0 && (
                  <button onClick={()=>setWarningOpen(v=>!v)} style={{fontSize:9,fontWeight:700,color:'#f87171',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',padding:'1px 6px',borderRadius:10,cursor:'pointer',lineHeight:'16px'}}>
                    🚨 기상특보 {warnings.filter(w=>['전라남도','전라북도','전북자치도','광주','제주'].some(k=>w.regions.includes(k))).length}건{warningOpen?' ▲':' ▼'}
                  </button>
                )}
              </div>
              {!isMobile && <span className="text-[10px] text-slate-500">클릭하면 상세 보기</span>}
            </div>
            {warningOpen && warnings.filter(w=>['전라남도','전라북도','전북자치도','광주','제주'].some(k=>w.regions.includes(k))).length > 0 && (
              <div style={{background:'#090e14',borderBottom:'1px solid #232a35',padding:'8px 12px',flexShrink:0}}>
                {warnings.filter(w=>['전라남도','전라북도','전북자치도','광주','제주'].some(k=>w.regions.includes(k))).map((w,i)=>{const isKyungbo=w.type.includes('경보')&&!w.type.includes('주의');const bc=isKyungbo?'#ef4444':w.type.includes('주의')&&!w.type.includes('경보')?'#f97316':'#3b82f6';const rs=extractRegionClause(w.regions,['전라남도','전라북도','전북자치도','광주','제주']);return(<div key={i} style={{marginTop:i===0?0:7,borderTop:i===0?'none':'1px solid rgba(255,255,255,0.06)',paddingTop:i===0?0:5}}><span style={{fontSize:9,fontWeight:700,color:bc,background:`${bc}22`,border:`1px solid ${bc}44`,padding:'1px 5px',borderRadius:3,lineHeight:'15px',display:'inline-block'}}>{w.type}</span>{w.type.includes('중대경보')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 38도 이상]</span>:w.type.includes('경보')&&!w.type.includes('주의')&&!w.type.includes('중대')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 35도 이상]</span>:w.type.includes('주의')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 33도 이상]</span>:w.type.includes('관심')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 31도 이상]</span>:null}<div style={{fontSize:9,color:'#fca5a5',lineHeight:1.5,marginTop:3}}>{rs}</div></div>);})}
              </div>
            )}
            <div style={{position:'relative', flex:1, minHeight:0, background:'#0d1117'}}>
              <div ref={honamRef} style={{position:'absolute',inset:0}} />
              {/* 제주 인셋 */}
              <div style={{position:'absolute',bottom:8,right:8,zIndex:4,width: isMobile ? 140 : 200,height: isMobile ? 100 : 145,border:'2px dashed #3d4757',borderRadius:10,background:'#0d1117',overflow:'hidden'}}>
                <div style={{position:'absolute',top:-8,left:8,zIndex:2,background:'#11151c',padding:'0 5px',fontSize:8,letterSpacing:'1.5px',color:'#697384'}}>INSET</div>
                <span style={{position:'absolute',top:5,left:9,zIndex:2,fontSize:10.5,fontWeight:700,color:'#e8ecf1',textShadow:'0 1px 3px rgba(0,0,0,0.6)',pointerEvents:'none'}}>제주도</span>
                <div ref={jejuRef} style={{position:'absolute',inset:0}} />
              </div>
              {selectedInfo && <RegionInfoCard info={selectedInfo} onClose={()=>setSelectedInfo(null)} heatColorFn={heatColorHex} warnings={warnings} />}
            </div>
          </div>
        )}

        {/* 부울경 */}
        {selectedRegion === 'buulgyeong' && (
          <div className="flex flex-col rounded-xl border border-[#232a35] overflow-hidden"
            style={{ background:'#11151c', flex:'1 1 0', minWidth: 0 }}>
            <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#232a35] flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-300">부산권 (부산·울산·경남)</span>
                {warnings.filter(w=>['부산','울산','경상남도','경남'].some(k=>w.regions.includes(k))).length > 0 && (
                  <button onClick={()=>setWarningOpen(v=>!v)} style={{fontSize:9,fontWeight:700,color:'#f87171',background:'rgba(239,68,68,0.15)',border:'1px solid rgba(239,68,68,0.4)',padding:'1px 6px',borderRadius:10,cursor:'pointer',lineHeight:'16px'}}>
                    🚨 기상특보 {warnings.filter(w=>['부산','울산','경상남도','경남'].some(k=>w.regions.includes(k))).length}건{warningOpen?' ▲':' ▼'}
                  </button>
                )}
              </div>
              {!isMobile && <span className="text-[10px] text-slate-500">클릭하면 상세 보기</span>}
            </div>
            {warningOpen && warnings.filter(w=>['부산','울산','경상남도','경남'].some(k=>w.regions.includes(k))).length > 0 && (
              <div style={{background:'#090e14',borderBottom:'1px solid #232a35',padding:'8px 12px',flexShrink:0}}>
                {warnings.filter(w=>['부산','울산','경상남도','경남'].some(k=>w.regions.includes(k))).map((w,i)=>{const isKyungbo=w.type.includes('경보')&&!w.type.includes('주의');const bc=isKyungbo?'#ef4444':w.type.includes('주의')&&!w.type.includes('경보')?'#f97316':'#3b82f6';const rs=extractRegionClause(w.regions,['부산','울산','경상남도','경남']);return(<div key={i} style={{marginTop:i===0?0:7,borderTop:i===0?'none':'1px solid rgba(255,255,255,0.06)',paddingTop:i===0?0:5}}><span style={{fontSize:9,fontWeight:700,color:bc,background:`${bc}22`,border:`1px solid ${bc}44`,padding:'1px 5px',borderRadius:3,lineHeight:'15px',display:'inline-block'}}>{w.type}</span>{w.type.includes('중대경보')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 38도 이상]</span>:w.type.includes('경보')&&!w.type.includes('주의')&&!w.type.includes('중대')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 35도 이상]</span>:w.type.includes('주의')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 33도 이상]</span>:w.type.includes('관심')?<span style={{fontSize:8,color:'#94a3b8',marginLeft:4}}>[체감 31도 이상]</span>:null}<div style={{fontSize:9,color:'#fca5a5',lineHeight:1.5,marginTop:3}}>{rs}</div></div>);})}
              </div>
            )}
            <div style={{position:'relative', flex:1, minHeight:0, background:'#0d1117'}}>
              <div ref={buulgyeongRef} style={{position:'absolute',inset:0}} />
              {selectedInfo && <RegionInfoCard info={selectedInfo} onClose={()=>setSelectedInfo(null)} heatColorFn={heatColorHex} warnings={warnings} />}
            </div>
          </div>
        )}

      </div>

      {/* ─ 날씨 데이터 테이블 ─ */}
      {heatActive && showDataTable && Object.keys(weatherData).length > 0 && (
        <div className="border-t border-[#232a35] overflow-auto" style={{background:'#0d1117', maxHeight: 400}}>
          <table style={{width:'100%', borderCollapse:'collapse', fontSize: 12}}>
            <thead>
              <tr style={{background:'#141b26', position:'sticky', top:0, zIndex:2}}>
                {['권역','지역','예보시간','체감온도','기온','습도','폭염단계','강수형태','강수량','풍속(m/s)','풍속단계'].map(h => (
                  <th key={h} style={{padding:'7px 10px', textAlign: (h==='권역'||h==='지역') ? 'left' : 'center', color:'#9aa5b3', fontWeight:600, borderBottom:'1px solid #232a35', whiteSpace:'nowrap'}}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const md = mapDataRef.current;
                const tabNames: Set<string> = new Set(
                  selectedRegion === 'all'         ? (md ? [...md.daegubuk,...md.ulleung,...md.chungcheong,...md.honam,...md.jeju,...md.buulgyeong] : []).map(r=>r.name) :
                  selectedRegion === 'daegubuk'    ? (md ? [...md.daegubuk,...md.ulleung] : []).map(r=>r.name) :
                  selectedRegion === 'chungcheong' ? (md ? md.chungcheong : []).map(r=>r.name) :
                  selectedRegion === 'honam'       ? (md ? [...md.honam,...md.jeju] : []).map(r=>r.name) :
                  selectedRegion === 'buulgyeong'  ? (md ? md.buulgyeong : []).map(r=>r.name) : []
                );
                // 지역 → 권역 매핑
                const zoneMap = new Map<string, string>();
                if (md) {
                  [...(md.daegubuk||[]),...(md.ulleung||[])].forEach(r=>zoneMap.set(r.name,'대구본부'));
                  (md.chungcheong||[]).forEach(r=>zoneMap.set(r.name,'충청본부'));
                  [...(md.honam||[]),...(md.jeju||[])].forEach(r=>zoneMap.set(r.name,'호남본부'));
                  (md.buulgyeong||[]).forEach(r=>zoneMap.set(r.name,'부산본부'));
                }
                type RowData = { key:string; zone:string; name:string; time:string; feels:number; temp:number|null; hum:number|null; stage:string; rainType:string; rain:string; wind:number|null; windLevel:string; };
                const tableRows: RowData[] = Object.entries(weatherData)
                  .filter(([name]) => tabNames.size === 0 || tabNames.has(name))
                  .flatMap(([name, w]) => {
                    const zone = zoneMap.get(name) || '';
                    if (w.hourly && w.hourly.length > 0) {
                      return w.hourly.map((h, i) => ({ key:`${name}-${h.time}-${i}`, zone, name, time:h.time, feels:h.feels, temp:h.temp, hum:h.hum, stage:h.stage, rainType:h.rainType, rain:h.rain, wind:h.wind, windLevel:h.windLevel }));
                    }
                    return [{ key:name, zone, name, time:w.time||'-', feels:w.feels, temp:w.temp, hum:w.hum, stage:w.stage||'해당없음', rainType:w.rainType||'없음', rain:w.rain||'강수없음', wind:w.wind??null, windLevel:w.windLevel||'정상' }];
                  })
                  .sort((a,b) => b.feels - a.feels);
                return tableRows.map(row => (
                  <tr key={row.key} style={{borderBottom:'1px solid #1a2030'}}>
                    <td style={{padding:'6px 10px', color:'#697384', fontSize:11, whiteSpace:'nowrap'}}>{row.zone}</td>
                    <td style={{padding:'6px 10px', color:'#e8ecf1', fontWeight:600, whiteSpace:'nowrap'}}>{row.name}</td>
                    <td style={{padding:'6px 10px', textAlign:'center', color:'#94a3b8', fontVariantNumeric:'tabular-nums' as any, whiteSpace:'nowrap'}}>{row.time}</td>
                    <td style={{padding:'6px 10px', textAlign:'center', fontWeight:700, color: heatColorHex(row.feels), fontVariantNumeric:'tabular-nums' as any}}>{row.feels}°C</td>
                    <td style={{padding:'6px 10px', textAlign:'center', color:'#c5cdd7', fontVariantNumeric:'tabular-nums' as any}}>{row.temp != null ? `${row.temp}°C` : '-'}</td>
                    <td style={{padding:'6px 10px', textAlign:'center', color:'#7dd3fc', fontVariantNumeric:'tabular-nums' as any}}>{row.hum != null ? `${row.hum}%` : '-'}</td>
                    <td style={{padding:'6px 10px', textAlign:'center'}}>
                      <span style={{fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:4, whiteSpace:'nowrap',
                        background: row.stage==='폭염경보' ? '#7f1d1d' : row.stage==='폭염주의보' ? '#7c2d12' : row.stage==='폭염관심' ? '#713f12' : '#1e293b',
                        color: row.stage==='해당없음' ? '#64748b' : '#ffd9a0',
                      }}>{row.stage}</span>
                    </td>
                    <td style={{padding:'6px 10px', textAlign:'center', color:(row.rainType&&row.rainType!=='없음')?'#7dd3fc':'#4a5568', whiteSpace:'nowrap'}}>{row.rainType}</td>
                    <td style={{padding:'6px 10px', textAlign:'center', color:(row.rain&&row.rain!=='강수없음')?'#38bdf8':'#4a5568', whiteSpace:'nowrap', fontVariantNumeric:'tabular-nums' as any}}>{row.rain}</td>
                    <td style={{padding:'6px 10px', textAlign:'center', color:'#a3e635', fontVariantNumeric:'tabular-nums' as any}}>{row.wind != null ? row.wind : '-'}</td>
                    <td style={{padding:'6px 10px', textAlign:'center'}}>
                      <span style={{fontSize:10, fontWeight:600, padding:'2px 6px', borderRadius:4, whiteSpace:'nowrap',
                        background: row.windLevel==='위험'?'#7f1d1d':row.windLevel==='경계'?'#78350f':row.windLevel==='주의'?'#1e3a5f':'#1e293b',
                        color: row.windLevel==='위험'?'#fca5a5':row.windLevel==='경계'?'#fde68a':row.windLevel==='주의'?'#7dd3fc':'#64748b',
                      }}>{row.windLevel}</span>
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}



// 권역 키 → 체크리스트 대상지역 문자열
const REGION_TO_TARGET: Record<string, string> = {
  daegubuk:    '대구 / 경북',
  chungcheong: '충청권',
  honam:       '호남권',
  buulgyeong:  '부산 / 울산 / 경남',
  all:         '전체',
};

function extractRegionClause(regions: string, keywords: string[]): string {
  const parts: string[] = [];
  let depth = 0, start = 0;
  for (let i = 0; i < regions.length; i++) {
    if (regions[i] === '(') depth++;
    else if (regions[i] === ')') depth--;
    else if (regions[i] === ',' && depth === 0) {
      const p = regions.slice(start, i).trim();
      if (p) parts.push(p);
      start = i + 1;
    }
  }
  const last = regions.slice(start).trim();
  if (last) parts.push(last);
  const matched = parts.filter(p => keywords.some(k => p.includes(k)));
  if (!matched.length) return regions;
  return matched.join(', ');
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
  const [viewingWeather, setViewingWeather] = useState<{ weatherSnapshot?: Record<string, any>; mapSnapshot?: string; checkDate?: string; targetArea?: string } | null>(null);
  // 지도 컴포넌트에서 "현재 권역 체크리스트 작성" 함수를 외부 버튼으로 호출하기 위한 ref
  const checklistTriggerRef = useRef<(() => void) | null>(null);
  // 지도 캡처 함수 ref
  const mapCaptureRef = useRef<(() => string | null) | null>(null);

  // 체크리스트 자동작성 확인 다이얼로그
  const [pendingWeatherData, setPendingWeatherData] = useState<ParsedCSVData | null>(null);

  // 메일 미리보기
  const [showEmailPreview, setShowEmailPreview] = useState(false);
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [mainTab, setMainTab] = useState<'map' | 'records'>('map');
  // 현재 지도 날씨 데이터 (미리보기·저장용)
  const [currentWeatherForAction, setCurrentWeatherForAction] = useState<Record<string, any> | null>(null);
  const [mapSaving, setMapSaving] = useState(false);

  // 기상청 특보
  const [warnings, setWarnings] = useState<{ type: string; regions: string }[]>([]);
  const [warningFetchedAt, setWarningFetchedAt] = useState<string | null>(null);
  const [warningRefreshing, setWarningRefreshing] = useState(false);

  // 이메일 권역 선택 (기본: 전체 선택)
  const ALL_EMAIL_ZONES = ['충청본부', '호남본부', '부산본부', '대구본부'];
  const [selectedEmailZones, setSelectedEmailZones] = useState<string[]>([...ALL_EMAIL_ZONES]);

  const loadWarnings = async () => {
    try {
      const r = await fetch('/api/heatwave-warnings', { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      if (j?.data?.items) { setWarnings(j.data.items); setWarningFetchedAt(j.data.fetchedAt ?? null); }
    } catch {}
  };

  const refreshWarnings = async () => {
    setWarningRefreshing(true);
    try {
      const r = await fetch('/api/heatwave-warnings/refresh', { method: 'POST', credentials: 'include' });
      if (!r.ok) { toast({ title: '특보 조회 실패', variant: 'destructive' }); return; }
      const j = await r.json();
      if (j?.data?.items) { setWarnings(j.data.items); setWarningFetchedAt(j.data.fetchedAt ?? null); }
      toast({ title: '기상청 특보 현황 갱신 완료', description: `폭염관련 특보 ${j?.data?.items?.length ?? 0}건` });
    } catch (e: any) {
      toast({ title: '특보 조회 실패', description: e.message, variant: 'destructive' });
    } finally { setWarningRefreshing(false); }
  };

  // 페이지 마운트 시 특보 데이터 로드
  useEffect(() => { loadWarnings(); }, []);

  const handleSaveMapData = async () => {
    if (!currentWeatherForAction || Object.keys(currentWeatherForAction).length === 0) {
      toast({ title: '저장할 날씨 데이터가 없습니다', description: '실시간 날씨 조회 또는 CSV 업로드 먼저 해주세요.', variant: 'destructive' });
      return;
    }
    setMapSaving(true);
    try {
      const resp = await fetch('/api/heatwave-map/data', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weather: currentWeatherForAction, savedAt: new Date().toISOString(), source: '수동 저장' }),
      });
      if (!resp.ok) throw new Error('저장 실패');
      toast({ title: '폭염지도 데이터가 저장되었습니다', description: `${Object.keys(currentWeatherForAction).length}개 지역 저장 완료` });
    } catch (e: any) {
      toast({ title: '저장 실패', description: e.message, variant: 'destructive' });
    } finally {
      setMapSaving(false);
    }
  };

  const handleDownloadPDF = async (record: HeatWaveChecklist) => {
    setPdfViewing(record);
    setIsPdfDownloading(true);
    await new Promise((r) => setTimeout(r, 700));
    try {
      const html2canvas = (await import("html2canvas")).default;
      const jsPDF = (await import("jspdf")).jsPDF;
      const page1 = document.getElementById("heatwave-pdf-page1");
      if (!page1) { toast({ title: "PDF 생성 실패", variant: "destructive" }); return; }
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      const opts = { scale: 2, useCORS: true, logging: false, backgroundColor: "#ffffff" };
      // 1페이지
      const c1 = await html2canvas(page1, opts);
      pdf.addImage(c1.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, ph);
      // 2페이지 (날씨 현황 - 있을 때만)
      const page2 = document.getElementById("heatwave-pdf-page2");
      if (page2) {
        const c2 = await html2canvas(page2, opts);
        pdf.addPage();
        const ratio2 = c2.height / c2.width;
        const imgH2 = pw * ratio2;
        pdf.addImage(c2.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, pw, Math.min(imgH2, ph));
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

  // 날씨 데이터로 폼 자동완성 후 폼 열기
  const applyWeatherToForm = (d: ParsedCSVData) => {
    const hl = d.dominantHeatLevel;
    const heatAlertStatus =
      hl.includes("위험") || hl.includes("경고") ? "폭염경보" :
      hl.includes("주의") || hl.includes("관심") ? "폭염주의보" :
      "해당없음";
    const ml = d.maxFeelsLike;
    const now = new Date();
    const targetArea = REGION_TO_TARGET[d.selectedRegion ?? ''] ?? '대구 / 경북';
    setCsvForm({
      ...emptyForm(),
      checkDate: format(now, "yyyy-MM-dd"),
      checkTime: format(now, "HH:mm"),
      targetArea,
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
      weatherSnapshot: d.weatherSnapshot,
      mapSnapshot: d.mapSnapshot,
    });
    setShowForm(true);
    toast({ title: "날씨 데이터로 체크리스트가 자동완성되었습니다", description: `${targetArea} · 최고 체감온도 ${ml}°C · ${heatAlertStatus}` });
  };

  // 날씨 조회 완료 시 → 확인 다이얼로그 표시 + 현재 날씨 저장 + 지도 캡처 (rAF 2프레임 후)
  const handleCsvParsed = (d: ParsedCSVData) => {
    setPendingWeatherData(d);
    if (d.weatherSnapshot) setCurrentWeatherForAction(d.weatherSnapshot);
    // Three.js 렌더루프가 새 데이터를 반영한 뒤 캡처 (2 rAF 대기)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const mapImg = mapCaptureRef.current?.() ?? undefined;
        if (mapImg) {
          setPendingWeatherData(prev => prev ? { ...prev, mapSnapshot: mapImg } : { ...d, mapSnapshot: mapImg });
        }
      });
    });
  };

  // 메일 미리보기
  const handlePreviewEmail = async () => {
    setPreviewLoading(true);
    try {
      const resp = await fetch('/api/heatwave-daily-email/preview', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        // currentWeatherForAction이 있으면 전달, 없으면 서버가 DB에서 자동 조회
        body: JSON.stringify({ weather: currentWeatherForAction || {} }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.message || '미리보기 생성 실패');
      setPreviewHtml(data.html || '');
      // 서버 응답의 weather로 currentWeatherForAction 동기화 (이대로 발송 시 사용)
      if (data.weather && Object.keys(data.weather).length > 0) {
        setCurrentWeatherForAction(data.weather);
      }
      setShowEmailPreview(true);
    } catch (e: any) {
      toast({ title: '미리보기 실패', description: e.message, variant: 'destructive' });
    } finally {
      setPreviewLoading(false);
    }
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
    <div className="space-y-4">
      {/* ── 헤더 + 탭 바 ─────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
              <Sun className="w-6 h-6 text-orange-500" />
              폭염 일일 체크리스트
            </h1>
            <p className="text-sm text-muted-foreground mt-1 hidden sm:block">폭염 단계별 조치사항을 일별로 기록·관리합니다</p>
          </div>
        </div>
        <div className="flex border-b border-border">
          <button
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${mainTab === 'map' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMainTab('map')}
            data-testid="tab-map"
          >
            🌡️ 지도 / 날씨
          </button>
          <button
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5 whitespace-nowrap ${mainTab === 'records' ? 'border-orange-500 text-orange-600 dark:text-orange-400' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setMainTab('records')}
            data-testid="tab-records"
          >
            📋 체크리스트 기록
            {!isLoading && records.length > 0 && (
              <span className="bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 text-xs px-1.5 py-0.5 rounded-full font-semibold">{records.length}</span>
            )}
          </button>
        </div>
      </div>


      {/* ── 지도 / 날씨 탭 ─ Three.js 유지를 위해 display:none 숨김 ── */}
      <div style={{ display: mainTab === 'map' ? 'block' : 'none' }}>
        <DaeguGyeongbukHeatMap
          onDataParsed={handleCsvParsed}
          checklistTriggerRef={checklistTriggerRef}
          onPreviewEmail={handlePreviewEmail}
          onSaveMap={handleSaveMapData}
          mapSaving={mapSaving}
          previewLoading={previewLoading}
          mapCaptureRef={mapCaptureRef}
          warnings={warnings}
        />
      </div>

      {/* ── 체크리스트 자동작성 확인 다이얼로그 ─────────────────────────── */}
      {pendingWeatherData && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" data-testid="dialog-checklist-confirm">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
            {/* 헤더 */}
            <div className="bg-gradient-to-r from-orange-500 to-red-500 px-5 py-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Sun className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="font-bold text-white text-sm">날씨 조회 완료</div>
                <div className="text-white/80 text-xs mt-0.5">
                  {REGION_TO_TARGET[pendingWeatherData.selectedRegion ?? ''] ?? '전체'} 기상 데이터
                </div>
              </div>
            </div>
            {/* 요약 정보 */}
            <div className="px-5 py-4">
              <div className="flex gap-2 mb-4">
                <div className="flex-1 bg-orange-50 dark:bg-orange-950/30 rounded-xl p-3 text-center border border-orange-100 dark:border-orange-900">
                  <div className="text-xs text-orange-600 dark:text-orange-400 font-medium mb-1">최고 체감온도</div>
                  <div className="text-2xl font-black text-orange-600 dark:text-orange-400 leading-none">
                    {pendingWeatherData.maxFeelsLike}<span className="text-base">°C</span>
                  </div>
                </div>
                <div className="flex-1 bg-slate-50 dark:bg-slate-800/50 rounded-xl p-3 text-center border border-slate-100 dark:border-slate-700">
                  <div className="text-xs text-muted-foreground font-medium mb-1">대상 지역</div>
                  <div className="text-sm font-bold text-foreground leading-tight mt-1">
                    {REGION_TO_TARGET[pendingWeatherData.selectedRegion ?? ''] ?? '전체'}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 text-xs text-muted-foreground bg-slate-50 dark:bg-slate-800/50 rounded-lg px-3 py-2.5 mb-4">
                <span>📅 작성일자/시간 <strong className="text-foreground">자동 입력</strong></span>
                <span>·</span>
                <span>✅ 조치사항 <strong className="text-foreground">자동 체크</strong></span>
              </div>
              <p className="text-sm text-foreground font-semibold text-center">
                폭염 일일 체크리스트를 자동으로 작성하시겠습니까?
              </p>
            </div>
            {/* 버튼 */}
            <div className="flex gap-2 px-5 pb-5">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setPendingWeatherData(null)}
                data-testid="button-checklist-confirm-no"
              >
                아니오
              </Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
                onClick={() => {
                  applyWeatherToForm(pendingWeatherData);
                  setPendingWeatherData(null);
                }}
                data-testid="button-checklist-confirm-yes"
              >
                예, 자동 작성
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 메일 미리보기 모달 ─────────────────────────────────────────────── */}
      {showEmailPreview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="dialog-email-preview">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-3xl mx-4 flex flex-col" style={{ maxHeight: '90vh' }}>
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-3.5 border-b bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-950/20 dark:to-blue-950/20 rounded-t-2xl flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                  <Mail className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <div className="font-bold text-sm text-foreground">메일 발송 미리보기</div>
                  <div className="text-xs text-muted-foreground">실제 발송될 이메일 내용을 확인하세요</div>
                </div>
              </div>
              <button
                onClick={() => setShowEmailPreview(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                data-testid="button-close-email-preview"
              >
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            {/* 미리보기 iframe */}
            <div className="flex-1 overflow-hidden rounded-b-2xl" style={{ minHeight: 0 }}>
              <iframe
                srcDoc={previewHtml}
                sandbox="allow-same-origin"
                style={{ width: '100%', height: '100%', border: 'none', minHeight: '60vh' }}
                title="이메일 미리보기"
              />
            </div>
            {/* 권역 선택 */}
            <div className="px-5 py-2.5 border-t bg-slate-50 dark:bg-zinc-800/50 flex-shrink-0">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1.5">발송 권역 선택</div>
              <div className="flex flex-wrap gap-2">
                {ALL_EMAIL_ZONES.map(zone => {
                  const checked = selectedEmailZones.includes(zone);
                  const icons: Record<string,string> = { '충청본부':'🌾', '호남본부':'🌊', '부산본부':'⚓', '대구본부':'🏔' };
                  return (
                    <label key={zone} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border cursor-pointer text-xs font-medium transition-colors select-none ${checked ? 'bg-orange-100 dark:bg-orange-900/40 border-orange-400 text-orange-700 dark:text-orange-300' : 'bg-white dark:bg-zinc-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400'}`}>
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={checked}
                        onChange={e => setSelectedEmailZones(prev => e.target.checked ? [...prev, zone] : prev.filter(z => z !== zone))}
                        data-testid={`checkbox-zone-${zone}`}
                      />
                      {icons[zone]} {zone}
                    </label>
                  );
                })}
              </div>
              {selectedEmailZones.length === 0 && <p className="text-[10px] text-red-500 mt-1">⚠ 최소 1개 권역을 선택하세요</p>}
            </div>
            {/* 하단 버튼 */}
            <div className="flex gap-2 px-5 py-3.5 border-t flex-shrink-0 bg-white dark:bg-zinc-900 rounded-b-2xl">
              <Button variant="outline" className="flex-1" onClick={() => setShowEmailPreview(false)} data-testid="button-preview-cancel">
                닫기
              </Button>
              <Button
                className="flex-1 bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
                disabled={selectedEmailZones.length === 0}
                onClick={async () => {
                  setShowEmailPreview(false);
                  if (!currentWeatherForAction) return;
                  const resp = await fetch('/api/heatwave-daily-email/send-now', {
                    method: 'POST',
                    credentials: 'include',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ weather: currentWeatherForAction, selectedZones: selectedEmailZones }),
                  });
                  const data = await resp.json().catch(() => ({}));
                  if (resp.ok) {
                    toast({ title: `✉️ ${data.message || '메일 발송 완료'}` });
                  } else {
                    toast({ title: '발송 실패', description: data.message, variant: 'destructive' });
                  }
                }}
                data-testid="button-preview-send"
              >
                <Send className="w-3.5 h-3.5" />
                이대로 발송
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── 체크리스트 기록 탭 ─────────────────────────────────────────── */}
      {mainTab === 'records' && (
      <div className="space-y-4">
        <div className="flex justify-end">
          <Button
            size="sm"
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
            onClick={() => setShowForm(true)}
            data-testid="button-add-checklist"
          >
            <Plus className="w-4 h-4" />
            체크리스트 작성
          </Button>
        </div>

      {/* 모바일 카드 목록 */}
      <div className="block sm:hidden space-y-2">
        {isLoading ? (
          <div className="text-center py-10 text-muted-foreground text-sm">불러오는 중...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-14 text-muted-foreground border rounded-lg">
            <Sun className="w-10 h-10 mx-auto mb-2 opacity-20" />
            <p className="text-sm">등록된 체크리스트가 없습니다</p>
            <p className="text-xs mt-1">상단 버튼으로 작성하세요</p>
          </div>
        ) : (
          records.map((r) => (
            <div key={r.id} className="border rounded-xl p-3 bg-card shadow-sm" data-testid={`row-checklist-${r.id}`}>
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <div className="font-semibold text-sm">{r.checkDate} <span className="text-muted-foreground font-normal">{r.checkTime}</span></div>
                  {r.targetArea && <div className="text-xs text-muted-foreground mt-0.5">{r.targetArea}</div>}
                </div>
                <Badge variant={alertBadgeVariant(r.heatAlertStatus)} className="flex-shrink-0 text-xs" data-testid={`badge-alert-${r.id}`}>
                  {r.heatAlertStatus}
                </Badge>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>
                  {r.currentTemperature != null ? `기온 ${r.currentTemperature}°C` : ''}
                  {r.currentFeelsLike != null ? ` · 체감 ${r.currentFeelsLike}°C` : ''}
                </span>
                <span>조치 <strong className="text-foreground">{totalChecks(r)}</strong>/{totalPossible} · {r.author ?? '-'}</span>
              </div>
              {(r as any).weatherSnapshot && (
                <div className="flex items-center gap-1 mb-2">
                  <button
                    className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 transition-colors"
                    onClick={() => setViewingWeather(r as any)}
                    data-testid={`button-weather-${r.id}`}
                  >
                    <Thermometer className="w-3 h-3" />날씨 첨부
                  </button>
                </div>
              )}
              <div className="grid grid-cols-4 gap-1 border-t pt-2">
                <Button variant="ghost" size="sm" className="h-9 text-xs flex-col gap-0.5 px-1" onClick={() => setViewing(r)} data-testid={`button-view-${r.id}`}>
                  <Eye className="w-4 h-4" /><span>보기</span>
                </Button>
                <Button variant="ghost" size="sm" className="h-9 text-xs flex-col gap-0.5 px-1 text-orange-500" onClick={() => setEditing(r)} data-testid={`button-edit-${r.id}`}>
                  <Pencil className="w-4 h-4" /><span>수정</span>
                </Button>
                <Button variant="ghost" size="sm" className="h-9 text-xs flex-col gap-0.5 px-1 text-blue-600" onClick={() => setPdfViewing(r)} data-testid={`button-pdf-${r.id}`}>
                  <FileText className="w-4 h-4" /><span>PDF</span>
                </Button>
                <Button variant="ghost" size="sm" className="h-9 text-xs flex-col gap-0.5 px-1 text-destructive" onClick={() => handleDelete(r.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-${r.id}`}>
                  <Trash2 className="w-4 h-4" /><span>삭제</span>
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* 데스크탑 테이블 목록 */}
      <div className="hidden sm:block border rounded-lg overflow-hidden bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>작성일시</TableHead>
              <TableHead>대상지역</TableHead>
              <TableHead>폭염특보</TableHead>
              <TableHead className="text-center hidden md:table-cell">기온 / 체감</TableHead>
              <TableHead className="text-center">조치 완료</TableHead>
              <TableHead className="hidden md:table-cell">작성자</TableHead>
              <TableHead className="w-24 text-right">관리</TableHead>
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
                  <TableCell className="text-center text-sm hidden md:table-cell">
                    {r.currentTemperature != null ? `${r.currentTemperature}°C` : "-"}
                    {r.currentFeelsLike != null && (
                      <span className="text-muted-foreground"> / {r.currentFeelsLike}°C</span>
                    )}
                  </TableCell>
                  <TableCell className="text-center text-sm">
                    <span className="font-medium">{totalChecks(r)}</span>
                    <span className="text-muted-foreground">/{totalPossible}</span>
                  </TableCell>
                  <TableCell className="text-sm hidden md:table-cell">
                    <div className="flex items-center gap-1.5">
                      {r.author ?? "-"}
                      {(r as any).weatherSnapshot && (
                        <button
                          className="flex items-center gap-0.5 text-xs px-1.5 py-0.5 rounded-full bg-orange-50 dark:bg-orange-950/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800 hover:bg-orange-100 transition-colors whitespace-nowrap"
                          onClick={() => setViewingWeather(r as any)}
                          data-testid={`button-weather-${r.id}`}
                          title="날씨 데이터 보기"
                        >
                          <Thermometer className="w-2.5 h-2.5" />날씨
                        </button>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setViewing(r)} data-testid={`button-view-${r.id}`}>
                        <Eye className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-orange-500 hover:text-orange-700" onClick={() => setEditing(r)} data-testid={`button-edit-${r.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-blue-600 hover:text-blue-700" onClick={() => setPdfViewing(r)} data-testid={`button-pdf-${r.id}`}>
                        <FileText className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleDelete(r.id)} disabled={deleteMutation.isPending} data-testid={`button-delete-${r.id}`}>
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
      </div>)}

      {/* 작성 다이얼로그 */}
      <Dialog open={showForm} onOpenChange={(open) => { setShowForm(open); if (!open) setCsvForm(null); }}>
        <DialogContent className="w-full max-w-none sm:w-[95vw] sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg p-0 flex flex-col gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sun className="w-4 h-4 text-orange-500" />
              폭염 일일 체크리스트 작성
              {csvForm && <Badge variant="outline" className="text-xs text-green-600 border-green-400">CSV 자동완성</Badge>}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            <ChecklistForm
              key={csvForm ? "csv" : "empty"}
              initial={csvForm ?? emptyForm()}
              onSubmit={(data) => createMutation.mutate(formToPayload(data))}
              isPending={createMutation.isPending}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* 상세보기 다이얼로그 */}
      <Dialog open={!!viewing} onOpenChange={() => setViewing(null)}>
        <DialogContent className="w-full max-w-none sm:w-[95vw] sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg p-0 flex flex-col gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sun className="w-4 h-4 text-orange-500" />
              <span className="truncate">{viewing?.checkDate} {viewing?.checkTime}</span>
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
              <ChecklistForm initial={formFromRecord(viewing)} readOnly />
              <div className="flex flex-wrap gap-2 justify-end pt-2 border-t">
                <Button variant="outline" size="sm" onClick={() => { setPdfViewing(viewing); }}>
                  <FileText className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setEditing(viewing); setViewing(null); }}>
                  <Pencil className="w-4 h-4 mr-1" /> 수정
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setViewing(null)}>닫기</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 수정 다이얼로그 */}
      <Dialog open={!!editing} onOpenChange={() => setEditing(null)}>
        <DialogContent className="w-full max-w-none sm:w-[95vw] sm:max-w-2xl h-[100dvh] sm:h-auto sm:max-h-[90vh] rounded-none sm:rounded-lg p-0 flex flex-col gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 border-b flex-shrink-0">
            <DialogTitle className="flex items-center gap-2 text-base">
              <Sun className="w-4 h-4 text-orange-500" /> 체크리스트 수정
            </DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              <ChecklistForm
                initial={formFromRecord(editing)}
                onSubmit={(data) =>
                  updateMutation.mutate({ id: editing.id, data: formToPayload(data) })
                }
                isPending={updateMutation.isPending}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 날씨 첨부 상세 모달 */}
      {viewingWeather && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm" data-testid="dialog-weather-view">
          <div className="bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl mx-4 flex flex-col overflow-hidden" style={{ maxHeight: '90vh' }}>
            <div className="flex items-center justify-between px-5 py-3.5 border-b bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-950/20 dark:to-amber-950/20 flex-shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-orange-100 dark:bg-orange-900/40 flex items-center justify-center">
                  <Thermometer className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <div className="font-bold text-sm text-foreground">날씨 첨부 데이터</div>
                  <div className="text-xs text-muted-foreground">{viewingWeather.checkDate} · {viewingWeather.targetArea}</div>
                </div>
              </div>
              <button onClick={() => setViewingWeather(null)} className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors" data-testid="button-close-weather">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {viewingWeather.mapSnapshot && (
                <div className="rounded-xl overflow-hidden border border-orange-100 dark:border-orange-900">
                  <img src={viewingWeather.mapSnapshot} alt="폭염 지도 스냅샷" className="w-full object-contain max-h-72" />
                </div>
              )}
              {viewingWeather.weatherSnapshot && (() => {
                const snap = viewingWeather.weatherSnapshot as Record<string, { feels: number; temp: number; hum: number; stage?: string; time?: string }>;
                const sorted = filterWeatherByTargetArea(snap, viewingWeather.targetArea ?? '');
                return (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">{sorted.length}개 지역 · 체감온도 높은 순 {REGION_CITIES_BY_TARGET[viewingWeather.targetArea ?? ''] ? `(${viewingWeather.targetArea})` : '(전체)'}</div>
                    <div className="rounded-lg overflow-hidden border text-xs">
                      <table className="w-full">
                        <thead>
                          <tr className="bg-orange-50 dark:bg-orange-950/30 text-muted-foreground">
                            <th className="px-3 py-2 text-left">지역</th>
                            <th className="px-3 py-2 text-center">체감</th>
                            <th className="px-3 py-2 text-center">기온</th>
                            <th className="px-3 py-2 text-center">습도</th>
                            <th className="px-3 py-2 text-center">단계</th>
                            <th className="px-3 py-2 text-center">기준시각</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {sorted.map(([name, w], i) => (
                            <tr key={name} className={i % 2 === 0 ? "bg-background" : "bg-muted/30"}>
                              <td className="px-3 py-1.5 font-medium">{name}</td>
                              <td className={`px-3 py-1.5 text-center font-bold ${w.feels >= 38 ? 'text-red-600' : w.feels >= 35 ? 'text-orange-500' : w.feels >= 33 ? 'text-yellow-600' : ''}`}>{w.feels}°C</td>
                              <td className="px-3 py-1.5 text-center text-muted-foreground">{w.temp != null ? `${w.temp}°C` : '-'}</td>
                              <td className="px-3 py-1.5 text-center text-muted-foreground">{w.hum != null ? `${w.hum}%` : '-'}</td>
                              <td className="px-3 py-1.5 text-center">{w.stage ?? '-'}</td>
                              <td className="px-3 py-1.5 text-center text-muted-foreground">{w.time ?? '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* PDF 미리보기 다이얼로그 */}
      <Dialog open={!!pdfViewing} onOpenChange={() => { setPdfViewing(null); setIsPdfDownloading(false); }}>
        <DialogContent className="w-full max-w-none sm:max-w-[900px] sm:w-[95vw] h-[100dvh] sm:h-auto sm:max-h-[95vh] rounded-none sm:rounded-lg p-0 flex flex-col gap-0">
          <DialogHeader className="px-4 pt-4 pb-3 sm:px-6 sm:pt-5 border-b flex-shrink-0">
            <div className="flex items-center justify-between pr-8">
              <DialogTitle className="flex items-center gap-2 text-sm sm:text-base">
                <FileText className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="truncate">PDF — {pdfViewing?.checkDate} {pdfViewing?.checkTime}</span>
              </DialogTitle>
              <Button
                size="sm"
                onClick={() => pdfViewing && handleDownloadPDF(pdfViewing)}
                disabled={isPdfDownloading}
                data-testid="button-download-pdf"
              >
                {isPdfDownloading ? (
                  <><Loader2 className="w-4 h-4 animate-spin sm:mr-1" /><span className="hidden sm:inline">생성 중...</span></>
                ) : (
                  <><FileDown className="w-4 h-4 sm:mr-1" /><span className="hidden sm:inline">PDF 다운로드</span></>
                )}
              </Button>
            </div>
          </DialogHeader>
          <div className="flex-1 overflow-auto bg-gray-100 p-2 sm:p-6 flex justify-center">
            <div id="heatwave-pdf-capture" className="shadow-xl self-start">
              {pdfViewing && <ChecklistPDFView record={pdfViewing} pdfRef={pdfRef} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
