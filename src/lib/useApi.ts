import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";

/** Busca dados da API com recarga manual e polling opcional. */
export function useApi<T>(path: string | null, opts: { poll?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!path);
  const pathRef = useRef(path);
  pathRef.current = path;

  const load = useCallback(async (silent = false) => {
    const p = pathRef.current;
    if (!p) return;
    if (!silent) setLoading(true);
    try {
      const d = await api<T>(p);
      if (pathRef.current === p) { setData(d); setError(null); }
    } catch (e: any) {
      if (pathRef.current === p) setError(e?.message ?? "Erro ao carregar");
    } finally {
      if (pathRef.current === p) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [path, load]);

  useEffect(() => {
    if (!opts.poll || !path) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, opts.poll);
    return () => clearInterval(t);
  }, [opts.poll, path, load]);

  return { data, error, loading, reload: load, setData };
}
