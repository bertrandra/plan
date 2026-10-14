// L'accord d'envoyer ses photos a l'analyse par Claude, garde par projet sur cet appareil (decision
// D2 du plan : une fois par projet, rappele au lancement, revocable ; MD/spec-audit.md §13.2).
//
// Pourquoi ici et pas dans le projet : l'accord est celui de la personne qui tient le telephone, pas
// une donnee du projet ; l'ecrire dans le projet le marquerait « modifie » et le ferait voyager chez
// les autres membres de l'organisation, qui n'ont rien accepte. Pourquoi pas seulement dans la
// capture : un second audit du meme projet ne doit pas reposer la question.
//
// Le stockage du navigateur peut manquer (navigation privee, donnees effacees) : on retombe alors
// sur la question, posee a nouveau. Rien ne casse.

import type { AccordAnalyse } from '../model/auditParcelle.js';

const PREFIXE = 'plan.accordAnalyse.';

/** Ce qu'il faut du stockage : `localStorage`, ou un simulacre dans les tests. */
export type StockageAccords = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export interface MemoireAccords {
  lire(projet: string): AccordAnalyse | null;
  /** `null` retire l'accord (revocation). */
  ecrire(projet: string, accord: AccordAnalyse | null): void;
}

function estAccord(v: unknown): v is AccordAnalyse {
  return !!v && typeof v === 'object' && typeof (v as AccordAnalyse).t === 'string' && typeof (v as AccordAnalyse).partage === 'boolean';
}

/** La memoire des accords sur ce stockage ; `null` (pas de stockage) : rien n'est garde. */
export function creerMemoireAccords(stockage: StockageAccords | null): MemoireAccords {
  return {
    lire(projet) {
      if (!stockage) return null;
      try {
        const brut = stockage.getItem(PREFIXE + projet);
        const v: unknown = brut ? JSON.parse(brut) : null;
        return estAccord(v) ? { t: v.t, partage: v.partage } : null;
      } catch {
        return null;
      }
    },
    ecrire(projet, accord) {
      if (!stockage) return;
      try {
        if (accord) stockage.setItem(PREFIXE + projet, JSON.stringify({ t: accord.t, partage: accord.partage }));
        else stockage.removeItem(PREFIXE + projet);
      } catch { /* stockage plein ou bloque : la question sera reposee au prochain audit */ }
    },
  };
}

/** Le stockage du navigateur, ou null quand il est inaccessible (son accesseur peut lever). */
export function stockageAccordsNavigateur(): StockageAccords | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
