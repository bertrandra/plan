// Voir la terrasse chez soi, en realite augmentee (MD/spec-ar.md).
//
// Le modele est le .glb que la visionneuse a deja en memoire (`glb.dernierExporte`). On le confie
// a <model-viewer> (Google, charge a la demande depuis le CDN comme three.js) : sur Android, Chrome
// l'ouvre en AR dans la page (WebXR) ; sur iPhone et iPad, Safari l'ouvre dans Quick Look, a partir
// d'un USDZ que model-viewer produit lui-meme depuis le .glb. Rien n'est televerse : le modele
// reste dans le navigateur, servi par une URL blob.
//
// Sur un ordinateur, la superposition montre le modele et dit sur quoi l'ouvrir ; le bouton AR de
// model-viewer n'y apparait pas, puisqu'aucun mode n'y est possible.

/** La version epinglee de model-viewer, comme three.js l'est a r128. */
export const MODEL_VIEWER_URL = 'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js';

/** Ce que l'appareil sait ouvrir : l'AR dans la page (Android), Quick Look (Apple), ou rien. */
export interface CapacitesAR {
  webxr: boolean;
  quickLook: boolean;
}

export function capacitesAR(nav: Navigator = navigator, doc: Document = document): CapacitesAR {
  const a = doc.createElement('a');
  let quickLook = false;
  // Un navigateur sans rel="ar" (jsdom, vieux Firefox) peut lever plutot que repondre false.
  try { quickLook = !!a.relList && typeof a.relList.supports === 'function' && a.relList.supports('ar'); } catch { quickLook = false; }
  const webxr = !!(nav as unknown as { xr?: unknown }).xr;
  return { webxr, quickLook };
}

/** Ce que la superposition dit sous le modele, selon l'appareil. */
export function conseilAR(c: CapacitesAR): string {
  if (c.webxr) return 'Touchez « Voir chez vous » : la terrasse se pose sur le sol, grandeur nature, dans l’image de la caméra.';
  if (c.quickLook) return 'Touchez « Voir chez vous » : le modèle s’ouvre dans Quick Look, posez-le sur le sol avec la caméra.';
  return 'La réalité augmentée demande un téléphone ou une tablette : ouvrez ce projet sur Android (Chrome) ou sur iPhone et iPad (Safari), puis Visionneuse › Voir chez vous.';
}

let chargement: Promise<void> | null = null;
/** Charge model-viewer une fois ; `importer` est remplacable dans les tests. */
export function chargerModelViewer(importer: (url: string) => Promise<unknown> = (u) => import(/* @vite-ignore */ u)): Promise<void> {
  if (typeof customElements !== 'undefined' && customElements.get('model-viewer')) return Promise.resolve();
  if (!chargement) chargement = importer(MODEL_VIEWER_URL).then(() => undefined).catch((e: unknown) => { chargement = null; throw e; });
  return chargement;
}

export interface SuperpositionAR {
  element: HTMLElement;
  fermer: () => void;
}

/**
 * Ouvre la superposition : le modele dans model-viewer, le bouton AR, le conseil, et Fermer.
 * `buffer` est le .glb. Rend la superposition une fois model-viewer charge.
 */
export async function ouvrirAR(buffer: ArrayBuffer, nom: string, options: { doc?: Document; nav?: Navigator; charger?: () => Promise<void> } = {}): Promise<SuperpositionAR> {
  const doc = options.doc ?? document;
  const nav = options.nav ?? navigator;
  await (options.charger ?? chargerModelViewer)();
  const url = URL.createObjectURL(new Blob([buffer], { type: 'model/gltf-binary' }));
  const capacites = capacitesAR(nav, doc);
  const voile = doc.createElement('div');
  voile.className = 'voileAR';
  voile.setAttribute('role', 'dialog');
  voile.setAttribute('aria-modal', 'true');
  voile.setAttribute('aria-label', 'Voir chez vous, en réalité augmentée');
  const mv = doc.createElement('model-viewer');
  mv.setAttribute('src', url);
  mv.setAttribute('alt', nom);
  mv.setAttribute('ar', '');
  // Dans la page d'abord (Android), Quick Look ensuite (Apple) ; Scene Viewer demanderait une URL publique.
  mv.setAttribute('ar-modes', 'webxr quick-look');
  mv.setAttribute('ar-scale', 'fixed');
  mv.setAttribute('ar-placement', 'floor');
  mv.setAttribute('camera-controls', '');
  mv.setAttribute('shadow-intensity', '1');
  mv.setAttribute('touch-action', 'pan-y');
  const bouton = doc.createElement('button');
  bouton.type = 'button';
  bouton.setAttribute('slot', 'ar-button');
  bouton.className = 'boutonAR';
  bouton.setAttribute('data-controle', 'visionneuse.arVoir');
  bouton.textContent = 'Voir chez vous';
  mv.appendChild(bouton);
  const conseil = doc.createElement('p');
  conseil.className = 'conseilAR';
  conseil.textContent = conseilAR(capacites);
  // Un ordinateur a souvent `navigator.xr` sans session AR : le conseil se corrige une fois la
  // reponse connue, pour ne pas promettre un bouton que model-viewer ne montrera pas.
  const xr = (nav as unknown as { xr?: { isSessionSupported?: (m: string) => Promise<boolean> } }).xr;
  if (capacites.webxr && typeof xr?.isSessionSupported === 'function') {
    xr.isSessionSupported('immersive-ar').then((ok) => { if (!ok) conseil.textContent = conseilAR({ ...capacites, webxr: false }); }).catch(() => undefined);
  }
  const fermerBtn = doc.createElement('button');
  fermerBtn.type = 'button';
  fermerBtn.className = 'secondary fermerAR';
  fermerBtn.setAttribute('data-controle', 'visionneuse.arFermer');
  fermerBtn.setAttribute('aria-label', 'Fermer la réalité augmentée');
  fermerBtn.textContent = 'Fermer';
  const titre = doc.createElement('div');
  titre.className = 'titreAR';
  titre.textContent = nom;
  const entete = doc.createElement('div');
  entete.className = 'enteteAR';
  entete.appendChild(titre);
  entete.appendChild(fermerBtn);
  voile.appendChild(entete);
  voile.appendChild(mv);
  voile.appendChild(conseil);
  const fermer = () => {
    voile.remove();
    URL.revokeObjectURL(url);
    doc.removeEventListener('keydown', surTouche);
  };
  const surTouche = (e: KeyboardEvent) => { if (e.key === 'Escape') fermer(); };
  fermerBtn.addEventListener('click', fermer);
  doc.addEventListener('keydown', surTouche);
  doc.body.appendChild(voile);
  return { element: voile, fermer };
}
