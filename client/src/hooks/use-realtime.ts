import { useEffect, useRef, useCallback } from "react";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

const RECONNECT_DELAY_MS = 5000;

export function useRealtime() {
  const { toast } = useToast();
  const esRef = useRef<EventSource | null>(null);
  const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    const es = new EventSource("/api/sse", { withCredentials: true });
    esRef.current = es;

    es.addEventListener("connected", () => {
      // 연결 성공 — 조용히 처리
    });

    // 새 공지 등록 이벤트
    es.addEventListener("notice", (e) => {
      try {
        const data = JSON.parse(e.data);
        // 쿼리 캐시 갱신
        queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
        queryClient.invalidateQueries({ queryKey: ["/api/settings/pinned-notice"] });

        if (data.action === "created") {
          const label = data.category === "rule" ? "새 안전규칙" : "새 공지사항";
          toast({
            title: `📢 ${label} 등록됨`,
            description: data.title || "새 공지가 등록되었습니다.",
            duration: 6000,
          });
        }
      } catch {}
    });

    // 고정 공지 변경 이벤트
    es.addEventListener("pinned", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/pinned-notice"] });
    });

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (mountedRef.current) {
        reconnectRef.current = setTimeout(connect, RECONNECT_DELAY_MS);
      }
    };
  }, [toast]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
      if (esRef.current) { esRef.current.close(); esRef.current = null; }
    };
  }, [connect]);
}
