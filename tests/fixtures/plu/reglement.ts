// Un reglement du PLU lu pour un projet (lot L4), tel qu'il se range sur la parcelle : SYNTHETIQUE (ni Claude, ni le vrai texte de
// Chatou ; la zone, le document et les pages sont ceux de la commune, pour la vraisemblance). Lu par les tests de regles/plu/ et des
// regles de conformite.

import type { ReglementPlu } from '../../../src/regles/plu/faits.js';

export const REGLEMENT: ReglementPlu = {
  format: 'plan-reglement-plu', version: 1, zone: 'ULp', zoneLue: 'UL', document: '78146_PLU_20181003', insee: '78146',
  source: { url: 'https://data.geopf.fr/annexes/gpu/documents/DU_78146/d900/78146_reglement_20181003.pdf', page: 38, pages: [38, 62], pagesDocument: 252, empreinte: 'ab'.repeat(32), empreinteDocument: 'cd'.repeat(32), octets: 1000, luLe: '2026-10-29T10:00:00.000Z' },
  lecture: { modele: 'claude-haiku-5-5', prompt: 1, schema: 1, cout: 0.005, tokens: { entree: 1, ecritureCache: 2, lectureCache: 0, sortie: 3 }, brut: '{}', sortie: { regles: [] }, demandeeLe: '2026-10-29T10:00:00.000Z' },
  faits: [{ id: 'f1', grandeur: 'hauteur-egout-max', valeur: 7, termes: [], condition: '', article: 'UL 10', citation: 'La hauteur est limitée à 7 m.', page: 48, confiance: 'forte', statut: 'valide', valideLe: '2026-10-29' },
          { id: 'f2', grandeur: 'emprise-max', valeur: 40, termes: [], condition: '', article: 'UL 9', citation: 'L’emprise au sol est limitée à 40 %.', page: 47, confiance: 'forte', statut: 'propose' }],
  remarques: '',
};

