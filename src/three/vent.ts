// Le vent dans les arbres de la Vue 3D (preference d'affichage « Vent »).
//
// Les arbres du plan sont des lots d'instances qui se partagent deux materiaux par essence (three/arbre3d.ts) : on ne bouge pas
// des mailles, on deplace les sommets dans le vertex shader, a partir du temps et du pied de chaque arbre (sa matrice d'instance).
// Le code de vent d'EZ-tree n'est pas repris : il suppose un arbre seul, pas des instances, et Plan l'a retire de ses materiaux.
//
// - Le tronc et les branches se balancent d'autant plus qu'ils sont hauts (le pied ne bouge pas), sur deux frequences et une
//   rafale lente ; chaque arbre a sa phase, tiree de sa place, pour que la rangee ne bouge pas d'un bloc.
// - Les feuilles frémissent en plus, chacune a son rythme.
// - Un resineux est plus raide qu'un feuillu (`souplesse`).
// - Le deplacement est une fraction de la hauteur de l'arbre : un cypres de 18 m et un buis de 2 m ondulent de la meme facon.
//
// La force est un interrupteur (0 ou 1) : les uniformes sont partages par tous les materiaux, il n'y a pas de recompilation.
// Les ombres portees ne bougent pas (le materiau de profondeur est celui de three) ; l'export .glb non plus (la geometrie reste
// celle d'EZ-tree).

import type * as THREE_NS from 'three';

/** Les uniformes communs a tous les arbres. */
export const uniformesVent = { temps: { value: 0 }, force: { value: 0 } };

/** Pose l'etat du vent pour l'image a rendre : `actif` selon la preference, `tMs` l'horloge du navigateur. */
export function reglerVent(actif: boolean, tMs: number): void {
  uniformesVent.force.value = actif ? 1 : 0;
  uniformesVent.temps.value = tMs / 1000;
}

/** Le deplacement au sommet, en part de la hauteur de l'arbre, avant la souplesse de l'essence. */
export const AMPLITUDE_CIME = 0.035;
/** Le frémissement d'une feuille, en part de la hauteur de l'arbre. */
export const AMPLITUDE_FEUILLE = 0.006;

/** Le morceau de shader qui deplace `transformed` ; exporte pour les tests. */
export function codeVent(feuilles: boolean): string {
  return `
    #ifdef USE_INSTANCING
      vec3 ventPied = vec3(instanceMatrix[3].x, 0.0, instanceMatrix[3].z);
    #else
      vec3 ventPied = vec3(0.0);
    #endif
    float ventH = clamp(position.y / uVentHauteur, 0.0, 1.0);
    float ventPhase = ventPied.x * 0.35 + ventPied.z * 0.27;
    float ventRafale = 0.6 + 0.4 * sin(uVentTemps * 0.35 + ventPhase * 0.5);
    float ventBalancier = 0.6 * sin(uVentTemps * 1.25 + ventPhase) + 0.4 * sin(uVentTemps * 2.1 + ventPhase * 1.7);
    float ventAmp = uVentForce * uVentSouplesse * ventRafale * ventH * ventH * ${AMPLITUDE_CIME.toFixed(4)} * uVentHauteur;
    transformed.x += ventAmp * ventBalancier;
    transformed.z += ventAmp * 0.6 * cos(uVentTemps * 1.1 + ventPhase);
    ${feuilles ? `float ventFeuille = uVentForce * uVentSouplesse * ventH * ${AMPLITUDE_FEUILLE.toFixed(4)} * uVentHauteur;
    transformed += ventFeuille * vec3(sin(uVentTemps * 5.0 + dot(position, vec3(12.9, 7.2, 9.1))), 0.5 * sin(uVentTemps * 4.1 + dot(position, vec3(5.3, 11.7, 3.9))), cos(uVentTemps * 4.3 + position.x * 9.0));` : ''}
  `;
}

/**
 * Habille le materiau d'un modele d'arbre du vent. `hauteurModele` : la hauteur du modele d'EZ-tree (le shader en tire la part de
 * hauteur de chaque sommet) ; `souplesse` : 1 pour un feuillu, moins pour un resineux. Sans effet sur un materiau sans shader
 * (les doublures des tests).
 */
export function habillerDeVent(mat: THREE_NS.Material, hauteurModele: number, souplesse: number, feuilles: boolean): void {
  if (!mat || typeof mat !== 'object') return;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uVentTemps = uniformesVent.temps;
    shader.uniforms.uVentForce = uniformesVent.force;
    shader.uniforms.uVentHauteur = { value: Math.max(0.001, hauteurModele) };
    shader.uniforms.uVentSouplesse = { value: souplesse };
    shader.vertexShader = 'uniform float uVentTemps;\nuniform float uVentForce;\nuniform float uVentHauteur;\nuniform float uVentSouplesse;\n'
      + shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + codeVent(feuilles));
  };
  // Deux programmes differents (bois, feuilles) : la cle evite qu'ils se confondent dans le cache de three.
  mat.customProgramCacheKey = () => 'vent-' + (feuilles ? 'feuilles' : 'bois');
  mat.needsUpdate = true;
}
