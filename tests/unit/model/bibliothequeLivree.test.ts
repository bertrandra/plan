import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { BIBLIOTHEQUE_LIVREE, FICHIER_BIBLIOTHEQUE_LIVREE } from '../../fixtures/bibliotheque-livree.js';
import { especeParNature, especesParTaille, ID_ESPECE, lireDocumentArbres, lireEspece, documentArbres, FORMAT_ARBRES, MAX_OCTETS_ARBRES, TAILLES } from '../../../src/model/especesArbre.js';

// La bibliotheque livree avec Plan : le fichier data/admin/arbres.json (MD/spec-arbres-3d.md §2.1). Le code n'a aucune essence ; ce
// fichier est ce que l'ecran Admin › Arbres lit et retouche, et ce que le serveur sert.

const brut = JSON.parse(readFileSync(FICHIER_BIBLIOTHEQUE_LIVREE, 'utf8')) as { format: string; especes: unknown[] };
const parNom = (id: string) => BIBLIOTHEQUE_LIVREE.find((x) => x.id === id)!;

describe('la bibliotheque d essences livree', () => {
  it('est un document plan-arbres dont aucune essence n est ecartee a la lecture', () => {
    expect(brut.format).toBe(FORMAT_ARBRES);
    expect(BIBLIOTHEQUE_LIVREE).toHaveLength(brut.especes.length);
    for (const e of BIBLIOTHEQUE_LIVREE) expect(lireEspece(JSON.parse(JSON.stringify(e))), e.id).toEqual(e);
  });

  it('compte dix essences par taille : petit, moyen, grand, tres grand', () => {
    const groupes = especesParTaille(BIBLIOTHEQUE_LIVREE);
    expect(groupes.map((g) => g.taille.id)).toEqual(TAILLES.map((t) => t.id));
    for (const g of groupes) expect(g.especes, g.taille.id).toHaveLength(10);
    expect(BIBLIOTHEQUE_LIVREE).toHaveLength(40);
  });

  it('n a que des identifiants valides et uniques, des noms uniques, des dimensions sensees', () => {
    const ids = new Set<string>(), noms = new Set<string>();
    for (const e of BIBLIOTHEQUE_LIVREE) {
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

  it('tient dans un document que le serveur accepte, avec de la place pour les essences de l administrateur', () => {
    const texte = JSON.stringify(documentArbres(BIBLIOTHEQUE_LIVREE));
    expect(texte.length).toBeLessThan(MAX_OCTETS_ARBRES / 2);
    expect(lireDocumentArbres(JSON.parse(texte))?.especes).toHaveLength(40);
  });

  it('donne a chaque essence sa graine : deux essences de meme base ne donnent pas le meme arbre', () => {
    expect(new Set(BIBLIOTHEQUE_LIVREE.map((e) => e.reglages.seed)).size).toBe(BIBLIOTHEQUE_LIVREE.length);
  });

  it('commence par le chene : c est l essence de repli', () => {
    expect(BIBLIOTHEQUE_LIVREE[0]?.id).toBe('chene-pedoncule');
    expect(especeParNature(null, BIBLIOTHEQUE_LIVREE)?.id).toBe('chene-pedoncule');
  });

  it('propose une essence pour chaque nature de zone de vegetation de la BD TOPO', () => {
    const attendu: Record<string, string> = {
      'Forêt fermée de feuillus': 'chene-pedoncule', 'Forêt fermée de conifères': 'pin-sylvestre', 'Forêt fermée mixte': 'hetre-commun',
      'Forêt ouverte': 'hetre-commun', 'Bois': 'hetre-commun', 'Peupleraie': 'peuplier-noir', 'Verger': 'pommier', 'Haie': 'charmille',
      'Lande ligneuse': 'genet', 'Vigne': 'vigne',
    };
    for (const [nature, id] of Object.entries(attendu)) expect(especeParNature(nature, BIBLIOTHEQUE_LIVREE)?.id, nature).toBe(id);
  });

  it('distingue les silhouettes : un cypres de Provence est fuse, un cedre du Liban etale, un peuplier d Italie elance', () => {
    expect(parNom('cypres-provence').hauteurM / parNom('cypres-provence').diametreM).toBeGreaterThan(5);
    expect(parNom('peuplier-italie').hauteurM / parNom('peuplier-italie').diametreM).toBeGreaterThan(5);
    expect(parNom('cedre-liban').diametreM).toBeGreaterThan(parNom('cedre-liban').hauteurM * 0.8);
    expect(parNom('saule-pleureur').caduc).toBe(true);
    expect(parNom('olivier').caduc).toBe(false);
  });

  it('couvre les familles : caducs, persistants, coniferes, fruitiers, arbustes, haies', () => {
    const ids = new Set(BIBLIOTHEQUE_LIVREE.map((e) => e.id));
    for (const id of ['chene-pedoncule', 'hetre-commun', 'platane', 'bouleau-verruqueux', 'pin-parasol', 'epicea-commun', 'if-commun', 'chene-vert', 'olivier', 'laurier-palme', 'buis', 'pommier', 'pecher', 'noyer-commun', 'lilas', 'hortensia', 'charmille']) expect(ids.has(id), id).toBe(true);
  });
});
