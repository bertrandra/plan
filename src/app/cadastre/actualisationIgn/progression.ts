// L'actualisation IGN (app/cadastre/actualisationIgn.ts) : ce qu'elle demande au reste du programme, et son avancement — une seule
// a la fois, la commande grisee et la roue d'attente au centre de l'ecran, l'etape en cours ecrite dessous.

import { attente } from '../../../shell/attente.js';
import type { lireRelief } from '../../../geo/relief.js';
import type { toitsDepuisLidar } from '../../toits/toitsLidar.js';
import type { couleursMursDepuisPhotos } from '../../../render/couleurMurPhoto.js';
import type { ObjetSerialise } from '../../../model/creation.js';
import type { EtatApp } from '../../../core/state.js';
import type { ObjetPlan, ObjetBrut } from '../../../model/types.js';

/** Ce que l'actualisation demande au reste du programme. */
export interface ContexteActualisation {
  etat: EtatApp;
  markDirty: () => void;
  pushHistory: () => void;
  rebuildSelector: () => void;
  render: () => void;
  restoreState: (instantane: { objects: ObjetBrut[]; measures: unknown[] }) => void;
  serializeMeasures: (ms: EtatApp['measures']) => unknown[];
  serializeObjects: (objs: ObjetPlan[]) => ObjetSerialise[];
  syncLieuTitre: () => void;
  trouverParcelleCloture: () => ObjetPlan | null | undefined;
  /** La lecture du relief a l'IGN ; remplacable dans les tests, qui ne touchent pas le reseau. */
  lireRelief?: typeof lireRelief;
  /** Les toits ajustes sur le LiDAR HD (app/toits/toitsLidar.ts) ; remplacable de meme. */
  toitsLidar?: typeof toitsDepuisLidar;
  /** La couleur des murs sur les photos de rue (render/couleurMurPhoto.ts) ; remplacable de meme. */
  couleursMurs?: typeof couleursMursDepuisPhotos;
  /** Apres une actualisation reussie : les questions sur les toits a cheval sur deux parcelles (app/toits/toitsACheval.ts). */
  apresActualisation?: () => void;
}

let enCours = false;
const abonnes = new Set<() => void>();
/** Le debut et la fin d'une actualisation : la commande se grise, la roue d'attente parait au centre (shell/attente.ts). */
function signaler(): void {
  attente.poser('actualisation-ign', enCours ? 'Actualisation IGN : la parcelle et le cadastre…' : null);
  abonnes.forEach(f => f());
}
/** L'etape en cours, au centre de l'ecran, tant que l'actualisation tourne. */
export function etape(texte: string): void { if (enCours) attente.poser('actualisation-ign', 'Actualisation IGN : ' + texte); }
/** Une actualisation commence : la commande se grise, la roue parait. */
export function commencer(): void { enCours = true; signaler(); }
/** Elle finit, reussie ou non. */
export function finir(): void { enCours = false; signaler(); }
export const actualisation = {
  enCours: (): boolean => enCours,
  abonner(f: () => void): () => void { abonnes.add(f); return () => { abonnes.delete(f); }; }
};
