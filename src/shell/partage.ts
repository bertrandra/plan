// Partager un fichier depuis le telephone (MD/spec-audit.md §4.6) : la feuille de partage du systeme
// (messagerie, Drive, mail), par l'API Web Share. Sans elle — un ordinateur, un ancien navigateur —
// le fichier est telecharge.

import { telechargerTexte } from './download.js';

export type IssuePartage = 'partage' | 'telecharge' | 'annule';

interface NavigateurPartage {
  canShare?: (d: { files?: File[] }) => boolean;
  share?: (d: { files?: File[]; title?: string; text?: string }) => Promise<void>;
}

/**
 * Partage un fichier JSON, ou le telecharge. Rend ce qui s'est passe : `annule` quand la personne a
 * ferme la feuille de partage sans choisir (le fichier n'est alors pas perdu : on peut recommencer).
 */
export async function partagerFichier(nom: string, contenu: string, titre: string, nav: NavigateurPartage = navigator as NavigateurPartage): Promise<IssuePartage> {
  const fichier = typeof File === 'function' ? new File([contenu], nom, { type: 'application/json' }) : null;
  if (fichier && nav.share && nav.canShare?.({ files: [fichier] })) {
    try {
      await nav.share({ files: [fichier], title: titre });
      return 'partage';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'annule';
      // Un refus du systeme (fichier trop gros, permission) : le telechargement reste possible.
    }
  }
  telechargerTexte(nom, contenu, 'application/json');
  return 'telecharge';
}
