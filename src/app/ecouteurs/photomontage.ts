// Les commandes du photomontage (demande du proprietaire, 20 novembre 2026) : poser le projet de la Vue 3D sur une photo du jardin.
//
// Un mode de la Vue 3D, pour tout le monde (pas du mode expert), et une preference d'affichage comme « Filaire » : ni Ctrl+Z, ni
// « projet modifie », permis en lecture seule. Les commandes sont declarees ici, au demarrage ; ce qui lit la photo, cale la camera
// et rend l'image (app/photomontage/session.ts) se charge au premier geste, avec la 3D.

import { photomontage } from '../photomontage/etat.js';
import { sessionToit } from '../toits/modeToit.js';
import { showErreur } from '../../shell/dialogs.js';
import { phraseReseau, detailTechnique } from '../../util/erreurReseau.js';
import { CAPACITES } from '../../plateforme/capacites.js';
import type { DependancesPhotomontage, SessionPhotomontage } from '../photomontage/session.js';
import type { GestePhoto } from '../../core/photomontage.js';
import type { RegistreCommandes } from '../commandes.js';

/** Les gestes des boutons d'ajustement : `data-geste="tournerDeg:-2"` sur le bouton (zones/vue3d/Photomontage.tsx). */
const GESTES: readonly (keyof GestePhoto)[] = ['avancerM', 'decalerM', 'monterM', 'tournerDeg', 'inclinerDeg', 'champFois'];

/** Le geste que porte un bouton, ou null s'il n'en porte pas un qu'on connaisse. */
export function gesteDuBouton(source: HTMLElement | undefined): GestePhoto | null {
  const [cle, valeur] = (source?.dataset.geste ?? '').split(':');
  const v = Number(valeur);
  const k = GESTES.find((g) => g === cle);
  return k && Number.isFinite(v) ? { [k]: v } : null;
}

export function brancherPhotomontage(cmd: RegistreCommandes, d: DependancesPhotomontage): void {
  let chargee: Promise<SessionPhotomontage> | null = null;
  /** Fait `f` avec la session, chargee au premier besoin ; un echec de chargement se dit, et se retente au geste suivant. */
  const avecSession = (f: (s: SessionPhotomontage) => void): void => {
    chargee ??= import('../photomontage/session.js').then((m) => m.sessionPhotomontage(d) as SessionPhotomontage);
    chargee.then(f, (e: unknown) => {
      chargee = null;
      showErreur(phraseReseau(e, 'Le serveur de Plan', 'Le photomontage n’a pas pu se charger : vérifiez votre connexion, puis réessayez.') ?? 'Le photomontage n’a pas pu se charger.', detailTechnique(e));
    });
  };
  const pret = () => photomontage.actif && !!photomontage.pose;
  // Pendant une session du mode Toit, la scene est la sienne : le photomontage attend qu'elle soit validee ou abandonnee.
  const libre = { actif: () => photomontage.actif || !sessionToit(), raisonInactive: () => 'Terminez d’abord la modification de la toiture.' };

  cmd.declarer({
    id: '3d.photomontage', libelle: 'Photomontage sur une photo', groupe: '3d', ...libre,
    executer: () => avecSession((s) => { if (photomontage.actif) s.quitter(); else s.entrer(); })
  });
  cmd.declarer({
    id: '3d.photomontageAjuster', libelle: 'Ajuster le point de vue du photomontage', groupe: '3d', actif: pret,
    executer: (source) => { const g = gesteDuBouton(source); if (g) avecSession((s) => s.ajuster(g)); }
  });
  cmd.declarer({
    id: '3d.photomontageRecaler', libelle: 'Revenir au calage de la photo', groupe: '3d', actif: pret,
    executer: () => avecSession((s) => s.recaler())
  });
  // Dans le menu Exporter, hors du mode : la commande y mene (il faut d'abord une photo). Dans le mode : elle enregistre l'image.
  // Sans la Vue 3D (capacite `plan.3d`), elle disparait avec elle : elle ne ferait que l'ouvrir.
  cmd.declarer({
    id: 'export.photomontage', libelle: 'Photomontage (image)', groupe: 'export', capacite: CAPACITES.vue3d.code, ...libre,
    executer: () => avecSession((s) => { if (pret()) void s.enregistrer(); else s.entrer(); })
  });
}
