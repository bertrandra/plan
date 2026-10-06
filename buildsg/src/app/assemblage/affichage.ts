// Ce que le plan montre ou cache, et d'ou il parle (app/assemblage/) : le lieu de la parcelle, la
// parcelle qui porte la cloture et les reglages, les bascules du voisinage et de la grille.
//
// Les bascules se rangent sur la parcelle, comme le fond orthophoto : elles suivent le projet
// enregistre plutot que d'etre reperdues a chaque ouverture.

import { lieuDeParcelle, libelleLieuTexte } from '../../model/lieu.js';
import { trouverParcelleCloture as chercherParcelleCloture } from '../../ui/cloture.js';
import type { ContexteSoleil } from '../../engine/parasol.js';
import type { EtatApp } from '../../core/state.js';
import type { Lieu } from '../../model/lieu.js';
import type { ObjetPlan } from '../../model/types.js';
import type { Magasin } from '../magasin.js';
import { estTerrain, visibleEnIsolement } from '../../model/fonctions.js';

export interface Affichage {
  /** La parcelle qui porte la cloture, le lieu et les reglages : `parcelle`, sinon le premier terrain. */
  trouverParcelleCloture(): ObjetPlan | undefined;
  lieuActuel(): Lieu;
  libelleLieu(): string;
  /** Le lieu dans la barre d'application : il suit la parcelle (import, actualisation). */
  syncLieuTitre(): void;
  /** Date, heure et lieu, pour les ombres des parasols. */
  contexteSoleilParasol(): ContexteSoleil;
  /** Terrain au sens large : la parcelle principale et les parcelles voisines importees. */
  estTerrain(o: ObjetPlan): boolean;
  objetMasque(o: ObjetPlan): boolean;
  enregistrerAffichage(): void;
}

export function creerAffichage(etat: EtatApp, magasin: Magasin, markDirty: () => void): Affichage {
  const trouverParcelleCloture = () => chercherParcelleCloture(etat.objects);
  const lieuActuel = () => lieuDeParcelle(trouverParcelleCloture());
  const libelleLieu = () => libelleLieuTexte(lieuActuel());
  return {
    trouverParcelleCloture, lieuActuel, libelleLieu,
    syncLieuTitre() { magasin.definirLieu(trouverParcelleCloture() ? libelleLieu() : ''); },
    contexteSoleilParasol() {
      const lieu = lieuActuel();
      return { dateStr: etat.parasol.dateStr, minutes: etat.parasol.minutes, lieu: { latitude: lieu.latitude, longitude: lieu.longitude } };
    },
    estTerrain,
    // Masquer le voisinage ne touche pas au `hidden` de chaque objet : sinon decocher puis recocher
    // effacerait les objets que l'utilisateur avait masques lui-meme.
    // Un objet isole (app/isolement.ts) masque tout le reste sauf ses associes (la terrasse d'une
    // piscine), a l'affichage seulement : le `hidden` des objets n'est pas touche, et sortir de
    // l'isolement rend le plan tel qu'il etait.
    objetMasque: (o) => !!o.hidden || !!(o.voisinage && !etat.voisinageVisible) || !visibleEnIsolement(o, etat.objects, etat.isolement),
    // Rien n'est ecrit tant que tout est aux valeurs par defaut : un projet qui n'y a jamais touche ne
    // gagne pas le champ, et le rechargement ne le fait pas passer en « modifications non enregistrees ».
    enregistrerAffichage() {
      const p = trouverParcelleCloture();
      if (!p) return;
      const auxDefauts = etat.voisinageVisible && etat.grilleVisible;
      if (!p.affichage || typeof p.affichage !== 'object') {
        if (auxDefauts) return;
        p.affichage = {};
      }
      if (p.affichage.voisinage === etat.voisinageVisible && p.affichage.grille === etat.grilleVisible) return;
      p.affichage.voisinage = etat.voisinageVisible;
      p.affichage.grille = etat.grilleVisible;
      markDirty();
    }
  };
}
