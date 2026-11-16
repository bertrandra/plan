// Quitter la page avec du travail en attente : la question du navigateur (`beforeunload`).
//
// Avant le 16 novembre 2026, rien ne retenait la page : un ajout fait puis un rechargement, et il etait
// perdu sans un mot (audit de l'IHM, lot 1). Seuls les brouillons de l'audit ecoutaient `pagehide`.
// Le navigateur pose desormais sa propre question (« Quitter le site ? ») tant que le projet a des
// modifications non enregistrees, ou qu'un enregistrement part encore.
//
// Un depart que Plan provoque lui-meme, et qu'il a deja confirme ou qui suit un enregistrement reussi
// (changer de projet, ouvrir celui qu'on vient de creer, se deconnecter), ne repose pas la question :
// il passe par `partirSansQuestion` juste avant de changer d'adresse.

/** Ce qui retient la page : vrai tant qu'il reste quelque chose a enregistrer. */
let retenir: (() => boolean) | null = null;
/** Un depart voulu par Plan est en cours : la question ne se pose pas. */
let departVoulu = false;
let branche = false;

function avantDepart(e: BeforeUnloadEvent): void {
  if (departVoulu || !retenir?.()) return;
  // Les deux formes : `preventDefault` pour les navigateurs recents, `returnValue` pour les autres.
  e.preventDefault();
  e.returnValue = '';
}

/** Branche la question du navigateur sur `f`, qui dit s'il reste du travail en attente. */
export function retenirLaPage(f: () => boolean): void {
  retenir = f;
  if (branche || typeof window === 'undefined') return;
  branche = true;
  window.addEventListener('beforeunload', avantDepart);
}

/**
 * Le depart qui suit est voulu (et deja confirme) : il ne repose pas la question. Si la page reste la
 * (une adresse qui ne charge pas), la garde revient d'elle-meme apres quelques secondes.
 */
export function partirSansQuestion(): void {
  departVoulu = true;
  setTimeout(() => { departVoulu = false; }, 10_000);
}

/** La page serait-elle retenue maintenant ? (tests, fumee) */
export function pageRetenue(): boolean {
  return !departVoulu && !!retenir?.();
}
