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
import { compacterRelief } from '../model/relief.js';
import type { ObjetPlan, Mesure } from '../model/types.js';
import type { ObjetSerialise } from '../model/creation.js';

/**
 * Un objet du voisinage (verrouille, decor de reference) s'enregistre sans ce que le chargement sait
 * reconstruire : les champs nuls ou faux, les noms de sommets et de cotes par defaut, les sommets non geles,
 * la geometrie WGS84 source (les sommets et le point de calage la redonnent). Un voisinage de 200 m,
 * c'est un millier d'objets : ces redites faisaient la moitie du document, et la plateforme refusait
 * le projet. Les objets dessines ne sont pas touches (empreinte de projet.json).
 */
function allegerVoisinage(out: Record<string, unknown>): void {
  const pts = out.pts as unknown[] | undefined;
  if(pts){
    const parDefaut = (noms: unknown, prefixe: string) => Array.isArray(noms) && noms.length === pts.length && noms.every((n, i) => n === prefixe + (i + 1));
    if(parDefaut(out.vertexNames, 'Point ')) delete out.vertexNames;
    if(parDefaut(out.segmentNames, 'Cote ')) delete out.segmentNames;
    if(Array.isArray(out.frozenVertices) && out.frozenVertices.every(g => !g)) delete out.frozenVertices;
  }
  // Nuls et faux : le chargement les lit absents, et un objet verrouille du voisinage n'a ni cotes
  // affichees, ni cloture, ni contrainte.
  for(const k of Object.keys(out)) if(out[k] === null || out[k] === false) delete out[k];
  if(out.cadastre && typeof out.cadastre === 'object'){
    const cad = { ...(out.cadastre as Record<string, unknown>) };
    delete cad.geometrieSource;
    out.cadastre = cad;
  }
  if(out.bdtopo && typeof out.bdtopo === 'object'){
    out.bdtopo = Object.fromEntries(Object.entries(out.bdtopo as Record<string, unknown>).filter(([, v]) => v !== null));
  }
}

export function serializeObjects(objs: ObjetPlan[]): ObjetSerialise[] {
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
      portArbre: o.portArbre, essenceArbre: o.essenceArbre,
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
      // Poses par la normalisation ; les memes valeurs par defaut si un objet arrive sans.
      out.vertexNames = o.vertexNames ? [...o.vertexNames] : o.pts.map((_,i)=>'Point '+(i+1));
      out.segmentNames = o.segmentNames ? [...o.segmentNames] : o.pts.map((_,i)=>'Cote '+(i+1));
      out.frozenVertices = o.frozenVertices ? [...o.frozenVertices] : o.pts.map(()=>false);
      if(o.type==='path'){ out.width = o.width; out.curve = !!o.curve; }
    }
    if(o.construction) out.construction = JSON.parse(JSON.stringify(o.construction));
    // Releve de facade et toit : poses seulement quand ils existent, pour qu'un projet qui n'en a
    // pas garde au bit pres la forme d'avant (empreinte de projet.json).
    if(o.facades && o.facades.length) out.facades = JSON.parse(JSON.stringify(o.facades));
    if(o.toit) out.toit = JSON.parse(JSON.stringify(o.toit));
    // La cloture cote par cote et ses acces (MD/spec-cloture.md) : meme regle, les quatre anciens
    // champs ci-dessus restent ecrits pour les lecteurs qui ne connaissent qu'eux.
    if(o.cloture) out.cloture = JSON.parse(JSON.stringify(o.cloture));
    // Meme regle pour la pergola : un projet sans pergola garde sa forme d'avant.
    if(o.pergola) out.pergola = JSON.parse(JSON.stringify(o.pergola));
    if(o.piscine) out.piscine = JSON.parse(JSON.stringify(o.piscine));
    // Le declarant d'une declaration prealable, range sur la parcelle : pose seulement s'il existe.
    if(o.declaration) out.declaration = JSON.parse(JSON.stringify(o.declaration));
    // L'apparence du voisinage en 3D (parcelle du projet) et les fenetres d'un batiment : de meme.
    if(o.voisinage3d) out.voisinage3d = JSON.parse(JSON.stringify(o.voisinage3d));
    if(o.ruesVoisinage) out.ruesVoisinage = JSON.parse(JSON.stringify(o.ruesVoisinage));
    if(o.fenetres3d) out.fenetres3d = JSON.parse(JSON.stringify(o.fenetres3d));
    // Le relief du sol (MD/spec-relief.md §7) : la grille entiere, posee seulement si elle a ete lue,
    // ses altitudes compactees (`zCode`) — en clair, elles faisaient deborder la plateforme.
    if(o.relief) out.relief = compacterRelief(o.relief);
    if(o.voisinage) allegerVoisinage(out);
    // La liste blanche s'ecrit champ par champ sur un enregistrement ouvert, parce que l'ordre des
    // clefs est celui du fichier enregistre (empreinte projet.json). Ce qu'elle ecrit est un
    // `ObjetBrut` : chaque champ vient de `o`, les absents valent `null`, que le modele admet.
    return out as ObjetSerialise;
  });
}
/**
 * Une cote telle qu'elle s'enregistre : ce qui la designe, pas la geometrie qu'on en recalcule a
 * chaque rendu. Ecrit en alias de type et non en interface, pour rester assignable a `Mesure` —
 * qui porte un index de champs libres, et qu'une interface ne satisfait jamais.
 */
export type MesureSerialisee = {
  id: string;
  refObjKey: string;
  refSegIndex: number;
  startEnd: string;
  targetObjKey: string;
  targetPtIndex: number;
  show: boolean;
  displayMode: string;
};

export function serializeMeasures(ms: Mesure[]): MesureSerialisee[] {
  return ms.map(m=>({
    id:m.id, refObjKey:m.refObjKey, refSegIndex:m.refSegIndex, startEnd:m.startEnd,
    targetObjKey:m.targetObjKey, targetPtIndex:m.targetPtIndex, show:!!m.show,
    displayMode: m.displayMode==='along' ? 'along' : 'perp'
  }));
}
