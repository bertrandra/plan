// Export de la scene 3D en fichier .glb (spec §3.2, three/).
//
// Le modele est **toujours produit en memoire** (`glb.dernierExporte`), et n'est ecrit sur disque
// que si on le demande : la visionneuse n'a besoin que des donnees, et lui faire deposer un fichier
// dans le dossier de telechargements a chaque ouverture n'aurait aucun interet.
//
// Le .glb sort de la scene reellement affichee, jamais d'une reconstruction parallele — c'est ce
// qui garantit que le fichier livre montre ce que l'utilisateur a vu.

import { cuireFeuillesPourExport } from './feuilles.js';
import { vue3d, glb, affichage3d, signaler3d, type PlanVuDeLa3d } from './etat3d.js';
import { showToast, showErrBanner } from '../shell/dialogs.js';
import { ensureThreeLoaded, ensureGLTFExporterLoaded, attendreTexturesPretes, disposeThreeScene } from './glbViewer.js';
import { estMesh } from './gardes.js';
import { GABARIT_SOL } from './primitives.js';
import type * as THREE_NS from 'three';
import type { ObjetPlan } from '../model/types.js';
import { terrasseOuPremiere } from '../model/fonctions.js';

/** Delai maximal d'attente des textures, puis de reponse de l'exporteur, en millisecondes. */
const ATTENTE_TEXTURES_MS = 15000;
const ATTENTE_EXPORTEUR_MS = 20000;

/** Ce que l'export doit pouvoir declencher ailleurs. */
export interface ContexteExportGlb {
  buildThreeScene: (obj: ObjetPlan) => void;
  /** Un nouvel export doit se refleter dans la visionneuse si elle est ouverte. */
  rafraichirVisionneuseGlbSiOuverte: () => void;
  telechargerBinaire: (nomFichier: string, donnees: ArrayBuffer, mime: string) => void;
}

type MateriauCarte = THREE_NS.Material & { map?: THREE_NS.Texture | null };

/**
 * Cache, le temps de l'export, le gabarit qui perce le sol au droit d'un bassin (three/piscine3d.ts) :
 * il ne vaut que pour le tampon de gabarit de la Vue 3D, et un lecteur glTF le dessinerait comme
 * une surface blanche sur l'eau. Rend de quoi le remettre.
 */
export function masquerGabarits(scene: THREE_NS.Object3D): () => void {
  const caches: THREE_NS.Object3D[] = [];
  scene.traverse(o => { if (o.userData[GABARIT_SOL] && o.visible) { o.visible = false; caches.push(o); } });
  return () => caches.forEach(o => { o.visible = true; });
}

/**
 * Retire, le temps de l'export, les cartes dont l'image n'est jamais arrivee (Poly Haven injoignable,
 * hors ligne) : `GLTFExporter` lit `image.width` sans garde, et l'export entier tombait sur « Cannot
 * read properties of undefined (reading 'width') ». Ces objets partent en couleur unie — c'est deja
 * ce que la Vue 3D montrait d'eux. Rend le nombre de cartes retirees et de quoi les remettre.
 */
export function detacherCartesSansImage(scene: THREE_NS.Object3D): { nombre: number; remettre: () => void } {
  const retirees: [MateriauCarte, THREE_NS.Texture][] = [];
  scene.traverse(o => {
    if (!estMesh(o)) return;
    const materiaux: MateriauCarte[] = Array.isArray(o.material) ? o.material : [o.material];
    materiaux.forEach(m => {
      if (m && m.map && !m.map.image) { retirees.push([m, m.map]); m.map = null; }
    });
  });
  return {
    nombre: new Set(retirees.map(([, t]) => t)).size,
    remettre: () => { retirees.forEach(([m, t]) => { m.map = t; }); retirees.length = 0; }
  };
}

/** Un nom de fichier sur : sans accents, sans espaces, sans rien qui gene un systeme de fichiers. */
export function nomFichierTerrasse(nom: string | undefined): string {
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
 * - **Un filet de securite remet l'etat en place.** `GLTFExporter` en r128 n'a pas de rappel
 *   d'erreur separe — `parse(input, onDone, options)` et rien d'autre : un echec silencieux
 *   laisserait les boutons bloques sur « Export en cours… » indefiniment.
 *
 * L'operation en cours se publie dans `affichage3d.generation` : les boutons qui la lancent la
 * lisent pour se griser et changer de libelle. Ils ne sont plus touches directement — ce sont des
 * boutons React, et reecrire leur texte detruisait des noeuds que React croyait encore a lui.
 */
export function genererGlb(etat: PlanVuDeLa3d, telecharger: boolean, ctx: ContexteExportGlb): void {
  const terr = terrasseOuPremiere(etat.objects, etat.terrasseSelectedKey);
  if (!terr) { showToast('Cree d\'abord une terrasse pour pouvoir generer une scene 3D.'); return; }

  if (affichage3d.generation) return;
  affichage3d.generation = telecharger ? 'export' : 'generation';
  signaler3d();
  const restaurer = () => { affichage3d.generation = null; signaler3d(); };

  ensureThreeLoaded(() => {
    ensureGLTFExporterLoaded(() => {
      try {
        const dejaActive = vue3d.scene && vue3d.dernierObjKey === terr.key;
        if (!dejaActive) ctx.buildThreeScene(terr);
        // Sans scene, `buildThreeScene` a renonce : le navigateur a refuse le contexte WebGL. On le
        // dit, plutot que de laisser tomber un « Cannot read properties of null » (D-2).
        const sc = vue3d.scene;
        if (!sc) {
          showErrBanner('Export GLB : la scene 3D n\'a pas pu etre creee - le navigateur a refuse WebGL (acceleration materielle desactivee, ou trop de vues 3D ouvertes). Fermez d\'autres onglets 3D ou reactivez l\'acceleration, puis reessayez.');
          restaurer();
          return;
        }
        // `void` : cette promesse ne peut pas etre rejetee — `attendreTexturesPretes` ne fait que
        // resoudre, a l'arrivee des textures ou au bout du delai. La suite est deliberement laissee
        // en arriere-plan, les boutons etant deja desarmes.
        void attendreTexturesPretes(sc.scene, ATTENTE_TEXTURES_MS).then(() => {
          // Rien n'est retire tant que `detacherCartesSansImage` n'a pas tourne.
          let remettreSiBesoin = () => {};
          try {
            const exporteur = new THREE.GLTFExporter();
            const sansImage = detacherCartesSansImage(sc.scene);
            const remettreGabarits = masquerGabarits(sc.scene);
            // Les feuilles instanciees, que l'exporteur ne sait pas ecrire, deviennent des mailles ordinaires (three/feuilles.ts).
            const feuilles = cuireFeuillesPourExport(sc.scene);
            remettreSiBesoin = () => { sansImage.remettre(); remettreGabarits(); feuilles.remettre(); };
            let fini = false;
            const filet = setTimeout(() => {
              if (fini) return; fini = true;
              sansImage.remettre(); remettreGabarits(); feuilles.remettre();
              showErrBanner('Export GLB : pas de reponse - reessaie.');
              if (!dejaActive) disposeThreeScene();
              restaurer();
            }, ATTENTE_EXPORTEUR_MS);
            exporteur.parse(sc.scene, (result) => {
              if (fini) return; fini = true; clearTimeout(filet);
              sansImage.remettre(); remettreGabarits(); feuilles.remettre();
              if (sansImage.nombre) showToast(sansImage.nombre + ' texture(s) indisponible(s) : exportee(s) en couleur unie.');
              // `parse` rend `object` : sa signature ne distingue pas les deux sorties possibles,
              // alors que c'est l'option qui en decide - `{ binary: true }` (plus bas) donne un
              // ArrayBuffer, son absence donnerait le JSON glTF. C'est donc bien un ArrayBuffer
              // ici, et toute la suite en depend deja : le telechargement en `model/gltf-binary`
              // comme la relecture par `GLTFLoader.parse` dans la visionneuse.
              const binaire = result as ArrayBuffer;
              // Le centre part avec le modele : c'est l'origine du .glb, et le seul moment ou on
              // le connait a coup sur. Voir `dernierExporte` dans etat3d.ts.
              glb.dernierExporte = { buffer: binaire, nomTerrasse: terr.name, date: new Date(), centre: sc.cen };
              if (telecharger) {
                ctx.telechargerBinaire('terrasse_' + nomFichierTerrasse(terr.name) + '.glb', binaire, 'model/gltf-binary');
              }
              // Construite seulement pour l'export : pas de raison de la laisser active.
              if (!dejaActive) disposeThreeScene();
              restaurer();
              ctx.rafraichirVisionneuseGlbSiOuverte();
            }, { binary: true });
          } catch (err) {
            remettreSiBesoin();
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
