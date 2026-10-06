import { describe, it, expect } from 'vitest';
import { sectionsConstruction } from '../../../src/ui/champs/construction.js';
import { creerInspecteur, type ContexteInspecteur } from '../../../src/app/inspecteur.js';
import { creerMagasin } from '../../../src/app/magasin.js';
import { creerRegistre } from '../../../src/app/commandes.js';
import { familleDe } from '../../../src/zones/Inspecteur.js';
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
const optim = { visible: () => false };
const visibles = (c: ContexteChamps, id: string) => sectionsConstruction(optim, c).find(s => s.id === id)!.champs
  .filter(ch => !ch.visible || ch.visible(c)).map(ch => ch.cle);

describe('les etapes d\'une terrasse', () => {
  it('se suivent numerotees, les parametres de calcul replies a la fin', () => {
    const sections = sectionsConstruction(optim);
    expect(sections.map(s => s.id)).toEqual(['implantation', 'fondation', 'lames', 'structure', 'appuis', 'finitions', 'optimisation', 'parametres']);
    expect(sections.map(s => s.titre)).toEqual([
      'Terrasse · 1. Implantation et niveau', '2. Fondation et assise', '3. Lames et sens de pose', '4. Structure porteuse',
      '5. Appuis et charges', '6. Finitions du tour', '7. Optimisation', 'Paramètres de calcul'
    ]);
    expect(sections.filter(s => s.repliee).map(s => s.id)).toEqual(['parametres']);
    expect(sections.map(s => familleDe(s.id))).toEqual(Array(8).fill('construction'));
  });

  it('chaque etape ne montre que ce qui decoule des choix precedents', () => {
    const plots = contexte(terrasse(constructionTerrasseNeuve()));
    const vis = contexte(terrasse({ ...defaultConstruction(), typePose: 'vis-fondation' }));
    // 1. Le niveau, puis ce qui perce la terrasse.
    expect(visibles(plots, 'implantation')).toEqual(['poseDecaissee', 'listeOuvertures', 'ajouterTrou']);
    // 2. Une vis est fondee : ni modele de plot, ni assise.
    expect(visibles(vis, 'fondation')).toEqual(['typePose', 'hauteurVis', 'depassementVis']);
    expect(visibles(plots, 'fondation')).toEqual(['typePose', 'hauteurPlot', 'plotModele', 'supportType', 'supportDecaissement', 'plotSurfaceAssise']);
    // 4. Sur plots, la structure simple ou double se choisit avant les solives.
    expect(visibles(plots, 'structure')[0]).toBe('plotAvecSolives');
    expect(visibles(vis, 'structure')).not.toContain('plotAvecSolives');
    // 5. Les entraxes des appuis : ceux de la vis ou ceux du plot, jamais les deux.
    expect(visibles(vis, 'appuis')).toContain('visEntraxe');
    expect(visibles(vis, 'appuis')).not.toContain('plotEntraxe');
    expect(visibles(plots, 'appuis')).toContain('plotEntraxe');
    expect(visibles(plots, 'appuis')).not.toContain('visEntraxe');
  });

  it('viennent avant la geometrie dans l\'inspecteur, comme celles d\'une piscine', () => {
    const obj = terrasse(constructionTerrasseNeuve());
    const etat = { objects: [obj], selectedKey: 't', lectureSeule: false } as unknown as EtatApp;
    const inspecteur = creerInspecteur(etat, { optimisation: optim } as unknown as ContexteInspecteur, creerMagasin(etat), creerRegistre());
    const ids = inspecteur.sections(contexte(obj)).map(s => s.id);
    expect(ids.indexOf('implantation')).toBeGreaterThan(ids.indexOf('apparence'));
    expect(ids.indexOf('parametres')).toBeLessThan(ids.indexOf('cotes'));
    expect(ids.slice(-3)).toEqual(['cotes', 'coins', 'alignement']);
  });
});
