import { describe, it, expect } from 'vitest';
import { defaultConstruction, ensureConstruction } from '../../../src/engine/construction.js';
import { porteeVisM, porteeAppuiM, maxEntraxeLameCm, optimiserParametres } from '../../../src/engine/structure.js';
import { achatVis, achatPlots, computeAssise, parseLongueurs } from '../../../src/engine/bom.js';
import { optimiserDebitLames } from '../../../src/engine/debit.js';
import {
  ombreInstantanee, geometrieOmbre, hauteurParasolDe, PARASOL_ELEV_MIN_DEG,
  calculerCartesOmbre, chercherMeilleurePositionParasol
} from '../../../src/engine/parasol.js';

const carre = (cote: number) => [
  { x: 0, y: 0 },
  { x: cote, y: 0 },
  { x: cote, y: cote },
  { x: 0, y: cote }
];

describe('construction', () => {
  it('remplit les valeurs par defaut sur un objet qui n en a pas', () => {
    const obj = { key: 't', type: 'polygon', pts: carre(4) } as never;
    const c = ensureConstruction(obj);
    expect(c.typePose).toBe('vis-fondation');
    expect((obj as { construction?: unknown }).construction).toBe(c);
  });

  it('mute son argument - comportement conserve tel quel a la migration', () => {
    // La spec §4 (phase 3) demande explicitement de garder cette mutation : des appelants
    // comptent dessus pour que l'objet du plan porte sa construction apres coup.
    const obj = { key: 't', pts: carre(3) } as never;
    expect((obj as { construction?: unknown }).construction).toBeUndefined();
    ensureConstruction(obj);
    expect((obj as { construction?: unknown }).construction).toBeDefined();
  });

  it('complete les champs manquants sans ecraser ceux qui existent', () => {
    const obj = { key: 't', pts: carre(3), construction: { typePose: 'plots', hauteurVis: 77 } } as never;
    const c = ensureConstruction(obj);
    expect(c.typePose).toBe('plots');
    expect(c.hauteurVis).toBe(77);
    expect(c.depassementVis).toBe(0);
    expect(c.avecLameRive).toBe(false);
  });

  it('donne une construction complete et independante a chaque appel', () => {
    const a = defaultConstruction();
    const b = defaultConstruction();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('portees admissibles', () => {
  const base = () => defaultConstruction();

  it('augmente avec la hauteur de section', () => {
    // portee = K * h * (b/entraxe)^(1/3) : a entraxe egal, une 45x95 porte plus loin qu une 45x70.
    const p70 = porteeVisM({ ...base(), soliveSection: '45x70' });
    const p95 = porteeVisM({ ...base(), soliveSection: '45x95' });
    const p175 = porteeVisM({ ...base(), soliveSection: '63x175' });
    expect(p95).toBeGreaterThan(p70);
    expect(p175).toBeGreaterThan(p95);
  });

  it('diminue quand l entraxe augmente', () => {
    const serre = porteeVisM({ ...base(), soliveEntraxe: 30 });
    const large = porteeVisM({ ...base(), soliveEntraxe: 60 });
    expect(serre).toBeGreaterThan(large);
  });

  it('diminue quand la charge augmente, a la racine cubique du rapport', () => {
    const normale = porteeVisM({ ...base(), chargeNormale: 250 });
    const double = porteeVisM({ ...base(), chargeNormale: 500 });
    expect(double).toBeLessThan(normale);
    expect(double / normale).toBeCloseTo(Math.cbrt(0.5), 3);
  });

  it('plafonne l entraxe des appuis au maximum du DTU en pose sur plots', () => {
    // NF DTU 51.4 : 70 cm entre appuis sous lambourdes.
    expect(porteeAppuiM({ ...base(), typePose: 'plots' })).toBeLessThanOrEqual(0.7 + 1e-9);
  });

  it('rend un entraxe de lame plus serre pour une lame plus fine', () => {
    const fine = maxEntraxeLameCm({ ...base(), epaisseurLame: 19 });
    const epaisse = maxEntraxeLameCm({ ...base(), epaisseurLame: 27 });
    expect(epaisse).toBeGreaterThan(fine);
  });
});

describe('achats et assise', () => {
  it('arrondit les vis a la boite entiere', () => {
    const a = achatVis({ ...defaultConstruction(), visParBoite: 50 }, 37);
    expect(a.boites).toBe(1);
    expect(a.unites).toBe(50);
    const b = achatVis({ ...defaultConstruction(), visParBoite: 50 }, 51);
    expect(b.boites).toBe(2);
    expect(b.unites).toBe(100);
  });

  it('facture les plots a l unite, sans conditionnement', () => {
    const p = achatPlots({ ...defaultConstruction(), typePose: 'plots', hauteurPlot: 8 }, 37);
    expect(p.unites).toBe(37);
    expect(p.cout).toBeGreaterThan(0);
  });

  it('dimensionne l assise sous plots au minimum reglementaire', () => {
    // 300 cm2 par appui, NF DTU 51.4 / 43.1.
    const a = computeAssise({ ...defaultConstruction(), typePose: 'plots', supportType: 'plots-beton' }, 20, 40);
    expect(a).toBeTruthy();
  });
});

describe('parseLongueurs', () => {
  it('lit une saisie libre, trie du plus long au plus court et deduplique', () => {
    expect(parseLongueurs('3; 2,5 2.5 4', [5])).toEqual([4, 3, 2.5]);
  });
  it('retombe sur les longueurs par defaut quand rien n est exploitable', () => {
    expect(parseLongueurs('', [5, 4])).toEqual([5, 4]);
    expect(parseLongueurs('abc', [5, 4])).toEqual([5, 4]);
  });
  it('ignore les longueurs absurdes', () => {
    expect(parseLongueurs('0.1 3', [5])).toEqual([3]);
  });
});

describe('optimiserDebitLames', () => {
  it('couvre exactement une longueur qui tombe juste', () => {
    const d = optimiserDebitLames([3, 3], [3], 0.5, 0.5, true);
    expect(d.achats).toEqual({ '3': 2 });
    expect(d.achatMl).toBeCloseTo(6, 9);
    expect(d.perdueMl).toBeCloseTo(0, 9);
  });

  it('reutilise une chute assez longue plutot que d acheter une barre de plus', () => {
    // Deux pieces de 2 m dans des barres de 4 m : une seule barre suffit.
    const d = optimiserDebitLames([2, 2], [4], 0.5, 0.5, true);
    expect(d.achats).toEqual({ '4': 1 });
    expect(d.perdueMl).toBeCloseTo(0, 9);
  });

  it('jette la chute trop courte pour etre reutilisee', () => {
    // 4 m moins 2,6 m laisse 1,4 m : sous le seuil de reutilisation de 1,5 m, donc perdu.
    const d = optimiserDebitLames([2.6], [4], 1.5, 0.5, true);
    expect(d.perdueMl).toBeCloseTo(1.4, 9);
    expect(d.restantMl).toBe(0);
  });
});

describe('ombre des parasols', () => {
  const parasol = { center: { x: 0, y: 0 }, r: 1.5, fonction: 'parasol' } as never;
  const ctx = { dateStr: '2026-06-21', minutes: 900, lieu: { latitude: 48.9052, longitude: 2.1328 } };

  it('projette l ombre a l oppose du soleil', () => {
    // 15h au solstice : le soleil est a l ouest, donc l ombre part vers l est.
    const g = ombreInstantanee(parasol, ctx);
    expect(g).not.toBeNull();
    expect(g!.cx).toBeGreaterThan(0);
  });

  it('allonge l ombre quand le soleil descend', () => {
    const midi = ombreInstantanee(parasol, { ...ctx, minutes: 720 })!;
    const soir = ombreInstantanee(parasol, { ...ctx, minutes: 1140 })!;
    const dMidi = Math.hypot(midi.cx, midi.cy);
    const dSoir = Math.hypot(soir.cx, soir.cy);
    expect(dSoir).toBeGreaterThan(dMidi);
  });

  it('ne dessine plus rien sous la hauteur de soleil minimale', () => {
    // A 22h le soleil est couche : l ombre s etirerait a l infini.
    expect(ombreInstantanee(parasol, { ...ctx, minutes: 1320 })).toBeNull();
    expect(PARASOL_ELEV_MIN_DEG).toBe(8);
  });

  it('decale l ombre proportionnellement a la hauteur du mat', () => {
    const bas = { ...(parasol as object), hauteurParasol: 2 } as never;
    const haut = { ...(parasol as object), hauteurParasol: 4 } as never;
    expect(hauteurParasolDe(haut)).toBeGreaterThan(hauteurParasolDe(bas));
    const ech = { ux: 1, uy: 0, decalageParMetre: 1, etirement: 1 };
    expect(geometrieOmbre(haut, ech).cx).toBeGreaterThan(geometrieOmbre(bas, ech).cx);
  });
});

describe('optimiserParametres', () => {
  it('classe les configurations de la moins chere a la plus chere', () => {
    const obj = { key: 't', type: 'polygon', pts: carre(4) } as never;
    ensureConstruction(obj);
    const res = optimiserParametres(obj, [obj]);
    expect(res.length).toBeGreaterThan(1);
    const couts = res.map((r: { cout: number }) => r.cout);
    expect([...couts].sort((a, b) => a - b)).toEqual(couts);
  });
});

describe('cartes d ombre et recherche de position', () => {
  // Une terrasse de 6 x 4 m avec un parasol pose dessus : de quoi exercer les deux fonctions
  // couteuses (echantillonnage sur la saison, quadrillage de la terrasse).
  const terrasse = {
    key: 'terr', fonction: 'terrasse', type: 'polygon',
    pts: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 4 }, { x: 0, y: 4 }]
  };
  const parasol = {
    key: 'par', fonction: 'parasol', type: 'circle',
    center: { x: 3, y: 2 }, r: 1.5, terrasseLieeKey: 'terr'
  };
  const ctx = { dateStr: '2026-06-21', minutes: 900, lieu: { latitude: 48.9052, longitude: 2.1328 } };

  it('calcule une carte d ombre par terrasse portant un parasol', () => {
    const cartes = calculerCartesOmbre(ctx, [terrasse, parasol] as never[]);
    expect(cartes.length).toBe(1);
    expect(cartes[0]!.terrKey).toBe('terr');
    expect(cartes[0]!.cells.length).toBeGreaterThan(0);
    // Chaque cellule porte la fraction d'echantillons ou elle est a l'ombre : entre 0 et 1.
    for (const c of cartes[0]!.cells) {
      expect(c.frac).toBeGreaterThanOrEqual(0);
      expect(c.frac).toBeLessThanOrEqual(1);
    }
  });

  it('ne rend aucune carte quand aucun parasol n est pose', () => {
    expect(calculerCartesOmbre(ctx, [terrasse] as never[])).toEqual([]);
  });

  it('ignore un parasol masque', () => {
    const masque = { ...parasol, hidden: true };
    expect(calculerCartesOmbre(ctx, [terrasse, masque] as never[])).toEqual([]);
  });

  it('propose une position sur la terrasse, avec une couverture mesuree', () => {
    const res = chercherMeilleurePositionParasol(parasol as never, ctx, [terrasse, parasol] as never[]);
    expect(res).not.toBeNull();
    expect(res!.x).toBeGreaterThanOrEqual(0);
    expect(res!.x).toBeLessThanOrEqual(6);
    expect(res!.y).toBeGreaterThanOrEqual(0);
    expect(res!.y).toBeLessThanOrEqual(4);
    expect(res!.couverture).toBeGreaterThan(0);
  });

  it('ne propose rien pour un parasol qui n est sur aucune terrasse', () => {
    const perdu = { ...parasol, center: { x: 100, y: 100 }, terrasseLieeKey: null as string | null };
    expect(chercherMeilleurePositionParasol(perdu as never, ctx, [perdu] as never[])).toBeNull();
  });
});
