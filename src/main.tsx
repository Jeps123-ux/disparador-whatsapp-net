import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import "./styles.css";
import { SessionProvider, useSession } from "./lib/session";
import { ToastProvider } from "./components/ui";
import { AppLayout, Logo } from "./components/Layout";
import LoginPage from "./pages/Login";
import DashboardPage from "./pages/Dashboard";
import ConnectionPage from "./pages/Connection";
import ComposePage from "./pages/Compose";
import { ContactsPage, GroupsPage } from "./pages/Directory";
import HistoryPage from "./pages/History";
import CampaignPage from "./pages/Campaign";
import SettingsPage from "./pages/Settings";
import AdminUsersPage from "./pages/AdminUsers";
import { MonitorPage, MonitorUserPage } from "./pages/Monitor";

function Splash() {
  return (
    <div className="min-h-dvh grid place-items-center">
      <div className="animate-pulse"><Logo /></div>
    </div>
  );
}

function Protected({ children, admin }: { children: React.ReactNode; admin?: boolean }) {
  const { me, loading } = useSession();
  const loc = useLocation();
  if (loading) return <Splash />;
  if (!me) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  if (admin && me.user.role !== "admin") return <Navigate to="/" replace />;
  return <AppLayout>{children}</AppLayout>;
}

/** Primeiro acesso: sem WhatsApp conectado, leva direto para a tela de conexão. */
function FirstRunRedirect() {
  const { me } = useSession();
  const nav = useNavigate();
  const loc = useLocation();
  useEffect(() => {
    if (!me || me.viewing) return;
    const key = `ecoa_first_run_${me.user.id}`;
    if (!me.whatsapp.connected && loc.pathname === "/" && !sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      nav("/conexao", { replace: true });
    }
  }, [me, loc.pathname, nav]);
  return null;
}

function App() {
  return (
    <>
      <FirstRunRedirect />
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<Protected><DashboardPage /></Protected>} />
        <Route path="/conexao" element={<Protected><ConnectionPage /></Protected>} />
        <Route path="/disparo" element={<Protected><ComposePage /></Protected>} />
        <Route path="/contatos" element={<Protected><ContactsPage /></Protected>} />
        <Route path="/grupos" element={<Protected><GroupsPage /></Protected>} />
        <Route path="/historico" element={<Protected><HistoryPage /></Protected>} />
        <Route path="/historico/:id" element={<Protected><CampaignPage /></Protected>} />
        <Route path="/configuracoes" element={<Protected><SettingsPage /></Protected>} />
        <Route path="/admin/usuarios" element={<Protected admin><AdminUsersPage /></Protected>} />
        <Route path="/admin/monitoramento" element={<Protected admin><MonitorPage /></Protected>} />
        <Route path="/admin/monitoramento/:id" element={<Protected admin><MonitorUserPage /></Protected>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <SessionProvider>
        <ToastProvider>
          <App />
        </ToastProvider>
      </SessionProvider>
    </BrowserRouter>
  </StrictMode>,
);
