// Le rendu a la demande de la Vue 3D (demande du proprietaire, 5 novembre 2026 : « ne redessiner que
// quand quelque chose change »).
//
// La boucle d'animation (three/scene.ts::monterScene) tourne toujours, a chaque image du navigateur,
// mais ne rend que si `imageAttendue` le dit ; a l'arret, elle se reduit a quelques comparaisons.
// Garder la boucle plutot que l'arreter et la relancer : l'amortissement des controles, la focale qui
// suit la hauteur et les animations qui deplacent la camera (presentation, promenade, navigation)
// continuent d'etre lus a chaque image, sans qu'aucun d'eux ait a savoir qu'il faut la relancer.
//
// Un seul mecanisme, un « drapeau sale » par scene, leve par :
// - `demanderRendu(sc)`, l'appel explicite (reglages de la Vue 3D, objets remplaces, arbres refaits,
//   contexte WebGL rendu) ;
// - la veille de three.js (`installerVeille`) : un objet ajoute ou retire n'importe ou, un materiau,
//   une texture ou un tampon de sommets marques `needsUpdate` (une texture ou un GLB qui finit de
//   charger, EZ-tree, un materiau change) — sans avoir a trouver chaque chemin qui le fait ;
// - un geste de la personne (pointeur, molette, clavier, saisie) : pendant ACTIVITE_MS, chaque image
//   est rendue, ce qui couvre tout ce qu'un geste change sans passer par un chemin connu (une couleur,
//   une visibilite, une poignee deplacee) ;
// - la pose de la camera (position, orientation, focale, taille du canevas : `aRedessiner`, celle qui
//   servait deja a l'avant / apres) ;
// - une animation : le vent dans des arbres visibles, ou une animation declaree (`animation`).
// Et deux filets, parce qu'une image figee fausse coute plus qu'un rendu de trop :
// - tant que des changements arrivent (QUEUE_MS apres le dernier), une image au moins toutes les
//   DELAI_REPOS_MS : une texture qui se pose sans rien dire se montre ainsi ;
// - toutes les EMPREINTE_MS, une empreinte de la scene (positions, visibilites, couleurs et
//   materiaux, lumieres, fond, brume) : ce qui a change hors de tout chemin connu se voit au plus
//   tard un quart de seconde apres.
//
// Tout rendu passe par `rendre3d` (three/etat3d.ts), qui le note (`imageRendue`) : une image rendue
// par un autre chemin (navigation, soleil) n'est pas rendue une seconde fois par la boucle.

import type * as THREE_NS from 'three';

/**
 * Ce que le rendu a la demande lit d'une scene : le sous-ensemble de `SceneTroisBase` (three/etat3d.ts)
 * qu'il lui faut, ecrit ici pour qu'etat3d puisse l'importer sans cycle.
 */
export interface SceneTroisBase {
  scene: THREE_NS.Scene;
  camera: THREE_NS.PerspectiveCamera;
  renderer: THREE_NS.WebGLRenderer;
  cameraRendu?: THREE_NS.Camera | undefined;
}

/** Tant que des changements arrivent, une image au moins toutes les… : de quoi montrer une texture arrivee. */
export const DELAI_REPOS_MS = 400;
/** Apres un changement de la scene, la duree pendant laquelle le filet de DELAI_REPOS_MS reste tendu. */
export const QUEUE_MS = 2000;
/** Apres un geste de la personne, la duree pendant laquelle chaque image est rendue. */
export const ACTIVITE_MS = 600;
/** L'intervalle de l'empreinte de la scene, le filet de ce qu'aucun chemin connu ne signale. */
export const EMPREINTE_MS = 250;

/** Ce que la boucle retient d'une scene : sa derniere image, et ce qui la rend perimee. */
interface EtatRendu {
  sale: boolean;
  pose: number[] | null;
  /** L'heure de la derniere image. */
  t: number;
  /** La generation des changements de three.js vue par la derniere image. */
  generation: number;
  empreinte: number;
  tEmpreinte: number;
  /** Des arbres visibles dans la scene (le vent les anime), lu avec l'empreinte. */
  arbres: boolean;
}

const etats = new WeakMap<object, EtatRendu>();
const etatDe = (sc: SceneTroisBase): EtatRendu => {
  let e = etats.get(sc);
  if (!e) { e = { sale: true, pose: null, t: -Infinity, generation: -1, empreinte: NaN, tEmpreinte: -Infinity, arbres: false }; etats.set(sc, e); }
  return e;
};

const maintenant = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Les changements signales par la veille de three.js et les gestes de la personne. */
const global = { generation: 0, tChangement: -Infinity, tActivite: -Infinity, animations: 0, enRendu: false };

/** La prochaine image de cette scene sera rendue. Sans scene, rien (la Vue 3D n'est pas ouverte). */
export function demanderRendu(sc: SceneTroisBase | null | undefined, t = maintenant()): void {
  if (!sc) return;
  etatDe(sc).sale = true;
  global.tChangement = t;
}

/** Quelque chose a change dans une scene three.js, on ne sait pas laquelle : toutes se redessinent. */
export function signalerChangement3d(): void {
  if (global.enRendu) return;
  global.generation++;
  global.tChangement = maintenant();
}

/** Un geste de la personne : les images des ACTIVITE_MS qui suivent sont rendues. */
export function signalerActivite(t = maintenant()): void {
  global.tActivite = t;
}

/**
 * Une animation commence (une camera ou une scene qui bouge sans geste) : chaque image est rendue
 * jusqu'a l'appel de la fonction rendue, qui l'arrete (une seule fois, quoi qu'on l'appelle).
 */
export function animation(): () => void {
  global.animations++;
  let fini = false;
  return () => { if (fini) return; fini = true; global.animations--; global.tChangement = maintenant(); };
}

/**
 * Ce qui fait l'image : la camera qui la fait (celle de l'editeur de facade du mode Toit quand elle est
 * posee), sa position, son orientation, sa projection (focale, forme, decalage de la prise de vue de
 * l'audit), et la taille du canevas.
 */
export function poseDe(sc: SceneTroisBase): number[] {
  // Les doublures des tests n'ont pas tout : ce qui manque compte pour zero.
  const c = (sc.cameraRendu ?? sc.camera) as Partial<THREE_NS.PerspectiveCamera> | undefined;
  const el = sc.renderer?.domElement, p = c?.position, q = c?.quaternion;
  const proj = c?.projectionMatrix?.elements ?? [];
  return [p?.x, p?.y, p?.z, q?.x, q?.y, q?.z, q?.w, c?.fov, c?.zoom, el?.clientWidth, el?.clientHeight, ...proj]
    .map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
}

/**
 * Faut-il redessiner : la camera ou le canevas ont change depuis la derniere image, ou elle date de
 * plus de `delai` ms. Pure : le rendu a la demande se teste sans WebGL.
 */
export function aRedessiner(derniere: readonly number[] | null, pose: readonly number[], depuisMs: number, delai = DELAI_REPOS_MS): boolean {
  if (!derniere || depuisMs >= delai || derniere.length !== pose.length) return true;
  return pose.some((v, i) => Math.abs(v - (derniere[i] as number)) > 1e-9);
}

/** Les noms des lots d'arbres (three/arbre3d.ts), repris ici pour ne pas en dependre. */
const LOTS_ARBRES = new Set(['arbres-branches', 'arbres-feuilles']);

/**
 * L'empreinte d'une scene : une somme ponderee de ce qui fait l'image hors camera. Une collision
 * demanderait que deux changements simultanes se compensent exactement : on l'accepte, le filet ne
 * remplace pas les signaux, il les double. Rend aussi si des arbres sont visibles (le vent les anime).
 */
export function empreinteDe(scene: THREE_NS.Object3D, sc?: SceneTroisBase): { empreinte: number; arbres: boolean } {
  let s = 0, k = 1, n = 0, arbres = false;
  const ajoute = (v: number) => { s += (Number.isFinite(v) ? v : 0) * k; k = (k * 1.618034) % 7 + 1; };
  const couleur = (c: { r: number; g: number; b: number } | null | undefined) => { if (c) { ajoute(c.r); ajoute(c.g); ajoute(c.b); } else ajoute(-1); };
  const materiau = (m: THREE_NS.Material & { color?: THREE_NS.Color; emissive?: THREE_NS.Color; map?: THREE_NS.Texture | null }) => {
    ajoute((m as unknown as { id?: number }).id ?? 0); ajoute(m.version); ajoute(m.visible ? 1 : 0); ajoute(m.opacity); ajoute(m.transparent ? 1 : 0);
    couleur(m.color); couleur(m.emissive); ajoute(m.map ? m.map.id + m.map.version : -1);
  };
  const objet = (o: THREE_NS.Object3D): void => {
    n++;
    ajoute(o.id); ajoute(o.visible === false ? 0 : 1); ajoute(o.layers?.mask ?? 0);
    if (o.visible === false) return; // ce qui est cache ne se voit pas : ses enfants non plus
    const p = o.position, q = o.quaternion, e = o.scale;
    if (p) { ajoute(p.x); ajoute(p.y); ajoute(p.z); }
    if (q) { ajoute(q.x); ajoute(q.y); ajoute(q.z); ajoute(q.w); }
    if (e) { ajoute(e.x); ajoute(e.y); ajoute(e.z); }
    const m = (o as THREE_NS.Mesh).material as THREE_NS.Material | THREE_NS.Material[] | undefined;
    if (Array.isArray(m)) m.forEach(materiau); else if (m) materiau(m);
    const g = (o as THREE_NS.Mesh).geometry as THREE_NS.BufferGeometry | undefined;
    if (g) { ajoute(g.id); ajoute(g.drawRange?.count ?? 0); }
    const im = o as THREE_NS.InstancedMesh;
    if (im.isInstancedMesh) { ajoute(im.count); if (LOTS_ARBRES.has(o.name) && im.count > 0) arbres = true; }
    const l = o as THREE_NS.Light;
    if (l.isLight) { ajoute(l.intensity); couleur(l.color); }
    for (const c of o.children ?? []) objet(c);
  };
  if (scene) objet(scene);
  const sn = (scene ?? {}) as THREE_NS.Scene;
  const fond = sn.background as (THREE_NS.Color & THREE_NS.Texture) | null | undefined;
  if (fond && fond.isColor) couleur(fond); else ajoute(fond ? fond.id : -1);
  const brume = sn.fog as (THREE_NS.Fog & THREE_NS.FogExp2) | null | undefined;
  if (brume) { couleur(brume.color); ajoute(brume.near ?? 0); ajoute(brume.far ?? 0); ajoute(brume.density ?? 0); }
  if (sc) { ajoute(sc.renderer.toneMappingExposure); ajoute(sc.renderer.shadowMap?.enabled ? 1 : 0); }
  ajoute(n);
  return { empreinte: s, arbres };
}

/**
 * La boucle d'animation : faut-il rendre cette image ? `vent` : le vent est montre (il anime les
 * arbres, quand il y en a de visibles).
 */
export function imageAttendue(sc: SceneTroisBase, t = maintenant(), vent = false): boolean {
  const e = etatDe(sc);
  if (e.sale || e.generation !== global.generation || global.animations > 0) return true;
  if (t - global.tActivite < ACTIVITE_MS) return true;
  if (t - e.tEmpreinte >= EMPREINTE_MS) {
    e.tEmpreinte = t;
    const { empreinte, arbres } = empreinteDe(sc.scene, sc);
    e.arbres = arbres;
    if (empreinte !== e.empreinte) return true;
  }
  if (vent && e.arbres) return true;
  // Le filet : tant que des changements arrivent, une image au moins toutes les DELAI_REPOS_MS.
  const delai = t - global.tChangement < QUEUE_MS ? DELAI_REPOS_MS : Infinity;
  return aRedessiner(e.pose, poseDe(sc), t - e.t, delai);
}

/** Une image de cette scene vient d'etre rendue (three/etat3d.ts::rendre3d) : elle est a jour. */
export function imageRendue(sc: SceneTroisBase, t = maintenant()): void {
  const e = etatDe(sc);
  e.sale = false;
  e.pose = poseDe(sc);
  e.t = t;
  e.generation = global.generation;
  // L'empreinte de ce qui vient d'etre montre : le filet compare a elle, pas a une image plus ancienne.
  const { empreinte, arbres } = empreinteDe(sc.scene, sc);
  e.empreinte = empreinte; e.arbres = arbres; e.tEmpreinte = t;
}

/** Le temps d'un rendu : ce que three.js marque en rendant ne compte pas comme un changement. */
export function pendantLeRendu(f: () => void): void {
  const avant = global.enRendu;
  global.enRendu = true;
  try { f(); } finally { global.enRendu = avant; }
}

type Proto = Record<string, unknown>;

/** Enveloppe le reglage `needsUpdate` d'un prototype de three.js : le poser a vrai signale un changement. */
function veillerNeedsUpdate(proto: Proto | undefined): void {
  if (!proto) return;
  const d = Object.getOwnPropertyDescriptor(proto, 'needsUpdate');
  if (!d || !d.set || !d.configurable) return;
  const poser = d.set;
  Object.defineProperty(proto, 'needsUpdate', { ...d, set(v: unknown) { poser.call(this, v); if (v === true) signalerChangement3d(); } });
}

/** Enveloppe une methode d'un prototype : l'appeler signale un changement. */
function veillerMethode(proto: Proto | undefined, nom: string): void {
  const f = proto?.[nom];
  if (!proto || typeof f !== 'function') return;
  proto[nom] = function (this: unknown, ...a: unknown[]) { signalerChangement3d(); return (f as (...x: unknown[]) => unknown).apply(this, a); };
}

/** Les prototypes deja veilles : la veille ne s'enveloppe pas deux fois. */
const veilles = new WeakSet<object>();

const EVENEMENTS_GESTE = ['pointerdown', 'pointerup', 'wheel', 'keydown', 'keyup', 'input', 'change', 'touchstart', 'touchmove', 'touchend'] as const;

/**
 * Pose la veille, une fois pour toutes : sur les prototypes de three.js (ajout et retrait d'objets,
 * `needsUpdate` des materiaux, textures et tampons) et sur les gestes de la personne dans le
 * document (un deplacement du pointeur ne compte que bouton enfonce, ou sur un canevas : survoler
 * l'inspecteur ne redessine pas la Vue 3D).
 */
export function installerVeille(three: typeof THREE_NS, doc: Document | null = typeof document !== 'undefined' ? document : null): void {
  const t = three as unknown as Record<string, { prototype?: Proto } | undefined>;
  // Une fois par prototype : la classe Object3D est la meme pour toutes les copies de l'espace de noms.
  const object3d = t.Object3D?.prototype;
  if (!object3d || veilles.has(object3d)) return;
  veilles.add(object3d);
  for (const nom of ['add', 'remove', 'attach', 'clear']) veillerMethode(object3d, nom);
  for (const c of ['Material', 'Texture', 'Source', 'BufferAttribute', 'InterleavedBuffer']) veillerNeedsUpdate(t[c]?.prototype);
  if (doc) {
    const geste = () => signalerActivite();
    for (const ev of EVENEMENTS_GESTE) doc.addEventListener(ev, geste, { capture: true, passive: true });
    doc.addEventListener('pointermove', (e: PointerEvent) => {
      if (e.buttons || (e.target as Element | null)?.tagName === 'CANVAS') signalerActivite();
    }, { capture: true, passive: true });
  }
}
