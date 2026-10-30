// Les faits du projet qu'une piece ecrite du dossier peut dire (lot L5 de la lecture IA elargie, §5.4) : ce que Claude recoit pour
// rediger un brouillon (usage `texte`), et dont l'empreinte dit si ce brouillon est perime.
//
// Pur et deterministe : le meme projet donne le meme texte, au caractere pres (pas d'heure, pas d'identifiant tire au sort, l'ordre
// des objets du plan). Seul ce qui est sur le plan entre : les ouvrages declares tels que le cerfa les decrit (export/cerfa13703.ts),
// l'existant, la cloture, la zone du PLU et les seules regles que la personne a VALIDEES, les protections patrimoniales. Rien du
// declarant (nom, date de naissance) : la piece n'en a pas besoin, et ce qui ne sert pas ne part pas.

import { sha256Texte } from '../util/sha256.js';
import { ouvragesDeclares, referencesDuTerrain } from './cerfa13703.js';
import { clotureDe, libelleTypeCloture } from '../model/cloture.js';
import { estBatiment, parcelleDuProjet } from '../model/fonctions.js';
import { ouvrage } from '../model/ouvrages/index.js';
import { hauteurAuPointLePlusHaut } from '../model/volumesToit.js';
import { faitsValides, GRANDEURS_PLU, valeurLisible } from '../regles/plu/faits.js';
import type { ObjetPlan } from '../model/types.js';

export interface FaitsDossier {
  terrain: { adresse: string; commune: string; references: string[]; superficieM2: number | null };
  ouvrages: { nom: string; nature: string; description: string; empriseM2: number; hauteurM: number }[];
  existant: { nom: string; nature: string; hauteurM: number | null; couverture: string | null }[];
  cloture: { type: string; hauteurM: number } | null;
  plu: { zone: string; regles: { regle: string; valeur: string; article: string; condition: string }[] } | null;
  protections: string[];
}

const arrondi = (v: number, d = 2): number => Math.round(v * 10 ** d) / 10 ** d;

/** Les faits du projet, dans l'ordre du plan. */
export function faitsDuDossier(objets: readonly ObjetPlan[]): FaitsDossier {
  const parcelle = parcelleDuProjet(objets as ObjetPlan[]);
  const cad = (parcelle?.cadastre || {}) as Record<string, unknown>;
  const refs = referencesDuTerrain(parcelle);
  const superficie = refs.reduce((s, x) => s + x.surface, 0);
  const ouvrages = ouvragesDeclares(objets as ObjetPlan[]).map((o) => ({ nom: o.nom, nature: o.nature, description: o.description, empriseM2: arrondi(o.emprise, 1), hauteurM: arrondi(o.hauteur) }));
  const existant = objets.filter((o) => estBatiment(o) || o.existant === true).map((o) => ({
    nom: o.name, nature: estBatiment(o) ? 'bâtiment' : ouvrage(o.fonction).libelle.toLowerCase(),
    hauteurM: estBatiment(o) ? arrondi(hauteurAuPointLePlusHaut(o)) : null,
    couverture: estBatiment(o) ? (o.batiment?.toit?.couverture ?? null) : null,
  }));
  const cl = parcelle ? clotureDe(parcelle) : null;
  const plu = parcelle?.plu;
  const protections = plu ? [
    ...(plu.spr.length ? ['site patrimonial remarquable'] : []),
    ...(plu.servitudes.some((s) => s.type === 'AC1') ? ['abords d’un monument historique'] : []),
    ...(plu.servitudes.some((s) => s.type === 'AC2') ? ['site inscrit ou classé'] : []),
  ] : [];
  return {
    terrain: {
      adresse: String(cad.adresse || parcelle?.nomLieu || ''), commune: String(cad.commune || ''),
      references: refs.map((x) => x.prefixe + ' ' + x.section + ' ' + x.numero), superficieM2: superficie ? Math.round(superficie) : null,
    },
    ouvrages, existant,
    cloture: cl && cl.active ? { type: libelleTypeCloture(cl.defaut.type), hauteurM: arrondi(cl.defaut.hauteur) } : null,
    plu: plu && plu.zones.length ? {
      zone: plu.zones[0]?.libelle ?? '',
      regles: faitsValides(parcelle?.reglementPlu).map((f) => ({ regle: GRANDEURS_PLU[f.grandeur].libelle, valeur: valeurLisible(f), article: f.article, condition: f.condition })),
    } : null,
    protections,
  };
}

/** Les faits en texte, tels qu'ils partent a Claude : du JSON indente, dans l'ordre des cles du type. */
export const texteDesFaits = (f: FaitsDossier): string => JSON.stringify(f, null, 2);

/** L'empreinte des faits de ce projet (SHA-256 du texte) : celle d'un brouillon redige sur un autre projet en differe. */
export const empreinteFaits = (objets: readonly ObjetPlan[]): string => sha256Texte(texteDesFaits(faitsDuDossier(objets)));
