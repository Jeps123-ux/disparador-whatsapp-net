/**
 * Motor de variáveis dinâmicas — compartilhado entre o frontend (pré-visualização)
 * e o backend (envio real), garantindo que a prévia seja idêntica ao que será enviado.
 */

export const TEMPLATE_VARIABLES = [
  { key: "nome", label: "Primeiro nome" },
  { key: "sobrenome", label: "Sobrenome" },
  { key: "nome_completo", label: "Nome completo" },
  { key: "telefone", label: "Telefone" },
  { key: "data", label: "Data (dd/mm/aaaa)" },
  { key: "hora", label: "Hora (hh:mm)" },
  { key: "dia_da_semana", label: "Dia da semana" },
  { key: "mes", label: "Mês por extenso" },
  { key: "ano", label: "Ano" },
] as const;

export type TemplateRecipient = { name?: string | null; phone?: string | null };

export function formatPhone(raw?: string | null): string {
  if (!raw) return "";
  const d = raw.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const num = d.slice(4);
    const a = num.length === 9 ? num.slice(0, 5) : num.slice(0, 4);
    const b = num.length === 9 ? num.slice(5) : num.slice(4);
    return `+55 (${ddd}) ${a}-${b}`;
  }
  return d ? `+${d}` : "";
}

function dateParts(now: Date, timeZone: string) {
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("pt-BR", { timeZone, ...opts }).format(now);
  return {
    data: fmt({ day: "2-digit", month: "2-digit", year: "numeric" }),
    hora: fmt({ hour: "2-digit", minute: "2-digit", hour12: false }),
    dia_da_semana: fmt({ weekday: "long" }),
    mes: fmt({ month: "long" }),
    ano: fmt({ year: "numeric" }),
  };
}

export function renderTemplate(
  template: string,
  recipient: TemplateRecipient,
  opts: { now?: Date; timeZone?: string; fallbackName?: string } = {},
): string {
  const fullName = (recipient.name ?? "").trim() || (opts.fallbackName ?? "").trim();
  const [first, ...rest] = fullName.split(/\s+/).filter(Boolean);
  const values: Record<string, string> = {
    nome: first ?? "",
    sobrenome: rest.join(" "),
    nome_completo: fullName,
    telefone: formatPhone(recipient.phone),
    ...dateParts(opts.now ?? new Date(), opts.timeZone ?? "America/Sao_Paulo"),
  };
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (match, key: string) => {
    const k = key.toLowerCase();
    return k in values ? values[k] : match;
  });
}

export function composeMessage(
  template: string,
  recipient: TemplateRecipient,
  opts: { now?: Date; timeZone?: string; fallbackName?: string; footer?: string | null } = {},
): string {
  const body = renderTemplate(template, recipient, opts);
  const footer = (opts.footer ?? "").trim();
  if (!footer) return body;
  return body ? `${body}\n\n_${footer}_` : `_${footer}_`;
}
