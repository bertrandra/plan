// L'API du banc (banc/public/api.php), vue de la page. Toutes les ecritures portent l'en-tete X-Banc (le serveur refuse sans lui).

import type { Annotation, Classe, MetaImage, Modele, Reglages } from './types.js';

export class ErreurApi extends Error {
  constructor(message: string, readonly statut: number) { super(message); }
}

const URL_API = 'api.php';

/** L'adresse d'une route (relative a la page : la page porte <base href="banc/"> en ligne). */
export const route = (r: string, params: Record<string, string> = {}): string => URL_API + '?' + new URLSearchParams({ r, ...params }).toString();

async function appel<T>(methode: string, r: string, params: Record<string, string> = {}, corps?: unknown): Promise<T> {
  const init: RequestInit = { method: methode, credentials: 'same-origin', headers: { 'X-Banc': '1' } };
  if (corps instanceof FormData) init.body = corps;
  else if (corps !== undefined) { init.body = JSON.stringify(corps); init.headers = { 'X-Banc': '1', 'Content-Type': 'application/json' }; }
  const rep = await fetch(route(r, params), init);
  const texte = await rep.text();
  let json: unknown = null;
  try { json = texte ? JSON.parse(texte) : null; } catch { /* le message brut, plus bas */ }
  if (!rep.ok) throw new ErreurApi((json as { erreur?: string } | null)?.erreur ?? `Erreur ${rep.status} : ${texte.slice(0, 200)}`, rep.status);
  return json as T;
}

export const api = {
  etat: () => appel<{ connecte: boolean }>('GET', 'etat'),
  connexion: (motDePasse: string) => appel<{ connecte: boolean }>('POST', 'connexion', {}, { motDePasse }),
  deconnexion: () => appel<{ connecte: boolean }>('POST', 'deconnexion'),
  classes: () => appel<{ classes: Classe[] }>('GET', 'classes'),
  ecrireClasses: (classes: Classe[]) => appel<{ classes: Classe[] }>('PUT', 'classes', {}, { classes }),
  reglages: () => appel<Partial<Reglages>>('GET', 'reglages'),
  ecrireReglages: (r: Reglages) => appel<Reglages>('PUT', 'reglages', {}, r),
  images: () => appel<MetaImage[]>('GET', 'images'),
  importer: (fichier: Blob, vignette: Blob | null, meta: Partial<MetaImage>) => {
    const f = new FormData();
    f.append('fichier', fichier, 'photo.jpg');
    if (vignette) f.append('vignette', vignette, 'vignette.jpg');
    f.append('meta', JSON.stringify(meta));
    return appel<MetaImage>('POST', 'images', {}, f);
  },
  modifier: (id: string, champs: Partial<Pick<MetaImage, 'statut' | 'bloc' | 'verifiee' | 'echantillon' | 'note' | 'adresse'>>) => appel<MetaImage>('PATCH', 'image', { id }, champs),
  supprimer: (id: string) => appel<{ supprimee: string }>('DELETE', 'image', { id }),
  fichier: (id: string, v: 'source' | 'redressee' | 'vignette', cle = '') => route('fichier', { id, v, ...(cle ? { c: cle } : {}) }),
  redressee: (id: string, fichier: Blob, vignette: Blob, redressement: Record<string, unknown>) => {
    const f = new FormData();
    f.append('fichier', fichier, 'redressee.jpg');
    f.append('vignette', vignette, 'vignette.jpg');
    f.append('redressement', JSON.stringify(redressement));
    return appel<MetaImage>('POST', 'redressee', { id }, f);
  },
  annotation: (id: string) => appel<Annotation>('GET', 'annotation', { id }),
  ecrireAnnotation: (id: string, a: Annotation) => appel<MetaImage>('PUT', 'annotation', { id }, a),
  modeles: () => appel<Modele[]>('GET', 'modeles'),
  installer: (id: string) => appel<{ installe: boolean }>('POST', 'installer', { id }),
  modifierModele: (id: string, champs: Partial<Pick<Modele, 'correspondance' | 'seuil' | 'actif' | 'nom'>>) => appel<Modele>('PATCH', 'modele', { id }, champs),
  ajouterModele: (fichier: File, description: Omit<Modele, 'id' | 'installe'>) => {
    const f = new FormData();
    f.append('fichier', fichier, fichier.name);
    f.append('description', JSON.stringify(description));
    return appel<Modele>('POST', 'modeles', {}, f);
  },
  supprimerModele: (id: string) => appel<{ supprime: string }>('DELETE', 'modele', { id }),
  urlModele: (id: string) => route('modele', { id }),
  urlExport: (format: 'detect' | 'seg' | 'natif', verifiees: boolean) => route('export', { format, verifiees: verifiees ? '1' : '0' }),
};
