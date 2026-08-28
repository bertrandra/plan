// Formatage et conversions de saisie (spec §3.2, util/format.ts).

/**
 * Lit un nombre saisi a la francaise : la virgule vaut point decimal. Rend `null` - et non NaN -
 * quand la saisie est vide ou illisible, ce qui permet aux appelants de distinguer « rien saisi »
 * de « zero » sans tester Number.isNaN partout.
 */
export function nombreFr(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Minutes depuis minuit -> "HH:MM". */
export function formatHeureMin(min: number): string {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

/**
 * Nom de fichier sur : decomposition NFD puis suppression des diacritiques combinantes
 * (U+0300-U+036F), tout le reste devient des tirets. La classe de caracteres est reprise
 * telle quelle du fichier d'origine - elle contient de vraies combinantes, pas une plage ASCII.
 */
export function slugFichier(txt: unknown): string {
  const sansAccents = String(txt||'projet').normalize('NFD').replace(/[̀-ͯ]/g,'');
  const slug = sansAccents.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,60);
  return slug || 'projet';
}

/** Horodatage compact AAAAMMJJ, pour suffixer les noms de fichiers exportes. */
export function horodatageFichier(): string {
  const d = new Date(),
    p = (n: number) => String(n).padStart(2, "0");
  return '' + d.getFullYear() + p(d.getMonth()+1) + p(d.getDate());
}

/**
 * Pas « rond » le plus proche d'une cible, pris dans une echelle fixe (0,1 a 50 m). Sert a la
 * grille du plan comme a l'echelle graphique des PDF : un pas de 0,37 m ne se lit pas.
 */
export function niceStep(target: number): number {
  const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 20, 50];
  let best = steps[0],
    bd = Infinity;
  steps.forEach((s) => {
    const d = Math.abs(s - target);
    if (d < bd) {
      bd = d;
      best = s;
    }
  });
  return best;
}
