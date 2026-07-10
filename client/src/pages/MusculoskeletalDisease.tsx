import { useQuery, useMutation } from "@tanstack/react-query";
import { useHeadquarters } from "@/contexts/HeadquartersContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Bone, Plus, Trash2, Pencil, Search, CheckSquare, X,
  ChevronDown, ChevronUp, History, Save, AlertTriangle, Layers,
  FileDown, FileUp, Paperclip, Clock, LayoutGrid, List, ImageIcon
} from "lucide-react";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import type { MusculoskeletalAssessment } from "@shared/schema";

// ── 부담작업 SVG 아이콘 (자세 일러스트) ─────────────────────────────────────
const BURDEN_ICONS: React.ReactNode[] = [
  /* 1호: 키보드·마우스 4시간+ */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="22" cy="6" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="11" x2="22" y2="26" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="10" y1="26" x2="34" y2="26" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="14" y1="26" x2="14" y2="38" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="30" y1="26" x2="30" y2="38" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="16" x2="10" y2="22" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="16" x2="34" y2="22" stroke="#94a3b8" strokeWidth="1.5"/>
    <circle cx="10" cy="22" r="2.5" fill="#ef4444"/>
    <circle cx="34" cy="22" r="2.5" fill="#ef4444"/>
    <rect x="5" y="40" width="34" height="8" rx="2" stroke="#93c5fd" strokeWidth="1.5" fill="#dbeafe" fillOpacity="0.4"/>
    <line x1="9" y1="43" x2="35" y2="43" stroke="#93c5fd" strokeWidth="0.8"/>
    <line x1="9" y1="46" x2="35" y2="46" stroke="#93c5fd" strokeWidth="0.8"/>
  </svg>,
  /* 2호: 반복동작 2시간+ */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="20" cy="6" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="11" x2="20" y2="30" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="30" x2="14" y2="44" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="30" x2="26" y2="44" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="17" x2="10" y2="24" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="10" y1="24" x2="8" y2="31" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="17" x2="33" y2="13" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="33" y1="13" x2="39" y2="20" stroke="#ef4444" strokeWidth="1.8"/>
    <path d="M 36 9 A 8 8 0 0 1 41 22" stroke="#ef4444" strokeWidth="1.4" strokeDasharray="2,1.5" fill="none"/>
    <polygon points="41,22 38,18 43,18" fill="#ef4444"/>
    <circle cx="20" cy="17" r="3.5" fill="#ef4444" fillOpacity="0.25" stroke="#ef4444" strokeWidth="1"/>
  </svg>,
  /* 3호: 팔꿈치·손이 어깨 위 */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="22" cy="9" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="14" x2="22" y2="34" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="34" x2="15" y2="48" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="34" x2="29" y2="48" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="20" x2="9" y2="10" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="9" y1="10" x2="5" y2="4" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="22" y1="20" x2="35" y2="10" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="35" y1="10" x2="39" y2="4" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="12" y1="14" x2="32" y2="14" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="2,1.5"/>
    <line x1="5" y1="4" x2="3" y2="7" stroke="#ef4444" strokeWidth="1"/>
    <line x1="5" y1="4" x2="8" y2="6" stroke="#ef4444" strokeWidth="1"/>
    <line x1="39" y1="4" x2="36" y2="6" stroke="#ef4444" strokeWidth="1"/>
    <line x1="39" y1="4" x2="41" y2="7" stroke="#ef4444" strokeWidth="1"/>
  </svg>,
  /* 4호: 목·허리 굽히기·비틀기 */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="12" cy="8" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="12" y1="13" x2="15" y2="20" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="15" y1="20" x2="34" y2="25" stroke="#ef4444" strokeWidth="2"/>
    <line x1="17" y1="22" x2="16" y2="38" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="23" x2="25" y2="38" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="28" y1="24" x2="30" y2="34" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="33" y1="25" x2="37" y2="35" stroke="#94a3b8" strokeWidth="1.5"/>
    <circle cx="17" cy="22" r="3.5" fill="#ef4444" fillOpacity="0.3" stroke="#ef4444" strokeWidth="1.2"/>
    <path d="M 22 36 A 13 13 0 0 0 34 22" stroke="#f97316" strokeWidth="1" strokeDasharray="2,1.5" fill="none"/>
    <text x="38" y="44" fontSize="7" fill="#ef4444" textAnchor="middle" fontWeight="bold">90°</text>
  </svg>,
  /* 5호: 쪼그리기·무릎 굽히기 */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="22" cy="6" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="11" x2="22" y2="24" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="17" x2="10" y2="21" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="17" x2="34" y2="21" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="24" x2="10" y2="29" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="24" x2="34" y2="29" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="10" y1="29" x2="8" y2="41" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="34" y1="29" x2="36" y2="41" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="4" y1="41" x2="13" y2="41" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="32" y1="41" x2="41" y2="41" stroke="#94a3b8" strokeWidth="1.5"/>
    <circle cx="10" cy="29" r="3.5" fill="#ef4444" fillOpacity="0.3" stroke="#ef4444" strokeWidth="1.2"/>
    <circle cx="34" cy="29" r="3.5" fill="#ef4444" fillOpacity="0.3" stroke="#ef4444" strokeWidth="1.2"/>
  </svg>,
  /* 6호: 손가락 집기·쥐기 (1kg↑) */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <path d="M 12 38 Q 10 28 12 18 Q 13 14 17 14 Q 21 14 21 19 L 21 28" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <path d="M 21 19 Q 21 11 25 11 Q 29 11 29 19 L 29 28" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <path d="M 29 21 Q 29 13 33 13 Q 36 13 36 21 L 35 28" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <path d="M 35 24 Q 37 17 40 18 Q 42 21 40 27 L 37 30" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <path d="M 12 32 Q 5 30 5 25 Q 5 20 10 20 Q 13 20 14 24" stroke="#94a3b8" strokeWidth="1.5" fill="none"/>
    <line x1="21" y1="28" x2="13" y2="37" stroke="#ef4444" strokeWidth="2"/>
    <circle cx="16" cy="34" r="4" fill="#ef4444" fillOpacity="0.35" stroke="#ef4444" strokeWidth="1.2"/>
    <text x="22" y="49" fontSize="7" fill="#ef4444" textAnchor="middle" fontWeight="bold">1 kg↑</text>
  </svg>,
  /* 7호: 한 손으로 들기·쥐기 (4.5kg↑) */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="19" cy="6" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="19" y1="11" x2="19" y2="30" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="19" y1="30" x2="13" y2="44" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="19" y1="30" x2="25" y2="44" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="19" y1="18" x2="9" y2="25" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="9" y1="25" x2="8" y2="32" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="19" y1="18" x2="32" y2="19" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="32" y1="19" x2="35" y2="29" stroke="#ef4444" strokeWidth="1.8"/>
    <circle cx="35" cy="30" r="2" fill="#ef4444"/>
    <rect x="31" y="30" width="10" height="13" rx="1" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5"/>
    <line x1="34" y1="30" x2="34" y2="43" stroke="#f59e0b" strokeWidth="0.5"/>
    <line x1="37" y1="30" x2="37" y2="43" stroke="#f59e0b" strokeWidth="0.5"/>
    <text x="36" y="50" fontSize="6" fill="#92400e" textAnchor="middle" fontWeight="bold">4.5kg</text>
  </svg>,
  /* 8호: 25kg 이상 들기 10회+ */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="22" cy="5" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="10" x2="22" y2="28" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="28" x2="15" y2="42" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="28" x2="29" y2="42" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="16" x2="10" y2="12" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="22" y1="16" x2="34" y2="12" stroke="#ef4444" strokeWidth="1.8"/>
    <rect x="8" y="3" width="28" height="16" rx="2" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5"/>
    <text x="22" y="13.5" fontSize="8" fill="#92400e" textAnchor="middle" fontWeight="bold">25kg</text>
    <ellipse cx="22" cy="22" rx="4" ry="5" fill="#ef4444" fillOpacity="0.2" stroke="#ef4444" strokeWidth="1"/>
    <text x="38" y="30" fontSize="7" fill="#ef4444" textAnchor="middle" fontWeight="bold">×10</text>
  </svg>,
  /* 9호: 10kg 들기 25회+ (특정 위치) */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="14" cy="7" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="14" y1="12" x2="16" y2="18" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="16" y1="18" x2="30" y2="27" stroke="#ef4444" strokeWidth="2"/>
    <line x1="18" y1="20" x2="16" y2="36" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="21" x2="24" y2="36" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="26" y1="24" x2="33" y2="34" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="31" y1="25" x2="39" y2="35" stroke="#ef4444" strokeWidth="1.8"/>
    <rect x="30" y="34" width="13" height="9" rx="1" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5"/>
    <text x="36" y="41" fontSize="6.5" fill="#92400e" textAnchor="middle" fontWeight="bold">10kg</text>
    <text x="8" y="50" fontSize="7" fill="#ef4444" textAnchor="middle" fontWeight="bold">×25</text>
    <circle cx="18" cy="20" r="3.5" fill="#ef4444" fillOpacity="0.25" stroke="#ef4444" strokeWidth="1"/>
  </svg>,
  /* 10호: 4.5kg 분당 2회↑ 2시간+ */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="22" cy="6" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="11" x2="22" y2="28" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="28" x2="16" y2="42" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="28" x2="28" y2="42" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="22" y1="17" x2="33" y2="19" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="33" y1="19" x2="35" y2="27" stroke="#94a3b8" strokeWidth="1.5"/>
    <rect x="31" y="27" width="11" height="8" rx="1" fill="#fef3c7" stroke="#f59e0b" strokeWidth="1.5"/>
    <text x="36.5" y="34" fontSize="5.5" fill="#92400e" textAnchor="middle" fontWeight="bold">4.5kg</text>
    <path d="M 8 12 L 8 6 L 14 6" stroke="#ef4444" strokeWidth="1.5" fill="none"/>
    <polygon points="14,3 14,9 18,6" fill="#ef4444"/>
    <path d="M 8 34 L 8 40 L 14 40" stroke="#ef4444" strokeWidth="1.5" fill="none"/>
    <polygon points="14,37 14,43 18,40" fill="#ef4444"/>
    <text x="5" y="25" fontSize="6" fill="#ef4444" textAnchor="middle" fontWeight="bold">2회</text>
    <text x="5" y="32" fontSize="5.5" fill="#ef4444" textAnchor="middle">/분</text>
  </svg>,
  /* 11호: 손·무릎 충격 2시간+ */
  <svg viewBox="0 0 44 52" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <circle cx="20" cy="6" r="5" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="11" x2="20" y2="29" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="29" x2="13" y2="42" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="29" x2="27" y2="42" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="17" x2="10" y2="22" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="10" y1="22" x2="9" y2="29" stroke="#94a3b8" strokeWidth="1.5"/>
    <line x1="20" y1="17" x2="33" y2="15" stroke="#ef4444" strokeWidth="1.8"/>
    <line x1="33" y1="15" x2="37" y2="28" stroke="#ef4444" strokeWidth="1.8"/>
    <circle cx="37" cy="30" r="4" fill="#ef4444" fillOpacity="0.3" stroke="#ef4444" strokeWidth="1.5"/>
    <line x1="26" y1="38" x2="44" y2="38" stroke="#64748b" strokeWidth="2"/>
    <line x1="33" y1="36" x2="31" y2="32" stroke="#ef4444" strokeWidth="1" strokeDasharray="1.5,1"/>
    <line x1="37" y1="36" x2="37" y2="32" stroke="#ef4444" strokeWidth="1" strokeDasharray="1.5,1"/>
    <line x1="41" y1="36" x2="43" y2="32" stroke="#ef4444" strokeWidth="1" strokeDasharray="1.5,1"/>
    <text x="14" y="50" fontSize="6" fill="#ef4444" textAnchor="middle" fontWeight="bold">10회↑/h</text>
  </svg>,
];

// ── 산업안전보건법 고시 근골격계부담작업 11호 ─────────────────────────────────
const BURDEN_WORKS = [
  { no: 1, short: "키보드·마우스 조작 4시간 이상",           desc: "하루에 4시간 이상 집중적으로 키보드 또는 마우스를 조작하는 작업" },
  { no: 2, short: "반복 동작 2시간 이상 (목·어깨·팔꿈치·손목·손)", desc: "하루에 총 2시간 이상 목, 어깨, 팔꿈치, 손목 또는 손을 사용하여 같은 동작을 반복하는 작업" },
  { no: 3, short: "팔꿈치·손이 어깨 위 2시간 이상",         desc: "하루에 총 2시간 이상 손이 머리 위에 있거나 팔꿈치가 어깨 위에 있는 자세에서 이루어지는 작업" },
  { no: 4, short: "목·허리 굽히기·비틀기 2시간 이상",       desc: "하루에 2시간 이상 목이나 허리를 구부리거나 트는 상태에서 이루어지는 작업" },
  { no: 5, short: "쪼그리기·무릎 굽히기 2시간 이상",        desc: "하루에 총 2시간 이상 쪼그리고 앉거나 무릎을 굽힌 자세에서 이루어지는 작업" },
  { no: 6, short: "손가락 집기·쥐기 2시간 이상 (1 kg↑)",   desc: "하루에 총 2시간 이상 1 kg 이상의 물건을 손가락으로 집거나 2 kg에 상당하는 힘으로 쥐는 작업" },
  { no: 7, short: "한 손으로 들기·쥐기 2시간 이상 (4.5 kg↑)", desc: "하루에 총 2시간 이상 4.5 kg 이상의 물건을 한 손으로 들거나 동일한 힘으로 쥐는 작업" },
  { no: 8, short: "25 kg 이상 들기 하루 10회 이상",         desc: "하루에 10회 이상 25 kg 이상의 물체를 드는 작업" },
  { no: 9, short: "10 kg 이상 들기 25회 이상 (특정 위치)",   desc: "하루에 25회 이상 10 kg 이상의 물체를 무릎 아래·어깨 위·팔 뻗은 상태에서 드는 작업" },
  { no: 10, short: "4.5 kg 이상 분당 2회↑ 2시간 이상",      desc: "하루에 총 2시간 이상, 분당 2회 이상 4.5 kg 이상의 물체를 드는 작업" },
  { no: 11, short: "손·무릎 충격 작업 2시간 이상 (시간당 10회↑)", desc: "하루에 총 2시간 이상 시간당 10회 이상 손 또는 무릎을 사용하여 반복적으로 충격을 가하는 작업" },
] as const;

function calcRiskFromChecklist(checked: number[]): string {
  if (checked.length >= 3) return "높음";
  if (checked.length >= 1) return "중간";
  return "낮음";
}

const RISK_LEVELS = ["높음", "중간", "낮음"];
// 2단계 워크플로우 상태 세분화
const STATUS_OPTIONS = [
  "진행중",
  "유해요인조사 완료",
  "증상조사 대기",
  "증상조사 진행중",
  "조사완료(증상없음)",
  "종결",
  "보류",
];
// 수동 편집 가능한 상태만 (자동 전이 상태 제외)
const STATUS_MANUAL_OPTIONS = ["진행중", "유해요인조사 완료", "보류"];

const DRAFT_KEY = "musculoskeletal_draft";

const BODY_PARTS = [
  { key: "neck",     label: "목" },
  { key: "shoulder", label: "어깨" },
  { key: "elbow",    label: "팔꿈치" },
  { key: "wrist",    label: "손목·손" },
  { key: "back",     label: "허리" },
  { key: "leg",      label: "다리·발" },
] as const;

const FREQUENCY_OPTIONS = ["가끔(월 1회 미만)", "자주(월 1회~주 1회)", "항상(주 1회 이상)"];
const DURATION_OPTIONS  = ["1주일 미만", "1주~1개월", "1개월~3개월", "3개월 이상"];
const INTENSITY_LABELS  = ["","약함","약간","보통","심함","매우심함"];
const INTERFERENCE_OPTIONS = ["없음","약간 지장","심한 지장"];

function getRiskBadgeClass(level: string) {
  switch (level) {
    case "높음": return "bg-red-600 text-white dark:bg-red-700";
    case "중간": return "bg-yellow-500 text-white dark:bg-yellow-600";
    case "낮음": return "bg-green-500 text-white dark:bg-green-600";
    default:     return "bg-gray-500 text-white dark:bg-gray-600";
  }
}
function getStatusBadgeClass(status: string) {
  switch (status) {
    case "종결":
    case "조사완료(증상없음)": return "bg-green-500 text-white dark:bg-green-600";
    case "유해요인조사 완료":  return "bg-cyan-600 text-white dark:bg-cyan-700";
    case "증상조사 대기":      return "bg-orange-500 text-white dark:bg-orange-600";
    case "증상조사 진행중":    return "bg-purple-600 text-white dark:bg-purple-700";
    case "보류":               return "bg-gray-500 text-white dark:bg-gray-600";
    default:                   return "bg-blue-500 text-white dark:bg-blue-600";
  }
}

interface FormState {
  department: string;
  task: string;
  hazardFactor: string;
  riskLevel: string;
  currentMeasures: string;
  improvementPlan: string;
  assessmentDate: string;
  assessor: string;
  status: string;
  burdenWorkChecklist: number[];
  // 2단계 스크리닝
  hasSymptoms: boolean | null;   // null = 미선택
  symptomWorkers: string[];      // 증상 호소 근로자 명단
}
const defaultForm = (): FormState => ({
  department: "",
  task: "",
  hazardFactor: "",
  riskLevel: "중간",
  currentMeasures: "",
  improvementPlan: "",
  assessmentDate: format(new Date(), "yyyy-MM-dd"),
  assessor: "",
  status: "진행중",
  burdenWorkChecklist: [],
  hasSymptoms: null,
  symptomWorkers: [],
});

interface BulkRow {
  department: string;
  task: string;
  hazardFactor: string;
  riskLevel: string;
  assessor: string;
  assessmentDate: string;
}
const defaultBulkRow = (): BulkRow => ({
  department: "",
  task: "",
  hazardFactor: "",
  riskLevel: "중간",
  assessor: "",
  assessmentDate: format(new Date(), "yyyy-MM-dd"),
});

function parseChecklist(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

export default function MusculoskeletalDisease() {
  const { headquarters, departments: DEPARTMENTS } = useHeadquarters();
  const { canEditMusculoskeletal } = usePermissions();
  const canEdit = canEditMusculoskeletal;
  const { user } = useAuth();
  const isOwner = (createdBy?: string | null) =>
    !createdBy || user?.role === "admin" || user?.username === createdBy;
  const { toast } = useToast();

  // ── 메인 상태 ────────────────────────────────────────────────────────
  const [showForm, setShowForm]       = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [form, setForm]               = useState<FormState>(defaultForm());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── 새 기능 상태 ─────────────────────────────────────────────────────
  const [checklistOpen, setChecklistOpen] = useState(true);
  const [hasDraft, setHasDraft]           = useState(false);
  const [showLoadPrev, setShowLoadPrev]   = useState(false);
  const [showBulk, setShowBulk]           = useState(false);
  const [bulkRows, setBulkRows]           = useState<BulkRow[]>([defaultBulkRow()]);
  const [riskManual, setRiskManual]       = useState(false);

  // ── Stage 2: 데이터 관리 상태 ─────────────────────────────────────────
  const [showImport, setShowImport]       = useState(false);
  const [importFile, setImportFile]       = useState<File | null>(null);
  const [importPending, setImportPending] = useState(false);
  const [historyId, setHistoryId]         = useState<number | null>(null);
  const [groupView, setGroupView]         = useState(false);
  const [groupBy, setGroupBy]             = useState<"dept" | "year">("dept");
  const [attachUploadId, setAttachUploadId] = useState<number | null>(null);
  const importFileRef = useRef<HTMLInputElement>(null);
  const attachFileRef = useRef<HTMLInputElement>(null);

  // ── 필터/정렬 ────────────────────────────────────────────────────────
  const [filterRisk,   setFilterRisk]   = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "risk" | "dept">("date");

  // ── API ──────────────────────────────────────────────────────────────
  const { data: assessments, isLoading } = useQuery<MusculoskeletalAssessment[]>({
    queryKey: ["/api/musculoskeletal-assessments", headquarters],
    queryFn: () =>
      fetch(`/api/musculoskeletal-assessments?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" })
        .then(r => r.json()),
  });

  // ── 증상조사표 (2단계) ────────────────────────────────────────────────
  const [surveyAssessmentId, setSurveyAssessmentId] = useState<number | null>(null);

  const { data: pendingCount } = useQuery<{ count: number }>({
    queryKey: ["/api/musculoskeletal-assessments/pending-symptom-count", headquarters],
    queryFn: () => fetch(`/api/musculoskeletal-assessments/pending-symptom-count?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: surveyList, isLoading: surveysLoading } = useQuery<any[]>({
    queryKey: ["/api/musculoskeletal-assessments", surveyAssessmentId, "symptom-surveys"],
    queryFn: () => fetch(`/api/musculoskeletal-assessments/${surveyAssessmentId}/symptom-surveys`, { credentials: "include" }).then(r => r.json()),
    enabled: surveyAssessmentId !== null,
  });

  // 증상조사 다이얼로그 내부 상태
  const [surveyEditingId, setSurveyEditingId] = useState<number | null>(null);
  const [surveyForm, setSurveyForm] = useState<Record<string, any>>({
    workerName: "", workerDept: "", surveyDate: new Date().toISOString().split("T")[0],
    // 신체부위별 필드 초기값
    ...Object.fromEntries(BODY_PARTS.flatMap(bp => [
      [`${bp.key}Pain`, false], [`${bp.key}Intensity`, 0],
      [`${bp.key}Frequency`, ""], [`${bp.key}Duration`, ""], [`${bp.key}Interference`, ""],
    ])),
    workRelated: "", notes: "", completed: false,
  });
  const resetSurveyForm = () => {
    setSurveyEditingId(null);
    setSurveyForm({
      workerName: "", workerDept: "", surveyDate: new Date().toISOString().split("T")[0],
      ...Object.fromEntries(BODY_PARTS.flatMap(bp => [
        [`${bp.key}Pain`, false], [`${bp.key}Intensity`, 0],
        [`${bp.key}Frequency`, ""], [`${bp.key}Duration`, ""], [`${bp.key}Interference`, ""],
      ])),
      workRelated: "", notes: "", completed: false,
    });
  };

  const createSurveyMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      fetch(`/api/musculoskeletal-assessments/${surveyAssessmentId}/symptom-surveys`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments", surveyAssessmentId, "symptom-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments/pending-symptom-count"] });
      resetSurveyForm();
      toast({ title: "증상조사표가 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "등록에 실패했습니다." }),
  });

  const updateSurveyMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, any> }) =>
      fetch(`/api/symptom-surveys/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments", surveyAssessmentId, "symptom-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments/pending-symptom-count"] });
      resetSurveyForm();
      toast({ title: "증상조사표가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정에 실패했습니다." }),
  });

  const deleteSurveyMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/symptom-surveys/${id}`, { method: "DELETE", credentials: "include" })
        .then(async r => { if (!r.ok) throw new Error(await r.text()); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments", surveyAssessmentId, "symptom-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments/pending-symptom-count"] });
      toast({ title: "증상조사표가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제에 실패했습니다." }),
  });

  const handleSurveyEdit = (s: any) => {
    setSurveyEditingId(s.id);
    setSurveyForm({ ...s });
  };

  const handleSurveySubmit = () => {
    if (!surveyForm.workerName) {
      toast({ variant: "destructive", title: "근로자명을 입력하세요." });
      return;
    }
    if (surveyEditingId) {
      updateSurveyMutation.mutate({ id: surveyEditingId, data: surveyForm });
    } else {
      createSurveyMutation.mutate(surveyForm);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: FormState) =>
      apiRequest("POST", "/api/musculoskeletal-assessments", {
        ...data,
        headquarters,
        burdenWorkChecklist: JSON.stringify(data.burdenWorkChecklist),
        symptomWorkers: JSON.stringify(data.symptomWorkers),
        // hasSymptoms null → false(저장 전 미선택)
        hasSymptoms: data.hasSymptoms ?? false,
      } as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      clearDraft();
      resetForm();
      toast({ title: "근골격계 유해요인조사가 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "등록 실패" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormState }) =>
      apiRequest("PUT", `/api/musculoskeletal-assessments/${id}`, {
        ...data,
        burdenWorkChecklist: JSON.stringify(data.burdenWorkChecklist),
        symptomWorkers: JSON.stringify(data.symptomWorkers),
        hasSymptoms: data.hasSymptoms ?? false,
      } as unknown as Record<string, unknown>),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      resetForm();
      toast({ title: "근골격계 유해요인조사가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정 실패" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/musculoskeletal-assessments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      toast({ title: "근골격계 유해요인조사가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids: number[]) =>
      apiRequest("POST", "/api/musculoskeletal-assessments/bulk-delete", { ids }),
    onSuccess: async (res) => {
      const data = await (res as any).json();
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      setSelectedIds(new Set()); setSelectionMode(false);
      toast({ title: `${data.deleted}건 삭제 완료` });
    },
    onError: () => toast({ variant: "destructive", title: "삭제 실패" }),
  });

  // ── Stage 2: 변경이력 쿼리 ──────────────────────────────────────────
  const { data: historyData, isLoading: historyLoading } = useQuery<any[]>({
    queryKey: ["/api/musculoskeletal-assessments", historyId, "history"],
    queryFn: () =>
      fetch(`/api/musculoskeletal-assessments/${historyId}/history`, { credentials: "include" })
        .then(r => r.json()),
    enabled: historyId !== null,
  });

  // ── Stage 2: 엑셀 임포트 ────────────────────────────────────────────
  async function handleImport() {
    if (!importFile) return;
    setImportPending(true);
    try {
      const fd = new FormData();
      fd.append("file", importFile);
      const res = await fetch(
        `/api/musculoskeletal-assessments/import?headquarters=${encodeURIComponent(headquarters)}`,
        { method: "POST", body: fd, credentials: "include" }
      );
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      toast({ title: `${data.imported}건 임포트 완료 (오류 ${data.errors}건)` });
      setShowImport(false);
      setImportFile(null);
    } catch {
      toast({ variant: "destructive", title: "임포트 실패" });
    } finally {
      setImportPending(false);
    }
  }

  // ── Stage 2: 첨부파일 업로드 ─────────────────────────────────────────
  async function handleAttachUpload(id: number, files: FileList) {
    const fd = new FormData();
    Array.from(files).forEach(f => fd.append("files", f));
    try {
      const res = await fetch(`/api/musculoskeletal-assessments/${id}/attachments`,
        { method: "POST", body: fd, credentials: "include" });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      toast({ title: "첨부파일이 업로드되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "업로드 실패" });
    }
  }

  async function handleAttachDelete(id: number, index: number) {
    try {
      await fetch(`/api/musculoskeletal-assessments/${id}/attachments/${index}`,
        { method: "DELETE", credentials: "include" });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      toast({ title: "첨부파일이 삭제되었습니다." });
    } catch {
      toast({ variant: "destructive", title: "삭제 실패" });
    }
  }

  // ── 임시저장 ─────────────────────────────────────────────────────────
  useEffect(() => {
    setHasDraft(!!localStorage.getItem(DRAFT_KEY));
  }, []);

  useEffect(() => {
    if (!editingId && showForm) {
      const hasContent =
        form.department || form.task || form.hazardFactor ||
        form.currentMeasures || form.assessor || form.burdenWorkChecklist.length > 0;
      if (hasContent) {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(form));
        setHasDraft(true);
      }
    }
  }, [form, editingId, showForm]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
    setHasDraft(false);
  }, []);

  const restoreDraft = useCallback(() => {
    const saved = localStorage.getItem(DRAFT_KEY);
    if (!saved) return;
    try { setForm(JSON.parse(saved)); } catch {}
  }, []);

  // ── 폼 helpers ────────────────────────────────────────────────────────
  const updateField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const toggleBurdenWork = (no: number) => {
    setForm(prev => {
      const checked = prev.burdenWorkChecklist.includes(no)
        ? prev.burdenWorkChecklist.filter(n => n !== no)
        : [...prev.burdenWorkChecklist, no].sort((a, b) => a - b);
      const newRisk = riskManual ? prev.riskLevel : calcRiskFromChecklist(checked);
      return { ...prev, burdenWorkChecklist: checked, riskLevel: newRisk };
    });
  };

  const resetForm = () => {
    setForm(defaultForm());
    setEditingId(null);
    setShowForm(false);
    setRiskManual(false);
  };

  const handleSubmit = () => {
    if (!form.department) {
      toast({ variant: "destructive", title: "부서를 선택하세요." });
      return;
    }
    // 스크리닝 질문에 답했을 때 상태 자동 전이
    let finalForm = { ...form };
    if (form.hasSymptoms === false) {
      // 증상 없음 → 종결
      finalForm.status = "조사완료(증상없음)";
    } else if (form.hasSymptoms === true) {
      // 증상 있음 → 증상조사 대기 (이미 증상조사가 진행된 경우는 유지)
      const currentStatus = form.status;
      if (!["증상조사 진행중", "종결"].includes(currentStatus)) {
        finalForm.status = "증상조사 대기";
      }
    }
    if (editingId) {
      updateMutation.mutate({ id: editingId, data: finalForm });
    } else {
      createMutation.mutate(finalForm);
    }
  };

  const handleEdit = (item: MusculoskeletalAssessment) => {
    const workers: string[] = (() => { try { return JSON.parse((item as any).symptomWorkers || "[]"); } catch { return []; } })();
    setForm({
      department:          item.department,
      task:                item.task,
      hazardFactor:        item.hazardFactor,
      riskLevel:           item.riskLevel,
      currentMeasures:     item.currentMeasures || "",
      improvementPlan:     item.improvementPlan || "",
      assessmentDate:      item.assessmentDate || format(new Date(), "yyyy-MM-dd"),
      assessor:            item.assessor || "",
      status:              item.status,
      burdenWorkChecklist: parseChecklist((item as any).burdenWorkChecklist),
      hasSymptoms:         (item as any).hasSymptoms ?? null,
      symptomWorkers:      workers,
    });
    setEditingId(item.id);
    setRiskManual(true);
    setShowForm(true);
  };

  const handleLoadPrevious = (item: MusculoskeletalAssessment) => {
    setForm({
      department:          item.department,
      task:                item.task,
      hazardFactor:        item.hazardFactor,
      riskLevel:           item.riskLevel,
      currentMeasures:     item.currentMeasures || "",
      improvementPlan:     item.improvementPlan || "",
      assessmentDate:      format(new Date(), "yyyy-MM-dd"),
      assessor:            item.assessor || "",
      status:              "진행중",
      burdenWorkChecklist: parseChecklist((item as any).burdenWorkChecklist),
      hasSymptoms:         null,
      symptomWorkers:      [],
    });
    setEditingId(null);
    setRiskManual(false);
    setShowLoadPrev(false);
  };

  const handleDelete = (id: number) => {
    if (confirm("이 유해요인조사를 삭제하시겠습니까?")) deleteMutation.mutate(id);
  };

  const toggleSelect = (id: number) =>
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── 자동완성 후보 ─────────────────────────────────────────────────────
  const taskSuggestions    = useMemo(() => [...new Set((assessments || []).map(a => a.task).filter(Boolean))], [assessments]);
  const assessorSuggestions = useMemo(() => [...new Set((assessments || []).map(a => a.assessor).filter(Boolean))], [assessments]);
  const hazardSuggestions  = useMemo(() => [...new Set((assessments || []).map(a => a.hazardFactor).filter(Boolean))], [assessments]);

  // ── 필터링·정렬 ───────────────────────────────────────────────────────
  const filteredAssessments = useMemo(() => {
    if (!assessments) return [];
    const riskOrder: Record<string, number> = { "높음": 0, "중간": 1, "낮음": 2 };
    let list = assessments.filter(a => {
      if (filterRisk !== "all" && a.riskLevel !== filterRisk) return false;
      if (filterStatus === "pending_symptom") {
        if (!["증상조사 대기", "증상조사 진행중"].includes(a.status)) return false;
      } else if (filterStatus !== "all" && a.status !== filterStatus) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          a.department.toLowerCase().includes(q) ||
          a.task.toLowerCase().includes(q) ||
          a.hazardFactor.toLowerCase().includes(q) ||
          (a.assessor && a.assessor.toLowerCase().includes(q))
        );
      }
      return true;
    });
    if (sortBy === "date") list = [...list].sort((a, b) => (b.assessmentDate || "").localeCompare(a.assessmentDate || ""));
    else if (sortBy === "risk") list = [...list].sort((a, b) => (riskOrder[a.riskLevel] ?? 3) - (riskOrder[b.riskLevel] ?? 3));
    else if (sortBy === "dept") list = [...list].sort((a, b) => a.department.localeCompare(b.department));
    return list;
  }, [assessments, searchQuery, filterRisk, filterStatus, sortBy]);

  // ── Stage 2: 그룹뷰 데이터 ──────────────────────────────────────────
  const groupedAssessments = useMemo(() => {
    const groups: Record<string, MusculoskeletalAssessment[]> = {};
    for (const item of filteredAssessments) {
      const key = groupBy === "dept"
        ? (item.department || "기타")
        : ((item.assessmentDate || "")?.slice(0, 4) || "연도미상");
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return groups;
  }, [filteredAssessments, groupBy]);

  const riskStats = useMemo(() => {
    if (!assessments || assessments.length === 0) return null;
    const counts = { "높음": 0, "중간": 0, "낮음": 0 };
    for (const a of assessments) {
      const lvl = a.riskLevel as keyof typeof counts;
      if (lvl in counts) counts[lvl]++;
    }
    return counts;
  }, [assessments]);

  // ── 일괄 등록 ─────────────────────────────────────────────────────────
  const [bulkPending, setBulkPending] = useState(false);
  const handleBulkSubmit = async () => {
    const validRows = bulkRows.filter(r => r.department && r.task && r.hazardFactor);
    if (validRows.length === 0) {
      toast({ variant: "destructive", title: "최소 1건 이상 필수항목을 입력하세요" });
      return;
    }
    setBulkPending(true);
    try {
      await Promise.all(validRows.map(r =>
        apiRequest("POST", "/api/musculoskeletal-assessments", {
          ...r, headquarters,
          currentMeasures: "", improvementPlan: "", status: "진행중",
          burdenWorkChecklist: "[]",
        } as unknown as Record<string, unknown>)
      ));
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      setShowBulk(false);
      setBulkRows([defaultBulkRow()]);
      toast({ title: `${validRows.length}건 일괄 등록되었습니다.` });
    } catch {
      toast({ variant: "destructive", title: "일괄 등록 실패" });
    } finally {
      setBulkPending(false);
    }
  };

  const validBulkCount = bulkRows.filter(r => r.department && r.task && r.hazardFactor).length;

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">

      {/* ─── 헤더 ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="bg-purple-100 p-2 sm:p-2.5 rounded-lg text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
            <Bone className="w-5 h-5 sm:w-6 sm:h-6 md:w-8 md:h-8" />
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl md:text-3xl font-display font-bold text-foreground" data-testid="text-page-title">
              근골격계질환 유해요인조사
            </h2>
            <p className="text-xs sm:text-sm text-muted-foreground">산업안전보건법 기준 부담작업 판정 및 유해요인 조사 관리</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {/* 엑셀 다운로드 */}
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => {
              const url = `/api/musculoskeletal-assessments/excel?headquarters=${encodeURIComponent(headquarters)}`;
              window.open(url, "_blank");
            }}
            data-testid="button-excel-download"
          >
            <FileDown className="w-4 h-4" />
            엑셀
          </Button>
          {canEdit && (
            <>
              {/* 엑셀 업로드 */}
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={() => setShowImport(true)}
                data-testid="button-excel-import"
              >
                <FileUp className="w-4 h-4" />
                가져오기
              </Button>
              {/* 그룹뷰 토글 */}
              <Button
                variant={groupView ? "default" : "outline"} size="sm" className="gap-1.5"
                onClick={() => setGroupView(v => !v)}
                data-testid="button-group-view"
              >
                {groupView ? <List className="w-4 h-4" /> : <LayoutGrid className="w-4 h-4" />}
                {groupView ? "목록" : "그룹"}
              </Button>
              <Button
                variant={selectionMode ? "default" : "outline"} size="sm"
                className={`gap-1.5 ${selectionMode ? "bg-red-500 hover:bg-red-600 text-white" : ""}`}
                onClick={() => { setSelectionMode(v => !v); setSelectedIds(new Set()); }}
                data-testid="button-toggle-selection"
              >
                <CheckSquare className="w-4 h-4" />
                {selectionMode ? "취소" : "선택"}
              </Button>
              <Button
                variant="outline" size="sm" className="gap-1.5"
                onClick={() => setShowBulk(true)}
                data-testid="button-bulk-add"
              >
                <Layers className="w-4 h-4" />
                일괄 등록
              </Button>
              <Button
                onClick={() => { setForm({ ...defaultForm(), department: user?.department || "" }); setEditingId(null); setRiskManual(false); setShowForm(true); }}
                className="bg-purple-600 text-white gap-2"
                data-testid="button-add-assessment"
              >
                <Plus className="w-4 h-4" />
                새 조사 등록
                {hasDraft && (
                  <span className="ml-1 w-2 h-2 rounded-full bg-yellow-300 inline-block" title="임시저장 있음" />
                )}
              </Button>
            </>
          )}
        </div>
      </div>

      {/* ─── 증상조사 대기 알림 배너 ─────────────────────────────── */}
      {(pendingCount?.count ?? 0) > 0 && (
        <div
          className="flex items-center gap-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg px-4 py-2.5 cursor-pointer hover:bg-orange-100 dark:hover:bg-orange-900/30 transition-colors"
          onClick={() => setFilterStatus("증상조사 대기")}
          data-testid="banner-pending-symptom"
        >
          <AlertTriangle className="w-4 h-4 text-orange-500 shrink-0" />
          <span className="text-sm font-medium text-orange-700 dark:text-orange-300">
            증상조사 대기 중인 건이 <strong>{pendingCount!.count}건</strong> 있습니다. 클릭해서 필터링하세요.
          </span>
        </div>
      )}

      {/* ─── 통계 배지 ─────────────────────────────────────────────── */}
      {riskStats && (
        <div className="flex flex-wrap gap-2 items-center">
          {(Object.entries(riskStats) as [string, number][]).map(([level, count]) => (
            <Badge
              key={level}
              className={`${getRiskBadgeClass(level)} no-default-hover-elevate no-default-active-elevate cursor-pointer`}
              onClick={() => setFilterRisk(filterRisk === level ? "all" : level)}
              data-testid={`stat-${level}`}
            >
              {level} {count}건{filterRisk === level ? " ✓" : ""}
            </Badge>
          ))}
          {assessments && (
            <Badge variant="outline" className="text-muted-foreground">
              전체 {assessments.length}건
            </Badge>
          )}
        </div>
      )}

      {/* ─── 검색·필터 ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
            placeholder="부서, 작업, 유해요인, 평가자..."
            className="pl-9" data-testid="input-search"
          />
        </div>
        <Select value={filterRisk} onValueChange={setFilterRisk}>
          <SelectTrigger className="w-28" data-testid="select-filter-risk">
            <SelectValue placeholder="위험수준" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 위험수준</SelectItem>
            {RISK_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36" data-testid="select-filter-status">
            <SelectValue placeholder="상태" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 상태</SelectItem>
            {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            <SelectItem value="pending_symptom">증상조사 대기+진행중</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortBy} onValueChange={v => setSortBy(v as "date" | "risk" | "dept")}>
          <SelectTrigger className="w-24" data-testid="select-sort">
            <SelectValue placeholder="정렬" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="date">날짜순</SelectItem>
            <SelectItem value="risk">위험도순</SelectItem>
            <SelectItem value="dept">부서순</SelectItem>
          </SelectContent>
        </Select>
        {(filterRisk !== "all" || filterStatus !== "all" || searchQuery) && (
          <Button variant="ghost" size="sm"
            onClick={() => { setFilterRisk("all"); setFilterStatus("all"); setSearchQuery(""); }}
          >
            <X className="w-3.5 h-3.5 mr-1" />초기화
          </Button>
        )}
      </div>

      {/* ─── 그룹뷰 / 테이블 토글 (필터 줄 오른쪽 추가) ─────────────── */}
      {groupView && filteredAssessments.length > 0 && (
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-muted-foreground">그룹 기준:</span>
          <Button size="sm" variant={groupBy === "dept" ? "default" : "outline"} className="h-7 text-xs"
            onClick={() => setGroupBy("dept")}>부서별</Button>
          <Button size="sm" variant={groupBy === "year" ? "default" : "outline"} className="h-7 text-xs"
            onClick={() => setGroupBy("year")}>연도별</Button>
        </div>
      )}

      {/* ─── 목록 (그룹뷰 또는 테이블) ────────────────────────────── */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">로딩 중...</div>
      ) : !filteredAssessments || filteredAssessments.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground" data-testid="text-empty">
            {(searchQuery || filterRisk !== "all" || filterStatus !== "all")
              ? "검색/필터 결과가 없습니다."
              : "등록된 유해요인조사가 없습니다."}
          </CardContent>
        </Card>
      ) : groupView ? (
        /* ─── 그룹카드뷰 ─────────────────────────────────────────── */
        <div className="space-y-4">
          {Object.entries(groupedAssessments).sort(([a], [b]) => a.localeCompare(b)).map(([groupKey, items]) => (
            <Card key={groupKey}>
              <div className="px-4 py-2.5 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-200 dark:border-purple-800 flex items-center justify-between">
                <span className="font-semibold text-purple-800 dark:text-purple-200 text-sm">
                  {groupKey}
                  <Badge className="ml-2 bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200 text-xs no-default-hover-elevate no-default-active-elevate">
                    {items.length}건
                  </Badge>
                </span>
                <div className="flex gap-1">
                  {(["높음","중간","낮음"] as const).map(lvl => {
                    const n = items.filter(i => i.riskLevel === lvl).length;
                    if (!n) return null;
                    return <Badge key={lvl} className={`${getRiskBadgeClass(lvl)} text-xs no-default-hover-elevate no-default-active-elevate`}>{lvl} {n}</Badge>;
                  })}
                </div>
              </div>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {items.map(item => {
                    const checklist = parseChecklist((item as any).burdenWorkChecklist);
                    const attachments: any[] = (item as any).attachments ? JSON.parse((item as any).attachments) : [];
                    return (
                      <div key={item.id} className="flex items-start gap-3 p-3 hover:bg-muted/30 transition-colors">
                        <Badge className={`${getRiskBadgeClass(item.riskLevel)} no-default-hover-elevate no-default-active-elevate text-xs shrink-0 mt-0.5`}>
                          {item.riskLevel}
                        </Badge>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{item.task}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {item.hazardFactor}
                            {item.assessor ? ` · ${item.assessor}` : ""}
                            {item.assessmentDate ? ` · ${item.assessmentDate}` : ""}
                            {checklist.length > 0 ? ` · ${checklist.map(n => `${n}호`).join(",")}` : ""}
                          </p>
                          {attachments.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1">
                              {attachments.map((att, i) => (
                                <a key={i} href={att.url} target="_blank" rel="noreferrer"
                                  className="text-xs flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline">
                                  <Paperclip className="w-3 h-3" />{att.name}
                                </a>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge className={`${getStatusBadgeClass(item.status)} no-default-hover-elevate no-default-active-elevate text-xs`}>{item.status}</Badge>
                          {canEdit && (
                            <>
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setHistoryId(item.id)} title="변경이력"
                                data-testid={`button-history-${item.id}`}>
                                <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                              </Button>
                              {isOwner(item.createdBy) && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => handleEdit(item)} data-testid={`button-edit-group-${item.id}`}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-7 w-7"
                                    onClick={() => handleDelete(item.id)} data-testid={`button-delete-group-${item.id}`}>
                                    <Trash2 className="w-3.5 h-3.5 text-red-500" />
                                  </Button>
                                </>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        /* ─── 기본 테이블뷰 ──────────────────────────────────────── */
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table data-testid="table-assessments">
              <TableHeader>
                <TableRow>
                  {selectionMode && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={filteredAssessments.length > 0 && filteredAssessments.every(a => selectedIds.has(a.id))}
                        onCheckedChange={() => {
                          const allSel = filteredAssessments.every(a => selectedIds.has(a.id));
                          setSelectedIds(allSel ? new Set() : new Set(filteredAssessments.map(a => a.id)));
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                  )}
                  <TableHead className="w-10">No</TableHead>
                  <TableHead className="min-w-[90px]">부서</TableHead>
                  <TableHead className="min-w-[120px]">작업내용</TableHead>
                  <TableHead className="min-w-[110px]">유해요인</TableHead>
                  <TableHead className="min-w-[80px]">부담작업</TableHead>
                  <TableHead className="w-20">위험수준</TableHead>
                  <TableHead className="min-w-[110px]">현재 조치사항</TableHead>
                  <TableHead className="min-w-[110px]">개선계획</TableHead>
                  <TableHead className="w-20">평가자</TableHead>
                  <TableHead className="w-24">평가일</TableHead>
                  <TableHead className="w-16">상태</TableHead>
                  <TableHead className="w-28">관리</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <AnimatePresence>
                  {filteredAssessments.map((item, idx) => {
                    const checklist = parseChecklist((item as any).burdenWorkChecklist);
                    const attachments: any[] = (() => { try { return JSON.parse((item as any).attachments || "[]"); } catch { return []; } })();
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className={`border-b border-border ${selectionMode ? "cursor-pointer" : ""} ${selectionMode && selectedIds.has(item.id) ? "bg-red-50 dark:bg-red-900/20" : ""}`}
                        onClick={() => selectionMode && toggleSelect(item.id)}
                        data-testid={`row-assessment-${item.id}`}
                      >
                        {selectionMode && (
                          <TableCell onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} data-testid={`checkbox-assessment-${item.id}`} />
                          </TableCell>
                        )}
                        <TableCell className="text-sm text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-sm">{item.department}</TableCell>
                        <TableCell className="text-sm font-medium">{item.task}</TableCell>
                        <TableCell className="text-sm">{item.hazardFactor}</TableCell>
                        <TableCell>
                          {checklist.length > 0 ? (
                            <span className="text-xs font-medium text-purple-700 dark:text-purple-300" title={checklist.map(n => `${n}호`).join(", ")}>
                              {checklist.map(n => `${n}호`).join(", ")}
                            </span>
                          ) : <span className="text-xs text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          <Badge className={`${getRiskBadgeClass(item.riskLevel)} no-default-hover-elevate no-default-active-elevate text-xs`} data-testid={`badge-risk-${item.id}`}>
                            {item.riskLevel}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate" title={item.currentMeasures || ""}>{item.currentMeasures || "-"}</TableCell>
                        <TableCell className="text-sm max-w-[120px] truncate" title={item.improvementPlan || ""}>{item.improvementPlan || "-"}</TableCell>
                        <TableCell className="text-sm">{item.assessor || "-"}</TableCell>
                        <TableCell className="text-sm">{item.assessmentDate || "-"}</TableCell>
                        <TableCell>
                          <Badge className={`${getStatusBadgeClass(item.status)} no-default-hover-elevate no-default-active-elevate text-xs`} data-testid={`badge-status-${item.id}`}>
                            {item.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-0.5 items-center" onClick={e => e.stopPropagation()}>
                            {/* 첨부파일 */}
                            {attachments.length > 0 && (
                              <span className="text-xs text-blue-500 flex items-center gap-0.5 mr-1" title={attachments.map((a:any)=>a.name).join(", ")}>
                                <Paperclip className="w-3 h-3" />{attachments.length}
                              </span>
                            )}
                            {/* 변경이력 */}
                            <Button variant="ghost" size="icon" className="h-7 w-7"
                              onClick={() => setHistoryId(item.id)} title="변경이력"
                              data-testid={`button-history-${item.id}`}>
                              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
                            </Button>
                            {/* 첨부파일 추가 (owner) */}
                            {/* 2단계 증상조사 버튼 — 증상조사 대기/진행중 상태일 때 강조 */}
                            {["증상조사 대기", "증상조사 진행중"].includes(item.status) && (
                              <Button
                                variant="ghost" size="sm"
                                className="h-7 text-xs px-2 text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20"
                                onClick={() => setSurveyAssessmentId(item.id)}
                                data-testid={`button-survey-${item.id}`}
                              >
                                <History className="w-3 h-3 mr-1" />증상조사
                              </Button>
                            )}
                            {canEdit && isOwner(item.createdBy) && (
                              <>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => { setAttachUploadId(item.id); attachFileRef.current?.click(); }}
                                  title="첨부파일 추가"
                                  data-testid={`button-attach-${item.id}`}>
                                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => handleEdit(item)} data-testid={`button-edit-${item.id}`}>
                                  <Pencil className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-7 w-7"
                                  onClick={() => handleDelete(item.id)} data-testid={`button-delete-${item.id}`}>
                                  <Trash2 className="w-4 h-4 text-red-500" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* 숨겨진 첨부파일 input */}
      <input
        ref={attachFileRef}
        type="file"
        multiple
        accept="image/*,application/pdf,.docx,.xlsx"
        className="hidden"
        onChange={e => {
          if (e.target.files && attachUploadId !== null) {
            handleAttachUpload(attachUploadId, e.target.files);
            e.target.value = "";
          }
        }}
      />

      {/* ─── 새 조사 등록 / 수정 다이얼로그 ───────────────────────── */}
      <Dialog open={showForm} onOpenChange={open => { if (!open) resetForm(); }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <DialogTitle data-testid="dialog-title">
                {editingId ? "유해요인조사 수정" : "새 유해요인조사 등록"}
              </DialogTitle>
              {!editingId && (
                <div className="flex gap-2">
                  {hasDraft && (
                    <Button
                      variant="outline" size="sm"
                      className="gap-1.5 text-yellow-600 border-yellow-400 dark:border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20"
                      onClick={restoreDraft} data-testid="button-restore-draft"
                    >
                      <Save className="w-3.5 h-3.5" />임시저장 불러오기
                    </Button>
                  )}
                  <Button
                    variant="outline" size="sm" className="gap-1.5"
                    onClick={() => setShowLoadPrev(true)} data-testid="button-load-prev"
                  >
                    <History className="w-3.5 h-3.5" />이전 조사 복사
                  </Button>
                </div>
              )}
            </div>
          </DialogHeader>

          {/* 부담작업 체크리스트 */}
          <Collapsible open={checklistOpen} onOpenChange={setChecklistOpen}>
            <CollapsibleTrigger asChild>
              <button
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm font-medium text-purple-800 dark:text-purple-200 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
                data-testid="button-toggle-checklist"
              >
                <span className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  법정 근골격계 부담작업 판정 체크리스트 (11호)
                  {form.burdenWorkChecklist.length > 0 && (
                    <Badge className="bg-purple-600 text-white text-xs py-0">
                      {form.burdenWorkChecklist.length}개 해당
                    </Badge>
                  )}
                </span>
                {checklistOpen ? <ChevronUp className="w-4 h-4 shrink-0" /> : <ChevronDown className="w-4 h-4 shrink-0" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <div className="mt-1.5 rounded-lg border border-purple-200 dark:border-purple-800 overflow-hidden">
                {BURDEN_WORKS.map((bw) => {
                  const checked = form.burdenWorkChecklist.includes(bw.no);
                  return (
                    <label
                      key={bw.no}
                      className={`flex items-start gap-3 px-3 py-2 cursor-pointer transition-colors border-b border-purple-100 dark:border-purple-900/60 last:border-0 ${checked ? "bg-purple-50 dark:bg-purple-900/30" : "hover:bg-gray-50 dark:hover:bg-gray-800/30"}`}
                      data-testid={`label-burden-${bw.no}`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleBurdenWork(bw.no)}
                        className="mt-1 shrink-0"
                        data-testid={`checkbox-burden-${bw.no}`}
                      />
                      {/* SVG 자세 일러스트 */}
                      <div className={`w-10 h-12 shrink-0 rounded p-0.5 ${checked ? "bg-purple-100 dark:bg-purple-800/40" : "bg-gray-100 dark:bg-gray-800/40"}`}>
                        {BURDEN_ICONS[bw.no - 1]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-xs font-bold text-purple-700 dark:text-purple-300 shrink-0">{bw.no}호</span>
                          <span className="text-xs font-medium text-foreground leading-relaxed">{bw.short}</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{bw.desc}</p>
                      </div>
                    </label>
                  );
                })}
                {/* 판정 요약 */}
                <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border-t border-purple-200 dark:border-purple-800 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-purple-800 dark:text-purple-200">
                    해당 항목: <strong>{form.burdenWorkChecklist.length}개</strong>
                    {form.burdenWorkChecklist.length > 0 && !riskManual && (
                      <span className="ml-2">→ 자동 위험수준: <strong>{calcRiskFromChecklist(form.burdenWorkChecklist)}</strong></span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">(3개↑=높음 / 1~2개=중간 / 0개=낮음)</span>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* 기본 정보 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                부서 *
                {form.department && !editingId && (
                  <span className="text-xs font-normal text-purple-600 dark:text-purple-400">(자동입력)</span>
                )}
              </Label>
              <Select value={form.department} onValueChange={v => updateField("department", v)}>
                <SelectTrigger data-testid="select-department" className="h-9">
                  <SelectValue placeholder="부서 선택" />
                </SelectTrigger>
                <SelectContent>
                  {DEPARTMENTS.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-sm flex items-center gap-1.5">
                위험수준 *
                {!riskManual && form.burdenWorkChecklist.length > 0 && (
                  <span className="text-xs font-normal text-purple-600 dark:text-purple-400">(자동 산출)</span>
                )}
              </Label>
              <div className="flex gap-1.5">
                <Select
                  value={form.riskLevel}
                  onValueChange={v => { updateField("riskLevel", v); setRiskManual(true); }}
                >
                  <SelectTrigger data-testid="select-risk-level" className="flex-1 h-9">
                    <SelectValue placeholder="위험수준 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {RISK_LEVELS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
                {riskManual && form.burdenWorkChecklist.length > 0 && (
                  <Button
                    variant="outline" size="sm" className="shrink-0 text-xs h-9"
                    onClick={() => { setRiskManual(false); updateField("riskLevel", calcRiskFromChecklist(form.burdenWorkChecklist)); }}
                  >자동</Button>
                )}
              </div>
            </div>

            {/* 평가자 / 평가일 / 상태 — 한 줄 */}
            <div className="sm:col-span-2 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm">평가자</Label>
                <Input
                  list="assessor-suggestions-list"
                  value={form.assessor}
                  onChange={e => updateField("assessor", e.target.value)}
                  placeholder="평가자 (자동완성)"
                  className="h-9"
                  data-testid="input-assessor"
                />
                <datalist id="assessor-suggestions-list">
                  {assessorSuggestions.map(s => <option key={s} value={s!} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">평가일</Label>
                <Input
                  type="date"
                  value={form.assessmentDate}
                  onChange={e => updateField("assessmentDate", e.target.value)}
                  className="h-9"
                  data-testid="input-assessment-date"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">상태</Label>
                <Select value={form.status} onValueChange={v => updateField("status", v)}>
                  <SelectTrigger data-testid="select-status" className="h-9">
                    <SelectValue placeholder="상태 선택" />
                  </SelectTrigger>
                  <SelectContent>
                    {/* 수동 편집 가능 상태만 표시 (나머지는 자동 전이) */}
                    {STATUS_MANUAL_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    {/* 자동 전이 상태도 수정 모드에서 현재 상태 유지를 위해 포함 */}
                    {!STATUS_MANUAL_OPTIONS.includes(form.status) && (
                      <SelectItem value={form.status}>{form.status}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* ── 1단계 완료 스크리닝 질문 ─────────────────────────────── */}
          <div className="border-t border-border pt-3 mt-1 space-y-3">
            <Label className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              1단계 완료 스크리닝 (선택)
            </Label>
            <p className="text-xs text-muted-foreground">
              해당 작업 근로자 중 근골격계 증상(통증·저림 등)을 호소하는 인원이 있습니까?
            </p>
            <div className="flex gap-2">
              <Button
                type="button" variant={form.hasSymptoms === false ? "default" : "outline"}
                className={`h-8 text-xs px-4 ${form.hasSymptoms === false ? "bg-green-600 text-white" : ""}`}
                onClick={() => updateField("hasSymptoms", false)}
                data-testid="button-no-symptoms"
              >
                아니오 (증상 없음 → 종결)
              </Button>
              <Button
                type="button" variant={form.hasSymptoms === true ? "default" : "outline"}
                className={`h-8 text-xs px-4 ${form.hasSymptoms === true ? "bg-orange-600 text-white" : ""}`}
                onClick={() => updateField("hasSymptoms", true)}
                data-testid="button-has-symptoms"
              >
                예 (증상 있음 → 2단계 진행)
              </Button>
              {form.hasSymptoms !== null && (
                <Button type="button" variant="ghost" className="h-8 text-xs"
                  onClick={() => updateField("hasSymptoms", null)}>
                  <X className="w-3.5 h-3.5 mr-1" />미선택
                </Button>
              )}
            </div>
            {/* 증상 있음: 근로자 명단 */}
            {form.hasSymptoms === true && (
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground">증상 호소 근로자 명단 (Enter로 추가)</Label>
                <div className="flex gap-2">
                  <Input
                    id="worker-input"
                    placeholder="근로자명 입력 후 Enter"
                    className="h-8 text-sm"
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        const val = (e.target as HTMLInputElement).value.trim();
                        if (val && !form.symptomWorkers.includes(val)) {
                          updateField("symptomWorkers", [...form.symptomWorkers, val]);
                          (e.target as HTMLInputElement).value = "";
                        }
                      }
                    }}
                    data-testid="input-worker-name"
                  />
                </div>
                {form.symptomWorkers.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {form.symptomWorkers.map((w, i) => (
                      <Badge key={i} className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200 text-xs no-default-hover-elevate no-default-active-elevate gap-1">
                        {w}
                        <button onClick={() => updateField("symptomWorkers", form.symptomWorkers.filter((_, j) => j !== i))}>
                          <X className="w-3 h-3" />
                        </button>
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* 미리보기 상태 전이 안내 */}
            {form.hasSymptoms !== null && (
              <p className="text-xs rounded px-2 py-1 bg-muted text-muted-foreground">
                {form.hasSymptoms === false
                  ? "저장 시 상태: 조사완료(증상없음) — 바로 종결됩니다."
                  : `저장 시 상태: 증상조사 대기 — ${form.symptomWorkers.length}명의 2단계 증상조사표 입력이 필요합니다.`}
              </p>
            )}
          </div>

          {/* ── 수정 모드일 때: 첨부파일 섹션 ─────────────────────── */}
          {editingId && (() => {
            const editingItem = (assessments || []).find(a => a.id === editingId);
            const attachments: { url: string; name: string; type?: string }[] = (() => {
              try { return JSON.parse((editingItem as any)?.attachments || "[]"); } catch { return []; }
            })();
            return (
              <div className="border-t border-border pt-3 mt-1">
                <div className="flex items-center justify-between mb-2">
                  <Label className="text-sm font-medium flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-muted-foreground" />
                    첨부파일
                    {attachments.length > 0 && (
                      <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 text-xs no-default-hover-elevate no-default-active-elevate ml-1">
                        {attachments.length}
                      </Badge>
                    )}
                  </Label>
                  <Button
                    variant="outline" size="sm" className="h-7 text-xs gap-1"
                    onClick={() => { setAttachUploadId(editingId); attachFileRef.current?.click(); }}
                    type="button"
                    data-testid="button-attach-in-form"
                  >
                    <Plus className="w-3 h-3" />추가
                  </Button>
                </div>
                {attachments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">첨부된 파일이 없습니다.</p>
                ) : (
                  <div className="space-y-1">
                    {attachments.map((att, i) => (
                      <div key={i} className="flex items-center gap-2 bg-muted/40 rounded px-2 py-1.5">
                        <Paperclip className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <a href={att.url} target="_blank" rel="noreferrer"
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex-1 truncate">
                          {att.name}
                        </a>
                        <Button
                          variant="ghost" size="icon" className="h-5 w-5 shrink-0"
                          onClick={() => handleAttachDelete(editingId, i)}
                          type="button"
                          data-testid={`button-detach-${i}`}
                        >
                          <X className="w-3 h-3 text-red-500" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })()}

          <DialogFooter className="gap-2 pt-2">
            {!editingId && (
              <Button
                variant="ghost" size="sm" className="mr-auto text-muted-foreground text-xs"
                onClick={() => { clearDraft(); toast({ title: "임시저장이 삭제되었습니다." }); }}
                disabled={!hasDraft}
                data-testid="button-clear-draft"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />임시저장 삭제
              </Button>
            )}
            <Button variant="outline" onClick={resetForm} data-testid="button-cancel">취소</Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
              className="bg-purple-600 text-white"
              data-testid="button-submit"
            >
              {editingId ? "수정" : "등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 이전 조사 불러오기 다이얼로그 ────────────────────────── */}
      <Dialog open={showLoadPrev} onOpenChange={setShowLoadPrev}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>이전 조사 복사해서 시작</DialogTitle>
            <DialogDescription>
              선택한 조사 내용을 새 조사의 기초 자료로 불러옵니다. (평가일은 오늘, 상태는 진행중으로 초기화됩니다)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 mt-2">
            {(assessments || []).slice(0, 30).map(item => {
              const checklist = parseChecklist((item as any).burdenWorkChecklist);
              return (
                <button
                  key={item.id}
                  className="w-full text-left flex items-start gap-3 p-3 rounded-lg border border-border hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors"
                  onClick={() => handleLoadPrevious(item)}
                  data-testid={`load-prev-${item.id}`}
                >
                  <Badge className={`${getRiskBadgeClass(item.riskLevel)} shrink-0 no-default-hover-elevate no-default-active-elevate text-xs`}>
                    {item.riskLevel}
                  </Badge>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.department} — {item.task}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {item.hazardFactor}
                      {item.assessor ? ` · ${item.assessor}` : ""}
                      {item.assessmentDate ? ` · ${item.assessmentDate}` : ""}
                      {checklist.length > 0 ? ` · 부담작업 ${checklist.map(n => `${n}호`).join(",")}` : ""}
                    </p>
                  </div>
                </button>
              );
            })}
            {(!assessments || assessments.length === 0) && (
              <p className="text-center text-muted-foreground py-8 text-sm">등록된 조사가 없습니다.</p>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── 일괄 등록 다이얼로그 ──────────────────────────────────── */}
      <Dialog open={showBulk} onOpenChange={setShowBulk}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>일괄 등록</DialogTitle>
            <DialogDescription>
              여러 근로자/작업을 한 번에 등록합니다. 부서·작업내용·유해요인이 입력된 행만 등록됩니다.
            </DialogDescription>
          </DialogHeader>

          {/* 공통 자동완성 datalist (다이얼로그 안에서도 공유) */}
          <datalist id="bulk-task-suggestions">
            {taskSuggestions.map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="bulk-hazard-suggestions">
            {hazardSuggestions.map(s => <option key={s} value={s} />)}
          </datalist>
          <datalist id="bulk-assessor-suggestions">
            {assessorSuggestions.map(s => <option key={s} value={s!} />)}
          </datalist>

          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-muted text-left">
                  <th className="p-2 border border-border font-medium w-8 text-center">#</th>
                  <th className="p-2 border border-border font-medium min-w-[130px]">부서 *</th>
                  <th className="p-2 border border-border font-medium min-w-[160px]">작업내용 *</th>
                  <th className="p-2 border border-border font-medium min-w-[150px]">유해요인 *</th>
                  <th className="p-2 border border-border font-medium w-24">위험수준</th>
                  <th className="p-2 border border-border font-medium min-w-[110px]">평가자</th>
                  <th className="p-2 border border-border font-medium w-32">평가일</th>
                  <th className="p-2 border border-border w-8"></th>
                </tr>
              </thead>
              <tbody>
                {bulkRows.map((row, i) => (
                  <tr key={i} className={i % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                    <td className="p-1 border border-border text-center text-xs text-muted-foreground">{i + 1}</td>
                    <td className="p-1 border border-border">
                      <select
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        value={row.department}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], department: e.target.value }; return n; })}
                      >
                        <option value="">선택</option>
                        {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </td>
                    <td className="p-1 border border-border">
                      <input
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        list="bulk-task-suggestions"
                        value={row.task}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], task: e.target.value }; return n; })}
                        placeholder="작업내용"
                      />
                    </td>
                    <td className="p-1 border border-border">
                      <input
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        list="bulk-hazard-suggestions"
                        value={row.hazardFactor}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], hazardFactor: e.target.value }; return n; })}
                        placeholder="유해요인"
                      />
                    </td>
                    <td className="p-1 border border-border">
                      <select
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        value={row.riskLevel}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], riskLevel: e.target.value }; return n; })}
                      >
                        {RISK_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                      </select>
                    </td>
                    <td className="p-1 border border-border">
                      <input
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        list="bulk-assessor-suggestions"
                        value={row.assessor}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], assessor: e.target.value }; return n; })}
                        placeholder="평가자"
                      />
                    </td>
                    <td className="p-1 border border-border">
                      <input
                        type="date"
                        className="w-full h-8 px-1.5 text-sm rounded border border-input bg-background focus:outline-none focus:ring-1 focus:ring-purple-500"
                        value={row.assessmentDate}
                        onChange={e => setBulkRows(prev => { const n = [...prev]; n[i] = { ...n[i], assessmentDate: e.target.value }; return n; })}
                      />
                    </td>
                    <td className="p-1 border border-border text-center">
                      <button
                        className="text-muted-foreground hover:text-red-500 transition-colors disabled:opacity-30"
                        onClick={() => setBulkRows(prev => prev.filter((_, j) => j !== i))}
                        disabled={bulkRows.length === 1}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 mt-1">
            <Button variant="outline" size="sm" className="gap-1.5"
              onClick={() => setBulkRows(prev => [...prev, defaultBulkRow()])}
              data-testid="button-add-bulk-row"
            >
              <Plus className="w-3.5 h-3.5" />행 추가
            </Button>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground"
              onClick={() => setBulkRows(prev => [...prev, ...Array.from({ length: 5 }, defaultBulkRow)])}
            >
              +5행
            </Button>
            <span className="ml-auto text-xs text-muted-foreground self-center">
              {validBulkCount > 0 ? `${validBulkCount}건 등록 예정` : "부서·작업내용·유해요인 입력 필요"}
            </span>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setShowBulk(false); setBulkRows([defaultBulkRow()]); }}>취소</Button>
            <Button
              className="bg-purple-600 text-white"
              onClick={handleBulkSubmit}
              disabled={bulkPending || validBulkCount === 0}
              data-testid="button-bulk-submit"
            >
              {bulkPending ? "등록 중..." : `${validBulkCount}건 일괄 등록`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 플로팅 벌크 삭제 바 ───────────────────────────────────── */}
      {selectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-background border border-border shadow-xl rounded-full px-5 py-3">
          <span className="text-sm font-semibold text-red-600">{selectedIds.size}건 선택됨</span>
          <div className="w-px h-5 bg-border" />
          <Button variant="ghost" size="sm" className="h-8" onClick={() => setSelectedIds(new Set())}>
            <X className="w-3.5 h-3.5 mr-1" />선택 해제
          </Button>
          <Button
            variant="destructive" size="sm" className="h-8"
            disabled={bulkDeleteMutation.isPending}
            onClick={() => {
              if (confirm(`선택한 ${selectedIds.size}건을 삭제하시겠습니까?`))
                bulkDeleteMutation.mutate(Array.from(selectedIds));
            }}
            data-testid="button-bulk-delete"
          >
            <Trash2 className="w-3.5 h-3.5 mr-1" />삭제
          </Button>
        </div>
      )}

      {/* ─── 엑셀 가져오기 다이얼로그 ───────────────────────────────── */}
      <Dialog open={showImport} onOpenChange={o => { if (!o) { setShowImport(false); setImportFile(null); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>엑셀 가져오기</DialogTitle>
            <DialogDescription>
              다운로드한 양식과 동일한 컬럼 구조의 xlsx 파일을 업로드하면 자동으로 등록됩니다.
              헤더 행(1번 행)은 건너뜁니다.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div
              className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/10 transition-colors"
              onClick={() => importFileRef.current?.click()}
            >
              <FileUp className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              {importFile ? (
                <p className="text-sm font-medium">{importFile.name}</p>
              ) : (
                <p className="text-sm text-muted-foreground">클릭하여 xlsx 파일 선택</p>
              )}
            </div>
            <input
              ref={importFileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={e => setImportFile(e.target.files?.[0] ?? null)}
            />
            <div className="text-xs text-muted-foreground bg-muted rounded-lg p-3 space-y-1">
              <p className="font-medium">필수 컬럼 (엑셀 헤더명):</p>
              <p>부서, 작업명, 유해요인, 위험수준, 현재 조치사항, 개선계획, 평가일, 평가자, 상태</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowImport(false); setImportFile(null); }}>취소</Button>
            <Button
              className="bg-purple-600 text-white"
              disabled={!importFile || importPending}
              onClick={handleImport}
              data-testid="button-import-submit"
            >
              {importPending ? "가져오는 중..." : "가져오기"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 2단계 증상조사표 다이얼로그 ────────────────────────────── */}
      <Dialog open={surveyAssessmentId !== null} onOpenChange={o => { if (!o) { setSurveyAssessmentId(null); resetSurveyForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              2단계 근로자별 증상조사표
            </DialogTitle>
            <DialogDescription>
              {(() => {
                const item = (assessments || []).find(a => a.id === surveyAssessmentId);
                return item ? `${item.department} — ${item.task}` : "";
              })()}
            </DialogDescription>
          </DialogHeader>

          {/* ── 이미 입력된 조사표 목록 ── */}
          {surveysLoading ? (
            <div className="py-4 text-center text-muted-foreground text-sm">로딩 중...</div>
          ) : (surveyList || []).length === 0 ? (
            <div className="py-4 text-center text-muted-foreground text-sm">아직 등록된 증상조사표가 없습니다.</div>
          ) : (
            <div className="space-y-2 mb-4">
              <Label className="text-sm font-semibold">등록된 조사표 ({surveyList!.length}건)</Label>
              {surveyList!.map((s: any) => {
                const painParts = BODY_PARTS.filter(bp => s[`${bp.key}Pain`]).map(bp => bp.label);
                return (
                  <div key={s.id} className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm ${s.completed ? "border-green-300 bg-green-50 dark:bg-green-900/10" : "border-border"}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{s.workerName}</span>
                      {s.workerDept && <span className="text-muted-foreground text-xs">({s.workerDept})</span>}
                      <span className="text-xs text-muted-foreground">{s.surveyDate}</span>
                      {painParts.length > 0 && (
                        <span className="text-xs text-orange-600">통증: {painParts.join(", ")}</span>
                      )}
                      {s.completed && (
                        <Badge className="bg-green-600 text-white text-xs no-default-hover-elevate no-default-active-elevate">완료</Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => handleSurveyEdit(s)} data-testid={`button-survey-edit-${s.id}`}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        onClick={() => { if (confirm("삭제하시겠습니까?")) deleteSurveyMutation.mutate(s.id); }}
                        data-testid={`button-survey-delete-${s.id}`}>
                        <Trash2 className="w-3.5 h-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ── 새 조사표 / 수정 폼 ── */}
          <div className="border-t border-border pt-4 space-y-4">
            <Label className="text-sm font-semibold">
              {surveyEditingId ? "조사표 수정" : "새 조사표 입력"}
            </Label>

            {/* 근로자 정보 */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">근로자명 *</Label>
                <Input value={surveyForm.workerName} onChange={e => setSurveyForm(f => ({ ...f, workerName: e.target.value }))}
                  className="h-8 text-sm" placeholder="이름" data-testid="input-survey-worker-name" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">소속부서</Label>
                <Input value={surveyForm.workerDept} onChange={e => setSurveyForm(f => ({ ...f, workerDept: e.target.value }))}
                  className="h-8 text-sm" placeholder="부서" data-testid="input-survey-worker-dept" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">조사일</Label>
                <Input type="date" value={surveyForm.surveyDate} onChange={e => setSurveyForm(f => ({ ...f, surveyDate: e.target.value }))}
                  className="h-8 text-sm" data-testid="input-survey-date" />
              </div>
            </div>

            {/* 신체부위별 증상 */}
            <div className="space-y-3">
              <Label className="text-xs font-medium text-muted-foreground">신체부위별 증상</Label>
              {BODY_PARTS.map(bp => (
                <div key={bp.key} className={`rounded-lg border p-3 space-y-2 transition-colors ${surveyForm[`${bp.key}Pain`] ? "border-orange-300 bg-orange-50/50 dark:bg-orange-900/10" : "border-border"}`}>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setSurveyForm(f => ({
                        ...f,
                        [`${bp.key}Pain`]: !f[`${bp.key}Pain`],
                        ...(!f[`${bp.key}Pain`] ? {} : { [`${bp.key}Intensity`]: 0, [`${bp.key}Frequency`]: "", [`${bp.key}Duration`]: "", [`${bp.key}Interference`]: "" }),
                      }))}
                      className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-colors ${surveyForm[`${bp.key}Pain`] ? "border-orange-500 bg-orange-500 text-white" : "border-border"}`}
                      data-testid={`checkbox-${bp.key}-pain`}
                    >
                      {surveyForm[`${bp.key}Pain`] && <span className="text-xs font-bold">✓</span>}
                    </button>
                    <span className="font-medium text-sm w-16">{bp.label}</span>
                    {!surveyForm[`${bp.key}Pain`] && (
                      <span className="text-xs text-muted-foreground">통증 없음</span>
                    )}
                  </div>
                  {surveyForm[`${bp.key}Pain`] && (
                    <div className="pl-11 grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {/* 통증 강도 1~5 */}
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">강도</Label>
                        <div className="flex gap-1">
                          {[1,2,3,4,5].map(n => (
                            <button key={n} type="button"
                              onClick={() => setSurveyForm(f => ({ ...f, [`${bp.key}Intensity`]: n }))}
                              className={`w-6 h-6 text-xs rounded border ${surveyForm[`${bp.key}Intensity`] === n ? "bg-orange-500 border-orange-500 text-white" : "border-border text-muted-foreground"}`}
                            >{n}</button>
                          ))}
                        </div>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">빈도</Label>
                        <Select value={surveyForm[`${bp.key}Frequency`]} onValueChange={v => setSurveyForm(f => ({ ...f, [`${bp.key}Frequency`]: v }))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                          <SelectContent>{FREQUENCY_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">지속기간</Label>
                        <Select value={surveyForm[`${bp.key}Duration`]} onValueChange={v => setSurveyForm(f => ({ ...f, [`${bp.key}Duration`]: v }))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                          <SelectContent>{DURATION_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">업무지장</Label>
                        <Select value={surveyForm[`${bp.key}Interference`]} onValueChange={v => setSurveyForm(f => ({ ...f, [`${bp.key}Interference`]: v }))}>
                          <SelectTrigger className="h-7 text-xs"><SelectValue placeholder="선택" /></SelectTrigger>
                          <SelectContent>{INTERFERENCE_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                        </Select>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* 업무관련성 + 비고 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">업무관련성 소견</Label>
                <Select value={surveyForm.workRelated} onValueChange={v => setSurveyForm(f => ({ ...f, workRelated: v }))}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-work-related"><SelectValue placeholder="선택" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="관련있음">관련있음</SelectItem>
                    <SelectItem value="관련없음">관련없음</SelectItem>
                    <SelectItem value="판단불가">판단불가</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">비고</Label>
                <Input value={surveyForm.notes || ""} onChange={e => setSurveyForm(f => ({ ...f, notes: e.target.value }))}
                  className="h-8 text-sm" placeholder="특이사항" data-testid="input-survey-notes" />
              </div>
            </div>

            {/* 조사 완료 여부 */}
            <div className="flex items-center gap-2">
              <button type="button"
                onClick={() => setSurveyForm(f => ({ ...f, completed: !f.completed }))}
                className={`w-8 h-8 rounded border-2 flex items-center justify-center transition-colors ${surveyForm.completed ? "border-green-500 bg-green-500 text-white" : "border-border"}`}
                data-testid="checkbox-survey-completed"
              >
                {surveyForm.completed && <span className="text-xs font-bold">✓</span>}
              </button>
              <Label className="text-sm cursor-pointer" onClick={() => setSurveyForm(f => ({ ...f, completed: !f.completed }))}>
                조사 완료 (모든 신체부위 확인 완료 시 체크)
              </Label>
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
            {surveyEditingId && (
              <Button variant="outline" onClick={resetSurveyForm} className="sm:mr-auto">
                취소
              </Button>
            )}
            <Button variant="outline" onClick={() => { setSurveyAssessmentId(null); resetSurveyForm(); }}>
              닫기
            </Button>
            <Button
              onClick={handleSurveySubmit}
              disabled={createSurveyMutation.isPending || updateSurveyMutation.isPending}
              data-testid="button-survey-submit"
            >
              {createSurveyMutation.isPending || updateSurveyMutation.isPending
                ? "저장 중..."
                : surveyEditingId ? "수정 저장" : "조사표 등록"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 변경이력 다이얼로그 ────────────────────────────────────── */}
      <Dialog open={historyId !== null} onOpenChange={o => { if (!o) setHistoryId(null); }}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600" />
              변경이력
            </DialogTitle>
            <DialogDescription>이 항목의 수정 이력입니다.</DialogDescription>
          </DialogHeader>
          {historyLoading ? (
            <div className="py-8 text-center text-muted-foreground text-sm">로딩 중...</div>
          ) : !historyData || historyData.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground text-sm">변경이력이 없습니다.</div>
          ) : (
            <div className="space-y-3 mt-2">
              {historyData.map((h: any, i: number) => {
                let changes: Record<string, { before: any; after: any }> = {};
                try { changes = JSON.parse(h.changes || "{}"); } catch {}
                return (
                  <div key={i} className="border border-border rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-foreground">
                        {h.changed_by || "알 수 없음"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {h.changed_at ? new Date(h.changed_at).toLocaleString("ko-KR") : "-"}
                      </span>
                    </div>
                    <div className="space-y-1">
                      {Object.entries(changes).map(([field, { before, after }]) => (
                        <div key={field} className="text-xs">
                          <span className="font-medium text-purple-700 dark:text-purple-300">{field}</span>
                          <span className="text-muted-foreground">: </span>
                          <span className="line-through text-red-500/70 mr-1">{String(before ?? "-")}</span>
                          <span className="text-green-600 dark:text-green-400">→ {String(after ?? "-")}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
