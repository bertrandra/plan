// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { conformiteDuPlan, formaliteDuPlan } from '../../../../src/app/plu/conformiteDuPlan.js';
import { redessinerEcartsPlu } from '../../../../src/app/plu/calquePlu.js';
import { toucherForme, toucher } from '../../../../src/core/controleurObjets.js';
import { creerEtat } from '../../../../src/core/state.js';
import { creerScene } from '../../../../src/geometry/vue.js';
import type { ObjetPlan } from '../../../../src/model/types.js';
import { REGLEMENT } from '../../../fixtures/plu/reglement.js';

// La conformite du plan ouvert, calculee une fois par ecriture (app/plu/conformiteDuPlan.ts), et le calque des ecarts qui la lit
// (app/plu/calquePlu.ts) : un ouvrage deplace refait ses verdicts, et son marqueur suit.

const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];
function plan() {
  const reglement = structuredClone(REGLEMENT);
  reglement.faits = [{ ...reglement.faits[0]!, id: 'recul', grandeur: 'recul-limites-min', valeur: 3, article: 'UL 7', statut: 'valide' }];
  const parcelle = { key: 'parcelle', name: 'Parcelle', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 20, 30), cadastre: { idu: 'x' }, reglementPlu: reglement } as unknown as ObjetPlan;
  // A 0,5 m de la limite x = 20 : en ecart pour un recul de 3 m.
  const abri = { key: 'abri', name: 'Abri', type: 'polygon', fonction: 'annexe', elevation: 2.4, pts: rect(17.5, 10, 2, 3) } as unknown as ObjetPlan & { pts: { x: number; y: number }[] };
  const etat = creerEtat({}, (o) => o as ObjetPlan[]);
  etat.objects = [parcelle, abri];
  etat.scene = { ...creerScene(), W: 800, H: 600 };
  return { etat, parcelle, abri };
}
const deplacer = (o: { pts: { x: number; y: number }[] }, dx: number) => { o.pts = o.pts.map((p) => ({ x: p.x + dx, y: p.y })); toucherForme(o); };

describe('conformiteDuPlan', () => {
  it('reprend la reponse tant que rien n’est ecrit, et la refait quand l’ouvrage est deplace', () => {
    const { etat, abri } = plan();
    const avant = conformiteDuPlan(etat.objects);
    expect(avant).toMatchObject({ ecarts: 1 });
    expect(avant.verdicts[0]).toMatchObject({ objet: 'abri', etat: 'ecart', mesure: 0.5 });
    expect(conformiteDuPlan(etat.objects)).toBe(avant);
    deplacer(abri, -7);
    const apres = conformiteDuPlan(etat.objects);
    expect(apres).not.toBe(avant);
    expect(apres).toMatchObject({ ecarts: 0, conformes: 1 });
    expect(apres.verdicts[0]).toMatchObject({ etat: 'conforme', mesure: 7.5 });
  });

  it('suit une regle rendue proposee, meme sans toucher a un objet', () => {
    const { etat, parcelle } = plan();
    expect(conformiteDuPlan(etat.objects).ecarts).toBe(1);
    parcelle.reglementPlu!.faits[0]!.statut = 'propose';
    expect(conformiteDuPlan(etat.objects).verdicts).toEqual([]);
  });

  it('garde la formalite du plan, et la refait apres une ecriture', () => {
    const { etat, abri } = plan();
    const f = formaliteDuPlan(etat.objects);
    expect(formaliteDuPlan(etat.objects)).toBe(f);
    toucher(abri);
    expect(formaliteDuPlan(etat.objects)).not.toBe(f);
  });
});

describe('redessinerEcartsPlu', () => {
  const calque = () => document.createElementNS('http://www.w3.org/2000/svg', 'g');
  it('marque l’ouvrage en ecart et dessine son recul ; deplace hors de l’ecart, le marqueur disparait', () => {
    const { etat, abri } = plan();
    const g = calque();
    redessinerEcartsPlu(g, etat, etat);
    expect(g.querySelectorAll('g.ecartPlu')).toHaveLength(1);
    expect(g.querySelector('g.ecartPlu')!.getAttribute('data-objet')).toBe('abri');
    expect(g.querySelector('text.ecartPluCote')!.textContent).toBe('0,50 m');
    // Rapproche de 0,2 m : toujours en ecart, la cote suit.
    deplacer(abri, 0.2);
    redessinerEcartsPlu(g, etat, etat);
    expect(g.querySelector('text.ecartPluCote')!.textContent).toBe('0,30 m');
    deplacer(abri, -8);
    redessinerEcartsPlu(g, etat, etat);
    expect(g.querySelectorAll('g.ecartPlu')).toHaveLength(0);
  });

  it('reste vide sans reglement lu, et quand la regle n’est plus retenue', () => {
    const { etat, parcelle } = plan();
    const g = calque();
    parcelle.reglementPlu!.faits[0]!.statut = 'propose';
    redessinerEcartsPlu(g, etat, etat);
    expect(g.childNodes).toHaveLength(0);
    parcelle.reglementPlu!.faits[0]!.statut = 'valide';
    redessinerEcartsPlu(g, etat, etat);
    expect(g.querySelectorAll('g.ecartPlu')).toHaveLength(1);
    delete (parcelle as { reglementPlu?: unknown }).reglementPlu;
    toucher(parcelle);
    redessinerEcartsPlu(g, etat, etat);
    expect(g.childNodes).toHaveLength(0);
  });
});
