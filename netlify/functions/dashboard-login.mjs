// POST /api/dashboard/login  { password, code }  →  { token, exp }
// Acceso exclusivo del propietario: contraseña + código de Google Authenticator.
import { getStore } from '@netlify/blobs';
import {
  SESSION_DAYS, verifyTotp, safeEqual, signToken,
  isLocked, recordFailure, clearFailures, json,
} from '../lib/dashboard-auth.mjs';

export async function handleLogin(req, { store, env, ip, now = Date.now() }) {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);

  const { DASHBOARD_PASSWORD, DASHBOARD_TOTP_SECRET, DASHBOARD_SESSION_SECRET } = env;
  if (!DASHBOARD_PASSWORD || !DASHBOARD_TOTP_SECRET || !DASHBOARD_SESSION_SECRET) {
    return json({ error: 'Login no configurado en el servidor' }, 500);
  }

  if (await isLocked(store, ip, now)) {
    return json({ error: 'Demasiados intentos. Prueba más tarde.' }, 429);
  }

  let body;
  try { body = await req.json(); } catch { body = {}; }

  const passOk = safeEqual(body.password, DASHBOARD_PASSWORD);
  const counter = verifyTotp(DASHBOARD_TOTP_SECRET, body.code, now);
  // Un mismo código no se puede reutilizar (evita repetir un login capturado)
  const last = await store.get('auth/last-totp', { type: 'json' });
  const replay = counter !== null && last && counter <= last.counter;

  if (!passOk || counter === null || replay) {
    await recordFailure(store, ip, now);
    const msg = replay ? 'Código ya usado. Espera al siguiente.' : 'Contraseña o código incorrectos';
    return json({ error: msg }, 401);
  }

  await store.setJSON('auth/last-totp', { counter });
  await clearFailures(store, ip);

  const exp = now + SESSION_DAYS * 86400e3;
  const token = signToken(DASHBOARD_SESSION_SECRET, { sub: 'owner', iat: now, exp });
  return json({ token, exp });
}

export default async (req, context) =>
  handleLogin(req, {
    store: getStore({ name: 'dashboard', consistency: 'strong' }),
    env: process.env,
    ip: context.ip || 'desconocida',
  });

export const config = { path: '/api/dashboard/login' };
