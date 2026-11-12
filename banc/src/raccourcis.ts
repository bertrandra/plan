// Les raccourcis de l'editeur, en un seul endroit : le clavier les lit (actionDe), l'aide les montre (touche ?). Sans DOM, testable seul.

export type IdAction =
  | 'enregistrer' | 'validerSuivante' | 'suivantARelire' | 'precedentARelire' | 'accepter' | 'accepterAuDessus' | 'supprimer'
  | 'annuler' | 'refaire' | 'copier' | 'couper' | 'coller' | 'gauche' | 'droite' | 'haut' | 'bas'
  | 'outilChoisir' | 'outilSelection' | 'outilVue' | 'outilZoom' | 'outilRectangle' | 'outilPolygone' | 'outilLigne' | 'outilPoint'
  | 'etiquettes' | 'loupe' | 'photoSuivante' | 'photoPrecedente' | 'aide' | 'type';

export interface Raccourci { touches: string; libelle: string; groupe: 'Relecture' | 'Édition' | 'Outils' | 'Affichage' | 'Photos' }

/** Ce que l'aide montre, dans l'ordre (Echap, Espace et Entree d'un trace sont lus par la scene, cites ici pour memoire). */
export const AIDE: Raccourci[] = [
  { touches: 'Tab / Maj+Tab', libelle: 'Objet à relire suivant / précédent', groupe: 'Relecture' },
  { touches: 'A', libelle: 'Accepter tel quel (la sélection)', groupe: 'Relecture' },
  { touches: 'Maj+A', libelle: 'Accepter tout ce qui est au-dessus du seuil', groupe: 'Relecture' },
  { touches: 'X / Suppr', libelle: 'Supprimer (la sélection)', groupe: 'Relecture' },
  { touches: '1 … 9', libelle: 'Donner ce type à la sélection, ou le choisir pour tracer', groupe: 'Relecture' },
  { touches: 'Entrée', libelle: 'Enregistrer, marquer vérifiée, photo suivante', groupe: 'Relecture' },
  { touches: '← ↑ → ↓', libelle: 'Décaler d’un pixel (Maj : de dix)', groupe: 'Édition' },
  { touches: 'Ctrl+Z / Ctrl+Y', libelle: 'Annuler / refaire', groupe: 'Édition' },
  { touches: 'Ctrl+C / X / V', libelle: 'Copier / couper / coller (avec les détails)', groupe: 'Édition' },
  { touches: 'Ctrl+S', libelle: 'Enregistrer', groupe: 'Édition' },
  { touches: 'Échap', libelle: 'Lâcher la sélection, abandonner le tracé', groupe: 'Édition' },
  { touches: 'V', libelle: 'Choisir, déplacer, redimensionner', groupe: 'Outils' },
  { touches: 'S', libelle: 'Sélection (S de nouveau : boîte ↔ lasso)', groupe: 'Outils' },
  { touches: 'H / Espace', libelle: 'Déplacer la vue', groupe: 'Outils' },
  { touches: 'Z', libelle: 'Zoom (Alt : éloigner ; tirer un cadre)', groupe: 'Outils' },
  { touches: 'R / P / T / O', libelle: 'Rectangle / polygone / ligne / point', groupe: 'Outils' },
  { touches: 'E', libelle: 'Toutes les étiquettes', groupe: 'Affichage' },
  { touches: 'L', libelle: 'Loupe automatique', groupe: 'Affichage' },
  { touches: '?', libelle: 'Cette aide', groupe: 'Affichage' },
  { touches: 'N / B', libelle: 'Photo suivante / précédente', groupe: 'Photos' },
];

export interface Touche { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; altKey?: boolean }

/** L'action d'une touche (et le chiffre pour « type ») ; null si la touche ne fait rien dans l'editeur. */
export function actionDe(e: Touche): { action: IdAction; chiffre?: number } | null {
  const k = e.key.toLowerCase(), mod = !!(e.ctrlKey || e.metaKey), maj = !!e.shiftKey;
  if (mod) {
    if (k === 's') return { action: 'enregistrer' };
    if (k === 'y' || (k === 'z' && maj)) return { action: 'refaire' };
    if (k === 'z') return { action: 'annuler' };
    if (k === 'c') return { action: 'copier' };
    if (k === 'x') return { action: 'couper' };
    if (k === 'v') return { action: 'coller' };
    return null;
  }
  if (e.altKey) return null;
  const fleches: Record<string, IdAction> = { arrowleft: 'gauche', arrowright: 'droite', arrowup: 'haut', arrowdown: 'bas' };
  if (fleches[k]) return { action: fleches[k] as IdAction };
  if (k === 'tab') return { action: maj ? 'precedentARelire' : 'suivantARelire' };
  if (k === 'enter') return { action: 'validerSuivante' };
  if (k === 'delete' || k === 'backspace' || k === 'x') return { action: 'supprimer' };
  if (k === 'a') return { action: maj ? 'accepterAuDessus' : 'accepter' };
  if (e.key === '?') return { action: 'aide' };
  if (/^[1-9]$/.test(e.key)) return { action: 'type', chiffre: Number(e.key) };
  const lettres: Record<string, IdAction> = {
    v: 'outilChoisir', s: 'outilSelection', h: 'outilVue', z: 'outilZoom', r: 'outilRectangle', p: 'outilPolygone', t: 'outilLigne', o: 'outilPoint',
    e: 'etiquettes', l: 'loupe', n: 'photoSuivante', b: 'photoPrecedente', pagedown: 'photoSuivante', pageup: 'photoPrecedente',
  };
  return lettres[k] ? { action: lettres[k] as IdAction } : null;
}
