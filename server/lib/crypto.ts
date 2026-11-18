import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash, createCipheriv, createDecipheriv } from "node:crypto";
import { getStore } from "@netlify/blobs";

const N = 16384, R = 8, P = 1, KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

function scrypt(pw: string, salt: Buffer, len: number, opts: { N: number; r: number; p: number; maxmem: number }) {
  return new Promise<Buffer>((resolve, reject) =>
    _scrypt(pw, salt, len, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );
}

/** Hash de senha com scrypt + salt aleatório. Formato: scrypt$N$r$p$salt$hash */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salt.toString("base64"), hash.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  const actual = await scrypt(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");
export const sha256 = (v: string) => createHash("sha256").update(v).digest("hex");

/*
 * Criptografia das sessões do WhatsApp (AES-256-GCM).
 * Chave preferencial: variável de ambiente SESSION_ENCRYPTION_KEY (qualquer segredo longo e aleatório).
 * Sem ela, uma chave-mestra aleatória é gerada uma única vez e guardada no Netlify Blobs — fora do
 * banco de dados, de modo que um dump do Postgres sozinho não permite decifrar as sessões.
 * Cada valor cifrado carrega o prefixo da chave usada ("e1" = env, "b1" = blobs), então as duas
 * podem coexistir durante uma troca de chave.
 */
let blobKeyPromise: Promise<Buffer> | null = null;

function envKey(): Buffer | null {
  const raw = process.env.SESSION_ENCRYPTION_KEY;
  if (!raw) return null;
  return createHash("sha256").update(raw).digest();
}

async function blobKey(): Promise<Buffer> {
  if (!blobKeyPromise) {
    blobKeyPromise = (async () => {
      const store = getStore({ name: "ecoa-keys", consistency: "strong" });
      const existing = await store.get("session-master-key", { type: "text" });
      if (existing) return Buffer.from(existing, "base64");
      const key = randomBytes(32);
      await store.set("session-master-key", key.toString("base64"), { onlyIfNew: true });
      const confirmed = await store.get("session-master-key", { type: "text" });
      return Buffer.from(confirmed ?? key.toString("base64"), "base64");
    })().catch((e) => {
      blobKeyPromise = null;
      throw e;
    });
  }
  return blobKeyPromise;
}

export async function encrypt(plain: string): Promise<string> {
  const ek = envKey();
  const key = ek ?? (await blobKey());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [ek ? "e1" : "b1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(":");
}

export async function decrypt(payload: string): Promise<string> {
  const [ver, ivB64, tagB64, dataB64] = payload.split(":");
  const key = ver === "e1" ? envKey() : await blobKey();
  if (!key) throw new Error("SESSION_ENCRYPTION_KEY ausente: não é possível decifrar a sessão salva.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
