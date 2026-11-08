import { describe, it, expect } from 'vitest';
import { appliquerChoix, groupesDe, valeurDuGroupe } from '../../../../src/facade/modeToit/elements.js';
import { corpsDepuisExemple } from '../../../../src/three/gestesToits.js';
import { EXEMPLES_TOITS } from '../../../../src/three/catalogueToits.js';
import { formeDuCorpsToit } from '../../../../src/model/formeToit.js';
import { repere } from '../../../../src/facade/toits/toitCorps.js';
import type { BoutToit, CorpsToit, PtBrut } from '../../../../src/model/types.js';

// Le sens du faitage au Mode Toit, sur chaque forme qui en a un (demande du proprietaire, 8 novembre 2026 : « Sur toit 2 pans je peux
// choisir l'axe. Meme chose sur les autres types de toit concernes. »). Un seul mecanisme, celui des deux pans : le groupe « sens » et
// l'ordre des sommets du rectangle (`pts[0] -> pts[1]` suit le faitage). Pas de sens sur un toit plat ni sur un toit de revolution.

const RECT: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 7 }, { x: 0, y: 7 }];
const t = { type: 'corps' as const, rang: 0, i: 0 };
const exemple = (id: string): CorpsToit => {
  const e = EXEMPLES_TOITS.find((x) => x.id === id);
  if (!e) throw new Error('exemple absent : ' + id);
  return corpsDepuisExemple(e, RECT, 5, 3)[0] as CorpsToit;
};
/** L'axe du faitage en degres, modulo 180 : 0 le long de x (le grand cote du rectangle), 90 le long de y. */
const axe = (c: CorpsToit): number => {
  const r = repere(c.pts);
  return Math.round(((Math.atan2(r.u.y, r.u.x) * 180) / Math.PI + 180) % 180);
};
const sommets = (c: CorpsToit) => [...c.pts].map((p) => p.x + ',' + p.y).sort();

const AVEC_SENS = ['deux-pans', 'croupes', 'pavillon', 'appentis', 'demi-croupes', 'mansart', 'asymetrique', 'papillon', 'gambrel', 'coyau', 'berceau', 'carene'];
const SANS_SENS = ['plat', 'conique', 'polygonal', 'fleche', 'dome', 'imperiale'];

describe('le sens du faitage, forme par forme', () => {
  it.each(AVEC_SENS)('%s : « Faîtage dans la largeur » tourne le faitage d un quart de tour, la forme et le rectangle restent', (id) => {
    const c = exemple(id), forme = formeDuCorpsToit(c), r = repere(c.pts);
    expect(groupesDe([c], t).map((g) => g.groupe)).toContain('sens');
    expect(valeurDuGroupe([c], t, 'sens')).toBe('long');
    expect(axe(c)).toBe(0);
    const tourne = appliquerChoix([c], t, 'sens', 'court')[0] as CorpsToit;
    expect(axe(tourne)).toBe(90);
    expect(repere(tourne.pts).L).toBeCloseTo(r.W, 6);
    expect(repere(tourne.pts).W).toBeCloseTo(r.L, 6);
    expect(valeurDuGroupe([tourne], t, 'sens')).toBe('court');
    // Le meme rectangle, les memes hauteurs.
    expect(sommets(tourne)).toEqual(sommets(c));
    expect(tourne.faitage).toBe(c.faitage);
    expect(tourne.egouts).toEqual(c.egouts);
    // La meme forme : un quatre-pans sur 7 m de faitage peut devenir un pavillon, c'est le meme toit a croupes.
    if (forme === 'croupes' || forme === 'pavillon') expect(['croupes', 'pavillon']).toContain(formeDuCorpsToit(tourne));
    else expect(formeDuCorpsToit(tourne)).toBe(forme);
    // Le faitage garde sa place relative en travers : au milieu, ou sur le mur d'un appentis.
    expect(tourne.posFaitage / r.L).toBeCloseTo(c.posFaitage / r.W, 2);
  });

  it.each(AVEC_SENS)('%s : un aller-retour rend le corps tel quel ; le sens deja en place ne change rien', (id) => {
    const c = exemple(id);
    const retour = appliquerChoix(appliquerChoix([c], t, 'sens', 'court'), t, 'sens', 'long')[0] as CorpsToit;
    expect(retour.pts).toEqual(c.pts);
    expect(retour.posFaitage).toBeCloseTo(c.posFaitage, 2);
    expect(retour.bouts).toEqual(c.bouts);
    expect(retour.croupes).toEqual(c.croupes);
    expect(JSON.stringify(retour.profil)).toBe(JSON.stringify(c.profil));
    expect(appliquerChoix([c], t, 'sens', 'long')[0]).toEqual(c);
  });

  it.each(SANS_SENS)('%s : pas de sens de faitage (pas de faitage, ou un axe vertical) ; le choix ne change rien', (id) => {
    const c = exemple(id);
    expect(groupesDe([c], t).map((g) => g.groupe)).not.toContain('sens');
    expect(appliquerChoix([c], t, 'sens', 'court')[0]).toEqual(c);
  });

  it('un appentis tourne avec son mur haut : il reste un appentis, son faitage sur un mur', () => {
    const c = exemple('appentis');
    const tourne = appliquerChoix([c], t, 'sens', 'court')[0] as CorpsToit;
    expect(formeDuCorpsToit(tourne)).toBe('appentis');
    expect([0, repere(c.pts).L]).toContain(tourne.posFaitage);
  });

  it('une croupe et un cul de geai gardent leur part du faitage ; un brisis et un coyau leur largeur, un berceau sa forme', () => {
    const croupes = { ...exemple('deux-pans'), bouts: [{ type: 'croupe' as const, profondeurM: 3 }, { type: 'demi-croupe' as const, profondeurM: 1.2, hauteurPignonM: 1.5 }] as [BoutToit, BoutToit] };
    const b = (appliquerChoix([croupes], t, 'sens', 'court')[0] as CorpsToit).bouts;
    expect(b?.[0]).toEqual({ type: 'croupe', profondeurM: 1.75 });
    expect(b?.[1]).toEqual({ type: 'demi-croupe', profondeurM: 0.7, hauteurPignonM: 1.5 });
    // Un pavillon reste un pavillon : ses croupes se rejoignent toujours.
    const pav = appliquerChoix([exemple('pavillon')], t, 'sens', 'court')[0] as CorpsToit;
    expect(formeDuCorpsToit(pav)).toBe('pavillon');
    const mansart = exemple('mansart'), m = appliquerChoix([mansart], t, 'sens', 'court')[0] as CorpsToit;
    expect(m.profil?.[0]).toEqual(mansart.profil?.[0]);
    const berceau = exemple('berceau'), v = appliquerChoix([berceau], t, 'sens', 'court')[0] as CorpsToit;
    const f0 = berceau.profil?.[0], f1 = v.profil?.[0];
    expect(f0?.type === 'courbe' && f1?.type === 'courbe' && f1.flecheM / 12).toBeCloseTo(f0?.type === 'courbe' ? f0.flecheM / 7 : 0, 2);
  });

  it('ce qui tient a un mur garde son mur : une travee et un element de facade pose dessus', () => {
    const c: CorpsToit = { ...exemple('deux-pans'), travees: [{ mur: 2, de: 1, a: 4, nature: 'mur', reculM: 0.5 }] };
    const galerie: CorpsToit = { pts: [{ x: 4, y: 7 }, { x: 8, y: 7 }, { x: 8, y: 9 }, { x: 4, y: 9 }], posFaitage: 0, faitage: 3.5, egouts: [2.6, 2.6], pignons: [], ecart: 0, ouvert: true,
      saillie: { genre: 'galerie', hote: 0, mur: 2, centreM: 6, largeurM: 4, profondeurM: 2, forme: 'rectangle', niveau: 'rdc', toit: 'pan' } };
    const murDe = (k: CorpsToit, m: number) => [k.pts[m], k.pts[(m + 1) % 4]];
    for (const sens of ['court'] as const) {
      const l = appliquerChoix([c, galerie], t, 'sens', sens);
      const k = l[0] as CorpsToit, g = l[1] as CorpsToit;
      expect(murDe(k, k.travees?.[0]?.mur as number)).toEqual(murDe(c, 2));
      expect(murDe(k, g.saillie?.mur as number)).toEqual(murDe(c, 2));
      expect(g.pts).toEqual(galerie.pts);
      const retour = appliquerChoix(l, t, 'sens', 'long');
      expect(retour[0]?.travees).toEqual(c.travees);
      expect(retour[1]?.saillie).toEqual(galerie.saillie);
    }
  });

  it('pas de sens quand un element se compte le long du faitage : pignon, lucarne, fenetre de toit ; ni sur un element de facade', () => {
    const c = exemple('mansart');
    const avec = (x: Partial<CorpsToit>) => groupesDe([{ ...c, ...x }], t).map((g) => g.groupe);
    expect(avec({ pignons: [{ pan: 0, debut: 1, fin: 3, faitage: 7, profondeur: 3 }] })).not.toContain('sens');
    expect(avec({ elementsToit: [{ type: 'fenetre-toit', pan: 0, sM: 3, dM: 1 }] })).not.toContain('sens');
    expect(exemple('jacobine').lucarnes?.length).toBeGreaterThan(0);
    expect(groupesDe([exemple('jacobine')], t).map((g) => g.groupe)).not.toContain('sens');
  });
});
