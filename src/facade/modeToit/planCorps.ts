// Ce que le mode Plan dessine sur chaque corps, de dessus (MD/spec-mode-toit-3d.md, etape 5) : la ligne de faitage, qui dit le sens du toit
// et sa forme d'un coup d'oeil, et un marqueur pour chaque element pose (pignon, lucarne, cheminee, fenetre de toit, solaire).
//
// Pur : des points du plan en metres, pas de DOM ni de scene. Le calque (zones/vue3d/PlanToit.tsx) les projette a l'ecran.

import { point, repere } from '../toitCorps.js';
import { formeDuCorpsToit } from '../../model/formeToit.js';
import type { CorpsToit, PtBrut } from '../../model/types.js';

/** Le trait du faitage : plein (le faitage), tirete (la noue d'un papillon), ou un point (un pavillon, dont le faitage se reduit a un sommet). */
export interface LigneFaitage { a: PtBrut; b: PtBrut; genre: 'plein' | 'noue' | 'sommet' }

/** La ligne de faitage d'un corps, ou null (un toit plat n'en a pas). Les croupes la raccourcissent a chaque bout. */
export function ligneDeFaitage(c: CorpsToit): LigneFaitage | null {
  const forme = formeDuCorpsToit(c);
  if (forme === 'plat') return null;
  const r = repere(c.pts);
  const t = Math.min(Math.max(c.posFaitage, 0), r.W);
  const [h0, h1] = c.croupes ?? [0, 0];
  const s0 = Math.min(Math.max(h0, 0), r.L / 2), s1 = r.L - Math.min(Math.max(h1, 0), r.L / 2);
  if (forme === 'pavillon' || s1 - s0 < 0.1) { const p = point(r, (s0 + s1) / 2, t); return { a: p, b: p, genre: 'sommet' }; }
  return { a: point(r, s0, t), b: point(r, s1, t), genre: forme === 'papillon' ? 'noue' : 'plein' };
}

export type TypeMarqueur = 'pignon' | 'lucarne' | 'cheminee' | 'fenetre-toit' | 'solaire';
export interface Marqueur { type: TypeMarqueur; x: number; y: number }

/** Un marqueur par element pose sur le corps, a la place qu'il occupe sur le toit. */
export function marqueursDuCorps(c: CorpsToit): Marqueur[] {
  const r = repere(c.pts), m: Marqueur[] = [];
  // Le pan 0 est au cote t = 0, le pan 1 au cote t = W : la distance depuis le mur d'egout se compte vers l'interieur.
  const t = (pan: 0 | 1, d: number) => (pan === 0 ? d : r.W - d);
  for (const g of c.pignons) m.push({ type: 'pignon', ...point(r, (g.debut + g.fin) / 2, t(g.pan, Math.min(g.profondeur, r.W) / 2)) });
  for (const l of c.lucarnes ?? []) m.push({ type: 'lucarne', ...point(r, (l.debutM + l.finM) / 2, t(l.pan, Math.min(l.profondeurM, r.W) / 2)) });
  for (const h of c.cheminees ?? []) m.push({ type: 'cheminee', x: h.x, y: h.y });
  for (const e of c.elementsToit ?? []) m.push({ type: e.type, ...point(r, e.sM, t(e.pan, e.dM)) });
  return m;
}

/** L'orientation du faitage dans le plan, en degres de 0 (inclus) a 180 (exclu) : l'angle dont le corps est tourne. */
export function orientationDuCorps(c: CorpsToit): number {
  const r = repere(c.pts);
  const a = (Math.atan2(r.u.y, r.u.x) * 180) / Math.PI;
  return ((a % 180) + 180) % 180;
}
