// La validation d'une facade dans l'audit (MD/spec-facade-calage-audit.md §4 E11, point V4, lot F5) : la personne valide d'un geste
// le bilan de la facade (ses dimensions, sa forme, la pose de sa texture, ses ouvertures), et la Facade s'ecrit dans le projet, en un
// pas d'historique (validation.ts::validerFacade). Ici, pur : ce qui s'ecrit, et ce que la barre en dit ensuite.
//
// - Les dimensions sont celles du plan et du LiDAR (le bilan de l'orchestrateur) ; leur source est celle de la hauteur du batiment
//   (model/protections.ts) : une hauteur lue au LiDAR, prise a la BD TOPO, choisie par la personne, ou celle du defaut.
// - Les ouvertures sont celles du releve du mur (celui que l'audit a pose d'office, ou celui de la mesure), avec les carreaux que le
//   run de Claude y a lus (l'accord, par recouvrement), chacune avec son identifiant ; la personne les verifie en validant
//   (`verifieeLe`) : plus aucun rejeu ne les deplace.
// - Le parement est celui que lit le run de Claude, s'il le lit ; de meme la modenature, le store et l'etat du mur signale (lot L1 de
//   MD/spec-lecture-ia-elargie.md), et sur chaque ouverture la menuiserie, la couleur des volets et le garde-corps.
// - La fenetre d'une lucarne que le toit porte devant ce mur n'est pas une ouverture du mur (lot F7) : un element n'a qu'un endroit,
//   le toit (MD/spec-facade-calage-audit.md §5 quater).

import { fusionnerOuvertures, numeroterOuvertures, ouverturesHorsDesLucarnes } from '../../../model/facadeObjet.js';
import { lucarnesDevantLeMur } from '../../../facade/regles/toits/elementsDesMurs.js';
import { facadesDuContour } from '../../../geometry/cotesVusDeDehors.js';
import { partagerSousLesVoisins, type PartageOuvertures } from '../../../facade/releve/murVoisin.js';
import { origineActuelle, type Origine } from '../../../model/protections.js';
import { observationsDuRun, surfaceDeLIa } from '../../../facade/regles/facades/ia.js';
import { appendicesDeLIa, modenatureDeLIa } from '../../../facade/regles/facades/modenature.js';
import { etatDeLIa } from '../../../facade/regles/facades/etat.js';
import { sontRelues, type AccordFacadeCapture, type MurConfirme, type OuverturesRelues } from '../../../model/auditParcelle.js';
import type { RunEnregistre } from '../../../regles/facades/observations.js';
import type { DimensionsFacade, ObjetPlan, OuvertureFacade, PtBrut, ReleveFacade } from '../../../model/types.js';
import type { MesureFacade } from './mesures.js';
import type { EtapeCalculee } from '../../../facade/releve/enchainement.js';

/** D'ou viennent les dimensions : de la hauteur du batiment, telle que model/protections.ts la lit. */
function sourceDesDimensions(o: ObjetPlan): DimensionsFacade['source'] {
  const h: Origine = origineActuelle(o, 'hauteur');
  if (h === 'lidar') return 'lidar';
  if (h === 'bdtopo') return 'ign';
  return h === 'defaut' ? 'cadastre' : 'saisie';
}

/**
 * Les ouvertures que la facade montre et que V4 ecrit : celles que la personne a relues (V3), tant qu'elles valent pour cette detection ;
 * sinon celles de l'accord de Claude que l'enchainement a fait (E9 : les detections, ses details en plus, les devinees qu'il confirme ;
 * decision 4, plus de calcul a cote) ; sinon celles du releve.
 */
function ouverturesMontrees(m: MesureFacade, base: ReleveFacade, accord: AccordFacadeCapture | null, relues: OuverturesRelues | null = null): OuvertureFacade[] {
  if (relues && m.releve && sontRelues(relues, m.releve.ouvertures)) return relues.ouvertures.map((x) => ({ ...x }));
  return (m.accord ?? accord)?.ouvertures.map((x) => ({ ...x })) ?? [...base.ouvertures];
}

/** Les lucarnes du toit qui se voient sur ce mur du contour (lot F7) : leurs fenetres ne sont pas des ouvertures du mur. */
function lucarnesDuMur(o: ObjetPlan, cote: number): ReturnType<typeof lucarnesDevantLeMur> {
  const pts = 'pts' in o && Array.isArray(o.pts) ? (o.pts as PtBrut[]) : null;
  const f = pts && pts.length >= 3 ? facadesDuContour(pts, 0).find((x) => x.cote === cote) : undefined;
  return f ? lucarnesDevantLeMur(o.batiment?.corpsToit ?? [], f.gauche, f.droite) : [];
}

/**
 * Le partage des ouvertures de cette mesure entre son mur et les murs voisins (facade/releve/murVoisin.ts), sur les facades du projet au
 * moment de valider : une ouverture lue sous le pignon d'un corps voisin va sur la facade du mur qui la porte, s'il en a une.
 */
function partageDeLaMesure(o: ObjetPlan, cote: number, largeurM: number, ouvertures: readonly OuvertureFacade[]): PartageOuvertures | null {
  const pts = 'pts' in o && Array.isArray(o.pts) ? (o.pts as PtBrut[]) : null;
  const f = pts && pts.length >= 3 ? facadesDuContour(pts, 0).find((x) => x.cote === cote) : undefined;
  if (!pts || !f) return null;
  const voisines = (o.batiment?.facades ?? []).filter((r) => r.cote !== cote).map((r) => ({ cote: r.cote, ouvertures: r.ouvertures }));
  return partagerSousLesVoisins({ ...f, largeur: largeurM }, pts, ouvertures, voisines);
}

/**
 * Les facades des murs voisins a reecrire avec la validation de cette mesure (V4, dans le meme pas d'historique) : chacune avec les
 * ouvertures lues sous le pignon de son corps, ajoutees `detectee` et numerotees a la suite. Rien d'autre d'elles ne change : leurs
 * ouvertures (verifiees, corrigees, ajoutees ou non), leur texture, leurs dimensions. Vide quand aucune ouverture ne va ailleurs.
 */
export function facadesVoisinesAEcrire(o: ObjetPlan, m: MesureFacade, accord: AccordFacadeCapture | null = null): ReleveFacade[] {
  const base = m.releve && (poseDOffice(o, m) ?? m.releve);
  const p = base ? partageDeLaMesure(o, m.cote, base.largeur, ouverturesMontrees(m, base, accord)) : null;
  return (p?.ajouts ?? []).flatMap((a) => {
    const r = o.batiment?.facades?.find((x) => x.cote === a.cote);
    return r ? [{ ...r, ouvertures: numeroterOuvertures([...r.ouvertures, ...a.ouvertures], r.ouvertures) }] : [];
  });
}

/** Le releve du mur que l'audit a pose d'office d'apres cette mesure, s'il est dans le projet. */
function poseDOffice(o: ObjetPlan, m: MesureFacade): ReleveFacade | null {
  const r = o.batiment?.facades?.find((x) => x.cote === m.cote);
  return r && m.releve && r.releveLe === m.releve.releveLe ? r : null;
}

/**
 * La Facade a ecrire sur le mur de cette mesure, validee le jour `jour` : le releve (pose d'office s'il est la, sinon celui de la
 * mesure), ses dimensions, sa forme, son parement, la pose de sa texture, ses ouvertures numerotees et verifiees. Null sans bilan (une
 * mesure relue d'un fichier d'audit : « Rejouer la façade » le refait).
 */
export function facadeAEcrire(o: ObjetPlan, m: MesureFacade, jour: string, accord: AccordFacadeCapture | null = null, run: RunEnregistre | null = null, murConfirme: MurConfirme | null = null, relues: OuverturesRelues | null = null): ReleveFacade | null {
  const bilan = m.facade;
  if (!bilan || !m.releve) return null;
  const existant = o.batiment?.facades?.find((x) => x.cote === m.cote);
  const base = poseDOffice(o, m) ?? m.releve;
  // Les ouvertures que la personne avait deja verifiees restent ; les autres sont celles du releve, avec leurs carreaux, sauf celles
  // qui vont sur la facade d'un mur voisin (facadesVoisinesAEcrire).
  // Les ouvertures que la personne a relues (V3), tant qu'elles valent pour cette detection : ce que la barre a montre et ce qui s'ecrit.
  const lues = ouverturesMontrees(m, base, accord, relues);
  const surLeMur = partageDeLaMesure(o, m.cote, base.largeur, lues)?.surLeMur ?? lues;
  const ouvertures = numeroterOuvertures(ouverturesHorsDesLucarnes(fusionnerOuvertures(existant?.ouvertures ?? [], surLeMur), lucarnesDuMur(o, m.cote)), existant?.ouvertures ?? [])
    .map((x) => (x.verifieeLe ? x : { ...x, verifieeLe: jour }));
  const obs = run ? observationsDuRun(run) : null;
  const surface = surfaceDeLIa(obs);
  // La facade enrichie (lot L1) : la modenature (les descentes retrouvees par la detection seulement), le store, l'etat du mur signale.
  const mur = { largeurM: bilan.dimensions.largeurM, egoutM: bilan.dimensions.egoutM };
  const modenature = modenatureDeLIa(obs, mur, accord?.descentes ?? null);
  const appendices = appendicesDeLIa(obs, mur);
  const etat = etatDeLIa(obs, jour);
  // Le mur confirme par la personne au point V1, tant que l'E5 le dit confirme : il s'ecrit avec le calage du releve.
  const confirme = murConfirme && m.etapes?.find((e) => e.id === 'calage')?.etat === 'confirme' ? murConfirme.le : null;
  const r: ReleveFacade = {
    ...base, ouvertures,
    ...(confirme ? { calage: { ...(base.calage ?? { photos: [] }), murConfirmeLe: confirme } } : {}),
    dimensions: { ...bilan.dimensions, source: sourceDesDimensions(o) },
    forme: bilan.forme,
    ...(surface ? { surface } : {}),
    ...(bilan.textureCalee ? { textureCalee: bilan.textureCalee } : {}),
    ...(modenature ? { modenature } : {}),
    ...(appendices.length ? { appendices } : {}),
    ...(etat.length ? { etat } : {}),
  };
  // Valide par la personne : ce n'est plus le releve que l'audit pose tout seul, une nouvelle photo ne le remplacera plus d'office.
  delete r.depuisAudit;
  return r;
}

/** La Facade validee de ce mur, d'apres cette mesure : celle que la validation V4 a ecrite (ses dimensions y sont). */
export function facadeValideeDe(objets: readonly ObjetPlan[], cle: string, m: MesureFacade | undefined): ReleveFacade | null {
  if (!m?.releve) return null;
  const r = objets.find((o) => o.key === cle)?.batiment?.facades?.find((x) => x.cote === m.cote);
  return r && r.dimensions && !r.depuisAudit && r.releveLe === m.releve.releveLe ? r : null;
}

/** Les etapes d'une mesure telles que la barre les montre : l'E11 faite quand la Facade de cette mesure est validee dans le projet. */
export function etapesApresValidation<E extends Pick<EtapeCalculee, 'id' | 'etat' | 'resume'>>(etapes: readonly E[], validee: ReleveFacade | null): E[] {
  if (!validee) return [...etapes];
  const n = validee.ouvertures.length;
  const resume = `Façade validée : ${n} ouverture${n > 1 ? 's' : ''} vérifiée${n > 1 ? 's' : ''}, dimensions, forme et texture écrites dans le projet.`;
  return etapes.map((e) => (e.id === 'validation' ? { ...e, etat: 'ok', resume } : e));
}
