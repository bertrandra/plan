// Sujet « facades » : le parement que Claude voit sur les facades (attribut materiauMurs : la texture des murs en 3D).

import { MATERIAUX_MURS_VUS, libelleDe } from '../../../model/ceQueJeVois.js';
import { textureDesMurs, type MateriauTexture } from '../../../model/couleurMur.js';
import type { FacadeVotee, IndiceAnalyse, Vote, VoteAnalyse } from '../../../model/analyseClaude.js';
import type { Proposition } from '../../../regles/decisions.js';
import type { DetailsOuverture } from '../../../model/types.js';
import { COULEURS_VOLETS, GARAGES_VUS, OUVRANTS_VUS, PORTES_VUES, VITRAGES_VUS } from '../../../model/ouverturesVues.js';
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
  const choisi = o.batiment?.couleurMurs?.materiau;
  const libelle = (x: MateriauTexture) => libelleDe(MATERIAUX_MURS_VUS, x);
  return deClaude({
    id: b.cle + ':claude:materiauMurs', cible: { type: 'batiment', cle: b.cle }, objet: 'Matériau des murs de ' + b.nom,
    avant: actuel ? libelle(actuel) : 'non renseigné', apres: libelle(m.valeur) + ', vu par Claude sur ' + pluriel(v.facades.length, 'façade'),
    effet: { type: 'materiauMurs', materiau: m.valeur },
  }, 'materiauMurs', m, et, [], choisi ? libelle(choisi) : null);
}

const VOLETS: Record<string, string> = { battants: 'volets battants', roulants: 'volets roulants', persiennes: 'persiennes', mixte: 'volets de plusieurs sortes', aucun: 'sans volets' };
const SILHOUETTES: Record<string, string> = { triangle: 'haut en triangle', trapeze: 'haut en trapèze', rampe: 'haut en une seule rampe', 'ligne-droite': 'haut en ligne droite', marches: 'haut à marches', 'plusieurs-sommets': 'haut à plusieurs sommets' };
const BOUT_FACADE: Record<string, string> = { pignon: 'ferme un bout du faîtage en pignon', croupe: 'ferme un bout du faîtage en croupe', 'demi-croupe': 'ferme un bout du faîtage en demi-croupe', brisis: 'ferme un bout du faîtage en brisis', 'sans-objet': 'long pan, sans bout' };
const FORMES_BAIES: Record<string, string> = { cintree: 'baies cintrées', 'oeil-de-boeuf': 'œil-de-bœuf', mixte: 'baies de formes mêlées' };

const VOLETS_CLAUDE: Readonly<Record<string, NonNullable<DetailsOuverture['volets']>>> = { battants: 'battants', roulants: 'roulant', persiennes: 'persiennes', aucun: 'aucun' };
const DIRE_VOLETS: Readonly<Record<NonNullable<DetailsOuverture['volets']>, string>> = { battants: 'volets battants', roulant: 'volets roulants', persiennes: 'persiennes', aucun: 'sans volets' };
const DIRE_VITRAGE: Readonly<Record<NonNullable<DetailsOuverture['vitrage']>, string>> = { plein: 'verre plein', 'petits-bois': 'petits carreaux', 'imposte-petits-bois': 'imposte à petits carreaux' };
const DIRE_OUVRANT: Readonly<Record<NonNullable<DetailsOuverture['ouvrant']>, string>> = { battants: 'à la française', coulissant: 'coulissantes', guillotine: 'à guillotine', soufflet: 'à soufflet', fixe: 'fixes' };
const DIRE_PORTE: Readonly<Record<NonNullable<DetailsOuverture['remplissage']>, string>> = { pleine: 'porte pleine', vitree: 'porte vitrée', 'semi-vitree': 'porte semi-vitrée' };
const DIRE_GARAGE: Readonly<Record<NonNullable<DetailsOuverture['garage']>, string>> = { sectionnelle: 'garage sectionnel', basculante: 'garage basculant', battants: 'garage à battants', enroulable: 'garage enroulable' };

/** Ce que Claude dit des ouvertures d'une facade, dans le vocabulaire des details du releve, et en clair ; vide quand il ne dit rien d'utilisable. */
export function detailsDeLaFacade(f: FacadeVotee): { details: DetailsOuverture; votes: Vote<string>[]; textes: string[] } {
  const details: DetailsOuverture = {};
  const votes: Vote<string>[] = [];
  const textes: string[] = [];
  const poser = <K extends keyof DetailsOuverture>(k: K, valeur: DetailsOuverture[K] | undefined, vote: Vote<string>, texte: string | undefined) => {
    if (valeur === undefined) return;
    details[k] = valeur;
    votes.push(vote);
    if (texte) textes.push(texte);
  };
  const volets = VOLETS_CLAUDE[f.volets.valeur];
  // Un coffre au-dessus des baies dit un volet roulant, meme quand les tabliers sont releves.
  if (volets) poser('volets', volets, f.volets, undefined);
  else if (f.coffre.valeur === 'oui' && f.volets.valeur === 'indetermine') poser('volets', 'roulant', f.coffre, undefined);
  const couleur = COULEURS_VOLETS.find((c) => c.code === f.couleurVolets.valeur);
  if (details.volets && details.volets !== 'aucun') {
    textes.push(DIRE_VOLETS[details.volets] + (couleur ? ' ' + couleur.libelle : ''));
    poser('couleurVolets', couleur?.couleur, f.couleurVolets, undefined);
  } else if (details.volets) textes.push(DIRE_VOLETS[details.volets]);
  if (f.formeOuvertures.valeur === 'cintree') poser('forme', 'cintre', f.formeOuvertures, 'baies cintrées');
  const vitrage = VITRAGES_VUS[f.vitrage.valeur], ouvrant = OUVRANTS_VUS[f.ouvrant.valeur];
  poser('vitrage', vitrage, f.vitrage, vitrage && DIRE_VITRAGE[vitrage]);
  poser('ouvrant', ouvrant, f.ouvrant, ouvrant && 'fenêtres ' + DIRE_OUVRANT[ouvrant]);
  const porte = PORTES_VUES[f.porte.valeur], garage = GARAGES_VUS[f.garage.valeur];
  poser('remplissage', porte, f.porte, porte && DIRE_PORTE[porte]);
  poser('garage', garage, f.garage, garage && DIRE_GARAGE[garage]);
  return { details, votes, textes };
}

const COULEURS_DITES: Record<string, string> = Object.fromEntries(COULEURS_VOLETS.map((c) => [c.code, 'volets ' + c.libelle]));
const VITRAGES_DITS: Record<string, string> = { plein: 'verre plein', 'petits-bois': 'petits carreaux', 'imposte-petits-bois': 'imposte à petits carreaux', mixte: 'vitrages de plusieurs sortes' };
const OUVRANTS_DITS: Record<string, string> = { battants: 'fenêtres à la française', coulissant: 'fenêtres coulissantes', guillotine: 'fenêtres à guillotine', soufflet: 'fenêtres à soufflet', fixe: 'châssis fixes', mixte: 'ouvrants de plusieurs sortes' };
const PORTES_DITES: Record<string, string> = { pleine: 'porte pleine', vitree: 'porte vitrée', 'semi-vitree': 'porte semi-vitrée' };
const GARAGES_DITS: Record<string, string> = { sectionnelle: 'porte de garage sectionnelle', basculante: 'porte de garage basculante', battants: 'porte de garage à battants', enroulable: 'porte de garage enroulable' };

/** Les niveaux d'ouvertures d'une facade, en clair : « 2 niveaux d'ouvertures (3 + 2) » ; null quand Claude ne les compte pas. */
export function niveauxEnClair(f: FacadeVotee): string | null {
  const n = f.niveaux.valeur, par = f.parNiveau.valeur;
  if (typeof n !== 'number' || n <= 0) return null;
  return n + (n > 1 ? ' niveaux' : ' niveau') + ' d’ouvertures' + (par !== 'indetermine' && par.length === n ? ' (' + par.join(' + ') + ')' : '');
}

/** Les details des ouvertures de chaque facade : niveaux, volets, balcon, forme des baies, silhouette du haut. */
function observationsFacades({ v, reponses }: EntreeObservation): LigneObservation[] {
  const out: LigneObservation[] = [];
  for (const f of v.facades) {
    const vus = [[f.volets, VOLETS], [f.couleurVolets, COULEURS_DITES], [f.balcon, { oui: 'balcon' }], [f.formeOuvertures, FORMES_BAIES], [f.vitrage, VITRAGES_DITS], [f.ouvrant, OUVRANTS_DITS],
      [f.porte, PORTES_DITES], [f.garage, GARAGES_DITS], [f.silhouette, SILHOUETTES], [f.bout, BOUT_FACADE]] as [Vote<string>, Record<string, string>][];
    const retenus = vus.filter(([x, table]) => x.valeur !== 'indetermine' && table[x.valeur]);
    const niveaux = niveauxEnClair(f);
    const indices: IndiceAnalyse[] = reponses.flatMap((r) => r.facades.filter((x) => x.facade === f.facade).flatMap((x) => x.indices));
    const textes = [...(niveaux ? [niveaux] : []), ...retenus.map(([x, table]) => table[x.valeur] as string)];
    const accords = [...(niveaux ? [f.niveaux.accord] : []), ...retenus.map(([x]) => x.accord)];
    if (textes.length) out.push({ sujet: 'details:' + f.facade, texte: 'Façade ' + f.facade + ' : ' + textes.join(', '), indices, accord: Math.min(...accords) });
  }
  return out;
}

export const facades: Sujet = { id: 'facades', attribut: 'materiauMurs', effet: 'materiauMurs', proposer: propositionMateriau, observer: observationsFacades };
