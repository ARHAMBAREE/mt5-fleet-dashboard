"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Small data-fetching hook: { data, loading, error, refetch }.
 * Re-fetches when `deps` change; refetch is stable and safe to pass to
 * realtime refresh hooks (useLiveRefresh).
 */
export function useResource<T>(fetcher: () => Promise<T>, deps: React.DependencyList = []) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const alive = useRef(true);
  const generation = useRef(0);

  const load = useCallback(async (silent = false) => {
    const request = ++generation.current;
    if (!silent) setLoading(true);
    try {
      const result = await fetcherRef.current();
      if (!alive.current || request !== generation.current) return;
      setData(result);
      setError(null);
    } catch (err) {
      if (!alive.current || request !== generation.current) return;
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      if (alive.current && request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    void load();
    const poll = setInterval(() => { if (document.visibilityState === "visible") void load(true); }, 5000);
    return () => {
      clearInterval(poll);
      generation.current++;
      alive.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const refetch = useCallback(() => load(true), [load]);

  return { data, loading, error, refetch };
}
