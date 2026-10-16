// Sujet « facades » : le parement que Claude voit sur les facades (attribut materiauMurs : la texture des murs en 3D).

import { MATERIAUX_MURS_VUS, libelleDe } from '../../../model/ceQueJeVois.js';
import { textureDesMurs, type MateriauTexture } from '../../../model/couleurMur.js';
import type { IndiceAnalyse, Vote, VoteAnalyse } from '../../../model/analyseClaude.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, pluriel, type EntreeObservation, type EntreeSujet, type LigneObservation, type Sujet } from './contrat.js';

const MATERIAUX: readonly string[] = MATERIAUX_MURS_VUS.map((m) => m.code);

/** Le parement vu sur les facades : la valeur majoritaire parmi elles, portee par leur accord moyen. */
export function materiauDesFacades(v: VoteAnalyse): Vote<MateriauTexture> | null {
  const votes = v.facades.map((f) => f.materiau).filter((m) => m.valeur !== 'indetermine' && MATERIAUX.includes(m.valeur));
  if (!votes.length) return null;
  const comptes = new Map<string, Vote<MateriauTexture>[]>();
  for (const x of votes) comptes.set(x.valeur, [...(comptes.get(x.valeur) ?? []), x as Vote<MateriauTexture>]);
  const [valeur, liste] = [...comptes].sort((a, z) => z[1].length - a[1].length)[0] as [string, Vote<MateriauTexture>[]];
  if (liste.length * 2 <= votes.length && comptes.size > 1) return null;
  return { valeur: valeur as MateriauTexture, accord: Math.min(...liste.map((x) => x.accord)), indices: liste.flatMap((x) => x.indices) };
}

function propositionMateriau({ o, b, v, et }: EntreeSujet): Proposition | null {
  const m = materiauDesFacades(v);
  if (!m) return null;
  const actuel = textureDesMurs(o);
  if (actuel === m.valeur) return null;
  const choisi = o.couleurMurs?.materiau;
  const libelle = (x: MateriauTexture) => libelleDe(MATERIAUX_MURS_VUS, x);
  return deClaude({
    id: b.cle + ':claude:materiauMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Matériau des murs de ' + b.nom,
    avant: actuel ? libelle(actuel) : 'non renseigné', apres: libelle(m.valeur) + ', vu par Claude sur ' + pluriel(v.facades.length, 'façade'),
    effet: { type: 'materiauMurs', materiau: m.valeur },
  }, 'materiauMurs', m, et, [], choisi ? libelle(choisi) : null);
}

const VOLETS: Record<string, string> = { battants: 'volets battants', roulants: 'volets roulants', persiennes: 'persiennes', mixte: 'volets de plusieurs sortes', aucun: 'sans volets' };
const SILHOUETTES: Record<string, string> = { pignon: 'haut en pignon (triangle de mur)', croupe: 'haut en croupe (pan de toit)', trapeze: 'haut en trapèze (toit à croupes vu de côté)', rectangle: 'haut droit', rampe: 'haut en rampe (appentis)' };
const FORMES_BAIES: Record<string, string> = { cintree: 'baies cintrées', 'oeil-de-boeuf': 'œil-de-bœuf', mixte: 'baies de formes mêlées' };

/** Les details des ouvertures de chaque facade : volets, balcon, forme des baies, silhouette du haut. */
function observationsFacades({ v, reponses }: EntreeObservation): LigneObservation[] {
  const out: LigneObservation[] = [];
  for (const f of v.facades) {
    const vus = [[f.volets, VOLETS], [f.balcon, { oui: 'balcon' }], [f.formeOuvertures, FORMES_BAIES], [f.silhouette, SILHOUETTES]] as [Vote<string>, Record<string, string>][];
    const retenus = vus.filter(([x, table]) => x.valeur !== 'indetermine' && table[x.valeur]);
    const indices: IndiceAnalyse[] = reponses.flatMap((r) => r.facades.filter((x) => x.facade === f.facade).flatMap((x) => x.indices));
    if (retenus.length) out.push({ sujet: 'details:' + f.facade, texte: 'Façade ' + f.facade + ' : ' + retenus.map(([x, table]) => table[x.valeur]).join(', '), indices, accord: Math.min(...retenus.map(([x]) => x.accord)) });
  }
  return out;
}

export const facades: Sujet = { id: 'facades', attribut: 'materiauMurs', effet: 'materiauMurs', proposer: propositionMateriau, observer: observationsFacades };
