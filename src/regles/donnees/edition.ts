// Ce que l'ecran Admin › Regles fait des fichiers de donnees (fichiers.ts) : lire un texte, le controler avec
// le lecteur du code, changer un seuil SANS reformater le fichier, et dire ce qui change. Pur.
//
// Les seuils sont ecrits un par ligne dans les fichiers du depot : `"NOM": { "valeur": 0.8, ... "pourquoi": "..." }`.
// Changer une valeur ou une raison, c'est remplacer ce morceau de la ligne : le diff de la PR montre une ligne,
// pas un fichier reecrit. Un seuil qui ne tient pas sur une ligne s'edite dans le texte du fichier.

import type { FichierDonnees } from './fichiers.js';
import { diffLignes, lignesModifiees, type LigneDiff } from '../sujets/edition.js';

export interface Seuil { nom: string; valeur: number; unite: string; ou: string; pourquoi: string; cas: string[] }

export type LectureDonnees = { json: unknown; erreur: null } | { json: null; erreur: string };

/** Le JSON d'un texte, ou la raison pour laquelle il n'en est pas un. */
export function lireDonnees(texte: string): LectureDonnees {
  try { return { json: JSON.parse(texte), erreur: null }; } catch (e) { return { json: null, erreur: 'JSON illisible : ' + (e as Error).message }; }
}

/** Les seuils d'un fichier de reglages, dans l'ordre du fichier ; ceux qui n'ont pas la forme attendue sont ignores. */
export function seuilsDuTexte(texte: string): Seuil[] {
  const l = lireDonnees(texte);
  const t = (l.json as { seuils?: Record<string, Record<string, unknown> | null> } | null)?.seuils;
  if (!t || typeof t !== 'object') return [];
  return Object.entries(t).flatMap(([nom, s]) => (s && typeof s.valeur === 'number' ? [{
    nom, valeur: s.valeur, unite: String(s.unite ?? ''), ou: String(s.ou ?? ''), pourquoi: String(s.pourquoi ?? ''), cas: Array.isArray(s.cas) ? s.cas.map(String) : [],
  }] : []));
}

const echapper = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** L'index de la ligne du seuil `nom` (`"NOM": {`), ou -1 : les profils ecrivent `"NOM": 1.2`, sans accolade, et ne sont pas pris. */
function ligneDuSeuil(lignes: readonly string[], nom: string): number {
  const re = new RegExp('^\\s*"' + echapper(nom) + '"\\s*:\\s*\\{');
  return lignes.findIndex((l) => re.test(l));
}

/**
 * Le texte avec la valeur (ou la raison) du seuil changee, le reste de l'octet identique ; null quand le
 * seuil n'a pas sa ligne a lui (ou pas ce champ sur sa ligne) : il s'edite alors dans le texte du fichier.
 */
export function changerSeuil(texte: string, nom: string, champ: 'valeur' | 'pourquoi', valeur: number | string): string | null {
  const lignes = texte.split('\n');
  const i = ligneDuSeuil(lignes, nom);
  if (i < 0) return null;
  const ligne = lignes[i] as string;
  const re = champ === 'valeur' ? /("valeur"\s*:\s*)(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/ : /("pourquoi"\s*:\s*)("(?:[^"\\]|\\.)*")/;
  if (!re.test(ligne)) return null;
  const neuf = champ === 'valeur' ? String(valeur) : JSON.stringify(String(valeur));
  lignes[i] = ligne.replace(re, (_, avant: string) => avant + neuf);
  return lignes.join('\n');
}

export interface ControleDonnees {
  /** Le fichier est-il accepte par le lecteur du code ? */
  valide: boolean;
  /** La raison du refus, ou null. */
  erreur: string | null;
  /** L'empreinte du texte ; null s'il est refuse. */
  empreinte: string | null;
}

export function controlerDonnees(f: FichierDonnees, texte: string): ControleDonnees {
  const l = lireDonnees(texte);
  if (l.erreur !== null) return { valide: false, erreur: l.erreur, empreinte: null };
  const refus = f.refus(l.json);
  if (refus !== null) return { valide: false, erreur: refus, empreinte: null };
  // Le lecteur des seuils ne voit pas tout : une empreinte nulle malgre « pas de refus » reste un refus.
  const empreinte = f.empreinte(l.json);
  return empreinte === null ? { valide: false, erreur: 'fichier non lisible par le moteur', empreinte: null } : { valide: true, erreur: null, empreinte };
}

export interface BilanDonnees {
  controle: ControleDonnees;
  diff: LigneDiff[];
  /** Les lignes qui changent, une ligne remplacee comptant une fois. */
  lignes: number;
  /** L'empreinte du livre, et si celle du texte est autre (donc : une version de lecture a ajouter). */
  empreinteLivree: string | null;
  empreinteChange: boolean;
}

/** Ce que ce texte change par rapport au livre : le controle, le diff, l'empreinte. */
export function bilanDonnees(f: FichierDonnees, texte: string): BilanDonnees {
  const controle = controlerDonnees(f, texte);
  const livre = controlerDonnees(f, f.livre);
  const diff = diffLignes(f.livre, texte);
  return { controle, diff, lignes: lignesModifiees(diff), empreinteLivree: livre.empreinte, empreinteChange: controle.empreinte !== null && controle.empreinte !== livre.empreinte };
}

/** Un poids du fichier de reconciliation : celui d'une source par defaut (`attribut` absent), ou celui qu'un attribut lui donne. */
export interface CiblePoids { source: string; attribut?: string }

const NOMBRE = '-?\\d+(?:\\.\\d+)?';

/**
 * Le texte de regles/reconciliation.json avec un poids change, le reste de l'octet identique. Le poids d'un attribut qui n'en avait
 * pas pour cette source est ajoute a la fin de son `poids` ; `valeur` null retire ce poids (la source reprend son poids par defaut).
 * Null quand la ligne n'a pas la forme attendue : le poids s'edite alors dans le texte du fichier.
 */
export function changerPoids(texte: string, cible: CiblePoids, valeur: number | null): string | null {
  const lignes = texte.split('\n');
  const nom = echapper(cible.attribut ?? cible.source);
  const i = lignes.findIndex((l) => new RegExp('^\\s*"' + nom + '"\\s*:\\s*\\{').test(l) && l.includes(cible.attribut ? '"accord"' : '"libelle"'));
  if (i < 0) return null;
  const ligne = lignes[i] as string;
  if (!cible.attribut) {
    if (valeur === null) return null;
    const re = new RegExp('("poids"\\s*:\\s*)' + NOMBRE);
    if (!re.test(ligne)) return null;
    lignes[i] = ligne.replace(re, (_, avant: string) => avant + String(valeur));
    return lignes.join('\n');
  }
  const m = /("poids"\s*:\s*\{)([^}]*)(\})/.exec(ligne);
  if (!m) return null;
  const dedans = m[2] as string;
  const reSource = new RegExp('("' + echapper(cible.source) + '"\\s*:\\s*)' + NOMBRE);
  let neuf: string;
  if (reSource.test(dedans)) {
    if (valeur === null) neuf = dedans.replace(new RegExp(',?\\s*"' + echapper(cible.source) + '"\\s*:\\s*' + NOMBRE + '\\s*'), ' ').replace(/^\s*,/, '').replace(/\s+$/, ' ');
    else neuf = dedans.replace(reSource, (_, avant: string) => avant + String(valeur));
  } else if (valeur === null) neuf = dedans;
  else neuf = (dedans.trim() ? dedans.replace(/\s*$/, '') + ', ' : ' ') + '"' + cible.source + '": ' + String(valeur) + ' ';
  lignes[i] = ligne.slice(0, m.index) + (m[1] as string) + neuf + (m[3] as string) + ligne.slice(m.index + m[0].length);
  return lignes.join('\n');
}
