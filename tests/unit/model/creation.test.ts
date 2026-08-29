import { describe, it, expect, vi } from 'vitest';
import {
  nouvelObjet, nouveauChemin, nouveauCercle, nouveauParasol, nouveauPointDeVue, creerCreation
} from '../../../src/model/creation.js';

const CENTRE = { x: 10, y: 20 };

describe('objet a quatre coins', () => {
  it('naît carre et libre par defaut', () => {
    const { obj, onglet } = nouvelObjet(CENTRE, 'k', false);
    expect(obj.pts).toEqual([{ x: 9, y: 19 }, { x: 11, y: 19 }, { x: 11, y: 21 }, { x: 9, y: 21 }]);
    expect(obj.frozenVertices).toEqual([false, false, false, false]);
    expect(onglet).toBe('segments');
  });

  it('naît rectangulaire et gele en mode rectangle', () => {
    // 3 x 2 m plutot qu'un carre : pour qu'on voie tout de suite que c'est un rectangle.
    const { obj, onglet } = nouvelObjet(CENTRE, 'k', true);
    expect(obj.pts[0]).toEqual({ x: 8.5, y: 19 });
    expect(obj.pts[1]).toEqual({ x: 11.5, y: 19 });
    expect(obj.frozenVertices).toEqual([true, true, true, true]);
    // L'onglet Objet porte la case du mode : c'est celle qu'il faudra decocher.
    expect(onglet).toBe('objet');
  });

  it('nomme ses coins et ses cotes', () => {
    const { obj } = nouvelObjet(CENTRE, 'k', false);
    expect(obj.vertexNames).toEqual(['Coin 1', 'Coin 2', 'Coin 3', 'Coin 4']);
    expect(obj.segmentNames).toEqual(['Cote 1', 'Cote 2', 'Cote 3', 'Cote 4']);
  });

  it('est tourne dans le sens des points, quel que soit le mode', () => {
    for (const rect of [false, true]) {
      const { obj } = nouvelObjet(CENTRE, 'k', rect);
      expect(obj.pts).toHaveLength(4);
      expect(obj.type).toBe('polygon');
      expect(obj.fonction).toBe('autre');
    }
  });
});

describe('les primitives detournees', () => {
  it('le parasol est un cercle, reconnu a sa fonction', () => {
    const { obj } = nouveauParasol(CENTRE, 'k', 1, null);
    expect(obj.type).toBe('circle');
    expect(obj.fonction).toBe('parasol');
    expect(obj.r).toBe(1.5);
    expect(obj.hauteurParasol).toBe(2.2);
  });

  it('le point de vue est un chemin, reconnu a sa fonction', () => {
    const { obj } = nouveauPointDeVue(CENTRE, 'k', 2);
    expect(obj.type).toBe('path');
    expect(obj.fonction).toBe('camera');
    expect(obj.vertexNames).toEqual(['Position', 'Direction']);
    expect(obj.altitude).toBe(1.6);
  });

  it('le point de vue ne montre pas ses cotes : ce n est pas une forme a mesurer', () => {
    const { obj } = nouveauPointDeVue(CENTRE, 'k', 1);
    expect(obj.showDims).toBe(false);
    expect(obj.constrained).toBe(false);
  });

  it('numerote parasols et points de vue', () => {
    expect(nouveauParasol(CENTRE, 'k', 3, null).obj.name).toBe('Parasol 3');
    expect(nouveauPointDeVue(CENTRE, 'k', 4).obj.name).toBe('Point de vue 4');
  });
});

describe('rattachement du parasol', () => {
  it('retient la terrasse qu on lui donne', () => {
    const t = { key: 't1', fonction: 'terrasse' };
    expect(nouveauParasol(CENTRE, 'k', 1, t).obj.terrasseLieeKey).toBe('t1');
  });

  it('ne se rattache pas a la parcelle faute de terrasse', () => {
    // Sans terrasse, le repli est la parcelle : elle sert de position, pas de rattachement.
    const p = { key: 'parcelle', fonction: 'terrain' };
    expect(nouveauParasol(CENTRE, 'k', 1, p).obj.terrasseLieeKey).toBeNull();
    expect(nouveauParasol(CENTRE, 'k', 1, null).obj.terrasseLieeKey).toBeNull();
  });
});

describe('chemin et cercle', () => {
  it('le chemin naît horizontal, de quatre metres', () => {
    const { obj } = nouveauChemin(CENTRE, 'k');
    expect(obj.pts).toEqual([{ x: 8, y: 20 }, { x: 12, y: 20 }]);
    expect(obj.width).toBe(1.2);
  });

  it('le cercle naît d un metre de rayon, sur le centre donne', () => {
    const { obj } = nouveauCercle(CENTRE, 'k');
    expect(obj.center).toEqual({ x: 10, y: 20 });
    expect(obj.r).toBe(1);
  });

  it('le centre du cercle est une copie, pas la reference donnee', () => {
    const centre = { x: 1, y: 2 };
    const { obj } = nouveauCercle(centre, 'k');
    obj.center.x = 99;
    expect(centre.x).toBe(1);
  });
});

/** Un objet du plan, decrit aussi lachement que le module lui-meme le fait. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ObjetTest = Record<string, any>;

/** Un plan minimal et des dependances qui ne font que compter leurs appels. */
function monter(objets: ObjetTest[] = [{ key: 'parcelle', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 4 }, { x: 0, y: 4 }] }]) {
  const etat = { objects: [...objets], selectedKey: null, attrTab: 'objet', terrasseSelectedKey: null, newObjCounter: 0 };
  const appels: string[] = [];
  const ctx = {
    pushHistory: () => appels.push('historique'),
    createObjectDOM: () => appels.push('dom'),
    rebuildHandles: () => appels.push('poignees'),
    reapplyStackingOrder: () => appels.push('empilement'),
    rebuildSelector: () => appels.push('selecteur'),
    render: () => appels.push('rendu'),
    detruireVue: () => appels.push('vue detruite'),
    serializeObjects: (o) => JSON.parse(JSON.stringify(o)),
    normalizeObjects: (b) => JSON.parse(JSON.stringify(b)),
    showToast: vi.fn(),
    showConfirm: (_m: string, oui: () => void) => oui()
  };
  return { etat, ctx, appels, c: creerCreation(etat, ctx) };
}

describe('poser un objet dans le plan', () => {
  it('fait les sept gestes, dans l ordre', () => {
    // Chacun est necessaire : en oublier un donne un objet invisible, ou selectionne sans poignees.
    const { c, appels } = monter();
    c.ajouterCercle();
    expect(appels).toEqual(['historique', 'dom', 'poignees', 'empilement', 'selecteur', 'rendu']);
  });

  it('selectionne l objet neuf', () => {
    const { c, etat } = monter();
    c.ajouterCercle();
    expect(etat.selectedKey).toBe(etat.objects[1].key);
  });

  it('naît au centre de la parcelle, pas a l origine du repere', () => {
    const { c, etat } = monter();
    c.ajouterCercle();
    expect(etat.objects[1].center).toEqual({ x: 2, y: 2 });
  });

  it('tombe sur l origine quand il n y a pas de parcelle', () => {
    const { c, etat } = monter([]);
    c.ajouterCercle();
    expect(etat.objects[0].center).toEqual({ x: 0, y: 0 });
  });

  it('donne une cle differente a chaque objet', () => {
    const { c, etat } = monter();
    c.ajouterCercle(); c.ajouterCercle(); c.ajouterCercle();
    const cles = etat.objects.slice(1).map(o => o.key);
    expect(new Set(cles).size).toBe(3);
  });
});

describe('un parasol naît sur sa terrasse', () => {
  const parcelle = { key: 'parcelle', fonction: 'terrain', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }] };
  const terrasse = { key: 't1', fonction: 'terrasse', pts: [{ x: 10, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 14 }, { x: 10, y: 14 }] };

  it('se pose au centre de la terrasse, pas de la parcelle', () => {
    // Au centre de la parcelle, il naîtrait loin de l'endroit ou on veut l'utiliser.
    const { c, etat } = monter([parcelle, terrasse]);
    c.ajouterParasol();
    expect(etat.objects[2].center).toEqual({ x: 12, y: 12 });
    expect(etat.objects[2].terrasseLieeKey).toBe('t1');
  });

  it('prefere la terrasse selectionnee', () => {
    const autre = { key: 't2', fonction: 'terrasse', pts: [{ x: 50, y: 50 }, { x: 54, y: 50 }, { x: 54, y: 54 }, { x: 50, y: 54 }] };
    const { c, etat } = monter([parcelle, terrasse, autre]);
    etat.terrasseSelectedKey = 't2';
    c.ajouterParasol();
    expect(etat.objects[3].terrasseLieeKey).toBe('t2');
  });

  it('retombe sur la parcelle quand il n y a aucune terrasse', () => {
    const { c, etat } = monter([parcelle]);
    c.ajouterParasol();
    expect(etat.objects[1].center).toEqual({ x: 50, y: 50 });
    expect(etat.objects[1].terrasseLieeKey).toBeNull();
  });

  it('numerote a partir des parasols deja poses', () => {
    const { c, etat } = monter([parcelle, terrasse]);
    c.ajouterParasol(); c.ajouterParasol();
    expect(etat.objects[2].name).toBe('Parasol 1');
    expect(etat.objects[3].name).toBe('Parasol 2');
  });
});

describe('dupliquer', () => {
  const carre = { key: 'a', name: 'Abri', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 2 }] };

  it('refuse sans selection, et le dit', () => {
    const { c, ctx, etat } = monter([carre]);
    c.dupliquer();
    expect(ctx.showToast).toHaveBeenCalled();
    expect(etat.objects).toHaveLength(1);
  });

  it('decale la copie de cinq metres vers l ouest', () => {
    // Sans decalage, la copie se poserait pile sur l'original et paraîtrait ne pas exister.
    const { c, etat } = monter([carre]);
    etat.selectedKey = 'a';
    c.dupliquer();
    expect(etat.objects[1].pts.map(p => p.x)).toEqual([-5, -3, -3]);
  });

  it('decale aussi un cercle, par son centre', () => {
    const { c, etat } = monter([{ key: 'c', name: 'Bac', type: 'circle', center: { x: 8, y: 3 }, r: 1 }]);
    etat.selectedKey = 'c';
    c.dupliquer();
    expect(etat.objects[1].center).toEqual({ x: 3, y: 3 });
  });

  it('nomme la copie et lui donne une cle neuve', () => {
    const { c, etat } = monter([carre]);
    etat.selectedKey = 'a';
    c.dupliquer();
    expect(etat.objects[1].name).toBe('Abri (copie)');
    expect(etat.objects[1].key).not.toBe('a');
  });
});

describe('supprimer', () => {
  const carre = { key: 'a', name: 'Abri', type: 'polygon', pts: [] };

  it('refuse sans selection', () => {
    const { c, ctx } = monter([carre]);
    c.supprimer();
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('Sélectionne'));
  });

  it('refuse de supprimer la parcelle, qui porte le repere du plan', () => {
    const { c, etat, ctx } = monter([{ key: 'parcelle', fonction: 'terrain', pts: [] }]);
    etat.selectedKey = 'parcelle';
    c.supprimer();
    expect(etat.objects).toHaveLength(1);
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('ne peut pas être supprimée'));
  });

  it('refuse un objet verrouille : le verrou sert exactement a ca', () => {
    const { c, etat, ctx } = monter([{ ...carre, locked: true }]);
    etat.selectedKey = 'a';
    c.supprimer();
    expect(etat.objects).toHaveLength(1);
    expect(ctx.showToast).toHaveBeenCalledWith(expect.stringContaining('verrouille'));
  });

  it('supprime apres confirmation, et demonte la vue', () => {
    const { c, etat, appels } = monter([carre]);
    etat.selectedKey = 'a';
    c.supprimer();
    expect(etat.objects).toHaveLength(0);
    expect(etat.selectedKey).toBeNull();
    expect(appels).toContain('vue detruite');
  });

  it('ne touche a rien tant que la confirmation n a pas repondu', () => {
    const { etat, ctx, appels } = monter([carre]);
    etat.selectedKey = 'a';
    creerCreation(etat, { ...ctx, showConfirm: () => {} }).supprimer();
    expect(etat.objects).toHaveLength(1);
    expect(appels).not.toContain('historique');
  });
});
