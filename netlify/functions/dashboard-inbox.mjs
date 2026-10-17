// Buzón para añadir cosas desde Siri / Atajos sin abrir el dashboard.
// POST   /api/dashboard/inbox  { type: event|link|weight|habit, text }   (Authorization: Bearer <token>)
//        → texto plano con lo que se ha entendido, para que Siri lo lea en voz alta
// GET    /api/dashboard/inbox  → { items }            (sesión del dashboard)
// DELETE /api/dashboard/inbox  { ids }  → { left }    (sesión del dashboard)
// Lo capturado no se escribe en los datos directamente (eso chocaría con los cambios sin subir
// de otro dispositivo): el dashboard lo recoge al abrirse, lo añade y lo borra del buzón.
import { getStore } from '@netlify/blobs';
import { randomUUID } from 'node:crypto';
import { verifyToken, sessionToken, fromDashboard, safeEqual, json } from '../lib/dashboard-auth.mjs';
import { parseEvent, parseWeight, matchHabit, parseLink, describeDate, madridToday } from '../lib/dashboard-capture.mjs';

const INBOX_KEY = 'owner/inbox';
const DATA_KEY = 'owner/data';
const MAX_ITEMS = 200;
const MAX_TEXT = 1000;

const text = (msg, status = 200) =>
  new Response(msg, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });

function bearer(req) {
  const m = (req.headers.get('authorization') || '').match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : '';
}

const todayIso = now => {
  const t = madridToday(now);
  return `${t.y}-${String(t.m).padStart(2, '0')}-${String(t.d).padStart(2, '0')}`;
};

// Devuelve [item, mensaje] o [null, error]
async function buildItem(type, raw, store, now) {
  if (type === 'event') {
    const ev = parseEvent(raw, now);
    if (!ev.title) return [null, 'No he entendido qué anotar.'];
    const tag = ev.color === 'urgente' ? ' (urgente)' : ev.color === 'importante' ? ' (importante)' : '';
    return [ev, `Anotado: ${ev.title}, ${describeDate(ev.date, ev.time, now)}${tag}.`];
  }
  if (type === 'link') {
    const link = parseLink(raw);
    if (!link) return [null, 'No encuentro ningún link.'];
    return [link, 'Guardado para luego.'];
  }
  if (type === 'weight') {
    const val = parseWeight(raw);
    if (val === null) return [null, 'No he entendido el peso. Di solo el número, por ejemplo 78,4.'];
    return [{ val, date: todayIso(now) }, `Peso anotado: ${String(val).replace('.', ',')} kg.`];
  }
  if (type === 'habit') {
    const current = await store.get(DATA_KEY, { type: 'json' });
    const habits = Array.isArray(current?.data?.habits) ? current.data.habits.filter(h => typeof h === 'string') : [];
    const { habit, candidates } = matchHabit(raw, habits);
    if (habit) return [{ habit, date: todayIso(now) }, `Hecho: ${habit}.`];
    if (candidates.length > 1) return [null, `¿Cuál de estos? ${candidates.join(', ')}.`];
    return [null, habits.length ? `No encuentro ese hábito. Tienes: ${habits.join(', ')}.` : 'Aún no tienes hábitos.'];
  }
  return [null, 'Tipo no válido.'];
}

export async function handleInbox(req, { store, env, now = Date.now() }) {
  if (req.method === 'POST') {
    const token = env.DASHBOARD_CAPTURE_TOKEN;
    if (!token) return text('Captura no configurada en el servidor.', 500);
    if (!safeEqual(bearer(req), token)) return text('No autorizado.', 401);

    let body;
    try { body = await req.json(); } catch { return text('JSON inválido.', 400); }
    const raw = String(body?.text ?? '').trim().slice(0, MAX_TEXT);
    if (!raw) return text('No he recibido nada.', 400);

    const type = String(body?.type || 'event');
    const [item, msg] = await buildItem(type, raw, store, now);
    if (!item) return text(msg, 422);

    const inbox = (await store.get(INBOX_KEY, { type: 'json' })) || { items: [] };
    if (inbox.items.length >= MAX_ITEMS) return text('El buzón está lleno. Abre el dashboard para vaciarlo.', 507);
    inbox.items.push({ id: randomUUID(), type, at: now, ...item });
    await store.setJSON(INBOX_KEY, inbox);
    return text(msg);
  }

  // Lectura y vaciado: solo el dashboard con la sesión del propietario
  const secret = env.DASHBOARD_SESSION_SECRET;
  if (!secret) return json({ error: 'Servidor no configurado' }, 500);
  if (!fromDashboard(req)) return json({ error: 'Petición no permitida' }, 403);
  if (!verifyToken(secret, sessionToken(req), now)) return json({ error: 'No autorizado' }, 401);

  const readInbox = async () => (await store.get(INBOX_KEY, { type: 'json' })) || { items: [] };
  if (req.method === 'GET') return json({ items: (await readInbox()).items });

  if (req.method === 'DELETE') {
    let body;
    try { body = await req.json(); } catch { body = {}; }
    const ids = new Set(Array.isArray(body?.ids) ? body.ids.map(String) : []);
    const items = (await readInbox()).items.filter(i => !ids.has(i.id));
    await store.setJSON(INBOX_KEY, { items });
    return json({ left: items.length });
  }

  return json({ error: 'Método no permitido' }, 405);
}

export default async req =>
  handleInbox(req, {
    store: getStore({ name: 'dashboard', consistency: 'strong' }),
    env: process.env,
  });

export const config = { path: '/api/dashboard/inbox' };
