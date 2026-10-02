import { describe, it, expect } from 'vitest';
import { construireArbre, comparer, aplatir, compterFeuilles, echantillonsDecouverte, type SourceControleurs } from '../../../src/app/controleurs.js';
import { EXPOSITION } from '../../../src/app/exposition.js';
import type { Commande } from '../../../src/app/commandes.js';
import type { Section } from '../../../src/ui/champs/types.js';

// L'arbre des controleurs de l'ecran (MD/spec-demos-admin.md) : construit depuis ce que Plan a
// monte, compare a l'enregistrement sans rien perdre de ce qui a disparu.

const cmd = (id: string, libelle: string, groupe: Commande['groupe'], plus: Partial<Commande> = {}): Commande =>
  ({ id, libelle, groupe, executer: () => {}, ...plus });

const SECTION: Section = { id: 'geometrie', titre: 'Géométrie', champs: [
  { type: 'nombre', cle: 'hauteur', libelle: 'Hauteur', unite: 'm', lire: () => 0, ecrire: () => {} },
  { type: 'nombre', cle: 'angle', libelle: 'Angle 1', lire: () => 0, ecrire: () => {} },
  { type: 'nombre', cle: 'angle', libelle: 'Angle 2', lire: () => 0, ecrire: () => {} }
] };

function source(commandes: Commande[], sections: Section[] = [SECTION]): SourceControleurs {
  return { appVersion: '9.9.9', commandes, exposition: EXPOSITION, inspecteur: [{ cle: 'polygon.terrasse', nom: 'Terrasse', sections }] };
}

describe('arbre des controleurs', () => {
  it('range chaque commande sous les emplacements qui l exposent, avec cle et nom explicite', () => {
    const arbre = construireArbre(source([cmd('projet.enregistrer', 'Enregistrer', 'projet', { raccourci: 'Ctrl+S' })]));
    const tous = aplatir(arbre);
    const n = tous.get('plan/zones/Z1/menuFichier/projet.enregistrer');
    expect(n).toMatchObject({ cle: 'projet.enregistrer', nom: 'Enregistrer', genre: 'commande' });
    expect(n?.details).toMatchObject({ raccourci: 'Ctrl+S', classes: 'tablette, bureau' });
    expect(tous.get('plan/zones/clavier/clavier/projet.enregistrer')).toBeDefined();
    expect(tous.get('plan/commandes/projet/projet.enregistrer')?.nom).toBe('Enregistrer');
  });

  it('montre une commande que la carte d exposition ne connait pas', () => {
    const tous = aplatir(construireArbre(source([cmd('objet.inventee', 'Inventée', 'objet')])));
    expect(tous.get('plan/zones/nonExposees/objet.inventee')).toBeDefined();
  });

  it('decrit les champs de l inspecteur, et garde unique une cle repetee', () => {
    const tous = aplatir(construireArbre(source([])));
    expect(tous.get('plan/inspecteur/polygon.terrasse/geometrie/hauteur')?.details).toMatchObject({ type: 'nombre', unite: 'm' });
    expect(tous.get('plan/inspecteur/polygon.terrasse/geometrie/angle')?.nom).toBe('Angle 1');
    expect(tous.get('plan/inspecteur/polygon.terrasse/geometrie/angle#2')?.nom).toBe('Angle 2');
  });
});

describe('attributs declares', () => {
  it('commande : quota, refus selon les droits, conditionnelle, emplacements par classe', () => {
    const tous = aplatir(construireArbre(source([
      cmd('projet.nouveau', 'Nouveau projet', 'projet', { permission: 'projects.write', quota: 'projects', actif: () => true }),
      cmd('export.dossier', 'Dossier PDF', 'export', { capacite: 'plan.export.dossier', quota: () => null })
    ])));
    const nouveau = tous.get('plan/commandes/projet/projet.nouveau')?.details ?? {};
    expect(nouveau).toMatchObject({ quota: 'projects', conditionnelle: expect.stringMatching(/^oui/) });
    expect(nouveau.refus).toMatch(/grisée sans la permission/);
    expect(nouveau.refus).toMatch(/quota/);
    expect(nouveau.emplacements).toMatch(/téléphone \d+, tablette \d+, bureau \d+/);
    const cible = aplatir(construireArbre(source([cmd('mesure.supprimer', 'Supprimer la cote', 'mesure', { parametre: 'cote' })])));
    expect(cible.get('plan/commandes/mesure/mesure.supprimer')?.details?.cible).toMatch(/une cote/);
    const dossier = tous.get('plan/commandes/export/export.dossier')?.details ?? {};
    expect(dossier.quota).toBe('selon le contexte');
    expect(dossier.refus).toBe('effacée sans la capacité ; grisée au quota atteint, avec explication');
    expect(dossier.conditionnelle).toBeUndefined();
  });

  it('champ : precision, effets, ce qu il modifie, annulable, conditionnel', () => {
    const sec: Section = { id: 'structure', titre: 'Structure', repliee: true, explication: 'Les solives.', champs: [
      { type: 'nombre', cle: 'entraxe', libelle: 'Entraxe', unite: 'cm', min: 30, max: 80, pas: 5, decimales: 0, historique: true,
        effets: ['terrasse', 'scene3d'], visible: () => true, lire: () => 60, ecrire: () => {} },
      { type: 'case', cle: 'cotes', libelle: 'Afficher les cotes', sale: false, lire: () => true, ecrire: () => {} },
      { type: 'lecture', cle: 'surface', libelle: 'Surface', valeur: () => '12 m²' }
    ] };
    const tous = aplatir(construireArbre(source([], [sec])));
    expect(tous.get('plan/inspecteur/polygon.terrasse/structure')?.details).toEqual({ ouverture: 'repliée', explication: 'Les solives.' });
    expect(tous.get('plan/inspecteur/polygon.terrasse/structure/entraxe')?.details).toMatchObject({
      type: 'nombre', unite: 'cm', min: '30', max: '80', pas: '5', decimales: '0', modifie: 'le projet',
      annulable: expect.stringMatching(/^oui/), effets: expect.stringMatching(/terrasse.*3D/), conditionnel: expect.any(String)
    });
    expect(tous.get('plan/inspecteur/polygon.terrasse/structure/cotes')?.details?.modifie).toMatch(/affichage seulement/);
    expect(tous.get('plan/inspecteur/polygon.terrasse/structure/surface')?.details).toEqual({ type: 'lecture seule' });
  });

  it('liste de choix : ses valeurs permises sous elle, avec cle et libelle ; ligne : ses sous-champs', () => {
    const sec: Section = { id: 'lames', titre: 'Lames', champs: [
      { type: 'choix', cle: 'essence', libelle: 'Essence', options: () => [{ valeur: 'ipe', libelle: 'Ipé' }, { valeur: 'pin', libelle: 'Pin traité' }], lire: () => 'ipe', ecrire: () => {} },
      { type: 'ligne', cle: 'cote0', libelle: 'Côté 1', champs: [
        { type: 'nombre', cle: 'longueur', libelle: 'Longueur', lire: () => 1, ecrire: () => {} },
        { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', explication: 'Retire le sommet.', agit: 'interface', executer: () => {} }
      ] }
    ] };
    const src = source([], [sec]);
    const famille = src.inspecteur[0];
    if (famille) famille.optionsDe = (ch) => ch.options({} as never);
    const arbre = construireArbre(src);
    const tous = aplatir(arbre);
    expect(tous.get('plan/inspecteur/polygon.terrasse/lames/essence')?.details?.valeurs).toBe('2');
    expect(tous.get('plan/inspecteur/polygon.terrasse/lames/essence/pin')).toMatchObject({ nom: 'Pin traité', genre: 'option' });
    expect(tous.get('plan/inspecteur/polygon.terrasse/lames/cote0/supprimer')?.details?.explication).toBe('Retire le sommet.');
    expect(tous.get('plan/inspecteur/polygon.terrasse')?.nom).toBe('Terrasse — terrasse');
    // L'essence compte pour un, la ligne pour ses deux sous-champs.
    expect(compterFeuilles(tous.get('plan/inspecteur') ?? arbre)).toBe(3);
  });
});

describe('comparaison avec le registre enregistre', () => {
  const avant = construireArbre(source([cmd('projet.enregistrer', 'Enregistrer', 'projet'), cmd('projet.supprimer', 'Supprimer', 'projet')]));

  it('sans registre, tout est nouveau', () => {
    const c = comparer(null, avant);
    expect(c.nouveaux).toBe(aplatir(avant).size);
    expect(c.retires).toBe(0);
  });

  it('identique : aucun changement', () => {
    const c = comparer(avant, avant);
    expect(c.nouveaux + c.retires + c.modifies).toBe(0);
  });

  it('trouve le nouveau, le retire (garde a sa place) et le renomme', () => {
    const apres = construireArbre(source([cmd('projet.enregistrer', 'Enregistrer sous', 'projet'), cmd('projet.nouveau', 'Nouveau', 'projet')]));
    const c = comparer(avant, apres);
    expect(c.statuts.get('plan/commandes/projet/projet.nouveau')).toBe('nouveau');
    expect(c.statuts.get('plan/commandes/projet/projet.supprimer')).toBe('retire');
    expect(c.statuts.get('plan/commandes/projet/projet.enregistrer')).toBe('modifie');
    // Le retire reste dans l'arbre montre, sous son ancien parent.
    expect(aplatir(c.arbre).get('plan/commandes/projet/projet.supprimer')?.nom).toBe('Supprimer');
    expect(compterFeuilles(apres)).toBeLessThan(compterFeuilles(c.arbre));
  });
});

describe('echantillons de decouverte', () => {
  const objets = [
    { key: 't', type: 'polygon', fonction: 'terrasse' }, { key: 'a', type: 'polygon', fonction: 'autre', fill: '#123' },
    { key: 'c', type: 'path', fonction: 'chemin' }, { key: 'r', type: 'circle', fonction: 'arbre' }
  ] as never[];

  it('ajoute un objet par fonction absente, de la bonne forme, sans toucher aux objets donnes', () => {
    const e = echantillonsDecouverte(objets, ['terrasse', 'autre', 'chemin', 'arbre', 'mobilier', 'limite']);
    expect(e.map((o) => [o.key, o.type, o.fonction])).toEqual([
      ['decouverte-mobilier', 'polygon', 'mobilier'],
      ['decouverte-limite', 'path', 'limite']
    ]);
    // Le modele neutre (« autre ») est copie, pas la terrasse ; l'original n'est pas modifie.
    expect(e[0]?.fill).toBe('#123');
    expect(JSON.stringify(objets)).not.toContain('decouverte-');
  });

  it('ne rend rien quand toutes les fonctions sont la, ou sans modele de la bonne forme', () => {
    expect(echantillonsDecouverte(objets, ['terrasse', 'chemin'])).toEqual([]);
    expect(echantillonsDecouverte([{ key: 'x', type: 'circle', fonction: 'arbre' }] as never[], ['limite'])).toEqual([]);
  });
});

describe('branche « Écritures à surveiller »', () => {
  const section: Section = { id: 'objet', titre: 'Objet', champs: [
    { type: 'nombre', cle: 'hauteur', libelle: 'Hauteur', lire: () => 0, ecrire: () => {} },
    { type: 'texte', cle: 'nomCoin', libelle: 'Nom du coin', historique: false, lire: () => '', ecrire: () => {} },
    { type: 'case', cle: 'cotes', libelle: 'Afficher les cotes', sale: false, lire: () => true, ecrire: () => {} },
    { type: 'lecture', cle: 'aire', libelle: 'Aire', valeur: () => '1 m²' }
  ] };
  const ecrivain = { id: 'x.ecrire', libelle: 'Écrire sans droit', groupe: 'plu', ecrit: 'projet', executer: () => {} } as Commande;
  const permise = { id: 'x.permise', libelle: 'Écrire avec droit', groupe: 'plu', ecrit: 'projet', permission: 'projects.write', executer: () => {} } as Commande;
  const grille = { id: 'affichage.grille', libelle: 'Grille', groupe: 'affichage', ecrit: 'affichage', executer: () => {} } as Commande;
  const tous = aplatir(construireArbre({
    appVersion: '9', commandes: [ecrivain, permise, grille], exposition: EXPOSITION,
    inspecteur: [{ cle: 'polygon.terrasse', nom: 'Polygone', sections: [section] }, { cle: 'circle.arbre', nom: 'Cercle', sections: [section] }]
  }));
  const cles = (chemin: string) => (tous.get(chemin)?.enfants ?? []).map((n) => n.cle);

  it('range sans annulation les champs retires de l historique, une fois par cle, et les ecritures non annulables', () => {
    const l = cles('plan/ecritures/sansAnnulation');
    expect(l).toContain('champ:nomCoin');
    expect(l).not.toContain('champ:hauteur');
    expect(l).not.toContain('champ:cotes');
    expect(l).not.toContain('champ:aire');
    expect(l).toContain('controle:cadastre.creerProjet');
    expect(l).not.toContain('controle:texture.enregistrer');
    expect(l).toContain('commande:x.ecrire');
    expect(tous.get('plan/ecritures/sansAnnulation/champ:nomCoin')?.details?.sortes).toBe('2');
  });

  it('ne range sans controle des droits ni les champs ni les saisies du tiroir, refuses en lecture seule', () => {
    expect(cles('plan/ecritures/sansDroits')).toEqual(['commande:x.ecrire']);
  });

  it('dit sur le controle ce qu il ecrit et qui en garde les droits', () => {
    const controle = (k: string) => [...tous.values()].find((n) => n.cle === k && n.genre === 'controle');
    expect(controle('releve.valider')?.details).toMatchObject({ modifie: 'le projet', droits: 'ceux de la commande qui ouvre l’écran' });
    expect(controle('nomenclature.prix')?.details).toMatchObject({ annulable: 'oui (Annuler le défait)', droits: 'refusés en lecture seule' });
  });
});

describe('boutons de l inspecteur dans l arbre', () => {
  const section: Section = { id: 'cotes', titre: 'Côtés', champs: [
    { type: 'bouton', cle: 'supprimer', libelle: 'Supprimer', agit: 'projet', executer: () => {} },
    { type: 'bouton', cle: 'relever', libelle: 'Relever', agit: { commande: 'facade.relever' }, executer: () => {} },
    { type: 'bouton', cle: 'aller', libelle: 'Aller', agit: 'interface', executer: () => {} }
  ] };
  const tous = aplatir(construireArbre({ appVersion: '9', commandes: [], exposition: EXPOSITION, inspecteur: [{ cle: 'polygon.terrasse', nom: 'Polygone', sections: [section] }] }));
  const agit = (cle: string) => [...tous.values()].find((n) => n.genre === 'champ' && n.cle === cle)?.details?.agit;

  it('dit sur quoi chaque bouton agit', () => {
    expect(agit('supprimer')).toContain('refusé en lecture seule');
    expect(agit('relever')).toContain('facade.relever');
    expect(agit('aller')).toBe('l’interface seulement');
  });

  it('ne range pas dans les ecritures a surveiller un bouton qui porte son annulation et ses droits', () => {
    const ecritures = [...tous.keys()].filter((k) => k.startsWith('plan/ecritures/') && k.includes('champ:'));
    expect(ecritures).toEqual([]);
  });
});
