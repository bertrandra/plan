// Export de la scene 3D en fichier .glb (spec §3.2, three/).
//
// Le modele est **toujours produit en memoire** (`glb.dernierExporte`), et n'est ecrit sur disque
// que si on le demande : la visionneuse n'a besoin que des donnees, et lui faire deposer un fichier
// dans le dossier de telechargements a chaque ouverture n'aurait aucun interet.
//
// Le .glb sort de la scene reellement affichee, jamais d'une reconstruction parallele — c'est ce
// qui garantit que le fichier livre montre ce que l'utilisateur a vu.

import { vue3d, glb } from './etat3d.js';
import { showToast, showErrBanner } from '../shell/dialogs.js';
import { ensureThreeLoaded, ensureGLTFExporterLoaded, attendreTexturesPretes, disposeThreeScene } from './glbViewer.js';

/** Delai maximal d'attente des textures, puis de reponse de l'exporteur, en millisecondes. */
const ATTENTE_TEXTURES_MS = 15000;
const ATTENTE_EXPORTEUR_MS = 20000;

/** Ce que l'export doit pouvoir declencher ailleurs. */
export interface ContexteExportGlb {
  buildThreeScene: (obj) => void;
  /** Un nouvel export doit se refleter dans la visionneuse si elle est ouverte. */
  rafraichirVisionneuseGlbSiOuverte: () => void;
  telechargerBinaire: (nomFichier: string, donnees: ArrayBuffer, mime: string) => void;
}

/** Un nom de fichier sur : sans accents, sans espaces, sans rien qui gene un systeme de fichiers. */
export function nomFichierTerrasse(nom: string): string {
  return (nom || 'terrasse').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '') || 'terrasse';
}

/**
 * Genere le .glb de la terrasse courante.
 *
 * Deux precautions valent d'etre lues :
 *
 * - **La scene n'est construite que si elle ne l'est pas deja**, et n'est demontee que si on l'a
 *   construite pour l'occasion. Exporter depuis la Vue 3D ouverte ne doit pas la faire disparaitre
 *   sous les yeux de l'utilisateur.
 * - **Un filet de securite remet le bouton en etat.** `GLTFExporter` en r128 n'a pas de rappel
 *   d'erreur separe — `parse(input, onDone, options)` et rien d'autre : un echec silencieux
 *   laisserait le bouton bloque sur « Export en cours… » indefiniment.
 */
export function genererGlb(etat, bouton: HTMLButtonElement | null, telecharger: boolean, ctx: ContexteExportGlb): void {
  const terr = etat.objects.find(o => o.key === etat.terrasseSelectedKey && o.fonction === 'terrasse')
            || etat.objects.find(o => o.fonction === 'terrasse');
  if (!terr) { showToast('Cree d\'abord une terrasse pour pouvoir generer une scene 3D.'); return; }

  const libelleAvant = bouton ? bouton.textContent : '';
  if (bouton) { bouton.disabled = true; bouton.textContent = telecharger ? 'Export en cours…' : 'Génération…'; }
  const restaurer = () => { if (bouton) { bouton.disabled = false; bouton.textContent = libelleAvant; } };

  ensureThreeLoaded(() => {
    ensureGLTFExporterLoaded(() => {
      try {
        const dejaActive = vue3d.scene && vue3d.dernierObjKey === terr.key;
        if (!dejaActive) ctx.buildThreeScene(terr);
        // `void` : cette promesse ne peut pas etre rejetee — `attendreTexturesPretes` ne fait que
        // resoudre, a l'arrivee des textures ou au bout du delai. La suite est deliberement laissee
        // en arriere-plan, le bouton etant deja desarme.
        void attendreTexturesPretes(vue3d.scene.scene, ATTENTE_TEXTURES_MS).then(() => {
          try {
            const exporteur = new THREE.GLTFExporter();
            let fini = false;
            const filet = setTimeout(() => {
              if (fini) return; fini = true;
              showErrBanner('Export GLB : pas de reponse - reessaie.');
              if (!dejaActive) disposeThreeScene();
              restaurer();
            }, ATTENTE_EXPORTEUR_MS);
            exporteur.parse(vue3d.scene.scene, (result) => {
              if (fini) return; fini = true; clearTimeout(filet);
              glb.dernierExporte = { buffer: result, nomTerrasse: terr.name, date: new Date() };
              if (telecharger) {
                ctx.telechargerBinaire('terrasse_' + nomFichierTerrasse(terr.name) + '.glb', result, 'model/gltf-binary');
              }
              // Construite seulement pour l'export : pas de raison de la laisser active.
              if (!dejaActive) disposeThreeScene();
              restaurer();
              ctx.rafraichirVisionneuseGlbSiOuverte();
            }, { binary: true });
          } catch (err) {
            showErrBanner('Export GLB : ' + (err as Error).message);
            if (!dejaActive) disposeThreeScene();
            restaurer();
          }
        });
      } catch (err) {
        showErrBanner('Export GLB : ' + (err as Error).message);
        restaurer();
      }
    });
  });
}
