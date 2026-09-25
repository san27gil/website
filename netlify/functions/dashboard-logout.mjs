// POST /api/dashboard/logout  →  borra la cookie de sesión de este dispositivo
import { clearSessionCookie, fromDashboard, json } from '../lib/dashboard-auth.mjs';

export async function handleLogout(req) {
  if (req.method !== 'POST') return json({ error: 'Método no permitido' }, 405);
  if (!fromDashboard(req)) return json({ error: 'Petición no permitida' }, 403);
  return json({ ok: true }, 200, { 'set-cookie': clearSessionCookie() });
}

export default handleLogout;

export const config = { path: '/api/dashboard/logout' };
