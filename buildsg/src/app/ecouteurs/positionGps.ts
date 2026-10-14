// « Ma position (3D) » (menu Affichage) : la position GPS de l'appareil suivie dans la Vue 3D.
//
// Une preference d'affichage, decochee par defaut, comme « Filaire » : ni Ctrl+Z, ni « projet
// modifie », permise en lecture seule, et pas enregistree (c'est l'appareil qui bouge, pas le projet).
// Tant qu'elle est cochee, le navigateur donne une position a chaque deplacement ; chacune est
// ramenee dans le repere du plan (le calage du cadastre) et ne fait que deplacer le marqueur
// (three/positionGps3d.ts) : aucune scene n'est reconstruite.

import { suivrePositionGps, geolocalisationDisponible, type PositionGps, type SansPosition } from '../../shell/geolocalisation.js';
import { showToast } from '../../shell/dialogs.js';
import { projecteurLocal } from '../../geo/projection.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { poserPositionGps, retirerPositionGps } from '../../three/positionGps3d.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';

/** Au-dela, on previent une fois que la position est loin du projet : le point serait hors du sol dessine. */
export const LOIN_DU_PROJET_M = 2000;

export interface DependancesPositionGps {
  suivre?: typeof suivrePositionGps;
  disponible?: () => boolean;
  poser?: (p: PtBrut, precisionM: number) => void;
  retirer?: () => void;
  signaler?: (message: string) => void;
}

/** La position dans le repere du plan, ou null si le plan n'est pas cale sur le cadastre. */
export function positionDansLePlan(objets: readonly ObjetPlan[], g: PositionGps): PtBrut | null {
  const cad = parcelleDuProjet(objets as ObjetPlan[])?.cadastre as { origineLat?: unknown; origineLon?: unknown } | null | undefined;
  if (typeof cad?.origineLat !== 'number' || typeof cad.origineLon !== 'number') return null;
  return projecteurLocal(cad.origineLat, cad.origineLon).versMetres(g.lon, g.lat);
}

const MESSAGES: Record<SansPosition['raison'], string> = {
  refusee: 'Position refusée : autorisez la localisation pour ce site dans les réglages du navigateur.',
  indisponible: 'Position momentanément indisponible : elle reviendra dès que le GPS captera.',
  delai: 'La position tarde à venir : elle s’affichera dès que le GPS répondra.',
};

export function brancherPositionGps(a: Atelier, cmd: RegistreCommandes, d: DependancesPositionGps = {}): void {
  const suivre = d.suivre ?? suivrePositionGps;
  const poser = d.poser ?? poserPositionGps;
  const retirer = d.retirer ?? retirerPositionGps;
  const signaler = d.signaler ?? showToast;
  let arreter: (() => void) | null = null;
  let loinSignale = false;
  /** Une perte de signal se dit une fois par activation, pas a chaque seconde. */
  let perteSignalee = false;

  const eteindre = () => {
    arreter?.(); arreter = null;
    retirer();
    a.etat.positionGps = false;
    a.rebuildSelector();
  };

  cmd.declarer({
    id: 'affichage.positionGps', libelle: 'Ma position (3D)', groupe: 'affichage',
    actif: () => (d.disponible ?? geolocalisationDisponible)(),
    executer: () => {
      if (a.etat.positionGps) { eteindre(); return; }
      a.etat.positionGps = true;
      loinSignale = false;
      perteSignalee = false;
      a.rebuildSelector();
      arreter = suivre((g) => {
        const p = positionDansLePlan(a.etat.objects, g);
        if (!p) { signaler('Ce projet n’est pas calé sur le cadastre : votre position ne peut pas s’y placer.'); eteindre(); return; }
        if (!loinSignale && Math.hypot(p.x, p.y) > LOIN_DU_PROJET_M) {
          loinSignale = true;
          signaler('Vous êtes à ' + (Math.hypot(p.x, p.y) / 1000).toFixed(1).replace('.', ',') + ' km du projet : votre position est hors de la Vue 3D.');
        }
        poser(p, g.precisionM);
      }, (e) => {
        // Seul un refus arrete le suivi. Un signal perdu (sous un toit, sous les arbres) ou lent revient
        // de lui-meme : le navigateur continue d'ecouter le GPS, et on ne le dit qu'une fois.
        if (e.raison === 'refusee') { signaler(MESSAGES.refusee); eteindre(); return; }
        if (!perteSignalee) { perteSignalee = true; signaler(MESSAGES[e.raison]); }
      });
    },
  });
}
