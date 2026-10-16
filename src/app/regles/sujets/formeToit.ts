// Sujet « formeToit » : la forme du toit vue par Claude sur les pignons et les croupes, relue sur la
// mesure LiDAR par le moteur (facade/regles/toits/faits.ts) : le sujet ne dessine jamais un toit.

import { AUTRES_FORMES, FORMES_COURANTES, libelleDe } from '../../../model/ceQueJeVois.js';
import { corpsSousContrainte, ecartsAuFait, plusGrand } from '../../../facade/regles/toits/faits.js';
import { formeDesCorps } from '../../../model/formeToit.js';
import type { Vote } from '../../../model/analyseClaude.js';
import type { BoutFait, FaitToit, ObservationFait } from '../../../regles/toits/faits.js';
import type { CorpsToit, FormeToitSimple } from '../../../model/types.js';
import type { Proposition } from '../../../regles/decisions.js';
import { deClaude, type EntreeSujet, type Sujet } from './contrat.js';

/**
 * Les formes que Plan sait lire sur la mesure, dans le vocabulaire du schema de Claude. Les autres
 * (Mansart, demi-croupe, toit en M...) restent des observations : le calcul n'en produit pas (spec
 * des toits §4), et les ecrire en deux pans ou en croupes serait inventer.
 */
const FORMES_LUES: Readonly<Record<string, FormeToitSimple>> = { plat: 'plat', appentis: 'appentis', 'deux-pans': 'deux-pans', croupes: 'croupes', pavillon: 'quatre-pans' };

/** Au-dela, la mesure ne porte plus la forme que Claude voit : pas de proposition (la tolerance d'une forme simple, spec des toits §2). */
export const ECART_FORME_MAX_M = 0.8;
const metres = (v: number) => (Math.round(v * 100) / 100).toFixed(2).replace('.', ',') + ' m';
/** L'ecart a la mesure du corps principal, celui que la forme vue decrit. */
const ecartPrincipal = (corps: readonly CorpsToit[]): number => (corps[plusGrand(corps)] as CorpsToit).ecart;

const estBout = (b: string): b is BoutFait => b === 'pignon' || b === 'croupe';
const libelleDeForme = (f: string): string => libelleDe([...FORMES_COURANTES, ...AUTRES_FORMES], f);

/** Les corps d'un batiment, dits en clair : sa forme et ce qui ferme les bouts du plus grand. */
function dire(corps: readonly CorpsToit[] | null | undefined, repli: string | undefined): string {
  const forme = formeDesCorps(corps) ?? repli;
  return forme ? libelleDeForme(forme).toLowerCase() : 'aucune forme lue';
}

/**
 * La forme du toit vue par Claude sur les pignons et les croupes, relue sur la mesure LiDAR : les
 * formes et les bouts vus deviennent l'observation d'un fait en contrainte (facade/regles/toits/faits.ts),
 * et le corps principal est relu parmi les seules formes admises. Rien n'est fabrique : si la mesure
 * ne porte pas cette forme, ou si Claude ne se contredit pas moins que le modele, il n'y a pas de
 * proposition et la ligne reste dans « Vu par Claude ». Le sens du faitage ne se pose pas : la rue
 * n'est pas dans le calcul. Les ecarts de forme que Claude a releves avec le rendu y sont joints.
 */
function propositionForme({ o, b, v, et, contra }: EntreeSujet): Proposition | null {
  if (!o.toitMesure || !('pts' in o) || !o.pts || o.pts.length < 3) return null;
  const forme = FORMES_LUES[v.forme.valeur];
  if (v.forme.valeur !== 'indetermine' && !forme) return null;
  const g = v.boutGauche.valeur, d = v.boutDroit.valeur;
  const bouts: [BoutFait, BoutFait] | undefined = estBout(g) && estBout(d) ? [g, d] : undefined;
  if (!forme && !bouts) return null;
  // Une forme et des bouts qui se contredisent ne se proposent pas : un pignon et une croupe sous un deux-pans, deux pignons sous un quatre-pans, des bouts sous un plat.
  const sansBouts = forme === 'plat' || forme === 'appentis';
  if (forme && bouts && (sansBouts || (forme === 'deux-pans' ? bouts.includes('croupe') : !bouts.includes('croupe')))) return null;
  const observation: ObservationFait = { ...(forme ? { forme: [forme] } : {}), ...(bouts ? { bouts } : {}) };
  const fait: FaitToit = { observation, application: 'contrainte' };
  const corps = corpsSousContrainte(fait, o.corpsToit ?? null, o.toitMesure, o.pts);
  if (!corps?.length || ecartsAuFait(fait, corps, o.pts).length) return null;
  if (JSON.stringify(corps) === JSON.stringify(o.corpsToit ?? null)) return null;
  if (ecartPrincipal(corps) > ECART_FORME_MAX_M) return null;
  const votes = [forme ? v.forme : null, bouts ? v.boutGauche : null, bouts ? v.boutDroit : null].filter((x): x is Vote<string> => !!x);
  const vote: Vote<unknown> = { valeur: observation, accord: Math.min(...votes.map((x) => x.accord)), indices: votes.flatMap((x) => x.indices) };
  const vus = [forme ? libelleDeForme(v.forme.valeur).toLowerCase() : null, bouts ? (bouts[0] === bouts[1] ? 'bouts en ' + bouts[0] : 'un bout en ' + bouts[0] + ', l’autre en ' + bouts[1]) : null].filter(Boolean).join(', ');
  const p = deClaude({
    id: b.cle + ':claude:formeToit', cible: { type: 'batiment', cle: b.cle }, objet: 'Forme du toit de ' + b.nom,
    avant: dire(o.corpsToit, o.toit?.forme), apres: dire(corps, undefined) + ', relue sur la mesure LiDAR d’après ce que Claude voit (' + vus + ')',
    effet: { type: 'corpsToit', corps },
  }, 'formeToit', vote, et, contra);
  // Les ecarts que Claude a releves entre le rendu et la photo sur la forme, les bouts et les corps : la raison de la ligne.
  const ecarts = v.ecarts.filter((e) => ['forme', 'bouts', 'corps'].includes(e.sujet)).map((e) => ({ texte: 'Écart avec le rendu : ' + e.observe + (e.modele ? ' (le modèle dit : ' + e.modele + ')' : '') }));
  // L'ajustement dit ce que coute la forme de Claude : la personne decide en connaissance de cause.
  const ajuste = { texte: 'Écart à la mesure LiDAR avec cette forme : ' + metres(ecartPrincipal(corps)) + (o.corpsToit?.length ? ' (aujourd’hui ' + metres(ecartPrincipal(o.corpsToit)) + ')' : '') };
  return { ...p, indices: [...p.indices, ajuste, ...ecarts] };
}

export const formeToit: Sujet = { id: 'formeToit', attribut: 'formeToit', effet: 'corpsToit', proposer: propositionForme };
