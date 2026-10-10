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

import { deplierRelief } from './relief.js';
import type { ObjetBrut, ObjetAPoints } from './types.js';

/**
 * Le type dit les deux moities du travail : **`T`** parce que rien n'est enleve ni exige — un
 * instantane d'annulation, fait d'`ObjetPlan` complets, ressort en `ObjetPlan` sans avoir a etre
 * reaffirme — et **`& ObjetBrut`** parce que des champs apparaissent, ceux que la fonction pose.
 * Rendre `T` seul serait faux dans l'autre sens : on ne pourrait pas lire les noms de sommets qui
 * viennent d'etre crees.
 *
 * Le `as` final dit ce que le compilateur ne sait pas prouver a travers un generique : le clone
 * porte au moins les champs de la source, puisqu'il commence par la copier.
 */
export function normalizeObjects<T extends ObjetBrut>(raw: T[]): (T & ObjetBrut)[] {
  return raw.map(o => {
    const c: ObjetBrut = { ...o };
    if (c.type === 'circle') {
      // La validation (io/validation.ts) ecarte un cercle sans centre avant d'arriver ici.
      if (!c.center) throw new Error('Cercle sans centre : ' + String(c.key ?? c.name ?? '?'));
      c.center = { x: c.center.x, y: c.center.y };
    } else {
      // Tout ce qui n'est pas un cercle a des sommets — y compris un objet sans `type`, que le
      // programme a toujours traite comme un polygone.
      const p = c as Partial<ObjetAPoints>;
      if (!p.pts) throw new Error('Forme sans sommets : ' + String(c.key ?? c.name ?? '?'));
      p.pts = p.pts.map(q => ({ x: q.x, y: q.y }));
      p.vertexNames = p.vertexNames ? [...p.vertexNames] : p.pts.map((_, i) => 'Point ' + (i + 1));
      p.segmentNames = p.segmentNames ? [...p.segmentNames] : p.pts.map((_, i) => 'Cote ' + (i + 1));
      p.frozenVertices = (p.frozenVertices && p.frozenVertices.length === p.pts.length) ? [...p.frozenVertices] : p.pts.map(() => false);
    }
    if (c.construction) c.construction = JSON.parse(JSON.stringify(c.construction));
    if (c.cadastre) c.cadastre = JSON.parse(JSON.stringify(c.cadastre));
    if (c.bdtopo) c.bdtopo = JSON.parse(JSON.stringify(c.bdtopo));
    if (c.plu) c.plu = JSON.parse(JSON.stringify(c.plu));
    if (c.ortho) c.ortho = JSON.parse(JSON.stringify(c.ortho));
    if (c.affichage) c.affichage = JSON.parse(JSON.stringify(c.affichage));
    if (c.declaration) c.declaration = JSON.parse(JSON.stringify(c.declaration));
    if (c.facades) c.facades = JSON.parse(JSON.stringify(c.facades));
    if (c.toit) c.toit = JSON.parse(JSON.stringify(c.toit));
    if (c.volumesToit) c.volumesToit = JSON.parse(JSON.stringify(c.volumesToit));
    if (c.toitMesure) c.toitMesure = JSON.parse(JSON.stringify(c.toitMesure));
    if (c.corpsToit) c.corpsToit = JSON.parse(JSON.stringify(c.corpsToit));
    if (c.pergola) c.pergola = JSON.parse(JSON.stringify(c.pergola));
    if (c.cloture) c.cloture = JSON.parse(JSON.stringify(c.cloture));
    // Une grille enregistree compacte (`zCode`) retrouve ici ses altitudes en clair (model/relief.ts).
    if (c.relief) c.relief = deplierRelief(JSON.parse(JSON.stringify(c.relief)));
    if (c.piscine) c.piscine = JSON.parse(JSON.stringify(c.piscine));
    return c as T & ObjetBrut;
  });
}
