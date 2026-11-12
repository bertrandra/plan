// L'arbre des objets a marquer (etape 0) : celui que le banc propose la premiere fois, et ce qu'on en tire (l'ordre YOLO,
// le parent permis d'un objet). La personne le change ensuite a l'ecran Classes ; il vit dans data/apprentissage/classes.json.

import type { Classe } from './types.js';
import arbreLivre from '../data/apprentissage/classes.json';

/**
 * L'arbre de depart (demande du proprietaire, 12 novembre 2026) : un fichier de donnees, banc/data/apprentissage/classes.json, livre dans
 * data/apprentissage/ a cote de banc-config.php, et non du code. Le banc le prend tel quel la premiere fois ; ensuite l'arbre se change a
 * l'ecran Classes (0) et vit dans data/apprentissage/classes.json du serveur. Ses vingt noms appris, dans l'ordre (fenetre_1v ... loggia),
 * se rangent sous des regroupements (Ouverture, Fermeture, Saillie) ; la facade porte aussi ses lignes (egout, sol), les parties du mur
 * (pignon, soubassement) et ses equipements ; la cheminee est sur la toiture, hors de la facade.
 */
export const CLASSES_DEFAUT: Classe[] = arbreLivre as Classe[];

/** Les classes dans l'ordre de l'arbre : chaque parent avant ses enfants, les orphelins a la fin. */
export function ordreDeLArbre(classes: readonly Classe[]): Classe[] {
  const ids = new Set(classes.map((c) => c.id));
  const enfants = new Map<string, Classe[]>();
  for (const c of classes) {
    const p = c.parent && ids.has(c.parent) ? c.parent : '';
    enfants.set(p, [...(enfants.get(p) ?? []), c]);
  }
  const ordre: Classe[] = [];
  const vus = new Set<string>();
  const visiter = (p: string) => {
    for (const c of enfants.get(p) ?? []) {
      if (vus.has(c.id)) continue;
      vus.add(c.id);
      ordre.push(c);
      visiter(c.id);
    }
  };
  visiter('');
  return [...ordre, ...classes.filter((c) => !vus.has(c.id))];
}

/** La profondeur d'une classe dans l'arbre (0 a la racine). */
export function profondeur(classes: readonly Classe[], id: string): number {
  const par = new Map(classes.map((c) => [c.id, c.parent]));
  let n = 0;
  for (let p = par.get(id) ?? null; p && n < 20; p = par.get(p) ?? null) n++;
  return n;
}

/** Les noms appris d'une classe : ses types, sinon elle-meme ; rien pour une classe non apprise, un regroupement ou une ligne (YOLO n'apprend pas de lignes). */
export const nomsDeLaClasse = (c: Classe): string[] => (!c.apprendre || c.regroupement || c.forme === 'ligne' ? [] : c.types?.length ? c.types.map((x) => x.id) : [c.id]);

/** Un detail : une classe rangee dans un objet appris (le cadre d'une fenetre), et non une simple sous-categorie d'un regroupement. */
export function estDetail(c: Classe, classes: readonly Classe[]): boolean {
  const par = new Map(classes.map((x) => [x.id, x]));
  for (let p = c.parent ? par.get(c.parent) : undefined, n = 0; p && n < 20; p = p.parent ? par.get(p.parent) : undefined, n++) if (p.apprendre && !p.regroupement) return true;
  return false;
}

/**
 * Les noms YOLO (le meme ordre que l'export, api.php::noms_yolo) : d'abord les objets principaux dans l'ordre de l'arbre, puis les details
 * appris (un cadre, un quadrillage). Apprendre un detail ajoute donc des indices a la fin, sans decaler ceux des objets principaux.
 */
export function nomsYolo(classes: readonly Classe[]): string[] {
  const ordre = ordreDeLArbre(classes);
  return [...new Set([...ordre.filter((c) => !estDetail(c, classes)), ...ordre.filter((c) => estDetail(c, classes))].flatMap(nomsDeLaClasse))];
}

/** Le chemin d'un nom YOLO dans l'arbre, de la racine au type : « facade > ouverture > fenetre > fenetre_2v ». */
export function cheminDuNom(nom: string, classes: readonly Classe[]): string[] {
  const c = cibleDuNom(nom, classes);
  if (!c) return [nom];
  const par = new Map(classes.map((x) => [x.id, x]));
  const l: string[] = c.type ? [c.type] : [];
  for (let k = par.get(c.classe), n = 0; k && n < 20; k = k.parent ? par.get(k.parent) : undefined, n++) l.unshift(k.id);
  return l;
}

/** L'indice YOLO de chaque nom appris. */
export function indicesYolo(classes: readonly Classe[]): Map<string, number> {
  return new Map(nomsYolo(classes).map((n, i) => [n, i]));
}

/** Le nom YOLO d'un objet : son type pour une classe a types (null s'il n'est pas qualifie), sa classe sinon ; null hors du jeu. */
export function nomYoloDe(o: { classe: string; type?: string }, classes: readonly Classe[]): string | null {
  const c = classes.find((x) => x.id === o.classe);
  if (!c?.apprendre || c.regroupement || c.forme === 'ligne') return null;
  if (!c.types?.length) return c.id;
  return c.types.some((t) => t.id === o.type) ? (o.type ?? null) : null;
}

/** La classe et le type qu'un nom YOLO designe (un nom de type, ou d'une classe) ; null s'il n'est pas dans l'arbre. */
export function cibleDuNom(nom: string, classes: readonly Classe[]): { classe: string; type?: string } | null {
  for (const c of classes) {
    if (c.types?.some((t) => t.id === nom)) return { classe: c.id, type: nom };
    if (c.id === nom) return { classe: c.id };
  }
  return null;
}

/** Ce qui ne va pas dans un arbre : un identifiant invalide ou en double, un parent inconnu, une boucle. */
export function erreursDeLArbre(classes: readonly Classe[]): string[] {
  const e: string[] = [];
  const ids = new Set<string>();
  for (const c of classes) {
    for (const id of [c.id, ...(c.types ?? []).map((t) => t.id)]) {
      if (!/^[a-z][a-z0-9_-]{0,39}$/.test(id)) e.push(`« ${id} » : identifiant en minuscules, chiffres, _ et -.`);
      if (ids.has(id)) e.push(`« ${id} » est en double.`);
      ids.add(id);
    }
    if (!/^#[0-9a-fA-F]{6}$/.test(c.couleur)) e.push(`« ${c.id} » : couleur #rrggbb attendue.`);
  }
  const classesIds = new Set(classes.map((c) => c.id));
  for (const c of classes) {
    if (c.parent && !classesIds.has(c.parent)) e.push(`« ${c.id} » : parent inconnu « ${c.parent} ».`);
    if (c.parent && profondeur(classes, c.id) >= 20) e.push(`« ${c.id} » : l’arbre boucle.`);
  }
  return e;
}

/** Un identifiant tire d'un nom : « Porte de garage » -> « porte-de-garage » (« porte_de_garage » avec sep = '_', pour un nom YOLO). */
export function idDuNom(nom: string, sep: '-' | '_' = '-'): string {
  const s = nom.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/œ/gi, 'oe').toLowerCase().replace(/[^a-z0-9]+/g, sep).replace(/^[-_]+|[-_]+$/g, '');
  return (/^[a-z]/.test(s) ? s : 'c' + sep + s).slice(0, 40) || 'classe';
}

/**
 * Ce qu'on peut poser a l'editeur : d'abord ce que le modele apprend (chaque type d'une classe a types, deja qualifie ; les classes
 * apprises sans types), puis le reste (une classe a types seule, a qualifier ; les classes non apprises). Les chiffres 1 a 9 de
 * l'editeur prennent les premiers.
 */
export function choixDeCreation(classes: readonly Classe[]): { valeur: string; nom: string; couleur: string }[] {
  // Un regroupement ne se dessine pas : il n'est pas propose.
  const ordre = ordreDeLArbre(classes).filter((c) => !c.regroupement);
  const appris = ordre.flatMap((c) => (!c.apprendre ? [] : c.types?.length ? c.types.map((t) => ({ valeur: c.id + ':' + t.id, nom: t.nom, couleur: c.couleur })) : [{ valeur: c.id, nom: c.nom, couleur: c.couleur }]));
  const reste = ordre.filter((c) => !c.apprendre || c.types?.length).map((c) => ({ valeur: c.id, nom: c.types?.length && c.apprendre ? c.nom + ' (à qualifier)' : c.nom, couleur: c.couleur }));
  return [...appris, ...reste];
}

/** Le libelle d'un objet : le nom de son type, sinon celui de sa classe. */
export function libelleDe(o: { classe: string; type?: string }, classes: readonly Classe[]): string {
  const c = classes.find((x) => x.id === o.classe);
  return c?.types?.find((t) => t.id === o.type)?.nom ?? c?.nom ?? o.classe;
}

/** La classe dans laquelle un objet de cette classe se pose : son parent, en sautant les regroupements (une fenetre est dans la facade). */
export function classeContenante(c: Pick<Classe, 'parent'>, classes: readonly Classe[]): string | null {
  let p = c.parent;
  for (let n = 0; p && n < 20 && classes.find((x) => x.id === p)?.regroupement; n++) p = classes.find((x) => x.id === p)?.parent ?? null;
  return p;
}
