// Racine de composition de l'application (spec §4 Phase 4, §6 "Killing the boot() closure").
//
// `boot()` a ete longtemps la fermeture ou tout se cablait : une soixantaine d'enveloppes fermant
// sur `etat` et sur la racine SVG. Ces enveloppes vivent maintenant dans app/assemblage/, par
// famille — la surface et ses calques, le dessin, l'affichage, le cadrage, les cotes, les gestes,
// les vues 3D, les exports —, et `boot()` ne fait plus que les composer, dans l'ordre ou elles
// doivent exister. Cet ordre compte : les ecouteurs se declenchent dans leur ordre d'enregistrement
// et les calques du SVG s'empilent dans leur ordre d'ajout.
//
// Pas de bus d'evenements (§6.3 l'esquissait, jamais construit) : `render()` reste appele
// directement depuis chaque geste qui modifie le plan. §6.3 l'autorisait deja explicitement
// ("Keep that — do not introduce reactivity").import { DEMO_OBJECTS, DEMO_TEMOIN_OBJECTS, DEMO_MEASURES } from '../model/demo.js';
import { aDesSommets } from '../model/formes.js';
import { restaurerOrthoDuProjet } from '../render/ortho.js';
import { lectureRelief } from '../core/lectureRelief.js';
import { brancherFiletsDErreur } from './ecouteurs/divers.js';
import { prevenirAdminDesCapacitesForcees } from './acces.js';
import { actualisation } from './cadastre/actualisationIgn.js';
import { creerVues3d } from './assemblage/vues3d.js';
import type { SourceControleurs } from './administration/controleurs.js';
import { inventorierLesClasses } from './administration/decouverteClasses.js';
import type { Vitrine } from './vitrine.js';
import { EVENEMENT_ENCRES } from '../render/theme.js';
import type { DemandeAudit } from './audit/demande.js';
import { loadInitialProject, graineVitrine, graineAudit, type GraineDemarrage } from './boot/graines.js';
import { assemblerLePlan, atelierDu, lectureDeFondPermise, permettreToitsFond, type Tardifs } from './boot/plan.js';
import { chargements } from './boot/chargements.js';
import { brancherLePlan } from './boot/branchements.js';
import { monterLesPanneaux, sourceControleurs } from './boot/panneaux.js';
import { demarrerAudit, brancherIsolement, exposerPourLesCaptures } from './boot/annexes.js';
import { demarrerVitrine } from './boot/vitrine.js';

brancherFiletsDErreur();

/**
 * Les poignees des captures et de la fumee (`window.__plan`) : en developpement, et dans le paquet du banc (`vite build --mode
 * banc`, scripts/banc-rendu.mjs), un paquet de production qui les garde pour mesurer le rendu tel que les gens le recoivent. Le
 * paquet livre ne les porte pas.
 */
const POIGNEES = import.meta.env.DEV || import.meta.env.MODE === 'banc';

function boot(seed: GraineDemarrage, options: { vitrine?: Vitrine; audit?: DemandeAudit; controleurs?: (lire: () => Promise<SourceControleurs>) => void } = {}): void {
  const tardifs: Tardifs = {};
  const p = assemblerLePlan(seed, tardifs);
  const { etat, magasin, commandes, tiroir, cadrage } = p;
  // « Actualiser IGN » et « Lecture… » (relief) se voient dans toutes les zones ; les toits lus en fond
  // ne redessinent que la barre d'etat et le menu, abonnes directement (core/lectureToits.ts).
  for (const lecture of [actualisation, lectureRelief]) lecture.abonner(() => magasin.notifier());
  permettreToitsFond(lectureDeFondPermise(!!options.vitrine || !!options.audit)); // l'audit lit ses toits lui-meme, autour de vous
  const atelier = atelierDu(p);
  const ch = chargements(p, seed, tardifs);
  brancherLePlan(p, atelier, ch, seed, tardifs);
  cadrage.centrerSurParcelle();
  const vues = creerVues3d(atelier, magasin, commandes, { affichage: p.affichage, createObjectDOM: p.dessin.createObjectDOM, resultats: p.resultats });
  tardifs.vues = vues;
  brancherIsolement(p);
  const { explorateur, inspecteur, projet } = monterLesPanneaux(p, atelier, ch, vues, seed);
  Object.assign(tardifs, { explorateur, inspecteur, projet });
  // Sur tablette, l'explorateur et l'inspecteur flottent sur le plan : ouverts d'office, ils en
  // couvriraient les deux tiers. Ils s'ouvrent a la demande.
  cadrage.replierPourTablette();
  // Le tiroir a un onglet actif des l'ouverture : le balisage n'en montre aucun.
  tiroir.activer(etat.panelTab, false);
  p.render();
  // Une capacite forcee en dur que la plateforme n'attribue pas : l'admin est prevenu (app/acces.ts).
  prevenirAdminDesCapacitesForcees();
  // La palette du serveur peut arriver apres ce premier rendu : le plan reprend alors ses encres
  // (app/paletteServeur.ts, render/theme.ts).
  window.addEventListener(EVENEMENT_ENCRES, () => p.render());
  // Un terrain venu du cadastre est cadre a sa taille reelle ; un plan dessine a la main garde le
  // cadrage historique, ses coordonnees ont ete posees avec.
  const parcelle = etat.objects.find(o => o.key === 'parcelle');
  // Le masquage du voisinage enregistre avec le projet est restitue d'abord : le cadrage ne prend
  // que les parcelles affichees. Le fond orthophoto vient apres, sur la vue cadree.
  ch.restaurerAffichage();
  if (parcelle && parcelle.cadastre && aDesSommets(parcelle) && parcelle.pts.length >= 3) cadrage.cadrerTerrains();
  restaurerOrthoDuProjet(ch.ctxOrtho());
  // « Partir d'une adresse » au premier pas passe par la COMMANDE : elle porte la capacite, la
  // permission et le quota, et un premier pas ne doit pas etre le seul chemin qui les contourne.
  if (options.vitrine) demarrerVitrine(p, vues, explorateur, ch.ctxOrtho, options.vitrine);
  else if (options.audit) void demarrerAudit(p, vues, options.audit);
  else if (seed.ouvrirAdresse) commandes.executer('projet.depuisAdresse');
  // Un projet d'un schema anterieur : proposer de le mettre a jour, une fois le plan a l'ecran ; puis
  // les toits a cheval sur deux parcelles qui attendent une reponse.
  else { projet.proposerMiseAJour(); ch.questionsACheval(); ch.toitsFond.relancer(); void ch.profilsFacades.relancer(); }
  if (POIGNEES) exposerPourLesCaptures(p, explorateur);
  // L'ecran des controleurs relit a chaque demande : on lui donne la lecture, pas son resultat.
  if (options.controleurs) {
    options.controleurs(async () => sourceControleurs(commandes, inspecteur, etat.objects,
      await inventorierLesClasses(magasin, etat, (cle) => explorateur.selectionner(cle))));
  }
}

// main.ts n'a besoin que de ces deux points d'entree.
export { boot, loadInitialProject, graineVitrine, graineAudit };
