import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api, setViewAs, getViewAs } from "./api";

export type Me = {
  user: { id: number; username: string; name: string; role: "admin" | "user"; mustChangePassword: boolean };
  viewing: { id: number; username: string; name: string; role: string } | null;
  whatsapp: { status: string; connected: boolean; phone: string | null; pushName: string | null; live: boolean };
};

type Ctx = {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<Me | null>;
  logout: () => Promise<void>;
  viewAs: (id: number | null) => Promise<void>;
};

const SessionContext = createContext<Ctx>(null!);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api<Me>("/auth/me");
      // "ver como" só vale para administradores
      if (data.user.role !== "admin" && getViewAs()) setViewAs(null);
      setMe(data);
      return data;
    } catch {
      setMe(null);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onUnauthorized = () => setMe(null);
    window.addEventListener("ecoa:unauthorized", onUnauthorized);
    return () => window.removeEventListener("ecoa:unauthorized", onUnauthorized);
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setViewAs(null);
    setMe(null);
  }, []);

  const viewAs = useCallback(async (id: number | null) => {
    setViewAs(id);
    await refresh();
  }, [refresh]);

  return <SessionContext.Provider value={{ me, loading, refresh, logout, viewAs }}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);
