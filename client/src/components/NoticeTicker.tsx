import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNotices } from "@/hooks/use-notices";

export function NoticeTicker() {
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

  return (
    <div className="sticky top-[57px] z-40 bg-[#0066CC] overflow-hidden h-9 flex items-center relative shadow-sm">
      <div className="absolute left-0 z-10 px-3 h-full flex items-center gap-1.5 bg-[#004EA8] border-r border-white/20">
        <span className="w-1.5 h-1.5 rounded-full bg-yellow-300 animate-pulse shrink-0" />
        <span className="text-[11px] font-extrabold text-white uppercase tracking-wider whitespace-nowrap">공지</span>
      </div>
      <div className="w-full overflow-hidden pl-[68px]">
        <div className="animate-ticker pause-hover px-4 text-[13px] font-semibold text-white flex items-center gap-12 whitespace-nowrap">
          {tickerNotice ? (
            <>
              <span>{tickerNotice.content}</span>
              <span className="opacity-40 text-yellow-200">◆</span>
              <span>{tickerNotice.content}</span>
              <span className="opacity-40 text-yellow-200">◆</span>
              <span>{tickerNotice.content}</span>
            </>
          ) : (
            <span>시스템 정상 작동 중. 현재 활성화된 긴급 알림이 없습니다.</span>
          )}
        </div>
      </div>
    </div>
  );
}
