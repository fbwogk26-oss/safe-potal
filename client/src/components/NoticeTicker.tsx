import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNotices } from "@/hooks/use-notices";

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
      <div className="flex items-center w-full rounded-full border border-slate-200 bg-white h-8 overflow-hidden">
        {/* 고정 레이블 */}
        <div className="flex items-center gap-1.5 px-3 h-full shrink-0 border-r border-slate-200 bg-white">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0 animate-pulse" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">공지</span>
        </div>
        {/* 스크롤 텍스트 */}
        <div className="flex-1 overflow-hidden relative">
          <div className="animate-ticker pause-hover px-4 text-[11px] font-medium text-slate-700 flex items-center gap-10 whitespace-nowrap">
            <span>{text}</span>
            <span className="opacity-30 text-slate-400">◆</span>
            <span>{text}</span>
            <span className="opacity-30 text-slate-400">◆</span>
            <span>{text}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
