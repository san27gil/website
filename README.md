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

- `netlify/functions/dashboard-login.mjs` → `POST /api/dashboard/login`
- `netlify/functions/dashboard-data.mjs` → `GET|PUT /api/dashboard/data`
- `netlify/lib/dashboard-auth.mjs` → TOTP, tokens firmados, límite de intentos

Variables de entorno necesarias en Netlify (scope Functions):
`DASHBOARD_PASSWORD`, `DASHBOARD_TOTP_SECRET`, `DASHBOARD_SESSION_SECRET`.
Se generan con `node scripts/dashboard-setup.mjs`.
