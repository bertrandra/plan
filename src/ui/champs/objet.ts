// Les sections de l'inspecteur pour l'objet selectionne (spec-ihm-zones §4.5, ui/champs/).
//
// Objet, Apparence, Parasol, Point de vue, Cotes, Coins, Alignement, Parcelle : ce que le panneau
// d'attributs (`ui/attrPanel.ts`, jusqu'a l'etape 3) construisait en DOM, decrit champ par champ.
// Chaque section dit pour quel objet elle apparait ; chaque champ dit ce qu'il lit, ce qu'il ecrit
// et ce qui doit suivre. Les regles d'autrefois sont restees des regles — le mode rectangle refuse
// un rectangle qui sortirait de la parcelle, le rayon d'un cercle aussi — mais elles sont ici, a
// cote du champ, et non au fond d'un ecouteur.

import { au } from '../../util/tableaux.js';
import { shoelace, dist, signedArea, pointInPolygon } from '../../geometry/basic.js';
import { nearestSegmentIndex } from '../../geometry/segments.js';
import { LIBELLE_FONCTION } from '../../model/defaults.js';
import { enPoints, enCercle, gelsDe, nomsSommetsDe, nomsCotesDe } from '../../model/formes.js';
import { lieuDeParcelle } from '../../model/lieu.js';
import { aParticularite, estPointDeVue, estTerrain, estTerrasse as terrasseCalculable, fonctionAdmise } from '../../model/fonctions.js';
import { terrasseDuParasol, hauteurParasolDe, matAngleDe, chercherMeilleurePositionParasol } from '../../engine/parasol.js';
import { formatHeureMin } from '../../util/format.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import { sectionsPergola } from './pergola.js';
import { sectionsPiscine } from './piscine.js';
import { sectionDeclaration } from './declaration.js';
import type { Champ, ChampNombre, ChampTexte, ContexteChamps, Section } from './types.js';

/** Les fonctions qu'un objet peut porter : la liste « Fonction » de l'inspecteur, dans l'ordre du menu d'autrefois. */
export const FONCTIONS = ['terrain', 'batiment', 'annexe', 'arbre', 'terrasse', 'massif', 'mobilier', 'dalle', 'equipement', 'chemin', 'parasol', 'pergola', 'carport', 'piscine', 'limite', 'autre'];

// La distance saisie pour l'alignement survit aux rendus et se lit au moment d'aligner : ce n'est
// pas une donnee du plan, seulement le brouillon d'un geste.
let distanceAlignement = '';
export const distanceAlignementSaisie = (): string => distanceAlignement;

// Ce que la fonction donne a l'objet (sections, formes admises) est decrit une fois, dans
// model/fonctions.ts.
const estTerrasse = terrasseCalculable;
/** La parcelle du projet, celle qui porte la cloture et le lieu — pas une parcelle voisine. */
const estParcellePrincipale = (c: ContexteChamps) => !!c.parcelle && c.parcelle.key === c.obj.key;
const aDesPoints = (o: ObjetPlan) => o.type === 'polygon' || o.type === 'path';
const surface = (o: ObjetPlan): number | null => o.type === 'polygon' ? shoelace(o.pts) : o.type === 'circle' ? Math.PI * o.r * o.r : null;
const contourParcelle = (c: ContexteChamps): PtBrut[] | null =>
  c.obj.constrained && c.parcelle && c.parcelle.key !== c.obj.key ? enPoints(c.parcelle).pts : null;

/** Le titre de l'inspecteur : le type, le nom, la surface. */
export function titreObjet(c: ContexteChamps): string {
  const s = surface(c.obj);
  return c.libelleType(c.obj) + ' — ' + c.obj.name + (s !== null ? '  (' + s.toFixed(2) + ' m²)' : '');
}

/** Un champ texture : la vignette, le nom, choisir, retirer. */
function texture(cle: 'textureVerticale' | 'textureHorizontale' | 'textureArbre', libelle: string): Champ {
  return {
    type: 'texture', cle, libelle, effets: ['inspecteur', 'scene3d'],
    lire: (c) => c.obj[cle],
    ecrire: (c, v) => { c.obj[cle] = v; },
    // Les chemins d'un meme jardin partagent presque toujours le meme revetement : la case pose la
    // MEME texture sur les deux faces de chacun, pour qu'aucun ne se retrouve depareille.
    appliquerATous: {
      libelle: 'Appliquer à tous les chemins (vertical + horizontale)',
      ecrire: (c, v) => { c.objets.filter(o => o.fonction === 'chemin').forEach(o => { o.textureVerticale = v; o.textureHorizontale = v; }); }
    }
  };
}

const sectionObjet: Section = {
  id: 'objet', titre: 'Objet',
  champs: [
    { type: 'texte', cle: 'name', libelle: 'Nom', effets: ['rendu'], lire: (c) => c.obj.name, ecrire: (c, v) => { c.obj.name = v; } },
    { type: 'lecture', cle: 'type', libelle: 'Type', valeur: (c) => c.libelleType(c.obj) },
    {
      type: 'choix', cle: 'fonction', libelle: 'Fonction', effets: ['rendu'],
      // Plusieurs champs (elevation, textures, arbre, parasol) n'apparaissent que selon la
      // fonction : le rendu qui suit les fait paraitre aussitot. Le menu ne propose que les
      // fonctions qui ont un sens sur la forme de l'objet (un parasol est un cercle, une terrasse
      // un polygone) ; la fonction en place reste proposee, meme inadmise, pour qu'un ancien
      // fichier s'affiche tel qu'il est.
      options: (c) => {
        const f = c.obj.fonction;
        const admises = FONCTIONS.filter(v => fonctionAdmise(v, c.obj.type));
        return (!f || admises.includes(f) ? admises : [...admises, f]).map(v => ({ valeur: v, libelle: LIBELLE_FONCTION[v] || v }));
      },
      lire: (c) => c.obj.fonction || '', ecrire: (c, v) => { c.obj.fonction = v; }
    },
    {
      type: 'nombre', cle: 'priority', libelle: 'Priorité d\'affichage', pas: 1, effets: ['empilement', 'rendu'],
      aide: 'Plus élevé = dessiné au-dessus des autres (hors objet sélectionné, toujours au premier plan)',
      // Un point de vue n'est pas une surface : il n'a ni ordre d'empilement utile ni matiere.
      visible: (c) => !estPointDeVue(c.obj),
      lire: (c) => c.obj.priority || 0, ecrire: (c, v) => { c.obj.priority = Math.round(v) || 0; }
    },
    { type: 'texte', cle: 'matiere', libelle: 'Matière', placeholder: 'ex : béton, bois, gazon…', visible: (c) => !estPointDeVue(c.obj), lire: (c) => c.obj.matiere || '', ecrire: (c, v) => { c.obj.matiere = v; } },
    // La hauteur sert la Vue 3D : chaque objet y devient un bloc extrude. Une terrasse fait
    // exception — sa hauteur vient de sa construction — et un terrain n'en a pas.
    {
      type: 'lecture', cle: 'elevationTerrasse', libelle: 'Élévation',
      visible: (c) => estTerrasse(c.obj) && !estTerrain(c.obj),
      // 3 decimales : a 2, 0,095 m arrondit en 0,10 m et fait croire a un centimetre de plus que la
      // construction n'en affiche.
      valeur: (c) => c.elevationOf(c.obj).toFixed(3) + ' m — calculée depuis la construction (appui + structure + lame)'
    },
    {
      type: 'nombre', cle: 'elevation', libelle: 'Élévation', unite: 'm', pas: 0.1, min: 0, decimales: 2,
      aide: 'Hauteur au-dessus du sol, utilisée par la Vue 3D',
      // Une pergola ou un carport a sa propre hauteur de poteaux, une piscine sa hauteur hors du sol :
      // l'elevation ne leur dit rien.
      visible: (c) => !estPointDeVue(c.obj) && !estTerrain(c.obj) && !estTerrasse(c.obj) && !aParticularite(c.obj, 'abri') && !aParticularite(c.obj, 'bassin'),
      lire: (c) => c.elevationOf(c.obj), ecrire: (c, v) => { c.obj.elevation = Math.max(0, v) || 0; }
    },
    {
      type: 'lecture', cle: 'surface', libelle: 'Surface',
      visible: (c) => surface(c.obj) !== null && !estPointDeVue(c.obj),
      valeur: (c) => {
        const s = surface(c.obj) ?? 0;
        const sp = c.parcelle ? shoelace(enPoints(c.parcelle).pts) : 0;
        return s.toFixed(2) + ' m²' + (c.obj.key !== 'parcelle' && sp > 0 ? '  (' + (s / sp * 100).toFixed(1) + ' % de la parcelle)' : '');
      }
    },
    {
      type: 'lecture', cle: 'longueur', libelle: 'Longueur totale', visible: (c) => c.obj.type === 'path' && !estPointDeVue(c.obj),
      valeur: (c) => { const pts = enPoints(c.obj).pts; let t = 0; for (let i = 0; i < pts.length - 1; i++) t += dist(au(pts, i), au(pts, i + 1)); return t.toFixed(2) + ' m'; }
    },
    {
      type: 'nombre', cle: 'width', libelle: 'Largeur', unite: 'm', pas: 0.05, min: 0.05, decimales: 2, historique: true, effets: ['rendu'],
      visible: (c) => c.obj.type === 'path' && !estPointDeVue(c.obj),
      lire: (c) => c.obj.width || 1, ecrire: (c, v) => { if (!(v > 0)) return false; c.obj.width = v; }
    },
    {
      type: 'case', cle: 'curve', libelle: 'Courbe (passe par les points)', effets: ['rendu'],
      visible: (c) => c.obj.type === 'path' && !estPointDeVue(c.obj),
      lire: (c) => !!c.obj.curve, ecrire: (c, v) => { c.obj.curve = v; }
    },
    {
      type: 'nombre', cle: 'r', libelle: 'Rayon', unite: 'm', pas: 0.01, min: 0.1, decimales: 2, historique: true, effets: ['rendu'],
      visible: (c) => c.obj.type === 'circle',
      lire: (c) => enCercle(c.obj).r,
      ecrire: (c, v) => {
        if (!(v > 0.05)) return false;
        const cercle = enCercle(c.obj);
        const contour = contourParcelle(c);
        if (contour) {
          for (let a = 0; a < 16; a++) {
            const ang = a / 16 * 2 * Math.PI;
            if (!pointInPolygon({ x: cercle.center.x + v * Math.cos(ang), y: cercle.center.y + v * Math.sin(ang) }, contour)) return false;
          }
        }
        cercle.r = v;
      }
    },
    {
      type: 'case', cle: 'locked', libelle: 'Verrouiller l\'objet', historique: true, effets: ['rendu'],
      aide: 'Bloque le glisser, la suppression, l\'ajout et la suppression de points',
      lire: (c) => !!c.obj.locked, ecrire: (c, v) => { c.obj.locked = v; }
    },
    {
      type: 'case', cle: 'rectangle', libelle: 'Mode rectangle (angles à 90°)', effets: ['rendu'],
      aide: 'Verrouille les 4 angles à 90 degrés (fige les 4 coins)',
      visible: (c) => c.obj.type === 'polygon' && c.obj.pts.length === 4,
      // Derive de l'etat des coins figes plutot que d'un drapeau a part : figer les quatre coins est
      // ce qui bloque reellement les cotes et les angles ailleurs dans le programme.
      lire: (c) => gelsDe(enPoints(c.obj)).every(Boolean),
      ecrire: (c, v) => {
        const obj = enPoints(c.obj);
        if (!v) { obj.frozenVertices = gelsDe(obj).map(() => false); return; }
        // Deja d'equerre : on verrouille tel quel, sans redresser. Une terrasse rectangulaire mais
        // orientee a 30 degres n'a aucune raison de basculer sur les axes de l'ecran.
        if (c.dejaRectangle(obj.pts)) { obj.frozenVertices = gelsDe(obj).map(() => true); return; }
        const xs = obj.pts.map(p => p.x), ys = obj.pts.map(p => p.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
        // Les quatre coins sont attribues dans l'ordre de parcours, en partant du plus proche du
        // premier point : quatre coins distincts et le sens de rotation conserve, la ou « chaque
        // point vers le coin le plus proche » degenere un losange.
        const coins = [{ x: minX, y: minY }, { x: maxX, y: minY }, { x: maxX, y: maxY }, { x: minX, y: maxY }];
        if (signedArea(obj.pts) < 0) coins.reverse();
        let depart = 0, meilleure = Infinity;
        coins.forEach((cc, k) => { const d = dist(cc, au(obj.pts, 0)); if (d < meilleure) { meilleure = d; depart = k; } });
        const nouveaux = obj.pts.map((_, i) => ({ ...au(coins, (depart + i) % 4) }));
        const contour = contourParcelle(c);
        if (contour && !nouveaux.every(p => pointInPolygon(p, contour))) {
          c.toast('Le rectangle sortirait de la parcelle - mode rectangle non active.');
          return false;
        }
        obj.pts = nouveaux;
        obj.frozenVertices = gelsDe(obj).map(() => true);
      }
    }
  ]
};

const sectionApparence: Section = {
  id: 'apparence', titre: 'Apparence',
  champs: [
    {
      type: 'couleur', cle: 'fill', libelle: 'Couleur', effets: ['rendu'],
      lire: (c) => c.obj.fill || '#cccccc',
      ecrire: (c, v) => { c.obj.fill = v; if (c.obj.type === 'path') c.obj.stroke = v; }
    },
    // Verticale = les faces du bloc extrude en Vue 3D (murs) ; horizontale = le dessus (toit). Un
    // mur et un toit ne partagent presque jamais le meme materiau.
    { ...texture('textureVerticale', 'Texture verticale'), visible: (c) => !estPointDeVue(c.obj) },
    { ...texture('textureHorizontale', 'Texture horizontale'), visible: (c) => !estPointDeVue(c.obj) }
  ]
};

// Le feuillage est une sphere posee sur le tronc : un jeu de champs a part, independant de la
// hauteur du tronc, parce qu'un feuillage n'a ni la forme ni la matiere de l'ecorce. Une section a
// lui, comme le parasol : ce sont les reglages de l'arbre, pas son apparence au plan.
const sectionArbre: Section = {
  id: 'arbre', titre: 'Arbre',
  champs: [
    {
      type: 'nombre', cle: 'diametreArbre', libelle: 'Diamètre du feuillage', unite: 'm', pas: 0.1, min: 0.1, decimales: 1, effets: ['scene3d'],
      aide: 'Diamètre du feuillage (sphère posée sur le tronc), utilisé par la Vue 3D',
      lire: (c) => c.obj.diametreArbre ?? 3, ecrire: (c, v) => { c.obj.diametreArbre = Math.max(0.1, v) || 3; }
    },
    {
      type: 'couleur', cle: 'couleurArbre', libelle: 'Couleur du feuillage', effets: ['scene3d'],
      lire: (c) => c.obj.couleurArbre || '#4a7c3a', ecrire: (c, v) => { c.obj.couleurArbre = v; }
    },
    texture('textureArbre', 'Texture du feuillage')
  ]
};

const sectionParasol: Section = {
  id: 'parasol', titre: 'Parasol',
  champs: [
    // Terrasse de rattachement : c'est elle dont l'ombrage est mesure et sur laquelle porte la
    // recherche de position. Indispensable des qu'il y a plusieurs terrasses.
    {
      type: 'choix', cle: 'terrasseLieeKey', libelle: 'Terrasse rattachée', effets: ['rendu'],
      actif: (c) => c.objets.some(estTerrasse),
      options: (c) => { const t = c.objets.filter(estTerrasse); return t.length ? t.map(o => ({ valeur: o.key, libelle: o.name })) : [{ valeur: '', libelle: 'Aucune terrasse dans le plan' }]; },
      lire: (c) => terrasseDuParasol(c.obj, c.objets, c.etat.terrasseSelectedKey)?.key || '',
      ecrire: (c, v) => { c.obj.terrasseLieeKey = v; }
    },
    // Le diametre de la toile est le rayon du cercle : seule la hauteur du mat manque, et c'est
    // elle qui fixe la longueur de l'ombre.
    {
      type: 'nombre', cle: 'hauteurParasol', libelle: 'Hauteur du mât', unite: 'm', pas: 0.1, min: 0.5, decimales: 1, effets: ['rendu', 'scene3d'],
      aide: 'Hauteur de la toile au-dessus du sol : plus le mât est haut, plus l\'ombre se décale loin du pied',
      lire: (c) => hauteurParasolDe(c.obj), ecrire: (c, v) => { c.obj.hauteurParasol = Math.max(0.5, v) || 2.2; }
    },
    {
      type: 'case', cle: 'matSurPerimetre', libelle: 'Mât sur le périmètre de la terrasse', effets: ['rendu'],
      aide: 'Le pied reste collé au pourtour de la terrasse rattachée, y compris quand on glisse le parasol ; la recherche de position ne teste plus que le bord',
      lire: (c) => !!c.obj.matSurPerimetre, ecrire: (c, v) => { c.obj.matSurPerimetre = v; }
    },
    {
      type: 'case', cle: 'matDeporte', libelle: 'Mât déporté (en bord de toile)', effets: ['rendu', 'scene3d'],
      aide: 'Le mât n\'est plus au centre de la toile mais sur son bord, ce qui dégage la surface sous la toile',
      lire: (c) => !!c.obj.matDeporte, ecrire: (c, v) => { c.obj.matDeporte = v; }
    },
    {
      type: 'nombre', cle: 'matAngleDeg', libelle: 'Orientation du mât', unite: '°', pas: 5, decimales: 0, effets: ['rendu', 'scene3d'],
      aide: 'Direction du pied vu depuis le centre de la toile : 0 = Est, 90 = Nord',
      visible: (c) => !!c.obj.matDeporte,
      lire: (c) => Math.round(matAngleDe(c.obj)), ecrire: (c, v) => { c.obj.matAngleDeg = ((v || 0) % 360 + 360) % 360; }
    },
    { type: 'date', cle: 'ombreDate', libelle: 'Ombre — date', sale: false, effets: ['rendu'], lire: (c) => c.etat.parasol.dateStr, ecrire: (c, v) => { if (v) c.etat.parasol.dateStr = v; } },
    {
      type: 'curseur', cle: 'ombreHeure', libelle: 'Ombre — heure', min: 0, max: 1439, pas: 5, format: formatHeureMin, sale: false, effets: ['rendu'],
      lire: (c) => c.etat.parasol.minutes, ecrire: (c, v) => { c.etat.parasol.minutes = v; }
    },
    { type: 'case', cle: 'ombreAffichee', libelle: 'Afficher l\'ombre', sale: false, effets: ['rendu'], lire: (c) => c.etat.parasol.ombreAffichee, ecrire: (c, v) => { c.etat.parasol.ombreAffichee = v; } },
    {
      type: 'case', cle: 'carteAffichee', libelle: 'Carte de chaleur (heures d\'ombre)', sale: false, effets: ['rendu'],
      aide: 'Colore la terrasse selon la part des après-midis d\'été (mai à septembre, 12h-18h) passée à l\'ombre',
      lire: (c) => c.etat.parasol.carteAffichee, ecrire: (c, v) => { c.etat.parasol.carteAffichee = v; }
    },
    {
      type: 'bouton', cle: 'placerAuMieux', libelle: 'Meilleure position', texte: () => 'Placer au mieux',
      explication: 'Cherche sur la terrasse la position qui ombrage le plus, mai→sept. 12h–18h.',
      agit: 'projet',
      executer: (c) => {
        const obj = c.obj;
        const terr = terrasseDuParasol(obj, c.objets, c.etat.terrasseSelectedKey);
        if (!terr) { c.toast('Aucune terrasse : cree d\'abord un objet avec Fonction = terrasse.'); return; }
        // Le calcul bloque le fil d'execution : on laisse le navigateur peindre avant de le lancer.
        setTimeout(() => {
          const res = chercherMeilleurePositionParasol(obj, c.contexteSoleil(), c.objets);
          if (!res) { c.toast('Pas de position calculable (soleil trop bas ou terrasse trop petite).'); return; }
          c.pushHistory();
          const toile = enCercle(obj); toile.center.x = res.x; toile.center.y = res.y;
          if (obj.matDeporte && res.angleDeg !== undefined) obj.matAngleDeg = res.angleDeg;
          c.render();
          c.toast('Parasol place sur "' + terr.name + '" : ' + (res.couverture * 100).toFixed(0) + ' % a l\'ombre en moyenne (mai-sept., 12h-18h).');
        }, 30);
      }
    }
  ]
};

// Le point 1 porte la position, le point 2 la direction. La direction affichee est DERIVEE des deux
// points a chaque fois, jamais stockee a part : deplacer un point sur le plan ne peut ainsi jamais
// desynchroniser le nombre de la fleche.
const sectionPointDeVue: Section = {
  id: 'pointDeVue', titre: 'Point de vue',
  champs: [
    {
      type: 'nombre', cle: 'altitude', libelle: 'Altitude', unite: 'm', pas: 0.1, min: 0.1, decimales: 2,
      aide: 'Hauteur de la caméra au-dessus du sol',
      lire: (c) => c.obj.altitude ?? 1.6, ecrire: (c, v) => { c.obj.altitude = Math.max(0.1, v || 1.6); }
    },
    {
      type: 'nombre', cle: 'direction', libelle: 'Direction', unite: '°', pas: 5, decimales: 0, effets: ['rendu'],
      aide: 'Direction visée : 0° = Est, 90° = Nord. Déplace le point « Direction » sur le plan, ce champ le suit, ou le repositionne.',
      lire: (c) => { const p = enPoints(c.obj).pts; return Math.round(Math.atan2(au(p, 1).y - au(p, 0).y, au(p, 1).x - au(p, 0).x) * 180 / Math.PI); },
      ecrire: (c, v) => {
        const p = enPoints(c.obj).pts;
        const d = Math.hypot(au(p, 1).x - au(p, 0).x, au(p, 1).y - au(p, 0).y) || 2;
        const rad = (v || 0) * Math.PI / 180;
        p[1] = { x: au(p, 0).x + Math.cos(rad) * d, y: au(p, 0).y + Math.sin(rad) * d };
      }
    },
    { type: 'bouton', cle: 'aller', libelle: '', nom: 'Aller à cette vue en Vue 3D', texte: () => 'Aller à cette vue en Vue 3D', agit: 'interface', executer: (c) => c.allerAuPointDeVue(c.obj) }
  ]
};

/** Un nom de coin ou de cote : un texte sans historique, redessine a chaque frappe. */
const nomDe = (cle: string, libelle: string, lire: (c: ContexteChamps) => string, ecrire: (c: ContexteChamps, v: string) => void): ChampTexte =>
  ({ type: 'texte', cle, libelle, effets: ['rendu'], lire, ecrire });

/** Les cotes (et, pour un chemin, ses points) : un champ par ligne, construits d'apres la forme. */
function sectionCotes(c: ContexteChamps): Section {
  const obj = enPoints(c.obj);
  const n = obj.pts.length;
  const minPts = obj.type === 'path' ? 2 : 3;
  const champs: Champ[] = [];
  if (obj.type === 'path') {
    (obj.vertexNames || []).forEach((_, i) => champs.push({
      type: 'ligne', cle: 'point' + i, libelle: 'Point ' + (i + 1),
      surbrillance: (cc) => cc.etat.highlight.type === 'vertex' && cc.etat.highlight.index === i,
      champs: [
        nomDe('nom', 'Nom', (cc) => nomsSommetsDe(enPoints(cc.obj))[i] || '', (cc, v) => { nomsSommetsDe(enPoints(cc.obj))[i] = v; }),
        { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', actif: () => n > 2, aide: n <= 2 ? 'Impossible : il faut garder au moins 2 points' : 'Supprime ce point', agit: 'projet', executer: (cc) => cc.deleteVertex(cc.obj, i) }
      ]
    }));
  }
  (obj.segmentNames || []).forEach((_, i) => {
    if (obj.type === 'path' && i >= n - 1) return; // pas de cote de fermeture sur un chemin ouvert
    const j = (i + 1) % n;
    const aFige = !!gelsDe(obj)[i], bFige = !!gelsDe(obj)[j];
    const longueur: ChampNombre = {
      type: 'nombre', cle: 'longueur', libelle: 'Longueur', unite: 'm', pas: 0.01, min: 0.05, decimales: 2,
      actif: () => !(aFige && bFige),
      aide: aFige && bFige ? 'Les deux coins de ce côté sont figés' : (aFige || bFige ? 'Un coin est figé : l\'autre extrémité du côté sera déplacée pour atteindre cette longueur' : 'Longueur du côté'),
      lire: (cc) => { const p = enPoints(cc.obj).pts; return dist(au(p, i), au(p, j % p.length)); },
      ecrire: (cc, v) => (v > 0 ? cc.applyLengthEdit(cc.obj, i, v) : false),
      effets: ['poignees', 'rendu']
    };
    champs.push({
      type: 'ligne', cle: 'cote' + i, libelle: 'Côté ' + (i + 1),
      surbrillance: (cc) => cc.etat.highlight.type === 'segment' && cc.etat.highlight.index === i,
      champs: [
        nomDe('nom', 'Nom', (cc) => nomsCotesDe(enPoints(cc.obj))[i] || '', (cc, v) => { nomsCotesDe(enPoints(cc.obj))[i] = v; }),
        longueur,
        { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', actif: () => n > minPts, aide: n <= minPts ? 'Impossible : nombre minimum de sommets atteint' : 'Supprime ce côté (fusionne les deux sommets voisins)', agit: 'projet', executer: (cc) => cc.deleteVertex(cc.obj, j) }
      ]
    });
  });
  return { id: 'cotes', titre: obj.type === 'path' ? 'Points et segments' : 'Côtés', repliee: true, champs };
}

/** Les coins d'un polygone : nom, angle, fige, supprimer. */
function sectionCoins(c: ContexteChamps): Section {
  const obj = enPoints(c.obj);
  const n = obj.pts.length;
  const champs: Champ[] = (obj.vertexNames || []).map((_, i) => {
    const fige = !!gelsDe(obj)[i];
    return {
      type: 'ligne', cle: 'coin' + i, libelle: 'Coin ' + (i + 1),
      surbrillance: (cc) => cc.etat.highlight.type === 'vertex' && cc.etat.highlight.index === i,
      champs: [
        nomDe('nom', 'Nom', (cc) => nomsSommetsDe(enPoints(cc.obj))[i] || '', (cc, v) => { nomsSommetsDe(enPoints(cc.obj))[i] = v; }),
        {
          type: 'nombre', cle: 'angle', libelle: 'Angle', unite: '°', pas: 0.1, decimales: 1, actif: () => !fige,
          aide: fige ? 'Angle figé : décoche « figé » pour le modifier' : 'Angle intérieur',
          lire: (cc) => cc.interiorAngleDeg(cc.obj, i),
          ecrire: (cc, v) => cc.applyAngleEdit(cc.obj, i, v),
          effets: ['poignees', 'rendu']
        },
        {
          type: 'case', cle: 'fige', libelle: 'Figé', effets: ['rendu'],
          aide: 'Figer cet angle : empêche de le déplacer (glisser, longueur adjacente, angle) pour faciliter les autres modifications',
          lire: (cc) => !!gelsDe(enPoints(cc.obj))[i], ecrire: (cc, v) => { gelsDe(enPoints(cc.obj))[i] = v; }
        },
        { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', actif: () => n > 3 && !fige, aide: n <= 3 ? 'Impossible : il faut garder au moins 3 sommets' : (fige ? 'Coin figé' : 'Supprime ce coin (fusionne les deux côtés voisins)'), agit: 'projet', executer: (cc) => cc.deleteVertex(cc.obj, i) }
      ]
    };
  });
  return { id: 'coins', titre: 'Coins', repliee: true, champs };
}

const sectionAlignement: Section = {
  id: 'alignement', titre: 'Alignement par rotation', repliee: true,
  explication: 'Choisis un segment cible sur le plan (n\'importe quel objet) : l\'objet sélectionné pivote autour du milieu de son côté le plus proche de ce segment cible, pour devenir parallèle à celui-ci.',
  champs: [
    {
      type: 'bouton', cle: 'choisir', libelle: 'Segment cible',
      texte: (c) => c.pointage()?.purpose === 'align' ? 'Clique un segment sur le plan…' : 'Choisir un segment cible',
      actif: (c) => c.pointage()?.purpose !== 'align',
      agit: 'interface',
      executer: (c) => c.startPick('ref', false, 'align')
    },
    {
      type: 'lecture', cle: 'info', libelle: 'Cible',
      valeur: (c) => {
        const cible = c.cibleAlignement();
        let proche = '(choisis d\'abord un segment cible)';
        if (cible) {
          const tgt = c.measureSegCoords(cible);
          if (tgt) {
            const obj = enPoints(c.obj);
            const idx = nearestSegmentIndex({ type: obj.type, pts: obj.pts }, tgt);
            if (idx >= 0) proche = obj.segmentNames?.[idx] || ('Cote ' + (idx + 1));
          }
        }
        return c.refLabel(cible) + '  |  côté le plus proche de « ' + c.obj.name + ' » : ' + proche;
      }
    },
    {
      type: 'texte', cle: 'distance', libelle: 'Distance au segment (m)', placeholder: 'vide = pas de changement', sale: false,
      lire: () => distanceAlignement, ecrire: (_c, v) => { distanceAlignement = v; }
    },
    {
      type: 'bouton', cle: 'aligner', libelle: '', nom: 'Aligner par rotation', texte: () => 'Aligner par rotation',
      actif: (c) => !!c.cibleAlignement() && !c.obj.locked,
      aide: 'Nécessite un segment cible et un objet non verrouillé',
      agit: 'projet',
      executer: (c) => c.alignObjectByRotation(c.obj)
    }
  ]
};

// La cloture est rattachee a la parcelle, comme le lieu : elle se sauvegarde avec le projet. Une
// parcelle voisine (import cadastre, `fonction: terrain` elle aussi) n'en montre que le cadastre :
// la Vue 3D ne dessine que la cloture de la parcelle du projet (ui/cloture.ts), et le lieu est le
// sien. Lui offrir ces reglages, c'etait ecrire le projet sans effet visible.
const sectionParcelle: Section = {
  id: 'parcelle', titre: 'Parcelle',
  champs: [
    { type: 'lecture', cle: 'lieu', libelle: 'Lieu', visible: estParcellePrincipale, valeur: (c) => { const l = lieuDeParcelle(c.obj); return l.nom + ' — ' + l.latitude.toFixed(4) + '° N, ' + l.longitude.toFixed(4) + '° E'; } },
    { type: 'lecture', cle: 'cadastre', libelle: 'Cadastre', visible: (c) => !!c.obj.cadastre, valeur: (c) => { const k = c.obj.cadastre ?? {}; return [k.commune, k.section, k.numero].filter(v => typeof v === 'string' && v).join(' ') || 'parcelle importée'; } },
    { type: 'case', cle: 'clotureActive', visible: estParcellePrincipale, libelle: 'Clôture autour de la parcelle', effets: ['inspecteur', 'scene3d'], lire: (c) => !!c.obj.clotureActive, ecrire: (c, v) => { c.obj.clotureActive = v; } },
    // Hauteur plafonnee par le bas a 0,10 m, repliee sur 1,80 m si la saisie n'est pas un nombre.
    { type: 'nombre', cle: 'clotureHauteur', visible: estParcellePrincipale, libelle: 'Hauteur de la clôture', unite: 'm', pas: 0.1, min: 0.1, decimales: 1, effets: ['scene3d'], actif: (c) => !!c.obj.clotureActive, lire: (c) => c.obj.clotureHauteur ?? 1.8, ecrire: (c, v) => { c.obj.clotureHauteur = Math.max(0.1, v) || 1.8; } },
    { type: 'couleur', cle: 'clotureCouleur', visible: estParcellePrincipale, libelle: 'Couleur de la clôture', effets: ['scene3d'], actif: (c) => !!c.obj.clotureActive, lire: (c) => c.obj.clotureCouleur || '#6b4a2a', ecrire: (c, v) => { c.obj.clotureCouleur = v; } },
    { type: 'texture', cle: 'clotureTexture', visible: estParcellePrincipale, libelle: 'Texture de la clôture', effets: ['inspecteur', 'scene3d'], actif: (c) => !!c.obj.clotureActive, lire: (c) => c.obj.clotureTexture, ecrire: (c, v) => { c.obj.clotureTexture = v; } }
  ]
};

/** Les sections a montrer pour l'objet selectionne, dans l'ordre. */
export function sectionsObjet(c: ContexteChamps): Section[] {
  const o = c.obj;
  const sections: Section[] = [sectionObjet];
  if (estTerrain(o)) sections.push(sectionParcelle);
  if (estParcellePrincipale(c)) sections.push(sectionDeclaration(c));
  sections.push(sectionApparence);
  if (aParticularite(o, 'arbre')) sections.push(sectionArbre);
  if (aParticularite(o, 'parasol')) sections.push(sectionParasol);
  if (aParticularite(o, 'pointDeVue')) sections.push(sectionPointDeVue);
  if (aParticularite(o, 'abri')) sections.push(...sectionsPergola(c));
  if (aParticularite(o, 'bassin')) sections.push(...sectionsPiscine(c));
  if (aDesPoints(o) && !estPointDeVue(o)) {
    sections.push(sectionCotes(c));
    if (o.type === 'polygon') sections.push(sectionCoins(c));
    sections.push(sectionAlignement);
  }
  return sections;
}
