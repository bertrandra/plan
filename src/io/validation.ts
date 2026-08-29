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
export function validerProjetJSON(data){
  if(!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Structure inattendue : un objet JSON est attendu.');
  if(!Array.isArray(data.objects) || !data.objects.length) throw new Error('Aucun objet dans le fichier (cle "objects" absente ou vide).');
  const meta = (data.meta && typeof data.meta === 'object') ? data.meta : (data.name ? {name:data.name} : {});
  // Un fichier ecrit par une version plus recente peut contenir des champs que ce client ignore :
  // le charger puis l'enregistrer les effacerait sans bruit. On refuse plutot que de tenter une
  // lecture partielle (RELEASE.md 3.2). Un fichier sans `meta.schemaVersion` date d'avant le
  // versionnement du schema : c'est la version 1.
  const schemaFichier = Number.isFinite(meta.schemaVersion) ? meta.schemaVersion : 1;
  if(schemaFichier > SCHEMA_VERSION){
    throw Object.assign(new Error('Ce projet a ete enregistre par une version plus recente de l\'application (schema '
      + schemaFichier + '). Rechargez la page pour obtenir la derniere version.'), {motif:'schema'});
  }
  const fini = v => typeof v === 'number' && Number.isFinite(v);
  const objets = [];
  let ignores = 0;
  data.objects.forEach(o=>{
    if(!o || typeof o !== 'object' || typeof o.key !== 'string' || !o.key){ ignores++; return; }
    if(o.type === 'circle'){
      if(!o.center || !fini(o.center.x) || !fini(o.center.y) || !fini(o.r) || o.r <= 0){ ignores++; return; }
    } else if(o.type === 'polygon' || o.type === 'path'){
      if(!Array.isArray(o.pts) || o.pts.length < 2 || o.pts.some(p=>!p || !fini(p.x) || !fini(p.y))){ ignores++; return; }
    } else { ignores++; return; }
    objets.push(o);
  });
  if(!objets.length) throw new Error('Aucun objet exploitable : formes absentes ou coordonnees invalides.');
  // Une coordonnee absurde signe un fichier dans une autre unite (millimetres, pixels...) :
  // mieux vaut refuser que de charger un plan de 12 km de large impossible a retrouver a l'ecran.
  const horsLimite = objets.some(o => o.type === 'circle'
    ? (Math.abs(o.center.x) > 100000 || Math.abs(o.center.y) > 100000)
    : o.pts.some(p => Math.abs(p.x) > 100000 || Math.abs(p.y) > 100000));
  if(horsLimite) throw new Error('Coordonnees aberrantes (au-dela de 100 000 m) : le fichier n\'est probablement pas en metres.');
  return { meta, objets, mesures: Array.isArray(data.measures) ? data.measures : [], ignores };
}
