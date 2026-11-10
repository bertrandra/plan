import { describe, it, expect, beforeAll, beforeEach, vi } from 'vitest';
import * as THREE_NS from 'three';
import { soleilDuProjet } from '../../../src/core/soleil.js';
import { aujourdhui, soleilParDefaut, soleilEnregistre, MINUTES_PAR_DEFAUT, FENETRE_CARTE_OMBRE } from '../../../src/model/soleilProjet.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects as normaliserBruts } from '../../../src/model/normalisation.js';
import { ombreInstantanee } from '../../../src/engine/parasol.js';
import { reglerSoleil } from '../../../src/three/lumiere.js';
import { creerInspecteur, type ContexteInspecteur } from '../../../src/app/inspecteur.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetBrut, ObjetPlan } from '../../../src/model/types.js';

// Le soleil du projet (MD/spec-ouvrages.md, etape 6.7) : un seul pour le plan, la Vue 3D et la visionneuse,
// enregistre sur la parcelle une fois choisi, relu a l'ouverture ; un ancien fichier prend celui du jour.

/** Les objets tels que le plan les tient apres l'ouverture d'un fichier. */
const normalizeObjects = (bruts: ObjetBrut[]): ObjetPlan[] => normaliserBruts(bruts) as unknown as ObjetPlan[];

beforeAll(() => { Object.assign(globalThis, { THREE: THREE_NS }); });
beforeEach(() => { soleilDuProjet.restaurer([]); });

const parcelleBrute = (plus: object = {}) => ({
  key: 'parcelle', type: 'polygon', name: 'Parcelle', fonction: 'parcelle',
  pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }], latitude: 48.89, longitude: 2.16, ...plus
}) as unknown as ObjetBrut;

describe('le soleil par defaut', () => {
  it('est aujourd hui en date locale, a 15 h', () => {
    // 1 h 30 du matin le 2 juillet, heure locale : la date UTC aurait pu dire la veille.
    const nuit = new Date(2026, 6, 2, 1, 30);
    expect(aujourdhui(nuit)).toBe('2026-07-02');
    expect(soleilParDefaut(nuit)).toEqual({ dateStr: '2026-07-02', minutes: MINUTES_PAR_DEFAUT });
    expect(MINUTES_PAR_DEFAUT).toBe(900);
  });

  it('un ancien fichier, sans soleil, prend celui du jour et ne s ecrit pas', () => {
    const objets = normalizeObjects([parcelleBrute()]);
    soleilDuProjet.restaurer(objets, new Date(2026, 9, 28, 10, 0));
    expect(soleilDuProjet.lire()).toEqual({ dateStr: '2026-10-28', minutes: 900 });
    expect(soleilDuProjet.choisi()).toBe(false);
    soleilDuProjet.ranger(objets);
    expect('soleil' in (serializeObjects(objets)[0] as object)).toBe(false);
  });

  it('un soleil abime dans le fichier retombe sur le defaut', () => {
    expect(soleilEnregistre({ dateStr: '2026-13-40', minutes: 600 })).toBeNull();
    expect(soleilEnregistre({ dateStr: '2026-06-21', minutes: 'midi' })).toBeNull();
    expect(soleilEnregistre({ dateStr: '2026-06-21', minutes: 5000 })).toEqual({ dateStr: '2026-06-21', minutes: 1439 });
    const objets = normalizeObjects([parcelleBrute({ soleil: { dateStr: 'hier', minutes: 3 } })]);
    expect((objets[0] as ObjetPlan).soleil).toBeUndefined();
  });
});

describe('enregistre avec le projet', () => {
  it('fait l aller-retour : reglé, rangé sur la parcelle, sérialisé, relu', () => {
    const objets = normalizeObjects([parcelleBrute()]);
    soleilDuProjet.restaurer(objets);
    expect(soleilDuProjet.regler({ dateStr: '2026-08-15', minutes: 17 * 60 + 30 })).toBe(true);
    soleilDuProjet.ranger(objets);
    const fichier = JSON.parse(JSON.stringify(serializeObjects(objets))) as ObjetBrut[];
    expect((fichier[0] as unknown as { soleil: unknown }).soleil).toEqual({ dateStr: '2026-08-15', minutes: 1050 });
    // Un autre projet, puis la reouverture du premier.
    soleilDuProjet.restaurer([]);
    expect(soleilDuProjet.lire().dateStr).not.toBe('2026-08-15');
    soleilDuProjet.restaurer(normalizeObjects(fichier));
    expect(soleilDuProjet.lire()).toEqual({ dateStr: '2026-08-15', minutes: 1050 });
    expect(soleilDuProjet.choisi()).toBe(true);
  });

  it('une annulation ne ramene pas le soleil : il est range de nouveau tel qu il est a l ecran', () => {
    const objets = normalizeObjects([parcelleBrute({ soleil: { dateStr: '2026-06-21', minutes: 600 } })]);
    soleilDuProjet.restaurer(objets);
    soleilDuProjet.regler({ minutes: 1000 });
    // L'instantane restaure porte le soleil d'avant.
    const restaures = normalizeObjects([parcelleBrute({ soleil: { dateStr: '2026-06-21', minutes: 600 } })]);
    soleilDuProjet.ranger(restaures);
    expect(restaures[0]!.soleil).toEqual({ dateStr: '2026-06-21', minutes: 1000 });
  });

  it('ignore une date illisible et ramene l heure dans la journee', () => {
    soleilDuProjet.regler({ dateStr: '2026-06-21', minutes: 600 });
    expect(soleilDuProjet.regler({ dateStr: '' })).toBe(false);
    expect(soleilDuProjet.regler({ minutes: Number.NaN })).toBe(false);
    soleilDuProjet.regler({ minutes: 2000 });
    expect(soleilDuProjet.lire()).toEqual({ dateStr: '2026-06-21', minutes: 1439 });
  });
});

describe('le plan et la 3D lisent le meme soleil', () => {
  it('un parasol a la meme ombre sur le plan que sous la lumiere de la Vue 3D', () => {
    soleilDuProjet.regler({ dateStr: '2026-07-14', minutes: 16 * 60 + 20 });
    const lieu = { latitude: 48.89, longitude: 2.16 };
    const parasol = normalizeObjects([{ key: 'p', type: 'circle', fonction: 'parasol', center: { x: 0, y: 0 }, r: 1.5, hauteurParasol: 2.5 } as unknown as ObjetBrut])[0] as ObjetPlan;
    // Le plan : le contexte du calque des parasols (app/assemblage/affichage.ts).
    const ombre = ombreInstantanee(parasol, { ...soleilDuProjet.lire(), lieu })!;
    // La 3D : la lampe du soleil, posee comme three/soleilVue3d.ts la pose (X a l'est, Y en haut, le nord vers -Z).
    const l = { dirLight: new THREE_NS.DirectionalLight(), dirFill: new THREE_NS.DirectionalLight(), hemiLight: new THREE_NS.HemisphereLight(), rayon: 10 };
    reglerSoleil(l, { ...soleilDuProjet.lire(), intensiteSoleil: 1, lumiereAppoint: true }, lieu);
    const p = l.dirLight.position, horiz = Math.hypot(p.x, p.z);
    // L'ombre part a l'oppose de la lampe : en plan (x a l'est, y au nord) = (-X, +Z) / horizontale.
    const ux3d = -p.x / horiz, uy3d = p.z / horiz;
    expect(ux3d).toBeCloseTo(ombre.ux, 9);
    expect(uy3d).toBeCloseTo(ombre.uy, 9);
    // Le decalage de l'ombre par metre de mat est 1/tan(hauteur) : la meme hauteur de soleil.
    const decalage = (ombre.cx - 0) / (2.5 * ombre.ux);
    expect(decalage).toBeCloseTo(horiz / p.y, 9);
  });
});

describe('les champs du soleil dans l inspecteur', () => {
  function monter(lectureSeule = false) {
    const parcelle = normalizeObjects([parcelleBrute()])[0] as ObjetPlan;
    const parasol = normalizeObjects([{ key: 'p', type: 'circle', fonction: 'parasol', center: { x: 5, y: 5 }, r: 1.5 } as unknown as ObjetBrut])[0] as ObjetPlan;
    const etat = { objects: [parcelle, parasol], selectedKey: 'p', lectureSeule, dirty: false, parasol: { ombreAffichee: true, carteAffichee: false } } as unknown as EtatApp;
    const pris = vi.fn(), markDirty = vi.fn(), render = vi.fn();
    const ctx = { preparerHistorique: () => { pris(); return () => {}; }, markDirty, render } as unknown as ContexteInspecteur;
    const inspecteur = creerInspecteur(etat, ctx, creerMagasin(etat), creerRegistre());
    const c = { etat, obj: parasol, objets: etat.objects, parcelle, commandeUtilisable: () => true } as unknown as ContexteChamps;
    const champs = sectionsObjet(c).flatMap((s) => s.champs);
    const champ = (cle: string) => champs.find((ch) => ch.cle === cle)!;
    return { inspecteur, c, champ, pris, markDirty };
  }

  it('l heure ne fait pas de pas d annulation, et marque le projet a enregistrer', () => {
    const m = monter();
    const heure = m.champ('ombreHeure');
    expect(heure.sale).toBe(false);
    expect(heure.enregistre).toBe(true);
    m.inspecteur.appliquer(heure, m.c, () => { if (heure.type === 'curseur') heure.ecrire(m.c, 1000); });
    expect(soleilDuProjet.lire().minutes).toBe(1000);
    expect(m.pris).not.toHaveBeenCalled();
    expect(m.markDirty).toHaveBeenCalledTimes(1);
  });

  it('la date se regle en lecture seule, sans marquer le projet', () => {
    const m = monter(true);
    const date = m.champ('ombreDate');
    expect(m.inspecteur.appliquer(date, m.c, () => { if (date.type === 'date') date.ecrire(m.c, '2026-02-02'); })).toBe(true);
    expect(soleilDuProjet.lire().dateStr).toBe('2026-02-02');
    expect(m.markDirty).not.toHaveBeenCalled();
  });

  it('la carte des heures d ombre dit sa fenetre a l ecran', () => {
    const m = monter();
    const carte = m.champ('carteAffichee');
    expect(carte.note?.(m.c)).toContain(FENETRE_CARTE_OMBRE.libelle);
    expect(FENETRE_CARTE_OMBRE.libelle).toBe('mai à septembre, 12 h – 18 h');
  });
});
