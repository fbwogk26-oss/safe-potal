import { useNotices, useCreateNotice, useDeleteNotice, useUpdateNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShoppingCart, Plus, Trash2, ChevronLeft, Clock, CheckCircle2, FileText, Send, Minus, Download } from "lucide-react";
import jsPDF from "jspdf";
import { useState, useRef, useEffect } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

const TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀"];

const EQUIPMENT_LIST = [
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

export default function EquipmentRequest() {
  const { data: requests, isLoading } = useNotices("equip_request");
  const { mutate: createRequest, isPending: isCreating } = useCreateNotice();
  const { mutate: deleteRequest } = useDeleteNotice();
  const { mutate: updateRequest, isPending: isUpdating } = useUpdateNotice();
  const { data: lockData } = useLockStatus();
  const isLocked = lockData?.isLocked;
  const { toast } = useToast();

  const [selectedTeam, setSelectedTeam] = useState("");
  const [requesterName, setRequesterName] = useState("");
  const [title, setTitle] = useState("");
  const [selectedItems, setSelectedItems] = useState<SelectedItem[]>([]);
  
  const [signatureModalOpen, setSignatureModalOpen] = useState(false);
  const [currentSigningItem, setCurrentSigningItem] = useState<any>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  const handleAddEquipment = (equipName: string) => {
    const equipment = EQUIPMENT_LIST.find(e => e.name === equipName);
    if (!equipment) return;
    
    const existing = selectedItems.find(i => i.name === equipName);
    if (existing) {
      setSelectedItems(selectedItems.map(i => 
        i.name === equipName ? { ...i, quantity: i.quantity + 1 } : i
      ));
    } else {
      setSelectedItems([...selectedItems, { name: equipName, quantity: 1, category: equipment.category }]);
    }
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
    
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    
    doc.setFontSize(18);
    doc.text("Safety Equipment Distribution Record", pageWidth / 2, 20, { align: "center" });
    doc.text("(보호구 지급대장)", pageWidth / 2, 28, { align: "center" });
    
    doc.setFontSize(10);
    let y = 45;
    
    doc.setFillColor(240, 240, 240);
    doc.rect(15, y, 40, 8, 'F');
    doc.rect(15, y + 8, 40, 8, 'F');
    doc.rect(105, y, 40, 8, 'F');
    doc.rect(105, y + 8, 40, 8, 'F');
    
    doc.setDrawColor(0);
    doc.rect(15, y, 40, 8);
    doc.rect(55, y, 50, 8);
    doc.rect(105, y, 40, 8);
    doc.rect(145, y, 50, 8);
    doc.rect(15, y + 8, 40, 8);
    doc.rect(55, y + 8, 50, 8);
    doc.rect(105, y + 8, 40, 8);
    doc.rect(145, y + 8, 50, 8);
    
    doc.text("Team (부서명)", 17, y + 6);
    doc.text(parsed.team || '-', 57, y + 6);
    doc.text("Request Date (신청일)", 107, y + 6);
    doc.text(item.createdAt ? format(new Date(item.createdAt), 'yyyy-MM-dd') : '-', 147, y + 6);
    
    doc.text("Requester (신청자)", 17, y + 14);
    doc.text(parsed.requester || '-', 57, y + 14);
    doc.text("Issue Date (지급일)", 107, y + 14);
    doc.text(parsed.signedAt ? format(new Date(parsed.signedAt), 'yyyy-MM-dd') : '-', 147, y + 14);
    
    y += 25;
    
    doc.setFillColor(240, 240, 240);
    doc.rect(15, y, 20, 8, 'F');
    doc.rect(35, y, 70, 8, 'F');
    doc.rect(105, y, 50, 8, 'F');
    doc.rect(155, y, 40, 8, 'F');
    
    doc.rect(15, y, 20, 8);
    doc.rect(35, y, 70, 8);
    doc.rect(105, y, 50, 8);
    doc.rect(155, y, 40, 8);
    
    doc.text("No.", 17, y + 6);
    doc.text("Item Name (품목명)", 37, y + 6);
    doc.text("Category (분류)", 107, y + 6);
    doc.text("Qty (수량)", 157, y + 6);
    
    y += 8;
    
    items.forEach((i: SelectedItem, idx: number) => {
      doc.rect(15, y, 20, 8);
      doc.rect(35, y, 70, 8);
      doc.rect(105, y, 50, 8);
      doc.rect(155, y, 40, 8);
      
      doc.text(String(idx + 1), 17, y + 6);
      doc.text(i.name, 37, y + 6);
      doc.text(i.category, 107, y + 6);
      doc.text(String(i.quantity), 157, y + 6);
      
      y += 8;
    });
    
    y += 15;
    doc.setFontSize(10);
    doc.text("I confirm receipt of the above safety equipment.", pageWidth - 20, y, { align: "right" });
    doc.text("(위 보호구를 정히 수령하였음을 확인합니다.)", pageWidth - 20, y + 6, { align: "right" });
    
    y += 15;
    doc.text("Signature (서명):", pageWidth - 70, y);
    
    if (parsed.signature) {
      try {
        doc.addImage(parsed.signature, 'PNG', pageWidth - 60, y + 2, 40, 20);
      } catch (e) {
        doc.text("(Signed)", pageWidth - 20, y + 12, { align: "right" });
      }
    }
    
    const fileName = `equipment_record_${parsed.team?.replace(/\s/g, '_') || 'unknown'}_${format(new Date(), 'yyyyMMdd')}.pdf`;
    doc.save(fileName);
    
    toast({ title: "PDF 다운로드 완료", description: "보호구 지급대장이 다운로드되었습니다." });
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
          
          <div>
            <label className="text-sm font-medium mb-2 block">용품 선택</label>
            <Select onValueChange={handleAddEquipment}>
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
                <TableHead className="font-bold text-center">PDF</TableHead>
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
                          disabled={isUpdating}
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
                            PDF
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
    </div>
  );
}
