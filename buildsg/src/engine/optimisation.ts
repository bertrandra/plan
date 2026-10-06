// L'optimiseur de structure : chiffrer chaque configuration admissible et les classer.
//
// Extrait de structure.ts sans retouche (architecture.md §9, FF-1) : il a besoin des couches de la
// terrasse, qui ont besoin de la structure. Au-dessus des deux, il ne ferme plus la boucle.

import { dist } from '../geometry/basic.js';
import { SOLIVE_PRICE, SOLIVE_SECTIONS, estPlots } from './constantes.js';
import { ensureConstruction } from './construction.js';
import { computeDebitsBois } from './debit.js';
import { computeTerrasseLayers } from './layers.js';
import { LAMBOURDE_SECTIONS, dimsSection, maxEntraxeLameCm, maxPorteeVisM, porteeAppuiM, sectionLambourde } from './portees.js';
import { coutDebit, prixPlotUnite, prixVisUnite } from './prix.js';
import { buildVisGrid, computeStructure, lamesAngleOf, surfaceNetteTerrasse, type CandidatStructure, type TerrasseEtudiee } from './structure.js';
import { enPoints } from '../model/formes.js';
import type { Segment, ObjetPlan, Construction } from '../model/types.js';

// Walks the configurations that satisfy both rules at once - the lames must not span further
// than their thickness allows, and every beam must reach from one support to the next - and
// ranks them by what the structure they imply would cost. Quantities are measured with the
// same functions that draw the plan, so a figure quoted here is the figure you would read off
// the drawing, not a parallel estimate that can drift away from it.
// Measures one candidate structure: real line lengths and a real screw layout, priced. Shared
// by the optimiser and by the "where do I stand today" comparison, so the two can never be
// computed on different bases.
// `prixBois` est le tarif au ml de la section de reference 45x70. Le prix reel suit le volume :
// une 63x175 fait 3,5 fois la matiere d'une 40x60 et ne peut pas etre comparee au meme tarif,
// sinon l'optimiseur choisit systematiquement la plus grosse section « gratuitement ».
export const SECTION_REF_AIRE = 45*70;
export function tarifSection(prixBoisRef: number, sec: string | undefined): number {
  const d = dimsSection(sec);
  return prixBoisRef * (d.b*d.h) / SECTION_REF_AIRE;
}
export function evaluerStructure(obj: TerrasseEtudiee, trial: Construction, prixVis: number, prixBois: number, _lamesAngle: number, surf: number, objets: ObjetPlan[]): CandidatStructure {
  const probe = { pts:obj.pts, construction:trial };
  const S = computeStructure(probe, objets);
  const vis = buildVisGrid(probe, S, objets);
  const ml = (a: Segment[]) => a.reduce((s,l)=>s+dist(l.a,l.b),0);
  // Every load-bearing piece counts towards the timber: the frame is part of the structure,
  // and the spa reinforcement is real wood that has to be bought. Chaque famille est chiffree
  // au tarif de sa propre section.
  const secCadre = S.plotSimple ? sectionLambourde(trial) : trial.soliveSection;
  const mlPorteur = ml(S.solives) + ml(S.solivesSpa);
  const mlCadre = ml(S.cadre);
  const mlLamb = ml(S.lambourdes);
  const coutBois = mlPorteur*tarifSection(prixBois, trial.soliveSection)
                 + mlCadre  *tarifSection(prixBois, secCadre)
                 + mlLamb   *tarifSection(prixBois, sectionLambourde(trial));
  // `computeStructure` vient de passer `trial` par `ensureConstruction` : ces trois champs sont poses,
  // et les replis ci-dessous sont ses valeurs par defaut.
  return { section:trial.soliveSection ?? '45x70', avecLambourde:!!trial.avecLambourde,
           soliveEntraxe:trial.soliveEntraxe ?? 40, lambourdeEntraxe:trial.lambourdeEntraxe ?? 40,
           vis:vis.length, ml:+(mlPorteur+mlCadre+mlLamb).toFixed(1),
           densite:+(vis.length/surf).toFixed(2),
           portee:Math.round(porteeAppuiM(trial)*100),
           cout:Math.round(vis.length*prixVis + coutBois) };
}
export function optimiserParametres(terrasse: ObjetPlan, objets: ObjetPlan[]): CandidatStructure[] {
  // Une terrasse est un polygone : l'appelant ne l'optimise qu'apres l'avoir verifie.
  const obj = enPoints(terrasse);
  const c = ensureConstruction(obj);
  // Densite rapportee a la surface posee : sans le trou d'un bassin ou d'une tremie.
  const surf = surfaceNetteTerrasse(obj.pts, objets) || 1;
  // Rates for the comparison: the screw price as entered, and an effective per-ml wood rate taken
  // from the current cut-list, so the waste a real cut-list carries is already inside the figure.
  // Re-running a cut-list for each of the 63 candidates would be exact but far slower, and the
  // ranking does not turn on it.
  const prixVis = estPlots(c) ? prixPlotUnite(c) : prixVisUnite(c);
  // Averaged over every timber group, so a build whose lambourdes are a separate product is
  // compared on what its wood really costs rather than on the solives' rate alone.
  // Ramene au tarif de la section de reference, en divisant par le volume : c'est ce tarif-la
  // que evaluerStructure redimensionne ensuite pour chaque section candidate.
  const groupesRef = computeDebitsBois(obj, computeTerrasseLayers(obj, objets));
  let refCout = 0, refMlAire = 0;
  groupesRef.forEach(g=>{
    const d = dimsSection(g.section);
    refCout += coutDebit(c, g.debit, g.cle);
    refMlAire += g.debit.reelMl * d.b * d.h;
  });
  const prixBois = refMlAire > 0
    ? refCout/refMlAire*SECTION_REF_AIRE
    : (SOLIVE_PRICE.bas+SOLIVE_PRICE.haut)/2;
  const entraxeLame = maxEntraxeLameCm(c);
  const lamesAngle = lamesAngleOf(obj);

  const evaluate = (section: string, avecLambourde: boolean, soliveEntraxe: number) => evaluerStructure(obj,
    { ...c, soliveSection:section, avecLambourde, soliveEntraxe,
      lambourdeEntraxe:entraxeLame, visModeAuto:true },
    prixVis, prixBois, lamesAngle, surf, objets);

  const out: CandidatStructure[] = [];
  // Sur plots, l'arbitrage n'est pas le meme : l'appui coute cinq a dix fois moins cher que la
  // vis, et son entraxe est plafonne par le DTU quoi qu'on fasse. La question devient donc
  // « pose simple ou structure double », et non « quelle section de solive porte le plus loin ».
  if(estPlots(c)){
    // Pose simple : les lambourdes portent les lames, plots dessous. Une entree par section de
    // lambourde, puisque c'est elle qui travaille.
    LAMBOURDE_SECTIONS.forEach(section=>{
      out.push(Object.assign(
        evaluerStructure(obj, { ...c, lambourdeSection:section, plotAvecSolives:false,
                                avecLambourde:true, lambourdeEntraxe:entraxeLame, plotEntraxeAuto:true },
          prixVis, prixBois, lamesAngle, surf, objets),
        { section, avecLambourde:false, topologie:'simple', soliveEntraxe:entraxeLame }));
    });
    // Structure double : plots sous solives, lambourdes au-dessus. Plus de bois, moins de plots.
    SOLIVE_SECTIONS.forEach(section=>{
      const porteeLamb = maxPorteeVisM({ ...c, soliveSection:sectionLambourde(c), soliveEntraxe:entraxeLame });
      const maxSolive = Math.floor(porteeLamb*100/5)*5;
      for(let se=entraxeLame; se<=maxSolive; se+=5){
        out.push(Object.assign(
          evaluerStructure(obj, { ...c, soliveSection:section, plotAvecSolives:true,
                                  avecLambourde:true, soliveEntraxe:se,
                                  lambourdeEntraxe:entraxeLame, plotEntraxeAuto:true },
            prixVis, prixBois, lamesAngle, surf, objets),
          { section, avecLambourde:true, topologie:'double', soliveEntraxe:se }));
      }
    });
    return out.sort((a,b)=>a.cout-b.cout);
  }
  // Without lambourdes the solives carry the lames themselves, so their spacing is pinned by
  // the lame thickness and the section is the only free variable.
  SOLIVE_SECTIONS.forEach(section=>out.push(evaluate(section, false, entraxeLame)));
  // With lambourdes the lames rest on the lambourdes instead, which frees the solives to
  // spread out as far as a lambourde of that section will reach between them. Same span
  // formula, applied one storey down: here the tributary width is the lambourde entraxe.
  SOLIVE_SECTIONS.forEach(section=>{
    // How far the solives may spread is set by what a LAMBOURDE of its own section can reach
    // between them, not by the solive's section.
    const porteeLambourde = maxPorteeVisM({ ...c, soliveSection:sectionLambourde(c), soliveEntraxe:entraxeLame });
    const maxSolive = Math.floor(porteeLambourde*100/5)*5;
    for(let se=entraxeLame; se<=maxSolive; se+=5) out.push(evaluate(section, true, se));
  });
  return out.sort((a,b)=>a.cout-b.cout);
}
