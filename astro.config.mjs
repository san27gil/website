// @ts-check
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  site: 'https://santigil.es',
  build: {
    // CSS en un único fichero: la hoja de estilos es pequeña y evita peticiones extra.
    inlineStylesheets: 'auto',
  },
});
