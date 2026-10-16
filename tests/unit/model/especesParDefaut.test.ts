import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ESPECES_PAR_DEFAUT, reglagesDe } from '../../../src/model/especesParDefaut.js';
import { NOM_PRESET_DE_BASE, PRESETS_BASE } from '../../../src/model/presetsBase.js';
import { especeParNature, ID_ESPECE, lireDocumentArbres, lireEspece, documentArbres, FORMAT_ARBRES, MAX_ESPECES, MAX_OCTETS_ARBRES } from '../../../src/model/especesArbre.js';

// La bibliotheque livree avec Plan (MD/spec-arbres-3d.md §2.1).

describe('la bibliotheque d essences par defaut', () => {
  it('est etendue : plus de cent essences, de quoi couvrir les jardins et les parcelles de France', () => {
    expect(ESPECES_PAR_DEFAUT.length).toBeGreaterThanOrEqual(100);
    expect(ESPECES_PAR_DEFAUT.length).toBeLessThanOrEqual(MAX_ESPECES);
  });

  it('n a que des identifiants valides et uniques, des noms uniques, des dimensions sensees', () => {
    const ids = new Set<string>(), noms = new Set<string>();
    for (const e of ESPECES_PAR_DEFAUT) {
      expect(ID_ESPECE.test(e.id), e.id).toBe(true);
      expect(ids.has(e.id), 'doublon ' + e.id).toBe(false);
      expect(noms.has(e.nom), 'doublon ' + e.nom).toBe(false);
      ids.add(e.id); noms.add(e.nom);
      expect(e.hauteurM).toBeGreaterThan(0.3);
      expect(e.hauteurM).toBeLessThanOrEqual(60);
      expect(e.diametreM).toBeGreaterThan(0.3);
      expect(e.diametreM).toBeLessThanOrEqual(40);
    }
  });

  it('se relit tel quel : chaque essence passe la lecture tolerante, aucune n est ecartee', () => {
    for (const e of ESPECES_PAR_DEFAUT) expect(lireEspece(JSON.parse(JSON.stringify(e)))).toEqual(e);
  });

  it('tient dans un document que le serveur accepte, pour qui veut l enregistrer et la retoucher', () => {
    const texte = JSON.stringify(documentArbres(ESPECES_PAR_DEFAUT));
    expect(texte.length).toBeLessThan(MAX_OCTETS_ARBRES);
    expect(lireDocumentArbres(JSON.parse(texte))?.especes).toHaveLength(ESPECES_PAR_DEFAUT.length);
    expect(JSON.parse(texte).format).toBe(FORMAT_ARBRES);
  });

  it('donne a chaque essence ses propres reglages : graine propre, preset de base intact', () => {
    const graines = ESPECES_PAR_DEFAUT.map((e) => e.reglages.seed);
    expect(new Set(graines).size).toBeGreaterThan(ESPECES_PAR_DEFAUT.length * 0.95);
    const avant = JSON.stringify(PRESETS_BASE);
    reglagesDe('essai', 'chene', { f: 0x123456, a: 2, lv: 1, r: 2 });
    expect(JSON.stringify(PRESETS_BASE)).toBe(avant);
  });

  it('applique les retouches : teinte, ecorce, angle, niveaux', () => {
    const r = reglagesDe('essai', 'chene', { f: 0x123456, e: 0x654321, ec: 'birch', ft: 'ash', a: 0.5, lv: 2, fs: 2 }) as { leaves: { tint: number; type: string; size: number }; bark: { tint: number; type: string }; branch: { levels: number; angle: Record<string, number> } };
    const base = PRESETS_BASE.chene as unknown as { leaves: { size: number }; branch: { angle: Record<string, number> } };
    expect(r.leaves.tint).toBe(0x123456);
    expect(r.leaves.type).toBe('ash');
    expect(r.bark).toMatchObject({ tint: 0x654321, type: 'birch' });
    expect(r.branch.levels).toBe(2);
    expect(r.branch.angle['1']).toBe(Math.round((base.branch.angle['1'] ?? 0) * 0.5));
    expect(r.leaves.size).toBeCloseTo(base.leaves.size * 2, 2);
  });

  it('commence par le chene : c est l essence de repli', () => {
    expect(ESPECES_PAR_DEFAUT[0]?.id).toBe('chene-pedoncule');
    expect(especeParNature(null, ESPECES_PAR_DEFAUT)?.id).toBe('chene-pedoncule');
  });

  it('propose une essence pour chaque nature de zone de vegetation de la BD TOPO', () => {
    const attendu: Record<string, string> = {
      'Forêt fermée de feuillus': 'chene-pedoncule',
      'Forêt fermée de conifères': 'pin-sylvestre',
      'Forêt fermée mixte': 'hetre-commun',
      'Forêt ouverte': 'hetre-commun',
      'Bois': 'hetre-commun',
      'Peupleraie': 'peuplier-noir',
      'Verger': 'pommier',
      'Haie': 'charmille',
      'Lande ligneuse': 'genet',
      'Vigne': 'vigne',
    };
    for (const [nature, id] of Object.entries(attendu)) expect(especeParNature(nature, ESPECES_PAR_DEFAUT)?.id, nature).toBe(id);
  });

  it('distingue les silhouettes : un cypres de Provence est fuse, un cedre du Liban etale, un peuplier d Italie elance', () => {
    const e = (id: string) => ESPECES_PAR_DEFAUT.find((x) => x.id === id)!;
    expect(e('cypres-provence').hauteurM / e('cypres-provence').diametreM).toBeGreaterThan(5);
    expect(e('peuplier-italie').hauteurM / e('peuplier-italie').diametreM).toBeGreaterThan(5);
    expect(e('cedre-liban').diametreM).toBeGreaterThan(e('cedre-liban').hauteurM * 0.8);
    expect(e('saule-pleureur').caduc).toBe(true);
    expect(e('olivier').caduc).toBe(false);
    expect(e('meleze').caduc).toBe(true);
  });

  it('couvre les grandes familles : feuillus caducs, persistants, coniferes, fruitiers, arbustes', () => {
    const ids = new Set(ESPECES_PAR_DEFAUT.map((e) => e.id));
    for (const id of ['chene-sessile', 'hetre-commun', 'platane', 'tilleul-petites-feuilles', 'bouleau-verruqueux', 'pin-parasol', 'epicea-commun', 'cedre-atlas', 'if-commun', 'chene-vert', 'olivier', 'laurier-palme', 'buis', 'pommier', 'cerisier-fruits', 'figuier', 'noyer-commun', 'lilas', 'hortensia', 'haie-thuyas']) expect(ids.has(id), id).toBe(true);
  });
});

describe('les presets de base', () => {
  it('sont ceux d EZ-tree 1.1.0, au millieme pres (hors treillis)', () => {
    const dossier = 'node_modules/@dgreenheck/ez-tree/src/lib/presets/';
    const arrondi = (v: unknown): unknown => JSON.parse(JSON.stringify(v, (_k, x: unknown) => (typeof x === 'number' ? Math.round(x * 1000) / 1000 : x)));
    for (const [cle, nom] of Object.entries(NOM_PRESET_DE_BASE)) {
      const fichier = nom.toLowerCase().replace(' ', '_') + '.json';
      const j = arrondi(JSON.parse(readFileSync(dossier + fichier, 'utf8'))) as Record<string, unknown>;
      delete j.trellis;
      expect(PRESETS_BASE[cle], cle).toEqual(j);
    }
  });
});
