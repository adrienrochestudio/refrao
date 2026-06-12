/* ============================================================
   refrão — configuration ESLint (flat config, ESLint v9)
   Objectif : attraper les vraies erreurs (clés dupliquées, code
   injoignable, typeof invalide...) sans bruit inutile.
   Le site est en JS vanilla multi-fichiers chargé en <script> :
   les symboles sont partagés via window (R, S, SRS) et beaucoup
   de fonctions sont appelées depuis des onclick inline en HTML.
   On désactive donc no-undef / no-unused-vars qui seraient faux.
   ============================================================ */
const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  { ignores: ["node_modules/**", "package-lock.json"] },

  // Site (scripts navigateur chargés en <script>, symboles partagés)
  {
    files: ["*.js"],
    ignores: ["eslint.config.js"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      // R / S / SRS ne sont PAS déclarés en globals : chaque fichier définit
      // le sien (const/var) et les autres y accèdent via window. no-undef étant
      // désactivé, les références croisées ne posent pas de problème.
      globals: { ...globals.browser }
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-undef": "off",       // symboles partagés entre fichiers via window
      "no-unused-vars": "off", // fonctions appelées via onclick inline (invisibles d'ESLint)
      "no-empty": "off"        // catch(e){} volontaires (best-effort)
    }
  },

  // Outils de provisioning (Node, ESM)
  {
    files: ["tools/**/*.mjs"],
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node }
    }
  },

  // Ce fichier de config (Node, CommonJS)
  {
    files: ["eslint.config.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: { ...globals.node }
    }
  }
];
