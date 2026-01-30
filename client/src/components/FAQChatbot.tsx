import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, HelpCircle, Sparkles } from "lucide-react";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface FAQ {
  keywords: string[];
  question: string;
  answer: string;
}

const faqs: FAQ[] = [
  {
    keywords: ["안전모", "착용", "헬멧"],
    question: "안전모 착용 방법",
    answer: "안전모 착용 시 머리 정수리와 안전모 사이 25~50mm 유격을 유지하고, 턱끈을 턱 아래에 단단히 고정하세요. 안전모는 3년마다 교체하고, 충격을 받은 안전모는 즉시 교체해야 합니다."
  },
  {
    keywords: ["안전화", "신발", "작업화"],
    question: "안전화 관리 방법",
    answer: "안전화는 발에 맞는 사이즈를 착용하고, 끈을 단단히 묶어야 합니다. 작업 전 안전화 상태(밑창 마모, 철심 노출 등)를 점검하고, 손상된 경우 즉시 교체하세요."
  },
  {
    keywords: ["사고", "신고", "보고", "재해"],
    question: "사고 발생 시 신고 방법",
    answer: "1. 즉시 현장 안전 확보\n2. 부상자 응급조치\n3. 119 신고 (필요시)\n4. 팀장에게 즉시 보고\n5. 사고보고서 작성 및 제출\n\n사고 현장은 조사 완료 전까지 보존해야 합니다."
  },
  {
    keywords: ["안전대", "안전벨트", "추락", "고소작업"],
    question: "안전대 사용법",
    answer: "2m 이상 고소작업 시 반드시 안전대를 착용하세요. 안전대는 가슴 높이 이상의 견고한 구조물에 걸고, 후크는 자동잠금장치가 작동하는지 확인하세요. 복합식 안전대는 전신을 지지하여 더 안전합니다."
  },
  {
    keywords: ["점검", "차량", "운행전"],
    question: "차량 운행 전 점검사항",
    answer: "운행 전 점검사항:\n• 타이어 공기압 및 마모상태\n• 엔진오일, 냉각수 확인\n• 브레이크 작동 상태\n• 방향지시등, 전조등 점검\n• 안전벨트 상태 확인\n• 블랙박스 정상 작동 확인"
  },
  {
    keywords: ["절연", "장갑", "전기", "감전"],
    question: "절연장갑 사용 및 관리",
    answer: "절연장갑 사용 전 공기 주입 테스트로 구멍을 확인하세요. 사용 후 직사광선을 피해 보관하고, 6개월마다 절연성능 시험을 받아야 합니다. 화학물질이나 날카로운 물체로부터 보호하세요."
  },
  {
    keywords: ["소화기", "화재", "불"],
    question: "소화기 사용 방법",
    answer: "소화기 사용법 (PASS):\n1. Pull - 안전핀 뽑기\n2. Aim - 화점 아래쪽 조준\n3. Squeeze - 손잡이 누르기\n4. Sweep - 좌우로 분사\n\n바람을 등지고 사용하며, 3~4m 거리에서 시작하세요."
  },
  {
    keywords: ["응급", "처치", "부상", "구급"],
    question: "응급처치 기본 수칙",
    answer: "1. 현장 안전 확인\n2. 의식 확인 (어깨를 가볍게 두드림)\n3. 119 신고\n4. 기도 확보 및 호흡 확인\n5. 출혈 시 직접 압박 지혈\n6. 골절 의심 시 움직이지 않기\n\n응급처치 교육을 정기적으로 받으세요."
  },
  {
    keywords: ["보호구", "신청", "요청", "필요"],
    question: "안전보호구 신청 방법",
    answer: "안전용품 신청은 좌측 메뉴의 '안전용품신청'에서 할 수 있습니다. 필요한 품목과 수량을 입력하면 담당자에게 신청됩니다. 긴급한 경우 팀장에게 직접 연락하세요."
  },
  {
    keywords: ["교육", "안전교육", "훈련"],
    question: "안전교육 일정",
    answer: "안전교육은 좌측 메뉴의 '안전교육'에서 확인할 수 있습니다. 정기교육(월 1회), 특별교육(신규 장비 도입 시), 법정교육(분기별)이 진행됩니다. 교육 일정을 확인하고 반드시 참석하세요."
  },
  {
    keywords: ["점수", "안전점수", "평가"],
    question: "안전점수 확인",
    answer: "팀별 안전점수는 대시보드에서 확인할 수 있습니다. 점수는 사고(-40점), 법규위반(-1~3점), 제안활동(+3점), 안전활동(+3점) 등으로 계산됩니다. 100점 만점 기준으로 평가됩니다."
  },
  {
    keywords: ["규정", "규칙", "안전규정"],
    question: "안전규정 확인",
    answer: "안전규정은 좌측 메뉴의 '안전규정'에서 확인할 수 있습니다. 모든 작업자는 안전규정을 숙지하고 준수해야 합니다. 규정 변경 시 공지사항을 통해 안내됩니다."
  }
];

const suggestedQuestions = [
  "안전모 착용 방법",
  "사고 발생 시 신고 방법",
  "차량 운행 전 점검사항",
  "소화기 사용 방법"
];

export function FAQChatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  const findAnswer = (query: string): string => {
    const lowerQuery = query.toLowerCase();
    
    for (const faq of faqs) {
      for (const keyword of faq.keywords) {
        if (lowerQuery.includes(keyword)) {
          return faq.answer;
        }
      }
    }
    
    return "죄송합니다. 해당 질문에 대한 답변을 찾지 못했습니다.\n\n아래 주제에 대해 질문해 보세요:\n• 안전모/안전화 착용법\n• 사고 신고 방법\n• 차량 점검사항\n• 소화기 사용법\n• 안전보호구 신청\n• 안전교육 일정";
  };

  const handleSend = (text?: string) => {
    const query = text || message.trim();
    if (!query) return;

    setMessages((prev) => [...prev, { role: "user", content: query }]);
    setMessage("");

    setTimeout(() => {
      const answer = findAnswer(query);
      setMessages((prev) => [...prev, { role: "assistant", content: answer }]);
    }, 300);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <>
      {!isOpen && (
        <button
          data-testid="button-open-faq-chatbot"
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 z-50 h-16 w-16 rounded-2xl shadow-2xl bg-gradient-to-br from-violet-500 via-purple-500 to-fuchsia-500 hover:from-violet-600 hover:via-purple-600 hover:to-fuchsia-600 transition-all duration-500 hover:scale-110 hover:rotate-3 flex items-center justify-center group overflow-visible"
        >
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-violet-400 via-purple-400 to-fuchsia-400 opacity-0 group-hover:opacity-75 blur-lg transition-all duration-500 group-hover:animate-pulse" />
          <div className="absolute inset-0 rounded-2xl bg-white/10 backdrop-blur-sm" />
          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-10 w-10 rounded-full bg-white/20 animate-ping" style={{ animationDuration: '2s' }} />
            </div>
            <Sparkles className="h-8 w-8 text-white drop-shadow-lg relative z-10" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-green-500 border-2 border-white" />
          </span>
          <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs font-medium text-muted-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 px-2 py-1 rounded-full backdrop-blur-sm">
            도움이 필요하세요?
          </span>
        </button>
      )}

      {isOpen && (
        <Card className="fixed bottom-4 right-4 z-50 w-[380px] h-[560px] flex flex-col shadow-2xl">
          <CardHeader className="flex flex-row items-center justify-between gap-2 py-3 px-4 border-b bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 text-white rounded-t-lg">
            <div className="flex items-center gap-2">
              <HelpCircle className="h-5 w-5" />
              <CardTitle className="text-base font-medium">안전 FAQ 도우미</CardTitle>
            </div>
            <Button
              data-testid="button-close-faq-chatbot"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white hover:bg-white/20"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </CardHeader>

          <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
            <ScrollArea className="flex-1 px-4" ref={scrollRef}>
              <div className="py-4 space-y-4">
                {messages.length === 0 && (
                  <div className="space-y-4">
                    <div className="text-center py-4 text-muted-foreground">
                      <Sparkles className="h-10 w-10 mx-auto mb-3 text-purple-500 opacity-70" />
                      <p className="text-sm font-medium">안녕하세요!</p>
                      <p className="text-sm">안전 관련 질문에 답해드려요.</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground px-1">자주 묻는 질문</p>
                      {suggestedQuestions.map((q, idx) => (
                        <button
                          key={idx}
                          onClick={() => handleSend(q)}
                          className="w-full text-left px-3 py-2 text-sm bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                          data-testid={`suggested-question-${idx}`}
                        >
                          {q}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                  >
                    {msg.role === "assistant" && (
                      <div className="h-7 w-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <Sparkles className="h-4 w-4 text-purple-600" />
                      </div>
                    )}
                    <div
                      className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                        msg.role === "user"
                          ? "bg-gradient-to-r from-violet-500 to-purple-500 text-white"
                          : "bg-muted"
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>

            <div className="p-3 border-t">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend();
                }}
                className="flex gap-2"
              >
                <Input
                  data-testid="input-faq-message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="안전 관련 질문을 입력하세요..."
                  className="flex-1"
                />
                <Button
                  data-testid="button-send-faq"
                  type="submit"
                  size="icon"
                  disabled={!message.trim()}
                  className="bg-gradient-to-r from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600"
                >
                  <Send className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
