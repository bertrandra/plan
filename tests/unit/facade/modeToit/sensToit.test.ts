import { describe, it, expect } from 'vitest';
import { appliquerAuBatiment, appliquerChoix, groupesDe, groupesDuBatiment, valeurDuBatiment, valeurDuGroupe } from '../../../../src/facade/modeToit/elements.js';
import { sensDuToit, tournerLeToit } from '../../../../src/facade/modeToit/sens.js';
import { corpsDepuisExemple } from '../../../../src/three/gestesToits.js';
import { EXEMPLES_TOITS } from '../../../../src/three/catalogueToits.js';
import { formeDuCorpsToit } from '../../../../src/model/formeToit.js';
import { repere } from '../../../../src/facade/toits/toitCorps.js';
import { murDuCorps } from '../../../../src/facade/modeToit/saillies.js';
import type { CorpsToit, PtBrut } from '../../../../src/model/types.js';

// Tout le toit d'un batiment a plusieurs corps tourne d'un coup, et le mur haut d'un appentis se choisit (demande du proprietaire,
// 8 novembre 2026, « oui » aux deux questions). Le meme groupe « sens » que sur un corps, quand rien n'est choisi ; le mur haut, un groupe
// du corps a un pan. Aucun champ de fichier : l'ordre des sommets et la place du faitage.

const RECT: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 7 }, { x: 0, y: 7 }];
const exemple = (id: string): CorpsToit[] => {
  const e = EXEMPLES_TOITS.find((x) => x.id === id);
  if (!e) throw new Error('exemple absent : ' + id);
  return corpsDepuisExemple(e, RECT, 5, 3);
};
/** L'axe du faitage en degres, modulo 180 : 0 le long de x, 90 le long de y. */
const axe = (c: CorpsToit): number => { const r = repere(c.pts); return Math.round(((Math.atan2(r.u.y, r.u.x) * 180) / Math.PI + 180) % 180); };
const aire = (c: CorpsToit): number => { const r = repere(c.pts); return r.L * r.W; };
const boite = (l: readonly CorpsToit[]) => {
  const p = l.flatMap((c) => c.pts);
  return [Math.min(...p.map((q) => q.x)), Math.min(...p.map((q) => q.y)), Math.max(...p.map((q) => q.x)), Math.max(...p.map((q) => q.y))].map((v) => Math.round(v * 1e6) / 1e6);
};
/** Deux listes de corps egales, les coordonnees du plan au millionieme pres (un quart de tour de la composition passe par des parts). */
function memesCorps(a: readonly CorpsToit[], b: readonly CorpsToit[]): void {
  expect(a.length).toBe(b.length);
  a.forEach((c, i) => {
    const d = b[i] as CorpsToit;
    c.pts.forEach((q, k) => { expect(q.x).toBeCloseTo((d.pts[k] as PtBrut).x, 6); expect(q.y).toBeCloseTo((d.pts[k] as PtBrut).y, 6); });
    expect({ ...c, pts: [] }).toEqual({ ...d, pts: [] });
  });
}

describe('tout le toit tourne d un coup, la composition gardee', () => {
  it.each(['toit-en-m', 'deux-pans-decales', 'shed'])('%s : « Faîtage dans la largeur » sur le bâtiment entier tourne la composition sur son emprise', (id) => {
    const l = exemple(id);
    expect(l.length).toBeGreaterThan(1);
    const g = groupesDuBatiment(l);
    expect(g.map((x) => x.groupe)).toEqual(['sens']);
    expect(g[0]?.raison).toBeUndefined();
    expect(g[0]?.aide).toMatch(/composition/);
    expect(valeurDuBatiment(l, 'sens')).toBe('long');
    expect(l.every((c) => axe(c) === 0)).toBe(true);
    const t = appliquerAuBatiment(l, 'sens', 'court');
    // Autant de corps, tous tournes d'un quart de tour, la meme emprise pavee (meme aire, meme boite), les memes hauteurs et formes.
    expect(t.length).toBe(l.length);
    expect(t.every((c) => axe(c) === 90)).toBe(true);
    expect(boite(t)).toEqual(boite(l));
    expect(t.reduce((s, c) => s + aire(c), 0)).toBeCloseTo(12 * 7, 6);
    t.forEach((c, i) => {
      const a = l[i] as CorpsToit;
      expect(c.faitage).toBe(a.faitage);
      expect(c.egouts).toEqual(a.egouts);
      expect(formeDuCorpsToit(c)).toBe(formeDuCorpsToit(a));
      // Le faitage garde sa place relative en travers (au milieu, sur un mur pour un appentis).
      expect(c.posFaitage / repere(c.pts).W).toBeCloseTo(a.posFaitage / repere(a.pts).W, 2);
    });
    // Toujours une composition (des bandes accolees, maintenant dans l'autre sens), et le sens se lit.
    expect(sensDuToit(t)?.mode).toBe('composition');
    expect(valeurDuBatiment(t, 'sens')).toBe('court');
    // Les bandes : les corps sont accoles le long de x (chacun de toute la largeur du batiment), au lieu de y.
    t.forEach((c) => { const ys = c.pts.map((q) => Math.round(q.y * 1e6) / 1e6); expect(Math.min(...ys)).toBe(0); expect(Math.max(...ys)).toBe(7); });
  });

  it.each(['toit-en-m', 'deux-pans-decales', 'shed'])('%s : un aller-retour rend les corps ; le sens déjà en place ne change rien', (id) => {
    const l = exemple(id);
    memesCorps(appliquerAuBatiment(appliquerAuBatiment(l, 'sens', 'court'), 'sens', 'long'), l);
    expect(appliquerAuBatiment(l, 'sens', 'long')).toEqual(l);
  });

  it('un toit en M reste un M : deux faitages paralleles, a la meme hauteur, une noue entre eux', () => {
    const t = appliquerAuBatiment(exemple('toit-en-m'), 'sens', 'court');
    const [a, b] = t as [CorpsToit, CorpsToit];
    expect(a.faitage).toBe(b.faitage);
    const xs = (c: CorpsToit) => c.pts.map((q) => Math.round(q.x * 1e6) / 1e6);
    // Deux bandes de 6 m cote a cote, sans vide ni chevauchement.
    expect([Math.min(...xs(a)), Math.max(...xs(a))].concat([Math.min(...xs(b)), Math.max(...xs(b))]).sort((p, q) => p - q)).toEqual([0, 6, 6, 12]);
  });

  it('un shed reste un shed : chaque appentis garde son mur haut du meme cote', () => {
    const l = exemple('shed'), t = appliquerAuBatiment(l, 'sens', 'court');
    t.forEach((c) => expect(formeDuCorpsToit(c)).toBe('appentis'));
    // Le faitage de chaque dent sur son mur, du meme cote pour toutes.
    const cotes = t.map((c) => (c.posFaitage <= 0.01 ? 0 : 1));
    expect(new Set(cotes).size).toBe(1);
  });

  it('une maison en L : chaque corps tourne dans son rectangle, l emprise reste ; un toit plat reste', () => {
    const principal: CorpsToit = { pts: RECT.map((q) => ({ ...q })), posFaitage: 3.5, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0 };
    const aile: CorpsToit = { pts: [{ x: 0, y: 7 }, { x: 5, y: 7 }, { x: 5, y: 15 }, { x: 0, y: 15 }], posFaitage: 2.5, faitage: 7, egouts: [5, 5], pignons: [], ecart: 0 };
    const plat: CorpsToit = { pts: [{ x: 12, y: 0 }, { x: 15, y: 0 }, { x: 15, y: 4 }, { x: 12, y: 4 }], posFaitage: 2, faitage: 3, egouts: [3, 3], pignons: [], ecart: 0 };
    const l = [principal, aile, plat];
    const e = sensDuToit(l);
    expect(e?.mode).toBe('corps');
    expect(groupesDuBatiment(l)[0]?.aide).toMatch(/Chaque corps/);
    expect(e?.valeur).toBe('long');
    const t = tournerLeToit(l, 'court');
    expect(axe(t[0] as CorpsToit)).toBe(90);
    // L'aile avait son faitage dans sa largeur (le long de x) : elle aussi tourne d'un quart de tour.
    expect(axe(aile)).toBe(0);
    expect(axe(t[1] as CorpsToit)).toBe(90);
    expect(t[2]).toEqual(plat);
    // Chaque corps garde son rectangle : les memes sommets, dans un autre ordre.
    const sommets = (c: CorpsToit) => c.pts.map((q) => q.x + ',' + q.y).sort();
    t.forEach((c, i) => expect(sommets(c)).toEqual(sommets(l[i] as CorpsToit)));
    expect(valeurDuBatiment(t, 'sens')).toBe('court');
    // L'aller-retour rend les corps a l'identique (les sommets tournent d'un cran, puis reviennent).
    expect(tournerLeToit(t, 'long')).toEqual(l);
  });

  it('les travees et les elements de facade gardent leur place sur le plan, sur le mur qui la porte apres le tour', () => {
    const l = exemple('toit-en-m');
    // Le mur 0 du premier corps : la facade y = 0, de x = 0 a 12. Une travee de 1 a 4 m, et une galerie centree a 9 m.
    const m0 = murDuCorps(l[0] as CorpsToit, 0);
    expect([m0.a.y, m0.b.y]).toEqual([0, 0]);
    const avecTravee: CorpsToit = { ...(l[0] as CorpsToit), travees: [{ mur: 0, de: 1, a: 4, nature: 'poteaux' }] };
    const galerie: CorpsToit = { pts: [{ x: 8, y: -2 }, { x: 10, y: -2 }, { x: 10, y: 0 }, { x: 8, y: 0 }], posFaitage: 0, faitage: 3.5, egouts: [2.6, 2.6], pignons: [], ecart: 0, ouvert: true,
      saillie: { genre: 'galerie', hote: 0, mur: 0, centreM: 9, largeurM: 2, profondeurM: 2, forme: 'rectangle', niveau: 'rdc', toit: 'pan' } };
    const avant = [avecTravee, l[1] as CorpsToit, galerie];
    expect(groupesDuBatiment(avant)[0]?.raison).toBeUndefined();
    const t = appliquerAuBatiment(avant, 'sens', 'court');
    const ou = (k: CorpsToit, mur: number, d: number) => { const m = murDuCorps(k, mur); return { x: Math.round((m.a.x + m.u.x * d) * 1e6) / 1e6, y: Math.round((m.a.y + m.u.y * d) * 1e6) / 1e6 }; };
    // La travee : sur la facade sud, de x = 1 a x = 4, quel que soit le corps qui la porte maintenant.
    const porteur = t.findIndex((k) => k.travees?.length);
    const tr = (t[porteur] as CorpsToit).travees?.[0];
    expect(tr?.nature).toBe('poteaux');
    const bouts = [ou(t[porteur] as CorpsToit, tr?.mur as number, tr?.de as number), ou(t[porteur] as CorpsToit, tr?.mur as number, tr?.a as number)].sort((p, q) => p.x - q.x);
    expect(bouts).toEqual([{ x: 1, y: 0 }, { x: 4, y: 0 }]);
    // La galerie : meme rectangle, centree a x = 9 sur la facade sud de son nouvel hote.
    const g = t[2] as CorpsToit;
    expect(g.pts).toEqual(galerie.pts);
    expect(ou(t[g.saillie?.hote as number] as CorpsToit, g.saillie?.mur as number, g.saillie?.centreM as number)).toEqual({ x: 9, y: 0 });
    // L'aller-retour rend tout, travee et galerie comprises.
    memesCorps(appliquerAuBatiment(t, 'sens', 'long'), avant);
  });
});

describe('quand un corps empeche tout le toit de tourner : grise, avec la raison, et rien ne tourne', () => {
  it('une fenetre de toit sur un corps d un toit en M', () => {
    const l = exemple('toit-en-m');
    const avec = [l[0] as CorpsToit, { ...(l[1] as CorpsToit), elementsToit: [{ type: 'fenetre-toit' as const, pan: 0 as const, sM: 3, dM: 1 }] }];
    const g = groupesDuBatiment(avec)[0];
    expect(g?.raison).toMatch(/le corps 2 porte une fenêtre de toit/);
    expect(appliquerAuBatiment(avec, 'sens', 'court')).toEqual(avec);
  });

  it.each([
    ['un pignon', { pignons: [{ pan: 0 as const, debut: 1, fin: 3, faitage: 7, profondeur: 2 }] }],
    ['une lucarne', { lucarnes: [{ type: 'jacobine' as const, pan: 0 as const, debutM: 2, finM: 3, faitageM: 6.5, profondeurM: 1 }] }],
    ['un panneau solaire', { elementsToit: [{ type: 'solaire' as const, pan: 1 as const, sM: 3, dM: 1 }] }]
  ])('%s sur le corps principal d une maison en L', (quoi, x) => {
    const principal: CorpsToit = { pts: RECT.map((q) => ({ ...q })), posFaitage: 3.5, faitage: 8, egouts: [5, 5], pignons: [], ecart: 0, ...x } as CorpsToit;
    const aile: CorpsToit = { pts: [{ x: 0, y: 7 }, { x: 5, y: 7 }, { x: 5, y: 15 }, { x: 0, y: 15 }], posFaitage: 2.5, faitage: 7, egouts: [5, 5], pignons: [], ecart: 0 };
    const l = [principal, aile];
    expect(groupesDuBatiment(l)[0]?.raison).toContain('le corps principal porte ' + quoi);
    expect(tournerLeToit(l, 'court')).toEqual(l);
  });

  it('une travee a cheval sur deux corps une fois la composition tournee', () => {
    const l = exemple('toit-en-m');
    // De 4 a 8 m sur la facade sud : apres le tour, la facade sud est faite des bouts de deux corps de 6 m.
    const avec = [{ ...(l[0] as CorpsToit), travees: [{ mur: 0, de: 4, a: 8, nature: 'mur' as const, reculM: 0.5 }] }, l[1] as CorpsToit];
    expect(groupesDuBatiment(avec)[0]?.raison).toMatch(/travée du corps principal tomberait à cheval/);
    expect(appliquerAuBatiment(avec, 'sens', 'court')).toEqual(avec);
  });

  it('un seul corps : pas de groupe du batiment entier (le groupe du corps suffit)', () => {
    expect(groupesDuBatiment(exemple('deux-pans'))).toEqual([]);
  });
});

describe('le mur haut d un appentis', () => {
  const t = { type: 'corps' as const, rang: 0, i: 0 };

  it('se choisit entre les deux murs longs, nommes par leur orientation ; pas sur un deux-pans', () => {
    const c = exemple('appentis')[0] as CorpsToit;
    const g = groupesDe([c], t).find((x) => x.groupe === 'murHaut');
    expect(g?.valeurs.map((v) => v.libelle)).toEqual(['Mur haut côté sud', 'Mur haut côté nord']);
    expect(valeurDuGroupe([c], t, 'murHaut')).toBe('0');
    expect(groupesDe([exemple('deux-pans')[0] as CorpsToit], t).map((x) => x.groupe)).not.toContain('murHaut');
  });

  it.each(['0', '2'])('mur haut %s puis l autre : le faitage passe sur le mur oppose, un aller-retour rend le corps', (depart) => {
    let c = exemple('appentis')[0] as CorpsToit;
    c = { ...c, egouts: [3.2, 2.8], elementsToit: [{ type: 'fenetre-toit', pan: 1, sM: 4, dM: 1.5 }] };
    if (depart === '2') c = appliquerChoix([c], t, 'murHaut', '2')[0] as CorpsToit;
    expect(valeurDuGroupe([c], t, 'murHaut')).toBe(depart);
    const autre = depart === '0' ? '2' : '0';
    const k = appliquerChoix([c], t, 'murHaut', autre)[0] as CorpsToit;
    expect(valeurDuGroupe([k], t, 'murHaut')).toBe(autre);
    expect(k.pts).toEqual(c.pts);
    expect(k.posFaitage).toBe(depart === '0' ? 7 : 0);
    expect(k.egouts).toEqual([c.egouts[1], c.egouts[0]]);
    expect(formeDuCorpsToit(k)).toBe('appentis');
    expect(k.elementsToit?.[0]?.pan).toBe(c.elementsToit?.[0]?.pan === 0 ? 1 : 0);
    expect(appliquerChoix([k], t, 'murHaut', depart)[0]).toEqual(c);
    // Le mur deja haut ne change rien.
    expect(appliquerChoix([c], t, 'murHaut', depart)[0]).toEqual(c);
  });

  it('avec le sens du faitage : l appentis tourne, puis son mur haut se choisit, et tout revient', () => {
    const c = exemple('appentis')[0] as CorpsToit;
    const a = appliquerChoix([c], t, 'sens', 'court');
    const b = appliquerChoix(a, t, 'murHaut', valeurDuGroupe(a, t, 'murHaut') === '0' ? '2' : '0');
    const retour = appliquerChoix(appliquerChoix(b, t, 'murHaut', valeurDuGroupe(a, t, 'murHaut') as string), t, 'sens', 'long');
    expect(retour[0]?.pts).toEqual(c.pts);
    expect(retour[0]?.posFaitage).toBeCloseTo(c.posFaitage, 6);
    expect(retour[0]?.egouts).toEqual(c.egouts);
  });
});
