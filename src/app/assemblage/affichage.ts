// Ce que le plan montre ou cache, et d'ou il parle (app/assemblage/) : le lieu de la parcelle, la
// parcelle qui porte la cloture et les reglages, les bascules du voisinage et de la grille.
//
// Les bascules se rangent sur la parcelle, comme le fond orthophoto : elles suivent le projet
// enregistre plutot que d'etre reperdues a chaque ouverture.

import { elOpt } from '../../shell/dom.js';
import { lieuDeParcelle, libelleLieuTexte } from '../../model/lieu.js';
import { trouverParcelleCloture as chercherParcelleCloture } from '../../ui/cloture.js';
import type { ContexteSoleil } from '../../engine/parasol.js';
import type { EtatApp } from '../../core/state.js';
import type { Lieu } from '../../model/lieu.js';
import type { ObjetPlan } from '../../model/types.js';
import type { Magasin } from '../magasin.js';

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
  syncBasculeGrille(): void;
  syncBasculeVoisinage(): void;
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
    estTerrain: (o) => o.key === 'parcelle' || o.fonction === 'terrain',
    // Masquer le voisinage ne touche pas au `hidden` de chaque objet : sinon decocher puis recocher
    // effacerait les objets que l'utilisateur avait masques lui-meme.
    objetMasque: (o) => !!o.hidden || !!(o.voisinage && !etat.voisinageVisible),
    syncBasculeGrille() {
      const b = document.getElementById('gridBtn');
      if (!b) return;
      b.classList.toggle('off', !etat.grilleVisible);
      b.title = (etat.grilleVisible ? 'Masquer' : 'Afficher') + ' la grille du plan';
      b.setAttribute('aria-pressed', etat.grilleVisible ? 'true' : 'false');
    },
    syncBasculeVoisinage() {
      const lab = document.getElementById('voisinageToggle');
      const cb = elOpt<HTMLInputElement>('chkVoisinage');
      if (!lab || !cb) return;
      const n = etat.objects.filter(o => !!o.voisinage).length;
      // Case affichee seulement s'il y a du voisinage a masquer : une bascule sans effet visible ferait
      // douter de ce qu'elle commande.
      lab.style.display = n ? 'inline-flex' : 'none';
      lab.title = 'Masque les ' + n + ' objet(s) importe(s) avec les parcelles adjacentes (bati, vegetation, arbres estimes), sur le plan comme en 3D. Rien n\'est supprime.';
      cb.checked = etat.voisinageVisible;
    },
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
