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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Bone, Plus, Trash2, Pencil, Search, CheckSquare, X,
  ChevronDown, ChevronUp, History, Save, AlertTriangle,
  FileDown, FileUp, Paperclip, Clock, LayoutGrid, List, Wrench, ImageIcon, CheckCircle2, QrCode, Settings,
  User, Briefcase, Activity, HeartPulse, Eye
} from "lucide-react";
import img1 from "@assets/image_1784166150891.png";
import img2 from "@assets/image_1784166156751.png";
import img3 from "@assets/image_1784166161213.png";
import img4 from "@assets/image_1784166165979.png";
import img5 from "@assets/image_1784166170155.png";
import img6 from "@assets/image_1784166174449.png";
import img7 from "@assets/image_1784166181439.png";
import img8 from "@assets/image_1784166185512.png";
import img9 from "@assets/image_1784166189177.png";
import img10 from "@assets/image_1784166192887.png";
import img11 from "@assets/image_1784166197700.png";
import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { usePermissions } from "@/hooks/use-permissions";
import { useAuth } from "@/hooks/use-auth";
import type { MusculoskeletalAssessment } from "@shared/schema";

// ── 부담작업 실제 이미지 (고시 삽화) ─────────────────────────────────────
const BURDEN_IMAGES = [img1, img2, img3, img4, img5, img6, img7, img8, img9, img10, img11];

// (레거시 placeholder - 실제 이미지로 교체됨)
const BURDEN_ICONS_UNUSED: React.ReactNode[] = [
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

// ── 증상조사표 I. 일반 문항 선택지 ──────────────────────────────────────────
const LEISURE_OPTS = ["게임 등 컴퓨터 관련 활동","피아노·악기 연주","뜨개질·붓글씨 등","테니스·축구·골프 등 스포츠","해당사항 없음"];
const HOUSEWORK_OPTS = ["거의 하지 않는다","1시간 미만","1~2시간 미만","2~3시간 미만","3시간 이상"];
const MEDICAL_CONDITIONS_HEALTH = ["류머티스 관절염","당뇨병","루프스병","통풍","알코올중독"];
const INJURY_PARTS_HEALTH = ["손/손가락/손목","팔/팔꿈치","어깨","목","허리","다리/발"];
const BURDEN_LEVELS_HEALTH = ["전혀 힘들지 않음","견딜만 함","약간 힘듦","힘듦","매우 힘듦"];

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
  "개선 대기",
  "조사완료(증상없음)",
  "종결",
  "보류",
];
// 수동 편집 가능한 상태만 (자동 전이 상태 제외)
const STATUS_MANUAL_OPTIONS = ["진행중", "유해요인조사 완료", "보류"];

const DRAFT_KEY = "musculoskeletal_draft";

const BODY_PARTS = [
  { key: "neck",     label: "목",             hasSide: false },
  { key: "shoulder", label: "어깨",           hasSide: true  },
  { key: "elbow",    label: "팔/팔꿈치",      hasSide: true  },
  { key: "wrist",    label: "손/손목/손가락", hasSide: true  },
  { key: "back",     label: "허리",           hasSide: false },
  { key: "leg",      label: "다리/발",        hasSide: true  },
] as const;

const DURATION_OPTS   = ["1일 미만","1일~1주일 미만","1주일~1달 미만","1달~6개월 미만","6개월 이상"];
const INTENSITY_OPTS  = ["약한 통증","중간 통증","심한 통증","매우 심한 통증"];
const FREQUENCY_OPTS  = ["6개월에 1번","2~3달에 1번","1달에 1번","1주일에 1번","매일"];
const TREATMENT_OPTS  = ["병원·한의원 치료","약국치료","병가·산재","작업 전환","해당사항 없음"];
const SIDE_OPTS       = ["오른쪽","왼쪽","양쪽 모두"];

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
    case "개선 대기":          return "bg-amber-600 text-white dark:bg-amber-700";
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
  currentWorkMethod: string;
  workCareer: string;
  maritalStatus: string;
  workerAge: string;
  workerGender: string;
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
  currentWorkMethod: "",
  workCareer: "",
  maritalStatus: "",
  workerAge: "",
  workerGender: "",
});

function parseChecklist(raw: string | null | undefined): number[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function InterviewSignaturePad({ onSave, onClear, padKey }: { onSave: (data: string) => void; onClear: () => void; padKey?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasContent, setHasContent] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = Math.max(rect.height, 100);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
  }, [padKey]);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    setHasContent(true);
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = getPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#1e293b";
    const { x, y } = getPos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const stopDraw = useCallback(() => setIsDrawing(false), []);

  const handleClear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#f9fafb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    setHasContent(false);
    onClear();
  };

  const handleSave = () => {
    const c = canvasRef.current;
    if (c && hasContent) onSave(c.toDataURL("image/png"));
  };

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        className="w-full h-24 border-2 border-dashed border-purple-300 rounded-lg touch-none cursor-crosshair bg-gray-50"
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={stopDraw} onMouseLeave={stopDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={stopDraw}
      />
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="flex-1 text-xs" onClick={handleClear}>지우기</Button>
        <Button type="button" size="sm" className="flex-1 bg-purple-600 hover:bg-purple-700 text-white text-xs" onClick={handleSave} disabled={!hasContent}>
          서명 완료
        </Button>
      </div>
    </div>
  );
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
  const [showQrDialog, setShowQrDialog] = useState(false);
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [form, setForm]               = useState<FormState>(defaultForm());
  const [searchQuery, setSearchQuery] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // ── 새 기능 상태 ─────────────────────────────────────────────────────
  const [showChecklist, setShowChecklist] = useState(false);
  const [hasDraft, setHasDraft]           = useState(false);
  const [showLoadPrev, setShowLoadPrev]   = useState(false);
  const [riskManual, setRiskManual]       = useState(false);

  // ── Stage 2: 데이터 관리 상태 ─────────────────────────────────────────
  const [historyId, setHistoryId]         = useState<number | null>(null);
  const [groupView, setGroupView]         = useState(false);
  const [groupBy, setGroupBy]             = useState<"dept" | "year">("dept");
  const [attachUploadId, setAttachUploadId] = useState<number | null>(null);
  const attachFileRef = useRef<HTMLInputElement>(null);

  // ── 1차 개선 상태 ─────────────────────────────────────────────────────
  const [improvementForm, setImprovementForm] = useState({
    postImprovementContent: "",
    postImprovementDueDate: "",
    postImprovementChecker: "",
  });

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

  const { data: dashStats } = useQuery<{
    totalSurveys: number; painSurveys: number; normalSurveys: number;
    totalInterviews: number; interviewedWorkers: number; painWithInterview: number;
  }>({
    queryKey: ["/api/musculoskeletal-assessments/dashboard-stats", headquarters],
    queryFn: () => fetch(`/api/musculoskeletal-assessments/dashboard-stats?headquarters=${encodeURIComponent(headquarters)}`, { credentials: "include" }).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: surveyList, isLoading: surveysLoading } = useQuery<any[]>({
    queryKey: ["/api/musculoskeletal-assessments", surveyAssessmentId, "symptom-surveys"],
    queryFn: () => fetch(`/api/musculoskeletal-assessments/${surveyAssessmentId}/symptom-surveys`, { credentials: "include" }).then(r => r.json()),
    enabled: surveyAssessmentId !== null,
  });

  // ── 사용자 목록 (근로자 선택용) ───────────────────────────────────────
  const { data: users } = useQuery<any[]>({
    queryKey: ["/api/users/names"],
    queryFn: () => fetch("/api/users/names", { credentials: "include" }).then(r => r.json()),
  });

  // ── 1차 개선 mutation ─────────────────────────────────────────────────
  const improvementMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      fetch(`/api/musculoskeletal-assessments/${id}/improvement`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      setImprovementForm({ postImprovementContent: "", postImprovementDueDate: "", postImprovementChecker: "" });
      toast({ title: "개선내용이 등록되었습니다. 조사가 종결 처리됩니다." });
    },
    onError: () => toast({ variant: "destructive", title: "개선 등록에 실패했습니다." }),
  });

  // 증상조사 다이얼로그 내부 상태
  const [surveyEditingId, setSurveyEditingId] = useState<number | null>(null);
  const defaultSurveyForm = () => ({
    hasPain: "" as string,
    bodyPartData: {} as Record<string, any>,
    q1Leisure: [] as string[],
    q2Housework: "",
    q3Medical: "",
    q3Conditions: [] as string[],
    q3Status: "",
    q4Injury: "",
    q4Parts: [] as string[],
    q5Burden: "",
  });
  const [surveyForm, setSurveyForm] = useState<Record<string, any>>(defaultSurveyForm());
  const resetSurveyForm = () => {
    setSurveyEditingId(null);
    setSurveyForm(defaultSurveyForm());
  };

  const [activeBpTab, setActiveBpTab] = useState<string | null>(null);
  const toggleBodyPart = (key: string) => {
    setSurveyForm(f => {
      const bpd = { ...(f.bodyPartData || {}) };
      if (bpd[key]) {
        delete bpd[key];
        // 삭제된 탭이 현재 활성이면 다른 남은 탭으로 이동
        setActiveBpTab(prev => {
          if (prev === key) {
            const remaining = Object.keys(bpd);
            return remaining.length > 0 ? remaining[0] : null;
          }
          return prev;
        });
      } else {
        bpd[key] = { treatments: [] };
        setActiveBpTab(key); // 새로 추가된 탭 자동 선택
      }
      return { ...f, bodyPartData: bpd };
    });
  };
  const getBpData = (key: string) => surveyForm.bodyPartData?.[key] || {};
  const setBpData = (key: string, update: Record<string, any>) => {
    setSurveyForm(f => ({
      ...f,
      bodyPartData: { ...f.bodyPartData, [key]: { ...(f.bodyPartData?.[key] || {}), ...update } },
    }));
  };

  const createSurveyMutation = useMutation({
    mutationFn: (data: Record<string, any>) =>
      fetch(`/api/musculoskeletal-assessments/${surveyAssessmentId}/symptom-surveys`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments", surveyAssessmentId, "symptom-surveys"] });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments/pending-symptom-count"] });
      resetSurveyForm();
      if (variables.hasPain === "예") {
        setSurveyAssessmentId(null);
        queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments/pending-interview-requests"] });
        setInterviewNotifDismissed(false);
        toast({ title: "면담요청이 접수되었습니다. 부서장에게 알림이 전송됩니다." });
      } else {
        toast({ title: "증상조사표가 등록되었습니다." });
      }
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
    const gh = (s.generalHealth && typeof s.generalHealth === "object") ? s.generalHealth : {};
    if (s.bodyPartData && typeof s.bodyPartData === "object" && Object.keys(s.bodyPartData).length > 0) {
      // 신형 포맷
      setSurveyForm({
        hasPain: s.hasPain || "예",
        bodyPartData: s.bodyPartData,
        q1Leisure: gh.q1Leisure || [],
        q2Housework: gh.q2Housework || "",
        q3Medical: gh.q3Medical || "",
        q3Conditions: gh.q3Conditions || [],
        q3Status: gh.q3Status || "",
        q4Injury: gh.q4Injury || "",
        q4Parts: gh.q4Parts || [],
        q5Burden: gh.q5Burden || "",
      });
    } else {
      // 구형 포맷 → 신형으로 변환
      const bodyPartData: Record<string, any> = {};
      BODY_PARTS.forEach(bp => {
        if (s[`${bp.key}Pain`]) {
          bodyPartData[bp.key] = {
            intensity: INTENSITY_OPTS[Math.max(0, (s[`${bp.key}Intensity`] || 1) - 1)] || "",
            frequency: s[`${bp.key}Frequency`] || "",
            duration: s[`${bp.key}Duration`] || "",
            pastWeek: "",
            treatments: [],
          };
        }
      });
      setSurveyForm({
        hasPain: Object.keys(bodyPartData).length > 0 ? "예" : (s.hasPain || ""),
        bodyPartData,
        q1Leisure: gh.q1Leisure || [],
        q2Housework: gh.q2Housework || "",
        q3Medical: gh.q3Medical || "",
        q3Conditions: gh.q3Conditions || [],
        q3Status: gh.q3Status || "",
        q4Injury: gh.q4Injury || "",
        q4Parts: gh.q4Parts || [],
        q5Burden: gh.q5Burden || "",
      });
    }
  };

  // ── 면담일지 (Interview Log) ─────────────────────────────────────────────
  const [interviewAssessmentId, setInterviewAssessmentId] = useState<number | null>(null);
  const [interviewEditingId, setInterviewEditingId] = useState<number | null>(null);
  const { data: interviewSurveys } = useQuery<any[]>({
    queryKey: ["/api/musculoskeletal-assessments", interviewAssessmentId, "symptom-surveys"],
    queryFn: () => fetch(`/api/musculoskeletal-assessments/${interviewAssessmentId}/symptom-surveys`, { credentials: "include" }).then(r => r.json()),
    enabled: interviewAssessmentId !== null,
  });

  // ── 증상조사표 미리보기 (부서장/관리자용) ──────────────────────────────
  const [previewAssessmentId, setPreviewAssessmentId] = useState<number | null>(null);
  const { data: previewSurveys, isLoading: previewLoading } = useQuery<any[]>({
    queryKey: ["/api/musculoskeletal-assessments", previewAssessmentId, "symptom-surveys"],
    queryFn: () => fetch(`/api/musculoskeletal-assessments/${previewAssessmentId}/symptom-surveys`, { credentials: "include" }).then(r => r.json()),
    enabled: previewAssessmentId !== null,
  });
  const { data: previewInterviews } = useQuery<any[]>({
    queryKey: ["/api/musculoskeletal-assessments", previewAssessmentId, "interviews"],
    queryFn: () => fetch(`/api/musculoskeletal-assessments/${previewAssessmentId}/interviews`, { credentials: "include" }).then(r => r.json()),
    enabled: previewAssessmentId !== null,
  });
  const [showPreviewInterviewForm, setShowPreviewInterviewForm] = useState(false);
  const [previewExpandedWorker, setPreviewExpandedWorker] = useState<string | null>(null);
  const initPreviewIntForm = () => ({ workerName: "", workerDept: "", workerPosition: "", assignedWork: "", interviewDate: new Date().toISOString().slice(0, 10), hazardDetails: "", mainSymptoms: "", discomfortIssues: "", improvementMeasures: "", requests: "", interviewerName: "" });
  const [previewIntForm, setPreviewIntForm] = useState(initPreviewIntForm);
  const [previewIntSignature, setPreviewIntSignature] = useState<string>("");
  const [sigPadKey, setSigPadKey] = useState(0);
  const createPreviewInterviewMutation = useMutation({
    mutationFn: (data: any) =>
      fetch(`/api/musculoskeletal-assessments/${previewAssessmentId}/interviews`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments", previewAssessmentId, "interviews"] });
      setShowPreviewInterviewForm(false);
      setPreviewIntForm(initPreviewIntForm());
      setPreviewIntSignature("");
      setSigPadKey(k => k + 1);
      toast({ title: "면담일지가 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "등록에 실패했습니다." }),
  });

  // ── 부서장 면담 알림 팝업 ──────────────────────────────────────────────
  const isDeptHead = user?.role === "deptHead" || user?.role === "admin";
  const [showInterviewNotif, setShowInterviewNotif] = useState(false);
  const [interviewNotifDismissed, setInterviewNotifDismissed] = useState(false);

  const { data: pendingInterviewRequests } = useQuery<any[]>({
    queryKey: ["/api/musculoskeletal-assessments/pending-interview-requests"],
    queryFn: () => fetch("/api/musculoskeletal-assessments/pending-interview-requests", { credentials: "include" }).then(r => r.json()),
    enabled: isDeptHead,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (isDeptHead && (pendingInterviewRequests?.length ?? 0) > 0 && !interviewNotifDismissed) {
      setShowInterviewNotif(true);
    }
  }, [isDeptHead, pendingInterviewRequests, interviewNotifDismissed]);

  const defaultInterviewForm = () => ({
    workerName: "", workerDept: "", workerPosition: "", assignedWork: "",
    interviewDate: new Date().toISOString().split("T")[0],
    hazardDetails: "", mainSymptoms: "", discomfortIssues: "",
    improvementMeasures: "", requests: "", interviewerName: "",
  });
  const [interviewForm, setInterviewForm] = useState<Record<string, string>>(defaultInterviewForm());
  const resetInterviewForm = () => { setInterviewEditingId(null); setInterviewForm(defaultInterviewForm()); };

  const { data: interviewList, isLoading: interviewsLoading } = useQuery<any[]>({
    queryKey: ["/api/musculoskeletal-assessments", interviewAssessmentId, "interviews"],
    queryFn: () => fetch(`/api/musculoskeletal-assessments/${interviewAssessmentId}/interviews`, { credentials: "include" }).then(r => r.json()),
    enabled: interviewAssessmentId !== null,
  });

  const createInterviewMutation = useMutation({
    mutationFn: (data: Record<string, string>) =>
      fetch(`/api/musculoskeletal-assessments/${interviewAssessmentId}/interviews`, {
        method: "POST", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments", interviewAssessmentId, "interviews"] });
      resetInterviewForm();
      toast({ title: "면담일지가 등록되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "등록에 실패했습니다." }),
  });

  const updateInterviewMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Record<string, string> }) =>
      fetch(`/api/musculoskeletal-interviews/${id}`, {
        method: "PUT", credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      }).then(async r => { if (!r.ok) throw new Error(await r.text()); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments", interviewAssessmentId, "interviews"] });
      resetInterviewForm();
      toast({ title: "면담일지가 수정되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "수정에 실패했습니다." }),
  });

  const deleteInterviewMutation = useMutation({
    mutationFn: (id: number) =>
      fetch(`/api/musculoskeletal-interviews/${id}`, { method: "DELETE", credentials: "include" })
        .then(async r => { if (!r.ok) throw new Error(await r.text()); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments", interviewAssessmentId, "interviews"] });
      toast({ title: "면담일지가 삭제되었습니다." });
    },
    onError: () => toast({ variant: "destructive", title: "삭제에 실패했습니다." }),
  });

  const handleInterviewSubmit = () => {
    if (!interviewForm.workerName.trim()) {
      toast({ variant: "destructive", title: "성명을 입력하세요." });
      return;
    }
    if (interviewEditingId) {
      updateInterviewMutation.mutate({ id: interviewEditingId, data: interviewForm });
    } else {
      createInterviewMutation.mutate(interviewForm);
    }
  };

  const handleSurveySubmit = () => {
    const bpd = surveyForm.bodyPartData || {};
    const payload = {
      hasPain: surveyForm.hasPain,
      bodyPartData: surveyForm.bodyPartData,
      // 기존 pain 불리언 컬럼 동기화 (목록 표시용)
      neckPain:     !!bpd.neck,
      shoulderPain: !!bpd.shoulder,
      elbowPain:    !!bpd.elbow,
      wristPain:    !!bpd.wrist,
      backPain:     !!bpd.back,
      legPain:      !!bpd.leg,
      // I. 일반 문항 저장
      generalHealth: {
        q1Leisure:    surveyForm.q1Leisure || [],
        q2Housework:  surveyForm.q2Housework || "",
        q3Medical:    surveyForm.q3Medical || "",
        q3Conditions: surveyForm.q3Conditions || [],
        q3Status:     surveyForm.q3Status || "",
        q4Injury:     surveyForm.q4Injury || "",
        q4Parts:      surveyForm.q4Parts || [],
        q5Burden:     surveyForm.q5Burden || "",
      },
    };
    if (surveyEditingId) {
      updateSurveyMutation.mutate({ id: surveyEditingId, data: payload });
    } else {
      createSurveyMutation.mutate(payload);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: FormState) =>
      apiRequest("POST", "/api/musculoskeletal-assessments", {
        ...data,
        headquarters,
        burdenWorkChecklist: JSON.stringify(data.burdenWorkChecklist),
      } as unknown as Record<string, unknown>).then(r => r.json()),
    onSuccess: async (response: any, variables: FormState) => {
      clearDraft();
      resetForm();
      toast({ title: "근골격계 유해요인조사가 등록되었습니다." });
      // 부담작업 항목이 있으면 목록 갱신 후 바로 증상조사표 입력으로 이동
      if (variables.burdenWorkChecklist.length > 0 && response?.id) {
        await queryClient.refetchQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
            setSurveyAssessmentId(response.id);
      } else {
        queryClient.invalidateQueries({ queryKey: ["/api/musculoskeletal-assessments"] });
      }
    },
    onError: () => toast({ variant: "destructive", title: "등록 실패" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: FormState }) =>
      apiRequest("PUT", `/api/musculoskeletal-assessments/${id}`, {
        ...data,
        burdenWorkChecklist: JSON.stringify(data.burdenWorkChecklist),
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
    setShowChecklist(false);
  };

  const handleSubmit = () => {
    if (!form.department) {
      toast({ variant: "destructive", title: "부서를 선택하세요." });
      return;
    }
    let finalForm = { ...form };
    if (!editingId) {
      // 신규 등록: 부담작업 체크항목이 있으면 자동으로 증상조사 대기
      if (finalForm.burdenWorkChecklist.length > 0) {
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
      currentWorkMethod:   (item as any).currentWorkMethod || "",
      workCareer:          (item as any).workCareer || "",
      maritalStatus:       (item as any).maritalStatus || "",
      workerAge:           (item as any).workerAge || "",
      workerGender:        (item as any).workerGender || "",
    });
    setEditingId(item.id);
    setRiskManual(true);
    setShowChecklist(true);
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
      currentWorkMethod:   (item as any).currentWorkMethod || "",
      workCareer:          (item as any).workCareer || "",
      maritalStatus:       (item as any).maritalStatus || "",
      workerAge:           (item as any).workerAge || "",
      workerGender:        (item as any).workerGender || "",
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
          {/* QR 등록링크 */}
          <Button
            variant="outline" size="sm" className="gap-1.5"
            onClick={() => setShowQrDialog(true)}
            data-testid="button-qr-link"
          >
            <QrCode className="w-4 h-4" />
            QR 등록링크
          </Button>
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

      {/* ─── 대시보드 통계 카드 ─────────────────────────────────────── */}
      {assessments && assessments.length > 0 && (() => {
        const total = assessments.length;
        const riskCounts = { "높음": 0, "중간": 0, "낮음": 0 };
        const statusCounts: Record<string, number> = {};
        const deptCounts: Record<string, number> = {};
        for (const a of assessments) {
          if (a.riskLevel in riskCounts) riskCounts[a.riskLevel as keyof typeof riskCounts]++;
          statusCounts[a.status] = (statusCounts[a.status] || 0) + 1;
          deptCounts[a.department] = (deptCounts[a.department] || 0) + 1;
        }
        const topDepts = Object.entries(deptCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        return (
          <div className="grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-5 gap-3">
            <Card className="border-purple-200 dark:border-purple-800">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-xs text-muted-foreground mb-1 font-medium">위험수준별</div>
                <div className="flex items-end gap-3 flex-wrap">
                  <div className="text-center">
                    <div className="text-xl font-bold text-red-600">{riskCounts["높음"]}</div>
                    <div className="text-[10px] text-red-500">높음</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-amber-500">{riskCounts["중간"]}</div>
                    <div className="text-[10px] text-amber-500">중간</div>
                  </div>
                  <div className="text-center">
                    <div className="text-xl font-bold text-green-600">{riskCounts["낮음"]}</div>
                    <div className="text-[10px] text-green-500">낮음</div>
                  </div>
                  <div className="ml-auto text-right">
                    <div className="text-2xl font-bold text-foreground">{total}</div>
                    <div className="text-[10px] text-muted-foreground">전체</div>
                  </div>
                </div>
                <div className="mt-2 flex gap-0.5 h-2 rounded-full overflow-hidden">
                  {riskCounts["높음"] > 0 && <div className="bg-red-500" style={{ width: `${(riskCounts["높음"] / total) * 100}%` }} />}
                  {riskCounts["중간"] > 0 && <div className="bg-amber-400" style={{ width: `${(riskCounts["중간"] / total) * 100}%` }} />}
                  {riskCounts["낮음"] > 0 && <div className="bg-green-500" style={{ width: `${(riskCounts["낮음"] / total) * 100}%` }} />}
                </div>
              </CardContent>
            </Card>

            <Card className="border-blue-200 dark:border-blue-800">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-xs text-muted-foreground mb-2 font-medium">진행 상태별</div>
                <div className="space-y-1">
                  {Object.entries(statusCounts).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([status, cnt]) => (
                    <div key={status} className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground w-20 truncate">{status}</div>
                      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(cnt / total) * 100}%` }} />
                      </div>
                      <div className="text-xs font-medium w-5 text-right">{cnt}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="border-green-200 dark:border-green-800">
              <CardContent className="pt-4 pb-3 px-4">
                <div className="text-xs text-muted-foreground mb-2 font-medium">부서별 상위 5개</div>
                <div className="space-y-1">
                  {topDepts.map(([dept, cnt]) => (
                    <div key={dept} className="flex items-center gap-2">
                      <div className="text-xs text-muted-foreground flex-1 truncate">{dept}</div>
                      <div className="flex-shrink-0 h-1.5 w-16 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full" style={{ width: `${(cnt / topDepts[0][1]) * 100}%` }} />
                      </div>
                      <div className="text-xs font-medium w-5 text-right">{cnt}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* 증상조사 현황 */}
            {dashStats && (
              <Card className="border-rose-200 dark:border-rose-800">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="text-xs text-muted-foreground mb-1 font-medium">증상조사 현황</div>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="text-center">
                      <div className="text-xl font-bold text-rose-600">{dashStats.painSurveys}</div>
                      <div className="text-[10px] text-rose-500">통증있음</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-emerald-600">{dashStats.normalSurveys}</div>
                      <div className="text-[10px] text-emerald-500">정상</div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-2xl font-bold text-foreground">{dashStats.totalSurveys}</div>
                      <div className="text-[10px] text-muted-foreground">전체</div>
                    </div>
                  </div>
                  <div className="mt-2 flex gap-0.5 h-2 rounded-full overflow-hidden bg-muted">
                    {dashStats.totalSurveys > 0 && dashStats.painSurveys > 0 && (
                      <div className="bg-rose-500 rounded-full transition-all" style={{ width: `${(dashStats.painSurveys / dashStats.totalSurveys) * 100}%` }} />
                    )}
                    {dashStats.totalSurveys > 0 && dashStats.normalSurveys > 0 && (
                      <div className="bg-emerald-500 rounded-full transition-all" style={{ width: `${(dashStats.normalSurveys / dashStats.totalSurveys) * 100}%` }} />
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 면담일지 현황 */}
            {dashStats && (
              <Card className="border-indigo-200 dark:border-indigo-800">
                <CardContent className="pt-4 pb-3 px-4">
                  <div className="text-xs text-muted-foreground mb-1 font-medium">면담일지 현황</div>
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="text-center">
                      <div className="text-xl font-bold text-indigo-600">{dashStats.totalInterviews}</div>
                      <div className="text-[10px] text-indigo-500">면담건수</div>
                    </div>
                    <div className="text-center">
                      <div className="text-xl font-bold text-slate-600">{dashStats.interviewedWorkers}</div>
                      <div className="text-[10px] text-slate-500">면담자수</div>
                    </div>
                    <div className="ml-auto text-right">
                      <div className="text-2xl font-bold text-foreground">
                        {dashStats.painSurveys > 0 ? Math.round((dashStats.painWithInterview / dashStats.painSurveys) * 100) : 0}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">통증자 면담율</div>
                    </div>
                  </div>
                  <div className="mt-2 h-2 rounded-full overflow-hidden bg-muted">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all"
                      style={{ width: `${dashStats.painSurveys > 0 ? (dashStats.painWithInterview / dashStats.painSurveys) * 100 : 0}%` }}
                    />
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        );
      })()}

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
        <Card className="overflow-hidden">
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm table-fixed" data-testid="table-assessments">
              <thead>
                <tr className="bg-muted/60 border-b border-border">
                  {selectionMode && (
                    <th className="w-10 px-3 py-3 text-left">
                      <Checkbox
                        checked={filteredAssessments.length > 0 && filteredAssessments.every(a => selectedIds.has(a.id))}
                        onCheckedChange={() => {
                          const allSel = filteredAssessments.every(a => selectedIds.has(a.id));
                          setSelectedIds(allSel ? new Set() : new Set(filteredAssessments.map(a => a.id)));
                        }}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                  )}
                  <th className="w-8 px-2 py-3 text-left text-xs font-semibold text-muted-foreground">No</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground w-20">부서</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground w-20">평가자</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground w-20">평가일</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground w-44">부담작업</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground w-16">위험수준</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground w-32">상태</th>
                  <th className="px-2 py-3 text-left text-xs font-semibold text-muted-foreground w-10">관리</th>
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const grouped: Record<string, typeof filteredAssessments> = {};
                  filteredAssessments.forEach(item => {
                    if (!grouped[item.department]) grouped[item.department] = [];
                    grouped[item.department].push(item);
                  });
                  const sortedDepts = Object.keys(grouped).sort((a, b) => a.localeCompare(b, 'ko'));
                  const colSpan = 8 + (selectionMode ? 1 : 0);
                  let globalIdx = 0;
                  return sortedDepts.flatMap(dept => [
                    <tr key={`dept-hdr-${dept}`}>
                      <td colSpan={colSpan} className="px-3 py-1.5 bg-purple-50/70 dark:bg-purple-900/10 border-y border-purple-100 dark:border-purple-900/30">
                        <span className="text-xs font-bold text-purple-800 dark:text-purple-200 flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-500 inline-block" />
                          {dept}
                          <span className="text-purple-500 font-normal">({grouped[dept].length}건)</span>
                        </span>
                      </td>
                    </tr>,
                    ...grouped[dept].map((item) => {
                    const idx = globalIdx++;
                    const checklist = parseChecklist((item as any).burdenWorkChecklist);
                    const attachments: any[] = (() => { try { return JSON.parse((item as any).attachments || "[]"); } catch { return []; } })();
                    const isPendingSymptom = ["증상조사 대기", "증상조사 진행중"].includes(item.status);
                    return (
                      <motion.tr
                        key={item.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        className={`border-b border-border/60 transition-colors hover:bg-muted/30 ${selectionMode ? "cursor-pointer" : ""} ${selectionMode && selectedIds.has(item.id) ? "bg-red-50 dark:bg-red-900/20" : ""} ${isPendingSymptom ? "bg-orange-50/40 dark:bg-orange-900/10" : ""}`}
                        onClick={() => selectionMode && toggleSelect(item.id)}
                        data-testid={`row-assessment-${item.id}`}
                      >
                        {selectionMode && (
                          <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                            <Checkbox checked={selectedIds.has(item.id)} onCheckedChange={() => toggleSelect(item.id)} data-testid={`checkbox-assessment-${item.id}`} />
                          </td>
                        )}
                        {/* No */}
                        <td className="px-2 py-3 text-xs text-muted-foreground font-mono">{idx + 1}</td>
                        {/* 부서 */}
                        <td className="px-2 py-3">
                          <span className="text-xs font-semibold text-foreground/80 bg-muted px-1.5 py-0.5 rounded-md whitespace-nowrap">{item.department}</span>
                        </td>
                        {/* 평가자 */}
                        <td className="px-2 py-3">
                          <span className="text-xs font-medium text-foreground line-clamp-1">{item.assessor || "-"}</span>
                        </td>
                        {/* 평가일 */}
                        <td className="px-2 py-3">
                          <span className="text-[11px] text-muted-foreground whitespace-nowrap">{item.assessmentDate || "-"}</span>
                        </td>
                        {/* 부담작업 */}
                        <td className="px-3 py-3">
                          {checklist.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {checklist.map(n => (
                                <span key={n} className="text-[10px] font-bold bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded-md border border-purple-200 dark:border-purple-700">
                                  {n}호
                                </span>
                              ))}
                            </div>
                          ) : <span className="text-xs text-muted-foreground">-</span>}
                        </td>
                        {/* 위험수준 */}
                        <td className="px-3 py-3">
                          <Badge className={`${getRiskBadgeClass(item.riskLevel)} no-default-hover-elevate no-default-active-elevate text-xs font-bold px-2.5 py-1 rounded-full`} data-testid={`badge-risk-${item.id}`}>
                            {item.riskLevel}
                          </Badge>
                        </td>
                        {/* 상태 */}
                        <td className="px-3 py-3" onClick={e => e.stopPropagation()}>
                          {isPendingSymptom ? (
                            <button
                              type="button"
                              onClick={() => { setSurveyForm(f => ({ ...f, workerName: item.assessor || "", workerDept: item.department || "" })); setSurveyAssessmentId(item.id); }}
                              data-testid={`button-survey-${item.id}`}
                              className="group relative flex flex-col items-start gap-1 w-full text-left focus:outline-none"
                            >
                              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1.5 rounded-lg whitespace-nowrap cursor-pointer transition-all shadow-sm
                                ${item.status === "증상조사 대기"
                                  ? "bg-orange-500 hover:bg-orange-600 text-white animate-pulse"
                                  : "bg-purple-600 hover:bg-purple-700 text-white"
                                }`}>
                                <History className="w-3 h-3 flex-shrink-0" />
                                {item.status === "증상조사 대기" ? "증상조사 입력" : "진행중 · 계속"}
                              </span>
                              <span className="text-[10px] text-orange-600 dark:text-orange-400 font-medium group-hover:underline">
                                클릭하여 작성 →
                              </span>
                            </button>
                          ) : (
                            <Badge className={`${getStatusBadgeClass(item.status)} no-default-hover-elevate no-default-active-elevate text-xs px-2 py-1 rounded-full whitespace-nowrap`} data-testid={`badge-status-${item.id}`}>
                              {item.status}
                            </Badge>
                          )}
                        </td>
                        {/* 관리 */}
                        <td className="px-2 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1">
                          {isDeptHead && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-purple-600 hover:text-purple-800 hover:bg-purple-50 dark:hover:bg-purple-900/30"
                              title="증상조사표 미리보기"
                              data-testid={`button-preview-${item.id}`}
                              onClick={() => setPreviewAssessmentId(item.id)}
                            >
                              <Eye className="w-4 h-4" />
                            </Button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 relative" data-testid={`button-manage-${item.id}`}>
                                <Settings className="w-4 h-4 text-muted-foreground" />
                                {attachments.length > 0 && (
                                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-blue-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                                    {attachments.length}
                                  </span>
                                )}
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-36">
                              <DropdownMenuItem onClick={() => setHistoryId(item.id)} data-testid={`menu-history-${item.id}`}>
                                <Clock className="w-3.5 h-3.5 mr-2" />변경이력
                              </DropdownMenuItem>
                              {canEdit && isOwner(item.createdBy) && (
                                <>
                                  <DropdownMenuItem onClick={() => { setAttachUploadId(item.id); attachFileRef.current?.click(); }} data-testid={`menu-attach-${item.id}`}>
                                    <Paperclip className="w-3.5 h-3.5 mr-2" />첨부파일
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleEdit(item)} data-testid={`menu-edit-${item.id}`}>
                                    <Pencil className="w-3.5 h-3.5 mr-2" />수정
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem onClick={() => handleDelete(item.id)} className="text-red-600 focus:text-red-600" data-testid={`menu-delete-${item.id}`}>
                                    <Trash2 className="w-3.5 h-3.5 mr-2" />삭제
                                  </DropdownMenuItem>
                                </>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })
                  ]);
                })()}
              </tbody>
            </table>
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
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
          {/* ── 모바일 QR폼과 동일한 상단 헤더 ─────────────────────── */}
          <div className="bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background px-6 pt-8 pb-5 border-b border-purple-100 dark:border-purple-900/30">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                <Bone className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold whitespace-pre-line leading-snug text-center" data-testid="dialog-title">
                  {editingId ? "유해요인조사 수정" : (!showChecklist ? "근골격계 유해요인조사\n기본정보 입력" : "근골격계 부담작업 조사")}
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {editingId ? "조사 내용을 수정합니다" : (!showChecklist ? "산업안전보건법에 따른 근골격계 유해요인조사" : "해당되는 부담작업을 모두 선택하세요")}
                </p>
              </div>
            </div>
            {!editingId && (
              <div className="mt-5 space-y-3">
                {/* 스텝바 - 모바일과 동일한 컴포넌트 */}
                <div className="flex items-center justify-center gap-0.5 sm:gap-2">
                  {([
                    { label: "기본정보", Icon: User },
                    { label: "부담작업", Icon: Briefcase },
                    { label: "증상조사", Icon: Activity },
                    { label: "등록완료", Icon: CheckCircle2 },
                  ] as { label: string; Icon: React.ComponentType<{ className?: string }> }[]).map((s, i) => {
                    const currentIdx = !showChecklist ? 0 : 1;
                    const isDone = i < currentIdx;
                    const isActive = i === currentIdx;
                    const Icon = s.Icon;
                    return (
                      <div key={s.label} className="flex items-center gap-0.5 sm:gap-2">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-colors ${isActive ? "bg-purple-600 text-white" : isDone ? "bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300" : "bg-muted text-muted-foreground"}`}>
                            {isDone ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                          </div>
                          <span className={`text-[9px] sm:text-[10px] font-medium ${isActive ? "text-purple-700 dark:text-purple-400" : "text-muted-foreground"}`}>{s.label}</span>
                        </div>
                        {i < 3 && <div className={`h-px w-4 sm:w-10 mb-3 transition-colors ${isDone ? "bg-purple-400" : "bg-border"}`} />}
                      </div>
                    );
                  })}
                </div>
                {/* 액션 버튼 */}
                <div className="flex justify-center gap-2">
                  {hasDraft && (
                    <Button variant="outline" size="sm" className="gap-1.5 text-yellow-600 border-yellow-400 dark:border-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-900/20" onClick={restoreDraft} data-testid="button-restore-draft">
                      <Save className="w-3.5 h-3.5" />임시저장 불러오기
                    </Button>
                  )}
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setShowLoadPrev(true)} data-testid="button-load-prev">
                    <History className="w-3.5 h-3.5" />이전 조사 복사
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div className="px-6 pb-6 pt-5 space-y-4">

          {/* ─── 기본 정보 (먼저) ─────────────────────────────────── */}
          <div className="rounded-xl border border-purple-100 dark:border-purple-900/50 bg-purple-50/40 dark:bg-purple-900/10 p-4 space-y-4">
            <p className="text-sm font-semibold text-purple-800 dark:text-purple-200 flex items-center gap-1.5">
              <span className="text-base">👤</span> Ⅰ. 기본 정보
            </p>

            {/* 성명(선택) / 연령 / 성별 — 3컬럼 (모바일 QR폼과 동일) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">성명 <span className="text-xs text-muted-foreground font-normal">(선택)</span></Label>
                <Input
                  list="assessor-suggestions-list"
                  value={form.assessor}
                  onChange={e => updateField("assessor", e.target.value)}
                  placeholder="홍길동"
                  className="h-9 bg-white dark:bg-background"
                  data-testid="input-assessor"
                />
                <datalist id="assessor-suggestions-list">
                  {assessorSuggestions.map(s => <option key={s} value={s!} />)}
                </datalist>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">연령</Label>
                <Input
                  value={form.workerAge}
                  onChange={e => updateField("workerAge", e.target.value)}
                  placeholder="만 ○○ 세"
                  className="h-9 bg-white dark:bg-background"
                  data-testid="input-worker-age"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">성별</Label>
                <div className="flex gap-2">
                  {["남", "여"].map(g => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => updateField("workerGender", form.workerGender === g ? "" : g)}
                      className={`flex-1 h-9 rounded-lg border text-sm font-medium transition-colors ${
                        form.workerGender === g
                          ? "bg-purple-600 text-white border-purple-600"
                          : "border-border bg-white dark:bg-background text-foreground hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      }`}
                      data-testid={`button-gender-${g}`}
                    >{g}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* 평가일 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-sm font-medium">평가일</Label>
                <Input
                  type="date"
                  value={form.assessmentDate}
                  onChange={e => updateField("assessmentDate", e.target.value)}
                  className="h-9 bg-white dark:bg-background"
                  data-testid="input-assessment-date"
                />
              </div>
            </div>

            {/* 작업부서 — 버튼 칩 그리드 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">
                작업부서 *
                {form.department && !editingId && (
                  <span className="ml-1.5 text-xs font-normal text-purple-600 dark:text-purple-400">(자동입력)</span>
                )}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {DEPARTMENTS.map(d => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => updateField("department", d)}
                    className={`w-full py-2 rounded-lg border text-sm font-medium transition-colors text-center ${
                      form.department === d
                        ? "bg-purple-600 text-white border-purple-600"
                        : "border-border bg-white dark:bg-background text-foreground hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    }`}
                    data-testid={`button-dept-${d}`}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </div>


            {/* 현재 작업 유형 — 버튼 2개 */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">현재 작업 유형</Label>
              <div className="flex gap-2">
                {["현장운용", "일반사무"].map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => updateField("currentWorkMethod", form.currentWorkMethod === opt ? "" : opt)}
                    className={`flex-1 h-10 rounded-lg border text-sm font-medium transition-colors ${
                      form.currentWorkMethod === opt
                        ? "bg-purple-600 text-white border-purple-600"
                        : "border-border bg-white dark:bg-background text-foreground hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    }`}
                    data-testid={`button-work-method-${opt}`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>

            {/* 현직장 경력 / 결혼여부 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-sm font-medium">현 직장 경력</Label>
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={50}
                    value={(() => { const m = (form.workCareer || "").match(/(\d+)년/); return m ? m[1] : "0"; })()}
                    onChange={e => {
                      const yrs = e.target.value;
                      const mos = (form.workCareer || "").match(/(\d+)개월/)?.[1] ?? "0";
                      updateField("workCareer", `${yrs}년 ${mos}개월`);
                    }}
                    className="w-16 h-9 text-center bg-white dark:bg-background"
                    data-testid="input-career-years"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">년</span>
                  <Input
                    type="number"
                    min={0}
                    max={11}
                    value={(() => { const m = (form.workCareer || "").match(/(\d+)개월/); return m ? m[1] : "0"; })()}
                    onChange={e => {
                      const mos = e.target.value;
                      const yrs = (form.workCareer || "").match(/(\d+)년/)?.[1] ?? "0";
                      updateField("workCareer", `${yrs}년 ${mos}개월`);
                    }}
                    className="w-16 h-9 text-center bg-white dark:bg-background"
                    data-testid="input-career-months"
                  />
                  <span className="text-sm text-muted-foreground shrink-0">개월</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium">결혼 여부</Label>
                <div className="flex gap-2">
                  {["기혼", "미혼"].map(opt => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => updateField("maritalStatus", form.maritalStatus === opt ? "" : opt)}
                      className={`flex-1 h-9 rounded-lg border text-sm font-medium transition-colors ${
                        form.maritalStatus === opt
                          ? "bg-purple-600 text-white border-purple-600"
                          : "border-border bg-white dark:bg-background text-foreground hover:bg-purple-50 dark:hover:bg-purple-900/20"
                      }`}
                      data-testid={`button-marital-${opt}`}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ─── 다음 버튼 → 체크리스트 ──────────────────────────── */}
          {!showChecklist ? (
            <div className="pt-1">
              <Button
                type="button"
                onClick={() => setShowChecklist(true)}
                className="w-full bg-purple-600 hover:bg-purple-700 text-white gap-2 h-12 text-base font-semibold"
                data-testid="button-next-to-checklist"
              >
                다음 — 부담작업 선택 &gt;
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800">
                <span className="flex items-center gap-2 text-sm font-medium text-purple-800 dark:text-purple-200">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  법정 근골격계 부담작업 판정 체크리스트 (11호)
                  {form.burdenWorkChecklist.length > 0 && (
                    <Badge className="bg-purple-600 text-white text-xs py-0">
                      {form.burdenWorkChecklist.length}개 해당
                    </Badge>
                  )}
                </span>
              </div>
              <div className="rounded-lg border border-purple-200 dark:border-purple-800 overflow-hidden">
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
                      <div className={`w-16 h-20 shrink-0 rounded p-0.5 ${checked ? "bg-purple-100 dark:bg-purple-800/40" : "bg-gray-100 dark:bg-gray-800/40"}`}>
                        <img src={BURDEN_IMAGES[bw.no - 1]} alt={`${bw.no}호`} className="w-full h-full object-contain" />
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
                <div className="px-3 py-2 bg-purple-50 dark:bg-purple-900/20 border-t border-purple-200 dark:border-purple-800 flex flex-wrap items-center gap-3">
                  <span className="text-xs text-purple-800 dark:text-purple-200">
                    해당 항목: <strong>{form.burdenWorkChecklist.length}개</strong>
                    {form.burdenWorkChecklist.length > 0 && (
                      <span className="ml-2">→ 판정: <strong>{calcRiskFromChecklist(form.burdenWorkChecklist)}</strong></span>
                    )}
                  </span>
                  <span className="text-xs text-muted-foreground">(3개↑=높음 / 1~2개=중간 / 0개=낮음)</span>
                </div>
              </div>
            </div>
          )}

          {/* 부담작업 체크 시 자동 안내 */}
          {!editingId && form.burdenWorkChecklist.length > 0 && (
            <div className="border-t border-border pt-3 mt-1">
              <p className="text-xs rounded px-2 py-1 bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border border-orange-200 dark:border-orange-800">
                ⚠ 부담작업 {form.burdenWorkChecklist.length}개 선택됨 — 저장 시 <strong>증상조사 대기</strong> 상태로 자동 등록됩니다.
              </p>
            </div>
          )}

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

          <DialogFooter className="gap-2 px-6 pb-6 pt-2">
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
          </div>
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

      {/* ─── 2단계 증상조사표 다이얼로그 ────────────────────────────── */}
      <Dialog open={surveyAssessmentId !== null} onOpenChange={o => { if (!o) { setSurveyAssessmentId(null); resetSurveyForm(); } }}>
        <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto p-0">
          {/* ── 모바일 QR폼과 동일한 상단 헤더 ─────────────────────── */}
          <div className="bg-gradient-to-b from-purple-50 to-white dark:from-purple-950/20 dark:to-background px-6 pt-8 pb-5 border-b border-purple-100 dark:border-purple-900/30">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-2xl bg-purple-100 dark:bg-purple-900/40 flex items-center justify-center">
                <Bone className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              </div>
              <div>
                <DialogTitle className="text-xl font-bold whitespace-pre-line leading-snug text-center">
                  근골격계질환 증상조사
                </DialogTitle>
                <p className="text-sm text-muted-foreground mt-1.5">
                  {(() => {
                    const item = (assessments || []).find(a => a.id === surveyAssessmentId);
                    return item ? `${item.department}${item.task ? ` — ${item.task}` : ""}` : "신체 부위별 통증 및 불편 증상을 기입해 주세요";
                  })()}
                </p>
              </div>
            </div>
            {/* 스텝바 - 증상조사 단계(index 2) 활성화 */}
            <div className="mt-5 flex items-center justify-center gap-0.5 sm:gap-2">
              {([
                { label: "기본정보", Icon: User },
                { label: "부담작업", Icon: Briefcase },
                { label: "증상조사", Icon: Activity },
                { label: "등록완료", Icon: CheckCircle2 },
              ] as { label: string; Icon: React.ComponentType<{ className?: string }> }[]).map((s, i) => {
                const isActive = i === 2;
                const isDone = i < 2;
                const Icon = s.Icon;
                return (
                  <div key={s.label} className="flex items-center gap-0.5 sm:gap-2">
                    <div className="flex flex-col items-center gap-1">
                      <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-colors ${isActive ? "bg-purple-600 text-white" : isDone ? "bg-purple-200 dark:bg-purple-800 text-purple-700 dark:text-purple-300" : "bg-muted text-muted-foreground"}`}>
                        {isDone ? <CheckCircle2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> : <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />}
                      </div>
                      <span className={`text-[9px] sm:text-[10px] font-medium ${isActive ? "text-purple-700 dark:text-purple-400" : "text-muted-foreground"}`}>{s.label}</span>
                    </div>
                    {i < 3 && <div className={`h-px w-4 sm:w-10 mb-3 transition-colors ${isDone ? "bg-purple-400" : "bg-border"}`} />}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="px-6 pb-6 pt-5 space-y-4">

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
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30"
                        onClick={() => {
                          setInterviewAssessmentId(surveyAssessmentId);
                          setInterviewForm(f => ({ ...f, workerName: s.workerName, workerDept: s.workerDept || "" }));
                        }}
                        data-testid={`button-interview-${s.id}`}>
                        면담일지
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

            {/* I. 일반 문항 */}
            <div className="bg-card rounded-2xl border shadow-sm p-4 space-y-4">
              <h2 className="font-semibold text-base flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <HeartPulse className="w-4 h-4" /> I. 일반 문항
              </h2>

              {/* Q1 */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">1. 규칙적인 여가·취미 활동 <span className="text-xs font-normal text-muted-foreground">(30분 이상, 주 2~3회↑ 기준, 중복 가능)</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {LEISURE_OPTS.map(opt => (
                    <button key={opt} type="button"
                      onClick={() => setSurveyForm(f => {
                        const cur: string[] = f.q1Leisure || [];
                        return { ...f, q1Leisure: cur.includes(opt) ? cur.filter((x: string) => x !== opt) : [...cur, opt] };
                      })}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium text-left transition-all ${(surveyForm.q1Leisure || []).includes(opt) ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                    >{opt}</button>
                  ))}
                </div>
              </div>

              <div className="border-t" />

              {/* Q2 */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">2. 하루 평균 가사노동 시간 <span className="text-xs font-normal text-muted-foreground">(밥·빨래·청소·영아 돌봄 등)</span></p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {HOUSEWORK_OPTS.map(opt => (
                    <button key={opt} type="button"
                      onClick={() => setSurveyForm(f => ({ ...f, q2Housework: opt }))}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium text-left transition-all ${surveyForm.q2Housework === opt ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                    >{opt}</button>
                  ))}
                </div>
              </div>

              <div className="border-t" />

              {/* Q3 */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">3. 의사 진단을 받은 질병이 있습니까?</p>
                <div className="flex gap-2">
                  {["아니오","예"].map(v => (
                    <button key={v} type="button"
                      onClick={() => setSurveyForm(f => ({ ...f, q3Medical: v, q3Conditions: [], q3Status: "" }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${surveyForm.q3Medical === v ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                    >{v}</button>
                  ))}
                </div>
                {surveyForm.q3Medical === "예" && (
                  <div className="pl-3 border-l-2 border-purple-300 space-y-2 mt-1">
                    <div className="grid grid-cols-2 gap-2">
                      {MEDICAL_CONDITIONS_HEALTH.map(opt => (
                        <button key={opt} type="button"
                          onClick={() => setSurveyForm(f => {
                            const cur: string[] = f.q3Conditions || [];
                            return { ...f, q3Conditions: cur.includes(opt) ? cur.filter((x: string) => x !== opt) : [...cur, opt] };
                          })}
                          className={`py-1.5 px-2 rounded-lg border text-xs font-medium text-left transition-all ${(surveyForm.q3Conditions || []).includes(opt) ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                        >{opt}</button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      {["완치","치료나 관찰 중"].map(s => (
                        <button key={s} type="button"
                          onClick={() => setSurveyForm(f => ({ ...f, q3Status: s }))}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition-all ${surveyForm.q3Status === s ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                        >{s}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t" />

              {/* Q4 */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">4. 과거 운동/사고로 부위를 다친 적이 있습니까?</p>
                <div className="flex gap-2">
                  {["아니오","예"].map(v => (
                    <button key={v} type="button"
                      onClick={() => setSurveyForm(f => ({ ...f, q4Injury: v, q4Parts: [] }))}
                      className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-all ${surveyForm.q4Injury === v ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                    >{v}</button>
                  ))}
                </div>
                {surveyForm.q4Injury === "예" && (
                  <div className="pl-3 border-l-2 border-purple-300 mt-1">
                    <div className="grid grid-cols-3 gap-2">
                      {INJURY_PARTS_HEALTH.map(opt => (
                        <button key={opt} type="button"
                          onClick={() => setSurveyForm(f => {
                            const cur: string[] = f.q4Parts || [];
                            return { ...f, q4Parts: cur.includes(opt) ? cur.filter((x: string) => x !== opt) : [...cur, opt] };
                          })}
                          className={`py-1.5 rounded-lg border text-xs font-medium transition-all ${(surveyForm.q4Parts || []).includes(opt) ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                        >{opt}</button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t" />

              {/* Q5 */}
              <div className="space-y-2">
                <p className="text-sm font-semibold">5. 현재 일의 육체적 부담 정도</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BURDEN_LEVELS_HEALTH.map(opt => (
                    <button key={opt} type="button"
                      onClick={() => setSurveyForm(f => ({ ...f, q5Burden: opt }))}
                      className={`py-2 px-3 rounded-lg border text-xs font-medium text-left transition-all ${surveyForm.q5Burden === opt ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                    >{opt}</button>
                  ))}
                </div>
              </div>
            </div>

            {/* II. 신체 부위별 증상조사 */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold flex items-center gap-1.5">
                <span className="text-purple-600">II.</span> 신체 부위별 증상조사
              </Label>

              {/* 통증 유무 */}
              <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 space-y-2">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">
                  지난 1년 동안 작업과 관련하여 통증·불편함(통증, 쑤시는 느낌, 뻣뻣함, 화끈거리는 느낌, 무감각, 찌릿찌릿함 등)을 느끼신 적이 있습니까?
                </p>
                <div className="flex gap-2">
                  {["예","아니오"].map(v => (
                    <button key={v} type="button"
                      onClick={() => setSurveyForm(f => ({ ...f, hasPain: v, ...(v === "아니오" ? { bodyPartData: {} } : {}) }))}
                      className={`flex-1 py-2 rounded-xl border text-sm font-semibold transition-all ${surveyForm.hasPain === v ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-amber-200 dark:border-amber-700 hover:border-purple-300 bg-white dark:bg-card"}`}
                      data-testid={`button-haspain-${v}`}
                    >{v}</button>
                  ))}
                </div>
              </div>

              {surveyForm.hasPain === "예" && (
                <div className="space-y-4">
                  {/* 부위 선택 */}
                  <div className="space-y-1.5">
                    <p className="text-xs text-muted-foreground">통증 있는 부위를 선택하세요 (중복 가능)</p>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {BODY_PARTS.map(bp => {
                        const sel = !!(surveyForm.bodyPartData || {})[bp.key];
                        return (
                          <button key={bp.key} type="button" onClick={() => toggleBodyPart(bp.key)}
                            className={`py-2 px-1 rounded-xl border text-xs font-bold text-center transition-all ${sel ? "border-purple-500 bg-purple-500 text-white shadow-sm" : "border-border hover:border-purple-300 hover:bg-purple-50/30"}`}
                            data-testid={`button-bodypart-${bp.key}`}
                          >{bp.label}</button>
                        );
                      })}
                    </div>
                  </div>

                  {/* 선택된 부위별 상세 — 탭 UI */}
                  {(() => {
                    const selectedParts = BODY_PARTS.filter(bp => (surveyForm.bodyPartData || {})[bp.key]);
                    if (selectedParts.length === 0) return null;
                    const currentTab = activeBpTab && (surveyForm.bodyPartData || {})[activeBpTab]
                      ? activeBpTab
                      : selectedParts[0]?.key;
                    const bp = BODY_PARTS.find(b => b.key === currentTab);
                    if (!bp) return null;
                    const bpData = getBpData(bp.key);
                    const treatments: string[] = bpData.treatments || [];
                    const n = bp.hasSide ? 1 : 0;
                    return (
                      <div className="space-y-0">
                        {/* 탭 헤더 */}
                        <div className="flex gap-1 flex-wrap">
                          {selectedParts.map(part => (
                            <button
                              key={part.key}
                              type="button"
                              onClick={() => setActiveBpTab(part.key)}
                              className={`px-3 py-1.5 text-xs font-semibold rounded-t-lg border-t border-x transition-all ${
                                currentTab === part.key
                                  ? "bg-purple-600 text-white border-purple-600"
                                  : "bg-muted/50 text-muted-foreground border-border hover:bg-muted"
                              }`}
                              data-testid={`tab-bodypart-${part.key}`}
                            >
                              {part.label}
                              {(() => {
                                const d = getBpData(part.key);
                                const filled = [d.duration, d.intensity, d.frequency, d.pastWeek].filter(Boolean).length;
                                return filled > 0 ? <span className="ml-1 opacity-70">✓</span> : null;
                              })()}
                            </button>
                          ))}
                        </div>
                        {/* 탭 콘텐츠 */}
                        <div className="rounded-b-xl rounded-tr-xl border border-purple-300 dark:border-purple-700 overflow-hidden">
                          <div className="bg-purple-50 dark:bg-purple-900/30 px-4 py-2 flex items-center justify-between">
                            <span className="text-sm font-bold text-purple-700 dark:text-purple-300">{bp.label} 부위 증상 상세</span>
                            <button type="button" onClick={() => toggleBodyPart(bp.key)} className="text-xs text-muted-foreground hover:text-destructive">
                              선택 해제
                            </button>
                          </div>
                          <div className="p-4 space-y-3.5">
                            {bp.hasSide && (
                              <div className="space-y-1.5">
                                <p className="text-xs font-semibold text-muted-foreground">1. 구체적 부위</p>
                                <div className="flex gap-2">
                                  {SIDE_OPTS.map(s => (
                                    <button key={s} type="button" onClick={() => setBpData(bp.key, { side: s })}
                                      className={`flex-1 py-1.5 text-xs rounded-lg border font-medium transition-all ${bpData.side === s ? "border-purple-500 bg-purple-500 text-white" : "border-border hover:border-purple-300"}`}
                                      data-testid={`button-side-${bp.key}-${s}`}
                                    >{s}</button>
                                  ))}
                                </div>
                              </div>
                            )}
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{n + 1}. 통증 지속 기간</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {DURATION_OPTS.map(d => (
                                  <button key={d} type="button" onClick={() => setBpData(bp.key, { duration: d })}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${bpData.duration === d ? "border-purple-500 bg-purple-500 text-white" : "border-border hover:border-purple-300"}`}
                                    data-testid={`button-duration-${bp.key}-${d}`}
                                  >{d}</button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{n + 2}. 통증 강도</p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {INTENSITY_OPTS.map(it => (
                                  <button key={it} type="button" onClick={() => setBpData(bp.key, { intensity: it })}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${bpData.intensity === it ? "border-purple-500 bg-purple-500 text-white" : "border-border hover:border-purple-300"}`}
                                    data-testid={`button-intensity-${bp.key}-${it}`}
                                  >{it}</button>
                                ))}
                              </div>
                              <div className="bg-muted/60 rounded-lg p-2 text-[10px] text-muted-foreground space-y-0.5">
                                <p>· 약한: 약간 불편하나 작업 집중 시 못 느낀다</p>
                                <p>· 중간: 통증 있으나 귀가 후 휴식하면 괜찮다</p>
                                <p>· 심한: 귀가 후에도 통증이 계속된다</p>
                                <p>· 매우 심한: 통증으로 일상생활이 어렵다</p>
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{n + 3}. 지난 1년간 경험 빈도</p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {FREQUENCY_OPTS.map(fr => (
                                  <button key={fr} type="button" onClick={() => setBpData(bp.key, { frequency: fr })}
                                    className={`py-1.5 text-xs rounded-lg border font-medium transition-all ${bpData.frequency === fr ? "border-purple-500 bg-purple-500 text-white" : "border-border hover:border-purple-300"}`}
                                    data-testid={`button-freq-${bp.key}-${fr}`}
                                  >{fr}</button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{n + 4}. 지난 1주일에도 증상이 있었습니까?</p>
                              <div className="flex gap-2">
                                {["예","아니오"].map(v => (
                                  <button key={v} type="button" onClick={() => setBpData(bp.key, { pastWeek: v })}
                                    className={`flex-1 py-1.5 text-xs rounded-lg border font-semibold transition-all ${bpData.pastWeek === v ? "border-purple-500 bg-purple-500 text-white" : "border-border hover:border-purple-300"}`}
                                    data-testid={`button-pastweek-${bp.key}-${v}`}
                                  >{v}</button>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-1.5">
                              <p className="text-xs font-semibold text-muted-foreground">{n + 5}. 지난 1년간 이 통증으로 어떤 일이 있었습니까? <span className="font-normal">(중복 가능)</span></p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {TREATMENT_OPTS.map(t => {
                                  const selected = treatments.includes(t);
                                  return (
                                    <button key={t} type="button"
                                      onClick={() => setBpData(bp.key, { treatments: selected ? treatments.filter(x => x !== t) : [...treatments, t] })}
                                      className={`text-left py-1.5 px-2 text-xs rounded-lg border font-medium transition-all ${selected ? "border-purple-500 bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" : "border-border hover:border-purple-300"}`}
                                      data-testid={`button-treatment-${bp.key}-${t}`}
                                    >
                                      <span className="flex items-center gap-1.5">
                                        <span className={`w-3 h-3 rounded flex-shrink-0 border ${selected ? "bg-purple-500 border-purple-500" : "border-muted-foreground/40"}`} />
                                        {t}
                                      </span>
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}
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
              className={!surveyEditingId && surveyForm.hasPain === "예" ? "bg-orange-500 hover:bg-orange-600 text-white" : ""}
              data-testid="button-survey-submit"
            >
              {createSurveyMutation.isPending || updateSurveyMutation.isPending
                ? "저장 중..."
                : surveyEditingId
                  ? "수정 저장"
                  : surveyForm.hasPain === "예"
                    ? "면담요청"
                    : "조사표 등록"}
            </Button>
          </DialogFooter>

          {/* ── 1차 개선 섹션 (개선 대기 상태일 때만 표시) ── */}
          {(() => {
            const item = (assessments || []).find(a => a.id === surveyAssessmentId);
            if (!item || item.status !== "개선 대기") return null;
            return (
              <div className="border-t border-amber-200 dark:border-amber-800 mt-4 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-amber-600" />
                  <Label className="text-sm font-semibold text-amber-700 dark:text-amber-400">1차 개선 등록 (부서장 확인 후 종결)</Label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">개선 완료일</Label>
                    <Input
                      type="date"
                      value={improvementForm.postImprovementDueDate}
                      onChange={e => setImprovementForm(f => ({ ...f, postImprovementDueDate: e.target.value }))}
                      className="h-8 text-sm"
                      data-testid="input-improvement-due-date"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">확인자 (부서장)</Label>
                    <Input
                      value={improvementForm.postImprovementChecker}
                      onChange={e => setImprovementForm(f => ({ ...f, postImprovementChecker: e.target.value }))}
                      className="h-8 text-sm"
                      placeholder="부서장명 입력"
                      data-testid="input-improvement-checker"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">개선 내용 *</Label>
                  <Textarea
                    value={improvementForm.postImprovementContent}
                    onChange={e => setImprovementForm(f => ({ ...f, postImprovementContent: e.target.value }))}
                    placeholder="시행된 개선조치 내용을 입력하세요"
                    className="text-sm min-h-[80px]"
                    data-testid="textarea-improvement-content"
                  />
                </div>
                <Button
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white gap-2"
                  disabled={!improvementForm.postImprovementContent.trim() || improvementMutation.isPending}
                  onClick={() => {
                    if (surveyAssessmentId !== null) {
                      improvementMutation.mutate({ id: surveyAssessmentId, data: improvementForm });
                    }
                  }}
                  data-testid="button-improvement-submit"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {improvementMutation.isPending ? "등록 중..." : "개선 등록 (종결 처리)"}
                </Button>
              </div>
            );
          })()}
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── QR 등록링크 다이얼로그 ─────────────────────────────────────── */}
      {(() => {
        const publicUrl = typeof window !== "undefined" ? `${window.location.origin}/musculoskeletal/submit` : "";
        return (
          <Dialog open={showQrDialog} onOpenChange={setShowQrDialog}>
            <DialogContent className="w-[95vw] max-w-sm">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <QrCode className="w-5 h-5 text-purple-600" />
                  근골격계 자가진단 QR
                </DialogTitle>
                <DialogDescription>
                  직원이 QR을 스캔하거나 링크로 접속해 유해요인을 직접 등록합니다.
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col items-center gap-4 py-2">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(publicUrl)}`}
                  alt="QR Code"
                  className="w-48 h-48 rounded-lg border"
                />
                <div className="text-xs text-muted-foreground break-all bg-muted/40 rounded-lg p-2.5 w-full text-center">
                  {publicUrl}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={() => {
                    navigator.clipboard.writeText(publicUrl);
                    toast({ title: "링크가 복사되었습니다" });
                  }}
                  data-testid="button-copy-qr-link"
                >
                  링크 복사
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}

      {/* ─── 증상조사표 미리보기 다이얼로그 (부서장/관리자) ──────── */}
      {isDeptHead && (
        <Dialog open={previewAssessmentId !== null} onOpenChange={o => { if (!o) { setPreviewAssessmentId(null); setShowPreviewInterviewForm(false); setPreviewExpandedWorker(null); setPreviewIntForm(initPreviewIntForm()); setPreviewIntSignature(""); setSigPadKey(k => k + 1); } }}>
          <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                <Eye className="w-4 h-4" />
                증상조사표 작성내역
              </DialogTitle>
              <DialogDescription>
                {(() => {
                  const a = (assessments || []).find(x => x.id === previewAssessmentId);
                  return a ? `${a.department} · ${a.assessor || ""} · ${a.assessmentDate || ""}` : "";
                })()}
              </DialogDescription>
            </DialogHeader>

            {previewLoading ? (
              <div className="py-8 text-center text-muted-foreground text-sm">불러오는 중...</div>
            ) : !previewSurveys || previewSurveys.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">등록된 증상조사표가 없습니다.</div>
            ) : (
              <div className="space-y-3">
                {/* ── 조사표 목록 (간략) ─────────────────────────── */}
                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-muted-foreground">등록된 조사표 ({previewSurveys.length}건)</p>
                  {previewSurveys.map((s: any) => {
                    const bpdKeys = s.bodyPartData && typeof s.bodyPartData === "object" ? Object.keys(s.bodyPartData) : [];
                    const legacyParts = BODY_PARTS.filter(bp => s[`${bp.key}Pain`]).map(bp => bp.label);
                    const painLabels = bpdKeys.length > 0
                      ? bpdKeys.map(k => BODY_PARTS.find(bp => bp.key === k)?.label ?? k)
                      : legacyParts;
                    const workerIvs = (previewInterviews || []).filter((iv: any) => iv.workerName === s.workerName);
                    const isExpanded = previewExpandedWorker === (s.workerName || s.id);
                    return (
                      <div key={s.id} className="space-y-1">
                        <div className={`flex items-center justify-between border rounded-lg px-3 py-2 text-sm gap-2 ${s.hasPain === "예" ? "border-orange-200 bg-orange-50/50 dark:bg-orange-900/10" : "border-border"}`}>
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            {s.workerName && <span className="font-medium text-sm">{s.workerName}</span>}
                            {s.workerDept && <span className="text-xs text-muted-foreground">({s.workerDept})</span>}
                            {painLabels.length > 0
                              ? <span className="text-xs text-orange-600">통증: {painLabels.join(", ")}</span>
                              : s.hasPain === "아니오"
                                ? <span className="text-xs text-green-600">이상 없음</span>
                                : null}
                          </div>
                          <Button variant="ghost" size="sm"
                            className={`h-7 px-2 text-xs flex-shrink-0 ${isExpanded ? "text-purple-800 bg-purple-100 dark:bg-purple-900/40" : "text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30"}`}
                            onClick={() => {
                              const willExpand = !isExpanded;
                              setPreviewExpandedWorker(willExpand ? (s.workerName || s.id) : null);
                              if (willExpand) {
                                setShowPreviewInterviewForm(true);
                                setPreviewIntForm(f => ({
                                  ...f,
                                  workerName: s.workerName || "",
                                  workerDept: s.workerDept || "",
                                  interviewDate: new Date().toISOString().slice(0, 10),
                                  interviewerName: user?.name || "",
                                }));
                                setSigPadKey(k => k + 1);
                                setPreviewIntSignature("");
                              }
                            }}>
                            면담일지 {workerIvs.length > 0 ? `(${workerIvs.length})` : ""}
                          </Button>
                        </div>
                        {isExpanded && (
                          <div className="ml-3 pl-3 border-l-2 border-purple-200 dark:border-purple-800 space-y-1.5 pb-1">
                            {workerIvs.length === 0
                              ? <p className="text-xs text-muted-foreground py-1">작성된 면담일지가 없습니다.</p>
                              : workerIvs.map((iv: any) => (
                                <div key={iv.id} className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-2.5 text-xs space-y-1">
                                  <div className="flex justify-between items-center">
                                    <span className="font-semibold text-purple-800 dark:text-purple-300">{iv.interviewDate}</span>
                                    {iv.interviewerName && <span className="text-muted-foreground">면담자: {iv.interviewerName}</span>}
                                  </div>
                                  {iv.mainSymptoms && <p><span className="font-medium">주요 증상:</span> {iv.mainSymptoms}</p>}
                                  {iv.discomfortIssues && <p><span className="font-medium">불편 사항:</span> {iv.discomfortIssues}</p>}
                                  {iv.improvementMeasures && <p><span className="font-medium">개선 조치:</span> {iv.improvementMeasures}</p>}
                                  {iv.requests && <p><span className="font-medium">요청 사항:</span> {iv.requests}</p>}
                                </div>
                              ))
                            }
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* ── 상세 카드 ───────────────────────────────────── */}
                <div className="border-t border-border pt-3 space-y-3">
                  <p className="text-xs font-semibold text-muted-foreground">상세 내용</p>

                  {/* 평가자 유해요인조사 체크 항목 */}
                  {(() => {
                    const a = (assessments || []).find(x => x.id === previewAssessmentId);
                    const checklist = parseChecklist((a as any)?.burdenWorkChecklist);
                    const hazardFactor = (a as any)?.hazardFactor;
                    const hasContent = checklist.length > 0 || hazardFactor;
                    if (!hasContent) return null;
                    return (
                      <div className="rounded-xl border border-purple-200 dark:border-purple-800 bg-purple-50/50 dark:bg-purple-900/10 p-4 space-y-2">
                        <p className="text-xs font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-1.5">
                          <Wrench className="w-3.5 h-3.5" />
                          평가자 유해요인조사 체크 항목
                        </p>
                        {hazardFactor && (
                          <p className="text-xs text-muted-foreground">· 유해요인: <span className="font-medium text-foreground">{hazardFactor}</span></p>
                        )}
                        {checklist.length > 0 && (
                          <div className="space-y-2 mt-1">
                            {checklist.map(no => {
                              const bw = BURDEN_WORKS.find(b => b.no === no);
                              if (!bw) return null;
                              return (
                                <div key={no} className="flex items-start gap-2">
                                  <span className="shrink-0 text-[10px] font-bold bg-purple-600 text-white rounded-full w-5 h-5 flex items-center justify-center mt-0.5">{no}호</span>
                                  <div>
                                    <p className="text-xs font-medium text-foreground">{bw.short}</p>
                                    <p className="text-[11px] text-muted-foreground leading-snug">{bw.desc}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                {previewSurveys.map((s: any, i: number) => {
                  const bpd: Record<string, any> = (s.bodyPartData && typeof s.bodyPartData === "object") ? s.bodyPartData : {};
                  const painParts = Object.keys(bpd);
                  const gh = (s.generalHealth && typeof s.generalHealth === "object") ? s.generalHealth : {};
                  const hasGeneralHealth = gh.q5Burden || gh.q2Housework || gh.q3Medical || gh.q4Injury || (gh.q1Leisure || []).length > 0;
                  return (
                    <div key={s.id} className={`rounded-xl border p-4 space-y-3 ${s.hasPain === "예" ? "border-orange-300 bg-orange-50/50 dark:bg-orange-900/10" : "border-border bg-muted/20"}`}>
                      {/* 헤더 */}
                      <div className="flex items-start gap-2">
                        <div>
                          <p className="text-sm font-semibold">{i + 1}{s.workerName ? `. ${s.workerName}` : "."}</p>
                          <p className="text-xs text-muted-foreground">{s.workerDept || ""}</p>
                        </div>
                        <div className="ml-auto">
                          {s.hasPain === "예"
                            ? <span className="text-[10px] font-semibold text-orange-600 bg-orange-100 dark:bg-orange-900/30 rounded-full px-2 py-0.5">통증 있음</span>
                            : s.hasPain === "아니오"
                              ? <span className="text-[10px] font-semibold text-green-700 bg-green-100 dark:bg-green-900/30 rounded-full px-2 py-0.5">이상 없음</span>
                              : null}
                        </div>
                      </div>

                      {/* 증상조사표 작성내역 섹션 제목 */}
                      <p className="text-[11px] font-semibold text-muted-foreground border-b border-border pb-1">증상조사표 작성내역</p>

                      {/* 일반 문항 요약 */}
                      {hasGeneralHealth && (
                        <div className="bg-muted/40 rounded-lg p-3 space-y-1">
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5 flex items-center gap-1">
                            <HeartPulse className="w-3 h-3" /> 일반 문항
                          </p>
                          {(gh.q1Leisure || []).length > 0 && (
                            <p className="text-xs">· 여가활동: <span className="font-medium">{(gh.q1Leisure as string[]).join(", ")}</span></p>
                          )}
                          {gh.q2Housework && <p className="text-xs">· 가사노동: <span className="font-medium">{gh.q2Housework}</span></p>}
                          {gh.q3Medical && <p className="text-xs">· 진단 질병: <span className="font-medium">{gh.q3Medical}{(gh.q3Conditions || []).length > 0 ? ` (${(gh.q3Conditions as string[]).join(", ")})` : ""}</span></p>}
                          {gh.q4Injury && <p className="text-xs">· 과거 부상: <span className="font-medium">{gh.q4Injury}{(gh.q4Parts || []).length > 0 ? ` (${(gh.q4Parts as string[]).join(", ")})` : ""}</span></p>}
                          {gh.q5Burden && <p className="text-xs">· 육체적 부담: <span className="font-medium">{gh.q5Burden}</span></p>}
                        </div>
                      )}

                      {/* 신체 부위별 증상 */}
                      {painParts.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1">
                            <Activity className="w-3 h-3" /> 신체 부위별 증상
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {painParts.map(key => {
                              const d = bpd[key] || {};
                              const label = BODY_PARTS.find(bp => bp.key === key)?.label || key;
                              return (
                                <div key={key} className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-2.5 space-y-1">
                                  <p className="text-xs font-bold text-orange-700 dark:text-orange-400">{label}</p>
                                  {d.side && <p className="text-xs text-muted-foreground">부위: {d.side}</p>}
                                  {d.intensity && <p className="text-xs text-muted-foreground">강도: {d.intensity}</p>}
                                  {d.duration && <p className="text-xs text-muted-foreground">기간: {d.duration}</p>}
                                  {d.frequency && <p className="text-xs text-muted-foreground">빈도: {d.frequency}</p>}
                                  {d.pastWeek && <p className="text-xs text-muted-foreground">지난 1주: {d.pastWeek}</p>}
                                  {(d.treatments || []).length > 0 && (
                                    <p className="text-xs text-muted-foreground">조치: {(d.treatments as string[]).join(", ")}</p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {painParts.length === 0 && s.hasPain === "아니오" && (
                        <p className="text-xs text-muted-foreground text-center py-2">신체 부위별 증상 없음</p>
                      )}
                    </div>
                  );
                })}
                </div>
              </div>
            )}

            {/* ── 인라인 면담일지 작성 폼 ───────────────────────── */}
            {showPreviewInterviewForm && (
              <div className="border-t border-border pt-4 space-y-3">
                <p className="text-sm font-semibold text-purple-700 dark:text-purple-400 flex items-center gap-2">
                  <Bone className="w-4 h-4" />면담일지 작성
                </p>
                {/* 자동입력 필드 */}
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">근로자 성명 <span className="text-purple-500">(자동)</span></Label>
                    <Input className="h-8 text-sm bg-muted/50" value={previewIntForm.workerName} onChange={e => setPreviewIntForm(f => ({ ...f, workerName: e.target.value }))} placeholder="성명" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">부서 <span className="text-purple-500">(자동)</span></Label>
                    <Input className="h-8 text-sm bg-muted/50" value={previewIntForm.workerDept} onChange={e => setPreviewIntForm(f => ({ ...f, workerDept: e.target.value }))} placeholder="부서명" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">직위/직종</Label>
                    <Input className="h-8 text-sm" value={previewIntForm.workerPosition} onChange={e => setPreviewIntForm(f => ({ ...f, workerPosition: e.target.value }))} placeholder="직위" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">담당 작업</Label>
                    <Select value={previewIntForm.assignedWork} onValueChange={v => setPreviewIntForm(f => ({ ...f, assignedWork: v }))}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="선택" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="현장운용">현장운용</SelectItem>
                        <SelectItem value="일반사무">일반사무</SelectItem>
                        <SelectItem value="기타">기타</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">면담일 <span className="text-purple-500">(자동)</span></Label>
                    <Input type="date" className="h-8 text-sm bg-muted/50" value={previewIntForm.interviewDate} onChange={e => setPreviewIntForm(f => ({ ...f, interviewDate: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">면담자 <span className="text-purple-500">(자동)</span></Label>
                    <Input className="h-8 text-sm bg-muted/50" value={previewIntForm.interviewerName} onChange={e => setPreviewIntForm(f => ({ ...f, interviewerName: e.target.value }))} placeholder="면담자 이름" />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">유해요인</Label>
                  <Textarea className="text-sm min-h-[56px]" value={previewIntForm.hazardDetails} onChange={e => setPreviewIntForm(f => ({ ...f, hazardDetails: e.target.value }))} placeholder="작업 관련 유해요인" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">주요 증상</Label>
                  <Textarea className="text-sm min-h-[56px]" value={previewIntForm.mainSymptoms} onChange={e => setPreviewIntForm(f => ({ ...f, mainSymptoms: e.target.value }))} placeholder="통증 부위 및 증상" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">불편 사항</Label>
                  <Textarea className="text-sm min-h-[56px]" value={previewIntForm.discomfortIssues} onChange={e => setPreviewIntForm(f => ({ ...f, discomfortIssues: e.target.value }))} placeholder="작업 중 불편한 사항" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">개선 조치</Label>
                  <Textarea className="text-sm min-h-[56px]" value={previewIntForm.improvementMeasures} onChange={e => setPreviewIntForm(f => ({ ...f, improvementMeasures: e.target.value }))} placeholder="개선 조치 내용" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">요청 사항</Label>
                  <Textarea className="text-sm min-h-[56px]" value={previewIntForm.requests} onChange={e => setPreviewIntForm(f => ({ ...f, requests: e.target.value }))} placeholder="근로자 요청 사항" />
                </div>
                {/* 면담자 서명 */}
                <div className="space-y-2 border border-purple-200 dark:border-purple-800 rounded-xl p-3 bg-purple-50/40 dark:bg-purple-900/10">
                  <Label className="text-xs font-semibold text-purple-700 dark:text-purple-400">면담자 서명</Label>
                  {previewIntSignature
                    ? (
                      <div className="space-y-2">
                        <img src={previewIntSignature} alt="서명" className="h-20 rounded-lg border bg-white object-contain px-2" />
                        <Button type="button" size="sm" variant="outline" className="w-full text-xs" onClick={() => { setPreviewIntSignature(""); setSigPadKey(k => k + 1); }}>서명 다시 하기</Button>
                      </div>
                    ) : (
                      <InterviewSignaturePad
                        padKey={sigPadKey}
                        onSave={data => setPreviewIntSignature(data)}
                        onClear={() => setPreviewIntSignature("")}
                      />
                    )
                  }
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" size="sm" onClick={() => { setShowPreviewInterviewForm(false); setPreviewIntForm(initPreviewIntForm()); setPreviewIntSignature(""); setSigPadKey(k => k + 1); }}>취소</Button>
                  <Button size="sm" className="bg-purple-600 hover:bg-purple-700 text-white"
                    disabled={createPreviewInterviewMutation.isPending}
                    onClick={() => createPreviewInterviewMutation.mutate({ ...previewIntForm, interviewerSignature: previewIntSignature || null })}>
                    {createPreviewInterviewMutation.isPending ? "저장 중..." : "저장"}
                  </Button>
                </div>
              </div>
            )}

            <DialogFooter>
              {isDeptHead && previewAssessmentId !== null && (
                <Button
                  variant={showPreviewInterviewForm ? "default" : "outline"}
                  className={showPreviewInterviewForm ? "bg-purple-600 hover:bg-purple-700 text-white" : "border-purple-300 text-purple-700 hover:bg-purple-50"}
                  onClick={() => {
                    const opening = !showPreviewInterviewForm;
                    setShowPreviewInterviewForm(opening);
                    if (opening) {
                      setPreviewIntForm(f => ({
                        ...f,
                        interviewDate: new Date().toISOString().slice(0, 10),
                        interviewerName: user?.name || "",
                      }));
                      setSigPadKey(k => k + 1);
                      setPreviewIntSignature("");
                    }
                  }}
                >
                  <Bone className="w-4 h-4 mr-2" />
                  {showPreviewInterviewForm ? "작성 접기" : "면담일지 작성"}
                </Button>
              )}
              <Button variant="outline" onClick={() => { setPreviewAssessmentId(null); setShowPreviewInterviewForm(false); setPreviewExpandedWorker(null); }}>닫기</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ─── 부서장 면담 알림 팝업 ─────────────────────────────────── */}
      <Dialog open={showInterviewNotif} onOpenChange={open => { if (!open) { setInterviewNotifDismissed(true); setShowInterviewNotif(false); } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
              <HeartPulse className="w-5 h-5" />
              면담요청 알림
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl p-4 text-sm text-purple-800 dark:text-purple-300 leading-relaxed">
              근골격계 질환 증상조사 관련 면담요청이 들어왔습니다.<br />
              면담일지를 작성해주세요.
            </div>
            <div className="space-y-2">
              {(Array.isArray(pendingInterviewRequests) ? pendingInterviewRequests : []).map((req: any) => (
                <div key={req.id} className="flex items-center justify-between gap-2 border rounded-lg px-3 py-2.5 bg-muted/30">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">{req.department}</p>
                    {req.task && <p className="text-xs text-muted-foreground truncate">{req.task}</p>}
                    <p className="text-xs text-orange-600 font-medium">면담 대기 {req.surveyCount}명</p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 text-white text-xs shrink-0"
                    data-testid={`button-notif-interview-${req.id}`}
                    onClick={() => {
                      setInterviewAssessmentId(req.id);
                      setShowInterviewNotif(false);
                      setInterviewNotifDismissed(true);
                    }}
                  >
                    면담일지 작성
                  </Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setInterviewNotifDismissed(true); setShowInterviewNotif(false); }}
            >
              나중에 작성
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── 면담일지 다이얼로그 ────────────────────────────────────────── */}
      <Dialog open={interviewAssessmentId !== null} onOpenChange={o => { if (!o) { setInterviewAssessmentId(null); resetInterviewForm(); } }}>
        <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bone className="w-4 h-4 text-purple-600" />
              근골격계 증상조사자 면담일지
            </DialogTitle>
            <DialogDescription>증상조사를 마친 근로자와의 면담 내용을 기록합니다.</DialogDescription>
          </DialogHeader>

          {/* ── 증상조사 참고 (면담 중 참고용) ─────────────────── */}
          {(interviewSurveys || []).length > 0 && (
            <div className="bg-orange-50/60 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800 rounded-xl p-3 space-y-2">
              <p className="text-xs font-semibold text-orange-700 dark:text-orange-400 flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5" />
                증상조사 내용 참고 ({(interviewSurveys || []).filter((s: any) => s.hasPain === "예").length}명 통증 호소)
              </p>
              <div className="space-y-1.5">
                {(interviewSurveys || []).map((s: any) => {
                  const bpdKeys = s.bodyPartData && typeof s.bodyPartData === "object" ? Object.keys(s.bodyPartData) : [];
                  const legacyParts = BODY_PARTS.filter(bp => s[`${bp.key}Pain`]).map(bp => bp.label);
                  const painLabels = bpdKeys.length > 0
                    ? bpdKeys.map((k: string) => BODY_PARTS.find(bp => bp.key === k)?.label ?? k)
                    : legacyParts;
                  const bpd: Record<string, any> = s.bodyPartData && typeof s.bodyPartData === "object" ? s.bodyPartData : {};
                  return (
                    <div key={s.id} className={`rounded-lg border px-3 py-2 text-xs space-y-1 ${s.hasPain === "예" ? "border-orange-300 bg-white dark:bg-orange-900/20" : "border-border bg-white/50 dark:bg-background/30"}`}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {s.workerName && <span className="font-semibold text-sm">{s.workerName}</span>}
                          {s.workerDept && <span className="text-muted-foreground">({s.workerDept})</span>}
                        </div>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full shrink-0 ${s.hasPain === "예" ? "bg-orange-500 text-white" : "bg-green-600 text-white"}`}>
                          {s.hasPain === "예" ? "통증" : "이상없음"}
                        </span>
                      </div>
                      {painLabels.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {bpdKeys.length > 0
                            ? bpdKeys.map((k: string) => {
                                const d = bpd[k] || {};
                                const lbl = BODY_PARTS.find(bp => bp.key === k)?.label ?? k;
                                return (
                                  <span key={k} className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded text-[10px]">
                                    {lbl}{d.intensity ? ` (${d.intensity})` : ""}
                                  </span>
                                );
                              })
                            : painLabels.map((lbl: string) => (
                                <span key={lbl} className="bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400 px-1.5 py-0.5 rounded text-[10px]">{lbl}</span>
                              ))
                          }
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {interviewsLoading ? (
            <div className="py-4 text-center text-muted-foreground text-sm">로딩 중...</div>
          ) : (interviewList || []).length === 0 ? (
            <div className="py-3 text-center text-muted-foreground text-sm">등록된 면담일지가 없습니다.</div>
          ) : (
            <div className="space-y-2 mb-2">
              <Label className="text-sm font-semibold">등록된 면담일지 ({interviewList!.length}건)</Label>
              {interviewList!.map((iv: any) => (
                <div key={iv.id} className="flex items-start justify-between border rounded-lg px-3 py-2.5 text-sm gap-2">
                  <div className="space-y-0.5 flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">{iv.workerName}</span>
                      {iv.workerDept && <span className="text-muted-foreground text-xs">({iv.workerDept})</span>}
                      {iv.workerPosition && <span className="text-muted-foreground text-xs">· {iv.workerPosition}</span>}
                      <span className="text-xs text-muted-foreground">{iv.interviewDate}</span>
                    </div>
                    {iv.mainSymptoms && <p className="text-xs text-orange-600">주요 증상: {iv.mainSymptoms}</p>}
                    {iv.interviewerName && <p className="text-xs text-muted-foreground">면담자: {iv.interviewerName}</p>}
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { setInterviewEditingId(iv.id); setInterviewForm({ workerName: iv.workerName || "", workerDept: iv.workerDept || "", workerPosition: iv.workerPosition || "", assignedWork: iv.assignedWork || "", interviewDate: iv.interviewDate || "", hazardDetails: iv.hazardDetails || "", mainSymptoms: iv.mainSymptoms || "", discomfortIssues: iv.discomfortIssues || "", improvementMeasures: iv.improvementMeasures || "", requests: iv.requests || "", interviewerName: iv.interviewerName || "" }); }}
                      data-testid={`button-interview-edit-${iv.id}`}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => { if (confirm("삭제하시겠습니까?")) deleteInterviewMutation.mutate(iv.id); }}
                      data-testid={`button-interview-delete-${iv.id}`}>
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="border-t border-border pt-4 space-y-4">
            <Label className="text-sm font-semibold">{interviewEditingId ? "면담일지 수정" : "새 면담일지 작성"}</Label>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">면담 일자</Label>
                <Input type="date" value={interviewForm.interviewDate}
                  onChange={e => setInterviewForm(f => ({ ...f, interviewDate: e.target.value }))}
                  className="h-8 text-sm" data-testid="input-interview-date" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">부서</Label>
                <Input value={interviewForm.workerDept}
                  onChange={e => setInterviewForm(f => ({ ...f, workerDept: e.target.value }))}
                  className="h-8 text-sm" placeholder="부서명" data-testid="input-interview-dept" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">직책</Label>
                <Input value={interviewForm.workerPosition}
                  onChange={e => setInterviewForm(f => ({ ...f, workerPosition: e.target.value }))}
                  className="h-8 text-sm" placeholder="직책" data-testid="input-interview-position" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">성명 *</Label>
                <Input value={interviewForm.workerName}
                  onChange={e => setInterviewForm(f => ({ ...f, workerName: e.target.value }))}
                  className="h-8 text-sm" placeholder="이름" data-testid="input-interview-name" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">담당 업무</Label>
              <Input value={interviewForm.assignedWork}
                onChange={e => setInterviewForm(f => ({ ...f, assignedWork: e.target.value }))}
                className="h-8 text-sm" placeholder="예) 기지국 유지보수, 사무업무 등"
                data-testid="input-interview-work" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">유해요인 조사내역 (부담작업 해당 호수)</Label>
                <Input value={interviewForm.hazardDetails}
                  onChange={e => setInterviewForm(f => ({ ...f, hazardDetails: e.target.value }))}
                  className="h-8 text-sm" placeholder="예) 1호(손), 2호(목)" data-testid="input-interview-hazard" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">주요 증상 부위</Label>
                <Input value={interviewForm.mainSymptoms}
                  onChange={e => setInterviewForm(f => ({ ...f, mainSymptoms: e.target.value }))}
                  className="h-8 text-sm" placeholder="예) 손, 허리" data-testid="input-interview-symptoms" />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">업무 간 불편사항</Label>
              <Textarea value={interviewForm.discomfortIssues}
                onChange={e => setInterviewForm(f => ({ ...f, discomfortIssues: e.target.value }))}
                placeholder="업무 중 불편한 사항을 기술하세요"
                className="text-sm min-h-[72px]" data-testid="textarea-interview-discomfort" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">개선 대책</Label>
              <Textarea value={interviewForm.improvementMeasures}
                onChange={e => setInterviewForm(f => ({ ...f, improvementMeasures: e.target.value }))}
                placeholder="개선 방안 및 조치 계획을 입력하세요"
                className="text-sm min-h-[72px]" data-testid="textarea-interview-improvement" />
            </div>

            <div className="space-y-1">
              <Label className="text-xs">요청 사항</Label>
              <Textarea value={interviewForm.requests}
                onChange={e => setInterviewForm(f => ({ ...f, requests: e.target.value }))}
                placeholder="근로자 요청 사항을 입력하세요"
                className="text-sm min-h-[56px]" data-testid="textarea-interview-requests" />
            </div>

            <div className="space-y-1 max-w-xs">
              <Label className="text-xs">면담자 성명 (서명)</Label>
              <Input value={interviewForm.interviewerName}
                onChange={e => setInterviewForm(f => ({ ...f, interviewerName: e.target.value }))}
                className="h-8 text-sm" placeholder="부서장 성명" data-testid="input-interview-interviewer" />
            </div>
          </div>

          <DialogFooter className="flex-col-reverse sm:flex-row gap-2 pt-2">
            {interviewEditingId && (
              <Button variant="outline" onClick={resetInterviewForm} className="sm:mr-auto">취소</Button>
            )}
            <Button variant="outline" onClick={() => { setInterviewAssessmentId(null); resetInterviewForm(); }}>닫기</Button>
            <Button
              className="bg-purple-600 hover:bg-purple-700 text-white"
              onClick={handleInterviewSubmit}
              disabled={createInterviewMutation.isPending || updateInterviewMutation.isPending}
              data-testid="button-interview-submit"
            >
              {createInterviewMutation.isPending || updateInterviewMutation.isPending ? "저장 중..." : interviewEditingId ? "수정 저장" : "면담일지 등록"}
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
