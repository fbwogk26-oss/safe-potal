import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import {
  X,
  Send,
  Image as ImageIcon,
  Loader2,
  Check,
  Bot,
  User,
  Trash2,
  CheckCircle2,
  XCircle,
  Sparkles,
  Shield,
} from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  images?: string[];
  actionResult?: any;
  needsConfirmation?: boolean;
  confirmData?: any;
  confirmAction?: string;
  uploadedImages?: string[];
  confirmed?: boolean;
  cancelled?: boolean;
}

export function ChatBot() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `안녕하세요, ${user?.name || "사용자"}님! 무엇을 도와드릴까요?\n\n다음과 같은 요청을 하실 수 있어요:\n📚 "교육 등록해줘" / "교육 현황 알려줘"\n🔍 "안전점검 등록" / "점검 현황 조회"\n🚗 "운행일지 작성" / "운행기록 조회"\n📢 "공지사항 등록" / "공지 조회"\n🚙 "차량 등록" / "차량 정보 조회"\n🛡️ "안전용품 현황" / "팀 점수 조회"`,
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [pendingData, setPendingData] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    setTimeout(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    }, 100);
  }, []);

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed && selectedFiles.length === 0) return;
    if (isLoading) return;

    const userMessage: ChatMessage = {
      role: "user",
      content: trimmed,
      images: selectedFiles.map((f) => URL.createObjectURL(f)),
    };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    scrollToBottom();

    try {
      const formData = new FormData();
      formData.append("message", trimmed);

      const history = messages
        .filter((m) => m.role === "user" || m.role === "assistant")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));
      formData.append("conversationHistory", JSON.stringify(history));

      for (const file of selectedFiles) {
        formData.append("photos", file);
      }

      if (pendingAction) {
        formData.append("pendingAction", pendingAction);
        formData.append("pendingData", JSON.stringify(pendingData));
      }

      const response = await fetch("/api/chatbot/message", {
        method: "POST",
        credentials: "include",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("서버 요청에 실패했습니다");
      }

      const data = await response.json();

      if (data.needsConfirmation) {
        setPendingAction(data.action);
        setPendingData(data.confirmData);

        setMessages((prev) => {
          const updated = prev.map((m) =>
            m.needsConfirmation && !m.confirmed && !m.cancelled
              ? { ...m, needsConfirmation: false, cancelled: true }
              : m
          );
          return [
            ...updated,
            {
              role: "assistant" as const,
              content: data.message || "처리되었습니다.",
              actionResult: data.actionResult,
              needsConfirmation: true,
              confirmData: data.confirmData,
              confirmAction: data.action,
              uploadedImages: data.uploadedImages,
            },
          ];
        });
      } else {
        if (pendingAction && !data.needsConfirmation) {
          setPendingAction(null);
          setPendingData(null);
        }

        const assistantMessage: ChatMessage = {
          role: "assistant",
          content: data.message || "처리되었습니다.",
          actionResult: data.actionResult,
          needsConfirmation: false,
          confirmData: data.confirmData,
          confirmAction: data.action,
          uploadedImages: data.uploadedImages,
        };
        setMessages((prev) => [...prev, assistantMessage]);
      }

      if (data.actionResult?.success && ["education_created", "inspection_created", "vehicle_log_created", "notice_created", "vehicle_created"].includes(data.actionResult.type)) {
        const descMap: Record<string, string> = {
          education_created: "교육일지가 등록되었습니다",
          inspection_created: "안전점검이 등록되었습니다",
          vehicle_log_created: "운행일지가 등록되었습니다",
          notice_created: "공지사항이 등록되었습니다",
          vehicle_created: "차량이 등록되었습니다",
        };
        toast({ title: "처리 완료", description: descMap[data.actionResult.type] || "요청이 처리되었습니다" });
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "죄송합니다, 오류가 발생했습니다. 다시 시도해주세요." },
      ]);
    } finally {
      setIsLoading(false);
      setSelectedFiles([]);
      scrollToBottom();
    }
  };

  const handleConfirm = async (msg: ChatMessage) => {
    if (!msg.confirmAction || !msg.confirmData) return;
    setIsLoading(true);

    setMessages((prev) =>
      prev.map((m) =>
        m === msg ? { ...m, needsConfirmation: false, confirmed: true } : m
      )
    );

    setPendingAction(null);
    setPendingData(null);

    try {
      const response = await fetch("/api/chatbot/confirm", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: msg.confirmAction,
          data: msg.confirmData,
          uploadedImages: msg.uploadedImages || [],
        }),
      });

      const data = await response.json();

      if (data.success) {
        const typeMap: Record<string, string> = {
          CREATE_EDUCATION: "education_created",
          CREATE_INSPECTION: "inspection_created",
          CREATE_VEHICLE_LOG: "vehicle_log_created",
          CREATE_NOTICE: "notice_created",
          CREATE_VEHICLE: "vehicle_created",
        };
        const descMap: Record<string, string> = {
          CREATE_EDUCATION: "교육일지가 등록되었습니다",
          CREATE_INSPECTION: "안전점검이 등록되었습니다",
          CREATE_VEHICLE_LOG: "운행일지가 등록되었습니다",
          CREATE_NOTICE: "공지사항이 등록되었습니다",
          CREATE_VEHICLE: "차량이 등록되었습니다",
        };
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: data.message || "등록이 완료되었습니다!",
            actionResult: { success: true, type: typeMap[msg.confirmAction || ""] || "created" },
          },
        ]);
        toast({ title: "등록 완료", description: descMap[msg.confirmAction || ""] || "등록이 완료되었습니다" });
      } else {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: data.error || data.message || "등록에 실패했습니다." },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "등록 처리 중 오류가 발생했습니다. 다시 시도해주세요." },
      ]);
    } finally {
      setIsLoading(false);
      scrollToBottom();
    }
  };

  const handleCancel = (msg: ChatMessage) => {
    setMessages((prev) =>
      prev.map((m) =>
        m === msg ? { ...m, needsConfirmation: false, cancelled: true } : m
      )
    );
    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "취소되었습니다. 다른 요청이 있으신가요?" },
    ]);
    setPendingAction(null);
    setPendingData(null);
    scrollToBottom();
  };

  const handleFileSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setSelectedFiles((prev) => [...prev, ...files]);
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const clearChat = () => {
    setMessages([
      {
        role: "assistant",
        content: `대화가 초기화되었습니다. 무엇을 도와드릴까요?`,
      },
    ]);
    setPendingAction(null);
    setPendingData(null);
  };

  if (!user) return null;

  return (
    <>
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 w-16 h-16 rounded-full shadow-lg hover:shadow-2xl transition-all duration-300 flex items-center justify-center hover:scale-110 active:scale-95 group"
          style={{
            background: "linear-gradient(135deg, #6366f1 0%, #8b5cf6 30%, #a855f7 60%, #d946ef 100%)",
          }}
          data-testid="button-chatbot-open"
        >
          <div className="absolute inset-0 rounded-full animate-ping opacity-20" style={{ background: "linear-gradient(135deg, #6366f1, #d946ef)" }} />
          <div className="absolute inset-0 rounded-full opacity-0 group-hover:opacity-30 transition-opacity duration-300" style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }} />
          <div className="relative flex items-center justify-center">
            <Shield className="w-5 h-5 text-white absolute opacity-40" />
            <Sparkles className="w-6 h-6 text-white relative z-10 drop-shadow-md" />
          </div>
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-green-400 rounded-full border-2 border-white animate-pulse" />
        </button>
      )}

      {isOpen && (
        <div className="fixed bottom-4 right-4 z-50 w-[380px] max-w-[calc(100vw-2rem)] h-[560px] max-h-[calc(100vh-6rem)] bg-background border rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300"
          data-testid="chatbot-panel"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b" style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.1) 0%, rgba(168,85,247,0.1) 50%, rgba(217,70,239,0.05) 100%)" }}>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-sm font-bold">AI 안전포털 어시스턴트</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-[10px] text-muted-foreground">전체 메뉴 검색 · 등록 지원</p>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={clearChat}
                data-testid="button-chatbot-clear"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsOpen(false)}
                data-testid="button-chatbot-close"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div
            ref={scrollContainerRef}
            className="flex-1 overflow-y-auto p-3 space-y-3"
          >
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2 ${msg.role === "user" ? "flex-row-reverse" : ""}`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
                    msg.role === "user"
                      ? "bg-primary/10"
                      : ""
                  }`}
                  style={msg.role === "assistant" ? { background: "linear-gradient(135deg, #6366f1, #a855f7)" } : undefined}
                >
                  {msg.role === "user" ? (
                    <User className="w-3 h-3 text-primary" />
                  ) : (
                    <Sparkles className="w-3 h-3 text-white" />
                  )}
                </div>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/70"
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{msg.content}</div>

                  {msg.images && msg.images.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {msg.images.map((img, j) => (
                        <img
                          key={j}
                          src={img}
                          alt="첨부"
                          className="w-16 h-16 object-cover rounded-md"
                        />
                      ))}
                    </div>
                  )}

                  {msg.actionResult?.success && (
                    <div className="mt-2 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Check className="w-3 h-3" />
                      <span>처리 완료</span>
                    </div>
                  )}

                  {msg.confirmed && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>확인됨 - 등록 진행</span>
                    </div>
                  )}

                  {msg.cancelled && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <XCircle className="w-3.5 h-3.5" />
                      <span>취소됨</span>
                    </div>
                  )}

                  {msg.needsConfirmation && !msg.confirmed && !msg.cancelled && (
                    <div className="mt-3 space-y-2">
                      <p className="text-[11px] text-muted-foreground">수정이 필요하면 채팅으로 말씀해주세요</p>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleConfirm(msg)}
                          disabled={isLoading}
                          data-testid={`button-chatbot-confirm-${i}`}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          등록하기
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleCancel(msg)}
                          disabled={isLoading}
                          data-testid={`button-chatbot-cancel-${i}`}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />
                          취소
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="flex gap-2">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: "linear-gradient(135deg, #6366f1, #a855f7)" }}>
                  <Sparkles className="w-3 h-3 text-white" />
                </div>
                <div className="bg-muted/70 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">처리 중...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {pendingAction && (
            <div className="px-3 py-1.5 border-t bg-amber-50 dark:bg-amber-950/30">
              <p className="text-[10px] text-amber-700 dark:text-amber-400 flex items-center gap-1">
                <Sparkles className="w-3 h-3" />
                등록 확인 대기 중 - 채팅으로 세부 정보를 수정할 수 있습니다
              </p>
            </div>
          )}

          {selectedFiles.length > 0 && (
            <div className="px-3 py-2 border-t bg-muted/30">
              <div className="flex flex-wrap gap-1">
                {selectedFiles.map((file, i) => (
                  <div key={i} className="relative group">
                    <img
                      src={URL.createObjectURL(file)}
                      alt={file.name}
                      className="w-12 h-12 object-cover rounded-md"
                    />
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity"
                      data-testid={`button-remove-file-${i}`}
                    >
                      <X className="w-2.5 h-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="border-t p-2">
            <div className="flex items-center gap-1.5">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handleFilesChange}
              />
              <Button
                variant="ghost"
                size="icon"
                className="flex-shrink-0"
                onClick={handleFileSelect}
                disabled={isLoading}
                data-testid="button-chatbot-attach"
              >
                <ImageIcon className="w-4 h-4" />
              </Button>
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder={pendingAction ? "수정할 내용을 입력하세요..." : "메시지를 입력하세요..."}
                className="text-sm"
                disabled={isLoading}
                data-testid="input-chatbot-message"
              />
              <Button
                size="icon"
                className="flex-shrink-0"
                onClick={handleSend}
                disabled={isLoading || (!input.trim() && selectedFiles.length === 0)}
                data-testid="button-chatbot-send"
              >
                {isLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
