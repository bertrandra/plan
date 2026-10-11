// Section « Relief » de l'inspecteur, sur la parcelle du projet (MD/spec-relief.md §5.1, §8).
//
// Le relief est une mesure avouee : la section dit d'ou vient la grille, de quand elle date et a
// combien pres, puis ce qu'on en tire — le zero du plan en altitude vraie, la pente moyenne, le
// denivele. Les trois boutons sont des liaisons vers les commandes du registre, qui portent la
// capacite, la permission et l'annulation. Les cases et le choix sont des preferences d'affichage
// (`sale: false`) : sans Ctrl+Z, permises en lecture seule, rangees dans `relief.affichage` pour
// etre retrouvees a la reouverture. « Points max » est un reglage du projet (annulable, refuse en
// lecture seule) : le plafond de points de la prochaine lecture. La section dit aussi les deux
// grilles : celle de la parcelle, fine, que les quantites lisent, et le maillage secondaire du
// voisinage, pour le seul sol 3D.

import { enPoints } from '../../model/formes.js';
import { lectureRelief } from '../../core/lectureRelief.js';
import {
  affichageRelief, empriseGrille, equidistanceRelief, PALIERS_RELIEF_M, PAS_MAX_RELIEF_M, penteParcelle, plafondRelief,
  POINTS_MAX_MAX, POINTS_MAX_MIN, resumeRelief, textePente, type GrilleRelief
} from '../../model/relief.js';
import type { AffichageRelief, ObjetPlan, Relief } from '../../model/types.js';
import type { Champ, ContexteChamps, Section } from './types.js';

/** La parcelle du projet, celle qui porte le relief — pas une parcelle voisine (cloture.ts). */
const estParcellePrincipale = (c: ContexteChamps) => !!c.parcelle && c.parcelle.key === c.obj.key;

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/** Les equidistances proposees, en metres ; 0 : choisie d'apres le denivele. */
export const EQUIDISTANCES: { valeur: string; libelle: string }[] = [
  { valeur: '0', libelle: 'auto' }, { valeur: '0.1', libelle: '10 cm' }, { valeur: '0.25', libelle: '25 cm' },
  { valeur: '0.5', libelle: '50 cm' }, { valeur: '1', libelle: '1 m' }
];

const texteEquidistance = (m: number) => m < 1 ? Math.round(m * 100) + ' cm' : fr(m, 0) + ' m';

/** Le relief de l'objet, s'il en porte un. */
const reliefDe = (o: ObjetPlan): Relief | null => o.relief ?? null;

/** Le plan est cale par le cadastre : le point de calage est enregistre sur la parcelle (render/ortho.ts fait le meme test). */
export function parcelleCalee(o: ObjetPlan): boolean {
  return !!o.cadastre && o.cadastre.origineLat !== undefined && o.cadastre.origineLat !== null;
}

/** Ecrit une preference d'affichage sur le relief, sans toucher a la grille. */
function reglerAffichage(o: ObjetPlan, f: (a: AffichageRelief) => void): void {
  const r = reliefDe(o);
  if (!r) return;
  const a: AffichageRelief = { ...(r.affichage ?? {}) };
  f(a);
  r.affichage = a;
}

/** « 1,42 m (de 166,6 à 168,0) » : le denivele de la parcelle et ses deux altitudes. */
export function texteDenivele(r: Relief, o: ObjetPlan): string {
  const p = penteParcelle(r, enPoints(o).pts);
  if (!p) return 'inconnu (grille trop petite)';
  return fr(p.denivele) + ' m (de ' + fr(p.zMin, 1) + ' à ' + fr(p.zMax, 1) + ')';
}

const milliers = (n: number) => n.toLocaleString('fr-FR');
const longueur = (m: number) => m >= 1000 ? fr(m / 1000, 2) + ' km' : Math.round(m) + ' m';

/** « Pas de 5 m · 90 480 points (290 × 312) · 1,45 km × 1,56 km » : la finesse d'une grille, son nombre de points et ce qu'elle couvre. */
export function texteGrille(g: GrilleRelief): string {
  const e = empriseGrille(g);
  return 'Pas de ' + fr(g.pas, g.pas < 1 ? 1 : 0) + ' m · ' + milliers(g.nx * g.ny) + ' points (' + milliers(g.nx) + ' × ' + milliers(g.ny) + ') · '
    + longueur(e.xMax - e.xMin) + ' × ' + longueur(e.yMax - e.yMin);
}

/**
 * Sans maillage secondaire, le plan porte des parcelles au-dela de la grille de la parcelle : le
 * sol 3D y est plat. Soit le relief n'a pas ete demande sur toutes les parcelles, soit elles
 * depassaient le plafond meme au pas le plus large.
 */
export function grilleSurParcelleSeule(r: Relief, o: ObjetPlan, objets: readonly ObjetPlan[]): boolean {
  if (r.paysage) return false;
  const g = empriseGrille(r);
  const dehors = (q: { x: number; y: number }) => q.x < g.xMin || q.x > g.xMax || q.y < g.yMin || q.y > g.yMax;
  return objets.some(x => x !== o && !!x.cadastre?.idu && enPoints(x).pts.some(dehors));
}

/** La regle du pas, telle que la section la dit, avec le plafond de ce relief. */
export function regleGrille(plafond: number): string {
  return 'Le pas s’élargit avec l’étendue lue (' + PALIERS_RELIEF_M.map(v => fr(v, v < 1 ? 1 : 0)).join(', ') + ' m) pour rester sous '
    + milliers(plafond) + ' points ; au-delà d’un pas de ' + PAS_MAX_RELIEF_M + ' m, seule la parcelle et ses abords sont lus.';
}

/** La section « Relief » de la parcelle du projet ; `null` pour tout autre objet. */
export function sectionRelief(c: ContexteChamps): Section | null {
  if (!estParcellePrincipale(c)) return null;
  const avec = (cc: ContexteChamps) => !!reliefDe(cc.obj);
  const sans = (cc: ContexteChamps) => !reliefDe(cc.obj);
  const r = (cc: ContexteChamps) => reliefDe(cc.obj);
  const calee = parcelleCalee(c.obj);

  const champs: Champ[] = [
    // ---- Sans relief : le constat et le bouton ----------------------------------------------------
    { type: 'lecture', cle: 'plat', libelle: 'Sol', visible: sans, valeur: () => 'Terrain plat (pas de relief lu)' },
    {
      type: 'bouton', cle: 'lire', libelle: 'Lire le relief', visible: sans,
      texte: () => lectureRelief.enCours() ? 'Lecture…' : 'Lire le relief',
      aide: 'Lit à l’IGN la grille d’altitudes du sol sur la parcelle et ses abords (LiDAR HD à 50 cm, sinon RGE ALTI à 1 m)',
      ...(calee ? {} : { explication: 'Le plan doit être calé par le cadastre : créez-le depuis une adresse (Fichier › Nouveau plan depuis une adresse).' }),
      agit: { commande: 'relief.lire' }, executer: (cc) => cc.executerCommande('relief.lire')
    },

    // ---- Avec relief : ce qu'on sait du sol -------------------------------------------------------
    { type: 'lecture', cle: 'source', libelle: 'Source', visible: avec, valeur: (cc) => { const x = r(cc); return x ? resumeRelief(x) : ''; } },
    { type: 'lecture', cle: 'grille', libelle: 'Grille', visible: avec,
      aide: 'La grille de la parcelle et de ses abords : la pente, le dénivelé et les quantités la lisent',
      valeur: (cc) => { const x = r(cc); return x ? texteGrille(x) : ''; },
      note: (cc) => { const x = r(cc); return x ? regleGrille(plafondRelief(x)) : ''; } },
    { type: 'lecture', cle: 'paysage', libelle: 'Maillage secondaire', visible: avec,
      aide: 'La grille du voisinage, plus large et moins fine (« Relief sur toutes les parcelles ») : elle ne porte que le sol de la Vue 3D et les courbes au-delà de la parcelle',
      valeur: (cc) => { const q = r(cc)?.paysage; return q ? 'Actif · ' + texteGrille(q) : 'Inactif'; },
      note: (cc) => {
        const x = r(cc);
        if (x?.paysage) return 'Sol 3D du voisinage ; les quantités lisent la grille de la parcelle.';
        return x && grilleSurParcelleSeule(x, cc.obj, cc.etat.objects) ? 'Le sol 3D est plat au-delà de la parcelle.' : '';
      } },
    { type: 'nombre', cle: 'pointsMax', libelle: 'Points max', visible: avec, min: POINTS_MAX_MIN, max: POINTS_MAX_MAX, pas: 10000, decimales: 0, unite: 'points',
      aide: 'Le plafond de points de chaque grille, appliqué à la prochaine lecture (« Actualiser », actualisation IGN) : plus haut, le pas est plus fin et le projet plus lourd',
      note: () => 'Appliqué à « Actualiser ».',
      lire: (cc) => plafondRelief(r(cc)),
      ecrire: (cc, v) => { const x = r(cc); if (!x || !Number.isFinite(v)) return false; x.maxCellules = plafondRelief({ maxCellules: v }); } },
    { type: 'lecture', cle: 'zRef', libelle: 'Zéro du plan', visible: avec, aide: 'L’altitude du sol au point de référence de la terrasse, fixée à la lecture : toutes les hauteurs du plan se comptent depuis elle',
      valeur: (cc) => { const x = r(cc); return x ? fr(x.zRef) + ' m ' + x.systemeAltimetrique : ''; } },
    { type: 'lecture', cle: 'pente', libelle: 'Pente', visible: avec, aide: 'La pente moyenne du sol à l’intérieur de la parcelle, et le point cardinal vers lequel il descend',
      valeur: (cc) => { const x = r(cc); const p = x ? penteParcelle(x, enPoints(cc.obj).pts) : null; return p ? textePente(p) : 'inconnue'; } },
    { type: 'lecture', cle: 'denivele', libelle: 'Dénivelé', visible: avec, valeur: (cc) => { const x = r(cc); return x ? texteDenivele(x, cc.obj) : ''; } },

    // ---- Preferences d'affichage : ni annulation, ni projet modifie ------------------------------
    // Deux reglages distincts : le relief (le sol en 3D, montre par defaut) et les courbes de niveau du
    // plan (cachees par defaut), avec leur equidistance quand elles sont montrees.
    { type: 'case', cle: 'sol3d', libelle: 'Relief', visible: avec, sale: false, enregistre: true, effets: ['scene3d'],
      aide: 'Le sol en relief dans la Vue 3D : le terrain suit la grille d’altitudes, les objets se posent dessus',
      lire: (cc) => affichageRelief(r(cc)).sol3d, ecrire: (cc, v) => reglerAffichage(cc.obj, (a) => { a.sol3d = v; }) },
    { type: 'case', cle: 'courbes', libelle: 'Courbes de niveau', visible: avec, sale: false, enregistre: true, effets: ['rendu', 'inspecteur'],
      aide: 'Les courbes de niveau sur le plan',
      lire: (cc) => affichageRelief(r(cc)).courbes, ecrire: (cc, v) => reglerAffichage(cc.obj, (a) => { a.courbes = v; }) },
    { type: 'choix', cle: 'equidistance', libelle: 'Équidistance', visible: (cc) => avec(cc) && affichageRelief(r(cc)).courbes, sale: false, enregistre: true, effets: ['rendu'],
      options: () => EQUIDISTANCES,
      note: (cc) => { const x = r(cc); return x && !(x.affichage?.equidistance) ? texteEquidistance(equidistanceRelief(x, enPoints(cc.obj).pts)) : ''; },
      lire: (cc) => String(affichageRelief(r(cc)).equidistance),
      ecrire: (cc, v) => reglerAffichage(cc.obj, (a) => { const m = parseFloat(v); if (m > 0) a.equidistance = m; else delete a.equidistance; }) },

    // ---- Les deux autres commandes ---------------------------------------------------------------
    { type: 'bouton', cle: 'actualiser', libelle: 'Actualiser', visible: avec,
      texte: () => lectureRelief.enCours() ? 'Lecture…' : 'Actualiser',
      aide: 'Relit la grille à l’IGN et remplace celle du projet, zéro du plan compris',
      agit: { commande: 'relief.actualiser' }, executer: (cc) => cc.executerCommande('relief.actualiser') },
    { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', visible: avec,
      aide: 'Retire le relief : le plan redevient plat',
      agit: { commande: 'relief.supprimer' }, executer: (cc) => cc.executerCommande('relief.supprimer') }
  ];

  return {
    id: 'relief', titre: 'Relief', champs,
    explication: 'Le relief de l’IGN donne la tendance du terrain, pas une cote d’exécution : pour régler une terrasse au centimètre, il faut un relevé sur place.'
  };
}
