// Le catalogue de l'assistant (lot L6 de MD/spec-lecture-ia-elargie.md §4.7) : ce que Claude peut proposer, GENERE par le code a
// l'instant de la demande, jamais ecrit a la main.
//
//   - les commandes du registre que leur declaration ouvre a l'assistant (`Commande.assistant`, app/commandes.ts), exposees dans la
//     classe d'ecran (app/exposition.ts), avec leur etat (`commandes.etat`) ; une commande effacee (capacite non achetee) n'y est pas,
//     comme elle n'est pas a l'ecran ;
//   - les objets du projet (le voisinage importe n'en est pas), la selection marquee ;
//   - les champs de l'objet selectionne, tels que l'inspecteur les montre (ui/champs/) : leur valeur, leurs bornes, leurs options.
//
// Le texte qui part a Claude (`texteCatalogue`) et la verification des etapes rendues (app/assistant/etapes.ts) lisent le meme
// catalogue : Claude ne peut nommer que ce que Plan sait faire, et Plan ecarte tout le reste.

import { EXPOSITION, type Classe } from '../exposition.js';
import { champActif, ecritLeProjet } from '../administration/ecritures.js';
import { champsVisibles, type Champ, type ContexteChamps, type Section } from '../../ui/champs/types.js';
import type { Commande, EtatCommande } from '../commandes.js';
import type { ObjetPlan } from '../../model/types.js';

/** La version de la forme du catalogue : elle suit chaque demande au journal (dans le texte envoye). */
export const VERSION_CATALOGUE = 1;

/** Ce qu'une etape ecrit : le projet (une etape d'historique), ou une preference d'affichage (ni Ctrl+Z, ni lecture seule). */
export type Ecrit = 'projet' | 'affichage';

export interface CommandeCatalogue {
  id: string;
  libelle: string;
  description?: string;
  ecrit: Ecrit;
  etat: EtatCommande;
  /** Une bascule d'affichage : son etat actuel (vrai : affichee). */
  bascule?: boolean;
}

export interface ObjetCatalogue { cle: string; nom: string; fonction: string; selectionne: boolean }

/** Les types de champ que l'assistant ecrit : une valeur qui tient dans un mot. Les textures, dates, boutons et tableaux, non. */
export type TypeChampCatalogue = 'texte' | 'nombre' | 'case' | 'choix' | 'couleur';

export interface ChampCatalogue {
  /** `section.cle` : la cle du champ dans sa section, prefixee de la section (une cle n'est unique que dans sa section). */
  cle: string;
  section: string;
  titreSection: string;
  libelle: string;
  type: TypeChampCatalogue;
  ecrit: Ecrit;
  /** La valeur actuelle, en texte (la forme qu'une etape ecrit). */
  valeur: string;
  min?: number;
  max?: number;
  pas?: number;
  unite?: string;
  options?: { valeur: string; libelle: string }[];
  /** Grise a l'ecran (son contexte ne s'y prete pas, ou la lecture seule) : une etape qui l'ecrit est refusee. */
  actif: boolean;
  /** Le descripteur lui-meme, pour l'ecrire (jamais envoye). */
  descripteur: Champ;
}

export interface Catalogue {
  version: number;
  classe: Classe;
  lectureSeule: boolean;
  commandes: CommandeCatalogue[];
  objets: ObjetCatalogue[];
  /** L'objet selectionne, dont les champs suivent. */
  selection: { cle: string; nom: string } | null;
  champs: ChampCatalogue[];
}

/** Ce que le catalogue lit de Plan en marche (app/assistant/branchement.ts), ou d'un plan de reference (les tests, la mesure). */
export interface SourceCatalogue {
  classe: Classe;
  lectureSeule: boolean;
  commandes: readonly Commande[];
  etat: (id: string) => EtatCommande;
  objets: readonly ObjetPlan[];
  selection: ObjetPlan | undefined;
  /** Le contexte des descripteurs pour l'objet selectionne, et ses sections (app/inspecteur.ts). */
  contexte: (obj: ObjetPlan) => ContexteChamps;
  sections: (c: ContexteChamps) => Section[];
  libelleType: (obj: ObjetPlan) => string;
}

/** Ce qu'une commande ecrit : le projet si elle demande le droit d'ecrire ou le declare, sinon l'affichage. */
export const ecritDeCommande = (c: Commande): Ecrit => (c.permission || c.ecrit === 'projet' ? 'projet' : 'affichage');

/** Une commande que l'assistant peut proposer dans cette classe : ouverte a lui, exposee quelque part, et pas effacee. */
function proposable(c: Commande, classe: Classe, etat: EtatCommande): boolean {
  if (!c.assistant) return false;
  const lieux = EXPOSITION[c.id]?.[classe] ?? [];
  if (!lieux.some((l) => l !== 'sansObjet')) return false;
  return etat.utilisable || etat.raison !== 'capacite';
}

/** Un nombre tel qu'une etape l'ecrit : point decimal, sans zeros inutiles. */
export const nombreTexte = (v: number): string => (Number.isFinite(v) ? String(Math.round(v * 1e6) / 1e6) : '');

/** Les champs ecrivables d'une section, `ligne` depliee. */
function champsEcrivables(champs: readonly Champ[]): Champ[] {
  return champs.flatMap((ch) => (ch.type === 'ligne' ? champsEcrivables(ch.champs) : [ch]));
}

/** Le champ tel que le catalogue le dit, ou null s'il n'est pas de ceux que l'assistant ecrit. */
function champCatalogue(ch: Champ, s: Section, c: ContexteChamps): ChampCatalogue | null {
  // Un champ qui deforme un objet du cadastre attend l'accord de la personne (interaction/retoucheTerrain.ts) : pas d'assistant.
  if (ch.retouche) return null;
  const base = { cle: s.id + '.' + ch.cle, section: s.id, titreSection: s.titre, libelle: ch.libelle || ch.nom || ch.cle,
    ecrit: (ecritLeProjet(ch) ? 'projet' : 'affichage') as Ecrit, actif: champActif(ch, c), descripteur: ch };
  try {
    switch (ch.type) {
      case 'texte': return { ...base, type: 'texte', valeur: ch.lire(c) ?? '' };
      case 'couleur': return { ...base, type: 'couleur', valeur: ch.lire(c) ?? '' };
      case 'case': return { ...base, type: 'case', valeur: ch.lire(c) ? 'oui' : 'non' };
      case 'nombre': return {
        ...base, type: 'nombre', valeur: nombreTexte(ch.lire(c)),
        ...(ch.min !== undefined ? { min: ch.min } : {}), ...(ch.max !== undefined ? { max: ch.max } : {}),
        ...(ch.pas !== undefined ? { pas: ch.pas } : {}), ...(ch.unite ? { unite: ch.unite } : {})
      };
      case 'curseur': return { ...base, type: 'nombre', valeur: nombreTexte(ch.lire(c)), min: ch.min, max: ch.max, pas: ch.pas };
      case 'choix': {
        const options = ch.options(c).map((o) => ({ valeur: o.valeur, libelle: o.libelle }));
        return { ...base, type: 'choix', valeur: ch.lire(c) ?? '', options };
      }
      default: return null;
    }
  } catch {
    // Un descripteur qui ne se lit pas pour cet objet (une donnee absente) n'entre pas : l'assistant ne l'ecrira pas.
    return null;
  }
}

/**
 * Les sections dont les champs portent sur le cote ou le coin que le plan met en evidence (le survol, le dernier clic), pas sur l'objet :
 * une etape « nommer le cote » ecrirait celui que la souris designe a l'instant d'Appliquer. L'assistant ne les ecrit pas.
 */
const SECTIONS_DU_POINTEUR = new Set(['cotes', 'coins']);

/** Les champs de l'objet selectionne que l'assistant peut ecrire, une fois par cle, dans l'ordre de l'inspecteur. */
export function champsDuCatalogue(c: ContexteChamps, sections: readonly Section[]): ChampCatalogue[] {
  const vus = new Set<string>(), out: ChampCatalogue[] = [];
  for (const s of sections) {
    if (SECTIONS_DU_POINTEUR.has(s.id)) continue;
    for (const ch of champsEcrivables(champsVisibles(s, c))) {
      const x = champCatalogue(ch, s, c);
      if (!x || vus.has(x.cle)) continue;
      vus.add(x.cle);
      out.push(x);
    }
  }
  return out;
}

/** Le catalogue, tel que Plan le voit maintenant. */
export function construireCatalogue(src: SourceCatalogue): Catalogue {
  const commandes: CommandeCatalogue[] = [];
  for (const c of src.commandes) {
    // Le drapeau avant l'etat : les commandes de l'assistant lui-meme lisent le catalogue pour dire le leur.
    if (!c.assistant) continue;
    const etat = src.etat(c.id);
    if (!proposable(c, src.classe, etat)) continue;
    commandes.push({
      id: c.id, libelle: c.libelle, ...(c.description ? { description: c.description } : {}), ecrit: ecritDeCommande(c), etat,
      ...(c.assistant?.bascule ? { bascule: c.assistant.bascule() } : {})
    });
  }
  const sel = src.selection;
  const objets = src.objets.filter((o) => !o.voisinage)
    .map((o) => ({ cle: o.key, nom: o.name || o.key, fonction: o.fonction || src.libelleType(o), selectionne: o.key === sel?.key }));
  const champs = sel ? champsDuCatalogue(src.contexte(sel), src.sections(src.contexte(sel))) : [];
  return { version: VERSION_CATALOGUE, classe: src.classe, lectureSeule: src.lectureSeule, commandes, objets, selection: sel ? { cle: sel.key, nom: sel.name || sel.key } : null, champs };
}

/** La phrase d'un refus du registre ; celle d'un refus sans phrase (rien a quoi l'appliquer). */
export function raisonDeRefus(e: EtatCommande): string | null {
  if (e.utilisable) return null;
  return 'message' in e ? e.message : 'Indisponible dans l’état actuel du plan.';
}

const NOMS_CLASSES: Record<Classe, string> = { compact: 'téléphone', moyen: 'tablette', large: 'bureau' };
const bornes = (ch: ChampCatalogue): string => {
  const u = ch.unite ? ' ' + ch.unite : '';
  const parts = [ch.unite ? 'en ' + ch.unite : null,
    ch.min !== undefined && ch.max !== undefined ? 'de ' + nombreTexte(ch.min) + ' à ' + nombreTexte(ch.max) + u
      : ch.min !== undefined ? 'au moins ' + nombreTexte(ch.min) + u : ch.max !== undefined ? 'au plus ' + nombreTexte(ch.max) + u : null,
    ch.pas !== undefined ? 'pas ' + nombreTexte(ch.pas) : null].filter(Boolean);
  return parts.length ? ', ' + parts.join(', ') : '';
};

/** Une ligne de champ du texte envoye. */
function ligneChamp(ch: ChampCatalogue): string {
  const etat = [ch.ecrit === 'affichage' ? 'affichage' : null, ch.actif ? null : 'grisé'].filter(Boolean).join(', ');
  const tete = '- `' + ch.cle + '` (' + ch.type + bornes(ch) + (etat ? ' ; ' + etat : '') + ') : ' + ch.libelle + ' = ' + (ch.valeur === '' ? '(vide)' : '`' + ch.valeur + '`');
  if (ch.type !== 'choix' || !ch.options?.length) return tete;
  return tete + ' ; options : ' + ch.options.map((o) => '`' + o.valeur + '`' + (o.libelle && o.libelle !== o.valeur ? ' (' + o.libelle + ')' : '')).join(', ');
}

/** Le catalogue en texte, tel qu'il part a Claude (premier bloc de la requete, mis en cache par le serveur). */
export function texteCatalogue(cat: Catalogue): string {
  const l: string[] = ['# Catalogue de Plan (version ' + cat.version + ')', '',
    'Écran : ' + NOMS_CLASSES[cat.classe] + '. Lecture seule : ' + (cat.lectureSeule ? 'oui (seules les préférences d’affichage s’appliquent)' : 'non') + '.', '',
    '## Commandes', ''];
  for (const c of cat.commandes) {
    const etat = c.etat.utilisable ? 'utilisable' : 'refusée : ' + raisonDeRefus(c.etat);
    l.push('- `' + c.id + '` : ' + c.libelle + (c.description ? ' — ' + c.description : '') + '. '
      + (c.bascule !== undefined ? 'Bascule d’affichage : ' + (c.bascule ? 'actuellement AFFICHÉ à l’écran ; l’exécuter le masque. ' : 'actuellement MASQUÉ, absent de l’écran ; l’exécuter l’affiche. ') : c.ecrit === 'affichage' ? 'Affichage. ' : '')
      + 'État : ' + etat + (/[.!?]$/.test(etat) ? '' : '.'));
  }
  if (!cat.commandes.length) l.push('(aucune)');
  l.push('', '## Objets du projet', '');
  for (const o of cat.objets) l.push('- `' + o.cle + '` : « ' + o.nom + ' » (' + o.fonction + ')' + (o.selectionne ? ' — sélectionné' : ''));
  l.push('');
  if (!cat.selection) {
    l.push('## Champs', '', 'Aucun objet n’est sélectionné : aucun champ ne s’écrit.');
  } else {
    l.push('## Champs de l’objet sélectionné « ' + cat.selection.nom + ' » (`' + cat.selection.cle + '`)');
    let section = '';
    for (const ch of cat.champs) {
      if (ch.section !== section) { section = ch.section; l.push('', '### ' + ch.titreSection + ' (`' + ch.section + '`)', ''); }
      l.push(ligneChamp(ch));
    }
    if (!cat.champs.length) l.push('', '(aucun champ que l’assistant puisse écrire)');
  }
  return l.join('\n') + '\n';
}

/** Le texte de la demande, entre ses deux bornes : ce que la personne a ecrit, une donnee et rien d'autre (prompt, « Ce que vous recevez »). */
export function texteDemande(demande: string): string {
  return 'Demande :\n' + demande.trim() + '\nFin de la demande.';
}
