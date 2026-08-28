// Point d'entree de l'application (phase 1 de MD/spec-migration-typescript.md).
//
// Il ne fait que ce que faisaient les dernieres lignes de plan.html : charger le projet initial,
// puis demarrer. Toute la logique est encore dans legacy.ts et en sortira module par module aux
// phases 2 a 6.

import './styles/app.css';

// Bandeau d'erreur minimal, duplique volontairement depuis legacy.ts : si l'import du module
// legacy echoue, `showErrBanner` n'existe pas encore. Meme rendu, meme texte que l'original -
// c'est le seul filet quand le chargement du module lui-meme casse.
function bandeauErreur(msg: string): void {
  const box = document.createElement('div');
  box.style.cssText =
    'position:fixed;bottom:0;left:0;right:0;background:#a02020;color:#fff;padding:10px 14px;' +
    'font-family:monospace;font-size:12px;z-index:9999;white-space:pre-wrap;max-height:40vh;overflow:auto;';
  box.textContent = 'Erreur JS: ' + msg;
  document.body.appendChild(box);
}

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
    const { boot, loadInitialProject, showProjectLoadError } = await import('./legacy');
    try {
      const seed = await loadInitialProject();
      boot(seed);
    } catch (err) {
      // Echec classe par apiList()/apiLoad() (reseau, serveur, projet absent, JSON illisible)
      // avec un vrai projet en jeu : ecran de reprise plutot qu'un bandeau d'erreur brut.
      if (err && (err as { reason?: string }).reason) showProjectLoadError(err);
      else bandeauErreur(texteErreur(err));
    }
  } catch (err) {
    bandeauErreur(texteErreur(err));
  }
}

void demarrer();
