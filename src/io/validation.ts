// Validation d'un fichier de projet avant chargement (spec §3.2, io/).
//
// Cette fonction est la porte d'entree : tout ce qui arrive d'un fichier passe par elle, et elle
// **refuse** plutot que de charger a moitie. Trois refus, chacun pour une raison differente :
//
// - un schema plus recent que celui du client — le charger puis l'enregistrer effacerait sans bruit
//   les champs que cette version ignore (RELEASE.md §3.2) ;
// - des coordonnees au-dela de 100 km — c'est la signature d'un fichier dans une autre unite
//   (millimetres, pixels), et le plan serait impossible a retrouver a l'ecran ;
// - aucun objet exploitable.
//
// Les objets mal formes, eux, sont **ignores un par un** et comptes : un fichier partiellement
// abime reste chargeable, et l'utilisateur apprend combien de formes ont ete laissees de cote.

import { SCHEMA_VERSION } from '../model/version.js';
import type { ObjetBrut, ObjetAPoints, Mesure, PtBrut } from '../model/types.js';

/**
 * Un projet, tel qu'il sort de `JSON.parse` : rien n'est garanti, tout reste a verifier champ par
 * champ. C'est le seul endroit du programme qui a le droit de le voir sous cette forme —
 * `validerProjetJSON` existe pour que le reste du code n'ait jamais a la rencontrer.
 */
interface ProjetBrut {
  objects?: unknown;
  measures?: unknown;
  meta?: unknown;
  name?: unknown;
}

/** Ce qu'un projet valide rend : des objets exploitables, et le compte de ceux ecartes en route. */
export interface ProjetValide {
  meta: { name?: string; lieu?: { latitude?: number; longitude?: number; nomLieu?: string }; [autreChamp: string]: unknown };
  objets: ObjetBrut[];
  mesures: Partial<Mesure>[];
  ignores: number;
}

export function validerProjetJSON(data: unknown): ProjetValide {
  if(!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Structure inattendue : un objet JSON est attendu.');
  // Rien de plus n'est verifie par ce cast : c'est la forme d'un candidat, pas une garantie. Chaque
  // champ est encore verifie a sa lecture, ci-dessous.
  const brut = data as ProjetBrut;
  if(!Array.isArray(brut.objects) || !brut.objects.length) throw new Error('Aucun objet dans le fichier (cle "objects" absente ou vide).');
  // Le test est une verite (`data.name ?`), pas un type : un `name` truthy non textuel serait quand
  // meme repris tel quel, exactement comme avant. Le cast dit cela plutot que de resserrer le test.
  const meta: ProjetValide['meta'] = (brut.meta && typeof brut.meta === 'object')
    ? brut.meta as ProjetValide['meta']
    : (brut.name ? {name: brut.name as string} : {});
  // Un fichier ecrit par une version plus recente peut contenir des champs que ce client ignore :
  // le charger puis l'enregistrer les effacerait sans bruit. On refuse plutot que de tenter une
  // lecture partielle (RELEASE.md 3.2). Un fichier sans `meta.schemaVersion` date d'avant le
  // versionnement du schema : c'est la version 1.
  const schemaFichier: number = Number.isFinite(meta.schemaVersion) ? (meta.schemaVersion as number) : 1;
  if(schemaFichier > SCHEMA_VERSION){
    throw Object.assign(new Error('Ce projet a ete enregistre par une version plus recente de l\'application (schema '
      + schemaFichier + '). Rechargez la page pour obtenir la derniere version.'), {motif:'schema'});
  }
  const fini = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
  const objets: ObjetBrut[] = [];
  let ignores = 0;
  (brut.objects as unknown[]).forEach(o=>{
    if(!o || typeof o !== 'object' || typeof (o as ObjetBrut).key !== 'string' || !(o as ObjetBrut).key){ ignores++; return; }
    const ob = o as ObjetBrut;
    if(ob.type === 'circle'){
      if(!ob.center || !fini(ob.center.x) || !fini(ob.center.y) || !fini(ob.r) || ob.r <= 0){ ignores++; return; }
    } else if(ob.type === 'polygon' || ob.type === 'path'){
      if(!Array.isArray(ob.pts) || ob.pts.length < 2 || ob.pts.some(p=>!p || !fini(p.x) || !fini(p.y))){ ignores++; return; }
    } else { ignores++; return; }
    objets.push(ob);
  });
  if(!objets.length) throw new Error('Aucun objet exploitable : formes absentes ou coordonnees invalides.');
  // Une coordonnee absurde signe un fichier dans une autre unite (millimetres, pixels...) :
  // mieux vaut refuser que de charger un plan de 12 km de large impossible a retrouver a l'ecran.
  const loin = (p: PtBrut) => Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000;
  const horsLimite = objets.some(o => o.type === 'circle'
    ? !!o.center && loin(o.center)
    : ((o as Partial<ObjetAPoints>).pts ?? []).some(loin));
  if(horsLimite) throw new Error('Coordonnees aberrantes (au-dela de 100 000 m) : le fichier n\'est probablement pas en metres.');
  return { meta, objets, mesures: Array.isArray(brut.measures) ? brut.measures as Partial<Mesure>[] : [], ignores };
}
