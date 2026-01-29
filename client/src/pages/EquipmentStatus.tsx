import { useNotices, useCreateNotice, useDeleteNotice, useUpdateNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HardHat, Plus, Trash2, ChevronLeft, Save, Edit2, Cone, Package } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { Link } from "wouter";

const TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀"];

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
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            fill="transparent"
            className="text-muted/20"
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            fill="transparent"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            className="transition-all duration-500"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold">{value}</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-medium text-muted-foreground">{label}</span>
    </div>
  );
}

function EquipmentListItem({ 
  name, 
  totalQuantity,
  registeredQty, 
  goodQty, 
  badQty, 
  isSelected, 
  onClick,
  icon: Icon
}: { 
  name: string; 
  totalQuantity: number;
  registeredQty: number; 
  goodQty: number; 
  badQty: number; 
  isSelected: boolean; 
  onClick: () => void;
  icon?: any;
}) {
  return (
    <motion.div
      onClick={onClick}
      className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all ${
        isSelected 
          ? "bg-primary/10 border-l-4 border-primary" 
          : "hover:bg-muted/50"
      }`}
      whileHover={{ x: 4 }}
    >
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

export default function EquipmentStatus() {
  const { data: statusRecords, isLoading } = useNotices("equip_status");
  const { mutate: createRecord, isPending: isCreating } = useCreateNotice();
  const { mutate: updateRecord, isPending: isUpdating } = useUpdateNotice();
  const { mutate: deleteRecord } = useDeleteNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [selectedTeam, setSelectedTeam] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [bulkAddMode, setBulkAddMode] = useState(false);
  const [equipmentList, setEquipmentList] = useState<EquipmentItem[]>(DEFAULT_EQUIPMENT_LIST);
  const [editingRecordId, setEditingRecordId] = useState<number | null>(null);
  const [newItemName, setNewItemName] = useState("");
  const [newItemCategory, setNewItemCategory] = useState("보호구");
  const [bulkItemName, setBulkItemName] = useState("");
  const [bulkItemCategory, setBulkItemCategory] = useState("보호구");

  const allTeamsData = useMemo(() => {
    if (!statusRecords) return [];
    return statusRecords.map(record => {
      try {
        return JSON.parse(record.content) as TeamData;
      } catch {
        return null;
      }
    }).filter(Boolean) as TeamData[];
  }, [statusRecords]);

  const aggregatedData = useMemo(() => {
    const allItems: EquipmentItem[] = [];
    const teamsToShow = selectedTeam && selectedTeam !== "all" 
      ? allTeamsData.filter(t => t.team === selectedTeam)
      : allTeamsData;
    
    teamsToShow.forEach(team => {
      if (team.items) {
        team.items.forEach(item => {
          allItems.push({ ...item, category: item.category || "기타품목", status: item.status || "등록" });
        });
      }
    });
    return allItems;
  }, [allTeamsData, selectedTeam]);

  const categoryStats = useMemo(() => {
    const items = selectedCategory 
      ? aggregatedData.filter(i => i.category === selectedCategory)
      : aggregatedData;
    
    const goodQty = items.filter(i => i.status === "양호").reduce((sum, i) => sum + (i.quantity || 0), 0);
    const badQty = items.filter(i => i.status === "불량").reduce((sum, i) => sum + (i.quantity || 0), 0);
    const registeredQty = goodQty + badQty;
    
    return {
      total: items.length,
      totalQuantity: items.reduce((sum, i) => sum + (i.quantity || 0), 0),
      registeredQty,
      goodQty,
      badQty,
    };
  }, [aggregatedData, selectedCategory]);

  const equipmentCategories = useMemo(() => {
    const uniqueNames = Array.from(new Set(aggregatedData.map(i => i.name)));
    return uniqueNames.map(name => {
      const items = aggregatedData.filter(i => i.name === name);
      const goodQty = items.filter(i => i.status === "양호").reduce((sum, i) => sum + (i.quantity || 0), 0);
      const badQty = items.filter(i => i.status === "불량").reduce((sum, i) => sum + (i.quantity || 0), 0);
      const registeredQty = goodQty + badQty;
      
      return {
        name,
        category: items[0]?.category || "기타품목",
        totalQuantity: items.reduce((sum, i) => sum + (i.quantity || 0), 0),
        registeredQty,
        goodQty,
        badQty,
      };
    });
  }, [aggregatedData]);

  const filteredCategories = useMemo(() => {
    if (!selectedCategory) return equipmentCategories;
    return equipmentCategories.filter(e => e.category === selectedCategory);
  }, [equipmentCategories, selectedCategory]);

  const teamRecord = statusRecords?.find(r => {
    try {
      const parsed = JSON.parse(r.content);
      return parsed.team === selectedTeam;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (teamRecord) {
      try {
        const parsed = JSON.parse(teamRecord.content);
        if (parsed.items && Array.isArray(parsed.items)) {
          const itemsWithFields = parsed.items.map((item: any) => ({
            ...item,
            category: item.category || getCategoryFromName(item.name),
            status: item.status || "등록"
          }));
          setEquipmentList(itemsWithFields);
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
  }, [teamRecord, selectedTeam]);

  const getCategoryFromName = (name: string): string => {
    const defaultItem = DEFAULT_EQUIPMENT_LIST.find(item => item.name === name);
    return defaultItem?.category || "기타품목";
  };

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

  const handleAddItem = () => {
    if (!newItemName.trim()) return;
    if (equipmentList.some(item => item.name === newItemName.trim())) {
      toast({ variant: "destructive", title: "이미 존재하는 용품입니다." });
      return;
    }
    setEquipmentList([...equipmentList, { name: newItemName.trim(), quantity: 0, category: newItemCategory, status: "등록" }]);
    setNewItemName("");
    toast({ title: "용품 추가됨" });
  };

  const handleRemoveItem = (index: number) => {
    const newList = equipmentList.filter((_, i) => i !== index);
    setEquipmentList(newList);
  };

  const handleSave = () => {
    if (!selectedTeam) {
      toast({ variant: "destructive", title: "팀을 선택해주세요." });
      return;
    }

    const contentData = JSON.stringify({
      team: selectedTeam,
      items: equipmentList,
      lastUpdated: new Date().toISOString()
    });

    if (editingRecordId) {
      updateRecord({ id: editingRecordId, title: `${selectedTeam} 보호구 현황`, content: contentData }, {
        onSuccess: () => {
          toast({ title: "저장 완료", description: `${selectedTeam} 보호구 현황이 업데이트되었습니다.` });
          setEditMode(false);
        }
      });
    } else {
      createRecord({ title: `${selectedTeam} 보호구 현황`, content: contentData, category: "equip_status" }, {
        onSuccess: () => {
          toast({ title: "등록 완료", description: `${selectedTeam} 보호구 현황이 등록되었습니다.` });
          setEditMode(false);
        }
      });
    }
  };

  const handleBulkAdd = async () => {
    if (!bulkItemName.trim()) {
      toast({ variant: "destructive", title: "용품명을 입력해주세요." });
      return;
    }

    let successCount = 0;
    let errorCount = 0;

    for (const record of statusRecords || []) {
      try {
        const parsed = JSON.parse(record.content) as TeamData;
        const existingItem = parsed.items?.find(i => i.name === bulkItemName.trim());
        
        if (existingItem) {
          continue;
        }

        const newItems = [
          ...(parsed.items || []),
          { name: bulkItemName.trim(), quantity: 0, category: bulkItemCategory, status: "등록" }
        ];

        const contentData = JSON.stringify({
          team: parsed.team,
          items: newItems,
          lastUpdated: new Date().toISOString()
        });

        await new Promise<void>((resolve, reject) => {
          updateRecord({ id: record.id, title: record.title, content: contentData }, {
            onSuccess: () => { successCount++; resolve(); },
            onError: () => { errorCount++; resolve(); }
          });
        });
      } catch {
        errorCount++;
      }
    }

    setBulkItemName("");
    toast({ 
      title: "일괄 추가 완료", 
      description: `${successCount}개 팀에 추가되었습니다.${errorCount > 0 ? ` (${errorCount}개 실패)` : ""}`
    });
    setBulkAddMode(false);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/equipment">
          <Button variant="ghost" size="icon" className="shrink-0" data-testid="button-back">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h2 className="text-2xl font-bold">등록 현황</h2>
          <p className="text-sm text-muted-foreground">
            <span className="text-blue-600">등록</span> / <span className="text-green-600">양호</span> / <span className="text-red-600">불량</span>
          </p>
        </div>
        <Select value={selectedTeam} onValueChange={(val) => { setSelectedTeam(val); setEditMode(false); }}>
          <SelectTrigger className="w-[200px]" data-testid="select-team">
            <SelectValue placeholder="팀 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {TEAMS.map(team => (
              <SelectItem key={team} value={team}>{team}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedTeam && selectedTeam !== "all" && (
          <Button 
            variant={editMode ? "default" : "outline"}
            onClick={() => { setEditMode(!editMode); setBulkAddMode(false); }}
            className="gap-2"
            data-testid="button-edit-mode"
          >
            <Edit2 className="w-4 h-4" />
            {editMode ? "편집 중" : "편집"}
          </Button>
        )}
        <Button 
          variant={bulkAddMode ? "default" : "outline"}
          onClick={() => { setBulkAddMode(!bulkAddMode); setEditMode(false); }}
          className="gap-2"
          data-testid="button-bulk-add"
        >
          <Plus className="w-4 h-4" />
          일괄 추가
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-1 max-h-[600px] overflow-hidden flex flex-col">
          <CardHeader className="border-b pb-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Button 
                variant={!selectedCategory ? "default" : "outline"} 
                size="sm"
                onClick={() => setSelectedCategory(null)}
              >
                전체
              </Button>
              {CATEGORIES.map(cat => (
                <Button 
                  key={cat.id}
                  variant={selectedCategory === cat.id ? "default" : "outline"} 
                  size="sm"
                  onClick={() => setSelectedCategory(cat.id)}
                  className="gap-1"
                >
                  <cat.icon className="w-3 h-3" />
                  {cat.label}
                </Button>
              ))}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-2">
            <EquipmentListItem
              name="전체"
              totalQuantity={categoryStats.totalQuantity}
              registeredQty={categoryStats.registeredQty}
              goodQty={categoryStats.goodQty}
              badQty={categoryStats.badQty}
              isSelected={!selectedCategory}
              onClick={() => setSelectedCategory(null)}
              icon={HardHat}
            />
            <div className="border-t my-2" />
            {filteredCategories.map((item, idx) => {
              const categoryInfo = CATEGORIES.find(c => c.id === item.category);
              return (
                <EquipmentListItem
                  key={idx}
                  name={item.name}
                  totalQuantity={item.totalQuantity}
                  registeredQty={item.registeredQty}
                  goodQty={item.goodQty}
                  badQty={item.badQty}
                  isSelected={false}
                  onClick={() => {}}
                  icon={categoryInfo?.icon}
                />
              );
            })}
            {filteredCategories.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                등록된 보호구가 없습니다.
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="border-b">
            <CardTitle className="text-lg">
              {selectedCategory || "전체"} 현황
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-3 gap-8 mb-8">
              <CircularProgress 
                value={categoryStats.registeredQty} 
                max={categoryStats.totalQuantity || 1} 
                color="#3b82f6" 
                label="등록"
                size={140}
              />
              <CircularProgress 
                value={categoryStats.goodQty} 
                max={categoryStats.totalQuantity || 1} 
                color="#22c55e" 
                label="양호"
                size={140}
              />
              <CircularProgress 
                value={categoryStats.badQty} 
                max={categoryStats.totalQuantity || 1} 
                color="#ef4444" 
                label="불량"
                size={140}
              />
            </div>

            <div className="grid grid-cols-3 gap-4 text-center border-t pt-6">
              <div>
                <div className="text-3xl font-bold text-blue-600">{categoryStats.registeredQty}</div>
                <div className="text-sm text-muted-foreground">등록</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-green-600">{categoryStats.goodQty}</div>
                <div className="text-sm text-muted-foreground">양호</div>
              </div>
              <div>
                <div className="text-3xl font-bold text-red-600">{categoryStats.badQty}</div>
                <div className="text-sm text-muted-foreground">불량</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {editMode && selectedTeam && selectedTeam !== "all" && (
        <Card className="border-amber-200 dark:border-amber-900/30">
          <CardHeader className="bg-amber-50/50 dark:bg-amber-900/10 border-b flex flex-row items-center justify-between gap-4">
            <CardTitle className="text-lg">{selectedTeam} 보호구 편집</CardTitle>
            <Button 
              onClick={handleSave} 
              disabled={isLocked || isCreating || isUpdating}
              className="bg-amber-600 hover:bg-amber-700 text-white gap-2"
              data-testid="button-save"
            >
              <Save className="w-4 h-4" />
              {isCreating || isUpdating ? "저장 중..." : "저장"}
            </Button>
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="p-3 bg-muted/30 rounded-lg border flex flex-wrap gap-2 items-center">
              <Select value={newItemCategory} onValueChange={setNewItemCategory}>
                <SelectTrigger className="w-[140px]" data-testid="select-new-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input 
                placeholder="새 용품명" 
                value={newItemName} 
                onChange={e => setNewItemName(e.target.value)}
                className="flex-1 min-w-[200px]"
                data-testid="input-new-item"
                onKeyDown={e => e.key === 'Enter' && handleAddItem()}
              />
              <Button onClick={handleAddItem} disabled={!newItemName.trim()} className="gap-1" data-testid="button-add-item">
                <Plus className="w-4 h-4" /> 추가
              </Button>
            </div>

            <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="p-2 text-left font-medium">구분</th>
                    <th className="p-2 text-left font-medium">용품명</th>
                    <th className="p-2 text-center font-medium w-24">수량</th>
                    <th className="p-2 text-center font-medium w-28">상태</th>
                    <th className="p-2 w-12"></th>
                  </tr>
                </thead>
                <tbody>
                  {equipmentList.map((item, index) => (
                    <tr key={index} className="border-t hover:bg-muted/20">
                      <td className="p-2">
                        <Select value={item.category} onValueChange={val => handleCategoryChange(index, val)}>
                          <SelectTrigger className="h-8 text-xs w-24">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(cat => (
                              <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2 font-medium">{item.name}</td>
                      <td className="p-2 text-center">
                        <Input
                          type="number"
                          min="0"
                          value={item.quantity}
                          onChange={e => handleQuantityChange(index, e.target.value)}
                          className="w-16 mx-auto text-center h-8"
                          data-testid={`input-qty-${index}`}
                        />
                      </td>
                      <td className="p-2 text-center">
                        <Select value={item.status} onValueChange={val => handleStatusChange(index, val)}>
                          <SelectTrigger 
                            className={`h-8 text-xs w-20 mx-auto ${
                              item.status === "양호" ? "text-green-600 bg-green-50" : 
                              item.status === "불량" ? "text-red-600 bg-red-50" : 
                              "text-blue-600 bg-blue-50"
                            }`}
                            data-testid={`select-status-${index}`}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map(opt => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleRemoveItem(index)}
                          className="h-8 w-8"
                          data-testid={`button-remove-${index}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {bulkAddMode && (
        <Card className="border-green-200 dark:border-green-900/30">
          <CardHeader className="bg-green-50/50 dark:bg-green-900/10 border-b">
            <CardTitle className="text-lg flex items-center gap-2">
              <Plus className="w-5 h-5 text-green-600" />
              모든 팀에 용품 일괄 추가
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground mb-4">
              새 용품을 등록하면 모든 팀(7개 팀)에 동시에 추가됩니다.
            </p>
            <div className="flex flex-wrap gap-3 items-center">
              <Select value={bulkItemCategory} onValueChange={setBulkItemCategory}>
                <SelectTrigger className="w-[140px]" data-testid="select-bulk-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input 
                placeholder="용품명 입력" 
                value={bulkItemName} 
                onChange={e => setBulkItemName(e.target.value)}
                className="flex-1 min-w-[250px]"
                data-testid="input-bulk-item"
                onKeyDown={e => e.key === 'Enter' && handleBulkAdd()}
              />
              <Button 
                onClick={handleBulkAdd} 
                disabled={!bulkItemName.trim() || isUpdating}
                className="bg-green-600 hover:bg-green-700 text-white gap-2"
                data-testid="button-bulk-add-submit"
              >
                <Plus className="w-4 h-4" />
                {isUpdating ? "추가 중..." : "전체 팀에 추가"}
              </Button>
              <Button 
                variant="outline"
                onClick={() => setBulkAddMode(false)}
              >
                취소
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
