// Ce que Plan dit de lui-meme a la plateforme : son code, sa version, les schemas qu'il lit.
//
//   { "product": "plan", "app_version": "2.2.0", "schema_versions": [1, 2] }
//
// La plateforme range, par produit, les versions de document qu'elle accepte
// (`project_schema_versions`, backprod `SchemaVersionPolicy`). Elles se tenaient a la main dans la
// console, et un oubli refusait les projets d'une version de Plan toute neuve
// (`UNSUPPORTED_SCHEMA_VERSION`). Ce bloc est la source de verite qu'elle peut lire pour le faire
// seule.
//
// **Ou il vit.** Plan n'a pas de serveur : un fichier statique, `index.html`. Le bloc y est donc
// ecrit AU BUILD, dans `<head>`, comme une donnee — `<script type="application/json">`, que le
// navigateur n'execute pas et que la politique de contenu n'a pas a nommer. Un client HTTP sans
// moteur JavaScript le lit en recuperant la page et en extrayant ce bloc, par son `id`. Une
// personne le voit en ouvrant `/?version` (main.ts).
//
// **Ce qu'il ne dit pas.** Rien que le paquet public ne porte deja : la version et les schemas sont
// lisibles dans le programme livre. D'ou l'absence d'authentification — il n'y aurait rien a
// proteger, et un fichier statique ne saurait pas verifier un jeton.

import { APP_VERSION } from './version.js';
import { schemasLisibles } from './migrations.js';

/** L'`id` du bloc dans la page : c'est par lui que la plateforme le trouve. */
export const ID_DESCRIPTION = 'plan-produit';

export interface DescriptionProduit {
  product: string;
  app_version: string;
  schema_versions: number[];
}

export function descriptionProduit(code: string): DescriptionProduit {
  return { product: code, app_version: APP_VERSION, schema_versions: schemasLisibles() };
}

/**
 * Le bloc a poser dans `<head>`. `<` est echappe : une chaine contenant `</script>` ne doit jamais
 * pouvoir fermer le bloc.
 */
export function blocDescription(code: string): string {
  const json = JSON.stringify(descriptionProduit(code)).replace(/</g, '\\u003c');
  return '<script type="application/json" id="' + ID_DESCRIPTION + '">' + json + '</script>';
}
