// Utilidades de autenticación del dashboard: TOTP (Google Authenticator),
// tokens de sesión firmados y límite de intentos de login.
// Sin dependencias: solo node:crypto.
import { createHmac, createHash, timingSafeEqual } from 'node:crypto';

export const SESSION_DAYS = 7;
const TOTP_STEP = 30;          // segundos por código
const MAX_FAILS_IP = 3;        // intentos fallidos por IP…
const IP_WINDOW = 15 * 60e3;   // …en 15 minutos

// ─── TOTP (RFC 6238) ───────────────────────────────────────────────
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(str) {
  const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0, value = 0;
  const out = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function base32Encode(buf) {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function totpAt(secret, counter) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', base32Decode(secret)).update(msg).digest();
  const off = h[h.length - 1] & 0xf;
  const bin = (h.readUInt32BE(off) & 0x7fffffff) % 1_000_000;
  return String(bin).padStart(6, '0');
}

/** Devuelve el contador que coincide (±1 paso de tolerancia) o null. */
export function verifyTotp(secret, code, now = Date.now()) {
  if (!/^\d{6}$/.test(String(code || ''))) return null;
  const current = Math.floor(now / 1000 / TOTP_STEP);
  for (const c of [current, current - 1, current + 1]) {
    if (safeEqual(totpAt(secret, c), code)) return c;
  }
  return null;
}

// ─── Comparación en tiempo constante ───────────────────────────────
export function safeEqual(a, b) {
  const ha = createHash('sha256').update(String(a ?? '')).digest();
  const hb = createHash('sha256').update(String(b ?? '')).digest();
  return timingSafeEqual(ha, hb);
}

// ─── Tokens de sesión: base64url(payload).base64url(hmac) ─────────
const b64u = buf => Buffer.from(buf).toString('base64url');

export function signToken(secret, payload) {
  const body = b64u(JSON.stringify(payload));
  const sig = b64u(createHmac('sha256', secret).update(body).digest());
  return `${body}.${sig}`;
}

export function verifyToken(secret, token, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  const expected = b64u(createHmac('sha256', secret).update(body).digest());
  if (!safeEqual(sig, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!payload.exp || payload.exp < now) return null;
    // También caducan por antigüedad: los tokens emitidos cuando la sesión duraba más no se alargan
    if (!payload.iat || now - payload.iat > SESSION_DAYS * 86400e3) return null;
    return payload;
  } catch {
    return null;
  }
}

export function bearer(req) {
  const h = req.headers.get('authorization') || '';
  return h.startsWith('Bearer ') ? h.slice(7) : null;
}

// ─── Límite de intentos (guardado en el store de Blobs) ───────────
const failKey = ip => `auth/fails/${encodeURIComponent(ip)}`;

async function readCounter(store, key, windowMs, now) {
  const c = await store.get(key, { type: 'json' });
  if (!c || now - c.first > windowMs) return { n: 0, first: now };
  return c;
}

// Solo se bloquea por IP: un bloqueo global permitiría a cualquiera dejar fuera al propietario
export async function isLocked(store, ip, now = Date.now()) {
  const byIp = await readCounter(store, failKey(ip), IP_WINDOW, now);
  return byIp.n >= MAX_FAILS_IP;
}

export async function recordFailure(store, ip, now = Date.now()) {
  const byIp = await readCounter(store, failKey(ip), IP_WINDOW, now);
  await store.setJSON(failKey(ip), { n: byIp.n + 1, first: byIp.first });
}

export async function clearFailures(store, ip) {
  await store.delete(failKey(ip));
}

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}
