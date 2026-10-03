// Point d'entree de l'application (spec-migration-typescript.md).
//
// Il ne fait que ce que faisaient les dernieres lignes de plan.html : charger le projet initial,
// puis demarrer. Toute la logique vit desormais dans app/boot.ts, la racine de composition (§6).

import './styles/app.css';
// Import statique, et non dynamique comme celui de app/boot.ts plus bas : ce module ne depend de
// rien et ne peut donc pas echouer a se charger. C'est ce qui permet de s'en servir comme filet
// quand c'est le chargement de app/boot.ts qui casse. En phase 1, faute de l'avoir isole, main.ts
// portait une copie du bandeau ; la phase 5 l'a rendue inutile.
import { showErrBanner, showProjectLoadError } from './shell/dialogs.js';

function texteErreur(err: unknown): string {
  const e = err as { message?: string; stack?: string } | null;
  const base = e && e.message ? e.message : String(err);
  return base + (e && e.stack ? '\n' + e.stack : '');
}

// L'import est dynamique pour une raison de comportement, pas de style : dans le fichier
// mono-page, le bloc 2 etait enveloppe dans un try/catch qui affichait le bandeau si une
// instruction de premier niveau levait pendant la definition. Un import statique leverait avant
// que ce fichier ne s'execute, et la page resterait blanche.
async function demarrer(): Promise<void> {
  try {
    // `?version` : ce que Plan dit de lui-meme a la plateforme (model/produit.ts), montre tel quel.
    // Rien d'autre ne demarre — ni porte, ni session.
    if (new URLSearchParams(location.search).has('version')) {
      const { afficherDescription } = await import('./app/version.js');
      afficherDescription();
      return;
    }

    // La vitrine publique (app/vitrine.ts) : la Vue 3D du plan de demonstration, sans porte ni
    // session. Elle s'aiguille avant tout le reste : rien de la plateforme n'est charge ni appele.
    const { lireVitrine, poserVitrine, chargerDemoVitrine } = await import('./app/vitrine.js');
    const vitrine = lireVitrine(location.search);
    if (vitrine) {
      poserVitrine(vitrine);
      const { entrerEnVitrine } = await import('./app/acces.js');
      entrerEnVitrine();
      // `file=<id>` : une demo de l'admin ; absente ou illisible, la demonstration integree.
      const demo = vitrine.fichier ? await chargerDemoVitrine(vitrine.fichier) : null;
      const { boot, graineVitrine } = await import('./app/boot.js');
      boot(graineVitrine(demo), { vitrine });
      return;
    }

    // L'admin des demos (MD/spec-demos-admin.md) : `?admin` ou `?demofile=<id>`. Pas de plateforme :
    // les plans sont les fichiers de demo du serveur qui sert la page, derriere son mot de passe.
    // Ouvrir, Enregistrer, Nouveau et Supprimer passent par le meme depot que d'habitude, pose
    // sur ces fichiers ; le reste de l'atelier ne sait pas la difference.
    const { demandeAdmin, franchirLaPorteAdmin } = await import('./app/porteAdmin.js');
    if (demandeAdmin(location.search)) {
      await franchirLaPorteAdmin();
      // L'ecran des controleurs (`?admin&ecran=controleurs`) : il s'ouvre sur le registre enregistre.
      // Plan ne demarre — cache, sur la demonstration integree et sans depot — que lorsque l'admin
      // lance la decouverte (app/ecranControleurs.ts).
      const { demandeEcranControleurs, ouvrirEcranControleurs } = await import('./app/ecranControleurs.js');
      if (demandeEcranControleurs(location.search)) {
        document.documentElement.dataset.ecran = 'controleurs';
        await ouvrirEcranControleurs();
        return;
      }
      // L'ecran de la palette (`?admin&ecran=palette`) : les couleurs de l'interface, sans Plan dessous.
      const { demandeEcranPalette, ouvrirEcranPalette } = await import('./app/ecranPalette.js');
      if (demandeEcranPalette(location.search)) {
        document.documentElement.dataset.ecran = 'palette';
        ouvrirEcranPalette();
        return;
      }
      const { entrerEnAdmin } = await import('./app/acces.js');
      entrerEnAdmin();
      const { creerDepotDemos } = await import('./io/depotDemos.js');
      const { definirDepot } = await import('./io/api.js');
      definirDepot(creerDepotDemos((entree, init) => fetch(entree, init)), { demos: true });
      const { boot, loadInitialProject } = await import('./app/boot.js');
      try {
        const seed = await loadInitialProject();
        boot(seed);
        const { showToast } = await import('./shell/dialogs.js');
        document.title = 'Admin démo — ' + (seed.meta?.name ?? 'Plan');
        showToast('Admin des démos : « Enregistrer » réécrit le fichier de démo ' + (seed.meta ? '« ' + seed.meta.id + ' »' : '') + ' sur le serveur.');
      } catch (err) {
        if (err && (err as { reason?: string }).reason) showProjectLoadError(err as { reason?: string });
        else showErrBanner(texteErreur(err));
      }
      return;
    }

    // La porte (spec-connexion-plateforme §16, etape 2). Elle ne rend la main qu'une fois
    // franchie. L'import est dynamique pour la meme raison que celui de boot.ts : un echec de
    // chargement doit se voir dans le bandeau, pas en page blanche.
    const { franchirLaPorte } = await import('./app/porte.js');
    const acces = await franchirLaPorte();
    // Le point de rendez-vous : boot.ts lira les droits la (app/acces.ts). Pose avant l'import de
    // boot, parce que le registre des commandes se construit pendant cet import.
    const { poserAcces } = await import('./app/acces.js');
    poserAcces(acces.session, acces.contexte);
    // Le depot des projets, pose ici parce que c'est ici que la session existe : io/ ne remonte pas
    // vers app/ pour aller la chercher (spec-connexion-plateforme §16, etape 4).
    const { creerDepotPlateforme } = await import('./io/depotPlateforme.js');
    const { definirDepot } = await import('./io/api.js');
    definirDepot(creerDepotPlateforme(acces.session));
    const { boot, loadInitialProject } = await import('./app/boot.js');
    try {
      const seed = await loadInitialProject();
      boot(seed);
    } catch (err) {
      // Echec classe par apiList()/apiLoad() (reseau, serveur, projet absent, JSON illisible)
      // avec un vrai projet en jeu : ecran de reprise plutot qu'un bandeau d'erreur brut.
      if (err && (err as { reason?: string }).reason) showProjectLoadError(err as { reason?: string });
      else showErrBanner(texteErreur(err));
    }
  } catch (err) {
    showErrBanner(texteErreur(err));
  }
}

void demarrer();
