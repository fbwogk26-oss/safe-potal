import { useState, useCallback, useEffect } from "react";

const STORAGE_KEY = "readNoticeIds";
const SYNC_EVENT = "readNoticesUpdated";

function loadReadIds(): Set<number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return new Set<number>();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set<number>();
  }
}

function saveReadIds(ids: Set<number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids]));
    window.dispatchEvent(new Event(SYNC_EVENT));
  } catch {}
}

export function initializeReadNotices(allIds: number[]) {
  if (localStorage.getItem(STORAGE_KEY) !== null) return;
  saveReadIds(new Set(allIds));
}

export function useReadNotices() {
  const [readIds, setReadIds] = useState<Set<number>>(loadReadIds);

  useEffect(() => {
    const handler = () => setReadIds(loadReadIds());
    window.addEventListener(SYNC_EVENT, handler);
    return () => window.removeEventListener(SYNC_EVENT, handler);
  }, []);

  const markAsRead = useCallback((id: number) => {
    setReadIds(prev => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      saveReadIds(next);
      return next;
    });
  }, []);

  const markAllAsRead = useCallback((ids: number[]) => {
    setReadIds(prev => {
      const next = new Set(prev);
      ids.forEach(id => next.add(id));
      saveReadIds(next);
      return next;
    });
  }, []);

  const isRead = useCallback((id: number) => readIds.has(id), [readIds]);

  const countUnread = useCallback(
    (ids: number[]) => ids.filter(id => !readIds.has(id)).length,
    [readIds]
  );

  return { markAsRead, markAllAsRead, isRead, countUnread };
}
