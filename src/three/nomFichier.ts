// Le nom des fichiers que la 3D telecharge (.glb, captures PNG), a part du moteur (AD-10) : les commandes le lisent sans le charger.

/** Un nom de fichier sur : sans accents, sans espaces, sans rien qui gene un systeme de fichiers. */
export function nomFichierTerrasse(nom: string | undefined): string {
  return (nom || 'terrasse').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'terrasse';
}
