// Poignees SVG d'un objet du plan (spec-migration-typescript.md §5.2, « view handles »).
//
// Jusqu'ici chaque objet portait ses elements SVG directement : `obj.el`, `obj.nameEl`,
// `obj.pointEls`... Melanger la donnee persistee et le DOM a un cout precis : toute serialisation
// devait se souvenir de retirer ces champs, et un oubli produisait soit un JSON illisible, soit
// une reference morte reintroduite par un undo. La liste blanche de `serializeObjects` existait
// pour cette raison.
//
// Les poignees vivent donc a cote, dans une carte indexee par la cle de l'objet. La donnee
// redevient serialisable par construction, et la classe de bug « j'ai oublie de retirer un noeud
// DOM avant JSON.stringify » disparait.

export interface VueObjet {
  el: SVGElement | null;
  nameEl: SVGTextElement | null;
  pointEls: SVGElement[];
  ptLabelEls: SVGElement[];
  edgeEls: SVGElement[];
  segLabelEls: SVGElement[];
  radiusHandle: SVGElement | null;
  camMarkerEl: SVGElement | null;
  /** Le gabarit qui perce le contour d'une terrasse de ses trous (render/objects.ts). */
  clipEl?: SVGElement | null;
}

type ObjetAvecCle = { key: string };

const vues = new Map<string, VueObjet>();

function vueVide(): VueObjet {
  return {
    el: null, nameEl: null,
    pointEls: [], ptLabelEls: [], edgeEls: [], segLabelEls: [],
    radiusHandle: null, camMarkerEl: null
  };
}

/** Poignees d'un objet, creees a la demande : un objet sans DOM rend une vue vide, jamais null. */
export function vue(obj: ObjetAvecCle): VueObjet {
  let v = vues.get(obj.key);
  if (!v) {
    v = vueVide();
    vues.set(obj.key, v);
  }
  return v;
}

/** Retire du document tous les elements d'un objet, et oublie sa vue. */
export function detruireVue(obj: ObjetAvecCle): void {
  const v = vues.get(obj.key);
  if (!v) return;
  if (v.el) v.el.remove();
  if (v.nameEl) v.nameEl.remove();
  v.pointEls.forEach((e) => e.remove());
  v.ptLabelEls.forEach((e) => e.remove());
  v.edgeEls.forEach((e) => e.remove());
  v.segLabelEls.forEach((e) => e.remove());
  if (v.radiusHandle) v.radiusHandle.remove();
  if (v.camMarkerEl) v.camMarkerEl.remove();
  if (v.clipEl) v.clipEl.remove();
  vues.delete(obj.key);
}
