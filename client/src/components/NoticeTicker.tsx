import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNotices } from "@/hooks/use-notices";
import { ChevronRight } from "lucide-react";

interface NoticeTickerProps {
  inline?: boolean;
}

export function NoticeTicker({ inline = false }: NoticeTickerProps) {
  const { data: notices } = useNotices("notice");
  const { data: pinnedData } = useQuery<{ pinnedNoticeId: number | null }>({
    queryKey: ["/api/settings/pinned-notice"],
  });

  const tickerNotice = useMemo(() => {
    if (!notices || notices.length === 0) return null;
    const pinnedNoticeId = pinnedData?.pinnedNoticeId;
    if (pinnedNoticeId) {
      const pinned = notices.find((n) => n.id === pinnedNoticeId);
      if (pinned) return pinned;
    }
    return [...notices].sort((a, b) => b.id - a.id)[0] || null;
  }, [notices, pinnedData]);

  const text = tickerNotice?.content ?? "시스템 정상 작동 중. 현재 활성화된 긴급 알림이 없습니다.";

  return (
    <div className={`${inline ? "" : "sticky top-0 z-40"} flex items-center px-4 py-2 bg-slate-50 border-b border-slate-100`}>
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-slate-200 bg-white">
        <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">공지</span>
        <span className="w-px h-3 bg-slate-200 shrink-0" />
        <span className="text-[11px] font-medium text-slate-700 truncate max-w-[500px]">{text}</span>
        <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
      </div>
    </div>
  );
}
