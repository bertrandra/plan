import { describe, it, expect } from 'vitest';
import { equipementDuJardin, equipementPorte, lireChampsEquipement, lireChampsMassif, massifPlante, nouveauMassif, nouvelEquipement, vegetationVisible, VEGETATION_POUR_TOUS_LES_MASSIFS, HAUTEUR_PLATE_BANDE_M } from '../../../src/model/jardin.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { schemaMinimal, migrer } from '../../../src/model/migrations.js';
import { estExistant } from '../../../src/model/fonctions.js';
import { findSpaZones } from '../../../src/engine/structure.js';
import { piscinesDu } from '../../../src/engine/piscine/geometrie.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import type { ObjetAPlat, ObjetPlan } from '../../../src/model/types.js';

// Le jardin du modele (lot L3) : la plate-bande et le massif plante, l'equipement du jardin, la marque `existant` ; leur lecture
// tolerante, leur ecriture, le schema 8 qu'ils demandent, et ce qu'ils ne changent pas (un massif d'avant, une quantite).

const carre = [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }, { x: 0, y: 2 }];
const relu = (objets: ObjetPlan[]) => normalizeObjects(serializeObjects(objets) as unknown as ObjetAPlat[]) as unknown as ObjetPlan[];

describe('la plate-bande et le massif plante', () => {
  it('lisent leurs champs connus, et rien d autre', () => {
    expect(lireChampsMassif({ nature: 'plate-bande', contenu: 'fleurs' })).toEqual({ nature: 'plate-bande', contenu: 'fleurs' });
    expect(lireChampsMassif({ nature: 'massif', contenu: 'potager', vegetation: false, miniArbre: { espece: 'lilas', hauteurM: 9 }, x: 1 }))
      .toEqual({ nature: 'massif', contenu: 'potager', vegetation: false, miniArbre: { espece: 'lilas', hauteurM: 2.5 } });
    expect(lireChampsMassif({ nature: 'jungle', contenu: 'fleurs' })).toBeNull();
    expect(lireChampsEquipement({ nature: 'regard' })).toEqual({ nature: 'regard' });
    expect(lireChampsEquipement({ nature: 'spa' })).toBeNull();
  });

  it('s ecrivent et se relisent a l identique, au schema 8 ; un champ illisible tombe a la lecture', () => {
    const pb = nouveauMassif('pb', carre, { nature: 'plate-bande', contenu: 'vivaces', miniArbre: { espece: 'lilas', hauteurM: 1.5 } });
    const rg = nouvelEquipement('rg', { x: 5, y: 5 }, 'regard');
    const ch = { ...nouvelEquipement('c', { x: 1, y: 1 }, 'robinet'), fonction: 'chemin', existant: true } as ObjetPlan;
    const [a, b, c] = relu([pb, rg, ch]);
    expect(a!.massif).toEqual(pb.massif);
    expect(a!.elevation).toBe(HAUTEUR_PLATE_BANDE_M);
    expect(b!.equipement).toEqual({ nature: 'regard' });
    expect(b!.type === 'polygon' && b!.pts.map((p) => p.x)).toEqual([4.7, 5.3, 5.3, 4.7]);
    // Le sous-objet reste sur un objet change de fonction, mais ne vaut que pour un equipement ; la marque `existant` s'ecrit.
    expect(equipementDuJardin(c!)).toBeNull();
    expect(estExistant(c!)).toBe(true);
    expect(schemaMinimal([pb] as unknown as ObjetAPlat[])).toBe(8);
    expect(schemaMinimal([rg] as unknown as ObjetAPlat[])).toBe(8);
    expect(schemaMinimal([{ key: 'x', type: 'polygon', pts: carre, existant: true }] as unknown as ObjetAPlat[])).toBe(8);
    const abime = normalizeObjects([{ key: 'm', type: 'polygon', fonction: 'massif', pts: carre, massif: { nature: '?' }, existant: 'oui' }] as unknown as ObjetAPlat[])[0] as unknown as ObjetPlan;
    expect(abime.massif).toBeUndefined();
    expect(abime.existant).toBeUndefined();
  });

  it('un massif d avant reste le bloc d avant : pas de vegetation par defaut (la demonstration et ses onze massifs ne bougent pas)', () => {
    expect(VEGETATION_POUR_TOUS_LES_MASSIFS).toBe(false);
    const massifs = DEMO_OBJECTS.filter((o) => o.fonction === 'massif');
    expect(massifs.length).toBeGreaterThan(0);
    expect(massifs.every((o) => massifPlante(o) === null && !vegetationVisible(o))).toBe(true);
    expect(schemaMinimal(DEMO_OBJECTS)).toBe(5);
    expect(vegetationVisible(nouveauMassif('n', carre, { nature: 'plate-bande', contenu: 'fleurs' }))).toBe(true);
    expect(vegetationVisible(nouveauMassif('n', carre, { nature: 'plate-bande', contenu: 'fleurs', vegetation: false }))).toBe(false);
  });

  it('le schema 7 se lit tel quel au 8 (migration identite)', () => {
    const d = { objects: [{ key: 'm', type: 'polygon', fonction: 'massif', pts: carre }] as unknown as ObjetAPlat[], measures: [] };
    expect(migrer(structuredClone(d), 7)).toEqual(d);
  });
});

describe('ce qui ne se chiffre pas', () => {
  const terrasse = { key: 't', type: 'polygon', fonction: 'terrasse', pts: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }] } as unknown as ObjetPlan;
  it('un regard, un eclairage ou un robinet ne chargent pas la terrasse ; un spa, si', () => {
    const spa = { key: 's', type: 'circle', fonction: 'equipement', center: { x: 5, y: 5 }, r: 1, name: 'Spa' } as unknown as ObjetPlan;
    const regard = nouvelEquipement('r', { x: 3, y: 3 }, 'regard');
    expect(equipementPorte(spa)).toBe(true);
    expect(equipementPorte(regard)).toBe(false);
    expect(findSpaZones(0, [terrasse, spa, regard]).map((z) => z.key)).toEqual(['s']);
    expect(findSpaZones(0, [terrasse, { ...spa, existant: true } as ObjetPlan])).toEqual([]);
  });

  it('une piscine existante ne se chiffre ni ne se declare', () => {
    const p = { key: 'p', type: 'polygon', fonction: 'piscine', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 4 }, { x: 0, y: 4 }] } as unknown as ObjetPlan;
    expect(piscinesDu([p, { ...p, key: 'q', existant: true } as ObjetPlan]).map((o) => o.key)).toEqual(['p']);
  });
});
