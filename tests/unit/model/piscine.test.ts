import { describe, it, expect, vi } from 'vitest';
import { aParticularite, estPiscine, estTerrasse, estTrou, fonctionAdmise } from '../../../src/model/fonctions.js';
import { nouvellePiscine, nouveauTrou, creerCreation } from '../../../src/model/creation.js';
import { serializeObjects } from '../../../src/io/serialisation.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { sectionsObjet } from '../../../src/ui/champs/objet.js';
import { LIBELLE_FONCTION, elevationParDefaut } from '../../../src/model/defaults.js';
import type { ContexteCreation, EtatCreation } from '../../../src/model/creation.js';
import type { ContexteChamps } from '../../../src/ui/champs/types.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// La piscine : un polygone ou un cercle de fonction `piscine`, qui porte ses reglages dans `piscine`.

describe('fonction piscine', () => {
  it('a un sens sur un polygone et un cercle, pas sur un chemin', () => {
    expect(fonctionAdmise('piscine', 'polygon')).toBe(true);
    expect(fonctionAdmise('piscine', 'circle')).toBe(true);
    expect(fonctionAdmise('piscine', 'path')).toBe(false);
    const chemin = { key: 'c', fonction: 'piscine', type: 'path', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] } as unknown as ObjetPlan;
    expect(estPiscine(chemin)).toBe(false);
    expect(aParticularite(nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1).obj, 'bassin')).toBe(true);
    expect(estPiscine(nouvellePiscine('ronde', { x: 0, y: 0 }, 'p', 1).obj)).toBe(true);
    expect(LIBELLE_FONCTION.piscine).toBe('Piscine');
    expect(elevationParDefaut('piscine')).toBe(0);
  });
});

describe('creation', () => {
  it('naît en rectangle de 8 x 4 m ou en rond de 4 m, fonction piscine', () => {
    const { obj, onglet } = nouvellePiscine('rectangle', { x: 10, y: 20 }, 'p', 2);
    expect(obj.name).toBe('Piscine 2');
    expect(obj.fonction).toBe('piscine');
    expect(obj.type === 'polygon' && obj.pts).toEqual([{ x: 6, y: 18 }, { x: 14, y: 18 }, { x: 14, y: 22 }, { x: 6, y: 22 }]);
    expect(obj.frozenVertices).toEqual([true, true, true, true]);
    expect(onglet).toBe('objet');
    const ronde = nouvellePiscine('ronde', { x: 1, y: 1 }, 'c', 1).obj;
    expect(ronde.type === 'circle' && ronde.r).toBe(2);
    expect(ronde.type === 'circle' && ronde.center).toEqual({ x: 1, y: 1 });
  });

  it('se pose au centre de la parcelle, numerotee, et devient la selection', () => {
    const parcelle: ObjetPlan = { key: 'parcelle', name: 'P', type: 'polygon', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
    const etat: EtatCreation = { objects: [parcelle], selectedKey: null, terrasseSelectedKey: null, newObjCounter: 0 };
    const ctx = { pushHistory: vi.fn(), createObjectDOM: vi.fn(), rebuildHandles: vi.fn(), reapplyStackingOrder: vi.fn(), rebuildSelector: vi.fn(), render: vi.fn(), horloge: () => 1 } as unknown as ContexteCreation;
    const creation = creerCreation(etat, ctx);
    creation.ajouterPiscine('rectangle');
    creation.ajouterPiscine('ronde');
    const p = etat.objects[1]!, c = etat.objects[2]!;
    expect(p.name).toBe('Piscine 1');
    expect(p.type === 'polygon' && p.pts[0]).toEqual({ x: 6, y: 8 });
    expect(c.name).toBe('Piscine 2');
    expect(c.type).toBe('circle');
    expect(etat.selectedKey).toBe(c.key);
    expect(ctx.pushHistory).toHaveBeenCalledTimes(2);
  });
});

describe('enregistrement', () => {
  it('garde les reglages de la piscine, et rien pour un objet qui n\'en a pas', () => {
    const { obj } = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1);
    obj.piscine = { implantation: 'semi-enterree', hauteurHorsSol: 0.5, plage: 'terrasse-bois', prix: { margelles: 90 } };
    const [s] = serializeObjects([obj]);
    const [relu] = normalizeObjects([s!]);
    expect(relu!.piscine).toEqual({ implantation: 'semi-enterree', hauteurHorsSol: 0.5, plage: 'terrasse-bois', prix: { margelles: 90 } });
    expect(relu!.piscine).not.toBe(obj.piscine);
    const autre = { ...obj, key: 'o', fonction: 'autre' } as ObjetPlan;
    delete autre.piscine;
    expect('piscine' in serializeObjects([autre])[0]!).toBe(false);
  });
});

describe('inspecteur', () => {
  const contexte = (obj: ObjetPlan, objets: ObjetPlan[] = [obj]) => ({ obj, objets, elevationOf: () => 0, executerCommande: vi.fn() }) as unknown as ContexteChamps;

  it('ajoute les six etapes et les prix, sans l\'elevation', () => {
    const { obj } = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1);
    const c = contexte(obj);
    const sections = sectionsObjet(c);
    expect(sections.map(s => s.id)).toEqual(expect.arrayContaining(['piscine', 'profondeursPiscine', 'abordsPiscine', 'equipementsPiscine', 'securitePiscine', 'chiffragePiscine', 'prixPiscine']));
    expect(sections.find(s => s.id === 'piscine')!.titre).toMatch(/1\. Implantation/);
    const elevation = sections[0]!.champs.find(ch => ch.cle === 'elevation')!;
    expect(elevation.visible!(c)).toBe(false);
    const chiffrage = sections.find(s => s.id === 'chiffragePiscine')!;
    expect(chiffrage.champs.map(ch => ch.cle)).toEqual(expect.arrayContaining(['chiffrage-terrassement', 'chiffrage-coque', 'chiffrage-margelles', 'chiffrage-filtration', 'chiffrage-total']));
  });

  it('ne montre que ce qui a un sens : pas de pente sur un rond, pas de hauteur hors-sol enterree, pas d\'essence sans plage en bois', () => {
    const rond = nouvellePiscine('ronde', { x: 0, y: 0 }, 'c', 1).obj;
    const cr = contexte(rond);
    const profondeurs = sectionsObjet(cr).find(s => s.id === 'profondeursPiscine')!;
    expect(profondeurs.champs.find(ch => ch.cle === 'fond')!.visible!(cr)).toBe(false);
    const { obj } = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1);
    const c = contexte(obj);
    const implantation = sectionsObjet(c).find(s => s.id === 'piscine')!;
    expect(implantation.champs.find(ch => ch.cle === 'hauteurHorsSol')!.visible!(c)).toBe(false);
    expect(implantation.champs.find(ch => ch.cle === 'revetement')!.visible!(c)).toBe(false);
    const abords = sectionsObjet(c).find(s => s.id === 'abordsPiscine')!;
    expect(abords.champs.find(ch => ch.cle === 'essencePlage')!.visible!(c)).toBe(false);
    const plage = abords.champs.find(ch => ch.cle === 'plage')!;
    if (plage.type !== 'choix') throw new Error('choix attendu');
    plage.ecrire(c, 'terrasse-bois');
    expect(obj.piscine).toEqual({ plage: 'terrasse-bois' });
    expect(abords.champs.find(ch => ch.cle === 'essencePlage')!.visible!(c)).toBe(true);
  });

  it('change de structure en oubliant le revetement choisi pour l\'ancienne, et garde les prix saisis', () => {
    const { obj } = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1);
    obj.piscine = { structure: 'maconnerie', revetement: 'carrelage', prix: { margelles: 90 } };
    const c = contexte(obj);
    const structure = sectionsObjet(c).find(s => s.id === 'piscine')!.champs.find(ch => ch.cle === 'structure')!;
    if (structure.type !== 'choix') throw new Error('choix attendu');
    structure.ecrire(c, 'kit');
    expect(obj.piscine).toEqual({ structure: 'kit', prix: { margelles: 90 } });
    const prix = sectionsObjet(c).find(s => s.id === 'prixPiscine')!.champs.find(ch => ch.cle === 'prix-margelles')!;
    if (prix.type !== 'nombre') throw new Error('nombre attendu');
    expect(prix.lire(c)).toBe(90);
    expect(prix.note!(c)).toBe('saisi');
    prix.ecrire(c, 120);
    expect(obj.piscine.prix).toEqual({ margelles: 120 });
  });

  it('le bouton du dossier de mairie declenche sa commande', () => {
    const { obj } = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1);
    const c = contexte(obj);
    const bouton = sectionsObjet(c).find(s => s.id === 'securitePiscine')!.champs.find(ch => ch.cle === 'dossierMairie')!;
    if (bouton.type !== 'bouton') throw new Error('bouton attendu');
    expect(bouton.agit).toEqual({ commande: 'export.dossierPiscine' });
    bouton.executer(c);
    expect(c.executerCommande).toHaveBeenCalledWith('export.dossierPiscine');
  });
});

describe('terrasse autour du bassin et trou de terrasse', () => {
  const contexteCreation = () => ({ pushHistory: vi.fn(), createObjectDOM: vi.fn(), rebuildHandles: vi.fn(), reapplyStackingOrder: vi.fn(), rebuildSelector: vi.fn(), render: vi.fn(), horloge: () => 1 }) as unknown as ContexteCreation;

  it('pose une terrasse liee, coins libres, en un seul instantane, et la selectionne', async () => {
    const { constructionTerrasseNeuve } = await import('../../../src/engine/construction.js');
    const { obj: p } = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1);
    const etat: EtatCreation = { objects: [p], selectedKey: 'p', terrasseSelectedKey: null, newObjCounter: 0 };
    const ctx = contexteCreation();
    const creation = creerCreation(etat, ctx);
    creation.ajouterTerrasseAutour(p, [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 4 }, { x: -6, y: 4 }], constructionTerrasseNeuve());
    const t = etat.objects[1]!;
    expect(t).toMatchObject({ name: 'Terrasse de Piscine 1', fonction: 'terrasse', priority: 1 });
    expect(t.frozenVertices).toEqual([false, false, false, false]);
    expect(t.construction?.typePose).toBe('plots');
    expect(p.piscine).toEqual({ plage: 'terrasse', terrasseKey: t.key });
    expect(etat.selectedKey).toBe(t.key);
    expect(ctx.pushHistory).toHaveBeenCalledTimes(1);
    expect(estTerrasse(t)).toBe(true);
    creation.selectionner('p');
    expect(etat.selectedKey).toBe('p');
  });

  it('pose un trou numerote au centre de la terrasse', () => {
    const t: ObjetPlan = { key: 't', name: 'T', type: 'polygon', fonction: 'terrasse', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] };
    const etat: EtatCreation = { objects: [t], selectedKey: 't', terrasseSelectedKey: 't', newObjCounter: 0 };
    const creation = creerCreation(etat, contexteCreation());
    creation.ajouterTrou(t);
    creation.ajouterTrou(t);
    const [a, b] = [etat.objects[1]!, etat.objects[2]!];
    expect(a.name).toBe('Trou 1');
    expect(b.name).toBe('Trou 2');
    expect(estTrou(a)).toBe(true);
    expect(a.type === 'polygon' && a.pts[0]).toEqual({ x: 1.4, y: 1.4 });
    expect(fonctionAdmise('tremie', 'circle')).toBe(true);
    expect(fonctionAdmise('tremie', 'path')).toBe(false);
    expect(LIBELLE_FONCTION.tremie).toBe('Trou de terrasse');
    expect(elevationParDefaut('tremie')).toBe(0);
    expect(nouveauTrou({ x: 0, y: 0 }, 'k', 3).obj.frozenVertices).toEqual([false, false, false, false]);
  });
});

describe('inspecteur : la plage en terrasse du plan', () => {
  const contexte = (obj: ObjetPlan, objets: ObjetPlan[] = [obj]) => ({ obj, objets, elevationOf: () => 0, executerCommande: vi.fn() }) as unknown as ContexteChamps;
  const abords = (c: ContexteChamps) => sectionsObjet(c).find(s => s.id === 'abordsPiscine')!;

  it('propose la terrasse du plan, et l\'ancienne plage calculee seulement a qui l\'a', () => {
    const { obj } = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1);
    const c = contexte(obj);
    const plage = abords(c).champs.find(ch => ch.cle === 'plage')!;
    if (plage.type !== 'choix') throw new Error('choix attendu');
    expect(plage.options(c).map(o => o.valeur)).toEqual(['aucune', 'terrasse', 'dallage']);
    obj.piscine = { plage: 'terrasse-bois' };
    expect(plage.options(c).map(o => o.valeur)).toEqual(['aucune', 'terrasse', 'dallage', 'terrasse-bois']);
  });

  it('choisir la terrasse la fait poser ; le bouton la cree ou la selectionne', () => {
    const { obj } = nouvellePiscine('rectangle', { x: 0, y: 0 }, 'p', 1);
    const c = contexte(obj);
    const plage = abords(c).champs.find(ch => ch.cle === 'plage')!;
    if (plage.type !== 'choix') throw new Error('choix attendu');
    plage.ecrire(c, 'terrasse');
    expect(obj.piscine).toEqual({ plage: 'terrasse' });
    expect(c.executerCommande).toHaveBeenCalledWith('objet.terrassePiscine');
    const bouton = abords(c).champs.find(ch => ch.cle === 'boutonTerrassePlage')!;
    if (bouton.type !== 'bouton') throw new Error('bouton attendu');
    expect(bouton.agit).toEqual({ commande: 'objet.terrassePiscine' });
    expect(bouton.texte!(c)).toBe('Poser la terrasse autour du bassin');
    const t: ObjetPlan = { key: 't', name: 'Terrasse de Piscine 1', type: 'polygon', fonction: 'terrasse', pts: [{ x: -6, y: -4 }, { x: 6, y: -4 }, { x: 6, y: 4 }, { x: -6, y: 4 }] };
    obj.piscine = { plage: 'terrasse', terrasseKey: 't' };
    const c2 = contexte(obj, [obj, t]);
    expect(bouton.texte!(c2)).toBe('Sélectionner la terrasse');
    const lecture = abords(c2).champs.find(ch => ch.cle === 'terrassePlage')!;
    if (lecture.type !== 'lecture') throw new Error('lecture attendue');
    expect(lecture.valeur(c2)).toMatch(/« Terrasse de Piscine 1 » — .* m² de platelage/);
    // La largeur ne sert plus une fois la terrasse posee, la couleur n'a jamais servi.
    expect(abords(c2).champs.find(ch => ch.cle === 'largeurPlage')!.visible!(c2)).toBe(false);
    expect(abords(c2).champs.find(ch => ch.cle === 'couleurPlage')!.visible!(c2)).toBe(false);
  });

  it('un objet qui devient terrasse est pose sur plots, sans toucher a une construction existante', () => {
    const o: ObjetPlan = { key: 'o', name: 'O', type: 'polygon', fonction: 'autre', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }] };
    const c = contexte(o);
    const fonction = sectionsObjet(c)[0]!.champs.find(ch => ch.cle === 'fonction')!;
    if (fonction.type !== 'choix') throw new Error('choix attendu');
    fonction.ecrire(c, 'terrasse');
    expect(o.construction?.typePose).toBe('plots');
    o.construction = { typePose: 'vis-fondation' };
    fonction.ecrire(c, 'autre'); fonction.ecrire(c, 'terrasse');
    expect(o.construction.typePose).toBe('vis-fondation');
    expect(fonction.options(c).some(x => x.valeur === 'tremie')).toBe(true);
  });
});
