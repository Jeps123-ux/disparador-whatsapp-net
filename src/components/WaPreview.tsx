import { FileText, Film, CheckCheck } from "lucide-react";
import type { ReactNode } from "react";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

/** Converte a marcação do WhatsApp (*negrito*, _itálico_, ~tachado~, ```mono```) e links em HTML seguro. */
export function waToHtml(text: string) {
  let h = escapeHtml(text);
  h = h.replace(/```([\s\S]+?)```/g, '<code class="font-mono text-[12.5px]">$1</code>');
  h = h.replace(/(^|[\s(])\*(?!\s)([^*\n]+?)\*(?=$|[\s.,!?):])/g, "$1<b>$2</b>");
  h = h.replace(/(^|[\s(])_(?!\s)([^_\n]+?)_(?=$|[\s.,!?):])/g, "$1<i>$2</i>");
  h = h.replace(/(^|[\s(])~(?!\s)([^~\n]+?)~(?=$|[\s.,!?):])/g, "$1<s>$2</s>");
  h = h.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-sky-300 underline underline-offset-2 break-all">$1</a>');
  h = h.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, '<span class="rounded bg-amber-soft/20 px-1 text-amber-soft">{{$1}}</span>');
  return h.replace(/\n/g, "<br/>");
}

export function WaPreview({ text, media, title, imageUrl }: { text: string; media?: { type: string; name: string } | null; title?: ReactNode; imageUrl?: string | null }) {
  const time = new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date());
  return (
    <div className="wa-wall rounded-2xl border border-white/5 p-4 sm:p-5">
      {title && <div className="mb-3 text-center"><span className="rounded-lg bg-ink-800/90 px-2.5 py-1 text-[11px] text-ink-300">{title}</span></div>}
      <div className="flex justify-end">
        <div className="wa-bubble max-w-[92%] sm:max-w-[85%] px-2 pt-2 pb-1.5 text-[14px] leading-[1.45] text-[#e9edef]">
          {media && (
            media.type === "image" && imageUrl ? (
              <img src={imageUrl} alt="" className="mb-1.5 rounded-lg max-h-64 w-full object-cover" />
            ) : (
              <div className="mb-1.5 flex items-center gap-3 rounded-lg bg-black/20 px-3 py-2.5">
                {media.type === "video" ? <Film className="size-7 text-ink-200" /> : <FileText className="size-7 text-ink-200" />}
                <span className="text-[13px] truncate">{media.name}</span>
              </div>
            )
          )}
          {text ? <div className="px-1 break-words" dangerouslySetInnerHTML={{ __html: waToHtml(text) }} /> : !media && <div className="px-1 text-ink-300 italic">Sua mensagem aparecerá aqui</div>}
          <div className="mt-0.5 flex items-center justify-end gap-1 px-1 text-[10.5px] text-[#8fb3a3]">
            {time} <CheckCheck className="size-3.5 text-sky-300" />
          </div>
        </div>
      </div>
    </div>
  );
}
