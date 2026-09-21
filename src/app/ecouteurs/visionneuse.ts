// Les commandes de la visionneuse GLB (spec §6.4, app/).
//
// La visionneuse relit un fichier déjà produit ; elle ne connaît donc pas le plan. C'est ce qui la
// distingue de la Vue 3D, et ce qui explique la seule règle à retenir ici : **elle recharge le
// modèle en gardant la caméra**. Refaire la scène sans conserver le point de vue renverrait
// l'utilisateur au cadrage d'origine à chaque case cochée, ce qui rend une comparaison impossible.

import { glb } from '../../three/etat3d.js';
import { fondGlbViewer, type CameraConservee } from '../../three/glbViewer.js';
import { estTexture } from '../../three/gardes.js';
import type { Atelier } from '../atelier.js';
import type { RegistreCommandes } from '../commandes.js';
import type { ObjetMesurable } from '../../engine/hauteurs.js';

/** Ce que les commandes de la visionneuse pilotent, en plus de l'atelier. */
export interface ContexteVisionneuse {
  /** Produit le .glb depuis la scène courante. Le bouton passé est désarmé pendant l'opération. */
  genererGlb: (bouton: HTMLButtonElement, telecharger: boolean) => void;
  /**
   * Recharge la visionneuse, en conservant la caméra qu'on lui passe : sa position et le point
   * qu'elle vise. `null` quand il n'y a pas encore de scène, donc rien à conserver.
   */
  rafraichir: (cameraAConserver: CameraConservee) => void;
  /** Repose le soleil sur la scène de la visionneuse. */
  appliquerLumiere: () => void;
  /** Hauteur finie d'une terrasse, en millimètres. */
  hauteurFinieMm: (obj: ObjetMesurable) => number;
  /** Hauteur des yeux au-dessus du platelage, en mètres. */
  hauteurYeuxM: number;
}

export function brancherVisionneuse(a: Atelier, ctx: ContexteVisionneuse, cmd: RegistreCommandes): void {
  const el = (id: string) => document.getElementById(id) as HTMLInputElement;

  /** La caméra actuelle, à rendre à la scène rechargée. `null` quand il n'y a pas encore de scène. */
  const cameraCourante = () => glb.scene && {
    pos: glb.scene.camera.position.clone(),
    cible: glb.scene.controls.target.clone()
  };

  /** Zoom : on avance ou recule la caméra le long de sa ligne de visée, vers la cible d'orbite. */
  const zoom = (facteur: number) => {
    if (!glb.scene) return;
    const { camera, controls, renderer, scene } = glb.scene;
    const offset = new THREE.Vector3().subVectors(camera.position, controls.target).multiplyScalar(facteur);
    camera.position.copy(controls.target).add(offset);
    controls.update();
    renderer.render(scene, camera);
  };

  // Les deux boutons produisent le modèle sans écrire de fichier : la visionneuse n'a besoin que des
  // données, et déposer un .glb dans les téléchargements à chaque ouverture n'aurait aucun sens.
  const vis = (idDom: string, id: string, libelle: string, executer: (source?: HTMLElement) => void) => cmd.bouton(idDom, { id, libelle, groupe: 'visionneuse', executer });
  vis('glbViewerExporterBtn', 'visionneuse.generer', 'Générer le modèle 3D', (source) => ctx.genererGlb(source as HTMLButtonElement, false));
  vis('glbViewerRegenBtn', 'visionneuse.regenerer', 'Régénérer depuis le plan', (source) => ctx.genererGlb(source as HTMLButtonElement, false));

  vis('glbViewerZoomIn', 'visionneuse.zoomAvant', 'Zoom avant', () => zoom(0.8));
  vis('glbViewerZoomOut', 'visionneuse.zoomArriere', 'Zoom arrière', () => zoom(1.25));

  /**
   * Hauteur des yeux. Même repérage de terrasse que le bouton d'export — celle sélectionnée, sinon
   * la première — et même calcul que dans la Vue 3D : le .glb exporté utilise exactement le même
   * repère `y = 0` au sol que la vue qui l'a produit, donc la formule tombe juste ici aussi.
   *
   * Seule l'altitude bouge : ni la position au sol, ni la cible du regard.
   */
  vis('glbViewerEyeLevel', 'visionneuse.hauteurDesYeux', 'Hauteur des yeux', () => {
    if (!glb.scene) return;
    const terr = a.etat.objects.find(o => o.key === a.etat.terrasseSelectedKey && o.fonction === 'terrasse')
              || a.etat.objects.find(o => o.fonction === 'terrasse');
    if (!terr) return;
    const { camera, controls, renderer, scene } = glb.scene;
    camera.position.y = ctx.hauteurFinieMm(terr) / 1000 + ctx.hauteurYeuxM;
    controls.update();
    renderer.render(scene, camera);
  });

  // Filaire et ombres changent la géométrie ou l'état du renderer : il faut relire le modèle.
  el('glbViewerFilaire').addEventListener('change', function () {
    glb.filaire = this.checked;
    if (glb.ouvert) ctx.rafraichir(cameraCourante());
  });
  el('glbViewerShadows').addEventListener('change', function () {
    glb.ombres = this.checked;
    if (glb.ouvert) ctx.rafraichir(cameraCourante());
  });

  /**
   * Le fond se remplace à chaud. L'ancien est **libéré s'il s'agit d'une texture** — le damier en
   * est une : `traverse()` ne visite pas l'arrière-plan, il ne fait pas partie du graphe d'objets,
   * donc rien d'autre ne le libérerait et il fuirait comme n'importe quelle texture.
   */
  el('glbViewerFond').addEventListener('change', function () {
    glb.fond = this.value;
    if (glb.scene) {
      if (estTexture(glb.scene.scene.background)) glb.scene.scene.background.dispose();
      glb.scene.scene.background = fondGlbViewer();
    }
  });
}
