import { useNotices, useCreateNotice, useDeleteNotice, useUpdateNotice } from "@/hooks/use-notices";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { HardHat, Plus, Trash2, ChevronLeft, Save, Edit2, Cone, Package, Download, Upload, Users, User, Pencil, X, CheckCircle2 } from "lucide-react";
import { useState, useEffect, useMemo, useRef } from "react";
import ExcelJS from "exceljs";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { usePermissions } from "@/hooks/use-permissions";

const TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀", "공공망관제팀"];

const CATEGORIES = [
  { id: "보호구", label: "보호구", icon: HardHat },
  { id: "안전용품", label: "안전용품", icon: Cone },
  { id: "기타품목", label: "기타품목", icon: Package },
];

const STATUS_OPTIONS = ["등록", "양호", "불량"];

const DEFAULT_EQUIPMENT_LIST = [
  { name: "안전모(일반)", quantity: 0, category: "보호구", status: "등록" },
  { name: "일반안전화", quantity: 0, category: "보호구", status: "등록" },
  { name: "하계안전화", quantity: 0, category: "보호구", status: "등록" },
  { name: "실내안전화", quantity: 0, category: "보호구", status: "등록" },
  { name: "안전장화", quantity: 0, category: "보호구", status: "등록" },
  { name: "안전대(복합식)", quantity: 0, category: "보호구", status: "등록" },
  { name: "절연장갑", quantity: 0, category: "보호구", status: "등록" },
  { name: "안전모(임업)", quantity: 0, category: "보호구", status: "등록" },
  { name: "안전모(신호수)", quantity: 0, category: "보호구", status: "등록" },
  { name: "추락방지대(로프식)", quantity: 0, category: "보호구", status: "등록" },
  { name: "추락방지대(와이어식)", quantity: 0, category: "보호구", status: "등록" },
  { name: "휴대용소화기", quantity: 0, category: "안전용품", status: "등록" },
  { name: "반사조끼(주황색조끼)", quantity: 0, category: "안전용품", status: "등록" },
  { name: "수평구명줄SET", quantity: 0, category: "안전용품", status: "등록" },
  { name: "비상용삼각대", quantity: 0, category: "안전용품", status: "등록" },
  { name: "접이식 라바콘", quantity: 0, category: "안전용품", status: "등록" },
  { name: "차량 고임목", quantity: 0, category: "안전용품", status: "등록" },
  { name: "A형사다리", quantity: 0, category: "기타품목", status: "등록" },
  { name: "아웃트리거", quantity: 0, category: "기타품목", status: "등록" },
  { name: "블랙박스", quantity: 0, category: "기타품목", status: "등록" },
  { name: "후방센서", quantity: 0, category: "기타품목", status: "등록" },
  { name: "후방카메라", quantity: 0, category: "기타품목", status: "등록" },
];

interface EquipmentItem {
  name: string;
  quantity: number;
  category: string;
  status: string;
}

interface TeamData {
  team: string;
  items: EquipmentItem[];
  lastUpdated?: string;
}

function CircularProgress({ value, max, color, label, size = 120 }: { value: number; max: number; color: string; label: string; size?: number }) {
  const percentage = max > 0 ? (value / max) * 100 : 0;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          <circle cx={size / 2} cy={size / 2} r={radius} stroke="currentColor" strokeWidth={strokeWidth} fill="transparent" className="text-muted/20" />
          <circle cx={size / 2} cy={size / 2} r={radius} stroke={color} strokeWidth={strokeWidth} fill="transparent" strokeDasharray={circumference} strokeDashoffset={strokeDashoffset} strokeLinecap="round" className="transition-all duration-500" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold">{value}</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function EquipmentListItem({ name, totalQuantity, registeredQty, goodQty, badQty, isSelected, onClick, icon: Icon }: { name: string; totalQuantity: number; registeredQty: number; goodQty: number; badQty: number; isSelected: boolean; onClick: () => void; icon?: any; }) {
  return (
    <motion.div onClick={onClick} className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${isSelected ? "bg-primary/10 border-l-4 border-primary" : "hover:bg-muted/50"}`} whileHover={{ x: 4 }}>
      <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center">
        {Icon ? <Icon className="w-5 h-5 text-muted-foreground" /> : <HardHat className="w-5 h-5 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{name}</p>
        <p className="text-sm">
          <span className="text-foreground font-semibold">{totalQuantity}개</span>
          <span className="text-muted-foreground"> (</span>
          <span className="text-blue-600">{registeredQty}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-green-600">{goodQty}</span>
          <span className="text-muted-foreground"> / </span>
          <span className="text-red-600">{badQty}</span>
          <span className="text-muted-foreground">)</span>
        </p>
      </div>
    </motion.div>
  );
}

interface EquipmentStatusProps {
  embedded?: boolean;
}

export default function EquipmentStatus({ embedded = false }: EquipmentStatusProps) {
  const { canDownloadEquipmentExcel, canEditEquipmentStatus } = usePermissions();
  const { data: statusRecords, isLoading } = useNotices("equip_status");
  const { mutate: createRecord, isPending: isCreating } = useCreateNotice();
  const { mutate: updateRecord, isPending: isUpdating } = useUpdateNotice();
  const { mutate: deleteRecord } = useDeleteNotice();
  const { toast } = useToast();

  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>(DEFAULT_EQUIPMENT_LIST);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 등록 Dialog 상태
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addDialogTab, setAddDialogTab] = useState("single");
  // 단일 등록
  const [singleTeam, setSingleTeam] = useState("");
  const [singleCategory, setSingleCategory] = useState("보호구");
  const [singleName, setSingleName] = useState("");
  const [singleQty, setSingleQty] = useState(0);
  const [singleStatus, setSingleStatus] = useState("등록");
  const [isSingleSaving, setIsSingleSaving] = useState(false);
  // 팀별 전체 등록
  const [bulkCategory, setBulkCategory] = useState("보호구");
  const [bulkName, setBulkName] = useState("");
  const [bulkTeamQtys, setBulkTeamQtys] = useState<Record<string, number>>(() => Object.fromEntries(TEAMS.map(t => [t, 0])));
  const [bulkAllQty, setBulkAllQty] = useState(0);
  const [bulkStatus, setBulkStatus] = useState("등록");
  const [isBulkSaving, setIsBulkSaving] = useState(false);

  // 인라인 편집 행
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  const handleExcelDownload = async () => {
    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('보호구현황');

    // ── 팀별 항목 맵 구성 ──
    const teamItemMap: Record<string, Record<string, number>> = {};
    const itemCategoryMap: Record<string, string> = {};
    allTeamsData.forEach(td => {
      if (!teamItemMap[td.team]) teamItemMap[td.team] = {};
      td.items?.forEach(item => {
        teamItemMap[td.team][item.name] = item.quantity ?? 0;
        itemCategoryMap[item.name] = item.category || "기타품목";
      });
    });

    // ── 모든 항목 수집 및 카테고리순 정렬 ──
    const CATEGORY_ORDER = ["보호구", "안전용품", "기타품목"];
    const allItemNames = new Set<string>([
      ...DEFAULT_EQUIPMENT_LIST.map(d => d.name),
      ...Object.keys(itemCategoryMap)
    ]);
    const sortedItems: { name: string; category: string }[] = [];
    CATEGORY_ORDER.forEach(cat => {
      DEFAULT_EQUIPMENT_LIST.filter(d => d.category === cat && allItemNames.has(d.name))
        .forEach(d => { if (!sortedItems.find(s => s.name === d.name)) sortedItems.push({ name: d.name, category: cat }); });
      Array.from(allItemNames)
        .filter(n => (itemCategoryMap[n] || "기타품목") === cat && !DEFAULT_EQUIPMENT_LIST.find(d => d.name === n))
        .forEach(n => { if (!sortedItems.find(s => s.name === n)) sortedItems.push({ name: n, category: cat }); });
    });

    // ── 열 너비 설정 ──
    const TEAM_COLS = TEAMS;
    ws.getColumn(1).width = 10;
    ws.getColumn(2).width = 24;
    TEAM_COLS.forEach((_, i) => { ws.getColumn(i + 3).width = 10; });
    ws.getColumn(TEAM_COLS.length + 3).width = 8;  // 예비
    ws.getColumn(TEAM_COLS.length + 4).width = 8;  // 합계

    // ── 헤더 행 ──
    const headerValues = ["구분", "품목명", ...TEAM_COLS, "예비", "합계"];
    const headerRow = ws.addRow(headerValues);
    headerRow.height = 40;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, size: 10, color: { argb: "FF1F3864" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
      cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    });

    // ── 데이터 행 ──
    const catBgColors: Record<string, string> = {
      "보호구":   "FFFFF2CC",
      "안전용품": "FFE2EFDA",
      "기타품목": "FFFCE4D6",
    };
    let catStartRow = 2;
    let prevCat = "";

    sortedItems.forEach((item, idx) => {
      const rowNum = idx + 2;
      const teamVals = TEAM_COLS.map(t => teamItemMap[t]?.[item.name] ?? 0);
      const total = teamVals.reduce((a, b) => a + b, 0);
      const row = ws.addRow([item.category !== prevCat ? item.category : "", item.name, ...teamVals, 0, total]);
      row.height = 18;

      const bg = catBgColors[item.category] || "FFFFFFFF";
      row.eachCell((cell, colIdx) => {
        cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
        cell.alignment = { vertical: "middle", horizontal: colIdx <= 2 ? "left" : "center" };
        cell.font = { size: 10 };
        if (colIdx === 1) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bg } };
          cell.font = { bold: true, size: 10 };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        }
        if (colIdx === TEAM_COLS.length + 4) {
          // 합계 열 강조
          cell.font = { bold: true, size: 10 };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6DCE4" } };
        }
      });

      if (item.category !== prevCat) {
        if (prevCat !== "" && rowNum > 2) {
          ws.mergeCells(catStartRow, 1, rowNum - 1, 1);
        }
        prevCat = item.category;
        catStartRow = rowNum;
      }
    });

    // 마지막 카테고리 병합
    if (sortedItems.length > 0) {
      ws.mergeCells(catStartRow, 1, sortedItems.length + 1, 1);
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    a.href = url; a.download = `보호구현황_${today}.xlsx`; a.click();
    URL.revokeObjectURL(url);
    toast({ title: "다운로드 완료", description: "보호구 현황이 엑셀 파일로 저장되었습니다." });
  };

  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(arrayBuffer);
      const ws = workbook.worksheets[0];

      // ── 헤더 파싱: 팀 열 위치 탐색 ──
      const headerRow = ws.getRow(1);
      const colTeamMap: Record<number, string> = {}; // colIdx → teamName
      const skipCols = new Set(["구분", "품목명", "예비", "합계", ""]);
      headerRow.eachCell((cell, colNum) => {
        const val = String(cell.value ?? "").trim();
        if (!skipCols.has(val)) {
          // 팀명 매칭: 셀 값에 팀명이 포함되는지 확인
          const matched = TEAMS.find(t => val.includes(t) || t.includes(val));
          if (matched) colTeamMap[colNum] = matched;
        }
      });

      if (Object.keys(colTeamMap).length === 0) {
        toast({ variant: "destructive", title: "업로드 실패", description: "팀 열을 찾을 수 없습니다. 다운로드한 형식의 파일을 업로드해주세요." });
        return;
      }

      // ── 데이터 행 파싱 ──
      const teamItemsMap = new Map<string, EquipmentItem[]>();
      TEAMS.forEach(t => teamItemsMap.set(t, []));

      let lastCategory = "기타품목";
      ws.eachRow((row, rowNum) => {
        if (rowNum === 1) return;

        // 구분(카테고리) 열 = 1, 품목명 열 = 2
        const catVal = String(row.getCell(1).value ?? "").trim();
        const itemName = String(row.getCell(2).value ?? "").trim();
        if (!itemName) return;
        if (catVal) lastCategory = catVal;

        Object.entries(colTeamMap).forEach(([colStr, teamName]) => {
          const colNum = Number(colStr);
          const qty = Number(row.getCell(colNum).value ?? 0) || 0;
          teamItemsMap.get(teamName)!.push({
            name: itemName,
            quantity: qty,
            category: lastCategory,
            status: "등록",
          });
        });
      });

      // ── 팀별 저장 ──
      let successCount = 0;
      for (const [teamName, items] of Array.from(teamItemsMap)) {
        if (items.length === 0) continue;
        const existingRecord = statusRecords?.find(r => { try { return (JSON.parse(r.content) as TeamData).team === teamName; } catch { return false; } });
        const contentData = JSON.stringify({ team: teamName, items, lastUpdated: new Date().toISOString() });
        if (existingRecord) {
          await new Promise<void>(resolve => { updateRecord({ id: existingRecord.id, title: `${teamName} 보호구 현황`, content: contentData }, { onSuccess: () => { successCount++; resolve(); }, onError: () => resolve() }); });
        } else {
          await new Promise<void>(resolve => { createRecord({ title: `${teamName} 보호구 현황`, content: contentData, category: "equip_status" }, { onSuccess: () => { successCount++; resolve(); }, onError: () => resolve() }); });
        }
      }
      queryClient.invalidateQueries({ queryKey: ['/api/notices'] });
      toast({ title: "업로드 완료", description: `${successCount}개 팀 데이터가 업데이트되었습니다.` });
    } catch (err) {
      console.error(err);
      toast({ variant: "destructive", title: "업로드 실패", description: "엑셀 파일 형식을 확인해주세요." });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const allTeamsData = useMemo(() => {
    if (!statusRecords) return [];
    return statusRecords.map(record => { try { return JSON.parse(record.content) as TeamData; } catch { return null; } }).filter(Boolean) as TeamData[];
  }, [statusRecords]);

  const aggregatedData = useMemo(() => {
    const teamsToShow = selectedTeam && selectedTeam !== "all" ? allTeamsData.filter(t => t.team === selectedTeam) : allTeamsData;
    const allItems: EquipmentItem[] = [];
    teamsToShow.forEach(team => { if (team.items) team.items.forEach(item => allItems.push({ ...item, category: item.category || "기타품목", status: item.status || "등록" })); });
    return allItems;
  }, [allTeamsData, selectedTeam]);

  const categoryStats = useMemo(() => {
    const items = selectedCategory ? aggregatedData.filter(i => i.category === selectedCategory) : aggregatedData;
    const goodQty = items.filter(i => i.status === "양호").reduce((sum, i) => sum + (i.quantity || 0), 0);
    const badQty = items.filter(i => i.status === "불량").reduce((sum, i) => sum + (i.quantity || 0), 0);
    return { total: items.length, totalQuantity: items.reduce((sum, i) => sum + (i.quantity || 0), 0), registeredQty: goodQty + badQty, goodQty, badQty };
  }, [aggregatedData, selectedCategory]);

  const equipmentCategories = useMemo(() => {
    const uniqueNames = Array.from(new Set(aggregatedData.map(i => i.name)));
    return uniqueNames.map(name => {
      const items = aggregatedData.filter(i => i.name === name);
      const goodQty = items.filter(i => i.status === "양호").reduce((sum, i) => sum + (i.quantity || 0), 0);
      const badQty = items.filter(i => i.status === "불량").reduce((sum, i) => sum + (i.quantity || 0), 0);
      return { name, category: items[0]?.category || "기타품목", totalQuantity: items.reduce((sum, i) => sum + (i.quantity || 0), 0), registeredQty: goodQty + badQty, goodQty, badQty };
    });
  }, [aggregatedData]);

  const filteredCategories = useMemo(() => selectedCategory ? equipmentCategories.filter(e => e.category === selectedCategory) : equipmentCategories, [equipmentCategories, selectedCategory]);

  const teamRecord = statusRecords?.find(r => { try { return (JSON.parse(r.content) as TeamData).team === selectedTeam; } catch { return false; } });

  useEffect(() => {
    if (teamRecord) {
      try {
        const parsed = JSON.parse(teamRecord.content);
        if (parsed.items && Array.isArray(parsed.items)) {
          setEquipmentList(parsed.items.map((item: any) => ({ ...item, category: item.category || getCategoryFromName(item.name), status: item.status || "등록" })));
          setEditingRecordId(teamRecord.id);
        }
      } catch {
        setEquipmentList(DEFAULT_EQUIPMENT_LIST);
        setEditingRecordId(null);
      }
    } else if (selectedTeam) {
      setEquipmentList(DEFAULT_EQUIPMENT_LIST);
      setEditingRecordId(null);
    }
    setEditingRowIndex(null);
  }, [teamRecord, selectedTeam]);

  const getCategoryFromName = (name: string): string => DEFAULT_EQUIPMENT_LIST.find(item => item.name === name)?.category || "기타품목";

  const handleQuantityChange = (index: number, value: string) => {
    const newList = [...equipmentList];
    newList[index].quantity = parseInt(value) || 0;
    setEquipmentList(newList);
  };
  const handleStatusChange = (index: number, status: string) => {
    const newList = [...equipmentList];
    newList[index].status = status;
    setEquipmentList(newList);
  };
  const handleCategoryChange = (index: number, category: string) => {
    const newList = [...equipmentList];
    newList[index].category = category;
    setEquipmentList(newList);
  };
  const handleRemoveItem = (index: number) => {
    setEquipmentList(equipmentList.filter((_, i) => i !== index));
    setEditingRowIndex(null);
  };

  const handleSave = () => {
    if (!selectedTeam) { toast({ variant: "destructive", title: "팀을 선택해주세요." }); return; }
    const contentData = JSON.stringify({ team: selectedTeam, items: equipmentList, lastUpdated: new Date().toISOString() });
    if (editingRecordId) {
      updateRecord({ id: editingRecordId, title: `${selectedTeam} 보호구 현황`, content: contentData }, { onSuccess: () => { toast({ title: "저장 완료", description: `${selectedTeam} 보호구 현황이 업데이트되었습니다.` }); setEditMode(false); setEditingRowIndex(null); } });
    } else {
      createRecord({ title: `${selectedTeam} 보호구 현황`, content: contentData, category: "equip_status" }, { onSuccess: () => { toast({ title: "등록 완료", description: `${selectedTeam} 보호구 현황이 등록되었습니다.` }); setEditMode(false); setEditingRowIndex(null); } });
    }
  };

  // 단일 등록 핸들러
  const handleSingleRegister = async () => {
    if (!singleTeam) { toast({ variant: "destructive", title: "팀을 선택해주세요." }); return; }
    if (!singleName.trim()) { toast({ variant: "destructive", title: "용품명을 입력해주세요." }); return; }
    setIsSingleSaving(true);
    try {
      const existingRecord = statusRecords?.find(r => { try { return (JSON.parse(r.content) as TeamData).team === singleTeam; } catch { return false; } });
      const newItem: EquipmentItem = { name: singleName.trim(), quantity: singleQty, category: singleCategory, status: singleStatus };
      if (existingRecord) {
        const parsed = JSON.parse(existingRecord.content) as TeamData;
        const alreadyExists = parsed.items?.find(i => i.name === singleName.trim());
        if (alreadyExists) { toast({ variant: "destructive", title: `"${singleName.trim()}"은(는) 이미 ${singleTeam}에 등록되어 있습니다.` }); setIsSingleSaving(false); return; }
        const newItems = [...(parsed.items || []), newItem];
        const contentData = JSON.stringify({ team: singleTeam, items: newItems, lastUpdated: new Date().toISOString() });
        await new Promise<void>(resolve => updateRecord({ id: existingRecord.id, title: existingRecord.title, content: contentData }, { onSuccess: () => resolve(), onError: () => resolve() }));
      } else {
        const initItems = DEFAULT_EQUIPMENT_LIST.map(d => ({ ...d }));
        if (!initItems.find(i => i.name === newItem.name)) initItems.push(newItem);
        else { const idx = initItems.findIndex(i => i.name === newItem.name); initItems[idx] = newItem; }
        const contentData = JSON.stringify({ team: singleTeam, items: initItems, lastUpdated: new Date().toISOString() });
        await new Promise<void>(resolve => createRecord({ title: `${singleTeam} 보호구 현황`, content: contentData, category: "equip_status" }, { onSuccess: () => resolve(), onError: () => resolve() }));
      }
      queryClient.invalidateQueries({ queryKey: ['/api/notices'] });
      toast({ title: "등록 완료", description: `${singleTeam}에 "${singleName.trim()}"이(가) 등록되었습니다.` });
      setSingleName(""); setSingleQty(0); setSingleStatus("등록");
    } finally {
      setIsSingleSaving(false);
    }
  };

  // 팀별 전체 등록 핸들러
  const handleBulkRegister = async () => {
    if (!bulkName.trim()) { toast({ variant: "destructive", title: "용품명을 입력해주세요." }); return; }
    setIsBulkSaving(true);
    try {
      let successCount = 0;
      let skipCount = 0;
      let newTeamCount = 0;
      for (const teamName of TEAMS) {
        const teamQty = bulkTeamQtys[teamName] ?? 0;
        const newItem: EquipmentItem = { name: bulkName.trim(), quantity: teamQty, category: bulkCategory, status: bulkStatus };
        const existingRecord = statusRecords?.find(r => { try { return (JSON.parse(r.content) as TeamData).team === teamName; } catch { return false; } });
        if (existingRecord) {
          const parsed = JSON.parse(existingRecord.content) as TeamData;
          if (parsed.items?.find(i => i.name === bulkName.trim())) { skipCount++; continue; }
          const newItems = [...(parsed.items || []), newItem];
          const contentData = JSON.stringify({ team: teamName, items: newItems, lastUpdated: new Date().toISOString() });
          await new Promise<void>(resolve => updateRecord({ id: existingRecord.id, title: existingRecord.title, content: contentData }, { onSuccess: () => { successCount++; resolve(); }, onError: () => resolve() }));
        } else {
          const initItems = DEFAULT_EQUIPMENT_LIST.map(d => ({ ...d }));
          if (!initItems.find(i => i.name === newItem.name)) initItems.push(newItem);
          else { const idx = initItems.findIndex(i => i.name === newItem.name); initItems[idx] = newItem; }
          const contentData = JSON.stringify({ team: teamName, items: initItems, lastUpdated: new Date().toISOString() });
          await new Promise<void>(resolve => createRecord({ title: `${teamName} 보호구 현황`, content: contentData, category: "equip_status" }, { onSuccess: () => { newTeamCount++; successCount++; resolve(); }, onError: () => resolve() }));
        }
      }
      queryClient.invalidateQueries({ queryKey: ['/api/notices'] });
      const desc = [`전체 ${TEAMS.length}개 팀`, `추가 완료: ${successCount}개 팀`, skipCount > 0 ? `이미 존재: ${skipCount}개 팀` : null, newTeamCount > 0 ? `신규 생성: ${newTeamCount}개 팀` : null].filter(Boolean).join(" / ");
      toast({ title: "팀별 전체 등록 완료", description: desc });
      setBulkName("");
      setBulkTeamQtys(Object.fromEntries(TEAMS.map(t => [t, 0])));
      setBulkAllQty(0);
      setBulkStatus("등록");
    } finally {
      setIsBulkSaving(false);
    }
  };

  const openAddDialog = (tab: string) => { setAddDialogTab(tab); setAddDialogOpen(true); };

  return (
    <div className={embedded ? "space-y-4" : "max-w-7xl mx-auto space-y-6"}>
      {/* ── 툴바 ── */}
      <div className="flex items-center gap-2 flex-wrap">
        {!embedded && (
          <Link href="/equipment">
            <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back"><ChevronLeft className="w-5 h-5" /></Button>
          </Link>
        )}
        {!embedded && (
          <div className="flex-1">
            <h2 className="text-2xl font-bold">등록 현황</h2>
            <p className="text-xs text-muted-foreground"><span className="text-blue-600">등록</span> / <span className="text-green-600">양호</span> / <span className="text-red-600">불량</span></p>
          </div>
        )}
        {embedded && <div className="flex-1" />}

        <Select value={selectedTeam} onValueChange={val => { setSelectedTeam(val); setEditMode(false); setEditingRowIndex(null); }}>
          <SelectTrigger className={embedded ? "w-[140px] h-8 text-xs" : "w-[180px]"} data-testid="select-team">
            <SelectValue placeholder="팀 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {TEAMS.map(team => <SelectItem key={team} value={team}>{team}</SelectItem>)}
          </SelectContent>
        </Select>

        {canEditEquipmentStatus && selectedTeam && selectedTeam !== "all" && (
          <Button variant={editMode ? "default" : "outline"} onClick={() => { setEditMode(!editMode); setEditingRowIndex(null); }} className="gap-2" data-testid="button-edit-mode">
            <Edit2 className="w-4 h-4" />
            {editMode ? "편집 중" : "편집"}
          </Button>
        )}

        {canEditEquipmentStatus && (
          <Button onClick={() => openAddDialog("single")} className="gap-2" data-testid="button-open-add-dialog">
            <Plus className="w-4 h-4" />
            보호구 등록
          </Button>
        )}

        <input type="file" ref={fileInputRef} onChange={handleExcelUpload} accept=".xlsx,.xls" className="hidden" data-testid="input-equipment-upload" />
        {canEditEquipmentStatus && (
          <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isUploading} className="gap-2" data-testid="button-upload-equipment">
            <Upload className="w-4 h-4" />
            엑셀 업로드
          </Button>
        )}
        {canDownloadEquipmentExcel && (
          <Button variant="secondary" onClick={handleExcelDownload} className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white" data-testid="button-download-equipment">
            <Download className="w-4 h-4" />
            엑셀 다운로드
          </Button>
        )}
      </div>

      {/* ── 현황 카드 그리드 ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 max-h-[600px] overflow-hidden flex flex-col">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant={!selectedCategory ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory(null)}>전체</Button>
              {CATEGORIES.map(cat => (
                <Button key={cat.id} variant={selectedCategory === cat.id ? "default" : "outline"} size="sm" onClick={() => setSelectedCategory(cat.id)} className="gap-1">
                  <cat.icon className="w-3 h-3" />{cat.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2">
            <EquipmentListItem name="전체" totalQuantity={categoryStats.totalQuantity} registeredQty={categoryStats.registeredQty} goodQty={categoryStats.goodQty} badQty={categoryStats.badQty} isSelected={!selectedCategory} onClick={() => setSelectedCategory(null)} icon={HardHat} />
            <div className="border-t my-2" />
            {filteredCategories.map((item, idx) => {
              const categoryInfo = CATEGORIES.find(c => c.id === item.category);
              return <EquipmentListItem key={idx} name={item.name} totalQuantity={item.totalQuantity} registeredQty={item.registeredQty} goodQty={item.goodQty} badQty={item.badQty} isSelected={false} onClick={() => {}} icon={categoryInfo?.icon} />;
            })}
            {filteredCategories.length === 0 && <div className="text-center py-8 text-muted-foreground">등록된 보호구가 없습니다.</div>}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">{selectedCategory || "전체"} 현황</CardTitle>
          </CardHeader>
          <CardContent className="p-3 sm:p-6">
            <div className="grid grid-cols-3 gap-2 sm:gap-6 mb-4 sm:mb-8">
              <CircularProgress value={categoryStats.registeredQty} max={categoryStats.totalQuantity || 1} color="#3b82f6" label="등록" size={90} />
              <CircularProgress value={categoryStats.goodQty} max={categoryStats.totalQuantity || 1} color="#22c55e" label="양호" size={90} />
              <CircularProgress value={categoryStats.badQty} max={categoryStats.totalQuantity || 1} color="#ef4444" label="불량" size={90} />
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-4 text-center border-t pt-4 sm:pt-6">
              <div><div className="text-xl sm:text-3xl font-bold text-blue-600">{categoryStats.registeredQty}</div><div className="text-xs sm:text-sm text-muted-foreground">등록</div></div>
              <div><div className="text-xl sm:text-3xl font-bold text-green-600">{categoryStats.goodQty}</div><div className="text-xs sm:text-sm text-muted-foreground">양호</div></div>
              <div><div className="text-xl sm:text-3xl font-bold text-red-600">{categoryStats.badQty}</div><div className="text-xs sm:text-sm text-muted-foreground">불량</div></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 팀 편집 패널 ── */}
      {editMode && selectedTeam && selectedTeam !== "all" && (
        <Card className="border-amber-200 dark:border-amber-900/30">
          <CardHeader className="bg-amber-50/50 dark:bg-amber-900/10 border-b flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg">{selectedTeam} 보호구 편집</CardTitle>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => { setEditMode(false); setEditingRowIndex(null); }}>취소</Button>
              <Button onClick={handleSave} disabled={isCreating || isUpdating} className="bg-amber-600 hover:bg-amber-700 text-white gap-2" data-testid="button-save">
                <Save className="w-4 h-4" />{isCreating || isUpdating ? "저장 중..." : "저장"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            <div className="border rounded-lg overflow-hidden max-h-[500px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium text-xs">구분</th>
                    <th className="p-2 text-left font-medium text-xs">용품명</th>
                    <th className="p-2 text-center font-medium text-xs w-24">수량</th>
                    <th className="p-2 text-center font-medium text-xs w-28">상태</th>
                    <th className="p-2 w-16 text-xs text-center">관리</th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentList.map((item, index) => (
                    <tr key={index} className={`border-t transition-colors ${editingRowIndex === index ? "bg-amber-50/60 dark:bg-amber-900/10" : "hover:bg-muted/20"}`}>
                      <td className="p-2">
                        {editingRowIndex === index ? (
                          <Select value={item.category} onValueChange={val => handleCategoryChange(index, val)}>
                            <SelectTrigger className="h-8 text-xs w-24"><SelectValue /></SelectTrigger>
                            <SelectContent>{CATEGORIES.map(cat => <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className="text-xs">{item.category}</Badge>
                        )}
                      </td>
                      <td className="p-2 font-medium text-sm">{item.name}</td>
                      <td className="p-2 text-center">
                        {editingRowIndex === index ? (
                          <Input type="number" min="0" value={item.quantity} onChange={e => handleQuantityChange(index, e.target.value)} className="w-16 mx-auto text-center h-8" data-testid={`input-qty-${index}`} />
                        ) : (
                          <span className="tabular-nums font-semibold">{item.quantity}</span>
                        )}
                      </td>
                      <td className="p-2 text-center">
                        {editingRowIndex === index ? (
                          <Select value={item.status} onValueChange={val => handleStatusChange(index, val)}>
                            <SelectTrigger className={`h-8 text-xs w-20 mx-auto ${item.status === "양호" ? "text-green-600 bg-green-50" : item.status === "불량" ? "text-red-600 bg-red-50" : "text-blue-600 bg-blue-50"}`} data-testid={`select-status-${index}`}><SelectValue /></SelectTrigger>
                            <SelectContent>{STATUS_OPTIONS.map(opt => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}</SelectContent>
                          </Select>
                        ) : (
                          <Badge variant="outline" className={`text-xs ${item.status === "양호" ? "text-green-600 border-green-300 bg-green-50" : item.status === "불량" ? "text-red-600 border-red-300 bg-red-50" : "text-blue-600 border-blue-300 bg-blue-50"}`}>{item.status}</Badge>
                        )}
                      </td>
                      <td className="p-2">
                        <div className="flex gap-1 justify-center">
                          {editingRowIndex === index ? (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-amber-600 hover:text-amber-700" onClick={() => setEditingRowIndex(null)} data-testid={`button-confirm-${index}`}>
                              <CheckCircle2 className="w-4 h-4" />
                            </Button>
                          ) : (
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditingRowIndex(index)} data-testid={`button-edit-row-${index}`}>
                              <Pencil className="w-3.5 h-3.5" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => handleRemoveItem(index)} data-testid={`button-remove-${index}`}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── 등록 Dialog ── */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HardHat className="w-5 h-5 text-primary" />
              보호구 등록
            </DialogTitle>
          </DialogHeader>

          <Tabs value={addDialogTab} onValueChange={setAddDialogTab}>
            <TabsList className="grid grid-cols-2 w-full">
              <TabsTrigger value="single" className="gap-2" data-testid="tab-single">
                <User className="w-4 h-4" />단일 등록
              </TabsTrigger>
              <TabsTrigger value="bulk" className="gap-2" data-testid="tab-bulk">
                <Users className="w-4 h-4" />팀별 전체 등록
              </TabsTrigger>
            </TabsList>

            {/* 단일 등록 */}
            <TabsContent value="single" className="space-y-4 pt-3">
              <p className="text-xs text-muted-foreground">특정 팀에 보호구 항목을 등록합니다.</p>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">팀 선택 <span className="text-destructive">*</span></label>
                  <Select value={singleTeam} onValueChange={setSingleTeam}>
                    <SelectTrigger data-testid="select-single-team"><SelectValue placeholder="팀을 선택하세요" /></SelectTrigger>
                    <SelectContent>{TEAMS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">카테고리</label>
                  <Select value={singleCategory} onValueChange={setSingleCategory}>
                    <SelectTrigger data-testid="select-single-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">용품명 <span className="text-destructive">*</span></label>
                  <Input placeholder="용품명을 입력하세요" value={singleName} onChange={e => setSingleName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSingleRegister()} data-testid="input-single-name" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">수량</label>
                    <Input type="number" min="0" value={singleQty} onChange={e => setSingleQty(parseInt(e.target.value) || 0)} data-testid="input-single-qty" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">상태</label>
                    <Select value={singleStatus} onValueChange={setSingleStatus}>
                      <SelectTrigger data-testid="select-single-status"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>취소</Button>
                <Button onClick={handleSingleRegister} disabled={isSingleSaving || !singleTeam || !singleName.trim()} className="gap-2" data-testid="button-single-submit">
                  <Plus className="w-4 h-4" />{isSingleSaving ? "등록 중..." : "등록"}
                </Button>
              </DialogFooter>
            </TabsContent>

            {/* 팀별 전체 등록 */}
            <TabsContent value="bulk" className="space-y-3 pt-3">
              {/* 공통 필드 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">카테고리</label>
                  <Select value={bulkCategory} onValueChange={setBulkCategory}>
                    <SelectTrigger data-testid="select-bulk-category"><SelectValue /></SelectTrigger>
                    <SelectContent>{CATEGORIES.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">상태</label>
                  <Select value={bulkStatus} onValueChange={setBulkStatus}>
                    <SelectTrigger data-testid="select-bulk-status"><SelectValue /></SelectTrigger>
                    <SelectContent>{STATUS_OPTIONS.map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">용품명 <span className="text-destructive">*</span></label>
                <Input placeholder="전체 팀에 추가할 용품명" value={bulkName} onChange={e => setBulkName(e.target.value)} data-testid="input-bulk-name" />
              </div>

              {/* 일괄 수량 설정 */}
              <div className="flex items-center gap-2 p-2 rounded-lg bg-muted/40 border">
                <span className="text-xs text-muted-foreground whitespace-nowrap">전체 일괄 적용:</span>
                <Input
                  type="number" min="0"
                  value={bulkAllQty}
                  onChange={e => setBulkAllQty(parseInt(e.target.value) || 0)}
                  className="h-8 w-20 text-center"
                  data-testid="input-bulk-all-qty"
                />
                <Button
                  variant="outline" size="sm" className="h-8 text-xs whitespace-nowrap"
                  onClick={() => setBulkTeamQtys(Object.fromEntries(TEAMS.map(t => [t, bulkAllQty])))}
                  data-testid="button-apply-all-qty"
                >
                  전체 적용
                </Button>
              </div>

              {/* 팀별 수량 입력 테이블 */}
              <div className="border rounded-lg overflow-hidden">
                <div className="max-h-[260px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="p-2 text-left text-xs font-medium text-muted-foreground">팀명</th>
                        <th className="p-2 text-center text-xs font-medium text-muted-foreground w-24">수량</th>
                      </tr>
                    </thead>
                    <tbody>
                      {TEAMS.map(team => (
                        <tr key={team} className="border-t hover:bg-muted/20">
                          <td className="px-3 py-1.5 text-sm">{team}</td>
                          <td className="px-3 py-1.5 text-center">
                            <Input
                              type="number" min="0"
                              value={bulkTeamQtys[team] ?? 0}
                              onChange={e => setBulkTeamQtys(prev => ({ ...prev, [team]: parseInt(e.target.value) || 0 }))}
                              className="h-7 w-20 mx-auto text-center text-sm"
                              data-testid={`input-bulk-qty-${team}`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>취소</Button>
                <Button onClick={handleBulkRegister} disabled={isBulkSaving || !bulkName.trim()} className="gap-2 bg-green-600 hover:bg-green-700 text-white" data-testid="button-bulk-submit">
                  <Users className="w-4 h-4" />{isBulkSaving ? "등록 중..." : `전체 ${TEAMS.length}개 팀에 등록`}
                </Button>
              </DialogFooter>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
}
