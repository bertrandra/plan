import { describe, it, expect } from 'vitest';
import { EXEMPLES_TOITS, recadrerSurElement, vueIsometrique, type VueIso } from '../../../src/three/catalogueToits.js';
import { vueDeElementToit, vueSurLeToit } from '../../../src/three/vueSaillie.js';
import { piecesDe } from '../../../src/three/gestesToits.js';

// Les vignettes de l'onglet « Sur le toit » du mode Toit (2 novembre 2026, « les icônes des objets sur le toit sont trop petits, il faut
// zoomer dessus : fenêtre de toit, solaire, jacobine… tous ») : la maison entiere ne laissait a l'element que quelques pixels de la tuile.

/** La tuile du catalogue : 56 px de cote pour l'image (zones/vue3d/ModeToit.tsx, `.toitPiece .glyphe`). */
const TUILE_PX = 56;
/** Ce que l'element doit couvrir de la tuile, dans sa plus grande dimension : de quoi se reconnaitre. */
const PART_MIN = 0.3;

const nomDe = (id: string) => id.replace(/^[a-z]+:/, '');
/** La part de la vignette que couvre l'element (lucarne, ou facettes `element`), dans sa plus grande dimension. */
function part(v: VueIso): number {
  const pts = v.facettes.filter((f) => f.lucarne || f.element).flatMap((f) => f.points);
  const d = Math.max(Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[1])) - Math.min(...pts.map((q) => q[1])));
  return d / Math.max(v.largeur, v.hauteur);
}

describe('les vignettes de l onglet « Sur le toit »', () => {
  const pieces = piecesDe('sur');
  // Les deux pieces qui sont grandes d'elles-memes : un pignon, un avant-corps couvrent la moitie du pan, la maison reste.
  const entieres = new Set(['pignon', 'avant-corps']);

  it('chaque piece a sa vignette, et aucune ne ressemble a une autre', () => {
    const vues = pieces.map((p) => vueSurLeToit(nomDe(p.id)));
    for (const [k, v] of vues.entries()) expect(v?.facettes.length, pieces[k]!.id).toBeGreaterThan(0);
    expect(new Set(vues.map((v) => JSON.stringify(v))).size).toBe(pieces.length);
    expect(vueSurLeToit('inconnu')).toBeNull();
  });

  it('chaque element remplit au moins 30 % de sa tuile (17 px sur 56), la ou la maison entiere lui en laissait moins', () => {
    for (const p of pieces) {
      const nom = nomDe(p.id);
      if (entieres.has(nom)) continue;
      const v = vueSurLeToit(nom)!;
      expect(part(v), nom).toBeGreaterThanOrEqual(PART_MIN);
      expect(part(v) * TUILE_PX, nom).toBeGreaterThanOrEqual(PART_MIN * TUILE_PX);
      const exemple = EXEMPLES_TOITS.find((e) => e.id === nom);
      const avant = exemple ? vueIsometrique(exemple) : nom === 'fenetre-toit' || nom === 'solaire' ? vueDeElementToit(nom) : null;
      // Un element deja grand dans la maison entiere (la rampante) garde sa part ; un petit gagne au moins moitie.
      if (avant) expect(part(v), nom).toBeGreaterThanOrEqual(part(avant) < PART_MIN ? 1.5 * part(avant) : PART_MIN);
    }
  });

  it('le panneau solaire et la fenetre de toit se voient : leur vitre est peinte par-dessus le pan et le cadre', () => {
    for (const nom of ['solaire', 'fenetre-toit'] as const) {
      const f = vueSurLeToit(nom)!.facettes;
      const vitre = f.findIndex((x) => x.vitre);
      expect(vitre, nom).toBeGreaterThan(-1);
      expect(f.slice(vitre + 1).some((x) => !x.element), nom).toBe(false);
    }
  });

  it('recadrer une vue sans element la rend telle quelle (le catalogue de l admin ne change pas)', () => {
    const v = vueIsometrique(EXEMPLES_TOITS.find((e) => e.id === 'deux-pans')!);
    expect(recadrerSurElement(v)).toBe(v);
    expect(v.facettes.some((f) => f.element)).toBe(false);
  });
});
