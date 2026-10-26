// La question posee quand un batiment a cheval sur deux parcelles laisse un doute sur sa toiture
// (MD/spec-toit-ign.md §13.8).
//
// Le calcul (app/toits/toitsLidar.ts::toitAChevalApresCalcul) note le doute : un corps lu sur le LiDAR
// franchit la limite, et rien dans la mesure ne dit s'il s'agit d'un seul toit ou de deux maisons
// mitoyennes aux toits de meme hauteur. Ici, la question, une par batiment, posee quand aucun autre
// dialogue n'attend : a l'ouverture du projet, apres un import et apres une actualisation IGN. Sa
// reponse est une modification du projet (Ctrl+Z la defait) ; Echap n'en donne aucune, et la
// question revient a la prochaine ouverture.

import { dialogues } from '../../shell/dialogues.js';
import { libelleParcelle } from '../../geo/bdtopo.js';
import { partsACheval, corpsQuiFranchissent, type PartACheval } from '../../model/aCheval.js';
import { signedArea } from '../../geometry/basic.js';
import { corpsParParcelle } from './toitsLidar.js';
import { avecProfilsDuBatiment, contexteProfils } from '../../facade/regles/toits/profils.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';

export interface ContexteToitsACheval {
  objets: () => ObjetPlan[];
  lectureSeule: () => boolean;
  /** L'instantane d'avant la reponse ; rend de quoi l'empiler une fois les corps ecrits (core/historique.ts). */
  preparer: () => () => void;
  /** Le plan et la Vue 3D redessines. */
  apresModification: () => void;
  /** Le batiment en question, selectionne sur le plan : son nom BD TOPO (« Indifférencié ») ne le designe pas. */
  montrer?: (o: ObjetPlan) => void;
}

/** Les batiments dont la toiture attend une reponse. */
export function batimentsEnDoute(objets: readonly ObjetPlan[]): ObjetPlan[] {
  return objets.filter((o) => o.fonction === 'batiment' && !!o.toitACheval && !o.toitACheval.reponse && !!o.corpsToit?.length);
}

const nombre = (v: number) => v.toLocaleString('fr-FR', { maximumFractionDigits: 1 });

/** « votre parcelle AE 101 (62 m²) », « la parcelle AE 102 (48 m²) ». */
function libellePart(p: PartACheval, objets: readonly ObjetPlan[]): string {
  const parcelle = objets.find((o) => o.key === p.parcelle);
  const cad = (parcelle?.cadastre ?? {}) as { numero?: string | number; section?: string; idu?: string };
  const ref = libelleParcelle(cad) || parcelle?.name || '';
  return (p.parcelle === 'parcelle' ? 'votre parcelle ' : 'la parcelle ') + ref + ' (' + nombre(p.aire) + ' m²)';
}

/** « « Indifférencié », 90 m² » : son nom, s'il en a un, et sa surface au sol. */
function designation(o: ObjetPlan): string {
  const nom = (o.name || '').trim();
  const pts = 'pts' in o && Array.isArray(o.pts) ? (o.pts as PtBrut[]) : [];
  const aire = nombre(Math.round(Math.abs(signedArea(pts))));
  return (nom ? '« ' + nom + ' », ' : '') + aire + ' m² au sol';
}

/** Le titre, le texte et les points de la question posee pour un batiment. */
export function questionACheval(o: ObjetPlan, objets: readonly ObjetPlan[]): { titre: string; texte: string; points: string[] } | null {
  const parts = partsACheval(o, objets);
  if (!parts) return null;
  const franchissent = corpsQuiFranchissent(o.corpsToit, parts);
  const faitages = [...new Set(franchissent.map((c) => c.faitage))].sort((a, b) => b - a);
  const lu = faitages.length
    ? 'Le LiDAR y lit un toit continu (faîtage à ' + faitages.map((f) => nombre(f) + ' m').join(', ') + ') qui passe par-dessus la limite.'
    : 'Le LiDAR y lit un toit qui passe par-dessus la limite.';
  const ou = parts.map((p) => libellePart(p, objets));
  return {
    titre: 'Un toit ou deux ?',
    texte: 'Le bâtiment sélectionné sur le plan (' + designation(o) + ') est à cheval sur ' + ou.slice(0, -1).join(', ') + ' et ' + ou[ou.length - 1] + '. ' + lu
      + ' Est-ce un seul bâtiment, ou des maisons mitoyennes dont les toits ont la même hauteur ? La mesure ne permet pas de le savoir.',
    points: [
      'Un seul toit : le toit lu reste tel quel, d’un bout à l’autre du bâtiment.',
      'Un toit par parcelle : chaque côté de la limite reçoit son propre toit, lu sur sa part du LiDAR, qui s’arrête à la limite.',
      'Échap : rien ne change, et la question reviendra à la prochaine ouverture du projet.'
    ]
  };
}

/**
 * La reponse ecrite sur le batiment : un seul toit garde les corps lus ; un toit par parcelle les
 * relit sur chaque part. Rend faux quand il n'y a rien a ecrire (le batiment n'est plus a cheval).
 */
export function repondreACheval(o: ObjetPlan, objets: readonly ObjetPlan[], reponse: 'un' | 'parParcelle'): boolean {
  const parts = partsACheval(o, objets);
  if (!parts || !o.toitMesure) return false;
  // Relus sous les seuils du profil du batiment, comme a la lecture (app/toits/toitsLidar.ts).
  const mesure = o.toitMesure;
  if (reponse === 'parParcelle') o.corpsToit = avecProfilsDuBatiment(o, contexteProfils(objets), () => corpsParParcelle(o, parts, mesure, null)) ?? o.corpsToit ?? null;
  o.toitACheval = { parcelles: parts.map((p) => p.parcelle), reponse };
  return true;
}

/** Appelle `f` quand aucun dialogue n'est ouvert : une question a la fois (shell/dialogues.ts). */
function quandLibre(f: () => void): void {
  if (!dialogues.courant()) { f(); return; }
  let fait = false;
  const fin = dialogues.abonner((d) => {
    if (d || fait) return;
    fait = true;
    // Hors de la notification : l'abonne se retire avant que la question ne s'ouvre.
    queueMicrotask(() => { fin(); f(); });
  });
}

/**
 * Pose, l'une apres l'autre, les questions des batiments en doute. En lecture seule, rien : la
 * reponse modifierait le projet. Echap arrete la serie ; elle reprendra a la prochaine ouverture.
 */
export function poserQuestionsToitsACheval(ctx: ContexteToitsACheval): void {
  if (ctx.lectureSeule()) return;
  const deja = new Set<ObjetPlan>();
  const suivante = (): void => {
    const objets = ctx.objets();
    const o = batimentsEnDoute(objets).find((x) => !deja.has(x));
    if (!o) return;
    deja.add(o);
    const q = questionACheval(o, objets);
    if (!q) { suivante(); return; }
    const repondre = (reponse: 'un' | 'parParcelle') => {
      const empiler = ctx.preparer();
      if (repondreACheval(o, ctx.objets(), reponse)) { empiler(); ctx.apresModification(); }
      quandLibre(suivante);
    };
    ctx.montrer?.(o);
    dialogues.ouvrir({
      type: 'choix', titre: q.titre, texte: q.texte, points: q.points,
      principal: { libelle: 'Un seul toit', executer: () => repondre('un') },
      secondaire: { libelle: 'Un toit par parcelle', executer: () => repondre('parParcelle') }
    });
  };
  quandLibre(suivante);
}
