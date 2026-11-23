// Chercher un reglage dans l'inspecteur (audit de l'inspecteur, decision B6).
//
// Une terrasse montre une cinquantaine de lignes, une maison plus de soixante, rangees en sections qu'on ouvre une a une : on ne
// savait pas ou etait « Entraxe solives ». La recherche lit les descripteurs de l'objet selectionne (leur libelle et leur aide),
// sans accents ni majuscules, et dit pour chacun sa section. Elle trouve aussi ce que le mode simple cache, en le disant : un reglage
// avance se montre en allumant le mode expert.
//
// Une fonction pure : la zone (zones/Inspecteur.tsx) la rend et va au champ choisi.

import type { Champ, ContexteChamps, Section } from './types.js';

/** Un reglage trouve : ou il est, comment il s'appelle, et s'il faut le mode expert pour le voir. */
export interface ReglageTrouve {
  section: string;
  titreSection: string;
  cle: string;
  libelle: string;
  /** Le mode simple le cache : y aller allume le mode expert. */
  avance: boolean;
  /** Le libelle lui-meme repond a la recherche (sinon, c'est son aide) : il passe devant. */
  parLibelle: boolean;
}

/** Au-dela, la liste ne se lit plus : mieux vaut preciser. */
export const RESULTATS_MAX = 12;

/** Un texte sans accents, sans majuscules, ses blancs reduits : « Entraxe Solives » et « entraxe solives » se valent. */
export function normaliser(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’']/g, ' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Les mots d'une recherche ; aucun sous deux lettres au total (une seule lettre trouverait tout). */
function mots(requete: string): string[] {
  const n = normaliser(requete);
  return n.length < 2 ? [] : n.split(' ').filter(Boolean);
}

/** Le nom qu'une ligne porte a l'ecran : son libelle, sinon le texte de son bouton. */
function nomAffiche(ch: Champ, c: ContexteChamps): string {
  if (ch.libelle) return ch.libelle;
  if (ch.type === 'bouton' && ch.texte) return ch.texte(c);
  return '';
}

/**
 * Les reglages de l'objet qui repondent a la recherche : tous ses mots dans le libelle, ou dans le libelle et l'aide reunis. Ceux
 * que leur condition cache (les plots d'une terrasse sur vis) ne sont pas proposes : ils n'ont pas de sens ici. Ceux que le mode
 * simple cache le sont, marques `avance`. Les libelles d'abord, puis l'ordre de l'inspecteur.
 */
export function chercherReglages(sections: readonly Section[], c: ContexteChamps, requete: string): ReglageTrouve[] {
  const m = mots(requete);
  if (!m.length) return [];
  const simple = c.modeSimple === true;
  const trouves: ReglageTrouve[] = [];
  for (const s of sections) {
    for (const ch of s.champs) {
      if (ch.visible && !ch.visible(c)) continue;
      const libelle = nomAffiche(ch, c);
      if (!libelle) continue;
      const nomNormalise = normaliser(libelle);
      const tout = nomNormalise + ' ' + normaliser(ch.aide ?? '');
      if (!m.every((x) => tout.includes(x))) continue;
      trouves.push({
        section: s.id, titreSection: s.titre, cle: ch.cle, libelle,
        avance: simple && (!!s.expert || (!!ch.expert && !ch.resteMontre?.(c))),
        parLibelle: m.every((x) => nomNormalise.includes(x))
      });
    }
  }
  return trouves.map((t, i) => ({ t, i })).sort((a, b) => Number(b.t.parLibelle) - Number(a.t.parLibelle) || a.i - b.i).map((x) => x.t);
}
