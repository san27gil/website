export interface Project {
  /** Título visible del proyecto. */
  name: string;
  /** Descripción breve, una línea. */
  desc: string;
  /** Enlace externo. '#' mientras no haya nada que enseñar. */
  href: string;
  /** Año, se muestra a la derecha. */
  year: string;
}

// Para añadir un proyecto, copia un objeto y cámbialo. El índice (01, 02…)
// y el contador de la sección se calculan solos.
export const projects: Project[] = [
  {
    name: 'Dashboard personal en pixel art',
    desc: 'Peso, tiempo, actividad, hábitos, portfolio, tareas y eventos en un solo panel. Pruébalo: tus datos se quedan en tu navegador.',
    href: '/dashboard/index.html',
    year: '2026',
  },
  {
    name: 'Simulador de qué pasaría si hubiera comprado Tesla en 2010',
    desc: 'Spoiler: serías rico. Cierra la pestaña y vuelve al trabajo.',
    href: '#',
    year: '2026',
  },
  {
    name: 'Backtester que siempre gana (hasta que lo pones en real)',
    desc: '+9000% en el histórico, −3% en producción. Pura magia financiera.',
    href: '#',
    year: '2026',
  },
];
