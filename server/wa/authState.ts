import { and, eq, inArray, sql } from "drizzle-orm";
import { BufferJSON, initAuthCreds, proto, type AuthenticationCreds, type AuthenticationState, type SignalDataTypeMap } from "baileys";
import { db, waConnections, waAuthKeys } from "../../db/index.js";
import { encrypt, decrypt } from "../lib/crypto.js";

const ser = (v: unknown) => JSON.stringify(v, BufferJSON.replacer);
const de = (s: string) => JSON.parse(s, BufferJSON.reviver);

/**
 * Estado de autenticação do Baileys persistido no Netlify Database.
 * Credenciais e chaves Signal ficam cifradas com AES-256-GCM (ver lib/crypto.ts) e nunca
 * são expostas pela API — nem mesmo a administradores.
 */
export async function useDbAuthState(userId: number): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void>; isNew: boolean }> {
  const [row] = await db.select({ credsEnc: waConnections.credsEnc }).from(waConnections).where(eq(waConnections.userId, userId));
  let creds: AuthenticationCreds;
  let isNew = false;
  if (row?.credsEnc) {
    creds = de(await decrypt(row.credsEnc));
  } else {
    creds = initAuthCreds();
    isNew = true;
  }

  const saveCreds = async () => {
    const enc = await encrypt(ser(creds));
    await db
      .insert(waConnections)
      .values({ userId, credsEnc: enc, registered: !!creds.registered || !!creds.me })
      .onConflictDoUpdate({ target: waConnections.userId, set: { credsEnc: enc, registered: !!creds.registered || !!creds.me, updatedAt: new Date() } });
  };

  const state: AuthenticationState = {
    creds,
    keys: {
      get: async (type, ids) => {
        const out: { [id: string]: any } = {};
        if (!ids.length) return out;
        const found = await db
          .select({ keyId: waAuthKeys.keyId, valueEnc: waAuthKeys.valueEnc })
          .from(waAuthKeys)
          .where(and(eq(waAuthKeys.userId, userId), eq(waAuthKeys.type, type), inArray(waAuthKeys.keyId, ids)));
        for (const f of found) {
          let value = de(await decrypt(f.valueEnc));
          if (type === "app-state-sync-key" && value) value = proto.Message.AppStateSyncKeyData.fromObject(value);
          out[f.keyId] = value;
        }
        return out as { [id: string]: SignalDataTypeMap[typeof type] };
      },
      set: async (data) => {
        const upserts: { userId: number; type: string; keyId: string; valueEnc: string }[] = [];
        const removals: { type: string; keyId: string }[] = [];
        for (const category in data) {
          const entries = (data as any)[category] as Record<string, unknown>;
          for (const id in entries) {
            const value = entries[id];
            if (value) upserts.push({ userId, type: category, keyId: id, valueEnc: await encrypt(ser(value)) });
            else removals.push({ type: category, keyId: id });
          }
        }
        for (let i = 0; i < upserts.length; i += 200) {
          const chunk = upserts.slice(i, i + 200);
          await db
            .insert(waAuthKeys)
            .values(chunk)
            .onConflictDoUpdate({
              target: [waAuthKeys.userId, waAuthKeys.type, waAuthKeys.keyId],
              set: { valueEnc: sqlExcluded("value_enc") },
            });
        }
        const byType = new Map<string, string[]>();
        for (const r of removals) byType.set(r.type, [...(byType.get(r.type) ?? []), r.keyId]);
        for (const [type, keyIds] of byType) {
          await db.delete(waAuthKeys).where(and(eq(waAuthKeys.userId, userId), eq(waAuthKeys.type, type), inArray(waAuthKeys.keyId, keyIds)));
        }
      },
    },
  };
  return { state, saveCreds, isNew };
}

function sqlExcluded(col: string) {
  return sql.raw(`excluded.${col}`);
}

/** Apaga totalmente a sessão salva (logout / sessão inválida). */
export async function clearAuthState(userId: number) {
  await db.delete(waAuthKeys).where(eq(waAuthKeys.userId, userId));
  await db
    .update(waConnections)
    .set({ credsEnc: null, registered: false, qr: null, pairingCode: null, updatedAt: new Date() })
    .where(eq(waConnections.userId, userId));
}
