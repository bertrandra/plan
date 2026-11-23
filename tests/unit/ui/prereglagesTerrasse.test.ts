import { describe, it, expect } from 'vitest';
import { sectionsConstruction } from '../../../src/ui/champs/construction.js';
import { appliquerPrereglage, prereglageEnPlace, PREREGLAGES_TERRASSE } from '../../../src/ui/champs/prereglages.js';
import { horsBornes } from '../../../src/ui/champs/bornes.js';
import type { Champ, ChampLigne, ContexteChamps } from '../../../src/ui/champs/types.js';
import type { Construction, ObjetPlan } from '../../../src/model/types.js';
import { computeBOM } from '../../../src/engine/bom.js';
import { computeTerrasseLayers } from '../../../src/engine/layers.js';
import { ensureConstruction } from '../../../src/engine/construction.js';

// Les trois departs d'une terrasse (audit de l'inspecteur, decision B5) : ils ecrivent par les descripteurs ce que la personne aurait
// saisi champ par champ, et rien d'autre. Le calcul n'en sait rien : une terrasse reglee par un depart et la meme reglee a la main
// donnent la meme nomenclature.

function terrasse(construction: Partial<Construction>): ObjetPlan {
  const obj = { key: 't', name: 'T', fonction: 'terrasse', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 4 }, { x: 0, y: 4 }], construction: { ...construction } } as unknown as ObjetPlan;
  ensureConstruction(obj);
  return obj;
}
function contexte(obj: ObjetPlan): ContexteChamps {
  return { etat: { objects: [obj], highlight: {} }, obj, objets: [obj], parcelle: null, construction: () => obj.construction, executerCommande: () => undefined } as unknown as ContexteChamps;
}
const champs = (cx: ContexteChamps): Champ[] => sectionsConstruction(cx).flatMap((s) => s.champs);
const trouver = (cx: ContexteChamps, cle: string) => champs(cx).find((c) => c.cle === cle);
const bom = (o: ObjetPlan) => JSON.stringify(computeBOM(o, computeTerrasseLayers(o, [o])));
const parCommande = (id: string) => PREREGLAGES_TERRASSE.find((p) => p.commande === id)!;

describe('les departs d une terrasse', () => {
  it('sont trois, nommes comme le metier, chacun lie a sa commande', () => {
    expect(PREREGLAGES_TERRASSE.map((p) => p.libelle)).toEqual(['Pin sur vis', 'Pin sur plots', 'Exotique sur plots']);
    const ligne = trouver(contexte(terrasse({})), 'prereglages') as ChampLigne;
    expect(ligne.type).toBe('ligne');
    expect(ligne.champs.map((c) => c.type === 'bouton' && typeof c.agit === 'object' ? c.agit.commande : null))
      .toEqual(['terrasse.prereglage.pinVis', 'terrasse.prereglage.pinPlots', 'terrasse.prereglage.exotiquePlots']);
  });

  it('ne posent que des valeurs que l inspecteur admet : une option de la liste, un nombre dans ses bornes', () => {
    for (const p of PREREGLAGES_TERRASSE) {
      const cx = contexte(terrasse({ typePose: p.valeurs.find(([k]) => k === 'typePose')![1] as string }));
      for (const [cle, valeur] of p.valeurs) {
        const ch = trouver(cx, cle);
        expect(ch, p.libelle + ' : ' + cle).toBeDefined();
        if (ch!.type === 'choix') expect(ch!.options(cx).map((o) => o.valeur), p.libelle + ' : ' + cle).toContain(valeur);
        else if (ch!.type === 'nombre') expect(horsBornes(ch!, valeur as number), p.libelle + ' : ' + cle).toBe(false);
        else expect(ch!.type, p.libelle + ' : ' + cle).toBe('case');
      }
    }
  });

  it('« Pin sur plots » regle une terrasse sur vis, et se lit ensuite comme en place', () => {
    const obj = terrasse({ typePose: 'vis-fondation', essenceBois: 'douglas', largeurLame: 120, epaisseurLame: 27, soliveSection: '45x95' });
    const cx = contexte(obj);
    expect(prereglageEnPlace(cx, champs(cx))).toBeUndefined();
    appliquerPrereglage(cx, parCommande('terrasse.prereglage.pinPlots'), () => champs(cx));
    const c = obj.construction!;
    expect([c.typePose, c.plotAvecSolives, c.essenceBois, c.largeurLame, c.epaisseurLame, c.lambourdeSection]).toEqual(['plots', false, 'pin-classe4', 145, 27, '45x70']);
    // Les solives n'existent pas sous des plots en structure simple : leur section n'est pas touchee.
    expect(c.soliveSection).toBe('45x95');
    expect(prereglageEnPlace(cx, champs(cx))?.libelle).toBe('Pin sur plots');
  });

  it('ecrit ce que la personne aurait ecrit a la main : la meme nomenclature', () => {
    for (const p of PREREGLAGES_TERRASSE) {
      const parDepart = terrasse({ typePose: 'plots', plotAvecSolives: true, essenceBois: 'douglas', largeurLame: 120, epaisseurLame: 27 });
      const cx = contexte(parDepart);
      appliquerPrereglage(cx, p, () => champs(cx));
      // A la main : chaque descripteur, dans le meme ordre, comme dans l'inspecteur.
      const aLaMain = terrasse({ typePose: 'plots', plotAvecSolives: true, essenceBois: 'douglas', largeurLame: 120, epaisseurLame: 27 });
      const cm = contexte(aLaMain);
      for (const [cle, valeur] of p.valeurs) {
        const ch = trouver(cm, cle)!;
        if ((ch.visible && !ch.visible(cm)) || (ch.actif && !ch.actif(cm))) continue;
        if (ch.type === 'choix') ch.ecrire(cm, valeur as string);
        if (ch.type === 'nombre') ch.ecrire(cm, valeur as number);
        if (ch.type === 'case') ch.ecrire(cm, valeur as boolean);
      }
      expect(parDepart.construction, p.libelle).toEqual(aLaMain.construction);
      expect(bom(parDepart), p.libelle).toBe(bom(aLaMain));
    }
  });

  it('« Exotique sur plots » pose une lame d ipe de 21 mm et sa raideur', () => {
    const obj = terrasse({ typePose: 'vis-fondation' });
    const cx = contexte(obj);
    appliquerPrereglage(cx, parCommande('terrasse.prereglage.exotiquePlots'), () => champs(cx));
    expect([obj.construction!.essenceBois, obj.construction!.largeurLame, obj.construction!.epaisseurLame]).toEqual(['exotique', 145, 21]);
    expect(prereglageEnPlace(cx, champs(cx))?.libelle).toBe('Exotique sur plots');
  });

  it('dit sous la ligne lequel est en place, ou que les reglages sont personnalises', () => {
    const obj = terrasse({ typePose: 'vis-fondation', essenceBois: 'douglas' });
    const cx = contexte(obj);
    const ligne = trouver(cx, 'prereglages')!;
    expect(ligne.note!(cx)).toBe('réglages personnalisés');
    appliquerPrereglage(cx, parCommande('terrasse.prereglage.pinVis'), () => champs(cx));
    expect(ligne.note!(cx)).toBe('en place : pin sur vis');
  });
});
