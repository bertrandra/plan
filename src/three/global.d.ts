// Three.js est charge au moment ou l'utilisateur ouvre la Vue 3D, depuis un CDN, et se pose sur
// `window.THREE`. Il n'est pas empaquete : la contrainte du projet est un fichier HTML unique, et
// Three.js pese plus lourd a lui seul que tout le reste de l'application.
//
// Le typer vraiment demanderait de dependre de @types/three, qui decrit une bibliotheque que ce
// build ne contient pas — une dependance de type sans dependance de code. On declare donc la forme
// minimale : la bibliotheque telle qu'elle arrive, non typee.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const THREE: any;

// Les chargeurs verifient la presence de la bibliotheque avant de la retelecharger, et regardent
// pour cela `window.THREE` — l'endroit ou le script du CDN la depose.
interface Window {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  THREE?: any;
}
