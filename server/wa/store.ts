import { and, eq, inArray, notInArray, sql } from "drizzle-orm";
import { isJidGroup, isJidBroadcast, isJidNewsletter, isLidUser, isPnUser, jidDecode, jidNormalizedUser, type Contact } from "baileys";
import { db, contacts, waGroups } from "../../db/index.js";

export type NormContact = { jid: string; phone: string | null; name: string | null; notify: string | null; lid: string | null; imgUrl?: string | null };

const clean = (s?: string | null) => {
  const v = (s ?? "").trim();
  return v ? v.slice(0, 200) : null;
};

/** Converte qualquer forma de contato do Baileys (PN, LID, chat) num registro canônico. */
export function normalizeContact(c: Partial<Contact> & { pnJid?: string | null; lidJid?: string | null; displayName?: string | null }): NormContact | null {
  const id = c.id;
  if (!id) return null;
  if (isJidGroup(id) || isJidBroadcast(id) || isJidNewsletter(id) || id.endsWith("@status") || id.endsWith("@bot")) return null;
  const pnJidRaw = c.phoneNumber || c.pnJid || (isPnUser(id) ? id : undefined);
  const lidRaw = c.lid || c.lidJid || (isLidUser(id) ? id : undefined);
  const pnJid = pnJidRaw ? jidNormalizedUser(pnJidRaw) : null;
  const lid = lidRaw ? jidNormalizedUser(lidRaw) : null;
  const jid = pnJid ?? lid;
  if (!jid) return null;
  const phone = pnJid ? jidDecode(pnJid)?.user ?? null : null;
  if (phone && !/^\d{6,16}$/.test(phone)) return null;
  return {
    jid,
    phone,
    lid,
    name: clean(c.name ?? c.displayName),
    notify: clean(c.notify ?? c.verifiedName),
    imgUrl: c.imgUrl && c.imgUrl !== "changed" ? c.imgUrl : undefined,
  };
}

/** Upsert em lote: nunca apaga um nome conhecido com um valor vazio. Mescla duplicatas LID → PN. */
export async function persistContacts(userId: number, list: NormContact[]) {
  if (!list.length) return 0;
  const merged = new Map<string, NormContact>();
  for (const c of list) {
    const prev = merged.get(c.jid);
    merged.set(c.jid, prev ? { ...prev, ...Object.fromEntries(Object.entries(c).filter(([, v]) => v != null)) } as NormContact : c);
  }
  const values = [...merged.values()];
  for (let i = 0; i < values.length; i += 500) {
    const chunk = values.slice(i, i + 500);
    await db
      .insert(contacts)
      .values(chunk.map((c) => ({ userId, jid: c.jid, phone: c.phone, name: c.name, notify: c.notify, imgUrl: c.imgUrl ?? null })))
      .onConflictDoUpdate({
        target: [contacts.userId, contacts.jid],
        set: {
          phone: sql`coalesce(excluded.phone, ${contacts.phone})`,
          name: sql`coalesce(excluded.name, ${contacts.name})`,
          notify: sql`coalesce(excluded.notify, ${contacts.notify})`,
          imgUrl: sql`coalesce(excluded.img_url, ${contacts.imgUrl})`,
          updatedAt: new Date(),
        },
      });
  }
  // Quando o mesmo contato aparece como LID e como número de telefone, mantém só o registro com número.
  const lidDupes = values.filter((c) => c.lid && c.phone && c.lid !== c.jid).map((c) => c.lid!) ;
  if (lidDupes.length) {
    await db.delete(contacts).where(and(eq(contacts.userId, userId), inArray(contacts.jid, lidDupes), eq(contacts.optedOut, false)));
  }
  return values.length;
}

/** Aplica um mapeamento LID → PN recebido do WhatsApp. */
export async function applyLidMapping(userId: number, lid: string, pn: string) {
  const lidJid = jidNormalizedUser(lid);
  const pnJid = jidNormalizedUser(pn);
  const phone = jidDecode(pnJid)?.user ?? null;
  const [existingPn] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.userId, userId), eq(contacts.jid, pnJid)));
  const [lidRow] = await db.select().from(contacts).where(and(eq(contacts.userId, userId), eq(contacts.jid, lidJid)));
  if (!lidRow) return;
  if (existingPn) {
    await db.update(contacts).set({
      name: sql`coalesce(${contacts.name}, ${lidRow.name})`,
      notify: sql`coalesce(${contacts.notify}, ${lidRow.notify})`,
      optedOut: sql`${contacts.optedOut} or ${lidRow.optedOut}`,
    }).where(eq(contacts.id, existingPn.id));
    await db.delete(contacts).where(eq(contacts.id, lidRow.id));
  } else {
    await db.update(contacts).set({ jid: pnJid, phone, updatedAt: new Date() }).where(eq(contacts.id, lidRow.id));
  }
}

export type NormGroup = { jid: string; subject: string; size: number | null; announce: boolean; isAdmin: boolean; imgUrl?: string | null };

export async function persistGroups(userId: number, list: NormGroup[], opts: { replace?: boolean } = {}) {
  if (list.length) {
    for (let i = 0; i < list.length; i += 300) {
      const chunk = list.slice(i, i + 300);
      await db
        .insert(waGroups)
        .values(chunk.map((g) => ({ userId, jid: g.jid, subject: g.subject, size: g.size, announce: g.announce, isAdmin: g.isAdmin, imgUrl: g.imgUrl ?? null })))
        .onConflictDoUpdate({
          target: [waGroups.userId, waGroups.jid],
          set: {
            subject: sql`excluded.subject`,
            size: sql`excluded.size`,
            announce: sql`excluded.announce`,
            isAdmin: sql`excluded.is_admin`,
            imgUrl: sql`coalesce(excluded.img_url, ${waGroups.imgUrl})`,
            updatedAt: new Date(),
          },
        });
    }
  }
  if (opts.replace) {
    // Remove grupos dos quais o número saiu.
    const keep = list.map((g) => g.jid);
    if (keep.length) await db.delete(waGroups).where(and(eq(waGroups.userId, userId), notInArray(waGroups.jid, keep)));
    else await db.delete(waGroups).where(eq(waGroups.userId, userId));
  }
}
