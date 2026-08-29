// Lire et écrire un fichier local : import SVG, import et export du projet (spec §6.4, app/).
//
// Les deux imports partagent une mécanique et un piège.
//
// **La mécanique** : un bouton visible déclenche le clic d'un `<input type="file">` caché — c'est la
// seule façon d'obtenir un sélecteur de fichiers avec l'apparence du reste.
//
// **Le piège** : il faut vider `input.value` après **chaque** lecture, réussie ou non. Sans cela,
// l'input garde le fichier choisi, et rechoisir *le même* fichier n'émet plus d'événement `change` —
// l'utilisateur clique, rien ne se passe, et rien ne l'explique. C'est pour cette raison que
// `onerror` existe autant que `onload` : un échec de lecture ne déclenche jamais `onload`.

import { showToast, showErrBanner } from '../../shell/dialogs.js';

/** Taille maximale d'un fichier de projet. Au-delà, on refuse avant même de lire. */
export const IMPORT_JSON_TAILLE_MAX = 5 * 1024 * 1024;

/** Ce que les imports et exports de fichiers déclenchent. */
export interface ContexteFichiers {
  importerSVG: (contenu: string) => void;
  exportProjetJSON: () => void;
  /** Valide un projet lu ; lève une erreur portant un `motif` si le fichier est refusé. */
  validerProjetJSON: (brut: unknown) => unknown;
  appliquerProjetImporte: (valide: unknown, remplacer: boolean) => void;
}

/**
 * Lit un fichier texte, en vidant l'input dans tous les cas.
 *
 * `surSucces` reçoit le contenu ; les erreurs de lecture passent par `messageErreur`.
 */
function lireFichierTexte(input: HTMLInputElement, messageErreur: string, surSucces: (contenu: string) => void): void {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    surSucces(String(ev.target.result));
    input.value = '';
  };
  reader.onerror = () => {
    showToast(messageErreur);
    input.value = '';
  };
  reader.readAsText(file);
}

export function brancherFichiers(ctx: ContexteFichiers): void {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;

  el('importSvgBtn').addEventListener('click', () => el('importSvgFile').click());

  el('importSvgFile').addEventListener('change', function () {
    lireFichierTexte(this, 'Erreur de lecture du fichier SVG.', contenu => {
      try { ctx.importerSVG(contenu); }
      catch (err) { showErrBanner('Erreur import SVG: ' + (err as Error).message); }
    });
  });

  el('exportJsonBtn').addEventListener('click', () => {
    try { ctx.exportProjetJSON(); }
    catch (e) { showErrBanner('Echec de l\'export JSON : ' + ((e as Error).message || e)); }
  });

  el('importJsonBtn').addEventListener('click', () => el('importJsonFile').click());

  el('importJsonFile').addEventListener('change', function () {
    const file = this.files[0];
    if (!file) return;
    // Refusé avant lecture : charger cinq mégaoctets pour découvrir ensuite qu'on les refuse
    // ferait attendre pour rien, et un fichier de projet de cette taille n'en est pas un.
    if (file.size > IMPORT_JSON_TAILLE_MAX) {
      showToast('Fichier trop volumineux (' + Math.round(file.size / 1048576) + ' Mo, maximum 5 Mo).');
      this.value = '';
      return;
    }
    // Lu avant la lecture du fichier : la case peut changer pendant que le disque répond.
    const remplacer = (document.getElementById('chkJsonRemplace') as HTMLInputElement).checked;
    lireFichierTexte(this, 'Erreur de lecture du fichier JSON.', contenu => {
      let valide;
      try {
        valide = ctx.validerProjetJSON(JSON.parse(contenu));
      } catch (err) {
        // Le plan courant reste intact : rien n'a été touché avant la validation.
        //
        // Et un fichier trop récent n'est pas illisible — il est refusé volontairement. Le dire
        // autrement enverrait l'utilisateur chercher une corruption qui n'existe pas.
        const e = err as Error & { motif?: string };
        showToast((e.motif === 'schema' ? 'Import refuse : ' : 'Import annule - fichier illisible : ') + (e.message || e));
        return;
      }
      try { ctx.appliquerProjetImporte(valide, remplacer); }
      catch (err) { showErrBanner('Echec de l\'import JSON : ' + ((err as Error).message || err)); }
    });
  });
}
