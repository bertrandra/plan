// L'inventaire de l'ecran dans les trois dispositions (MD/spec-demos-admin.md, « Hors registre »).
//
// Plan ne rend pas les memes controles partout : la barre compacte, la barre de selection, la
// navigation du bas, les familles de sections de l'inspecteur n'existent qu'au doigt. Releve dans la
// seule disposition du bureau, l'inventaire ne les voyait pas. La decouverte pose donc tour a tour
// chaque classe d'ecran dans le magasin (pas sur la page : l'ecran des controleurs garde la sienne),
// un objet selectionne — de preference une terrasse, qui a le plus de controles — et, au telephone,
// chaque feuille ouverte. Puis elle remet tout comme avant. Rien n'est clique, le projet ne change pas.

import { inventorierEcran, fusionnerInventaires, type Releve } from './inventaireEcran.js';
import type { Classe } from './exposition.js';
import type { Feuille, Magasin } from './magasin.js';
import type { EtatApp } from '../core/state.js';

const CLASSES: Classe[] = ['large', 'moyen', 'compact'];
const FEUILLES: Feuille[] = ['objets', 'outils', 'proprietes', 'resultats', 'projet', 'reglages3d'];
/** Le temps qu'un changement du magasin soit rendu par React. */
const rendu = () => new Promise<void>((r) => { setTimeout(r, 50); });

export async function inventorierLesClasses(magasin: Magasin, etat: EtatApp, selectionner: (cle: string | null) => void, doc: Document = document) {
  const s = magasin.store.getState();
  const avant = { classe: s.classe, feuille: s.feuille, selection: etat.selectedKey };
  const cible = etat.objects.find((o) => o.fonction === 'terrasse' && !o.hidden) ?? etat.objects.find((o) => !o.hidden);
  const releves: Releve[] = [];
  const relever = (classe: Classe) => { releves.push({ classe, ...inventorierEcran(doc) }); };
  try {
    if (cible) selectionner(cible.key);
    for (const classe of CLASSES) {
      magasin.definirClasse(classe);
      magasin.definirFeuille(null);
      await rendu();
      relever(classe);
      if (classe !== 'compact') continue;
      for (const f of FEUILLES) {
        magasin.definirFeuille(f);
        await rendu();
        relever(classe);
      }
    }
  } finally {
    magasin.definirClasse(avant.classe);
    magasin.definirFeuille(avant.feuille);
    selectionner(avant.selection);
  }
  return fusionnerInventaires(releves);
}
