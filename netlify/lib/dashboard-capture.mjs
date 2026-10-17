// Interpreta lo que se dicta a Siri («dentista mañana a las 5 urgente») y lo convierte en
// datos del dashboard. Sin dependencias. Las fechas se calculan en hora de Madrid.

const TZ = 'Europe/Madrid';
const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
const NUM_WORDS = { una: 1, uno: 1, un: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7,
  ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12 };

// Minúsculas y sin tildes, conservando la longitud (para poder recortar el texto original)
const fold = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/** Fecha de hoy en Madrid como {y, m, d} (m de 1 a 12). */
export function madridToday(now = Date.now()) {
  const [y, m, d] = new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date(now)).split('-').map(Number);
  return { y, m, d };
}

const iso = (y, m, d) => {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.toISOString().slice(0, 10);
};
const addDaysIso = (isoStr, n) => {
  const t = new Date(isoStr + 'T12:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};
const dowOf = isoStr => new Date(isoStr + 'T12:00:00Z').getUTCDay();
const validDay = (y, m, d) => m >= 1 && m <= 12 && d >= 1 && d === new Date(Date.UTC(y, m - 1, d)).getUTCDate();

// Cada regla busca en el texto sin tildes; lo que encuentra se borra del título
function cut(state, re, fn) {
  const m = state.folded.match(re);
  if (!m) return false;
  if (fn(m) === false) return false;
  const a = m.index, b = m.index + m[0].length;
  state.text = state.text.slice(0, a) + ' ' + state.text.slice(b);
  state.folded = state.folded.slice(0, a) + ' ' + state.folded.slice(b);
  return true;
}

const hourNum = s => /^\d+$/.test(s) ? Number(s) : NUM_WORDS[s];

/** «Dentista mañana a las 5 y media urgente» → {title, date, time, color} */
export function parseEvent(input, now = Date.now()) {
  const st = { text: ` ${String(input || '').normalize('NFC').trim()} `, folded: '' };
  st.folded = fold(st.text);
  const t = madridToday(now);
  const today = iso(t.y, t.m, t.d);
  let date = '', time = '', color = 'rutina';

  // Tipo
  cut(st, /\s(muy\s+)?urgente\s/, () => { color = 'urgente'; });
  if (color === 'rutina') cut(st, /\s(muy\s+)?importante\s/, () => { color = 'importante'; });

  // Hora: «a las 17:30», «a las 5 y media», «a las 6 menos cuarto», «a las 5 de la tarde», «a mediodía»
  const H = '(\\d{1,2}|una|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce)';
  const timeRe = new RegExp(`\\s(?:a\\s+las?|sobre\\s+las?|hacia\\s+las?|las)\\s+${H}(?:[:.h](\\d{2}))?` +
    `(?:\\s+(y\\s+media|y\\s+cuarto|menos\\s+cuarto|y\\s+\\d{1,2}|en\\s+punto))?` +
    `(?:\\s*(h|horas?))?` +
    `(?:\\s*(de\\s+la\\s+manana|de\\s+la\\s+tarde|de\\s+la\\s+noche|de\\s+la\\s+madrugada|del\\s+mediodia|p\\.?\\s*m\\.?|a\\.?\\s*m\\.?))?(?=\\s)`);
  cut(st, timeRe, m => {
    let h = hourNum(m[1]), min = m[2] ? Number(m[2]) : 0;
    const extra = m[3] ? m[3].replace(/\s+/g, ' ') : '';
    if (extra === 'y media') min = 30;
    else if (extra === 'y cuarto') min = 15;
    else if (extra === 'menos cuarto') { h -= 1; min = 45; }
    else if (/^y \d/.test(extra)) min = Number(extra.slice(2));
    const part = (m[5] || '').replace(/[\s.]/g, '');
    if (/tarde|noche|pm|mediodia/.test(part) && h < 12) h += 12;
    else if (/manana|madrugada|am/.test(part) && h === 12) h = 0;
    else if (!part && h >= 1 && h <= 7 && !m[2]) h += 12;   // «a las 5» casi siempre es por la tarde
    if (h > 23 || min > 59) return false;
    time = `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  });
  if (!time) cut(st, /\s(?:a|al)\s+mediodia(?=\s)/, () => { time = '12:00'; });

  // Fecha
  cut(st, /\spasado\s+manana(?=\s)/, () => { date = addDaysIso(today, 2); }) ||
  cut(st, /\smanana(?=\s)/, () => { date = addDaysIso(today, 1); }) ||
  cut(st, /\shoy(?=\s)/, () => { date = today; }) ||
  cut(st, /\s(?:dentro\s+de|en)\s+(\d{1,3}|un|una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez)\s+(dias?|semanas?)(?=\s)/, m => {
    const n = hourNum(m[1]);
    date = addDaysIso(today, n * (m[2].startsWith('semana') ? 7 : 1));
  }) ||
  cut(st, /\s(?:el\s+)?(?:dia\s+)?(\d{1,2})\s+de\s+([a-z]+)(?:\s+(?:de|del)\s+(\d{4}))?(?=\s)/, m => {
    const mo = MONTHS.indexOf(m[2]) + 1;
    if (!mo) return false;
    let y = m[3] ? Number(m[3]) : t.y;
    if (!validDay(y, mo, Number(m[1]))) return false;
    if (!m[3] && iso(y, mo, Number(m[1])) < today) y += 1;
    date = iso(y, mo, Number(m[1]));
  }) ||
  cut(st, /\s(?:el\s+)?(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?(?=\s)/, m => {
    const d = Number(m[1]), mo = Number(m[2]);
    let y = m[3] ? Number(m[3].length === 2 ? '20' + m[3] : m[3]) : t.y;
    if (!validDay(y, mo, d)) return false;
    if (!m[3] && iso(y, mo, d) < today) y += 1;
    date = iso(y, mo, d);
  }) ||
  cut(st, /\s(?:el\s+|este\s+|esta\s+|el\s+proximo\s+|el\s+siguiente\s+)?(domingo|lunes|martes|miercoles|jueves|viernes|sabado)(\s+que\s+viene|\s+proximo)?(?=\s)/, m => {
    const target = WEEKDAYS.indexOf(m[1]);
    const thisOne = /\s(este|esta)\s/.test(m[0] + ' ');
    let diff = (target - dowOf(today) + 7) % 7;
    if (diff === 0 && !thisOne) diff = 7;
    date = addDaysIso(today, diff);
  }) ||
  cut(st, /\s(?:el\s+)?dia\s+(\d{1,2})(?=\s)/, m => {
    const d = Number(m[1]);
    let y = t.y, mo = t.m;
    if (d < t.d) { mo += 1; if (mo > 12) { mo = 1; y += 1; } }
    if (!validDay(y, mo, d)) return false;
    date = iso(y, mo, d);
  });

  // Con hora pero sin día: hoy si aún no ha pasado, si no mañana
  if (time && !date) {
    const nowHm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(now));
    date = time > nowHm ? today : addDaysIso(today, 1);
  }

  let title = st.text
    .replace(/^\s*(?:oye\s+siri\s*,?\s*)?(?:an[oó]ta(?:me)?|ap[uú]nta(?:me)?|recu[eé]rda(?:me)?|a[nñ]ade|pon(?:me)?)\b\s*(?:en\s+el\s+calendario\s*)?(?:que\s+|de\s+)?(?:tengo\s+que\s+|hay\s+que\s+)?/i, '')
    .replace(/\s+(?:el|la|los|las|a|al|de|del|para|y|en)\s*$/i, '')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/^[\s,.;:–-]+|[\s,.;:–-]+$/g, '')
    .replace(/\s{2,}/g, ' ');
  title = title.charAt(0).toUpperCase() + title.slice(1);
  return { title, date, time, color };
}

/** «78,4», «78.4», «78 con 4», «setenta y ocho»… solo se aceptan cifras: Siri las escribe así. */
export function parseWeight(input) {
  const m = fold(String(input || '')).match(/(\d{2,3})(?:\s*(?:[.,]|con|coma|punto)\s*(\d{1,2}))?/);
  if (!m) return null;
  const val = Number(`${m[1]}.${m[2] || 0}`);
  return val >= 20 && val <= 300 ? Math.round(val * 10) / 10 : null;
}

/** Busca el hábito por nombre sin tener en cuenta tildes ni mayúsculas. */
export function matchHabit(input, habits) {
  const q = fold(String(input || '')).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!q) return { habit: null, candidates: [] };
  const norm = habits.map(h => ({ h, f: fold(h).replace(/[^a-z0-9ñ ]/g, ' ').replace(/\s+/g, ' ').trim() }));
  const exact = norm.find(x => x.f === q);
  if (exact) return { habit: exact.h, candidates: [exact.h] };
  const partial = norm.filter(x => x.f.includes(q) || q.includes(x.f));
  return { habit: partial.length === 1 ? partial[0].h : null, candidates: partial.map(x => x.h) };
}

/** Saca el primer link http(s) y deja el resto como título. */
export function parseLink(input) {
  const text = String(input || '').trim();
  const m = text.match(/https?:\/\/[^\s<>"']+/i);
  if (!m) return null;
  const url = m[0].replace(/[)\]}>.,;]+$/, '');
  try { if (!/^https?:$/.test(new URL(url).protocol)) return null; } catch { return null; }
  const title = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length))
    .replace(/\s+/g, ' ').replace(/^[-–—:|·\s]+|[-–—:|·\s]+$/g, '').slice(0, 300);
  return { url, title };
}

/** «sábado 18 de octubre a las 17:00» para que Siri confirme lo que ha entendido. */
export function describeDate(dateIso, time, now = Date.now()) {
  if (!dateIso) return 'sin fecha';
  const t = madridToday(now);
  const today = iso(t.y, t.m, t.d);
  const [y, m, d] = dateIso.split('-').map(Number);
  const wd = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][dowOf(dateIso)];
  let txt = dateIso === today ? 'hoy' : dateIso === addDaysIso(today, 1) ? `mañana ${wd} ${d}` : `el ${wd} ${d} de ${MONTHS[m - 1]}`;
  if (y !== t.y) txt += ` de ${y}`;
  return time ? `${txt} a las ${time}` : txt;
}
