// Telechargement d'un fichier texte genere en memoire (spec §3.2, util/download.ts).

export function telechargerTexte(nomFichier: string, texte: string, mime?: string): void {
  const blob = new Blob([texte], { type: mime || 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  // Revoquer tout de suite interrompt le telechargement sur certains navigateurs.
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 1000);
}
