import { describe, it, expect } from 'vitest';
import { OUVRAGES, ouvrage, FONCTIONS_AU_MENU } from '../../../src/model/ouvrages/index.js';
import { LIBELLE_FONCTION, ELEVATION_DEFAUT, FONCTIONS_HORS_EQUIPEMENT, elevationParDefaut } from '../../../src/model/defaults.js';
import { fonctionAdmise, aParticularite, occupeLeSol, estBati } from '../../../src/model/fonctions.js';
import { FONCTIONS } from '../../../src/ui/champs/objet.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Le registre des ouvrages (MD/spec-ouvrages.md, etape 6.2) remplace des tables ecrites a la main : elles en derivent, a l'identique.
// Les valeurs ci-dessous sont celles des tables d'avant le registre (27 octobre 2026), recopiees telles quelles.

const AVANT = {
  libelles: { terrain: 'Terrain', batiment: 'Bâtiment', terrasse: 'Terrasse', arbre: 'Arbre', massif: 'Massif', mobilier: 'Mobilier', dalle: 'Dalle',
    equipement: 'Équipement', chemin: 'Chemin', parasol: 'Parasol', pergola: 'Pergola', carport: 'Carport', piscine: 'Piscine', tremie: 'Trou de terrasse',
    camera: 'Point de vue', limite: 'Limite', annexe: 'Annexe', autre: 'Autre' },
  horsEquipement: ['terrain', 'limite', 'camera', 'terrasse', 'chemin', 'parasol', 'tremie', 'piscine'],
  elevations: { terrain: 0, batiment: 2.5, arbre: 3, terrasse: 0, massif: 0.6, mobilier: 0.9, dalle: 0.02, equipement: 0.9, chemin: 0, parasol: 2.2,
    pergola: 2.4, carport: 2.3, piscine: 0, tremie: 0, autre: 0.5, limite: 0, annexe: 2.5 },
  menu: ['terrain', 'batiment', 'annexe', 'arbre', 'terrasse', 'massif', 'mobilier', 'dalle', 'equipement', 'chemin', 'parasol', 'pergola', 'carport',
    'piscine', 'tremie', 'limite', 'autre'],
  profils: {
    terrain: { formes: ['polygon'] }, batiment: { formes: ['polygon'], particularites: ['releve'] }, annexe: { formes: ['polygon'], particularites: ['releve'] },
    terrasse: { formes: ['polygon'], particularites: ['construction'] }, parasol: { formes: ['circle'], particularites: ['parasol'] },
    pergola: { formes: ['polygon'], particularites: ['abri'] }, carport: { formes: ['polygon'], particularites: ['abri'] },
    piscine: { formes: ['polygon', 'circle'], particularites: ['bassin'] }, tremie: { formes: ['polygon', 'circle'], particularites: ['ouverture'] },
    camera: { formes: ['path'], particularites: ['pointDeVue'] }, arbre: { particularites: ['arbre'] }
  } as Record<string, { formes?: string[]; particularites?: string[] }>
};

describe('le registre des ouvrages', () => {
  it('rend les tables d avant, a l identique', () => {
    expect(LIBELLE_FONCTION).toEqual(AVANT.libelles);
    expect([...FONCTIONS_HORS_EQUIPEMENT].sort()).toEqual([...AVANT.horsEquipement].sort());
    expect(ELEVATION_DEFAUT).toEqual(AVANT.elevations);
    expect(elevationParDefaut('camera')).toBe(0.5);
    expect(elevationParDefaut('inconnue')).toBe(0.5);
    expect(FONCTIONS).toEqual(AVANT.menu);
    expect([...FONCTIONS_AU_MENU]).toEqual(AVANT.menu);
  });

  it('donne a chaque fonction les formes et les sections d avant', () => {
    const formes = ['polygon', 'circle', 'path'] as const;
    const particularites = ['parasol', 'pointDeVue', 'arbre', 'construction', 'releve', 'abri', 'bassin', 'ouverture'] as const;
    for (const f of [...OUVRAGES.map((o) => o.fonction), 'inconnue', '']) {
      const p = AVANT.profils[f] ?? {};
      for (const forme of formes) {
        expect(fonctionAdmise(f, forme), `${f} sur ${forme}`).toBe(!p.formes || p.formes.includes(forme));
        for (const q of particularites) {
          const o = { fonction: f, type: forme } as unknown as ObjetPlan;
          expect(aParticularite(o, q), `${f} ${forme} ${q}`).toBe(!!p.particularites?.includes(q) && (!p.formes || p.formes.includes(forme)));
        }
      }
    }
  });

  it('dit qui occupe le sol comme la liste d avant', () => {
    // Avant : ni terrain (ni la parcelle), ni point de vue, arbre, parasol, tremie ; un trace, seulement s'il est un chemin.
    const avant = (f: string, type: string, key = 'x') => {
      if (key === 'parcelle' || ['terrain', 'camera', 'arbre', 'parasol', 'tremie'].includes(f)) return false;
      if (type === 'path') return f === 'chemin';
      return type === 'polygon' || type === 'circle';
    };
    for (const f of [...OUVRAGES.map((o) => o.fonction), 'inconnue', '']) {
      for (const type of ['polygon', 'circle', 'path']) {
        expect(occupeLeSol({ key: 'x', fonction: f, type } as unknown as ObjetPlan), `${f} ${type}`).toBe(avant(f, type));
        expect(occupeLeSol({ key: 'parcelle', fonction: f, type } as unknown as ObjetPlan)).toBe(false);
      }
    }
  });

  it('chaque fonction a un ouvrage, une fonction inconnue est un autre', () => {
    expect(new Set(OUVRAGES.map((o) => o.fonction)).size).toBe(OUVRAGES.length);
    expect(ouvrage('inconnue').fonction).toBe('autre');
    expect(ouvrage(undefined).fonction).toBe('autre');
    expect(ouvrage('terrasse').famille).toBe('construit');
    expect(ouvrage('chemin').famille).toBe('surface');
  });
});

// Les couches lisaient la fonction d'un objet par des comparaisons ecrites a la main (`fonction === '…'`) ; elles lisent le registre
// depuis l'etape 6.4. Les listes ci-dessous sont celles de ces comparaisons, recopiees telles quelles : le registre les rend.
describe('les comparaisons d avant l etape 6.4, a l identique', () => {
  const FONCTIONS_ET_INCONNUES = [...OUVRAGES.map((o) => o.fonction), 'inconnue', undefined];
  const ceux = (garde: (f: string | undefined) => boolean) => FONCTIONS_ET_INCONNUES.filter(garde);

  it('le bati des exports : un batiment ou une annexe', () => {
    expect(ceux((f) => estBati({ fonction: f }))).toEqual(['batiment', 'annexe']);
  });

  it('le dossier piscine : le voisinage du plan de situation, les constructions du plan de masse', () => {
    expect(ceux((f) => !!ouvrage(f).dossierPiscine?.situation).sort()).toEqual(['annexe', 'batiment', 'chemin']);
    expect(ceux((f) => !!ouvrage(f).dossierPiscine?.masse).sort()).toEqual(['annexe', 'batiment', 'carport', 'dalle', 'pergola', 'terrasse']);
  });
});
