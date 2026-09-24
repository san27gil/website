// Genera los secretos del login del dashboard y un QR para Google Authenticator.
// Uso: node scripts/dashboard-setup.mjs
// Todo se genera en tu ordenador; nada se envía a ningún sitio.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { base32Encode, totpAt } from '../netlify/lib/dashboard-auth.mjs';

const totpSecret = base32Encode(randomBytes(20));
const sessionSecret = randomBytes(32).toString('hex');
const uri = `otpauth://totp/santigil.es:dashboard?secret=${totpSecret}&issuer=santigil.es&digits=6&period=30`;

const qrPage = join(tmpdir(), 'dashboard-2fa.html');
writeFileSync(qrPage, `<!doctype html><meta charset="utf-8"><title>2FA dashboard</title>
<body style="font-family:system-ui;display:grid;place-items:center;min-height:90vh;text-align:center">
<div><h2>Escanea con Google Authenticator</h2><div id="qr"></div>
<p>Clave manual: <code>${totpSecret}</code></p>
<p style="color:#b00">Cierra esta página y borra el archivo cuando termines.</p></div>
<script src="https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js"></script>
<script>const q=qrcode(0,'M');q.addData(${JSON.stringify(uri)});q.make();
document.getElementById('qr').innerHTML=q.createSvgTag({cellSize:8,margin:4});</script></body>`);

const qrUrl = pathToFileURL(qrPage).href;
// Abre el QR en el navegador por defecto (macOS: open, Windows: start, Linux: xdg-open)
const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'explorer' : 'xdg-open';
execFile(opener, [qrPage], () => {});

const code = totpAt(totpSecret, Math.floor(Date.now() / 30000));

console.log(`
1) Se ha abierto el QR en tu navegador: escanéalo con Google Authenticator.
   Si no se abrió, copia esta dirección COMPLETA en la barra del navegador:
   ${qrUrl}
   (o en Google Authenticator: "+" → "Introducir clave de configuración" → ${totpSecret})

2) En Netlify → Site configuration → Environment variables, crea (scope: Functions):

   DASHBOARD_TOTP_SECRET     = ${totpSecret}
   DASHBOARD_SESSION_SECRET  = ${sessionSecret}
   DASHBOARD_PASSWORD        = (elige una contraseña larga)

3) Comprueba que la app muestra ahora mismo este código: ${code}

4) Borra el archivo del QR:  rm "${qrPage}"
`);
