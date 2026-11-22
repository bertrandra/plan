import { describe, it, expect } from 'vitest';
import { sectionsInspecteur } from '../../../src/ui/champs/sections.js';
import { champsVisibles, type Champ, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { DEMO_OBJECTS } from '../../../src/model/demo.js';
import { ensureConstruction } from '../../../src/engine/construction.js';
import { nouvelAbri, nouvellePiscine, nouveauTrou } from '../../../src/model/creation.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Chaque reglage du mode simple s'explique (audit de l'inspecteur, 22 novembre 2026, lot A1) : une aide,
// que l'infobulle montre au bureau et le « i » au doigt, ou une note ecrite sous le champ. Un reglage
// ajoute sans explication fait echouer ce test. Les lignes composees (un cote, un coin, une fenetre)
// portent leurs propres commandes et restent hors de ce compte, comme les sections de la cloture et
// des portails, reprises par ailleurs.

const objets = structuredClone(DEMO_OBJECTS) as ObjetPlan[];
for (const n of [nouvelAbri('pergola', { x: 5, y: 5 }, 'pg', 1), nouvelAbri('carport', { x: 8, y: 8 }, 'cp', 1), nouvellePiscine('rectangle', { x: 12, y: 6 }, 'pi', 1), nouveauTrou({ x: 3, y: 3 }, 'tr', 1)]) objets.push(n.obj);
const parcelle = objets.find(o => o.key === 'parcelle');
{ const r = parcelle?.relief; if (r) r.z = Array.from({ length: r.nx * r.ny }, (_, i) => 30 + (i % 7) / 10); }

const neutre = new Proxy({}, { get: (_t, k) => (k === 'then' ? undefined : () => null) }) as Record<string | symbol, unknown>;
function contexte(obj: ObjetPlan): ContexteChamps {
  const base: Record<string, unknown> = {
    etat: { objects: objets, highlight: {}, lectureSeule: false, scene: { scale: 10 }, selectedKey: obj.key, parasol: { ombreAffichee: false, carteAffichee: false } },
    obj, objets, parcelle, construction: () => ensureConstruction(obj), elevationOf: () => 0, interiorAngleDeg: () => 90, libelleType: () => 'objet', refLabel: () => '',
    commandeUtilisable: () => true, pointage: () => null, cibleAlignement: () => null, dejaRectangle: () => false, modeSimple: true,
    contexteSoleil: () => ({ latitude: 48.9, longitude: 2.1, date: new Date('2026-06-21T12:00:00Z') })
  };
  return new Proxy(base, { get: (t, k) => (k in t ? t[k as string] : neutre[k]) }) as unknown as ContexteChamps;
}

const SAISIE = new Set<Champ['type']>(['texte', 'nombre', 'case', 'choix', 'couleur', 'texture', 'curseur', 'date']);
const AILLEURS = new Set(['cloture', 'portails']);

describe('les explications des reglages du mode simple', () => {
  it('chaque reglage a saisir porte une aide ou une note', () => {
    const sans = new Set<string>();
    for (const obj of objets) {
      const c = contexte(obj);
      for (const s of sectionsInspecteur(c)) {
        if (AILLEURS.has(s.id)) continue;
        for (const ch of champsVisibles(s, c)) if (SAISIE.has(ch.type) && !ch.aide && !ch.note) sans.add(s.id + '/' + ch.cle);
      }
    }
    expect([...sans].sort()).toEqual([]);
  });

  it('aucun libelle ne crie en majuscules, aucune unite ne porte une phrase', () => {
    // « Lame de rive — habillage VERTICAL », « ° / côté de référence » (lot A5).
    const cries: string[] = [];
    for (const obj of objets) {
      const c = contexte(obj);
      for (const s of sectionsInspecteur(c)) for (const ch of champsVisibles(s, c)) {
        if (/[A-ZÀ-Ý]{4,}/.test(ch.libelle)) cries.push(s.id + '/' + ch.cle + ' : ' + ch.libelle);
        if (ch.type === 'nombre' && (ch.unite ?? '').length > 6) cries.push(s.id + '/' + ch.cle + ' : unité « ' + ch.unite + ' »');
      }
    }
    expect(cries).toEqual([]);
  });

  it('une aide est une phrase, pas un mot', () => {
    const courtes: string[] = [];
    for (const obj of objets) {
      const c = contexte(obj);
      for (const s of sectionsInspecteur(c)) for (const ch of champsVisibles(s, c)) if (ch.aide !== undefined && ch.aide.trim().length < 12) courtes.push(s.id + '/' + ch.cle);
    }
    expect(courtes).toEqual([]);
  });
});
