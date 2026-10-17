// Le fait candidat d'un cas de promenade (MD/spec-regles-toits.md §10, point 2) : ce que « Ce que je vois » et la photo du cas permettent
// d'ecrire dans regles/toits/faits.json sans rien inventer, et ce qu'ils ne permettent pas encore.
//
// Un fait est une observation : on ne propose que ce que la personne a vu. La forme noter sur place devient `forme` quand c'est une forme
// simple (le vocabulaire des faits est ferme) ; les bouts qu'elle a notes deviennent `bouts` ; le sens du faitage qu'elle a note se
// deduit de la photo (face a la facade, son azimut est perpendiculaire a la facade, donc parallele a un faitage perpendiculaire a la rue).
// Une forme du catalogue (Mansart, papillon...) n'entre pas dans un fait : elle est dite dans `pistes`, avec ce que la surface LiDAR en lit.
// La decision reste a la personne qui trie : le candidat dit ce qu'il suppose (`a_verifier`), jamais il n'ecrit dans le depot.

import { lireFormes } from '../../lectureFormes.js';
import { toitMesureDepuisGrille } from '../../../model/toitMesure.js';
import type { CasAudit } from '../../../model/audit.js';
import type { FormeVue } from '../../../model/ceQueJeVois.js';
import type { FaitToit, ObservationFait, BoutFait } from '../../../regles/toits/faits.js';
import type { CorpsToit, FormeToitSimple, ToitMesure } from '../../../model/types.js';

export interface FaitCandidat {
  /** La cle BD TOPO du batiment : la cle du fait. */
  cle: string;
  fait: FaitToit;
  /** Ce que le candidat suppose et que seule la personne peut confirmer. */
  aVerifier: string[];
  /** Ce que la fiche ou la mesure disent et qu'un fait ne sait pas exprimer : une forme du catalogue, un autre sens... */
  pistes: string[];
}

const FORMES_FAITS: Readonly<Partial<Record<FormeVue, FormeToitSimple>>> = { plat: 'plat', appentis: 'appentis', 'deux-pans': 'deux-pans', croupes: 'croupes', pavillon: 'quatre-pans' };
const BOUTS_VUS: Readonly<Record<string, readonly [BoutFait, BoutFait]>> = { pignons: ['pignon', 'pignon'], croupes: ['croupe', 'croupe'], 'pignon-croupe': ['pignon', 'croupe'] };
const modulo180 = (a: number): number => ((Math.round(a) % 180) + 180) % 180;

/** Le fait que ce cas permet d'ecrire, ou null quand « Ce que je vois » n'affirme rien sur le toit. `promenade` : le nom du fichier, pour la preuve. */
export function faitCandidat(c: CasAudit, promenade: string): FaitCandidat | null {
  const cle = c.identite.cleBdtopo;
  const vu = c.vu;
  if (!cle || !vu) return null;
  const observation: ObservationFait = {};
  const aVerifier: string[] = [];
  const pistes: string[] = [];

  if (vu.forme && vu.forme !== 'autre') {
    const simple = FORMES_FAITS[vu.forme];
    if (simple) observation.forme = [simple];
    else pistes.push('Forme vue : ' + vu.forme + '. Un fait ne dit que les formes simples ; la lecture des formes du catalogue (surface LiDAR) la relit à l’audit.');
  }
  const bouts = vu.bouts ? BOUTS_VUS[vu.bouts] : undefined;
  if (bouts) observation.bouts = [bouts[0], bouts[1]];
  const azimut = c.constat.photos.find((p) => p.prise?.azimutDeg != null)?.prise?.azimutDeg;
  if (vu.sensFaitage) {
    if (azimut != null) {
      observation.faitage = { par: 'azimut', azimutDeg: modulo180(vu.sensFaitage === 'perpendiculaire' ? azimut : azimut + 90) };
      aVerifier.push('Le sens du faîtage se déduit de l’azimut de la photo (' + Math.round(azimut) + '°), prise face à la rue : à confirmer sur la carte.');
    } else {
      // Le sens se dit par rapport a la rue, que le fait ne connait pas : sans l'azimut d'une photo prise face a elle, rien ne s'ecrit.
      pistes.push('Faîtage ' + vu.sensFaitage + ' à la rue noté, mais aucune photo n’a d’azimut : un fait le dit en azimut (0 = nord), à lire sur la carte.');
    }
  }
  if (c.constat.problemes.includes('toit.morceaux')) {
    observation.corps = { min: 1, max: 1 };
    aVerifier.push('Le problème « toit en morceaux » est coché : un seul corps est supposé, à confirmer sur la carte.');
  }

  // La surface LiDAR du cas : ce que la lecture des formes y voit, pour une forme du catalogue que la fiche ne dit pas.
  const m: ToitMesure | null = c.sorties.toitMesure ?? (c.entrees.grille ? toitMesureDepuisGrille(c.entrees.grille, c.entrees.pts) : null);
  const corps: CorpsToit[] = c.sorties.corps ?? [];
  const lue = m && corps.length ? lireFormes(m, corps, c.entrees.pts)[0] : undefined;
  if (lue) pistes.push('La surface LiDAR dit « ' + lue.forme + ' » (' + lue.dit + '). À regarder avant de la retenir : un fait ne l’exprime pas, la proposition de l’audit oui.');

  if (!Object.keys(observation).length) return pistes.length ? { cle, fait: { observation, application: 'contrainte' }, aVerifier, pistes } : null;
  const fait: FaitToit = {
    observation, application: 'contrainte',
    preuve: { promenade, cas: c.id, photo: c.constat.photos.length > 0 },
    ...(c.identite.adresse ? { adresse: c.identite.adresse } : {}),
    historique: [{ t: new Date().toISOString().slice(0, 10), texte: 'observé sur le terrain, proposé depuis la fiche ; à valider' }],
  };
  return { cle, fait, aVerifier, pistes };
}
