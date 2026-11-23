// Le projet de la demonstration, complete d'une pergola et d'un carport neufs, et le contexte que les descripteurs de l'inspecteur y
// lisent : pour les tests qui regardent ce que l'inspecteur montre d'un objet, en mode simple ou expert.

import { sectionsInspecteur } from '../../../src/ui/champs/sections.js';
import { champsVisibles, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import { nouvelAbri } from '../../../src/model/creation.js';
import type { ObjetPlan, VolumeToit } from '../../../src/model/types.js';

export function projet(): ObjetPlan[] {
  const objets = structuredClone(DEMO_OBJECTS) as ObjetPlan[];
  for (const n of [nouvelAbri('pergola', { x: 5, y: 5 }, 'pg', 1), nouvelAbri('carport', { x: 8, y: 8 }, 'cp', 1)]) objets.push(n.obj);
  const r = objets.find(o => o.key === 'parcelle')?.relief;
  if (r) r.z = Array.from({ length: r.nx * r.ny }, (_, i) => 30 + (i % 7) / 10);
  return objets;
}

const neutre = new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => null) }) as Record<string | symbol, unknown>;
export function contexte(objets: ObjetPlan[], obj: ObjetPlan, modeSimple: boolean): ContexteChamps {
  const base: Record<string, unknown> = {
    etat: { objects: objets, highlight: {}, lectureSeule: false, scene: { scale: 10 }, selectedKey: obj.key, parasol: { ombreAffichee: false, carteAffichee: false } },
    obj, objets, parcelle: objets.find(o => o.key === 'parcelle'), construction: () => ensureConstruction(obj), elevationOf: () => 6, interiorAngleDeg: () => 90, libelleType: () => 'objet', refLabel: () => '',
    commandeUtilisable: () => true, pointage: () => null, cibleAlignement: () => null, dejaRectangle: () => false, modeSimple,
    contexteSoleil: () => ({ latitude: 48.9, longitude: 2.1, date: new Date('2026-06-21T12:00:00Z') })
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : neutre[k]) }) as unknown as ContexteChamps;
}
/** Deux corps de batiment : « Toit en 3D » se propose, et la 3D prend d'elle-meme « Un toit par corps ». */
export const DEUX_CORPS: VolumeToit[] = [
  { pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }], toit: { forme: 'deux-pans', hauteur: 3, angleFaitage: 90 }, egout: 6 },
  { pts: [{ x: 8, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 8, y: 8 }], toit: { forme: 'appentis', hauteur: 1, angleFaitage: 90 } }
];
export const parNom = (objets: ObjetPlan[], nom: string) => { const o = objets.find(x => x.name === nom); if (!o) throw new Error('absent : ' + nom); return o; };
/** Les cles montrees, « section/cle ». */
export function montrees(objets: ObjetPlan[], nom: string, modeSimple: boolean): string[] {
  const c = contexte(objets, parNom(objets, nom), modeSimple);
  return sectionsInspecteur(c).flatMap(s => champsVisibles(s, c).map(ch => s.id + '/' + ch.cle));
}
