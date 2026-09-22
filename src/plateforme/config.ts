// Les deux seuls faits que le paquet livre porte sur la plateforme, et pourquoi il n'y en a que deux.
//
// `BACKPROD_API_URL` et `BACKPROD_PRODUCT_CODE` sont publics : l'origine de la plateforme se lit
// dans la barre d'adresse des que la page appelle, et le code produit voyage en clair dans chaque
// en-tete `X-Product`. Les deux autres variables que la specification nomme — la cle produit
// `bpk_…` et le secret de webhook `bwh_…` — sont des secrets de serveur, et Plan n'a pas de
// serveur : elles n'existent nulle part ici, et le garde-fou du build le prouve a chaque
// compilation (MD/spec-connexion-plateforme.md §2).
//
// Elles entrent par `define` de Vite au moment du build, depuis l'environnement. Rien ne les lit a
// l'execution : une origine changee demande une recompilation, ce qui est voulu — l'adresse de la
// plateforme fait partie de ce qu'on livre, pas de ce qu'on configure sur l'hote.

/**
 * L'origine de la plateforme, sans chemin final.
 *
 * Jamais vide : depuis l'etape 4, le build refuse de produire un fichier sans elle
 * (`vite.config.ts`). Le drapeau qui faisait de l'absence un mode — Plan se comportant comme en
 * `1.2.0` — a ete retire du code en meme temps qu'`api.php`, parce qu'un deploiement qui l'aurait
 * oublie aurait garde ouverts l'API et le dossier des donnees.
 */
export const BACKPROD_API_URL: string = __BACKPROD_API_URL__;

/** Ce que dit l'en-tete `X-Product` sur chaque appel a la plateforme. */
export const BACKPROD_PRODUCT_CODE: string = __BACKPROD_PRODUCT_CODE__;

/**
 * L'adresse complete d'une operation, a partir de son chemin de contrat.
 *
 * Le chemin vient de `OPERATIONS` (contrat.ts), avec ses trous `{nom}` : personne n'ecrit une URL a
 * la main, et un trou qu'on oublie de remplir est une erreur tout de suite, pas un `404` plus tard.
 */
export function adresse(chemin: string, params: Record<string, string> = {}): string {
  const rempli = chemin.replace(/\{(\w+)\}/g, (_, nom: string) => {
    const v = params[nom];
    if (v === undefined || v === '') throw new Error('adresse : parametre « ' + nom + ' » manquant pour ' + chemin);
    return encodeURIComponent(v);
  });
  return BACKPROD_API_URL.replace(/\/+$/, '') + rempli;
}
