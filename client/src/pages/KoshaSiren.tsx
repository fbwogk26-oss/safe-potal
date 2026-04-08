import { useState, useCallback, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, ExternalLink, RefreshCw, AlertTriangle, ChevronDown, Siren } from "lucide-react";
import { queryClient } from "@/lib/queryClient";

const PAGE_SIZE = 5;
const KOSHA_BOARD_URL = "https://portal.kosha.or.kr/archive/imprtnDsstrAlrame/CSADV50000/CSADV50000M01";

interface SirenItem {
  title: string;
  date: string;
  link: string;
}

interface SirenResponse {
  items: SirenItem[];
  total: number;
  page: number;
  cached?: boolean;
  error?: string;
}

export default function KoshaSiren() {
  const [page, setPage] = useState(1);
  const [allItems, setAllItems] = useState<SirenItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [showIframe, setShowIframe] = useState(false);

  const { data, isLoading, error, refetch, isFetching } = useQuery<SirenResponse>({
    queryKey: ["/api/kosha/siren", 1],
    queryFn: () => fetch(`/api/kosha/siren?page=1&pageSize=${PAGE_SIZE}`).then(r => r.json()),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });

  useEffect(() => {
    if (data) {
      setAllItems(data.items);
      setTotal(data.total);
      setPage(1);
    }
  }, [data]);

  const handleLoadMore = useCallback(async () => {
    const nextPage = page + 1;
    setLoadingMore(true);
    try {
      const res = await fetch(`/api/kosha/siren?page=${nextPage}&pageSize=${PAGE_SIZE}`).then(r => r.json());
      setAllItems(prev => [...prev, ...res.items]);
      setTotal(res.total);
      setPage(nextPage);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingMore(false);
    }
  }, [page]);

  const handleRefresh = () => {
    queryClient.removeQueries({ queryKey: ["/api/kosha/siren"] });
    setAllItems([]);
    setPage(1);
    refetch();
  };

  const displayItems = allItems.length > 0 ? allItems : (data?.items ?? []);
  const hasMore = total > 0 && displayItems.length < total;
  const hasNoItems = !isLoading && !error && displayItems.length === 0;

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-3xl">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-red-100 dark:bg-red-950/50">
            <Siren className="h-5 w-5 text-red-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold">중대재해 사이렌</h1>
            <p className="text-xs text-muted-foreground">안전보건공단 중대재해 사이렌 게시판</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={isFetching || isLoading}
            className="gap-1.5"
            data-testid="btn-refresh"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} />
            새로고침
          </Button>
          <a href={KOSHA_BOARD_URL} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-1.5" data-testid="link-kosha-board">
              <ExternalLink className="h-3.5 w-3.5" />
              공단 게시판
            </Button>
          </a>
        </div>
      </div>

      {/* 안내 배너 */}
      <Card className="border-red-200 bg-red-50 dark:bg-red-950/20 dark:border-red-800">
        <CardContent className="p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 mt-0.5 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-800 dark:text-red-300">중대재해 예방 정보</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              안전보건공단 중대재해 사이렌 게시판의 최신 정보를 가져옵니다. 카드를 클릭하면 공단 상세 페이지로 이동합니다.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* 게시판 목록 */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
            최신 게시글 {total > 0 ? `(전체 ${total}건)` : ""}
          </h2>
          {data?.cached && (
            <Badge variant="secondary" className="text-xs">캐시됨</Badge>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center items-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">공단 게시판 불러오는 중...</span>
          </div>
        ) : displayItems.length > 0 ? (
          <>
            <div className="space-y-2">
              {displayItems.map((item, idx) => (
                <a
                  key={idx}
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  data-testid={`link-siren-${idx}`}
                >
                  <Card className="hover:shadow-md hover:border-red-200 dark:hover:border-red-700 transition-all cursor-pointer group">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/50 dark:text-red-300">
                              중대재해
                            </span>
                            {item.date && (
                              <span className="text-xs text-muted-foreground">{item.date}</span>
                            )}
                          </div>
                          <p className="text-sm font-medium line-clamp-2 group-hover:text-red-700 dark:group-hover:text-red-400 transition-colors">
                            {item.title}
                          </p>
                        </div>
                        <ExternalLink className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5 group-hover:text-red-500 transition-colors" />
                      </div>
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  onClick={handleLoadMore}
                  disabled={loadingMore}
                  className="gap-2 min-w-[160px]"
                  data-testid="btn-load-more"
                >
                  {loadingMore ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> 불러오는 중...</>
                  ) : (
                    <><ChevronDown className="h-4 w-4" /> 더보기 ({displayItems.length}/{total})</>
                  )}
                </Button>
              </div>
            )}

            {!hasMore && displayItems.length > 0 && (
              <p className="text-center text-xs text-muted-foreground py-2">모든 게시글을 불러왔습니다.</p>
            )}
          </>
        ) : (
          /* 스크래핑 실패 시 폴백: 직접 접근 안내 */
          <div className="space-y-4">
            <Card>
              <CardContent className="p-6 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mx-auto">
                  <AlertTriangle className="h-6 w-6 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">자동 수집이 제한됩니다</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    공단 사이트가 JavaScript 방식으로 데이터를 로드하여 자동 수집이 어렵습니다.
                    아래 방법으로 직접 게시판을 확인하세요.
                  </p>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 justify-center">
                  <a href={KOSHA_BOARD_URL} target="_blank" rel="noopener noreferrer">
                    <Button className="gap-1.5 w-full sm:w-auto" data-testid="btn-open-kosha">
                      <ExternalLink className="h-3.5 w-3.5" />
                      공단 게시판 열기
                    </Button>
                  </a>
                  <Button variant="outline" className="gap-1.5" onClick={() => setShowIframe(!showIframe)} data-testid="btn-toggle-iframe">
                    {showIframe ? "미리보기 닫기" : "앱 내 미리보기"}
                  </Button>
                </div>
                {data?.error && (
                  <p className="text-xs text-muted-foreground bg-muted p-2 rounded text-left">{data.error}</p>
                )}
              </CardContent>
            </Card>

            {/* iframe 미리보기 */}
            {showIframe && (
              <Card>
                <CardContent className="p-0 overflow-hidden rounded-lg">
                  <div className="bg-muted px-3 py-2 flex items-center justify-between border-b">
                    <span className="text-xs text-muted-foreground font-mono truncate">{KOSHA_BOARD_URL}</span>
                    <a href={KOSHA_BOARD_URL} target="_blank" rel="noopener noreferrer">
                      <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1">
                        <ExternalLink className="h-3 w-3" /> 새 탭
                      </Button>
                    </a>
                  </div>
                  <iframe
                    src={KOSHA_BOARD_URL}
                    className="w-full border-0"
                    style={{ height: "600px" }}
                    title="안전보건공단 중대재해 사이렌"
                    data-testid="iframe-kosha"
                  />
                </CardContent>
              </Card>
            )}

            {/* 바로가기 카드들 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                { title: "중대재해 사이렌 게시판", desc: "최신 중대재해 사례 및 예방 정보", url: KOSHA_BOARD_URL },
                { title: "안전보건공단 포털", desc: "산업재해 예방 종합 플랫폼", url: "https://portal.kosha.or.kr" },
              ].map((item, idx) => (
                <a key={idx} href={item.url} target="_blank" rel="noopener noreferrer" className="block" data-testid={`link-quick-${idx}`}>
                  <Card className="hover:shadow-md hover:border-red-200 transition-all cursor-pointer group h-full">
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className="p-2 rounded-lg bg-red-100 dark:bg-red-950/50 shrink-0">
                        <Siren className="h-4 w-4 text-red-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium group-hover:text-red-700 dark:group-hover:text-red-400">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                      </div>
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                    </CardContent>
                  </Card>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 하단 링크 */}
      {displayItems.length > 0 && (
        <Card className="bg-muted/50">
          <CardContent className="p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">안전보건공단 포털</p>
              <p className="text-xs text-muted-foreground">더 많은 안전 정보는 공단 사이트에서 확인하세요.</p>
            </div>
            <a href="https://portal.kosha.or.kr" target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 shrink-0">
                <ExternalLink className="h-3.5 w-3.5" />
                kosha.or.kr
              </Button>
            </a>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
