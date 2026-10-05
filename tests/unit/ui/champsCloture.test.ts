import { describe, it, expect, beforeEach } from 'vitest';
import { sectionsCloture, reinitialiserChoixCloture } from '../../../src/ui/champs/cloture.js';
import { champsVisibles, type Champ, type ChampBouton, type ChampCase, type ChampChoix, type ChampNombre, type ChampAlerte, type ContexteChamps } from '../../../src/ui/champs/types.js';
import { clotureDe } from '../../../src/model/cloture.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les sections Cloture et Portails de l'inspecteur (ui/champs/cloture.ts, MD/spec-cloture.md §3) :
// sur la parcelle du projet seule, les champs par type, les ecritures qui posent la structure.

function contexte(plus: Partial<ObjetPlan> = {}, principale = true): ContexteChamps {
  const obj = {
    key: principale ? 'parcelle' : 'v1', name: 'Parcelle', fonction: 'terrain', type: 'polygon',
    pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 0, y: 10 }],
    vertexNames: ['a', 'b', 'c', 'd'], segmentNames: ['Côté 1', 'Rue', 'Côté 3', 'Côté 4'], frozenVertices: [false, false, false, false],
    ...plus,
  } as unknown as ObjetPlan;
  const parcelle = principale ? obj : ({ key: 'parcelle', fonction: 'terrain', type: 'polygon', pts: [] } as unknown as ObjetPlan);
  let rendus = 0;
  return { etat: { objects: [obj], highlight: {} }, obj, objets: [obj], parcelle, render: () => { rendus++; }, rendus: () => rendus } as unknown as ContexteChamps;
}
const section = (c: ContexteChamps, id: string) => sectionsCloture(c).find(s => s.id === id);
const cles = (c: ContexteChamps, id: string) => { const s = section(c, id); return s ? champsVisibles(s, c).map(ch => ch.cle) : []; };
const champ = <T extends Champ>(c: ContexteChamps, id: string, cle: string): T => {
  const ch = section(c, id)?.champs.find(x => x.cle === cle);
  if (!ch) throw new Error(cle);
  return ch as T;
};
const bouton = (c: ContexteChamps, id: string, ligne: string, cle: string): ChampBouton => {
  const l = section(c, id)?.champs.find(x => x.cle === ligne);
  const b = l && l.type === 'ligne' ? l.champs.find(x => x.cle === cle) : undefined;
  if (!b) throw new Error(ligne + '/' + cle);
  return b as ChampBouton;
};

beforeEach(reinitialiserChoixCloture);

describe('section Cloture', () => {
  it('existe sur la parcelle du projet seule', () => {
    expect(sectionsCloture(contexte()).map(s => s.id)).toEqual(['cloture', 'portails']);
    expect(sectionsCloture(contexte({}, false))).toEqual([]);
  });

  it('ne montre que la case tant que la cloture est inactive, puis les cotes et le reglage par defaut', () => {
    const c = contexte();
    expect(cles(c, 'cloture')).toEqual(['active']);
    expect(cles(c, 'portails')).toEqual([]);
    champ<ChampCase>(c, 'cloture', 'active').ecrire(c, true);
    expect(c.obj.cloture?.active).toBe(true);
    expect(c.obj.clotureActive).toBe(true);
    expect(cles(c, 'cloture')).toEqual(['active', 'hauteurMaxRue', 'hauteurMaxSeparative', 'cote0', 'cote1', 'cote2', 'cote3', 'enCours', 'type', 'hauteur', 'couleur', 'texture', 'lames', 'occultante', 'soubassement']);
    expect(cles(c, 'portails')).toEqual(['ajouterPortail', 'ajouterPortillon']);
  });

  it('les champs suivent le type du reglage en cours', () => {
    const c = contexte({ clotureActive: true });
    const type = champ<ChampChoix>(c, 'cloture', 'type');
    type.ecrire(c, 'mur');
    expect(cles(c, 'cloture')).toEqual(expect.arrayContaining(['parement', 'epaisseur', 'couvertine']));
    expect(cles(c, 'cloture')).not.toContain('soubassement');
    type.ecrire(c, 'haie');
    expect(cles(c, 'cloture')).toEqual(expect.arrayContaining(['essence', 'epaisseur', 'taillee', 'soubassement']));
    champ<ChampCase>(c, 'cloture', 'soubassement').ecrire(c, true);
    expect(cles(c, 'cloture')).toEqual(expect.arrayContaining(['soubassementHauteur', 'soubassementParement', 'soubassementCouleur', 'soubassementTexture']));
    expect(c.obj.cloture?.defaut.soubassement).toMatchObject({ hauteur: 0.5, parement: 'enduit' });
    // Les anciens champs suivent le defaut.
    expect(c.obj.clotureHauteur).toBe(1.8);
    expect(c.obj.clotureCouleur).toBe('#4f7a3a');
  });

  it('Regler donne au cote son reglage propre et le met en cours ; Comme le defaut le retire', () => {
    const c = contexte({ clotureActive: true });
    bouton(c, 'cloture', 'cote1', 'regler').executer(c);
    expect(c.obj.cloture?.cotes.map(x => x.cote)).toEqual([1]);
    expect(champ<ChampChoix>(c, 'cloture', 'enCours').lire(c)).toBe('1');
    expect(cles(c, 'cloture')).toEqual(expect.arrayContaining(['limite', 'mitoyenne']));
    champ<ChampChoix>(c, 'cloture', 'limite').ecrire(c, 'rue');
    champ<ChampChoix>(c, 'cloture', 'type').ecrire(c, 'mur');
    champ<ChampNombre>(c, 'cloture', 'hauteur').ecrire(c, 2.4);
    expect(c.obj.cloture?.cotes[0]).toMatchObject({ cote: 1, limite: 'rue', type: 'mur', hauteur: 2.4 });
    expect(c.obj.cloture?.defaut.type).toBe('palissade');
    expect(champ<ChampChoix>(c, 'cloture', 'enCours').options(c).map(o => o.libelle)[1]).toContain('Côté 2 « Rue »');
    // La hauteur maximale sur rue, depassee : une alerte.
    champ<ChampNombre>(c, 'cloture', 'hauteurMaxRue').ecrire(c, 2);
    expect(cles(c, 'cloture')).toContain('alerteHauteur');
    expect(champ<ChampAlerte>(c, 'cloture', 'alerteHauteur').texte(c)).toContain('côté 2');
    bouton(c, 'cloture', 'cote1', 'retirer').executer(c);
    expect(c.obj.cloture?.cotes).toEqual([]);
    expect(champ<ChampChoix>(c, 'cloture', 'enCours').lire(c)).toBe('');
  });
});

describe('section Portails et portillons', () => {
  it('ajoute un portail sur le cote sur rue, et le regle', () => {
    const c = contexte({ clotureActive: true });
    bouton(c, 'cloture', 'cote1', 'regler').executer(c);
    champ<ChampChoix>(c, 'cloture', 'limite').ecrire(c, 'rue');
    champ<ChampBouton>(c, 'portails', 'ajouterPortail').executer(c);
    const cl = clotureDe(c.obj);
    expect(cl.portails).toHaveLength(1);
    expect(cl.portails[0]).toMatchObject({ nature: 'portail', cote: 1, x: 3.25 });
    expect(cles(c, 'portails')).toEqual(expect.arrayContaining(['acces0', 'cote', 'x', 'largeur', 'hauteur', 'ouverture', 'sens', 'petitVantail', 'forme', 'remplissage', 'materiau', 'couleur', 'texture', 'piliers', 'pilierLargeur', 'retrait', 'motorise', 'ouvert']));
    expect(cles(c, 'portails')).not.toContain('enCours');
    expect(cles(c, 'portails')).not.toContain('refoulement');
    champ<ChampChoix>(c, 'portails', 'ouverture').ecrire(c, 'coulissant');
    expect(cles(c, 'portails')).toContain('refoulement');
    expect(cles(c, 'portails')).not.toContain('sens');
    champ<ChampChoix>(c, 'portails', 'forme').ecrire(c, 'chapeau-de-gendarme');
    expect(cles(c, 'portails')).toContain('fleche');
    champ<ChampChoix>(c, 'portails', 'materiau').ecrire(c, 'bois');
    expect(cl.portails[0]?.couleur).toBe('#8a5a2b');
    champ<ChampCase>(c, 'portails', 'piliers').ecrire(c, false);
    expect(cles(c, 'portails')).not.toContain('pilierLargeur');
    // Un coulissant de 3,50 m a 3,25 m du bord gauche d'un cote de 10 m : pas de place a droite.
    expect(champ<ChampAlerte>(c, 'portails', 'alertes').texte(c)).toContain('se ranger à droite');
  });

  it('un portillon s accole au portail, et Supprimer le retire', () => {
    const c = contexte({ clotureActive: true });
    champ<ChampBouton>(c, 'portails', 'ajouterPortail').executer(c);
    champ<ChampBouton>(c, 'portails', 'ajouterPortillon').executer(c);
    const cl = clotureDe(c.obj);
    expect(cl.portails.map(a => a.nature)).toEqual(['portail', 'portillon']);
    expect(cles(c, 'portails')).toEqual(expect.arrayContaining(['enCours', 'accoler']));
    expect(champ<ChampChoix>(c, 'portails', 'enCours').lire(c)).toBe('1');
    bouton(c, 'portails', 'accoler', 'droite').executer(c);
    expect(cl.portails[1]?.x).toBeCloseTo(8.25 + 3.5 + 0.3 + 0.3, 6);
    // « Montrer ouvert » est un reglage d'affichage.
    const ouvert = champ<ChampCase>(c, 'portails', 'ouvert');
    expect(ouvert.sale).toBe(false);
    ouvert.ecrire(c, true);
    expect(cl.portails[1]?.ouvert).toBe(true);
    bouton(c, 'portails', 'acces0', 'supprimer').executer(c);
    expect(cl.portails.map(a => a.nature)).toEqual(['portillon']);
    expect(champ<ChampChoix>(c, 'portails', 'enCours').lire(c)).toBe('0');
  });
});
