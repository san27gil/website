// GET /api/dashboard/data  →  { data, updatedAt }
// PUT /api/dashboard/data  { data, base }  →  { updatedAt }  |  409 { data, updatedAt }
// `base` es la versión de la nube sobre la que el cliente hizo sus cambios:
// si la nube tiene algo más reciente, se rechaza para no pisar datos de otro dispositivo.
import { getStore } from '@netlify/blobs';
import { verifyToken, bearer, json } from '../lib/dashboard-auth.mjs';

const DATA_KEY = 'owner/data';
const MAX_BYTES = 5 * 1024 * 1024;

export async function handleData(req, { store, env, now = Date.now() }) {
  const secret = env.DASHBOARD_SESSION_SECRET;
  if (!secret) return json({ error: 'Servidor no configurado' }, 500);
  if (!verifyToken(secret, bearer(req), now)) return json({ error: 'No autorizado' }, 401);

  const current = (await store.get(DATA_KEY, { type: 'json' })) || { data: null, updatedAt: 0 };

  if (req.method === 'GET') return json(current);

  if (req.method === 'PUT') {
    const raw = await req.text();
    if (raw.length > MAX_BYTES) return json({ error: 'Datos demasiado grandes' }, 413);
    let body;
    try { body = JSON.parse(raw); } catch { return json({ error: 'JSON inválido' }, 400); }
    if (!body || typeof body.data !== 'object' || body.data === null) {
      return json({ error: 'Falta el campo data' }, 400);
    }
    if (!body.force && current.updatedAt > (Number(body.base) || 0)) {
      return json(current, 409);
    }
    const updatedAt = Math.max(now, current.updatedAt + 1);
    await store.setJSON(DATA_KEY, { data: body.data, updatedAt });
    return json({ updatedAt });
  }

  return json({ error: 'Método no permitido' }, 405);
}

export default async req =>
  handleData(req, {
    store: getStore({ name: 'dashboard', consistency: 'strong' }),
    env: process.env,
  });

export const config = { path: '/api/dashboard/data' };
