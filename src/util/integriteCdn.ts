// Les empreintes (SRI, sha384) des scripts que la page charge depuis jsDelivr : three.js et ses exemples, EZ-tree, model-viewer,
// pdf-lib. Un CDN compromis ne peut plus servir autre chose (MD/architecture.md §11 AD-12). Les modules les recoivent par le champ
// `integrity` de la table d'import de index.html (le navigateur qui ne le connait pas l'ignore) ; pdf-lib, charge par une balise,
// par son attribut. tests/unit/util/integriteCdn.test.ts les recalcule depuis node_modules et verifie qu'aucune adresse n'en manque :
// monter une version demande de les recalculer.
//
// Depuis l'etape 5.2 de la feuille de route (MD/roadmap-architecture.md), les memes fichiers sont aussi copies dans la livraison,
// sous `assets/vendor/<paquet>@<version>/<chemin>` (vite.config.ts les prend dans node_modules, a la version epinglee) : la page les
// charge d'abord la, a cote d'elle, et le CDN ne sert plus qu'en secours. Les fichiers sont les memes octets : la meme empreinte
// vaut pour les deux adresses.

export const INTEGRITE_CDN: Readonly<Record<string, string>> = {
  'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js': 'sha384-m8JoFX52V6NGv2usipnlLJKnJfL7IE8dbniPDDCSGSQv3Hm4n6PjfV6syVwfuoRc',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.core.js': 'sha384-mdKeCwPEcbDvzaxwhm+MVuLoMou+E7jQqrs4tmu/n8HBYPGI1kZt0MkJxlMR4zFM',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js': 'sha384-LSqANrugPGTgf0eYsQTloqKWy926dOOXo2iZ9y6wLMIDEQoU9AaCLJF1Vcc7oJXr',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/exporters/GLTFExporter.js': 'sha384-owCgEFDUdmZ/+YDIKX5gWOceAuScnKg2NtNluwqAbf+SU6XyIMjX4K0WczbN+WK5',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/lines/LineMaterial.js': 'sha384-ijlzWpc1yHwTvvgLgdhkrcd5RQTKG/twLNwGumhKSFZHITTXMnzRdHIrw8fmvM3o',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/lines/LineSegmentsGeometry.js': 'sha384-c1W/XWY1D45CznDDaXT87QmzD1YKNwYHvQegG8dXjCyf5ZaKzaWqEUwHZTYfBw64',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/loaders/GLTFLoader.js': 'sha384-jmhN0si8z6E7+h0t9KiwQ71oyrC3PhTpols1FXeN/vODuFa/L4bPIe9sLbOlhjq7',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/postprocessing/EffectComposer.js': 'sha384-9Rdp95mYHRj8gGxPz4TqkDaCUh8rd67b7V5slkjz7GA9uNXtykhptQdEPPOocbUn',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/postprocessing/OutputPass.js': 'sha384-3IFYrRLOw90S3gt5Xi3JVTJrETpklthjLSmnmeyqxQmh1knUIaGPwbRsk35kgNoW',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/postprocessing/RenderPass.js': 'sha384-uXlYrFHzQTAiW5xsJFs0kB/Pym7jA0qunZ+aS1V25CJ1MjaKbgNQv5SjoEzNoa4F',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/postprocessing/SSAOPass.js': 'sha384-xdOL4eF9rRgYP8AFjKTUF0xpRi4y4XOdJ0/3tWOsP5PzgP9OMg7ff33ObJM4chY9',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/shaders/OutputShader.js': 'sha384-7B5u2okAR4bArb4emcYnTiZPFpV3wPNvV3ZY9xre0xp3cNKs2TeaYiOyMDa/bDAi',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/shaders/SSAOShader.js': 'sha384-sk135eOjhquvqxfPeX06MWF0EvVYaBsJ1hbSlV4LL4QwvGuAr/pB3TerFpHeAnWb',
  'https://cdn.jsdelivr.net/npm/@dgreenheck/ez-tree@1.1.0/build/ez-tree.es.js': 'sha384-+AD7tgeLgqLaSf56l5fqqX23UsY8gvgXSLxryv3Vce/NO497Q14qPmGsbcM+FzPH',
  'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.5.0/dist/model-viewer.min.js': 'sha384-Ftcjj/GNLxPvzNDftO/oryXB9aGxsGZY9JGqsXG0uUKgQDl9RfDgsx9NJ/4IVNPe',
  'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js': 'sha384-weMABwrltA6jWR8DDe9Jp5blk+tZQh7ugpCsF3JwSA53WZM9/14PjS5LAJNHNjAI',
  'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/lines/LineSegments2.js': 'sha384-PodS3f4Ob57FETbMdk39akLP+W9/ScGjH/bBDerYOTsUt6dZc/i2Cbx7GW47tr5u',
};

/** La racine des paquets chez jsDelivr. */
export const RACINE_CDN = 'https://cdn.jsdelivr.net/npm/';
/** La racine des memes paquets dans la livraison, relative a la page. */
export const RACINE_LOCALE = './assets/vendor/';

/** L'adresse dans la livraison d'un fichier du CDN (`npm/three@0.186.1/build/…` → `./assets/vendor/three@0.186.1/build/…`). */
export const versLocale = (urlCdn: string): string => urlCdn.startsWith(RACINE_CDN) ? RACINE_LOCALE + urlCdn.slice(RACINE_CDN.length) : urlCdn;

/** L'adresse du CDN d'un fichier de la livraison, relative ou deja resolue ; une adresse du CDN reste telle quelle. */
export function versCdn(url: string): string {
  const i = url.indexOf('/assets/vendor/');
  return i < 0 ? url : RACINE_CDN + url.slice(i + '/assets/vendor/'.length);
}

/** L'empreinte d'un fichier, qu'il vienne de la livraison ou du CDN. */
export const empreinteDe = (url: string): string | undefined => INTEGRITE_CDN[versCdn(url)];
