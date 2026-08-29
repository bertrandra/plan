// Mise en forme des objets qui entrent dans le plan (spec §6.1).
//
// Les objets arrivent de trois endroits — `api.php`, le jeu de demonstration, un instantane
// d'annulation — et doivent etre traites **identiquement quelle que soit leur origine**. C'est le
// role de ce module, et il fait deux choses.
//
// **1. Il clone.** Points, construction, metadonnees cadastre / BD TOPO / PLU / ortho / affichage :
// tout sous-objet est recopie en profondeur. Sans cela, un instantane d'annulation et l'objet vivant
// partageraient la meme reference — modifier l'un abimerait l'autre, et la geometrie WGS84 source
// avec.
//
// **2. Il complete.** Un objet a points doit avoir des tableaux de noms et de sommets geles
// utilisables, meme si la source n'en avait pas : le reste du programme les indexe sans verifier.
// Les noms par defaut sont poses ici, une seule fois, plutot que devines a chaque affichage.
//
// A noter : les tableaux geles ne sont repris que **s'ils ont la bonne longueur**. Un fichier ou un
// sommet a ete ajoute sans que `frozenVertices` suive donnerait sinon un tableau plus court que
// `pts`, et un sommet sur deux repondrait `undefined` a « es-tu gele ? ».

export function normalizeObjects(raw) {
  return raw.map(o => {
    const c = { ...o };
    if (c.type === 'circle') {
      c.center = { x: c.center.x, y: c.center.y };
    } else {
      c.pts = c.pts.map(p => ({ x: p.x, y: p.y }));
      c.vertexNames = c.vertexNames ? [...c.vertexNames] : c.pts.map((_, i) => 'Point ' + (i + 1));
      c.segmentNames = c.segmentNames ? [...c.segmentNames] : c.pts.map((_, i) => 'Cote ' + (i + 1));
      c.frozenVertices = (c.frozenVertices && c.frozenVertices.length === c.pts.length) ? [...c.frozenVertices] : c.pts.map(() => false);
    }
    if (c.construction) c.construction = JSON.parse(JSON.stringify(c.construction));
    if (c.cadastre) c.cadastre = JSON.parse(JSON.stringify(c.cadastre));
    if (c.bdtopo) c.bdtopo = JSON.parse(JSON.stringify(c.bdtopo));
    if (c.plu) c.plu = JSON.parse(JSON.stringify(c.plu));
    if (c.ortho) c.ortho = JSON.parse(JSON.stringify(c.ortho));
    if (c.affichage) c.affichage = JSON.parse(JSON.stringify(c.affichage));
    return c;
  });
}
