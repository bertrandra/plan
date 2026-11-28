import { describe, it, expect, vi } from 'vitest';
import { creerControleurToit, type ControleurToit } from '../../../../src/facade/modeToit/controleurToit.js';
import { corpsDepuisExemple, porteeDuGeste, RAISON_SANS_CORPS } from '../../../../src/facade/modeToit/gestes.js';
import { EXEMPLES_TOITS } from '../../../../src/facade/modeToit/exemplesToits.js';
import { PIECES_SIMPLES } from '../../../../src/facade/modeToit/pieces.js';
import { BORNES_SAILLIE, bornesDeSaillie, murDuCorps } from '../../../../src/facade/modeToit/saillies.js';
import { glisser } from '../../../../src/facade/modeToit/poignees.js';
import { largeurDeLucarne, SOUCHE, sommetDeSouche } from '../../../../src/facade/regles/toits/elementsDesMurs.js';
import { listerElements, lireElement } from '../../../../src/facade/modeToit/elements.js';
import { validerLaSession } from '../../../../src/app/toits/modeToit.js';
import type { CorpsToit, ObjetPlan, PtBrut } from '../../../../src/model/types.js';

// Le controleur d'edition du toit (facade/modeToit/controleurToit.ts) : la seule porte d'ecriture d'un toit, en 2D comme en 3D. Chaque
// invariant de la revue d'architecture du 28 novembre 2026 a son cas ici.

const RECT: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
const exemple = (id: string, rect = RECT, egout = 5, montee = 3): CorpsToit[] => corpsDepuisExemple(EXEMPLES_TOITS.find((x) => x.id === id)!, rect, egout, montee);
const mesure = { pas: 0.5, x0: -0.5, y0: 8.5, nx: 3, ny: 2, z: [6, null, 7, 6.5, 6, 6], egout: 5, faite: 8, source: 'lidar' as const };

/** Une maison lue (corps, mesure LiDAR, version de lecture) : ce que « Règles » rend a la lecture, et qu'Abandonner doit rendre. */
const lue = (): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: RECT.map((p) => ({ ...p })), elevation: 5,
  batiment: {
    toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar', couleur: '#884433' }, corpsToit: exemple('deux-pans'), modeToit: 'corps',
    toitMesure: structuredClone(mesure), toitLidarLu: 7, volumesToit: null, facades: [{ mur: 0 }]
  }
}) as unknown as ObjetPlan;

/** Un toit simple, sans corps : rectangle, ou contour en L (la maison de la demonstration). */
const simple = (pts: PtBrut[] = RECT, forme = 'deux-pans'): ObjetPlan => ({
  key: 's', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: pts.map((p) => ({ ...p })), elevation: 5,
  batiment: { toit: { forme, hauteur: 3, angleFaitage: 0, source: 'bdtopo' } }
}) as unknown as ObjetPlan;
const EN_L: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 10 }, { x: 0, y: 10 }];

/** Un corps principal 12 x 8 et une aile 4 x 4 contre son mur est, chacun a ses hauteurs ; une galerie sur le mur sud du principal. */
const composee = (): ObjetPlan => {
  const o = lue();
  const aile = exemple('deux-pans', [{ x: 12, y: 2 }, { x: 16, y: 2 }, { x: 16, y: 6 }, { x: 12, y: 6 }], 3, 2)[0]!;
  o.batiment!.corpsToit = [...o.batiment!.corpsToit!, aile];
  const c = creerControleurToit(o, 'ajouter');
  c.selectionner({ type: 'corps', rang: 0, i: 0 });
  c.regarder({ rang: 0, mur: 0 });
  expect(c.poserPiece('facade:galerie').fait).toBe(true);
  c.valider();
  delete o.batiment!.toitFige;
  return o;
};

describe('le depart se rend au bit pres', () => {
  it('apres n importe quelle suite de gestes, « Quitter sans garder » rend le batiment entier tel qu il etait, « Règles » comprises', () => {
    const o = composee(), avant = JSON.stringify(o);
    const c = creerControleurToit(o);
    const suite: ((c: ControleurToit) => unknown)[] = [
      (k) => k.reglerFaitage(1), (k) => k.tournerSens(), (k) => k.choisirForme('forme:croupes'),
      (k) => { k.selectionner({ type: 'corps', rang: 1, i: 0 }); return k.regler('pente', '45'); },
      (k) => k.choisirIntention('ajouter'), (k) => k.poserPiece('sur:cheminee'), (k) => k.poserPiece('sur:jacobine'),
      (k) => k.choisirIntention('modifier'), (k) => k.redimensionner(1), (k) => k.retirer(),
      (k) => k.basculerRegles(), (k) => k.defaire(), (k) => k.basculerRegles(), (k) => k.voirLeProjet(), (k) => k.reglerFaitage(-1)
    ];
    for (const g of suite) g(c);
    // « Règles » rallumees a retire la mesure LiDAR et la version de lecture : la session les a photographiees.
    expect(o.batiment?.toitMesure).toBeUndefined();
    c.quitterSansGarder();
    expect(JSON.parse(JSON.stringify(o))).toEqual(JSON.parse(avant));
    expect(JSON.stringify(o)).toBe(avant);
  });

  it('« Règles » puis quitter : la mesure LiDAR et la version de lecture reviennent (constat 1)', () => {
    const o = lue();
    o.batiment!.toitFige = true;
    const avant = JSON.stringify(o);
    const c = creerControleurToit(o);
    expect(c.basculerRegles().fait).toBe(true);
    expect(o.batiment?.toitLidarLu).toBeUndefined();
    expect(o.batiment?.corpsToit).toBeUndefined();
    c.quitterSansGarder();
    expect(JSON.stringify(o)).toBe(avant);
  });

  it('Valider : une etape d historique qui garde le depart entier (le Ctrl+Z du projet le rend, « Règles » comprises)', () => {
    const o = lue(), avant = JSON.stringify(o), vus: string[] = [];
    const c = creerControleurToit(o);
    c.basculerRegles();
    const a = { pushHistory: vi.fn((x?: unknown) => { vus.push(JSON.stringify(x)); }), markDirty: vi.fn() };
    expect(validerLaSession(a, o, { ctl: c })).toBe(true);
    expect(vus).toEqual([avant]);
    expect(c.ferme).toBe(true);
    // Une session fermee n'ecrit plus rien.
    expect(c.reglerFaitage(1).fait).toBe(false);
  });
});

describe('« Voir le toit du projet » ne perd rien (constat 3)', () => {
  it('un reglage pendant que le projet est montre se calcule sur la session, et ne l ecrase pas', () => {
    const o = lue(), c = creerControleurToit(o);
    c.reglerFaitage(1); c.reglerFaitage(1);
    const session = o.batiment!.corpsToit![0]!.faitage;
    expect(c.voirLeProjet()).toBe(true);
    expect(o.batiment!.corpsToit![0]!.faitage).toBeCloseTo(session - 0.2, 6);
    c.reglerFaitage(1);
    expect(c.etat().voitLeProjet).toBe(false);
    expect(o.batiment!.corpsToit![0]!.faitage).toBeCloseTo(session + 0.1, 6);
    // Les deux pas d'avant sont toujours dans la pile.
    c.defaire();
    expect(o.batiment!.corpsToit![0]!.faitage).toBeCloseTo(session, 6);
  });

  it('retirer, dupliquer, couper pendant « Voir le toit du projet » : sur l etat de la session', () => {
    const o = lue(), c = creerControleurToit(o, 'ajouter');
    c.poserPiece('sur:cheminee');
    expect(o.batiment!.corpsToit![0]!.cheminees).toHaveLength(1);
    c.choisirIntention('ajouter');
    expect(c.voirLeProjet()).toBe(true);
    expect(o.batiment!.corpsToit![0]!.cheminees ?? []).toHaveLength(0);
    // La cheminee choisie n'existe pas dans le toit montre ; le geste reprend la session et la duplique.
    c.selectionner({ type: 'cheminee', rang: 0, i: 0 });
    expect(c.dupliquer().fait).toBe(true);
    expect(o.batiment!.corpsToit![0]!.cheminees).toHaveLength(2);
  });
});

describe('une forme sans choix (constat 2, option A)', () => {
  it('va au corps principal et garde ce qui est pose ; les autres corps ne bougent pas', () => {
    const o = composee(), c = creerControleurToit(o), aile = JSON.stringify(o.batiment!.corpsToit![1]);
    const n = o.batiment!.corpsToit!.length;
    expect(c.etat().portee.mots).toBe('Corps principal');
    expect(c.choisirForme('forme:croupes').fait).toBe(true);
    expect(o.batiment!.corpsToit).toHaveLength(n);
    expect(JSON.stringify(o.batiment!.corpsToit![1])).toBe(aile);
    expect(o.batiment!.corpsToit![0]!.croupes?.some((h) => h > 0)).toBe(true);
    expect(o.batiment!.corpsToit!.some((k) => k.saillie?.genre === 'galerie')).toBe(true);
  });

  it('va au corps de la facade regardee', () => {
    const o = composee(), c = creerControleurToit(o), principal = JSON.stringify(o.batiment!.corpsToit![0]);
    c.regarder({ rang: 1, mur: 1 });
    expect(c.etat().portee).toMatchObject({ rang: 1, mots: 'Corps 2 (la façade regardée)' });
    expect(c.choisirForme('forme:plat').fait).toBe(true);
    expect(JSON.stringify(o.batiment!.corpsToit![0])).toBe(principal);
  });

  it('« Bâtiment entier » est un choix explicite : il dit d avance ce qui disparait, puis remplace tout le toit', () => {
    const o = composee(), c = creerControleurToit(o);
    c.choisirBatimentEntier();
    const e = c.etat();
    expect(e.portee).toMatchObject({ entier: true, mots: 'Tout le toit' });
    expect(e.forme.disparait).toEqual(['1 corps de plus', '1 galerie']);
    expect(c.choisirForme('forme:croupes').fait).toBe(true);
    expect(o.batiment!.corpsToit).toHaveLength(1);
    expect(o.batiment!.corpsToit!.some((k) => k.saillie)).toBe(false);
  });
});

describe('les bornes uniques des elements de facade (constat 4)', () => {
  it('une galerie de 8 m : « Agrandir » ne la reduit jamais, « Réduire » la ramene d un pas', () => {
    const o = lue(), c = creerControleurToit(o, 'ajouter');
    c.regarder({ rang: 0, mur: 0 });
    c.poserPiece('facade:galerie');
    const rang = o.batiment!.corpsToit!.findIndex((k) => k.saillie);
    // Une galerie de 8 m, posee par la poignee de bord (le meme chemin d'ecriture que les autres).
    c.apercu(glisser(o.batiment!.corpsToit!, { type: 'saillie', rang, i: 0 }, 'larg', { long: 3 }).corps);
    c.finGlisser();
    const w = o.batiment!.corpsToit![rang]!.saillie!.largeurM;
    expect(w).toBeCloseTo(8, 1);
    c.selectionner({ type: 'saillie', rang, i: 0 });
    c.redimensionner(1);
    expect(o.batiment!.corpsToit![rang]!.saillie!.largeurM).toBeGreaterThanOrEqual(w);
    const w2 = o.batiment!.corpsToit![rang]!.saillie!.largeurM;
    c.redimensionner(-1);
    expect(o.batiment!.corpsToit![rang]!.saillie!.largeurM).toBeCloseTo(w2 - BORNES_SAILLIE.pasLargeurM, 6);
    for (let k = 0; k < 40; k++) c.redimensionner(1);
    const h = o.batiment!.corpsToit![0]!, s = o.batiment!.corpsToit![rang]!.saillie!;
    expect(s.largeurM).toBeCloseTo(murDuCorps(h, s.mur).L - BORNES_SAILLIE.margeMurM, 6);
  });

  it('un appentis neuf de 3 m : la poignee de sa saillie le garde a 3 m (le 1,5 m n est que celui d un bow-window sous l etage)', () => {
    const o = lue(), c = creerControleurToit(o, 'ajouter');
    c.poserPiece('facade:appentis-ferme');
    const rang = o.batiment!.corpsToit!.findIndex((k) => k.saillie), s = o.batiment!.corpsToit![rang]!.saillie!;
    expect(s.profondeurM).toBe(3);
    const r = glisser(o.batiment!.corpsToit!, { type: 'saillie', rang, i: 0 }, 'prof', { prof: 0.1 });
    expect(r.corps[rang]!.saillie!.profondeurM).toBeCloseTo(3.1, 6);
    expect(bornesDeSaillie(o.batiment!.corpsToit![0]!, s).profondeur.max).toBe(BORNES_SAILLIE.profondeurMaxM);
    expect(bornesDeSaillie(o.batiment!.corpsToit![0]!, { ...s, genre: 'bow-window', niveau: 'rdc' }).profondeur.max).toBe(BORNES_SAILLIE.profondeurSousEtageMaxM);
  });
});

describe('toute ecriture fige, sauf « Règles » (constat 5)', () => {
  const gestes: [string, (c: ControleurToit, o: ObjetPlan) => unknown][] = [
    ['faitage', (c) => c.reglerFaitage(1)], ['sens', (c) => c.tournerSens()], ['forme', (c) => c.choisirForme('forme:croupes')],
    ['regler', (c) => c.regler('pente', '45')], ['piece', (c) => { c.choisirIntention('ajouter'); return c.poserPiece('sur:cheminee'); }],
    ['poignee', (c, o) => { c.apercu(glisser(o.batiment!.corpsToit!, { type: 'facade', rang: 0, i: 0, mur: 0 }, 'haut', { vert: 0.3 }).corps); return c.finGlisser(); }]
  ];
  for (const [nom, g] of gestes) {
    it(nom + ' : le toit est fige', () => {
      const o = lue(), c = creerControleurToit(o);
      expect(o.batiment?.toitFige).toBeUndefined();
      g(c, o);
      expect(o.batiment?.toitFige).toBe(true);
    });
  }
  it('« Règles » rallumees : le toit n est plus fige, et la validation le fait relire', () => {
    const o = lue();
    o.batiment!.toitFige = true;
    const c = creerControleurToit(o);
    c.basculerRegles();
    expect(o.batiment?.toitFige).toBeUndefined();
    expect(c.valider().relire).toBe(true);
  });
  it('un geste sans effet n ecrit rien, pas meme la marque', () => {
    const o = creerControleurToit(lue());
    expect(o.tournerCorps(1).fait).toBe(false);
    const p = lue(), c = creerControleurToit(p);
    expect(c.regler('nimporte', 'quoi').fait).toBe(false);
    expect(p.batiment?.toitFige).toBeUndefined();
    expect(c.etat().peutDefaire).toBe(false);
  });
});

describe('Modifier ne cree rien, Ajouter ne touche rien d existant (constat 6)', () => {
  it('en « Modifier », poser une piece, dupliquer ou faire un retour d angle est refuse, et le dit', () => {
    const o = lue(), c = creerControleurToit(o, 'modifier'), avant = JSON.stringify(o);
    expect(c.poserPiece('sur:cheminee').raison).toMatch(/passez à « Ajouter »/);
    expect(c.raisonDePiece('facade:galerie')).toMatch(/passez à « Ajouter »/);
    c.selectionner({ type: 'corps', rang: 0, i: 0 });
    expect(c.retourDAngle('gauche').raison).toMatch(/passez à « Ajouter »/);
    expect(JSON.stringify(o)).toBe(avant);
  });

  it('en « Ajouter », changer la forme, le faitage ou le sens est refuse ; poser n ajoute qu a la fin des listes', () => {
    const o = composee(), c = creerControleurToit(o, 'ajouter'), avant = structuredClone(o.batiment!.corpsToit!);
    expect(c.choisirForme('forme:plat').raison).toMatch(/passez à « Modifier »/);
    expect(c.reglerFaitage(1).raison).toMatch(/passez à « Modifier »/);
    expect(c.raisonDuGeste('sens')).toMatch(/passez à « Modifier »/);
    for (const p of PIECES_SIMPLES) { c.choisirIntention('ajouter'); expect(c.poserPiece(p.piece).fait, p.piece).toBe(true); }
    const apres = o.batiment!.corpsToit!;
    // Chaque element d'avant est encore la, tel quel ; les corps d'avant n'ont fait que recevoir des elements de plus.
    for (const e of listerElements(avant)) {
      const x = lireElement(apres, e.cible);
      if (e.cible.type === 'corps') {
        const sansListes = (k: CorpsToit) => { const r = { ...k }; delete r.lucarnes; delete r.cheminees; delete r.elementsToit; return r; };
        expect(sansListes(x as CorpsToit), e.libelle).toEqual(sansListes(lireElement(avant, e.cible) as CorpsToit));
      } else expect(x, e.libelle).toEqual(lireElement(avant, e.cible));
    }
    expect(apres.length).toBeGreaterThan(avant.length);
  });

  it('une piece posee revient a « Modifier », sur elle', () => {
    const o = lue(), c = creerControleurToit(o, 'ajouter');
    const issue = c.poserPiece('sur:cheminee');
    expect(issue.fait).toBe(true);
    expect(c.etat().intention).toBe('modifier');
    expect(c.etat().selection).toEqual({ type: 'cheminee', rang: 0, i: 0 });
  });
});

describe('les elements poses ont les valeurs de l audit (constat 9)', () => {
  it('une souche et une lucarne posees a la main prennent la section, le debouche et la largeur de l audit', () => {
    const o = lue(), c = creerControleurToit(o, 'ajouter');
    c.poserPiece('sur:cheminee');
    c.choisirIntention('ajouter');
    c.poserPiece('sur:jacobine');
    const k = o.batiment!.corpsToit![0]!, ch = k.cheminees![0]!, l = k.lucarnes![0]!;
    expect({ largeurM: ch.largeurM, profondeurM: ch.profondeurM }).toEqual(SOUCHE);
    expect(ch.sommetM).toBe(sommetDeSouche(k));
    expect(l.finM - l.debutM).toBeCloseTo(largeurDeLucarne('jacobine'), 1);
  });
});

describe('le toit simple : une seule regle, en 2D comme en 3D (constat 8)', () => {
  const ouvrir = (o: ObjetPlan, en3d: boolean) => { const c = creerControleurToit(o); if (en3d) c.regarder({ rang: null, mur: 1 }); return c; };
  for (const [nom, g] of [
    ['la forme', (c: ControleurToit) => c.choisirForme('forme:croupes')], ['la hauteur', (c: ControleurToit) => c.reglerFaitage(1)],
    ['le sens', (c: ControleurToit) => c.tournerSens()], ['la forme en place (decoupe)', (c: ControleurToit) => c.choisirForme('forme:deux-pans')]
  ] as const) {
    it(nom + ' : le meme resultat, l atelier ouvert sur le plan ou dans la Vue 3D', () => {
      const plan = simple(), scene = simple();
      g(ouvrir(plan, false));
      g(ouvrir(scene, true));
      expect(JSON.stringify(scene)).toBe(JSON.stringify(plan));
      expect(plan.batiment?.toit?.source).toBe('saisie');
      expect(plan.batiment?.toitFige).toBe(true);
    });
  }
  it('une forme simple autre que celle en place change le toit simple ; il reste d un seul tenant', () => {
    const o = simple(), c = creerControleurToit(o);
    c.choisirForme('forme:plat');
    expect(o.batiment?.toit?.forme).toBe('plat');
    expect(o.batiment?.corpsToit).toBeUndefined();
    c.choisirForme('forme:appentis');
    c.reglerFaitage(-1);
    expect(o.batiment?.toit?.hauteur).toBe(2.9);
  });
});

describe('l impasse du toit simple en L (audit UX du 28 novembre 2026)', () => {
  it('la forme en place se dit, les pieces sont grisees avec la raison, et « Découper ce toit » leve l impasse', () => {
    const o = simple(EN_L, 'croupes'), c = creerControleurToit(o);
    const e = c.etat();
    expect(e.forme.enPlace).toBe('forme:croupes');
    expect(e.forme.decoupe?.libelle).toBe('Découper ce toit en 2 corps : quatre pans');
    c.choisirIntention('ajouter');
    for (const p of PIECES_SIMPLES) expect(c.raisonDePiece(p.piece), p.piece).toBe(RAISON_SANS_CORPS);
    // Le decoupage se fait aussi depuis l'intention d'ajout : c'est le geste qui leve l'impasse ou elle se dit.
    expect(c.raisonDuGeste('decouper')).toBeNull();
    expect(c.decouper().fait).toBe(true);
    expect(o.batiment!.corpsToit).toHaveLength(2);
    expect(o.batiment!.corpsToit!.every((k) => k.croupes?.some((h) => h > 0))).toBe(true);
    for (const p of PIECES_SIMPLES) expect(c.raisonDePiece(p.piece), p.piece).toBeNull();
    expect(c.etat().forme.decoupe).toBeNull();
  });

  it('toucher la forme en place la decoupe en corps de cette forme', () => {
    const o = simple(EN_L, 'croupes'), c = creerControleurToit(o);
    expect(c.choisirForme('forme:croupes').fait).toBe(true);
    expect(o.batiment!.corpsToit).toHaveLength(2);
  });
});

describe('une seule portee (constat 7)', () => {
  it('l etat du controleur dit la portee que les gestes utilisent', () => {
    const o = composee(), c = creerControleurToit(o);
    for (const choix of [() => c.selectionner(null), () => c.selectionner({ type: 'corps', rang: 1, i: 0 }), () => { c.selectionner(null); c.regarder({ rang: 1, mur: 0 }); }]) {
      choix();
      const p = c.etat().portee, f0 = o.batiment!.corpsToit!.map((k) => k.faitage);
      expect(p).toEqual(porteeDuGeste(o.batiment!.corpsToit!, { selection: c.etat().selection, batimentEntier: false, facade: c.etat().facade }));
      c.reglerFaitage(1);
      const change = o.batiment!.corpsToit!.map((k, i) => Math.abs(k.faitage - (f0[i] as number)) > 1e-9);
      expect(change.map((x, i) => (x ? i : -1)).filter((i) => i >= 0)).toEqual([p.rang]);
      c.defaire();
    }
  });
});

describe('les singletons sont une instance', () => {
  it('deux controleurs sur deux batiments ne se voient pas', () => {
    const a = lue(), b = lue();
    const ca = creerControleurToit(a, 'ajouter'), cb = creerControleurToit(b);
    expect(ca.etat().intention).toBe('ajouter');
    expect(cb.etat().intention).toBe('modifier');
    cb.reglerFaitage(1);
    expect(ca.etat().peutDefaire).toBe(false);
    expect(JSON.stringify(a)).toBe(JSON.stringify(lue()));
  });
});

