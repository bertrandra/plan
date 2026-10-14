import type { ReponseAnalyse } from '../../../src/model/analyseClaude.js';

// Une reponse de Claude dans la forme du schema version 1 (deploy/schema-analyse.json), pour les
// tests du vote, des propositions et de l'orchestration : un deux-pans en ardoise, deux cheminees,
// une facade sud en brique avec des volets battants, et ce que l'on veut changer par-dessus.

type Partiel = { [K in keyof ReponseAnalyse]?: Partial<ReponseAnalyse[K]> };

export function reponse(plus: Partiel = {}): ReponseAnalyse {
  const base: ReponseAnalyse = {
    forme: { indices: [{ image: 1, vu: 'une arête, deux pignons' }], valeur: 'deux-pans' },
    profil: { indices: [], valeur: 'droit' },
    faitage: { indices: [], sens: 'parallele-rue' },
    bouts: { indices: [], gauche: 'pignon', droite: 'pignon' },
    lucarnes: { indices: [], nombre: 0, types: [], pan: 'aucun' },
    cheminees: { indices: [{ image: 1, vu: 'deux souches de brique sur le faîtage' }], nombre: 2, souches: [{ position: 'faitage', materiau: 'brique' }, { position: 'faitage', materiau: 'brique' }] },
    terrasse: { indices: [], presente: 'non', type: 'sans-objet', acrotere: 'non', edicules: 0 },
    couverture: { indices: [{ image: 3, vu: 'ardoises fines et sombres' }], valeur: 'ardoise' },
    elements: [],
    facades: [{
      indices: [{ image: 1, vu: 'briques apparentes, joints clairs' }], facade: 'sud',
      ouvertures: { niveaux: 2, parNiveau: [3, 3], manquees: 0, enTrop: 0 },
      details: { volets: 'battants', coffre: 'non', balcon: 'non', forme: 'rectangulaire' },
      materiau: 'brique', ecart: '',
    }],
    ecarts: [],
    contradictions: [],
    confiance: 'forte',
  };
  const out = { ...base } as ReponseAnalyse;
  for (const [k, v] of Object.entries(plus)) {
    const cle = k as keyof ReponseAnalyse;
    (out as Record<string, unknown>)[cle] = Array.isArray(v) || typeof v !== 'object' || v === null ? v : { ...(base[cle] as object), ...(v as object) };
  }
  return out;
}
