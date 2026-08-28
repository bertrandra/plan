// Point d'entree de l'application (phase 1 de MD/spec-migration-typescript.md).
//
// Il ne fait que ce que faisaient les dernieres lignes de plan.html : charger le projet initial,
// puis demarrer. Toute la logique est encore dans legacy.ts et en sortira module par module aux
// phases 2 a 6.

import './styles/app.css';
// Import statique, et non dynamique comme celui de legacy plus bas : ce module ne depend de rien
// et ne peut donc pas echouer a se charger. C'est ce qui permet de s'en servir comme filet quand
// c'est le chargement de legacy qui casse. En phase 1, faute de l'avoir isole, main.ts portait
// une copie du bandeau ; la phase 5 l'a rendue inutile.
import { showErrBanner, showProjectLoadError } from './ui/dialogs.js';

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
    const { boot, loadInitialProject } = await import('./legacy');
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
