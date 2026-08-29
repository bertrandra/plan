// Proposer au navigateur un fichier fabrique en memoire (spec §3.2, shell/).
//
// Il n'existe pas d'API « enregistrer ce contenu » : on cree une URL d'objet, une ancre invisible,
// et on la clique. Tout ce module est ce detour.

/**
 * Le geste commun : ancre invisible, clic, nettoyage differe.
 *
 * Le delai avant de revoquer l'URL n'est pas une precaution de style — revoquer tout de suite
 * **interrompt le telechargement** sur certains navigateurs, qui n'ont pas fini de lire le blob
 * quand le clic rend la main.
 */
function proposer(nomFichier: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}

export function telechargerTexte(nomFichier: string, texte: string, mime?: string): void {
  proposer(nomFichier, new Blob([texte], { type: mime || 'application/json' }));
}

/** Meme geste pour un contenu binaire — un .glb, par exemple. */
export function telechargerBinaire(nomFichier: string, donnees: ArrayBuffer, mime: string): void {
  proposer(nomFichier, new Blob([donnees], { type: mime }));
}
