// L'export CSV du tableau de bord de la consommation de Claude (MD/spec-audit.md 13.3) : la vue
// affichee, telle qu'elle est a l'ecran apres filtres.
//
// Le fichier vise un tableur francais : separateur `;`, virgule decimale, BOM UTF-8 pour que les
// accents se lisent, fin de ligne CRLF. Les nombres gardent toute leur precision (un cout de 0,0012 $
// ne s'arrondit pas au centime) : c'est un fichier pour recompter, pas pour lire. Un texte qui
// commencerait par `=`, `+`, `-` ou `@` est neutralise : une adresse venue du terrain ne doit pas
// devenir une formule a l'ouverture.

import {
  NOMS_USAGES, nomModele, valeurA,
  type LigneOrganisation, type LigneParcelle, type LigneUsage, type Mesure, type SerieTemps
} from '../model/consommation.js';

type Cellule = string | number | null;

function cellule(v: Cellule): string {
  if (v === null) return '';
  // toFixed et non String : 1e-7 s'ecrirait en notation scientifique, illisible pour un tableur.
  if (typeof v === 'number') return Number.isFinite(v) ? v.toFixed(8).replace(/\.?0+$/, '').replace('.', ',') : '';
  const t = /^[=+\-@\t\r]/.test(v) ? '\'' + v : v;
  return /[;"\r\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

/** Un CSV : une ligne d'en-tetes puis les lignes, cellule par cellule. */
export function csv(entetes: string[], lignes: Cellule[][]): string {
  return '\uFEFF' + [entetes, ...lignes].map((l) => l.map(cellule).join(';')).join('\r\n') + '\r\n';
}

export function csvTemps(s: SerieTemps, mesure: Mesure): string {
  const unite = mesure === 'tokens' ? ' (tokens)' : ' ($)';
  return csv(['Période', ...s.series.map((x) => nomModele(x) + unite), 'Total' + unite],
    s.cles.map((c, i) => [c, ...s.series.map((x) => valeurA(s, x, i)), s.totaux[i] ?? 0]));
}

export function csvParcelles(ls: LigneParcelle[], series: string[]): string {
  return csv(['Adresse', 'IDU', 'Audits', ...series.map((x) => 'Tokens ' + nomModele(x)), 'Tokens', 'Part du cache', 'Coût ($)', 'Dernier audit'],
    ls.map((l) => [l.adresse, l.idu, l.audits, ...series.map((x) => l.tokensParModele[x] ?? 0), l.tokens, l.partCache, l.cout, l.dernier]));
}

export function csvUsages(ls: LigneUsage[]): string {
  return csv(['Usage', 'Appels', 'Tokens', 'Coût ($)', 'Part du coût', 'Part du Batch'],
    ls.map((l) => [NOMS_USAGES[l.usage] ?? l.usage, l.appels, l.tokens, l.cout, l.partCout, l.partBatch]));
}

export function csvOrganisations(ls: LigneOrganisation[]): string {
  return csv(['Organisation', 'Coût de la période ($)', 'Aujourd’hui ($)', 'Plafond du jour ($)', 'Ce mois ($)', 'Plafond du mois ($)', 'Part du plafond du mois'],
    ls.map((l) => [l.id, l.coutPeriode, l.jour, l.plafondJour, l.mois, l.plafondMois, l.partMois]));
}
