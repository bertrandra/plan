import { describe, it, expect } from 'vitest';
import { estUnToucher, objetChoisi, TOUCHER_MS, TOUCHER_PX } from '../../../../src/app/ecouteurs/selection3d.js';
import { estChoisiEn3d } from '../../../../src/model/fonctions.js';
import type { ObjetPlan } from '../../../../src/model/types.js';

// Toucher un objet dans la Vue 3D le choisit (demande du proprietaire, 6 novembre 2026) : un batiment, une terrasse, une pergola ou un
// carport, une piscine ; un arbre devant laisse passer ; le vide ou un autre objet ne change rien ; un glisser (orbite) ne choisit pas.

const carre = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }];
const objet = (key: string, fonction: string, type: 'polygon' | 'circle' = 'polygon'): ObjetPlan =>
  ({ key, name: key, fonction, type, ...(type === 'circle' ? { cx: 0, cy: 0, r: 2 } : { pts: carre }) }) as unknown as ObjetPlan;
const objets = [objet('maison', 'batiment'), objet('terrasse', 'terrasse'), objet('carport', 'carport'), objet('pergola', 'pergola'),
  objet('piscine', 'piscine'), objet('arbre', 'arbre', 'circle'), objet('parasol', 'parasol', 'circle'), objet('mobilier', 'mobilier'), objet('parcelle', 'terrain')];
const parCle = (k: string) => objets.find((o) => o.key === k) as ObjetPlan;

describe('choisir un objet au toucher de la Vue 3D', () => {
  it('les cinq types se choisissent, pas le reste', () => {
    for (const k of ['maison', 'terrasse', 'carport', 'pergola', 'piscine']) expect(estChoisiEn3d(parCle(k))).toBe(true);
    for (const k of ['arbre', 'mobilier', 'parcelle']) expect(estChoisiEn3d(parCle(k))).toBe(false);
  });

  it('le premier objet sous le doigt est choisi ; un arbre devant laisse passer le rayon', () => {
    // Le rayon rencontre, dans l'ordre, ces objets ; `retenir` dit lesquels l'arretent.
    const rayon = (...cles: string[]) => (retenir: (cle: string) => boolean) => ({ cle: cles.find(retenir) ?? null, point: null });
    expect(objetChoisi(objets, rayon('piscine', 'maison'))?.key).toBe('piscine');
    expect(objetChoisi(objets, rayon('arbre', 'maison'))?.key).toBe('maison');
    expect(objetChoisi(objets, rayon('parasol', 'terrasse'))?.key).toBe('terrasse');
  });

  it('une maison voisine (voisinage importe, ou batiment de l IGN hors de la parcelle du projet) ne se choisit pas : elle vaut le vide', () => {
    const voisine = { ...objet('voisine', 'batiment'), bdtopo: { id: 'B1' } } as unknown as ObjetPlan;
    const duVoisinage = { ...objet('voisinage', 'batiment'), voisinage: true } as unknown as ObjetPlan;
    const surLaParcelle = { ...objet('importee', 'batiment'), bdtopo: { id: 'B2', surParcellePrincipale: true } } as unknown as ObjetPlan;
    expect(estChoisiEn3d(voisine)).toBe(false);
    expect(estChoisiEn3d(duVoisinage)).toBe(false);
    expect(estChoisiEn3d(surLaParcelle)).toBe(true);
    const tous = [...objets, voisine, duVoisinage, surLaParcelle];
    const rayon = (cle: string) => () => ({ cle, point: null });
    expect(objetChoisi(tous, rayon('voisine'))).toBeNull();
    expect(objetChoisi(tous, rayon('voisinage'))).toBeNull();
    expect(objetChoisi(tous, rayon('importee'))?.key).toBe('importee');
  });

  it('le platelage de la terrasse courante (pose comme la scene, pas comme un objet) : le point touche dit la terrasse', () => {
    const vide = (point: { x: number; y: number } | null) => () => ({ cle: null, point });
    expect(objetChoisi(objets, vide({ x: 2, y: 2 }))?.key).toBe('terrasse');
    expect(objetChoisi(objets, vide({ x: 10, y: 10 }))).toBeNull();
    expect(objetChoisi(objets, vide(null))).toBeNull();
  });

  it('le vide, ou un objet qui ne se choisit pas en 3D (meme devant un batiment) : rien n est choisi (la selection est lachee)', () => {
    const rayon = (...cles: string[]) => (retenir: (cle: string) => boolean) => ({ cle: cles.find(retenir) ?? null, point: null });
    expect(objetChoisi(objets, rayon())).toBeNull();
    expect(objetChoisi(objets, rayon('mobilier', 'maison'))).toBeNull();
    expect(objetChoisi(objets, rayon('parcelle'))).toBeNull();
  });

  it('un toucher est bref, immobile et d un seul doigt : un glisser d orbite, un appui long ou un pincement ne choisissent pas', () => {
    const d = { x: 100, y: 100, t: 0 };
    expect(estUnToucher(d, { x: 103, y: 102, t: 120 }, 1)).toBe(true);
    expect(estUnToucher(d, { x: 100 + TOUCHER_PX + 2, y: 100, t: 120 }, 1)).toBe(false);
    expect(estUnToucher(d, { x: 100, y: 100, t: TOUCHER_MS + 50 }, 1)).toBe(false);
    expect(estUnToucher(d, { x: 100, y: 100, t: 100 }, 2)).toBe(false);
  });
});
