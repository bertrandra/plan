// Three.js est charge au moment ou l'utilisateur ouvre la Vue 3D, depuis un CDN, et se pose sur
// `window.THREE`. Il n'est **pas** empaquete : la contrainte du projet est un fichier HTML unique,
// et Three.js pese plus lourd a lui seul que tout le reste de l'application.
//
// D'ou une dependance de type sans dependance de code : `@types/three@0.128.0` est en
// devDependency, il decrit exactement la version r128 que les balises <script> vont chercher chez
// jsDelivr, et il ne sort jamais dans le build (aucun `import` de valeur ne pointe vers `three`).
// C'est l'option A de la spec §8.3, et c'est la seule facon de typer une bibliotheque qu'on charge
// au lieu de l'empaqueter.
//
// Les trois classes d'`examples/` arrivent par des scripts separes qui se posent sur le meme
// global. Leur surface d'API est identique entre `examples/js` (ce que le CDN sert) et
// `examples/jsm` (ce que les types decrivent) a la r128.

import type * as THREE_NS from 'three';
import type { OrbitControls as OrbitControlsType } from 'three/examples/jsm/controls/OrbitControls';
import type { GLTFExporter as GLTFExporterType } from 'three/examples/jsm/exporters/GLTFExporter';
import type { GLTFLoader as GLTFLoaderType } from 'three/examples/jsm/loaders/GLTFLoader';

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
