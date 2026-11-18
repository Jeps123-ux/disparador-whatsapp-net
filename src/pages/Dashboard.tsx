import { Link } from "react-router-dom";
import { Send } from "lucide-react";
import { useApi } from "../lib/useApi";
import { useSession } from "../lib/session";
import { Button, PageHeader, Skeleton, ErrorNote, InfoNote } from "../components/ui";
import { Overview, type Stats, type CampaignRow } from "../components/Overview";

type DashboardData = { stats: Stats; whatsapp: any; recent: CampaignRow[] };

export default function DashboardPage() {
  const { me } = useSession();
  const { data, error, loading } = useApi<DashboardData>("/dashboard", { poll: 15000 });
  const firstName = (me?.viewing?.name || me?.user.name || me?.user.username || "").split(" ")[0];
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <>
      <PageHeader
        eyebrow="Painel"
        title={me?.viewing ? `Painel de ${firstName}` : `${greet}, ${firstName}`}
        subtitle="Visão geral do seu número, contatos e campanhas."
        actions={<Link to="/disparo"><Button icon={<Send className="size-4" />}>Criar disparo</Button></Link>}
      />
      {me?.user.mustChangePassword && !me.viewing && (
        <div className="mb-5"><InfoNote tone="amber">Sua senha foi definida pelo administrador. <Link className="underline font-semibold" to="/configuracoes">Altere-a nas configurações</Link>.</InfoNote></div>
      )}
      {error && <ErrorNote>{error}</ErrorNote>}
      {loading && !data && (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <Skeleton className="h-60" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-28" />)}</div>
        </div>
      )}
      {data && <Overview stats={data.stats} recent={data.recent} wa={data.whatsapp} />}
    </>
  );
}
