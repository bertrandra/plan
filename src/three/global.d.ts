// Three.js est charge au moment ou l'utilisateur ouvre la Vue 3D, depuis un CDN (jsDelivr), et se
// pose sur `window.THREE` (three/bibliotheque.ts). Il n'est **pas** empaquete : la contrainte du
// projet est un fichier HTML unique, et Three.js pese plus lourd a lui seul que tout le reste de
// l'application.
//
// D'ou une dependance de type sans dependance de code : `@types/three` est en devDependency, il
// decrit la version epinglee que la page va chercher chez jsDelivr (0.186), et il ne sort jamais
// dans le build (aucun `import` de valeur ne pointe vers `three`). C'est l'option A de la spec
// §8.3, et c'est la seule facon de typer une bibliotheque qu'on charge au lieu de l'empaqueter.
//
// Les classes d'`examples/` arrivent par des modules separes que bibliotheque.ts pose sur le meme
// global.

import type * as THREE_NS from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/addons/controls/OrbitControls.js';
import type { GLTFExporter as GLTFExporterType } from 'three/addons/exporters/GLTFExporter.js';
import type { GLTFLoader as GLTFLoaderType } from 'three/addons/loaders/GLTFLoader.js';

declare global {
  const THREE: typeof THREE_NS & {
    OrbitControls: typeof OrbitControlsType;
    GLTFExporter: typeof GLTFExporterType;
    GLTFLoader: typeof GLTFLoaderType;
  };

  // Les chargeurs verifient la presence de la bibliotheque avant de la retelecharger, et regardent
  // pour cela `window.THREE` — l'endroit ou le script du CDN la depose. Elle peut donc etre
  // absente, contrairement au global ci-dessus qu'on ne lit qu'une fois la 3D chargee.
  interface Window {
    THREE?: typeof THREE;
  }
}
