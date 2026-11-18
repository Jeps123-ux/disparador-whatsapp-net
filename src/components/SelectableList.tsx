import { useMemo, useRef, useState, type ReactNode } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, X } from "lucide-react";
import { Checkbox, cx } from "./ui";

export type Contact = { id: number; jid: string; phone: string | null; name: string | null; notify: string | null; imgUrl: string | null; optedOut: boolean; source: string };
export type Group = { id: number; jid: string; subject: string; size: number | null; imgUrl: string | null; announce: boolean; isAdmin: boolean; canSend: boolean };

export const contactName = (c: Contact) => c.name || c.notify || (c.phone ? `+${c.phone}` : "Sem nome");

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Lista virtualizada com busca e seleção — renderiza só as linhas visíveis. */
export function SelectableList<T extends { id: number }>({
  items, selected, onChange, searchText, renderRow, isDisabled, placeholder, height = 460, empty, toolbarExtra, selectable = true,
}: {
  items: T[];
  selected?: Set<number>;
  onChange?: (next: Set<number>) => void;
  searchText: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  isDisabled?: (item: T) => boolean;
  placeholder: string;
  height?: number;
  empty: ReactNode;
  toolbarExtra?: ReactNode;
  selectable?: boolean;
}) {
  const [q, setQ] = useState("");
  const parentRef = useRef<HTMLDivElement>(null);
  const index = useMemo(() => items.map((i) => norm(searchText(i))), [items, searchText]);
  const filtered = useMemo(() => {
    const t = norm(q.trim());
    const digits = q.replace(/\D/g, "");
    if (!t) return items;
    return items.filter((_, i) => index[i].includes(t) || (digits.length >= 3 && index[i].replace(/\D/g, "").includes(digits)));
  }, [q, items, index]);

  const v = useVirtualizer({ count: filtered.length, getScrollElement: () => parentRef.current, estimateSize: () => 60, overscan: 10 });
  const sel = selected ?? new Set<number>();
  const selectableFiltered = filtered.filter((i) => !isDisabled?.(i));
  const allFilteredSelected = selectableFiltered.length > 0 && selectableFiltered.every((i) => sel.has(i.id));
  const someFilteredSelected = selectableFiltered.some((i) => sel.has(i.id));

  const toggle = (id: number) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id); else next.add(id);
    onChange?.(next);
  };
  const selectAll = () => { const next = new Set(sel); selectableFiltered.forEach((i) => next.add(i.id)); onChange?.(next); };
  const clearAll = () => {
    if (!q.trim()) return onChange?.(new Set());
    const next = new Set(sel); filtered.forEach((i) => next.delete(i.id)); onChange?.(next);
  };

  return (
    <div className="flex flex-col">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-ink-400" />
          <input className="field !pl-10 !pr-9" placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-ink-400 hover:text-ink-100" aria-label="Limpar busca"><X className="size-4" /></button>}
        </div>
        {toolbarExtra}
      </div>
      {selectable && (
        <div className="mt-3 flex items-center justify-between gap-2 px-1">
          <label className="flex items-center gap-2.5 text-[13px] text-ink-300 cursor-pointer" onClick={() => (allFilteredSelected ? clearAll() : selectAll())}>
            <Checkbox checked={allFilteredSelected} indeterminate={!allFilteredSelected && someFilteredSelected} onChange={() => (allFilteredSelected ? clearAll() : selectAll())} />
            {q.trim() ? `Resultados (${filtered.length})` : `Todos (${items.length})`}
          </label>
          <div className="flex items-center gap-1">
            <button onClick={selectAll} className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-leaf-400 hover:bg-leaf-500/10">Selecionar todos</button>
            <button onClick={clearAll} className="rounded-lg px-2.5 py-1 text-[12.5px] font-semibold text-ink-300 hover:bg-white/5">Desmarcar todos</button>
          </div>
        </div>
      )}
      <div ref={parentRef} className="mt-2 overflow-y-auto rounded-2xl border border-white/5 bg-ink-900/60" style={{ height }}>
        {filtered.length === 0 ? (
          <div className="h-full grid place-items-center text-sm text-ink-400 p-6 text-center">{items.length === 0 ? empty : "Nenhum resultado para a busca."}</div>
        ) : (
          <div style={{ height: v.getTotalSize(), position: "relative" }}>
            {v.getVirtualItems().map((row) => {
              const item = filtered[row.index];
              const disabled = isDisabled?.(item);
              const checked = sel.has(item.id);
              return (
                <div key={item.id} data-index={row.index}
                  onClick={() => selectable && !disabled && toggle(item.id)}
                  className={cx(
                    "absolute left-0 right-0 flex items-center gap-3 px-3.5 border-b border-white/[0.04] transition-colors",
                    selectable && !disabled && "cursor-pointer hover:bg-white/[0.03]",
                    checked && "bg-leaf-500/[0.06]",
                    disabled && "opacity-55",
                  )}
                  style={{ top: 0, height: row.size, transform: `translateY(${row.start}px)` }}>
                  {selectable && <Checkbox checked={checked} disabled={disabled} onChange={() => toggle(item.id)} />}
                  {renderRow(item)}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
