// Serialisation des objets et des cotes vers le format de projet (spec §3.2, io/).
//
// `serializeObjects` est une **liste blanche**, et c'est sa raison d'etre : un champ qui n'est pas
// nomme ici disparait silencieusement au premier enregistrement. C'est un choix - il garantit qu'un
// projet enregistre ne contient que des donnees, jamais un noeud DOM ni un objet Three - mais il a
// un cout : ajouter un attribut a une forme sans l'ajouter ici, c'est le perdre.
//
// Les booleens passent par `!!` et les objets absents par `|| null` : le fichier de projet doit
// avoir la meme forme quel que soit l'etat de la memoire, sinon deux enregistrements du meme plan
// ne se comparent pas.
export function serializeObjects(objs){
  return objs.map(o=>{
    const out: Record<string, unknown> = {
      key:o.key, type:o.type, name:o.name,
      fill:o.fill, fillOpacity:o.fillOpacity, stroke:o.stroke,
      showName:!!o.showName, showSegNames:!!o.showSegNames, showVertNames:!!o.showVertNames,
      showDims:!!o.showDims, showAngles:!!o.showAngles, constrained:!!o.constrained,
      fonction:o.fonction, matiere:o.matiere, priority:o.priority, locked:!!o.locked,
      elevation:o.elevation,
      textureVerticale: o.textureVerticale || null,
      textureHorizontale: o.textureHorizontale || null,
      altitude:o.altitude, hidden:!!o.hidden,
      clotureActive: !!o.clotureActive, clotureHauteur: o.clotureHauteur,
      clotureCouleur: o.clotureCouleur, clotureTexture: o.clotureTexture || null,
      diametreArbre: o.diametreArbre, couleurArbre: o.couleurArbre,
      textureArbre: o.textureArbre || null,
      latitude: o.latitude, longitude: o.longitude, nomLieu: o.nomLieu,
      hauteurParasol: o.hauteurParasol, terrasseLieeKey: o.terrasseLieeKey || null,
      matSurPerimetre: !!o.matSurPerimetre, matDeporte: !!o.matDeporte, matAngleDeg: o.matAngleDeg,
      // Tracabilite cadastrale (import depuis une adresse), attributs BD TOPO (batiment, haie,
      // vegetation) et zonage PLU. Cette fonction est une LISTE BLANCHE : un champ absent d'ici
      // disparait silencieusement au premier enregistrement.
      cadastre: o.cadastre || null,
      bdtopo: o.bdtopo || null,
      plu: o.plu || null,
      ortho: o.ortho || null,
      // Reglages d'affichage ranges sur la parcelle (masquage du voisinage), comme `ortho`.
      affichage: o.affichage || null,
      // Objet arrive par un import de voisinage : sert a le masquer d'un coup sans le supprimer.
      voisinage: !!o.voisinage
    };
    if(o.type==='circle'){
      out.center = {x:o.center.x, y:o.center.y}; out.r = o.r;
    } else {
      out.pts = o.pts.map(p=>({x:p.x,y:p.y}));
      out.vertexNames = [...o.vertexNames];
      out.segmentNames = [...o.segmentNames];
      out.frozenVertices = o.frozenVertices ? [...o.frozenVertices] : o.pts.map(()=>false);
      if(o.type==='path'){ out.width = o.width; out.curve = !!o.curve; }
    }
    if(o.construction) out.construction = JSON.parse(JSON.stringify(o.construction));
    return out;
  });
}
export function serializeMeasures(ms){
  return ms.map(m=>({
    id:m.id, refObjKey:m.refObjKey, refSegIndex:m.refSegIndex, startEnd:m.startEnd,
    targetObjKey:m.targetObjKey, targetPtIndex:m.targetPtIndex, show:!!m.show,
    displayMode: m.displayMode==='along' ? 'along' : 'perp'
  }));
}
