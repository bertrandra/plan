// Les propositions de Claude (MD/spec-audit.md §13.2, §14 ; lot L17) : ce que le vote de ses trois
// passes (model/analyseClaude.ts) propose de changer dans le projet, dans la meme structure que les
// propositions des mesures (model/propositions.ts), source `claude`, avec ses indices (quelle image,
// ce qu'il y a vu) et sa confiance (la part des passes d'accord).
//
// Ce qui se propose, parce que le projet sait l'ecrire : la couverture, les cheminees, la toiture-
// terrasse, le materiau des murs (le parement lu sur les facades). La forme du toit, les pignons, les
// lucarnes, les elements, les ouvertures manquees ou en trop restent des observations, montrees a
// part sans rien ecrire (observationsClaude.ts) : les regles des toits (lots L19, L20) et les details
// du releve (lot L15) les ecriront.
//
// Une proposition de Claude arrive decochee tant que son taux d'accord n'est pas mesure a 95 %
// (spec-regles-toits §14.2, point 5), ou quand elle contredit un indice LiDAR (point 4).

import { contradictionsLidar, indicesLidar, reserveClaude, voter, estReponseAnalyse, type AttributClaude, type IndiceAnalyse, type ReponseAnalyse, type Vote, type VoteAnalyse } from '../../../model/analyseClaude.js';
import { AUTRES_FORMES, COUVERTURES_VUES, FORMES_COURANTES, MATERIAUX_MURS_VUS, libelleDe, type SoucheVue } from '../../../model/ceQueJeVois.js';
import { textureDesMurs, type MateriauTexture } from '../../../model/couleurMur.js';
import type { IndiceProposition, Proposition } from '../../../model/propositions.js';
import { corpsDesCheminees, corpsDeLaTerrasse, souchesSurLeCorps, terrasseVueSurLeCorps } from './propositions.js';
import type { EtiquetteImage, RenfortFacadeCapture } from '../../../model/auditParcelle.js';
import type { CorpsToit, CouvertureChoisie, FormeToitSimple, ObjetPlan, OuvertureFacade, ReleveFacade, TypeOuverture } from '../../../model/types.js';
import { bilanVide, texteBilan } from '../../../facade/renfortRecalage.js';
import { corpsSousContrainte, ecartsAuFait, plusGrand } from '../../../facade/faitsToits.js';
import { formeDesCorps } from '../../../model/formeToit.js';
import type { BoutFait, FaitToit, ObservationFait } from '../../../model/faitsToits.js';
import { avecGrille } from '../../../facade/verification.js';
import { cleMesure, type EntreesPropositions } from './propositions.js';
import type { LigneBatiment } from './liste.js';

/** Les reponses lues pour un batiment, et les etiquettes des images qu'il a recues. */
export interface ReponsesBatiment {
  reponses: unknown[];
  etiquettes: EtiquetteImage[];
}

/** Le materiau de couverture de Claude dans le vocabulaire du projet ; null quand le projet n'a pas ce terme. */
export function couvertureDuVocabulaire(v: string): CouvertureChoisie | null {
  const table: Record<string, CouvertureChoisie> = { 'tuile-plate': 'tuile-plate', 'tuile-canal': 'tuile-canal', 'tuile-mecanique': 'tuile', ardoise: 'ardoise', zinc: 'zinc' };
  return table[v] ?? null;
}

const MATERIAUX: readonly string[] = MATERIAUX_MURS_VUS.map((m) => m.code);
const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');

/** Les indices d'un vote dans la forme des propositions : la phrase, et la photo quand l'image en etait une. */
export function indicesDe(indices: readonly IndiceAnalyse[], etiquettes: readonly EtiquetteImage[]): IndiceProposition[] {
  return indices.map((i) => {
    const e = etiquettes[i.image - 1];
    const ou = e ? (e.photo ? 'photo ' + (e.photo.rang + 1) + (e.photo.cote !== undefined ? ' de la façade' : ' du toit') : e.texte.split(',')[0] ?? '') : 'image ' + i.image;
    return { texte: i.vu + ' (' + ou + ')', ...(e?.photo ? { photo: e.photo } : {}) };
  });
}

type Base = Pick<Proposition, 'id' | 'cible' | 'objet' | 'avant' | 'apres' | 'effet'>;

/** Une proposition de Claude : source, indices, confiance (la part des passes d'accord) et sa reserve. */
function deClaude(base: Base, attribut: AttributClaude, vote: Vote<unknown>, etiquettes: readonly EtiquetteImage[], contradictions: readonly string[], remplaceChoix: string | null = null): Proposition {
  return { ...base, source: 'claude', indices: indicesDe(vote.indices, etiquettes), confiance: vote.accord, remplaceChoix, reserve: reserveClaude(attribut, vote, contradictions) };
}

function propositionCouverture(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[], contra: readonly string[]): Proposition | null {
  const couverture = couvertureDuVocabulaire(v.couverture.valeur);
  if (!couverture || !o.toit || o.toit.couverture === couverture) return null;
  const choisie = o.toit.couverture;
  return deClaude({
    id: b.cle + ':claude:couverture', cible: { type: 'batiment', cle: b.cle }, objet: 'Couverture de ' + b.nom,
    avant: choisie ? libelleDe(COUVERTURES_VUES, choisie) : 'déduite par Plan', apres: libelleDe(COUVERTURES_VUES, couverture) + ', vue par Claude',
    effet: { type: 'couverture', couverture },
  }, 'couverture', v.couverture, et, contra, choisie ? libelleDe(COUVERTURES_VUES, choisie).toLowerCase() : null);
}

function propositionCheminees(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[], contra: readonly string[]): Proposition | null {
  const corps = o.corpsToit ?? [];
  const n = v.cheminees.valeur;
  if (typeof n !== 'number' || !corps.length) return null;
  const existantes = corps.flatMap((c) => c.cheminees ?? []);
  if (existantes.length === n) return null;
  const i = corpsDesCheminees(corps);
  const c = corps[i];
  if (!c) return null;
  const souches: SoucheVue[] = Array.from({ length: n }, (_, k) => {
    const s = v.souches[k];
    return { ...(s && s.position !== 'indetermine' ? { position: s.position } : {}), ...(s && s.materiau !== 'indetermine' ? { materiau: s.materiau } : {}) };
  });
  return deClaude({
    id: b.cle + ':claude:cheminees', cible: { type: 'batiment', cle: b.cle }, objet: 'Cheminées de ' + b.nom,
    avant: existantes.length ? pluriel(existantes.length, 'cheminée') : 'aucune cheminée',
    apres: (n ? pluriel(n, 'cheminée') : 'Aucune cheminée') + ', vue' + (n > 1 ? 's' : '') + ' par Claude',
    effet: { type: 'cheminees', corps: i, cheminees: souchesSurLeCorps(c, souches) },
  }, 'cheminees', v.cheminees, et, contra);
}

function propositionTerrasse(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[], contra: readonly string[]): Proposition | null {
  const corps = o.corpsToit ?? [];
  if (v.terrasse.valeur !== 'oui') return null;
  const i = corpsDeLaTerrasse(corps);
  const c = corps[i];
  if (!c) return null;
  const type = v.typeTerrasse.valeur;
  const vu = {
    ...(type === 'accessible' ? { accessible: true } : type === 'inaccessible' || type === 'technique' ? { accessible: false } : {}),
    ...(type === 'vegetalisee' ? { revetement: 'vegetalise' as const } : {}),
    ...(v.acrotere.valeur === 'oui' ? { acrotereM: 0.6 } : v.acrotere.valeur === 'non' ? { acrotereM: 0 } : {}),
    ...(typeof v.edicules.valeur === 'number' ? { edicules: v.edicules.valeur } : {}),
  };
  const t = c.terrasse;
  const detail = [type !== 'indetermine' && type !== 'sans-objet' ? type : null, v.acrotere.valeur === 'oui' ? 'acrotère' : null, typeof v.edicules.valeur === 'number' && v.edicules.valeur ? pluriel(v.edicules.valeur, 'édicule') : null].filter(Boolean).join(', ');
  return deClaude({
    id: b.cle + ':claude:terrasse', cible: { type: 'batiment', cle: b.cle }, objet: 'Toiture-terrasse de ' + b.nom,
    avant: t ? 'terrasse ' + (t.accessible ? 'accessible' : t.accessible === false ? 'inaccessible' : 'déjà décrite') : 'toit plat, sans détail',
    apres: 'Toiture-terrasse' + (detail ? ' ' + detail : '') + ', vue par Claude',
    effet: { type: 'terrasse', corps: i, terrasse: terrasseVueSurLeCorps(c, vu) },
  }, 'terrasse', v.terrasse, et, contra);
}

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
 * formes et les bouts vus deviennent l'observation d'un fait en contrainte (facade/faitsToits.ts),
 * et le corps principal est relu parmi les seules formes admises. Rien n'est fabrique : si la mesure
 * ne porte pas cette forme, ou si Claude ne se contredit pas moins que le modele, il n'y a pas de
 * proposition et la ligne reste dans « Vu par Claude ». Le sens du faitage ne se pose pas : la rue
 * n'est pas dans le calcul. Les ecarts de forme que Claude a releves avec le rendu y sont joints.
 */
function propositionForme(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[], contra: readonly string[]): Proposition | null {
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

function propositionMateriau(o: ObjetPlan, b: LigneBatiment, v: VoteAnalyse, et: readonly EtiquetteImage[]): Proposition | null {
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

/** Un ecart en clair, et la facade qu'il concerne (null pour un ecart du toit ou du batiment). */
export interface EcartClaude { texte: string; facade: string | null }

/** Les ecarts du vote, chacun avec sa facade : l'ecran des propositions y rattache les images de la facade. */
export function ecartsDuVote(v: VoteAnalyse): EcartClaude[] {
  const out: EcartClaude[] = v.ecarts.map((e) => ({ texte: e.sujet + ' : ' + e.observe + (e.modele ? ' (le modèle dit : ' + e.modele + ')' : ''), facade: null }));
  for (const f of v.facades) {
    const m = f.manquees.valeur, t = f.enTrop.valeur;
    const dire = (texte: string) => out.push({ texte: 'façade ' + f.facade + ' : ' + texte, facade: f.facade });
    if (typeof m === 'number' && m > 0) dire(pluriel(m, 'ouverture') + ' non détectée' + (m > 1 ? 's' : '') + ' par Plan');
    if (typeof t === 'number' && t > 0) dire(pluriel(t, 'ouverture') + ' détectée' + (t > 1 ? 's' : '') + ' en trop');
    f.ecarts.forEach(dire);
  }
  return out;
}

/** Ce que Claude a releve sans que le projet sache l'ecrire : les ecarts, en clair (observationsClaude.ts les montre). */
export function ecartsEnClair(v: VoteAnalyse): string[] {
  return ecartsDuVote(v).map((e) => e.texte);
}

/** Les propositions de Claude pour un batiment : vote des passes lues, controle croise, puis chaque attribut. */
export function propositionsClaudeDuBatiment(o: ObjetPlan, b: LigneBatiment, r: ReponsesBatiment): Proposition[] {
  const reponses = r.reponses.filter(estReponseAnalyse) as ReponseAnalyse[];
  if (!reponses.length) return [];
  const v = voter(reponses);
  const contra = [...contradictionsLidar(v, indicesLidar(o.toitMesure, o.corpsToit)), ...v.contradictions.map((c) => c.observation + ' (' + c.indiceLidar + ')')];
  const out: Proposition[] = [];
  for (const p of [propositionCouverture(o, b, v, r.etiquettes, contra), propositionCheminees(o, b, v, r.etiquettes, contra), propositionTerrasse(o, b, v, r.etiquettes, contra), propositionMateriau(o, b, v, r.etiquettes), propositionForme(o, b, v, r.etiquettes, contra)]) if (p) out.push(p);
  return out;
}

/** Toutes les propositions de Claude, batiment par batiment, dans l'ordre de la liste de controle. */
export function propositionsDeClaude(objets: readonly ObjetPlan[], batiments: readonly LigneBatiment[], parBatiment: Record<string, ReponsesBatiment>): Proposition[] {
  const parCle = new Map(objets.map((o) => [o.key, o]));
  return batiments.flatMap((b) => {
    const o = parCle.get(b.cle), r = parBatiment[b.cle];
    return o && r ? propositionsClaudeDuBatiment(o, b, r) : [];
  });
}

/** Le taux d'accord de Claude sur le releve des facades n'est pas encore mesure : ses propositions arrivent decochees. */
export const RESERVE_RENFORT = 'Taux d’accord de Claude non encore mesuré sur le relevé des façades : vérifiez ses ouvertures sur la photo.';
/** Les ouvertures que Claude voit sans que les contours de la photo les soutiennent : jamais cochees d'office. */
export const RESERVE_POINTILLE = 'Vue par Claude, non confirmée sur la photo : vérifiez-la avant de la garder.';
/** Quand la ligne du releve renforce existe aussi : dire que celle-ci la contient, pour que cocher les deux ne surprenne pas. */
const AVEC_LE_RENFORT = ' Cochée, cette ligne comprend aussi les ouvertures de la ligne « avec l’aide de Claude ».';

/** Le bilan d'une facade sans les ouvertures en pointille : elles ont leur propre ligne. */
const resumeSansPointille = (rf: RenfortFacadeCapture): string | null => texteBilan({ ...bilanVide(), ...rf.bilan, pointille: 0 });

/** Les ouvertures que Claude ajoute en pointille (graines que les contours ne soutiennent pas assez). */
export const ouverturesPointillees = (rf: RenfortFacadeCapture): OuvertureFacade[] => rf.decochees.filter((o) => o.source === 'claude');

/** Le nom d'un type d'ouverture, au singulier et au pluriel. */
const TYPES_OUVERTURE: Record<TypeOuverture, [string, string]> = {
  fenetre: ['fenêtre', 'fenêtres'], 'porte-fenetre': ['porte-fenêtre', 'portes-fenêtres'], porte: ['porte', 'portes'], garage: ['porte de garage', 'portes de garage'],
};

/** « 1 porte, 2 fenêtres » : les ouvertures par type, en clair. */
export function typesEnClair(ouvertures: readonly Pick<OuvertureFacade, 'type'>[]): string {
  const comptes = new Map<TypeOuverture, number>();
  for (const o of ouvertures) comptes.set(o.type, (comptes.get(o.type) ?? 0) + 1);
  return [...comptes].map(([t, n]) => n + ' ' + TYPES_OUVERTURE[t][n > 1 ? 1 : 0]).join(', ');
}

/**
 * Le renfort de Claude sur les facades (MD/spec-facades-calage-detection.md §12 bis, lot L18) : pour
 * chaque facade ou il a change quelque chose, le releve mesure avec ses ouvertures renforcees (graines
 * recalees sur l'image, retraits, types, details), source `claude`. Il remplacerait le releve des
 * mesures : il arrive decoche, et coche, il l'emporte (meme facade, meme effet, ecrit apres).
 *
 * Les ouvertures que Claude voit mais que la photo ne confirme pas (en pointille) ont leur propre
 * ligne, apres : le releve renforce plus elles, decochee. Elle vient apres et contient tout le
 * releve renforce : cochee seule ou avec la precedente, elle ecrit la meme chose.
 */
export function propositionsRenfort(e: EntreesPropositions, renfort: Record<string, RenfortFacadeCapture>): Proposition[] {
  const out: Proposition[] = [];
  for (const b of e.liste.batiments) for (const f of b.facades) {
    const id = cleMesure(b.cle, f.cote);
    const rf = renfort[id], mesure = e.mesures.get(id), mesure0 = mesure?.releve;
    if (!rf?.resume || !mesure0) continue;
    const n0 = mesure0.ouvertures.length;
    const base = {
      cible: { type: 'facade' as const, cle: b.cle, cote: f.cote }, objet: 'Façade ' + f.facade.orientation.toLowerCase() + ' de ' + b.nom,
      avant: pluriel(n0, 'ouverture') + ' mesurée' + (n0 > 1 ? 's' : '') + ' sur la photo',
      source: 'claude' as const, indices: [], confiance: rf.passes / 3, remplaceChoix: null,
    };
    const releveAvec = (liste: readonly OuvertureFacade[]): ReleveFacade => {
      const { ouvertures, grille } = avecGrille([...liste], mesure0.largeur);
      return { ...mesure0, ouvertures, ...(grille ? { grille } : {}) };
    };
    const resume = resumeSansPointille(rf);
    if (resume) {
      const releve = releveAvec(rf.ouvertures);
      out.push({ ...base, id: id + ':claude:releve', apres: pluriel(releve.ouvertures.length, 'ouverture') + ' avec l’aide de Claude (' + resume + ')', effet: { type: 'releve', releve }, reserve: RESERVE_RENFORT });
    }
    const pointillees = ouverturesPointillees(rf);
    if (pointillees.length) {
      const releve = releveAvec([...rf.ouvertures, ...pointillees]);
      const n = pointillees.length, s = n > 1 ? 's' : '';
      out.push({
        ...base, id: id + ':claude:pointille',
        apres: pluriel(releve.ouvertures.length, 'ouverture') + ', dont ' + typesEnClair(pointillees) + ' en pointillé, vue' + s + ' par Claude, non confirmée' + s + ' sur la photo',
        effet: { type: 'releve', releve }, reserve: RESERVE_POINTILLE + (resume ? AVEC_LE_RENFORT : ''),
      });
    }
  }
  return out;
}
