// Le dossier de declaration dans le navigateur (lot L5) : le service, sur le plan en marche. La redaction passe par le client des routes
// de Claude de la lecture du PLU (le jeton de la plateforme, ou le cookie de l'admin) ; la relecture charge le moteur des PDF a la
// demande (AD-10), comme l'export ; la Vue 3D compte pour le DP6 quand elle est ouverte, comme a l'export.

import { lecturePluDuNavigateur } from '../plu/navigateurPlu.js';
import { moteurPdf } from '../assemblage/exports.js';
import { creerServiceDossier, type ServiceDossier } from './serviceDossier.js';
import { enJpeg, photosDeLAudit } from './photosDossier.js';
import { parcelleDuProjet } from '../../model/fonctions.js';
import { vue3d } from '../../three/etat3d.js';
import { showToast } from '../../shell/dialogs.js';
import type { EtatApp } from '../../core/state.js';
import type { Magasin } from '../magasin.js';

export function serviceDossierDuNavigateur(etat: EtatApp, magasin: Magasin, d: { pushHistory: (...o: object[]) => void; markDirty: (...o: object[]) => void }): ServiceDossier {
  return creerServiceDossier({
    etat, pushHistory: d.pushHistory, markDirty: d.markDirty, notifier: () => magasin.notifier(), toast: showToast, maintenant: () => new Date(),
    redaction: lecturePluDuNavigateur(etat, () => magasin.store.getState().projet.courant?.id ?? null),
    ramenerEnJpeg: enJpeg, photosDeLAudit,
    relire: async (objets) => {
      const p = parcelleDuProjet(objets);
      return (await moteurPdf()).relireAvantExport(objets, { carte: !!(p?.latitude && p.longitude), vue3d: !!vue3d.scene });
    },
  });
}
