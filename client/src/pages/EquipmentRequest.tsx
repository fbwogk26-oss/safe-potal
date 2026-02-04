import { useNotices, useCreateNotice, useDeleteNotice, useUpdateNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShoppingCart, Plus, Trash2, ChevronLeft, Clock, CheckCircle2, FileText, Send, Minus, Download, Image, Settings, PenLine } from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀"];

const DEFAULT_EQUIPMENT = [
  { name: "안전모(일반)", category: "보호구" },
  { name: "일반안전화", category: "보호구" },
  { name: "하계안전화", category: "보호구" },
  { name: "실내안전화", category: "보호구" },
  { name: "안전장화", category: "보호구" },
  { name: "안전대(복합식)", category: "보호구" },
  { name: "절연장갑", category: "보호구" },
  { name: "안전모(임업)", category: "보호구" },
  { name: "안전모(신호수)", category: "보호구" },
  { name: "추락방지대(로프식)", category: "보호구" },
  { name: "추락방지대(와이어식)", category: "보호구" },
  { name: "휴대용소화기", category: "안전용품" },
  { name: "반사조끼(주황색조끼)", category: "안전용품" },
  { name: "수평구명줄SET", category: "안전용품" },
  { name: "비상용삼각대", category: "안전용품" },
  { name: "접이식 라바콘", category: "안전용품" },
  { name: "차량 고임목", category: "안전용품" },
  { name: "A형사다리", category: "기타품목" },
  { name: "아웃트리거", category: "기타품목" },
  { name: "블랙박스", category: "기타품목" },
  { name: "후방센서", category: "기타품목" },
  { name: "후방카메라", category: "기타품목" },
];

interface SelectedItem {
  name: string;
  quantity: number;
  category: string;
}

interface SafetyEquipment {
  id: number;
  name: string;
  category: string;
  imageUrl?: string;
}

export default function EquipmentRequest() {
  const queryClient = useQueryClient();
  const { data: requests, isLoading } = useNotices("equip_request");
  const { mutate: createRequest, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteRequest } = useDeleteNotice();
  const { mutate: updateRequest, isPending: isUpdating } = useUpdateNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const { data: dbEquipment } = useQuery<SafetyEquipment[]>({
    queryKey: ['/api/safety-equipment'],
  });

  const EQUIPMENT_LIST = dbEquipment && dbEquipment.length > 0 
    ? dbEquipment.map(e => ({ name: e.name, category: e.category, imageUrl: e.imageUrl }))
    : DEFAULT_EQUIPMENT;

  const [selectedTeam, setSelectedTeam] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [title, setTitle] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");
  
  const [customItemName, setCustomItemName] = useState("");
  const [customItemCategory, setCustomItemCategory] = useState("기타품목");
  
  const [adminModalOpen, setAdminModalOpen] = useState(false);
  const [newEquipName, setNewEquipName] = useState("");
  const [newEquipCategory, setNewEquipCategory] = useState("보호구");
  const [newEquipImageUrl, setNewEquipImageUrl] = useState("");
  
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentSigningItem, setCurrentSigningItem] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const createEquipmentMutation = useMutation({
    mutationFn: async (data: { name: string; category: string; imageUrl?: string }) => {
      return apiRequest('/api/safety-equipment', { method: 'POST', body: JSON.stringify(data) });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/safety-equipment'] });
      toast({ title: "용품이 추가되었습니다." });
      setNewEquipName("");
      setNewEquipImageUrl("");
    }
  });

  const deleteEquipmentMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/safety-equipment/${id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/safety-equipment'] });
      toast({ title: "용품이 삭제되었습니다." });
    }
  });

  const handleAddEquipment = (equipName: string, category?: string) => {
    const equipment = EQUIPMENT_LIST.find(e => e.name === equipName);
    const cat = category || equipment?.category || "기타품목";
    
    const existing = selectedItems.find(i => i.name === equipName);
    if (existing) {
      setSelectedItems(selectedItems.map(i => 
        i.name === equipName ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setSelectedItems([...selectedItems, { name: equipName, quantity: 1, category: cat }]);
    }
  };

  const handleAddCustomItem = () => {
    if (!customItemName.trim()) {
      toast({ variant: "destructive", title: "용품명을 입력해주세요." });
      return;
    }
    handleAddEquipment(customItemName.trim(), customItemCategory);
    setCustomItemName("");
    toast({ title: "직접입력 용품이 추가되었습니다." });
  };

  const handleRemoveEquipment = (equipName: string) => {
    const existing = selectedItems.find(i => i.name === equipName);
    if (existing && existing.quantity > 1) {
      setSelectedItems(selectedItems.map(i => 
        i.name === equipName ? { ...i, quantity: i.quantity - 1 } : i
      ));
    } else {
      setSelectedItems(selectedItems.filter(i => i.name !== equipName));
    }
  };

  const handleQuantityChange = (equipName: string, quantity: number) => {
    if (quantity <= 0) {
      setSelectedItems(selectedItems.filter(i => i.name !== equipName));
    } else {
      setSelectedItems(selectedItems.map(i => 
        i.name === equipName ? { ...i, quantity } : i
      ));
    }
  };

  const handleAdd = () => {
    if (!selectedTeam || !title || !requesterName || selectedItems.length === 0) {
      toast({ variant: "destructive", title: "필수 항목을 모두 입력해주세요." });
      return;
    }
    const contentData = JSON.stringify({
      team: selectedTeam,
      requester: requesterName,
      items: selectedItems,
      status: "지급요청",
    });
    createRequest({ title, content: contentData, category: "equip_request" }, {
      onSuccess: () => {
        setTitle("");
        setSelectedTeam("");
        setRequesterName("");
        setSelectedItems([]);
        toast({ title: "신청 완료", description: "용품 신청이 등록되었습니다." });
      }
    });
  };

  const handleDelete = (id: number) => {
    if (confirm("이 신청을 삭제하시겠습니까?")) deleteRequest(id);
  };

  const parseContent = (content: string) => {
    try {
      return JSON.parse(content);
    } catch {
      return { text: content };
    }
  };

  const handleStatusChange = (item: any, newStatus: string) => {
    if (newStatus === "지급완료") {
      setCurrentSigningItem(item);
      setSignatureModalOpen(true);
    } else {
      const parsed = parseContent(item.content);
      const updatedContent = JSON.stringify({
        ...parsed,
        status: newStatus,
      });
      updateRequest({ id: item.id, title: item.title, content: updatedContent }, {
        onSuccess: () => {
          toast({ title: "상태 변경 완료", description: `상태가 "${newStatus}"(으)로 변경되었습니다.` });
        }
      });
    }
  };

  useEffect(() => {
    if (signatureModalOpen && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
      }
    }
  }, [signatureModalOpen]);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    ctx.beginPath();
    ctx.moveTo(clientX - rect.left, clientY - rect.top);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    
    if ('touches' in e) {
      e.preventDefault();
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    
    ctx.lineTo(clientX - rect.left, clientY - rect.top);
    ctx.stroke();
  };

  const stopDrawing = () => {
    setIsDrawing(false);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const isCanvasBlank = (): boolean => {
    const canvas = canvasRef.current;
    if (!canvas) return true;
    const ctx = canvas.getContext('2d');
    if (!ctx) return true;
    
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 255 || data[i + 1] !== 255 || data[i + 2] !== 255) {
        return false;
      }
    }
    return true;
  };

  const handleSignatureSubmit = () => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSigningItem) return;
    
    if (isCanvasBlank()) {
      toast({ variant: "destructive", title: "서명을 입력해주세요." });
      return;
    }
    
    const signatureData = canvas.toDataURL('image/png');
    const parsed = parseContent(currentSigningItem.content);
    
    const updatedContent = JSON.stringify({
      ...parsed,
      status: "지급완료",
      signature: signatureData,
      signedAt: new Date().toISOString(),
    });
    
    updateRequest({ id: currentSigningItem.id, title: currentSigningItem.title, content: updatedContent }, {
      onSuccess: () => {
        toast({ title: "서명 완료", description: "보호구 지급이 완료되었습니다." });
        setSignatureModalOpen(false);
        setCurrentSigningItem(null);
      }
    });
  };

  const generatePDF = async (item: any) => {
    const parsed = parseContent(item.content);
    const items = parsed.items || [];
    
    const issueDate = parsed.signedAt ? format(new Date(parsed.signedAt), 'yy.MM.dd') : '-';
    const teamName = parsed.team || '-';
    const requesterName = parsed.requester || '-';
    
    const totalRows = Math.max(items.length, 25);
    
    const container = document.createElement('div');
    container.style.cssText = 'position: absolute; left: -9999px; top: 0; width: 794px; padding: 40px; background: white; font-family: "Malgun Gothic", "맑은 고딕", sans-serif;';
    
    let rowsHtml = '';
    for (let i = 0; i < totalRows; i++) {
      const currentItem = items[i];
      if (currentItem) {
        rowsHtml += `
          <tr>
            <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; font-size: 14px;">${i + 1}</td>
            <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; font-size: 14px;">${issueDate}</td>
            <td style="border: 1px solid #000; padding: 8px 6px; font-size: 14px;">${currentItem.name}</td>
            <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; font-size: 14px;">${currentItem.quantity}</td>
            <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; font-size: 14px;">${teamName}</td>
            <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; font-size: 14px;">${requesterName}</td>
            <td style="border: 1px solid #000; padding: 4px; text-align: center;">${parsed.signature ? `<img src="${parsed.signature}" style="max-height: 24px; max-width: 70px;" />` : ''}</td>
          </tr>
        `;
      } else {
        rowsHtml += `
          <tr>
            <td style="border: 1px solid #000; padding: 8px 6px; text-align: center; font-size: 14px;">${i + 1}</td>
            <td style="border: 1px solid #000; padding: 8px 6px;"></td>
            <td style="border: 1px solid #000; padding: 8px 6px;"></td>
            <td style="border: 1px solid #000; padding: 8px 6px;"></td>
            <td style="border: 1px solid #000; padding: 8px 6px;"></td>
            <td style="border: 1px solid #000; padding: 8px 6px;"></td>
            <td style="border: 1px solid #000; padding: 8px 6px;"></td>
          </tr>
        `;
      }
    }
    
    container.innerHTML = `
      <h1 style="text-align: center; font-size: 24px; margin-bottom: 8px; text-decoration: underline;">보호구지급대장</h1>
      <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-top: 25px;">
        <thead>
          <tr style="background: #e6e6e6;">
            <th style="border: 1px solid #000; padding: 10px 6px; width: 45px; font-size: 14px;">순번</th>
            <th style="border: 1px solid #000; padding: 10px 6px; width: 80px; font-size: 14px;">지급일자</th>
            <th style="border: 1px solid #000; padding: 10px 6px; width: 180px; font-size: 14px;">보호구 명칭</th>
            <th style="border: 1px solid #000; padding: 10px 6px; width: 55px; font-size: 14px;">수량</th>
            <th style="border: 1px solid #000; padding: 10px 6px; width: 110px; font-size: 14px;">부서명</th>
            <th style="border: 1px solid #000; padding: 10px 6px; width: 75px; font-size: 14px;">성명</th>
            <th style="border: 1px solid #000; padding: 10px 6px; width: 85px; font-size: 14px;">서명</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
      <p style="text-align: center; font-size: 12px; margin-top: 20px;">「한번 실수 평생 후회 한번 안전 일생 행복」</p>
    `;
    
    document.body.appendChild(container);
    
    try {
      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff'
      });
      
      const imgData = canvas.toDataURL('image/png');
      const doc = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      const pdfWidth = 210;
      const pdfHeight = 297;
      const imgWidth = pdfWidth - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      
      doc.addImage(imgData, 'PNG', 10, 10, imgWidth, Math.min(imgHeight, pdfHeight - 20));
      
      const fileName = `보호구지급대장_${teamName.replace(/\s/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`;
      doc.save(fileName);
      
      toast({ title: "다운로드 완료", description: "보호구 지급대장이 다운로드되었습니다." });
    } catch (e) {
      toast({ variant: "destructive", title: "오류", description: "PDF 생성 중 오류가 발생했습니다." });
    } finally {
      document.body.removeChild(container);
    }
  };

  const filteredRequests = requests || [];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-4">
        <Link href="/equipment">
          <Button variant="ghost" size="icon" className="shrink-0">
            <ChevronLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h2 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-xl text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <ShoppingCart className="w-8 h-8" />
            </div>
            용품 신청
          </h2>
          <p className="text-muted-foreground mt-2">안전용품을 신청합니다.</p>
        </div>
      </div>

      <Card className="glass-card overflow-hidden border-purple-200 dark:border-purple-900/30">
        <CardContent className="p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium mb-2 block">팀 선택</label>
              <Select value={selectedTeam} onValueChange={setSelectedTeam}>
                <SelectTrigger data-testid="select-request-team">
                  <SelectValue placeholder="팀을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {TEAMS.map(team => (
                    <SelectItem key={team} value={team}>{team}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">신청자</label>
              <Input 
                placeholder="신청자 이름" 
                value={requesterName} 
                onChange={e => setRequesterName(e.target.value)}
                data-testid="input-request-name"
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">신청 제목</label>
              <Input 
                placeholder="예: 안전모 10개 신청" 
                value={title} 
                onChange={e => setTitle(e.target.value)}
                data-testid="input-request-title"
              />
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">용품 선택</label>
              <div className="flex gap-2">
                <Button 
                  variant={viewMode === "list" ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => setViewMode("list")}
                >
                  목록
                </Button>
                <Button 
                  variant={viewMode === "grid" ? "default" : "outline"} 
                  size="sm" 
                  onClick={() => setViewMode("grid")}
                >
                  <Image className="w-4 h-4 mr-1" />
                  사진
                </Button>
                {!isLocked && (
                  <Button variant="outline" size="sm" onClick={() => setAdminModalOpen(true)}>
                    <Settings className="w-4 h-4 mr-1" />
                    관리
                  </Button>
                )}
              </div>
            </div>
            
            {viewMode === "list" ? (
              <Select onValueChange={(val) => handleAddEquipment(val)}>
                <SelectTrigger data-testid="select-equipment">
                  <SelectValue placeholder="용품을 선택하세요" />
                </SelectTrigger>
                <SelectContent>
                  {EQUIPMENT_LIST.map(equip => (
                    <SelectItem key={equip.name} value={equip.name}>
                      [{equip.category}] {equip.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2 max-h-64 overflow-y-auto border rounded-lg p-2">
                {EQUIPMENT_LIST.map(equip => {
                  const eq = equip as { name: string; category: string; imageUrl?: string };
                  return (
                    <div 
                      key={eq.name}
                      className="flex flex-col items-center p-2 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => handleAddEquipment(eq.name)}
                    >
                      {eq.imageUrl ? (
                        <img src={eq.imageUrl} alt={eq.name} className="w-12 h-12 object-cover rounded mb-1" />
                      ) : (
                        <div className="w-12 h-12 bg-muted rounded flex items-center justify-center mb-1">
                          <ShoppingCart className="w-5 h-5 text-muted-foreground" />
                        </div>
                      )}
                      <span className="text-xs text-center line-clamp-2">{eq.name}</span>
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="border rounded-lg p-3 bg-muted/20">
              <div className="flex items-center gap-2 mb-2">
                <PenLine className="w-4 h-4" />
                <span className="text-sm font-medium">직접입력</span>
              </div>
              <div className="flex gap-2">
                <Select value={customItemCategory} onValueChange={setCustomItemCategory}>
                  <SelectTrigger className="w-28">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="보호구">보호구</SelectItem>
                    <SelectItem value="안전용품">안전용품</SelectItem>
                    <SelectItem value="기타품목">기타품목</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  placeholder="용품명 입력" 
                  value={customItemName}
                  onChange={e => setCustomItemName(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleAddCustomItem} size="sm">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          {selectedItems.length > 0 && (
            <div className="border rounded-lg p-4 space-y-2 bg-muted/20">
              <p className="text-sm font-medium mb-2">선택된 용품</p>
              {selectedItems.map((item, idx) => (
                <div key={idx} className="flex items-center justify-between gap-2 p-2 bg-background rounded border">
                  <div className="flex-1">
                    <span className="text-xs text-muted-foreground">[{item.category}]</span>
                    <span className="ml-2 font-medium">{item.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => handleRemoveEquipment(item.name)}
                      data-testid={`button-decrease-${idx}`}
                    >
                      <Minus className="w-3 h-3" />
                    </Button>
                    <Input 
                      type="number" 
                      value={item.quantity} 
                      onChange={e => handleQuantityChange(item.name, parseInt(e.target.value) || 0)}
                      className="w-16 h-7 text-center"
                      min={1}
                      data-testid={`input-quantity-${idx}`}
                    />
                    <Button 
                      variant="outline" 
                      size="icon" 
                      className="h-7 w-7"
                      onClick={() => handleAddEquipment(item.name)}
                      data-testid={`button-increase-${idx}`}
                    >
                      <Plus className="w-3 h-3" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="h-7 w-7 text-destructive"
                      onClick={() => setSelectedItems(selectedItems.filter((_, i) => i !== idx))}
                      data-testid={`button-remove-${idx}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-end">
            <Button 
              onClick={handleAdd} 
              disabled={isCreating || !selectedTeam || !title || !requesterName || selectedItems.length === 0} 
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2" 
              data-testid="button-submit-request"
            >
              <Plus className="w-4 h-4" /> 신청하기
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-lg border-border/50 overflow-hidden">
        <CardHeader className="bg-muted/30 border-b">
          <CardTitle className="text-lg flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-purple-600" />
            신청 내역
          </CardTitle>
        </CardHeader>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="font-bold">상태</TableHead>
                <TableHead className="font-bold">팀</TableHead>
                <TableHead className="font-bold">신청자</TableHead>
                <TableHead className="font-bold">제목</TableHead>
                <TableHead className="font-bold">신청품목</TableHead>
                <TableHead className="font-bold">신청일</TableHead>
                <TableHead className="font-bold text-center">지급대장</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filteredRequests.map((item) => {
                  const parsed = parseContent(item.content);
                  const items = parsed.items || [];
                  const itemsSummary = items.length > 0 
                    ? items.map((i: SelectedItem) => `${i.name}(${i.quantity})`).join(', ')
                    : parsed.text || '-';
                  
                  return (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="group hover:bg-muted/20"
                    >
                      <TableCell>
                        <Select 
                          value={parsed.status || "지급요청"} 
                          onValueChange={(val) => handleStatusChange(item, val)}
                          disabled={isUpdating || isLocked}
                        >
                          <SelectTrigger className="w-[110px] h-8" data-testid={`select-status-${item.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="지급요청">
                              <div className="flex items-center gap-1">
                                <Clock className="w-3 h-3 text-yellow-600" />
                                지급요청
                              </div>
                            </SelectItem>
                            <SelectItem value="지급완료">
                              <div className="flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-green-600" />
                                지급완료
                              </div>
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="font-medium">{parsed.team || "-"}</TableCell>
                      <TableCell>{parsed.requester || "-"}</TableCell>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[200px] truncate" title={itemsSummary}>
                        {itemsSummary}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.createdAt && format(new Date(item.createdAt), "yyyy-MM-dd")}
                      </TableCell>
                      <TableCell className="text-center">
                        {parsed.status === "지급완료" && parsed.signature ? (
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => generatePDF(item)}
                            className="gap-1"
                            data-testid={`button-pdf-${item.id}`}
                          >
                            <Download className="w-3 h-3" />
                            지급대장
                          </Button>
                        ) : "-"}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon"
                          onClick={() => handleDelete(item.id)}
                          className="opacity-0 group-hover:opacity-100"
                          data-testid={`button-delete-request-${item.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </motion.tr>
                  );
                })}
              </AnimatePresence>
              {filteredRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                    신청 내역이 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={signatureModalOpen} onOpenChange={setSignatureModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Send className="w-5 h-5 text-purple-600" />
              수령 서명
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              보호구 수령을 확인하는 서명을 해주세요.
            </p>
            <div className="border rounded-lg p-2 bg-white">
              <canvas
                ref={canvasRef}
                width={350}
                height={150}
                className="border rounded cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
              />
            </div>
            <Button variant="outline" onClick={clearSignature} className="w-full">
              서명 지우기
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSignatureModalOpen(false)}>
              취소
            </Button>
            <Button 
              onClick={handleSignatureSubmit}
              className="bg-purple-600 hover:bg-purple-700 text-white gap-2"
              disabled={isUpdating}
            >
              <Send className="w-4 h-4" />
              전송
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={adminModalOpen} onOpenChange={setAdminModalOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>안전용품 관리</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="border rounded-lg p-4 bg-muted/20">
              <h4 className="font-medium mb-3">새 용품 추가</h4>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                <Select value={newEquipCategory} onValueChange={setNewEquipCategory}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="보호구">보호구</SelectItem>
                    <SelectItem value="안전용품">안전용품</SelectItem>
                    <SelectItem value="기타품목">기타품목</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  placeholder="용품명" 
                  value={newEquipName}
                  onChange={e => setNewEquipName(e.target.value)}
                />
                <Input 
                  placeholder="이미지 URL (선택)" 
                  value={newEquipImageUrl}
                  onChange={e => setNewEquipImageUrl(e.target.value)}
                />
                <Button 
                  onClick={() => {
                    if (!newEquipName.trim()) {
                      toast({ variant: "destructive", title: "용품명을 입력해주세요." });
                      return;
                    }
                    createEquipmentMutation.mutate({ 
                      name: newEquipName.trim(), 
                      category: newEquipCategory,
                      imageUrl: newEquipImageUrl || undefined
                    });
                  }}
                  disabled={createEquipmentMutation.isPending}
                >
                  <Plus className="w-4 h-4 mr-1" />
                  추가
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <h4 className="font-medium">등록된 용품 목록</h4>
              {dbEquipment && dbEquipment.length > 0 ? (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {["보호구", "안전용품", "기타품목"].map(category => {
                    const items = dbEquipment.filter(e => e.category === category);
                    if (items.length === 0) return null;
                    return (
                      <div key={category} className="space-y-1">
                        <p className="text-sm font-medium text-muted-foreground">{category}</p>
                        {items.map(item => (
                          <div key={item.id} className="flex items-center justify-between gap-2 p-2 border rounded bg-background">
                            <div className="flex items-center gap-2">
                              {item.imageUrl ? (
                                <img src={item.imageUrl} alt={item.name} className="w-8 h-8 object-cover rounded" />
                              ) : (
                                <div className="w-8 h-8 bg-muted rounded flex items-center justify-center">
                                  <ShoppingCart className="w-4 h-4 text-muted-foreground" />
                                </div>
                              )}
                              <span>{item.name}</span>
                            </div>
                            <Button 
                              variant="ghost" 
                              size="icon"
                              onClick={() => deleteEquipmentMutation.mutate(item.id)}
                              disabled={deleteEquipmentMutation.isPending}
                            >
                              <Trash2 className="w-4 h-4 text-destructive" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  등록된 용품이 없습니다. 새 용품을 추가하면 기본 용품 대신 표시됩니다.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
