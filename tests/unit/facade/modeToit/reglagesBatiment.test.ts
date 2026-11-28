import { describe, it, expect, vi } from 'vitest';
import { creerControleurToit, type ControleurToit, type Issue } from '../../../../src/facade/modeToit/controleurToit.js';
import { corpsDepuisExemple } from '../../../../src/facade/modeToit/gestes.js';
import { EXEMPLES_TOITS } from '../../../../src/facade/modeToit/exemplesToits.js';
import { couvertureDuBatiment, egoutDuBatiment, lieuDuProjet, sourcesDuToit } from '../../../../src/facade/modeToit/reglagesBatiment.js';
import { validerLaSession } from '../../../../src/app/toits/modeToit.js';
import type { ObjetPlan, PtBrut, ToitMesure, VolumeToit } from '../../../../src/model/types.js';

// Les reglages du batiment que l'atelier du toit a repris a l'inspecteur (« Go déplace », 28 novembre 2026) : la source du toit, la
// hauteur a l'egout et « Rendre au calcul », la couverture. Chacun est une intention du controleur : une transaction, une entree de pile,
// Defaire la rend au bit pres ; aucun ne fige le toit, et chacun garde la marque que l'inspecteur posait.

const RECT: PtBrut[] = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
const mesure: ToitMesure = { pas: 0.5, x0: -0.5, y0: 8.5, nx: 3, ny: 2, z: [6, null, 7, 6.5, 6, 6], egout: 5, faite: 8, source: 'lidar' };
const volumes: VolumeToit[] = [
  { pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }], toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 90 }, egout: 6 },
  { pts: [{ x: 8, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 8, y: 8 }], toit: { forme: 'appentis', hauteur: 1, angleFaitage: 90 } }
];

/** Une maison de la BD TOPO, lue au LiDAR (corps, mesure, volumes, version de lecture), sa couleur lue sur l'orthophoto. */
const maison = (plus: Record<string, unknown> = {}): ObjetPlan => ({
  key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', pts: RECT.map((p) => ({ ...p })), elevation: 5, bdtopo: { id: 'B1', materiauxToiture: '2' },
  batiment: {
    toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar', couleur: '#884433', origineCouleur: 'orthophoto' },
    corpsToit: corpsDepuisExemple(EXEMPLES_TOITS.find((x) => x.id === 'deux-pans')!, RECT, 5, 3), toitMesure: structuredClone(mesure), volumesToit: structuredClone(volumes),
    toitLidarLu: 7, ...plus
  }
}) as unknown as ObjetPlan;
/** Le meme batiment avec un seul toit (ce que la 3D dessine) : la couleur s'y regle. */
const unSeulToit = (plus: Record<string, unknown> = {}): ObjetPlan => maison({ modeToit: 'simple', ...plus });

/** Joue un geste et verifie l'invariant de toute intention : une transaction, une entree de pile, Defaire la rend au bit pres. */
function uneEntree(o: ObjetPlan, c: ControleurToit, geste: (c: ControleurToit) => Issue): void {
  const avant = JSON.stringify(o), pos = c.position();
  expect(geste(c).fait).toBe(true);
  expect(c.position()).toBe(pos + 1);
  expect(JSON.stringify(o)).not.toBe(avant);
  // Ni la marque des formes : ce reglage n'est pas une forme.
  expect(o.batiment?.toitFige).toBeUndefined();
  expect(c.defaire().fait).toBe(true);
  expect(JSON.stringify(o)).toBe(avant);
  expect(c.etat().peutDefaire).toBe(pos > 0);
}

describe('chaque reglage du batiment : une transaction, une entree de pile, Defaire au bit pres, sans figer', () => {
  const cas: [string, () => ObjetPlan, (c: ControleurToit) => Issue][] = [
    ['la source du toit', maison, (c) => c.choisirSource('mesure')],
    ['la hauteur a l egout saisie', maison, (c) => c.reglerEgout(5.42)],
    ['la hauteur a l egout d un pas', maison, (c) => c.egoutDUnPas(-1)],
    ['rendre la hauteur au calcul', () => maison({ egoutChoisi: 'saisie' }), (c) => c.rendreEgout()],
    ['la couleur de la couverture', unSeulToit, (c) => c.choisirCouleur('#336699')],
    ['le materiau de la couverture', maison, (c) => c.choisirMateriau('zinc')],
    ['le motif de pose', () => maison({ toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar', couverture: 'ardoise' } }), (c) => c.choisirPose('losange')]
  ];
  for (const [nom, fabrique, geste] of cas) {
    it(nom, () => {
      const o = fabrique(), c = creerControleurToit(o);
      uneEntree(o, c, geste);
      // Refait, puis quitte sans garder : le depart revient au bit pres.
      const depart = JSON.stringify(fabrique());
      geste(c);
      c.quitterSansGarder();
      expect(JSON.stringify(o)).toBe(depart);
    });
  }

  it('un reglage qui ne change rien n ecrit rien et n empile rien', () => {
    const o = maison(), c = creerControleurToit(o), avant = JSON.stringify(o);
    expect(c.choisirMateriau('').fait).toBe(false);
    expect(c.choisirSource('corps').fait).toBe(false);
    expect(c.choisirPose('droite').fait).toBe(false);
    expect(JSON.stringify(o)).toBe(avant);
    expect(c.etat().peutDefaire).toBe(false);
  });

  it('« Ajouter » ne touche rien d existant : les reglages du batiment y sont refuses, et le disent', () => {
    const o = maison(), c = creerControleurToit(o, 'ajouter'), avant = JSON.stringify(o);
    for (const g of [(k: ControleurToit) => k.choisirSource('mesure'), (k: ControleurToit) => k.reglerEgout(6), (k: ControleurToit) => k.choisirMateriau('zinc')]) {
      const issue = g(c);
      expect(issue.fait).toBe(false);
      expect(issue.raison).toMatch(/Modifier/);
    }
    expect(c.raisonDuGeste('egout')).toMatch(/Modifier/);
    expect(JSON.stringify(o)).toBe(avant);
  });

  it('Valider : une seule etape d historique du projet, qui garde le depart entier', () => {
    const o = unSeulToit({ egoutChoisi: 'saisie' }), avant = JSON.stringify(o), vus: string[] = [];
    const c = creerControleurToit(o);
    c.reglerEgout(6.1); c.choisirCouleur('#112233'); c.choisirMateriau('ardoise'); c.choisirPose('ecaille'); c.choisirSource('mesure');
    const a = { pushHistory: vi.fn((x?: unknown) => { vus.push(JSON.stringify(x)); }), markDirty: vi.fn() };
    expect(validerLaSession(a, o, { ctl: c })).toBe(true);
    expect(vus).toEqual([avant]);
    expect(a.markDirty).toHaveBeenCalledTimes(1);
    expect(o.elevation).toBe(6.1);
    expect(o.batiment?.toit).toMatchObject({ couleur: '#112233', couverture: 'ardoise', pose: 'ecaille' });
    expect(o.batiment?.modeToit).toBe('mesure');
    expect(o.batiment?.toitFige).toBeUndefined();
  });
});

describe('la source du toit', () => {
  it('propose les lectures que le batiment porte, et rien sans mesure ni volumes', () => {
    expect(sourcesDuToit(maison())?.options.map((x) => x.valeur)).toEqual(['corps', 'mesure', 'volumes', 'simple']);
    expect(sourcesDuToit(maison())?.enPlace).toBe('corps');
    expect(sourcesDuToit(maison({ corpsToit: null, volumesToit: null }))?.options.map((x) => x.valeur)).toEqual(['mesure', 'simple']);
    const sans = maison({ toitMesure: null, volumesToit: null });
    expect(sourcesDuToit(sans)).toBeNull();
    const c = creerControleurToit(sans);
    expect(c.raisonDuGeste('source')).toMatch(/rien à choisir/);
    expect(c.choisirSource('simple').fait).toBe(false);
  });

  it('refuse une lecture que le batiment n a pas', () => {
    const o = maison({ corpsToit: null }), c = creerControleurToit(o);
    expect(c.choisirSource('corps').raison).toMatch(/n’existe pas/);
    expect(c.etat().peutDefaire).toBe(false);
  });
});

describe('la hauteur a l egout', () => {
  it('saisie, elle est choisie : aucune lecture ne la reecrit ; l etat dit d ou elle vient', () => {
    const o = maison(), c = creerControleurToit(o);
    expect(c.etat().batiment.egout).toMatchObject({ hauteur: 5, origine: 'lue sur le LiDAR HD de l’IGN', choisie: null, rendable: false });
    c.reglerEgout(5.4);
    expect(o.elevation).toBe(5.4);
    expect(o.batiment?.egoutChoisi).toBe('saisie');
    expect(c.etat().batiment.egout).toMatchObject({ hauteur: 5.4, origine: 'saisie', choisie: 'saisie', rendable: true });
    // Un pas : au centimetre, jamais sous zero.
    c.egoutDUnPas(1);
    expect(o.elevation).toBe(5.5);
    expect(c.reglerEgout(-3).fait).toBe(true);
    expect(o.elevation).toBe(0);
    expect(c.reglerEgout(Number.NaN).raison).toMatch(/mètres/);
  });

  it('validee par l audit, elle se dit et se rend au calcul', () => {
    expect(egoutDuBatiment(maison({ egoutChoisi: 'audit' }))).toMatchObject({ origine: 'validée par l’audit', choisie: 'audit', rendable: true });
  });

  it('rendue au calcul : la marque tombe, le toit redevient a lire, et la validation le fait relire', () => {
    const o = maison({ egoutChoisi: 'saisie' }), c = creerControleurToit(o);
    expect(c.rendreEgout().fait).toBe(true);
    expect(o.batiment?.egoutChoisi).toBeUndefined();
    expect(o.batiment?.toitLidarLu).toBeNull();
    expect(o.elevation).toBe(5);
    expect(c.valider().relire).toBe(true);
  });

  it('ne se rend pas quand aucune lecture ne pourrait la reprendre : pas de marque, toit fige, batiment dessine', () => {
    for (const o of [maison(), maison({ egoutChoisi: 'saisie', toitFige: true }), { ...maison({ egoutChoisi: 'saisie', toitLidarLu: null }), bdtopo: undefined } as ObjetPlan]) {
      const c = creerControleurToit(o);
      expect(c.raisonDuGeste('rendreEgout')).toMatch(/aucune lecture/);
      expect(c.rendreEgout().fait).toBe(false);
    }
  });

  it('une source ou une couleur choisie sur un toit deja lu ne relance pas la lecture', () => {
    const o = unSeulToit(), c = creerControleurToit(o);
    c.choisirCouleur('#445566');
    expect(c.valider()).toMatchObject({ change: true, relire: false });
  });
});

describe('la couverture', () => {
  it('la couleur, sur le toit unique seulement : choisie, elle perd son origine (plus rien ne la recalcule)', () => {
    expect(couvertureDuBatiment(maison())?.couleur).toBeNull();
    const o = unSeulToit(), c = creerControleurToit(o);
    expect(c.etat().batiment.couverture?.couleur).toEqual({ valeur: '#884433', note: 'lue sur l’orthophoto' });
    c.choisirCouleur('#336699');
    expect(o.batiment?.toit?.couleur).toBe('#336699');
    expect(o.batiment?.toit?.origineCouleur).toBeUndefined();
    expect(c.choisirCouleur('rouge').raison).toMatch(/palette/);
  });

  it('le materiau annonce celui que Plan deduit, se choisit, puis revient a l automatique', () => {
    const o = maison(), c = creerControleurToit(o);
    const m = () => c.etat().batiment.couverture!.materiau!;
    expect(m().enPlace).toBe('');
    expect(m().options[0]).toEqual({ valeur: '', libelle: 'Automatique (ardoise)' });
    expect(m().options.map((x) => x.valeur)).toEqual(['', 'tuile', 'tuile-plate', 'tuile-canal', 'ardoise', 'zinc', 'bac-acier', 'membrane', 'vegetale']);
    c.choisirMateriau('zinc');
    expect(o.batiment?.toit?.couverture).toBe('zinc');
    expect(m().options[0]!.libelle).toBe('Automatique (ardoise)');
    c.choisirMateriau('');
    expect(o.batiment?.toit && 'couverture' in o.batiment.toit).toBe(false);
  });

  it('une couverture hors du catalogue se montre telle quelle et reste tant qu on ne la remplace pas', () => {
    const o = maison({ toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar', couverture: 'lauze-solaire' } }), c = creerControleurToit(o);
    expect(c.etat().batiment.couverture?.materiau?.options.at(-1)).toEqual({ valeur: 'lauze-solaire', libelle: 'Couverture inconnue (« lauze-solaire »), dessinée en tuile' });
    expect(c.choisirMateriau('lauze-solaire').fait).toBe(false);
    c.choisirMateriau('ardoise');
    expect(o.batiment?.toit?.couverture).toBe('ardoise');
  });

  it('la pose ne se propose que si le materiau en admet plus d une ; celle qui ne se dessine plus tombe avec le materiau', () => {
    expect(couvertureDuBatiment(maison({ toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, couverture: 'zinc' } }))?.pose).toBeNull();
    const o = maison({ toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 0, source: 'lidar', couverture: 'ardoise' } }), c = creerControleurToit(o);
    expect(c.etat().batiment.couverture?.pose?.options.map((x) => x.valeur)).toEqual(['droite', 'losange', 'ecaille']);
    c.choisirPose('losange');
    expect(o.batiment?.toit?.pose).toBe('losange');
    c.choisirMateriau('zinc');
    expect(o.batiment?.toit?.pose).toBeUndefined();
    expect(c.choisirPose('ecaille').raison).toMatch(/ne se pose pas/);
  });

  it('un toit plat simple est un toit-terrasse : ni materiau ni pose', () => {
    const c = couvertureDuBatiment(unSeulToit({ toit: { forme: 'plat', hauteur: 0, angleFaitage: 0 } }));
    expect(c?.materiau).toBeNull();
    expect(c?.pose).toBeNull();
    expect(couvertureDuBatiment(maison({ toit: null }))).toBeNull();
  });

  it('le materiau deduit lit la latitude de la parcelle du projet', () => {
    const parcelle = { key: 'parcelle', fonction: 'terrain', cadastre: { origineLat: 43.9 } } as unknown as ObjetPlan;
    expect(lieuDuProjet([parcelle, maison()])).toEqual({ latitude: 43.9 });
    expect(lieuDuProjet([maison()])).toEqual({ latitude: null });
  });
});
