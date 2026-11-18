const VIEW_AS_KEY = "ecoa_view_as";

export function getViewAs(): number | null {
  const v = sessionStorage.getItem(VIEW_AS_KEY);
  return v ? Number(v) : null;
}
export function setViewAs(id: number | null) {
  if (id) sessionStorage.setItem(VIEW_AS_KEY, String(id));
  else sessionStorage.removeItem(VIEW_AS_KEY);
}

export class ApiError extends Error {
  constructor(public status: number, message: string, public code?: string) {
    super(message);
  }
}

type Opts = { method?: string; body?: unknown; form?: FormData; signal?: AbortSignal };

export async function api<T = any>(path: string, opts: Opts = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Requested-With": "ecoa" };
  const viewAs = getViewAs();
  if (viewAs) headers["X-View-As"] = String(viewAs);
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? (body ? "POST" : "GET"),
    headers,
    body,
    credentials: "same-origin",
    signal: opts.signal,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith("/auth/login")) {
      window.dispatchEvent(new CustomEvent("ecoa:unauthorized"));
    }
    throw new ApiError(res.status, data?.error ?? `Erro ${res.status}`, data?.code);
  }
  return data as T;
}

export const fmtInt = (n: number) => new Intl.NumberFormat("pt-BR").format(n);

export function fmtDate(v?: string | Date | null, withTime = true) {
  if (!v) return "—";
  const d = new Date(v);
  return new Intl.DateTimeFormat("pt-BR", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "medium" }).format(d);
}

export function timeAgo(v?: string | Date | null) {
  if (!v) return "nunca";
  const diff = (Date.now() - new Date(v).getTime()) / 1000;
  if (diff < 60) return "agora há pouco";
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`;
  return `há ${Math.floor(diff / 86400)} d`;
}

export { formatPhone } from "../../shared/template";
