// Les elements du toit proposes dans le meme audit que la forme du toit (MD/spec-ouvrages.md, « Les toits dans l'audit de la
// parcelle », point 3 de « Ce qu'il faut ranger ») : cheminees, lucarnes, toiture-terrasse et appentis se placent sur les corps du
// projet tels qu'ils sont. Si la forme est validee avec eux, ces corps sont remplaces avant qu'ils s'ecrivent (regles/decisions.ts,
// RANG_EFFET) : leur place, calculee sur les corps d'avant, ne vaut plus (un faitage qui a tourne, un corps qui n'existe plus).
// Chaque proposition d'element porte donc aussi sa place sur les corps de la forme proposee (`apresForme`), calculee ici par les
// memes regles de pose (facade/regles/toits/elementsVus.ts), et que l'ecriture prend quand la forme est ecrite avec elle. Les
// corps restent ceux du moteur : rien ici ne dessine un toit.

import { appentisDesCorps, corpsDeLaTerrasse, corpsDesCheminees, lucarnesSurLeCorps, panDesLucarnes, souchesDe, souchesSurLeCorps, terrasseVueDe, terrasseVueSurLeCorps } from '../../../facade/regles/toits/elementsVus.js';
import { elementPoseSurLeMur } from '../../../facade/regles/toits/elementsDesMurs.js';
import { saillieSurLeMur } from '../../../facade/regles/toits/sailliesDesMurs.js';
import { cleDeLaCible, type EffetProposition, type Proposition } from '../../../regles/decisions.js';
import type { CorpsToit } from '../../../model/types.js';

/** La place d'un element sur ces corps ; null quand il n'y tient pas ; undefined quand l'effet n'est pas un element du toit. */
function placeSurLesCorps(e: EffetProposition, corps: readonly CorpsToit[]): EffetProposition | null | undefined {
  switch (e.type) {
    case 'cheminees': {
      const i = corpsDesCheminees(corps), c = corps[i];
      return c ? { ...e, apresForme: { corps: i, cheminees: souchesSurLeCorps(c, souchesDe(e.cheminees)) } } : { ...e, apresForme: null };
    }
    case 'lucarnes': {
      const i = corpsDesCheminees(corps), c = corps[i];
      return c ? { ...e, apresForme: { corps: i, lucarnes: lucarnesSurLeCorps(c, e.lucarnes.length, e.lucarnes.map((l) => l.type), panDesLucarnes(e.lucarnes)) } } : { ...e, apresForme: null };
    }
    case 'elementsDuToit': {
      // Le moteur repose l'element vu sur le corps de la forme proposee qui porte son mur (elementsDesMurs.ts), ou nulle part.
      const pose = elementPoseSurLeMur(corps, e.vu);
      return pose ? { ...e, apresForme: { corps: pose.corps, cheminees: pose.cheminee ? [pose.cheminee] : [], lucarnes: pose.lucarne ? [pose.lucarne] : [] } } : { ...e, apresForme: null };
    }
    case 'saillieDuToit': {
      // Le moteur repose la saillie vue sur le corps de la forme proposee qui porte son mur (sailliesDesMurs.ts), ou nulle part.
      const pose = saillieSurLeMur(corps, e.vu);
      return { ...e, apresForme: pose ? { corps: pose.corps } : null };
    }
    case 'terrasse': {
      const i = corpsDeLaTerrasse(corps), c = corps[i];
      return c ? { ...e, apresForme: { corps: i, terrasse: { ...terrasseVueSurLeCorps(c, terrasseVueDe(e.terrasse)), source: e.terrasse.source } } } : { ...e, apresForme: null };
    }
    case 'appentis': {
      const cibles = appentisDesCorps(corps);
      return { ...e, apresForme: cibles.length ? { corps: cibles } : null };
    }
    default: return undefined;
  }
}

/** Les propositions, chaque element du toit d'un batiment dont la forme est aussi proposee portant sa place sur les corps proposes. */
export function avecPlacesApresForme(propositions: readonly Proposition[]): Proposition[] {
  const formes = new Map<string, CorpsToit[]>();
  for (const p of propositions) { const cle = cleDeLaCible(p.cible); if (cle && p.effet.type === 'corpsToit') formes.set(cle, p.effet.corps); }
  if (!formes.size) return [...propositions];
  return propositions.map((p) => {
    const cle = cleDeLaCible(p.cible), corps = cle ? formes.get(cle) : undefined;
    const effet = corps ? placeSurLesCorps(p.effet, corps) : undefined;
    return effet ? { ...p, effet } : p;
  });
}
