// Les modules purs du banc : l'arbre des classes, la geometrie, l'edition, l'EXIF, Panoramax, les blocs, le panoramique, YOLO, le brouillon.
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { choixDeCreation, cibleDuNom, CLASSES_DEFAUT, erreursDeLArbre, idDuNom, indicesYolo, nomsYolo, nomYoloDe, ordreDeLArbre, profondeur } from '../src/classes.js';
import { parentDe, rangerLesParents, iou } from '../src/geometrie.js';
import { ajouterSommet, changerClasse, changerType, creerRectangle, deplacer, enPolygone, Historique, retirerSommet, supprimer, tirerPoignee } from '../src/edition.js';
import { lireExif } from '../src/exif.js';
import { capVers, distanceM, ecartAngle, lireAdresse, lirePhotos } from '../src/panoramax.js';
import { blocTire, dansLEchantillon, partsValables, tirage } from '../src/blocs.js';
import { vueDuPanoramique } from '../src/equirect.js';
import { decoderV10, decoderV8, letterbox, nms } from '../src/yolo.js';
import { brouillonSurExistant, correspondanceParDefaut, fusionner, lireCible, objetsDuBrouillon, selonLaCorrespondance } from '../src/brouillon.js';
import { redresserParCoins } from '../src/redressement.js';
import type { Bloc, Classe, Modele, Objet } from '../src/types.js';
import { REGLAGES_DEFAUT } from '../src/types.js';

const rect = (id: string, classe: string, x0: number, y0: number, x1: number, y1: number, o: Partial<Objet> = {}): Objet => ({ id, classe, forme: 'rectangle', points: [{ x: x0, y: y0 }, { x: x1, y: y1 }], parent: null, attributs: {}, origine: 'main', ...o });

describe('l’arbre des classes', () => {
  it('l’arbre de depart est valable, chaque parent avant ses enfants, et les indices YOLO sautent les classes non apprises', () => {
    expect(erreursDeLArbre(CLASSES_DEFAUT)).toEqual([]);
    const ordre = ordreDeLArbre(CLASSES_DEFAUT).map((c) => c.id);
    for (const c of CLASSES_DEFAUT) if (c.parent) expect(ordre.indexOf(c.parent)).toBeLessThan(ordre.indexOf(c.id));
    // Les vingt noms du proprietaire, dans son ordre : les familles se qualifient par leurs types, les parties ne s'apprennent pas.
    expect(nomsYolo(CLASSES_DEFAUT)).toEqual(['fenetre_1v', 'fenetre_2v', 'fenetre_petits_carreaux', 'fenetre_imposte_carreaux', 'fenetre_imposte_simple', 'porte_fenetre', 'baie_vitree', 'fenetre_cintree', 'oeil_de_boeuf', 'lucarne', 'porte_pleine', 'porte_vitree', 'porte_double', 'porte_garage', 'volet_battant', 'volet_roulant', 'volet_pliant', 'balcon', 'garde_corps', 'loggia']);
    expect(indicesYolo(CLASSES_DEFAUT).get('loggia')).toBe(19);
    expect(profondeur(CLASSES_DEFAUT, 'quadrillage')).toBe(3);
    expect(nomYoloDe({ classe: 'fenetre', type: 'fenetre_2v' }, CLASSES_DEFAUT)).toBe('fenetre_2v');
    expect(nomYoloDe({ classe: 'fenetre' }, CLASSES_DEFAUT)).toBeNull();
    expect(nomYoloDe({ classe: 'balcon' }, CLASSES_DEFAUT)).toBe('balcon');
    expect(nomYoloDe({ classe: 'quadrillage' }, CLASSES_DEFAUT)).toBeNull();
    expect(cibleDuNom('porte_garage', CLASSES_DEFAUT)).toEqual({ classe: 'porte', type: 'porte_garage' });
    expect(cibleDuNom('balcon', CLASSES_DEFAUT)).toEqual({ classe: 'balcon' });
    expect(choixDeCreation(CLASSES_DEFAUT).slice(0, 2).map((c) => c.valeur)).toEqual(['fenetre:fenetre_1v', 'fenetre:fenetre_2v']);
  });
  it('dit les erreurs : identifiant, doublon, parent inconnu, boucle, couleur', () => {
    const c = (id: string, parent: string | null, couleur = '#000000'): Classe => ({ id, nom: id, parent, forme: 'rectangle', couleur, attributs: [], apprendre: true });
    const e = erreursDeLArbre([c('Fenetre', null), c('a', 'b'), c('b', 'a'), c('d', 'inconnu'), c('d', null, 'rouge')]);
    expect(e.join(' | ')).toMatch(/Fenetre.*identifiant/);
    expect(e.join(' | ')).toMatch(/« a » : l’arbre boucle/);
    expect(e.join(' | ')).toMatch(/parent inconnu « inconnu »/);
    expect(e.join(' | ')).toMatch(/« d » est en double/);
    expect(e.join(' | ')).toMatch(/couleur/);
    expect(idDuNom('Porte de garage')).toBe('porte-de-garage');
    expect(idDuNom('Œil-de-bœuf', '_')).toBe('oeil_de_boeuf');
    const typee = { ...c('t', null), types: [{ id: 'a', nom: 'A' }, { id: 't', nom: 'T' }] };
    expect(erreursDeLArbre([typee, c('a', null)]).join(' | ')).toMatch(/« t » est en double.*« a » est en double/);
  });
});

describe('la geometrie et l’edition', () => {
  const classes = CLASSES_DEFAUT;
  it('range un cadre dans la plus petite fenetre qui le contient, jamais dans une autre classe', () => {
    const f1 = rect('f1', 'fenetre', 0, 0, 100, 100), f2 = rect('f2', 'fenetre', 10, 10, 60, 60), p = rect('p', 'porte', 0, 0, 200, 200);
    const c = rect('c', 'cadre-haut', 12, 12, 50, 30);
    expect(parentDe(c, [f1, f2, p, c], classes)).toBe('f2');
    expect(parentDe(rect('x', 'cadre-haut', 150, 150, 160, 160), [f1, f2, p], classes)).toBeNull();
    // Un parent pose a la main reste ; celui d'un objet du brouillon se recalcule.
    const r = rangerLesParents([f1, f2, { ...c, parent: 'f1' }, { ...c, id: 'c2', parent: 'f1', origine: 'auto' }], classes);
    expect(r.map((o) => o.parent)).toEqual([null, null, 'f1', 'f2']);
  });
  it('tire un coin de rectangle (le coin oppose reste), deplace sans sortir de l’image, touche un objet du brouillon', () => {
    const o = rect('a', 'fenetre', 10, 10, 50, 40, { origine: 'auto' });
    expect(tirerPoignee(o, 2, { x: 70, y: 90 }, 100, 80)).toMatchObject({ points: [{ x: 10, y: 10 }, { x: 70, y: 80 }], origine: 'corrige' });
    expect(tirerPoignee(o, 0, { x: 60, y: 50 }, 100, 80).points).toEqual([{ x: 50, y: 40 }, { x: 60, y: 50 }]);
    expect(deplacer(o, 80, -30, 100, 80).points).toEqual([{ x: 60, y: 0 }, { x: 100, y: 30 }]);
    const p = enPolygone(o);
    expect(p.points).toHaveLength(4);
    expect(ajouterSommet(p, 0).points[1]).toEqual({ x: 30, y: 10 });
    expect(retirerSommet(retirerSommet(p, 0), 0).points).toHaveLength(3);
    expect(creerRectangle([o], 'porte', { x: 5, y: 9 }, { x: 1, y: 2 })).toMatchObject({ id: 'm2', points: [{ x: 1, y: 2 }, { x: 5, y: 9 }], origine: 'main' });
    const porte = classes.find((c) => c.id === 'porte') as Classe;
    // Une fenetre a deux vantaux devenue porte : elle garde son materiau, perd son type (a qualifier de nouveau).
    const devenue = changerClasse({ ...o, type: 'fenetre_2v', attributs: { vantaux: 2, materiau: 'bois' } }, porte);
    expect([devenue.attributs, devenue.type]).toEqual([{ materiau: 'bois' }, undefined]);
    expect(changerType(devenue, 'porte_double').type).toBe('porte_double');
    expect(changerType(changerType(devenue, 'porte_double'), '')).not.toHaveProperty('type');
    expect(supprimer([o, rect('b', 'cadre-haut', 10, 10, 20, 20, { parent: 'a' })], 'a')).toEqual([rect('b', 'cadre-haut', 10, 10, 20, 20)]);
    const h = new Historique<number>();
    h.noter(1); h.noter(2);
    expect([h.annuler(3), h.annuler(2), h.annuler(1), h.refaire(1)]).toEqual([2, 1, null, 2]);
  });
});

/** Un JPEG minimal dont l'EXIF porte une position, une date, un cap et un appareil (TIFF petit-boutiste). */
function jpegAvecExif(): ArrayBuffer {
  const t: number[] = [];
  const u16 = (v: number) => t.push(v & 255, (v >> 8) & 255);
  const u32 = (v: number) => t.push(v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >>> 24) & 255);
  // En-tete TIFF ; IFD0 a 8 : Make, Model, GPS (pointeur).
  t.push(0x49, 0x49); u16(42); u32(8);
  const entrees0 = 3, ifd0 = 8, apres0 = ifd0 + 2 + 12 * entrees0 + 4;
  const make = apres0, model = make + 6, gps = model + 10;
  u16(entrees0);
  u16(0x010f); u16(2); u32(6); u32(make);
  u16(0x0110); u16(2); u32(10); u32(model);
  u16(0x8825); u16(4); u32(1); u32(gps);
  u32(0);
  for (const c of 'Apple\0') t.push(c.charCodeAt(0));
  for (const c of 'iPhone 15\0') t.push(c.charCodeAt(0));
  // IFD GPS : LatRef N, Lat 48/1 53/1 4500/100, LonRef E, Lon 2/1 8/1 1800/100, ImgDirection 123/1.
  const n = 5, donnees = gps + 2 + 12 * n + 4;
  u16(n);
  u16(1); u16(2); u32(2); t.push(0x4e, 0, 0, 0);
  u16(2); u16(5); u32(3); u32(donnees);
  u16(3); u16(2); u32(2); t.push(0x45, 0, 0, 0);
  u16(4); u16(5); u32(3); u32(donnees + 24);
  u16(0x11); u16(5); u32(1); u32(donnees + 48);
  u32(0);
  for (const [a, b] of [[48, 1], [53, 1], [4500, 100], [2, 1], [8, 1], [1800, 100], [123, 1]] as const) { u32(a); u32(b); }
  const app1 = [0xff, 0xe1, ((t.length + 8) >> 8) & 255, (t.length + 8) & 255, 0x45, 0x78, 0x69, 0x66, 0, 0, ...t];
  return new Uint8Array([0xff, 0xd8, ...app1, 0xff, 0xd9]).buffer;
}

describe('l’EXIF d’une photo de l’iPhone', () => {
  it('lit la position, le cap et l’appareil ; rien d’une image sans EXIF', () => {
    const e = lireExif(jpegAvecExif());
    expect(e.lat).toBeCloseTo(48 + 53 / 60 + 45 / 3600, 6);
    expect(e.lon).toBeCloseTo(2 + 8 / 60 + 18 / 3600, 6);
    expect(e.azimut).toBe(123);
    expect(e.appareil).toBe('Apple iPhone 15');
    expect(lireExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]).buffer)).toMatchObject({ lat: null, appareil: null });
  });
});

describe('Panoramax autour d’une adresse', () => {
  const cible = { lat: 48.8957, lon: 2.1456 };
  const feat = (id: string, lon: number, lat: number, az: number | null, champ: number, hote = 'https://panoramax.ign.fr') => ({
    id, collection: 'c', geometry: { coordinates: [lon, lat] }, properties: { 'view:azimuth': az, 'pers:interior_orientation': { field_of_view: champ }, datetime: '2024-05-01T10:00:00Z', license: 'etalab-2.0' },
    assets: { hd: { href: hote + '/api/pictures/' + id + '/hd.jpg' }, thumb: { href: hote + '/api/pictures/' + id + '/thumb.jpg' } },
  });
  it('garde les photos du rayon, les plus proches d’abord, dit lesquelles visent l’adresse, et ecarte un hote inconnu', () => {
    // Au sud de l'adresse, a ~22 m : tournee vers le nord, elle vise ; tournee vers le sud, non. Un 360 vise toujours.
    const sud = cible.lat - 0.0002;
    const l = lirePhotos({ features: [feat('nord', cible.lon, sud, 0, 70), feat('sud', cible.lon, sud, 180, 70), feat('360', cible.lon, cible.lat - 0.0001, 90, 360), feat('loin', cible.lon, cible.lat - 0.01, 0, 70), feat('ailleurs', cible.lon, sud, 0, 70, 'https://exemple.org')] }, cible, 40);
    expect(l.map((p) => [p.id, p.vise, p.panoramique])).toEqual([['360', true, true], ['nord', true, false], ['sud', false, false]]);
    expect(l[1]?.distance).toBeCloseTo(22.2, 0);
    expect(l[1]?.cap).toBeCloseTo(0, 0);
    expect(distanceM(cible, { lat: cible.lat, lon: cible.lon + 0.001 })).toBeCloseTo(73.2, 0);
    expect(capVers(cible, { lat: cible.lat, lon: cible.lon + 0.001 })).toBeCloseTo(90, 1);
    expect(ecartAngle(350, 10)).toBe(20);
    expect(lireAdresse({ features: [{ geometry: { coordinates: [2.1, 48.9] }, properties: { label: '2 Allée des Limites' } }] })).toEqual({ libelle: '2 Allée des Limites', lon: 2.1, lat: 48.9 });
    expect(lireAdresse({ features: [] })).toBeNull();
  });
});

describe('les blocs d’apprentissage', () => {
  it('le tirage est le meme que celui du serveur (api.php::bloc_de), et repartit a peu pres selon les parts', async () => {
    const ids = Array.from({ length: 400 }, (_, i) => '20261111-120000-' + i.toString(16).padStart(6, '0'));
    const blocs = await Promise.all(ids.map((id) => blocTire(REGLAGES_DEFAUT, id)));
    const parts = (b: string) => blocs.filter((x) => x === b).length / ids.length;
    expect(parts('train')).toBeGreaterThan(0.6);
    expect(parts('val')).toBeGreaterThan(0.12);
    expect(parts('test')).toBeGreaterThan(0.04);
    expect(await tirage('g', 'x')).toBe(await tirage('g', 'x'));
    expect(partsValables({ train: 0.7, val: 0.2, test: 0.1 })).toBe(true);
    expect(partsValables({ train: 0.9, val: 0.1, test: 0 })).toBe(false);
    expect(typeof (await dansLEchantillon(REGLAGES_DEFAUT, ids[0] ?? ''))).toBe('boolean');
    const php = spawnSync('php', ['-r', `
      $parts=['train'=>0.7,'val'=>0.2,'test'=>0.1]; $o=[];
      foreach (json_decode($argv[1]) as $id) { $u=hexdec(substr(hash('sha256','${REGLAGES_DEFAUT.graine}:'.$id),0,8))/0xFFFFFFFF; $c=0.0; $b='train';
        foreach (['train','val','test'] as $k) { $c+=$parts[$k]; if ($u<$c) { $b=$k; break; } } $o[]=$b; }
      echo json_encode($o);`, JSON.stringify(ids.slice(0, 60))]);
    if (php.status === 0) expect(JSON.parse(php.stdout.toString())).toEqual(blocs.slice(0, 60));
  });
});

describe('la vue plate d’un panoramique', () => {
  it('regarde la colonne du cap demande', () => {
    // Un panoramique dont le rouge dit la longitude : la colonne du cap 90 (a droite du centre, cap du centre 0) est a 255 * 0,75.
    const W = 720, H = 360, d = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { d[(y * W + x) * 4] = Math.round((x / (W - 1)) * 255); d[(y * W + x) * 4 + 3] = 255; }
    const v = vueDuPanoramique({ largeur: W, hauteur: H, donnees: d }, { capCentre: 0, cap: 90, tangage: 0, champ: 60, largeur: 64, hauteur: 48 });
    const centre = v.donnees[(24 * 64 + 32) * 4] ?? 0;
    expect(Math.abs(centre - 0.75 * 255)).toBeLessThan(3);
    const gauche = v.donnees[(24 * 64 + 0) * 4] ?? 0, droite = v.donnees[(24 * 64 + 63) * 4] ?? 0;
    expect(gauche).toBeLessThan(centre);
    expect(droite).toBeGreaterThan(centre);
  });
});

describe('le redressement par quatre coins', () => {
  it('rend le rectangle pose a la main a ses proportions vues', () => {
    const L = 200, H = 100, d = new Uint8ClampedArray(L * H * 4).fill(255);
    const r = redresserParCoins({ largeur: L, hauteur: H, donnees: d }, [{ x: 20, y: 10 }, { x: 180, y: 20 }, { x: 170, y: 90 }, { x: 30, y: 80 }]);
    expect(r?.methode).toBe('coins');
    expect((r?.image.largeur ?? 0) / (r?.image.hauteur ?? 1)).toBeCloseTo(145 / 70, 1);
    expect(redresserParCoins({ largeur: L, hauteur: H, donnees: d }, [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }])).toBeNull();
  });
});

describe('YOLO et le brouillon', () => {
  it('decode un YOLOv10 (sans NMS) et un YOLOv8 (avec NMS), et la mise au carre', () => {
    expect(decoderV10(new Float32Array([10, 20, 30, 40, 0.9, 1, 0, 0, 5, 5, 0.1, 0]), 0.3)).toEqual([{ classe: 1, score: expect.closeTo(0.9, 5) as unknown as number, boite: { x0: 10, y0: 20, x1: 30, y1: 40 } }]);
    // YOLOv8 : 4 + 2 classes, 3 candidats en colonnes ; les deux premiers se recouvrent (meme classe), le troisieme est d'une autre classe.
    const N = 3, d = new Float32Array(6 * N);
    [[50, 50, 20, 20, 0.9, 0.1], [51, 50, 20, 20, 0.8, 0.1], [200, 200, 10, 10, 0.05, 0.7]].forEach((c, j) => c.forEach((v, k) => { d[k * N + j] = v; }));
    expect(decoderV8(d, [1, 6, N], 2, 0.3).map((x) => [x.classe, Math.round(x.score * 10) / 10])).toEqual([[0, 0.9], [1, 0.7]]);
    expect(nms([{ classe: 0, score: 0.5, boite: { x0: 0, y0: 0, x1: 10, y1: 10 } }, { classe: 1, score: 0.4, boite: { x0: 0, y0: 0, x1: 10, y1: 10 } }], 0.5)).toHaveLength(2);
    expect(letterbox(1280, 640)).toEqual({ k: 0.5, px: 0, py: 160, nw: 640, nh: 320 });
  });
  it('rapporte les classes d’un modele a celles du banc, fond les doublons, garde le travail fait a la main', () => {
    const m: Modele = { id: 'facade-fenetres', nom: 'f', format: 'yolov10', classes: ['fenetre', 'porte', 'rien'], correspondance: { fenetre: 'fenetre', porte: 'porte', rien: '' }, seuil: 0.3, installe: true };
    const b = (x0: number, y0: number, x1: number, y1: number) => ({ x0, y0, x1, y1 });
    const props = selonLaCorrespondance(m, [{ classe: 0, score: 0.9, boite: b(0, 0, 10, 10) }, { classe: 1, score: 0.8, boite: b(50, 0, 60, 30) }, { classe: 2, score: 0.99, boite: b(0, 0, 5, 5) }], CLASSES_DEFAUT);
    expect(props.map((p) => p.classe)).toEqual(['fenetre', 'porte']);
    // La recherche voit la meme fenetre en porte-fenetre, un peu decalee : la mieux notee reste (meme baie).
    const f = fusionner([...props, { classe: 'fenetre', type: 'porte_fenetre', boite: b(1, 0, 10, 11), score: 0.55, modele: 'recherche' }, { classe: 'fenetre', boite: b(100, 0, 110, 10), score: 0.55, modele: 'recherche' }]);
    expect(f.map((p) => [p.classe, p.modele])).toEqual([['fenetre', 'facade-fenetres'], ['porte', 'facade-fenetres'], ['fenetre', 'recherche']]);
    // Votre modele, entraine sur les noms du banc : il pose et qualifie, et ses noms vont d'eux-memes vers les types.
    const mien: Modele = { id: 'mon-1', nom: 'm', format: 'yolov10', classes: ['fenetre_2v', 'volet_battant', 'inconnu'], correspondance: correspondanceParDefaut(['fenetre_2v', 'volet_battant', 'inconnu'], CLASSES_DEFAUT), seuil: 0.3, installe: true };
    expect(mien.correspondance).toEqual({ fenetre_2v: 'fenetre:fenetre_2v', volet_battant: 'volet:volet_battant', inconnu: '' });
    const qualifies = objetsDuBrouillon(selonLaCorrespondance(mien, [{ classe: 0, score: 0.9, boite: b(0, 0, 10, 10) }, { classe: 1, score: 0.7, boite: b(20, 0, 25, 10) }, { classe: 2, score: 0.9, boite: b(40, 0, 45, 10) }], CLASSES_DEFAUT), CLASSES_DEFAUT);
    expect(qualifies.map((o) => [o.classe, o.type])).toEqual([['fenetre', 'fenetre_2v'], ['volet', 'volet_battant']]);
    expect(lireCible('fenetre:porte_garage', CLASSES_DEFAUT)).toEqual({ classe: 'fenetre' });
    expect(iou(b(0, 0, 10, 10), b(5, 0, 15, 10))).toBeCloseTo(1 / 3, 5);
    const nouveaux = objetsDuBrouillon(f, CLASSES_DEFAUT);
    expect(nouveaux.map((o) => [o.id, o.origine])).toEqual([['a1', 'auto'], ['a2', 'auto'], ['a3', 'auto']]);
    const existants = [rect('a1', 'fenetre', 0, 0, 10, 10, { origine: 'corrige' }), rect('a2', 'volet', 20, 0, 25, 10, { origine: 'auto' })];
    const tous = brouillonSurExistant(existants, nouveaux, CLASSES_DEFAUT);
    expect(tous.map((o) => [o.id, o.classe, o.origine])).toEqual([['a1', 'fenetre', 'corrige'], ['a2', 'porte', 'auto'], ['a3', 'fenetre', 'auto']]);
  });
});

describe('l’adresse de l’import Panoramax', () => {
  it('prend des coordonnees tapees, sinon la Geoplateforme, sinon son repli', async () => {
    const { coordonneesTapees, trouverAdresse } = await import('../src/panoramax.js');
    expect(coordonneesTapees('48.8957, 2.1456')).toMatchObject({ lat: 48.8957, lon: 2.1456 });
    expect(coordonneesTapees('48,8957 ; 2,1456')).toMatchObject({ lat: 48.8957, lon: 2.1456 });
    expect(coordonneesTapees('2 allée des Limites')).toBeNull();
    const vus: string[] = [];
    const a = await trouverAdresse('2 allée des Limites', async (url) => {
      vus.push(url.split('?')[0] ?? '');
      if (url.includes('geopf')) throw new Error('HTTP 504');
      return { features: [{ geometry: { coordinates: [2.1456, 48.8957] }, properties: { label: '2 Allée des Limites 78110 Le Vésinet' } }] };
    });
    expect(a?.libelle).toBe('2 Allée des Limites 78110 Le Vésinet');
    expect(vus).toEqual(['https://data.geopf.fr/geocodage/search', 'https://api-adresse.data.gouv.fr/search/']);
  });
});

describe('la repartition stratifiee des blocs', () => {
  it('donne a chaque type sa part de train, val et test, meme rare, et garde les blocs deja poses', async () => {
    const { repartirStratifie, comptesParNom, manquesDuNom } = await import('../src/blocs.js');
    // 100 photos : 90 avec des fenetres a deux vantaux, 10 avec un oeil-de-boeuf ; deux photos ont deja leur bloc.
    const images = Array.from({ length: 100 }, (_, i) => ({ id: 'p' + i, bloc: (i === 0 ? 'test' : i === 1 ? 'reserve' : '') as Bloc, etiquettes: i % 10 === 0 ? { oeil_de_boeuf: 1, fenetre_2v: 2 } : { fenetre_2v: 3 } }));
    const blocs = await repartirStratifie(REGLAGES_DEFAUT, images);
    expect(blocs.has('p0')).toBe(false);
    expect(blocs.has('p1')).toBe(false);
    const avec = (b: string, nom: string) => images.filter((m) => (m.bloc || blocs.get(m.id)) === b && nom in m.etiquettes).length;
    // Les 10 oeils-de-boeuf (dont p0 deja en test) : 7 / 2 / 1, comme les parts.
    expect([avec('train', 'oeil_de_boeuf'), avec('val', 'oeil_de_boeuf'), avec('test', 'oeil_de_boeuf')]).toEqual([7, 2, 1]);
    const tous = (b: string) => images.filter((m) => (m.bloc || blocs.get(m.id)) === b).length;
    expect(Math.abs(tous('train') - 69)).toBeLessThanOrEqual(1);
    expect(Math.abs(tous('val') - 20)).toBeLessThanOrEqual(1);
    expect(Math.abs(tous('test') - 10)).toBeLessThanOrEqual(1);
    // Le meme resultat a chaque fois.
    expect([...(await repartirStratifie(REGLAGES_DEFAUT, images))]).toEqual([...blocs]);
    const metas = images.map((m) => ({ ...m, bloc: (m.bloc || blocs.get(m.id)) as Bloc, statut: 'corrigee' as const, importeeLe: '', source: 'iphone' as const, verifiee: true }));
    const c = await comptesParNom(REGLAGES_DEFAUT, metas);
    expect(c.get('oeil_de_boeuf')?.train).toEqual({ photos: 7, objets: 7 });
    expect(manquesDuNom(c.get('oeil_de_boeuf'))).toEqual(['7 en train (viser 30 au moins)']);
    expect(manquesDuNom(c.get('fenetre_2v'))).toEqual([]);
    expect(manquesDuNom(undefined)).toEqual(['aucun objet marqué']);
  });
});

describe('l’arbre vers le detail', () => {
  it('les regroupements classent sans se dessiner ni s’apprendre ; un detail appris prend ses indices apres les vingt', async () => {
    const { cheminDuNom, classeContenante, estDetail } = await import('../src/classes.js');
    const c = CLASSES_DEFAUT;
    expect(cheminDuNom('fenetre_2v', c)).toEqual(['facade', 'ouverture', 'fenetre', 'fenetre_2v']);
    expect(cheminDuNom('volet_roulant', c)).toEqual(['facade', 'fermeture', 'volet', 'volet_roulant']);
    expect(cheminDuNom('garde_corps', c)).toEqual(['facade', 'saillie', 'garde_corps']);
    expect(choixDeCreation(c).some((x) => x.valeur === 'ouverture')).toBe(false);
    expect(classeContenante(c.find((x) => x.id === 'fenetre') as Classe, c)).toBe('facade');
    // Apprendre le quadrillage et le cadre haut : les vingt indices restent, les details viennent apres.
    const avecDetails = c.map((x) => (x.id === 'quadrillage' || x.id === 'cadre-haut' ? { ...x, apprendre: true } : x));
    expect(estDetail(avecDetails.find((x) => x.id === 'quadrillage') as Classe, avecDetails)).toBe(true);
    expect(estDetail(avecDetails.find((x) => x.id === 'fenetre') as Classe, avecDetails)).toBe(false);
    const n = nomsYolo(avecDetails);
    expect(n.slice(0, 20)).toEqual(nomsYolo(c));
    expect(n.slice(20)).toEqual(['cadre-haut', 'quadrillage']);
    expect(cheminDuNom('quadrillage', avecDetails)).toEqual(['facade', 'ouverture', 'fenetre', 'quadrillage']);
    // Une fenetre se range dans la facade (par-dessus le regroupement), un quadrillage dans sa fenetre.
    const facade: Objet = { id: 'f', classe: 'facade', forme: 'polygone', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], parent: null, attributs: {}, origine: 'main' };
    const fen = rect('w', 'fenetre', 10, 10, 40, 40, { type: 'fenetre_2v' }), q = rect('q', 'quadrillage', 12, 12, 38, 38);
    expect(rangerLesParents([facade, fen, q], avecDetails).map((o) => o.parent)).toEqual([null, 'f', 'w']);
  });
});

describe('la structure de la facade (fichier data/apprentissage/classes.json)', () => {
  it('egout et sol sont des lignes de la facade ; pignon et soubassement ne sont pas des ouvertures ; la cheminee est sur le toit', async () => {
    const { cheminDuNom } = await import('../src/classes.js');
    const c = CLASSES_DEFAUT;
    const chemin = (id: string) => { const l: string[] = []; for (let k = c.find((x) => x.id === id); k; k = c.find((x) => x.id === k?.parent)) l.unshift(k.id); return l.join('/'); };
    expect(chemin('egout')).toBe('facade/lignes-facade/egout');
    expect(chemin('sol')).toBe('facade/lignes-facade/sol');
    expect([c.find((x) => x.id === 'egout')?.forme, c.find((x) => x.id === 'sol')?.forme]).toEqual(['ligne', 'ligne']);
    expect(chemin('pignon')).toBe('facade/parties-mur/pignon');
    expect(chemin('soubassement')).toBe('facade/parties-mur/soubassement');
    for (const id of ['fenetre', 'porte', 'lucarne']) expect(chemin(id).startsWith('facade/ouverture/')).toBe(true);
    expect(chemin('cheminee')).toBe('toiture/cheminee');
    // Les lignes ne s'apprennent pas : les vingt noms ne bougent pas.
    expect(nomsYolo(c)).toHaveLength(20);
    expect(cheminDuNom('loggia', c)).toEqual(['facade', 'saillie', 'loggia']);
    const avecLigneApprise = c.map((x) => (x.id === 'egout' ? { ...x, apprendre: true } : x));
    expect(nomsYolo(avecLigneApprise)).toHaveLength(20);
  });
  it('une ligne se trace, se reforme et se range dans la facade', async () => {
    const { creerPolygone, tirerPoignee, poignees } = await import('../src/edition.js');
    const facade: Objet = { id: 'f', classe: 'facade', forme: 'polygone', points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], parent: null, attributs: {}, origine: 'main' };
    const egout = creerPolygone([facade], 'egout', [{ x: 5, y: 40 }, { x: 95, y: 40 }], 'ligne');
    expect([egout.forme, poignees(egout)]).toEqual(['ligne', [{ x: 5, y: 40 }, { x: 95, y: 40 }]]);
    expect(tirerPoignee(egout, 1, { x: 96, y: 42 }, 100, 100).points[1]).toEqual({ x: 96, y: 42 });
    expect(ajouterSommet(egout, 0).points).toHaveLength(3);
    expect(ajouterSommet(egout, 1).points).toHaveLength(2);
    expect(retirerSommet(egout, 0).points).toHaveLength(2);
    expect(rangerLesParents([facade, egout], CLASSES_DEFAUT)[1]?.parent).toBe('f');
  });
});
