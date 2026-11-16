// Le mode expert (lot 3 de la simplification de l'interface, 16 novembre 2026).
//
// Plan sert deux publics : la personne qui dessine et chiffre sa terrasse, et celle qui veut la main sur tout (le menuisier, l'admin
// des demos). L'ecran de la premiere n'a pas a porter les formats techniques (DXF, GLB, JSON…), les constantes de calcul ni les
// reglages fins de la 3D. Le mode expert les montre ; eteint, ce qui est le reglage par defaut, ils ne sont pas rendus. Rien n'est
// retire du programme : qui l'allume retrouve tout, a sa place, et un projet ne change pas d'un mode a l'autre (un champ cache garde
// sa valeur et le calcul la lit).
//
// Trois chemins, un par sorte de controle, tous lus dans une donnee plutot que codes dans un composant :
//   - une commande : `MODE_EXPERT` (app/exposition.ts), que le registre efface comme une capacite manquante (app/commandes.ts) ;
//   - un champ ou une section de l'inspecteur : `expert: true` sur son descripteur (ui/champs/types.ts, `champsVisibles`) ;
//   - un controle d'interface (une case de la Vue 3D) : `expert: true` dans le catalogue (app/controlesInterface.ts), lu par
//     `controleMontre`.
//
// C'est une preference de l'appareil, comme l'enregistrement automatique : gardee dans le navigateur, ni Ctrl+Z, ni « projet
// modifie », permise en lecture seule.

import { CONTROLES } from './controlesInterface.js';

/** Ce que le mode expert lit du magasin (app/magasin.ts), sans l'importer : le magasin le branche. */
interface AvecOptions { options: { modeExpert: boolean } }
interface MagasinDuMode {
  store: { subscribe(f: (s: AvecOptions, avant: AvecOptions) => void): () => void };
  definirOption(cle: 'modeExpert', valeur: boolean): void;
  notifier(): void;
}

export const CLE_MODE_EXPERT = 'plan.modeExpert';

/** Lit la preference : eteinte par defaut, et quand le stockage est refuse. */
export function lireModeExpert(stockage: Pick<Storage, 'getItem'> | null = globalThis.localStorage ?? null): boolean {
  try { return stockage?.getItem(CLE_MODE_EXPERT) === 'oui'; } catch { return false; }
}

/** Ecrit la preference ; un stockage refuse (navigation privee) la garde pour la session seulement. */
export function ecrireModeExpert(actif: boolean, stockage: Pick<Storage, 'setItem'> | null = globalThis.localStorage ?? null): void {
  try { stockage?.setItem(CLE_MODE_EXPERT, actif ? 'oui' : 'non'); } catch { /* preference de session */ }
}

/** Le controle d'interface se montre-t-il ? Oui, sauf un reglage fin du catalogue tant que le mode expert est eteint. */
export function controleMontre(s: AvecOptions, cle: string): boolean {
  return s.options.modeExpert || !CONTROLES[cle]?.expert;
}

/**
 * Pose la preference lue dans le magasin, puis la suit : chaque bascule s'ecrit dans le navigateur et redessine les zones, qui
 * relisent l'etat des commandes et les champs visibles. Rend de quoi cesser de suivre.
 */
export function brancherModeExpert(magasin: MagasinDuMode, stockage: Pick<Storage, 'getItem' | 'setItem'> | null = globalThis.localStorage ?? null): () => void {
  magasin.definirOption('modeExpert', lireModeExpert(stockage));
  return magasin.store.subscribe((s, avant) => {
    if (s.options.modeExpert === avant.options.modeExpert) return;
    ecrireModeExpert(s.options.modeExpert, stockage);
    magasin.notifier();
  });
}
