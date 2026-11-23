import { describe, it, expect } from 'vitest';
import { champsVisibles } from '../../../src/ui/champs/types.js';
import { sectionsConstruction } from '../../../src/ui/champs/construction.js';
import { creerInspecteur, type ContexteInspecteur } from '../../../src/app/inspecteur.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { familleDeSection } from '../../../src/ui/champs/sections.js';
import { constructionTerrasseNeuve, defaultConstruction } from '../../../src/engine/construction.js';
import type { EtatApp } from '../../../src/core/state.js';
import type { Construction, ObjetPlan } from '../../../src/model/types.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';

// La terrasse se regle par etapes, comme une piscine : numerotees dans l'ordre ou l'on decide,
// chacune ne montrant que ce qui a un sens apres les precedentes.

const terrasse = (construction: Construction): ObjetPlan => ({
  key: 't', name: 'Terrasse', type: 'polygon', fonction: 'terrasse', construction,
  pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]
} as unknown as ObjetPlan);
const contexte = (obj: ObjetPlan): ContexteChamps => ({
  obj, objets: [obj], construction: () => obj.construction!, elevationOf: () => 0,
  etat: { objects: [obj], highlight: {} }, executerCommande: () => {}, commandeUtilisable: () => true
} as unknown as ContexteChamps);
const visibles = (c: ContexteChamps, id: string) => sectionsConstruction(c).find(s => s.id === id)!.champs
  .filter(ch => !ch.visible || ch.visible(c)).map(ch => ch.cle);

describe('les etapes d\'une terrasse', () => {
  it('se rangent en trois groupes, les parametres de calcul replies a la fin', () => {
    const sections = sectionsConstruction();
    expect(sections.map(s => s.id)).toEqual(['implantation', 'lames', 'structure', 'parametres']);
    expect(sections.map(s => s.titre)).toEqual(['Terrasse · Forme et niveau', 'Lames et finitions', 'Structure et appuis', 'Paramètres de calcul']);
    expect(sections.filter(s => s.repliee).map(s => s.id)).toEqual(['parametres']);
    expect(sections.filter(s => s.expert).map(s => s.id)).toEqual(['parametres']);
    expect(sections.map(s => familleDeSection(s.id))).toEqual(Array(4).fill('reglages'));
  });

  it('chaque groupe ne montre que ce qui decoule des choix precedents', () => {
    const plots = contexte(terrasse(constructionTerrasseNeuve()));
    const vis = contexte(terrasse({ ...defaultConstruction(), typePose: 'vis-fondation' }));
    // Le niveau, puis ce qui perce la terrasse.
    expect(visibles(plots, 'implantation')).toEqual(['poseDecaissee', 'listeOuvertures', 'ajouterTrou']);
    // Une vis est fondee : ni modele de plot, ni assise.
    expect(visibles(vis, 'structure').slice(0, 3)).toEqual(['typePose', 'hauteurVis', 'depassementVis']);
    expect(visibles(vis, 'structure')).not.toContain('plotModele');
    expect(visibles(plots, 'structure').slice(0, 7)).toEqual(['typePose', 'hauteurPlot', 'plotModele', 'supportType', 'supportDecaissement', 'plotSurfaceAssise', 'plotAvecSolives']);
    // Sur plots, la structure simple ou double se choisit avant les solives.
    expect(visibles(vis, 'structure')).not.toContain('plotAvecSolives');
    // Les entraxes des appuis : ceux de la vis ou ceux du plot, jamais les deux.
    expect(visibles(vis, 'structure')).toContain('visEntraxe');
    expect(visibles(vis, 'structure')).not.toContain('plotEntraxe');
    expect(visibles(plots, 'structure')).toContain('plotEntraxe');
    expect(visibles(plots, 'structure')).not.toContain('visEntraxe');
  });

  it('cache au mode simple les reglages du calcul, et eux seulement', () => {
    const plots = contexte(terrasse(constructionTerrasseNeuve()));
    const simple = { ...plots, modeSimple: true } as ContexteChamps;
    const cache = (id: string) => { const s = sectionsConstruction(simple).find(x => x.id === id)!; const tous = champsVisibles({ ...s, expert: false }, plots).map(c => c.cle); const vus = champsVisibles(s, simple).map(c => c.cle); return tous.filter(k => !vus.includes(k)); };
    expect(cache('implantation')).toEqual([]);
    expect(cache('lames')).toEqual(['coefRaideurLame']);
    expect(cache('structure')).toEqual(['plotSurfaceAssise', 'chargeNormale', 'chargeSpa', 'plotEntraxeAuto', 'visEntraxeZoneSpa', 'visMargeZoneSpa']);
    expect(champsVisibles(sectionsConstruction(simple).find(x => x.id === 'parametres')!, simple)).toEqual([]);
  });

  it('viennent apres « Objet », avant l\'apparence et la geometrie, comme celles d\'une piscine', () => {
    const obj = terrasse(constructionTerrasseNeuve());
    const etat = { objects: [obj], selectedKey: 't', lectureSeule: false } as unknown as EtatApp;
    const inspecteur = creerInspecteur(etat, {} as unknown as ContexteInspecteur, creerMagasin(etat), creerRegistre());
    const ids = inspecteur.sections(contexte(obj)).map(s => s.id);
    // Le meme ordre pour tous les objets (lot A6) : l'objet, ce qui lui est propre, son apparence, sa geometrie.
    expect(ids[0]).toBe('objet');
    expect(ids.indexOf('implantation')).toBe(1);
    expect(ids.indexOf('parametres')).toBeLessThan(ids.indexOf('apparence'));
    expect(ids.indexOf('parametres')).toBeLessThan(ids.indexOf('cotes'));
    expect(ids.slice(-2)).toEqual(['cotes', 'coins']);
  });
});
