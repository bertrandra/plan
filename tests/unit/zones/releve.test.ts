import { describe, it, expect } from 'vitest';
import { coinsDePrise, consigneCoins, entreeRecherche, appliquerRecherche, arreterRecherche, capCorrige, appliquerDistorsion, appliquerResultat, focaleDePrise, focale35DePrise, estPartielle, type Morceau, type Resultat, type ResultatCoins } from '../../../src/zones/releve/serie.js';
import { modeleDistorsion, corrigerPoint } from '../../../src/facade/distorsion.js';
import { etirerEnHauteur, releveDuMur, calageDeSerie, pxParMDuCalage, textePrecision, avisFusion } from '../../../src/zones/releve/analyse.js';
import { coinsProposes } from '../../../src/facade/analyse.js';
import { etirerOuvertures, texteDetails, texteOrigine } from '../../../src/zones/releve/ouvertures.js';
import type { Prise } from '../../../src/zones/releve/capteurs.js';
import type { Facade } from '../../../src/facade/geometrie.js';
import type { OuvertureFacade, Toit } from '../../../src/model/types.js';

// Le releve de facade, decoupe en etapes (zones/releve/) : ses calculs se testent sans React ni camera.

const prise = (plus: Partial<Prise> = {}): Prise => ({
  photo: { image: { largeur: 4000, hauteur: 3000 } as Prise['photo']['image'], url: '', champ: null, focalePx: 3000 },
  mesure: null, reperes: null, champ: 70, photosPrevues: null, ...plus
});
const resultat: Resultat = { partieBasse: null, texture: 'data:', hauteurTexture: 5, hauteurMesuree: true, couverture: 1, toitPropose: null, avis: null };

describe('releve : la serie de photos', () => {
  it('propose quatre coins, ramenes dans la marge que le doigt peut saisir', () => {
    const c = coinsDePrise(prise({ mesure: { distance: 1, source: 'cadrage' } as Prise['mesure'] }), 12, 6, false);
    expect(c).toHaveLength(4);
    const m = 4000 * 0.2;
    for (const q of c) {
      expect(q.x).toBeGreaterThanOrEqual(-m); expect(q.x).toBeLessThanOrEqual(4000 + m);
      expect(q.y).toBeGreaterThanOrEqual(-m); expect(q.y).toBeLessThanOrEqual(3000 + m);
    }
  });

  it('fait l emporter les reperes poses sur la video pour les bords du mur', () => {
    const c = coinsDePrise(prise({ reperes: { a: 0.8, b: 0.2 } as Prise['reperes'] }), 8, 6, false);
    expect(c[0]?.x).toBe(800); expect(c[3]?.x).toBe(800);
    expect(c[1]?.x).toBe(3200); expect(c[2]?.x).toBe(3200);
  });

  it('sans attitude ni cap, propose les coins centres d avant ; l inclinaison et le cap les deplacent', () => {
    const mesure = { distance: 9, source: 'cadrage' } as Prise['mesure'];
    const centres = coinsDePrise(prise({ mesure }), 8, 5, false);
    coinsProposes(4000, 3000, 3000, 9, 8, 5).forEach((q, i) => {
      expect(centres[i]!.x).toBeCloseTo(q.x, 6);
      expect(centres[i]!.y).toBeCloseTo(q.y, 6);
    });
    // Telephone leve de 6 degres : le mur descend dans l'image.
    const leve = coinsDePrise(prise({ mesure, attitude: { inclinaisonDeg: 6, roulisDeg: 0 } }), 8, 5, false);
    expect(leve[0]!.y).toBeGreaterThan(centres[0]!.y + 200);
    // Le cap dit le biais : la facade regarde au sud, on vise le nord-nord-ouest, on est a droite.
    const biais = coinsDePrise(prise({ mesure, cap: 340 }), 8, 5, false, 180);
    expect(biais[3]!.y - biais[0]!.y).toBeLessThan(biais[2]!.y - biais[1]!.y);
    // Sans l'azimut de la facade, le cap ne sert pas.
    expect(coinsDePrise(prise({ mesure, cap: 340 }), 8, 5, false)).toEqual(centres);
  });

  it('dit la consigne selon la place de la photo dans la serie', () => {
    expect(consigneCoins(0, 1)).toMatch(/^Placez chaque rond/);
    expect(consigneCoins(0, 3)).toMatch(/^Photo 1 sur 3.*coin gauche du mur/);
    expect(consigneCoins(2, 3)).toMatch(/^Photo 3 sur 3.*coin droit du mur/);
    expect(consigneCoins(1, 3)).toMatch(/près du bord de la photo/);
  });
});

describe('releve : la precision des cotes', () => {
  const coins = [{ x: 1000, y: 500 }, { x: 3000, y: 500 }, { x: 3000, y: 1500 }, { x: 1000, y: 1500 }];
  it('lit les pixels par metre au mur par la focale et la distance, sinon par les coins', () => {
    const avecDistance = calageDeSerie([{ prise: prise({ mesure: { distance: 10, source: 'cadrage' } as Prise['mesure'] }), coins }], 8, 4);
    expect(avecDistance.photos[0]!.pxParMSource).toBe(300);
    expect(avecDistance.photos[0]!.coins).toEqual(coins);
    // 2 000 px pour 8 m, 1 000 px pour 4 m : 250 px/m.
    const parCoins = calageDeSerie([{ prise: prise(), coins }], 8, 4);
    expect(parCoins.photos[0]!.pxParMSource).toBe(250);
    // Plusieurs photos sans distance : chacune ne montre qu'un morceau, on ne sait pas.
    expect(calageDeSerie([{ prise: prise(), coins }, { prise: prise(), coins }], 8, 4).photos.map((p) => p.pxParMSource)).toEqual([null, null]);
    expect(pxParMDuCalage({ photos: [{ coins, pxParMSource: 80 }, { coins, pxParMSource: 40 }, { coins, pxParMSource: null }] })).toBe(40);
    expect(pxParMDuCalage(null)).toBeNull();
  });

  it('annonce la precision d un pixel de la source au mur', () => {
    expect(textePrecision(40)).toBe("Cotes précises à environ 2,5 cm : la photo ne voyait le mur qu'à 40 pixels par mètre.");
    expect(textePrecision(150)).toBe('Cotes précises au centimètre : la photo voyait le mur à 150 pixels par mètre.');
    expect(textePrecision(null)).toBeNull();
  });
});

describe('releve : corriger et ecrire', () => {
  it('etire en hauteur seulement : ouvertures, partie basse et toit du meme facteur, au centimetre', () => {
    const ouvertures = [{ type: 'fenetre', x: 1, y: 1, l: 1.2, h: 1.25 }] as OuvertureFacade[];
    const toit = { forme: 'deuxPans', hauteur: 3 } as unknown as Toit;
    const e = etirerEnHauteur({ ...resultat, partieBasse: { debut: 0, fin: 2, hauteur: 2.5 } as unknown as Resultat['partieBasse'] }, ouvertures, toit, 1.2);
    expect(e.resultat.hauteurTexture).toBeCloseTo(6);
    expect(e.resultat.partieBasse?.hauteur).toBe(3);
    expect(e.ouvertures[0]).toMatchObject({ x: 1, l: 1.2, y: 1.2, h: 1.5 });
    expect(e.toit?.hauteur).toBe(3.6);
    expect(etirerEnHauteur(resultat, [], null, 2).toit).toBeNull();
  });

  it('ecrit le releve d un mur, distance et source comprises', () => {
    const facade = { cote: 2, largeur: 8.004 } as Facade;
    const r = releveDuMur(facade, resultat, [], 6.1, { distance: 4.567, source: 'cadrage' } as Prise['mesure'] & object);
    expect(r).toMatchObject({ cote: 2, largeur: 8, hauteur: 6.1, distance: 4.57, sourceDistance: 'cadrage', hauteurTexture: 5, ouvertures: [] });
    expect(releveDuMur(facade, resultat, [], 6, null)).toMatchObject({ distance: null, sourceDistance: null });
    // Le calage ne s'ecrit que s'il y en a un : un releve sans lui garde exactement sa forme d'avant.
    expect(releveDuMur(facade, resultat, [], 6, null)).not.toHaveProperty('calage');
    const calage = { photos: [{ coins: [{ x: 1, y: 2 }], pxParMSource: 55 }] };
    expect(releveDuMur(facade, { ...resultat, calage }, [], 6, null).calage).toEqual(calage);
  });
});

describe('releve : le calage fin des coins (lot L7)', () => {
  const coins = [{ x: 1000, y: 500 }, { x: 3000, y: 500 }, { x: 3000, y: 1500 }, { x: 1000, y: 1500 }];
  const trouve: ResultatCoins = {
    coins: [{ x: 1010, y: 490 }, { x: 2990, y: 510 }, { x: 3010, y: 1490 }, { x: -5000, y: 1510 }],
    sources: ['trouve', 'trouve', 'trouve', 'predit'],
    note: 0.82, trouve: true, inclinaisonDeg: 5, roulisDeg: 1, azimutDeg: 352, azimutCorrige: true, distance: 12, hauteur: 5.9,
    contour: { ecartM: -0.8, incertitudeM: 0.2, decale: true },
  };

  it('prepare la recherche d une photo entiere, pas d un morceau', () => {
    const p = prise({ mesure: { distance: 11, source: 'webxr' } as Prise['mesure'], cap: 350, attitude: { inclinaisonDeg: 6, roulisDeg: -1 } });
    const e = entreeRecherche(p, 10, 6, false, 180);
    expect(e?.prise).toMatchObject({ distance: 11, focalePx: 3000, inclinaisonDeg: 6, roulisDeg: -1, focaleEstimee: false, distanceEstimee: false });
    expect(e?.prise.biaisDeg).toBeCloseTo(10, 6);
    // Une mesure de realite augmentee est independante du plan : elle peut le contredire.
    expect(e?.distance?.valeur).toBe(11);
    expect(e?.distance?.precisionM).toBeCloseTo(0.38, 9);
    expect(entreeRecherche(p, 10, 6, true, 180)).toBeNull();
    // Les reperes tirent la distance de la largeur du plan : ils ne peuvent pas la contredire.
    const cadrage = entreeRecherche(prise({ mesure: { distance: 11, source: 'cadrage' } as Prise['mesure'] }), 10, 6, false);
    expect(cadrage?.distance).toBeNull();
    // Sans distance, elle est supposee d'apres le cadrage, et dite telle.
    const sans = entreeRecherche(prise({ photo: { image: { largeur: 4000, hauteur: 3000 } as Prise['photo']['image'], url: '', champ: null, focalePx: null } }), 10, 6, false);
    expect(sans?.prise.distanceEstimee).toBe(true);
    expect(sans?.prise.focaleEstimee).toBe(true);
  });

  it('remplace les coins proposes par les coins trouves, ramenes dans la marge, sauf apres un geste', () => {
    const m: Morceau = { prise: prise(), coins, sources: ['predit', 'predit', 'predit', 'predit'], recherche: true };
    const a = appliquerRecherche(m, trouve);
    expect(a.recherche).toBe(false);
    expect(a.sources).toEqual(['trouve', 'trouve', 'trouve', 'predit']);
    expect(a.coins[0]).toEqual({ x: 1010, y: 490 });
    expect(a.coins[3]!.x).toBe(-800);
    // Un coin deja deplace au doigt : la main l'emporte, rien n'est repris.
    const touche = appliquerRecherche({ ...m, sources: ['doigt', 'predit', 'predit', 'predit'] }, trouve);
    expect(touche.coins).toBe(coins);
    expect(touche.fin).toBe(trouve);
    // Rien de trouve : les coins predits restent.
    expect(appliquerRecherche(m, { ...trouve, trouve: false }).coins).toBe(coins);
    // L'analyse lancee pendant la recherche l'arrete : un resultat tardif ne change plus les coins.
    const arrete = arreterRecherche(m);
    expect(arrete.recherche).toBe(false);
    expect(appliquerRecherche(arrete, trouve)).toBe(arrete);
  });

  it('rend le cap lu sur la photo, et l ecrit avec les sources et la confiance dans le calage', () => {
    // Facade au sud (180) : un azimut de -8 degres dans le repere du mur, c'est un cap de 352.
    expect(capCorrige(trouve, 180)).toBe(352);
    expect(capCorrige({ ...trouve, azimutCorrige: false }, 180)).toBeNull();
    const m: Morceau = { prise: prise(), coins, sources: ['trouve', 'trouve', 'doigt', 'predit'], fin: trouve };
    const c = calageDeSerie([m], 8, 4, 180);
    expect(c.photos[0]!.sourceCoins).toEqual(['trouve', 'trouve', 'doigt', 'predit']);
    expect(c.confiance).toBe(0.82);
    expect(c.azimutCorrigeDeg).toBe(352);
    expect(c.contourDecaleM).toBe(-0.8);
    // Un releve d'avant le calage fin garde exactement son sens.
    expect(calageDeSerie([{ prise: prise(), coins }], 8, 4)).toEqual({ photos: [{ coins, pxParMSource: 250 }] });
  });
});

describe('releve : la distorsion du grand-angle (lot L8)', () => {
  const coins = [{ x: 1000, y: 500 }, { x: 3000, y: 500 }, { x: 3000, y: 1500 }, { x: 1000, y: 1500 }];
  // Ultra grand-angle : 108 degres sur le grand cote, soit 13 mm.
  const grandAngle = (plus: Partial<Prise> = {}) => prise({ photo: { image: { largeur: 4000, hauteur: 3000 } as Prise['photo']['image'], url: 'avant', champ: null, focalePx: null }, champ: 108, ...plus });
  const modele = modeleDistorsion(4000, 3000, -0.2);
  const corrigee = { image: { largeur: 4000, hauteur: 3000, donnees: new Uint8ClampedArray(0) }, modele };

  it('demande la correction sous 20 mm, meme pour un morceau d une serie, sans chercher ses coins', () => {
    expect(focale35DePrise(grandAngle())).toBeCloseTo(13.1, 1);
    expect(entreeRecherche(grandAngle(), 10, 6, false)).toMatchObject({ chercher: true });
    expect(entreeRecherche(grandAngle(), 10, 6, false)?.focale35).toBeCloseTo(13.1, 1);
    expect(entreeRecherche(grandAngle(), 10, 6, true)).toMatchObject({ chercher: false });
    // L'objectif principal : un morceau ne demande rien, comme avant.
    expect(focale35DePrise(prise())).toBeCloseTo(27, 6);
    expect(entreeRecherche(prise(), 10, 6, true)).toBeNull();
  });

  it('ramene les coins dans la photo corrigee et reduit la focale d autant', () => {
    const m: Morceau = { prise: grandAngle(), coins, recherche: true, decrochement: { cote: 'gauche', haut: { x: 0, y: 0 }, bas: { x: 10, y: 3000 } } };
    const f0 = focaleDePrise(m.prise);
    const a = appliquerDistorsion(m, corrigee, 'apres');
    expect(a.prise.photo.url).toBe('apres');
    expect(a.prise.photo.image).toBe(corrigee.image);
    expect(a.prise.photo.distorsion).toEqual({ k1: -0.2, echelle: 0.8 });
    expect(focaleDePrise(a.prise)).toBeCloseTo(f0 * 0.8, 9);
    a.coins.forEach((q, i) => expect(q).toEqual(corrigerPoint(coins[i]!, modele)));
    expect(a.decrochement?.haut.x).toBeCloseTo(0, 6);
    // Une focale donnee par la photo est reduite a la correction.
    const n = appliquerDistorsion({ ...m, prise: prise() }, corrigee, 'apres');
    expect(n.prise.photo.focalePx).toBeCloseTo(2400, 9);
    // Analyse deja partie : la photo d'origine reste.
    expect(appliquerDistorsion({ ...m, recherche: false }, corrigee, 'apres').prise.photo.url).toBe('avant');
  });

  it('garde la photo d origine et ses coins si la photo corrigee n a pas pu etre encodee', () => {
    const trouve: ResultatCoins = { coins: [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }, { x: 1, y: 2 }], sources: ['trouve', 'trouve', 'trouve', 'trouve'], note: 0.9, trouve: true, inclinaisonDeg: 0, roulisDeg: 0, azimutDeg: 0, azimutCorrige: false, distance: 5, hauteur: 6, contour: null };
    const m: Morceau = { prise: grandAngle(), coins, sources: ['predit', 'predit', 'predit', 'predit'], recherche: true };
    const sans = appliquerResultat(m, { distorsion: corrigee, coins: trouve }, null);
    expect(sans.recherche).toBe(false);
    expect(sans.prise.photo.url).toBe('avant');
    expect(sans.coins).toBe(coins);
    const avec = appliquerResultat(m, { distorsion: corrigee, coins: trouve }, 'apres');
    expect(avec.prise.photo.url).toBe('apres');
    expect(avec.coins[0]).toEqual({ x: 1, y: 1 });
    // Un morceau d'une serie : la photo corrigee seule, la recherche finie.
    const seule = appliquerResultat(m, { distorsion: corrigee, coins: null }, 'apres');
    expect(seule.recherche).toBe(false);
    expect(seule.coins[0]).toEqual(corrigerPoint(coins[0]!, modele));
  });
});

describe('releve : plusieurs vues du mur entier (lot L13)', () => {
  const coins = [{ x: 1000, y: 500 }, { x: 3000, y: 500 }, { x: 3000, y: 1500 }, { x: 1000, y: 1500 }];
  it('ne fait un morceau d une photo que pour des morceaux cote a cote', () => {
    expect(estPartielle('morceaux', null, 0)).toBe(false);
    expect(estPartielle('morceaux', 3, 0)).toBe(true);
    expect(estPartielle('morceaux', null, 1)).toBe(true);
    expect(estPartielle('vues', 3, 2)).toBe(false);
  });

  it('demande les quatre coins du mur entier sur chaque vue', () => {
    expect(consigneCoins(1, 3, 'vues')).toMatch(/^Vue 2 sur 3 : .*mur entier/);
    expect(consigneCoins(0, 1, 'vues')).toMatch(/^Placez chaque rond/);
    expect(consigneCoins(1, 3)).toMatch(/^Photo 2 sur 3/);
  });

  it('lit la resolution de chaque vue par ses coins, comme une photo seule', () => {
    const c = calageDeSerie([{ prise: prise(), coins }, { prise: prise(), coins }], 8, 4, null, 'vues');
    expect(c.photos.map((x) => x.pxParMSource)).toEqual([250, 250]);
  });

  it('dit ce que la fusion trouve a redire', () => {
    const vue = (fusionnee: boolean, motif: string | null = null) => ({ fusionnee, motif, dxM: 0, dyM: 0, inliers: 0, qualite: 80, occultee: 0, part: 0.5 });
    expect(avisFusion({ statut: 'fusionnee', masque: 0, vues: [vue(true), vue(true)] })).toBeNull();
    expect(avisFusion({ statut: 'partielle', masque: 0, vues: [vue(true), vue(true), vue(false, 'trop peu de points communs')] })).toMatch(/^La vue 3 n’est pas fusionnée : trop peu de points communs/);
    expect(avisFusion({ statut: 'fusionnee', masque: 0.05, vues: [vue(true), vue(true)] })).toMatch(/5 %\) reste cachée sur toutes les vues/);
    // Une seule photo n'a rien a fusionner : pas de reproche.
    expect(avisFusion({ statut: 'seule', masque: 0, vues: [vue(true)] })).toBeNull();
  });
});

// Le type Morceau reste importable par les etapes : la serie s'ecrit d'une seule facon.
const _morceau: Morceau = { prise: prise(), coins: [] };
void _morceau;

describe('releve : structure et corrections des ouvertures (lot L15)', () => {
  const facade = { cote: 2, largeur: 8 } as Facade;
  const f = (x: number, y: number): OuvertureFacade => ({ type: 'fenetre', x, y, l: 1.2, h: 1.35, source: 'detectee', confiance: 0.9 });

  it('ecrit la grille recalculee, la rangee et la travee de chaque ouverture, et les corrections', () => {
    const corrections = [{ geste: 'ajout' as const, type: 'fenetre' as const, x: 5, y: 3.8, l: 1.2, h: 1.35 }];
    const r = releveDuMur(facade, resultat, [f(1, 0.9), f(1, 3.8), f(5, 3.8)], 6, null, corrections);
    expect(r.grille?.niveaux).toHaveLength(2);
    expect(r.grille?.travees).toHaveLength(2);
    expect(r.ouvertures.map((o) => [o.niveau, o.travee])).toEqual([[0, 0], [1, 0], [1, 1]]);
    expect(r.corrections).toEqual(corrections);
  });

  it('n ecrit ni grille ni corrections sans ouverture ni geste : un releve garde sa forme d avant', () => {
    const r = releveDuMur(facade, resultat, [], 6, null);
    expect(r).not.toHaveProperty('grille');
    expect(r).not.toHaveProperty('corrections');
  });

  it('etire les ouvertures en hauteur', () => {
    expect(etirerOuvertures([f(1, 1)], 1.2)[0]).toMatchObject({ x: 1, y: 1.2, h: 1.62, l: 1.2 });
  });

  it('dit d ou vient une ouverture, et ses details, en clair', () => {
    expect(texteOrigine({ source: 'detectee', confiance: 0.82 })).toBe('Détectée sur la photo (confiance 82 %).');
    expect(texteOrigine({ source: 'devinee', confiance: 0.55 })).toContain('Devinée par la grille');
    expect(texteOrigine({ source: 'corrigee' })).toBe('Corrigée par vous.');
    expect(texteOrigine({})).toBe('Posée à la main.');
    expect(texteDetails(undefined)).toBeNull();
    expect(texteDetails({})).toBeNull();
    expect(texteDetails({ volets: 'battants', allege: 'balcon' })).toBe('Volets battants, balcon.');
    expect(texteDetails({ volets: 'persiennes', ferme: true, forme: 'cintre' })).toBe('Persiennes fermées, haut cintré.');
    expect(texteDetails({ volets: 'roulant' })).toBe('Volet roulant (coffre retiré de la hauteur).');
  });
});
