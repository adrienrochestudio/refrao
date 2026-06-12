// Construit une URL absolue tenant compte du sous-chemin GitHub Pages (/refrao),
// sans dépendre de la présence ou non d'un slash final dans BASE_URL.
const base = import.meta.env.BASE_URL.replace(/\/$/, '');

/** withBase('style.css') -> '/refrao/style.css' ; withBase('') -> '/refrao/'. */
export function withBase(path = ''): string {
  return base + '/' + path.replace(/^\//, '');
}
