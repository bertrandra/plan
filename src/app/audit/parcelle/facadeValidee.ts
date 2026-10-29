// La validation d'une facade dans l'audit (MD/spec-facade-calage-audit.md §4 E9, point V4, lot F5) : la personne valide d'un geste
// le bilan de la facade (ses dimensions, sa forme, la pose de sa texture, ses ouvertures), et la Facade s'ecrit dans le projet, en un
// pas d'historique (validation.ts::validerFacade). Ici, pur : ce qui s'ecrit, et ce que la barre en dit ensuite.
//
// - Les dimensions sont celles du plan et du LiDAR (le bilan de l'orchestrateur) ; leur source est celle de la hauteur du batiment
//   (model/protections.ts) : une hauteur lue au LiDAR, prise a la BD TOPO, choisie par la personne, ou celle du defaut.
// - Les ouvertures sont celles du releve du mur (celui que l'audit a pose d'office, ou celui de la mesure), avec les carreaux que le
//   run de Claude y a lus (l'accord, par recouvrement), chacune avec son identifiant ; la personne les verifie en validant
//   (`verifieeLe`) : plus aucun rejeu ne les deplace.
// - Le parement est celui que lit le run de Claude, s'il le lit.

import { fusionnerOuvertures, numeroterOuvertures, recouvrement, RECOUVREMENT_MEME_OUVERTURE } from '../../../model/facadeObjet.js';
import { origineActuelle, type Origine } from '../../../model/protections.js';
import { observationsDuRun, surfaceDeLIa } from '../../../facade/regles/facades/ia.js';
import type { AccordFacadeCapture } from '../../../model/auditParcelle.js';
import type { RunEnregistre } from '../../../regles/facades/observations.js';
import type { DimensionsFacade, ObjetPlan, OuvertureFacade, ReleveFacade } from '../../../model/types.js';
import type { MesureFacade } from './mesures.js';
import type { EtapeCalculee } from '../../../facade/releve/enchainement.js';

/** D'ou viennent les dimensions : de la hauteur du batiment, telle que model/protections.ts la lit. */
function sourceDesDimensions(o: ObjetPlan): DimensionsFacade['source'] {
  const h: Origine = origineActuelle(o, 'hauteur');
  if (h === 'lidar') return 'lidar';
  if (h === 'bdtopo') return 'ign';
  return h === 'defaut' ? 'cadastre' : 'saisie';
}

/** Les carreaux que le run de Claude a lus sur une ouverture, portes sur celle du releve qu'elle recouvre de plus de moitie. */
function avecLesCarreaux(ouvertures: readonly OuvertureFacade[], accord: AccordFacadeCapture | null): OuvertureFacade[] {
  const lues = (accord?.ouvertures ?? []).filter((a) => a.details?.carreaux);
  if (!lues.length) return [...ouvertures];
  return ouvertures.map((o) => {
    if (o.details?.carreaux) return o;
    const a = lues.find((x) => recouvrement(x, o) > RECOUVREMENT_MEME_OUVERTURE);
    return a?.details?.carreaux ? { ...o, details: { ...o.details, carreaux: { ...a.details.carreaux } } } : o;
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
export function facadeAEcrire(o: ObjetPlan, m: MesureFacade, jour: string, accord: AccordFacadeCapture | null = null, run: RunEnregistre | null = null): ReleveFacade | null {
  const bilan = m.facade;
  if (!bilan || !m.releve) return null;
  const existant = o.batiment?.facades?.find((x) => x.cote === m.cote);
  const base = poseDOffice(o, m) ?? m.releve;
  // Les ouvertures que la personne avait deja verifiees restent ; les autres sont celles du releve, avec leurs carreaux.
  const ouvertures = numeroterOuvertures(fusionnerOuvertures(existant?.ouvertures ?? [], avecLesCarreaux(base.ouvertures, accord)), existant?.ouvertures ?? [])
    .map((x) => (x.verifieeLe ? x : { ...x, verifieeLe: jour }));
  const surface = run ? surfaceDeLIa(observationsDuRun(run)) : null;
  const r: ReleveFacade = {
    ...base, ouvertures,
    dimensions: { ...bilan.dimensions, source: sourceDesDimensions(o) },
    forme: bilan.forme,
    ...(surface ? { surface } : {}),
    ...(bilan.textureCalee ? { textureCalee: bilan.textureCalee } : {}),
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

/** Les etapes d'une mesure telles que la barre les montre : l'E9 faite quand la Facade de cette mesure est validee dans le projet. */
export function etapesApresValidation<E extends Pick<EtapeCalculee, 'id' | 'etat' | 'resume'>>(etapes: readonly E[], validee: ReleveFacade | null): E[] {
  if (!validee) return [...etapes];
  const n = validee.ouvertures.length;
  const resume = `Façade validée : ${n} ouverture${n > 1 ? 's' : ''} vérifiée${n > 1 ? 's' : ''}, dimensions, forme et texture écrites dans le projet.`;
  return etapes.map((e) => (e.id === 'validation' ? { ...e, etat: 'ok', resume } : e));
}
