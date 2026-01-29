import { useNotices, useCreateNotice, useDeleteNotice, useUpdateNotice } from "@/hooks/use-notices";
import { useLockStatus } from "@/hooks/use-settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ShoppingCart, Plus, Trash2, Upload, Image, X, ChevronLeft, Clock, CheckCircle2, XCircle } from "lucide-react";
import { useState, useRef } from "react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { Badge } from "@/components/ui/badge";

const TEAMS = ["동대구운용팀", "서대구운용팀", "남대구운용팀", "포항운용팀", "안동운용팀", "구미운용팀", "문경운용팀", "운용지원팀", "운용계획팀", "사업지원팀", "현장경영팀"];

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
  const [content, setContent] = useState("");
  const [images, setImages] = useState<{url: string; name: string}[]>([]);
  const [isImageUploading, setIsImageUploading] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const MAX_IMAGES = 10;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    const remainingSlots = MAX_IMAGES - images.length;
    if (remainingSlots <= 0) {
      toast({ variant: "destructive", title: `최대 ${MAX_IMAGES}개까지 첨부할 수 있습니다.` });
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setIsImageUploading(true);
    
    try {
      for (const file of filesToUpload) {
        const formData = new FormData();
        formData.append('image', file);
        
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (data.imageUrl) {
          setImages(prev => [...prev, { url: data.imageUrl, name: file.name }]);
        }
      }
      toast({ title: `${filesToUpload.length}개 사진 업로드 완료` });
    } catch (err) {
      toast({ variant: "destructive", title: "업로드 실패" });
    } finally {
      setIsImageUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const handleRemoveImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleAdd = () => {
    if (!selectedTeam || !title || !requesterName) return;
    const contentData = JSON.stringify({
      team: selectedTeam,
      requester: requesterName,
      text: content,
      status: "지급요청",
      images: images,
    });
    createRequest({ title, content: contentData, category: "equip_request" }, {
      onSuccess: () => {
        setTitle("");
        setContent("");
        setSelectedTeam("");
        setRequesterName("");
        setImages([]);
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

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "지급완료":
        return <Badge className="bg-green-100 text-green-700 border-green-200"><CheckCircle2 className="w-3 h-3 mr-1" />지급완료</Badge>;
      case "지급요청":
      default:
        return <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200"><Clock className="w-3 h-3 mr-1" />지급요청</Badge>;
    }
  };

  const handleStatusChange = (item: any, newStatus: string) => {
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
            <label className="text-sm font-medium mb-2 block">상세 내용</label>
            <Textarea 
              placeholder="신청할 용품의 상세 내용을 입력하세요 (품목, 수량, 사유 등)..." 
              value={content} 
              onChange={e => setContent(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-request-content"
            />
          </div>
          
          <input
            type="file"
            accept="image/*"
            multiple
            ref={imageInputRef}
            onChange={handleImageUpload}
            className="hidden"
            data-testid="input-request-image"
          />

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => imageInputRef.current?.click()}
                disabled={isImageUploading || images.length >= MAX_IMAGES}
                className="gap-2"
                data-testid="button-add-request-image"
              >
                <Image className="w-4 h-4" />
                {isImageUploading ? "업로드 중..." : "사진 첨부"}
              </Button>
              <span className="text-sm text-muted-foreground">
                {images.length}/{MAX_IMAGES}개
              </span>
            </div>
            
            {images.length > 0 && (
              <div className="flex flex-wrap gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg dark:bg-blue-900/20 dark:border-blue-800">
                {images.map((img, index) => (
                  <div key={index} className="relative group">
                    <img 
                      src={img.url} 
                      alt={img.name} 
                      className="w-20 h-20 object-cover rounded border"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveImage(index)}
                      className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-image-${index}`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          <div className="flex justify-end">
            <Button onClick={handleAdd} disabled={isCreating || !selectedTeam || !title || !requesterName} className="bg-purple-600 hover:bg-purple-700 text-white gap-2" data-testid="button-submit-request">
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
                <TableHead className="font-bold">내용</TableHead>
                <TableHead className="font-bold">신청일</TableHead>
                <TableHead className="font-bold text-center">첨부 사진</TableHead>
                <TableHead className="w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {filteredRequests.map((item) => {
                  const parsed = parseContent(item.content);
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
                      <TableCell className="text-muted-foreground max-w-[150px] truncate">{parsed.text || "-"}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {item.createdAt && format(new Date(item.createdAt), "yyyy-MM-dd")}
                      </TableCell>
                      <TableCell className="text-center">
                        {parsed.images && parsed.images.length > 0 ? (
                          <div className="flex gap-1 justify-center flex-wrap">
                            {parsed.images.slice(0, 3).map((img: {url: string; name: string}, idx: number) => (
                              <a 
                                key={idx}
                                href={img.url} 
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-block"
                              >
                                <img 
                                  src={img.url} 
                                  alt={img.name} 
                                  className="w-10 h-10 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
                                />
                              </a>
                            ))}
                            {parsed.images.length > 3 && (
                              <span className="text-xs text-muted-foreground self-center">+{parsed.images.length - 3}</span>
                            )}
                          </div>
                        ) : parsed.imageUrl ? (
                          <a 
                            href={parsed.imageUrl} 
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block"
                          >
                            <img 
                              src={parsed.imageUrl} 
                              alt="첨부 사진" 
                              className="w-10 h-10 object-cover rounded border hover:opacity-80 transition-opacity cursor-pointer"
                            />
                          </a>
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
    </div>
  );
}
