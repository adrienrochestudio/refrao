// @ts-check
import { defineConfig } from 'astro/config';

// Site statique hébergé sur GitHub Pages (projet => sous-chemin /refrao).
// Pas de SSR (resterait payant). La sortie est entièrement statique.
export default defineConfig({
  site: 'https://adrienrochestudio.github.io',
  base: '/refrao'
});
