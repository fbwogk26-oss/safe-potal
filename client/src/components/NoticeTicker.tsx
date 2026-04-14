import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNotices } from "@/hooks/use-notices";
import { Megaphone } from "lucide-react";

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

  const segment = (
    <>
      <span className="px-8">{text}</span>
      <span className="opacity-20 shrink-0 text-blue-400 dark:text-blue-500 text-xs">◆◆</span>
    </>
  );

  return (
    <div className={`${inline ? "" : "sticky top-0 z-40"} px-4 sm:px-5 pb-3`}>
      <div className="flex items-center rounded-xl border border-blue-100 dark:border-blue-900/50 bg-blue-50 dark:bg-blue-950/30 h-9 overflow-hidden">
        {/* 고정 레이블 */}
        <div className="flex items-center gap-1.5 pl-3 pr-3 h-full shrink-0 border-r border-blue-100 dark:border-blue-800/50">
          <Megaphone className="w-3 h-3 text-blue-500 dark:text-blue-400 flex-shrink-0" />
          <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider whitespace-nowrap">공지</span>
        </div>
        {/* 스크롤 영역 */}
        <div className="flex-1 overflow-hidden">
          <div className="animate-ticker pause-hover text-xs font-medium text-blue-800 dark:text-blue-200">
            {segment}{segment}
            {segment}{segment}
          </div>
        </div>
        {/* 우측 fade */}
        <div className="w-8 h-full bg-gradient-to-l from-blue-50 dark:from-blue-950/30 to-transparent flex-shrink-0 pointer-events-none" />
      </div>
    </div>
  );
}
