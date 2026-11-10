// L'audit de la parcelle branche sur le plan (app/boot/branchements.ts) : la capture, la validation des propositions dans le plan
// et la Vue 3D, le partage pour le corpus, l'analyse par Claude (MD/spec-audit.md §11 a §15).

import { terrasseCourante } from '../../core/contexteTerrasse.js';
import { brancherAuditParcelle } from '../audit/parcelle/commande.js';
import { enAdmin, sessionCourante } from '../acces.js';
import { creerClientAudits } from '../../io/auditsServeur.js';
import { analyseClaudeDuNavigateur } from '../audit/parcelle/analyseNavigateur.js';
import { showToast } from '../../shell/dialogs.js';
import { vue3d } from '../../three/etat3d.js';
import type { Plan, Tardifs } from './plan.js';

/** Le jeton de la plateforme, relu a chaque appel : il se renouvelle pendant que la page vit. */
const jetonPlateforme = (): string | null => sessionCourante()?.jeton()?.valeur ?? null;
/** Le partage des audits de parcelle pour le corpus (MD/spec-audit.md §15) : un client pour la page. */
const clientAudits = creerClientAudits((entree, init) => fetch(entree, init), jetonPlateforme);

/** Branche l'audit de la parcelle sur le plan assemble. */
export function brancherLAudit(p: Plan, tardifs: Tardifs): void {
  const { etat, magasin, commandes } = p;
  brancherAuditParcelle({
    etat, ouvrir3d: () => { if (magasin.store.getState().vue !== 'vue3d') commandes.executer('vue.3d'); }, signaler: showToast,
    // La validation des propositions (§14) : un instantane, l'ecriture, le plan et la Vue 3D redessines.
    projet: {
      pushHistory: p.pushHistory, render: p.render,
      refaire3d: () => { if (vue3d.scene) tardifs.vues?.buildThreeScene(terrasseCourante(etat) || null); },
      remplacer3d: (cles, objets) => tardifs.vues?.remplacerObjets3d(cles, objets) ?? false,
      // L'avant et l'apres en deux vues (three/comparaison3d.ts), qui evitent l'ecran des propositions.
      comparer3d: (apres) => tardifs.vues?.comparerObjets3d(apres) ?? false,
      cadrer3d: (panneau) => { tardifs.vues?.cadrerDeuxVues(panneau); },
      surligner3d: (s, aussi, viser) => tardifs.vues?.surlignerDans3d(s, aussi, viser) ?? false,
    },
    // Le partage pour le corpus (§15) : l'administrateur par sa session, un utilisateur par son jeton.
    audits: () => (enAdmin() || jetonPlateforme() ? clientAudits : null),
    admin: enAdmin,
    analyse: analyseClaudeDuNavigateur(etat, () => magasin.store.getState().projet.courant?.id ?? null),
  }, commandes);
}
