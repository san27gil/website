# santigil.es

Web personal. Un hub minimalista: quién soy y qué voy construyendo.

Construida con [Astro](https://astro.build) y desplegada en Netlify.

## Desarrollo

```bash
npm install
npm run dev      # servidor local en http://localhost:4321
npm run build    # genera dist/
npm run preview  # sirve dist/ para comprobarlo antes de desplegar
npm run check    # comprobación de tipos de Astro
```

## Estructura

```
src/
├── components/
│   ├── Nav.astro          navegación superior
│   ├── Footer.astro       pie de página
│   ├── StockChart.astro   gráfico $SG (cotización ficticia, decorativo)
│   └── ProjectList.astro  listado de proyectos
├── data/
│   └── projects.ts        ← los proyectos se editan AQUÍ
├── layouts/
│   └── Base.astro         html, metadatos, fuentes, revelado al hacer scroll
├── pages/
│   └── index.astro        portada
└── styles/
    └── global.css         estilos (variables CSS en :root)
```

## Añadir un proyecto

Edita `src/data/projects.ts` y añade un objeto al array. El número de orden
(`01`, `02`…) y el contador de la sección se calculan solos.

```ts
{
  name: 'Nombre del proyecto',
  desc: 'Una línea explicando qué es.',
  href: 'https://…',
  year: '2026',
}
```

## Despliegue

Netlify construye con `npm run build` y publica `dist/` en cada push a `main`
(ver `netlify.toml`).

## Dashboard (`/dashboard/`)

`public/dashboard/index.html` es una copia del dashboard (el original vive en
`../dashboard/dashboard.html`). Los visitantes lo usan en modo local: sus datos
se guardan solo en su navegador. El propietario entra con contraseña + código
de Google Authenticator y sus datos se sincronizan en Netlify Blobs.

El botón «Entrar» está oculto: aparece abriendo `/dashboard/#acceso`, o siempre
que el dashboard se abre como app instalada (Dock del Mac o pantalla de inicio del
iPhone). Es solo para no mostrarlo a los visitantes; la protección real es el
login del servidor.

- `netlify/functions/dashboard-login.mjs` → `POST /api/dashboard/login`
- `netlify/functions/dashboard-data.mjs` → `GET|PUT /api/dashboard/data`
- `netlify/functions/dashboard-inbox.mjs` → `POST|GET|DELETE /api/dashboard/inbox` (Siri)
- `netlify/lib/dashboard-capture.mjs` → entiende fechas y horas dictadas en español
- `netlify/lib/dashboard-auth.mjs` → TOTP, tokens firmados, límite de intentos

Variables de entorno necesarias en Netlify (scope Functions):
`DASHBOARD_PASSWORD`, `DASHBOARD_TOTP_SECRET`, `DASHBOARD_SESSION_SECRET`.
Se generan con `node scripts/dashboard-setup.mjs`.

Para añadir cosas con Siri hace falta además `DASHBOARD_CAPTURE_TOKEN`
(cualquier cadena larga y aleatoria, p. ej. `openssl rand -hex 32`).

### Añadir cosas con Siri

Lo que se dicta va a un buzón del servidor (`owner/inbox`) y el dashboard lo
añade la próxima vez que se abre. Siri lee en voz alta lo que ha entendido.

Cada atajo de la app Atajos del iPhone tiene la misma forma:

1. **Dictar texto** (idioma: español).
2. **Obtener contenido de URL**
   - URL: `https://santigil.es/api/dashboard/inbox`
   - Método: `POST`
   - Cabeceras: `Authorization` = `Bearer <DASHBOARD_CAPTURE_TOKEN>`
   - Cuerpo: JSON con `type` (texto) y `text` = *Texto dictado*
3. **Mostrar resultado** (con Siri, lo dice en voz alta).

| Nombre del atajo («Oye Siri, …») | `type` | Ejemplo de lo que dices |
|---|---|---|
| Anota en el calendario | `event` | «dentista mañana a las 5 urgente», «llamar al banco» (sin fecha) |
| Anota peso | `weight` | «78,4» |
| Hábito hecho | `habit` | «meditación» |
| Guardar para luego | `link` | — |

En «Guardar para luego», en vez de *Dictar texto*, activa *Mostrar en la hoja
de compartir* (acepta URL y páginas de Safari) y usa como `text` la *Entrada
del atajo*. Así aparece al pulsar «Compartir» en cualquier app.

En los eventos se entiende: hoy / mañana / pasado mañana, días de la semana
(«el viernes», «este sábado»), «el 23 de octubre», «el 23/10», «el día 3»,
«dentro de 3 días»; horas como «a las 17:30», «a las 5 y media», «a las 9 de
la mañana» (sin «de la mañana», de 1 a 7 se entiende por la tarde); y las
palabras «urgente» o «importante». Sin fecha, queda como pendiente sin fecha.

### Copias de seguridad

Antes del primer cambio de cada día se guarda la versión anterior en
`owner/backups/YYYY-MM-DD` (store `dashboard`); se conservan las últimas 30.
Para recuperar una con la [CLI de Netlify](https://docs.netlify.com/cli/get-started/):

```bash
netlify blobs:list dashboard --prefix owner/backups/
netlify blobs:get dashboard owner/backups/2026-10-16 > copia.json
```

Después, en el dashboard (con sesión iniciada): «Importar» → `copia.json`.

### Si pierdes un dispositivo con la sesión abierta

Cambia `DASHBOARD_SESSION_SECRET` en Netlify y vuelve a desplegar: se cierran
todas las sesiones y tendrás que entrar de nuevo en cada dispositivo.
