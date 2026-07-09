"use client";

import { useQuery } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export const PAGE_SIZE_OPTIONS = [5, 10, 20] as const;
export type PageSizeOption = (typeof PAGE_SIZE_OPTIONS)[number];
export const DEFAULT_PAGE_SIZE: PageSizeOption = 10;

type PaginatedResult<T> = {
  page: T[];
  isDone: boolean;
  continueCursor: string;
};

export function useConvexPagedQuery<T>(
  queryRef: Parameters<typeof useQuery>[0],
  args: Record<string, unknown> | "skip",
  options?: { totalItems?: number },
) {
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = useState<PageSizeOption>(DEFAULT_PAGE_SIZE);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);
  const [queryEpoch, setQueryEpoch] = useState(0);
  const resultRef = useRef<PaginatedResult<T> | undefined>(undefined);
  const [cachedPage, setCachedPage] = useState<T[]>([]);

  const argsKey = useMemo(
    () => (args === "skip" ? "skip" : JSON.stringify(args)),
    [args],
  );

  useEffect(() => {
    setPageIndex(0);
    setCursors([null]);
    setQueryEpoch((epoch) => epoch + 1);
  }, [argsKey]);

  const resetForPageSize = (size: PageSizeOption) => {
    setPageSize(size);
    setPageIndex(0);
    setCursors([null]);
    setQueryEpoch((epoch) => epoch + 1);
  };

  const cursorForPage = cursors[pageIndex] ?? null;

  const queryArgs = useMemo(() => {
    if (args === "skip") return "skip";
    return {
      ...args,
      paginationOpts: {
        numItems: pageSize,
        cursor: cursorForPage,
        id: queryEpoch,
      },
    };
  }, [args, argsKey, pageSize, cursorForPage, queryEpoch]);

  const result = useQuery(queryRef, queryArgs) as
    | PaginatedResult<T>
    | undefined;

  resultRef.current = result;

  useEffect(() => {
    if (!result) return;
    setCachedPage(result.page);
    if (result.isDone) return;
    setCursors((prev) => {
      const nextIdx = pageIndex + 1;
      if (prev[nextIdx] === result.continueCursor) return prev;
      const next = [...prev];
      while (next.length <= nextIdx) next.push(null);
      next[nextIdx] = result.continueCursor;
      return next;
    });
  }, [result, pageIndex]);

  const page = result?.page ?? cachedPage;
  const isInitialLoading = result === undefined && cachedPage.length === 0;
  const isPageLoading = result === undefined && cachedPage.length > 0;

  const totalItems = options?.totalItems;
  const totalPages =
    totalItems != null
      ? Math.max(1, Math.ceil(totalItems / pageSize))
      : undefined;

  const canGoNextByResult = !!result && !result.isDone;
  const canGoNextByTotal =
    totalPages != null ? pageIndex + 1 < totalPages : false;
  const canGoNext = canGoNextByTotal || canGoNextByResult;
  const canGoPrev = pageIndex > 0;

  const goNext = useCallback(() => {
    setPageIndex((currentIndex) => {
      const current = resultRef.current;
      const hasMoreByTotal =
        totalPages != null ? currentIndex + 1 < totalPages : false;
      const hasMoreByResult = !!current && !current.isDone;
      if (!hasMoreByTotal && !hasMoreByResult) return currentIndex;

      const nextIdx = currentIndex + 1;
      const nextCursor = current?.continueCursor ?? cursors[nextIdx] ?? null;
      if (nextCursor != null) {
        setCursors((prev) => {
          if (prev[nextIdx] === nextCursor) return prev;
          const next = [...prev];
          while (next.length <= nextIdx) next.push(null);
          next[nextIdx] = nextCursor;
          return next;
        });
      }
      return nextIdx;
    });
  }, [cursors, totalPages]);

  const goPrev = useCallback(() => {
    if (pageIndex <= 0) return;
    setPageIndex((index) => index - 1);
  }, [pageIndex]);

  const rangeStart = page.length === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = pageIndex * pageSize + page.length;

  return {
    page,
    pageIndex,
    pageSize,
    setPageSize: resetForPageSize,
    isLoading: isInitialLoading,
    isPageLoading,
    canGoNext,
    canGoPrev,
    goNext,
    goPrev,
    totalPages,
    totalItems,
    rangeStart,
    rangeEnd,
    currentPage: pageIndex + 1,
  };
}

export function totalForStatusFilter(
  stats: Record<string, number> | undefined,
  statusFilter: string,
): number | undefined {
  if (!stats) return undefined;
  if (statusFilter === "all") return stats.total;
  const value = stats[statusFilter];
  return typeof value === "number" ? value : stats.total;
}
