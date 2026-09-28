// Export du projet en JSON, vers un fichier local (spec §3.2, io/).
//
// Le fichier produit est **exactement** la reponse de `api.php?action=load` — `{meta, objects,
// measures}`. Ce qui sort d'ici se recharge tel quel ici, et se repose sur `action=save` une fois
// remis a plat. L'import accepte les deux formes, et c'est ce qui fait de ce fichier un vrai format
// d'echange plutot qu'une sauvegarde privee.

import { slugFichier, horodatageFichier } from '../util/format.js';
import type { ObjetPlan, Mesure } from '../model/types.js';
import type { ObjetSerialise } from '../model/creation.js';
import type { MesureSerialisee } from './serialisation.js';
import type { EtatApp } from '../core/state.js';

/** Ce qu'un export doit pouvoir demander au reste du programme. */
export interface ContexteExportProjet {
  serializeObjects: (objets: ObjetPlan[]) => ObjetSerialise[];
  serializeMeasures: (mesures: Mesure[]) => MesureSerialisee[];
  telechargerTexte: (nom: string, texte: string, mime: string) => void;
  showToast: (message: string) => void;
  appVersion: string;
  schemaVersion: number;
  /** Les metadonnees du projet ouvert, si le serveur en a fourni. */
  metaProjet: () => Record<string, unknown>;
  /** L'instant de l'export. Injectable pour qu'un test ne depende pas de l'horloge. */
  maintenant?: () => string;
}

/**
 * Retire la parcelle et tout ce qui la reference.
 *
 * La cascade n'est pas un raffinement : retirer la parcelle seule produirait un fichier **casse a
 * la relecture**. Une cote perpendiculaire prend presque toujours un cote de parcelle comme
 * reference, et un parasol garde la cle de sa terrasse — les unes deviendraient orphelines, les
 * autres pointeraient dans le vide.
 *
 * Le lieu, lui, est remonte dans les metadonnees : il vit sur la parcelle mais decrit le projet, et
 * c'est lui qui cale la course du soleil. La cloture au contraire decrit la limite de propriete :
 * elle part avec la parcelle, et c'est voulu.
 */
export function filtrerSansParcelle(objsSer: ObjetSerialise[], msSer: MesureSerialisee[]) {
  const retirees = new Set(objsSer.filter(o => o.key === 'parcelle' || o.fonction === 'terrain').map(o => o.key));
  const objets = objsSer.filter(o => !retirees.has(o.key)).map(o =>
    (o.terrasseLieeKey && retirees.has(o.terrasseLieeKey)) ? { ...o, terrasseLieeKey: null } : o
  );
  const mesures = msSer.filter(m => !retirees.has(m.refObjKey) && !retirees.has(m.targetObjKey));
  const src = objsSer.find(o => retirees.has(o.key) && o.latitude !== undefined && o.latitude !== null);
  return {
    objets, mesures,
    lieu: src ? { latitude: src.latitude, longitude: src.longitude, nomLieu: src.nomLieu || null } : null,
    nbObjRetires: retirees.size,
    nbMesRetirees: msSer.length - mesures.length
  };
}

/**
 * Assemble le fichier de projet.
 *
 * `meta` porte deux horodatages et deux numeros de version. Les numeros ne sont pas decoratifs :
 * ils expliquent, deux ans plus tard, un fichier qui se comporte autrement que prevu
 * (RELEASE.md §5.2).
 */
export function construireFichierProjet(objets: ObjetSerialise[], mesures: MesureSerialisee[], sansParcelle: boolean, ctx: ContexteExportProjet) {
  const maintenant = (ctx.maintenant || (() => new Date().toISOString()))();
  const src = ctx.metaProjet() || {};
  const meta: Record<string, unknown> = {
    id: src.id || null,
    name: src.name || 'Plan interactif',
    createdAt: src.createdAt || null,
    updatedAt: src.updatedAt || null,
    exportedAt: maintenant,
    exportedBy: 'plan.html',
    appVersion: ctx.appVersion,
    schemaVersion: ctx.schemaVersion,
    writtenAt: maintenant
  };
  let objs = objets, ms = mesures, bilan = '';
  if (sansParcelle) {
    const f = filtrerSansParcelle(objets, mesures);
    // Un fichier sans aucun objet ne se relit pas : mieux vaut refuser que produire l'inutilisable.
    if (!f.objets.length) return null;
    objs = f.objets; ms = f.mesures;
    meta.sansParcelle = true;
    if (f.lieu) meta.lieu = f.lieu;
    bilan = ' Sans parcelle : ' + f.nbObjRetires + ' objet(s) et ' + f.nbMesRetirees + ' mesure(s) retire(s).';
  }
  const nom = slugFichier(String(meta.name)) + '-' + horodatageFichier() + (sansParcelle ? '-sans-parcelle' : '') + '.json';
  return { nom, texte: JSON.stringify({ meta, objects: objs, measures: ms }, null, 2), objs, ms, bilan };
}

/** Assemble le fichier, le propose au telechargement, et dit ce qu'il contient. */
export function exporterProjetJSON(etat: EtatApp, sansParcelle: boolean, ctx: ContexteExportProjet): void {
  const fichier = construireFichierProjet(
    ctx.serializeObjects(etat.objects), ctx.serializeMeasures(etat.measures), sansParcelle, ctx
  );
  if (!fichier) {
    ctx.showToast('Export annule : il ne reste aucun objet une fois la parcelle retiree.');
    return;
  }
  ctx.telechargerTexte(fichier.nom, fichier.texte, 'application/json');
  ctx.showToast('Export JSON : ' + fichier.objs.length + ' objet(s), ' + fichier.ms.length + ' mesure(s).' + fichier.bilan);
}
