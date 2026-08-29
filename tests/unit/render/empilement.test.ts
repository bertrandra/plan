import { describe, it, expect } from 'vitest';
import { parPriorite, reculerObjet, reappliquerEmpilement, amenerPoigneesDevant } from '../../../src/render/empilement.js';

// Deux niveaux se superposent, et les confondre est la faute a eviter : la priorite classe
// grossierement, l'ordre du tableau n'affine qu'a l'interieur d'un meme niveau.

function objet(key: string, priority?: number) {
  return { key, priority, type: 'polygon' };
}

describe('classement par priorite', () => {
  it('range du plus petit au plus grand', () => {
    const l = [objet('c', 3), objet('a', 1), objet('b', 2)].sort(parPriorite);
    expect(l.map(o => o.key)).toEqual(['a', 'b', 'c']);
  });

  it('traite une priorite absente comme zero', () => {
    const l = [objet('avec', 2), objet('sans')].sort(parPriorite);
    expect(l.map(o => o.key)).toEqual(['sans', 'avec']);
  });
});

describe('reculer un objet', () => {
  it('echange avec le precedent de MEME priorite', () => {
    const l = [objet('a', 1), objet('b', 1), objet('c', 1)];
    expect(reculerObjet(l[2], l)).toBe(true);
    expect(l.map(o => o.key)).toEqual(['a', 'c', 'b']);
  });

  it('saute par-dessus un voisin d une autre priorite', () => {
    // Echanger avec le voisin immediat n'aurait AUCUN effet visible une fois le tri refait : le
    // double-clic paraitrait casse.
    const l = [objet('a', 1), objet('autreNiveau', 5), objet('c', 1)];
    expect(reculerObjet(l[2], l)).toBe(true);
    expect(l.map(o => o.key)).toEqual(['c', 'autreNiveau', 'a']);
  });

  it('ne fait rien quand l objet est deja le plus en arriere de son niveau', () => {
    const l = [objet('a', 1), objet('b', 2)];
    expect(reculerObjet(l[0], l)).toBe(false);
    expect(l.map(o => o.key)).toEqual(['a', 'b']);
  });

  it('refuse de reculer la parcelle : elle est le fond du plan', () => {
    const l = [objet('x', 1), objet('parcelle', 1)];
    expect(reculerObjet(l[1], l)).toBe(false);
    expect(l.map(o => o.key)).toEqual(['x', 'parcelle']);
  });

  it('ne prend jamais la parcelle comme partenaire d echange', () => {
    // Sans cette garde, le premier recul enverrait un objet derriere le terrain, ou il disparait.
    const l = [objet('parcelle', 1), objet('a', 1)];
    expect(reculerObjet(l[1], l)).toBe(false);
    expect(l.map(o => o.key)).toEqual(['parcelle', 'a']);
  });

  it('ne fait rien sans objet', () => {
    expect(reculerObjet(null, [])).toBe(false);
  });

  it('se repete : deux reculs successifs traversent deux voisins', () => {
    const l = [objet('a', 1), objet('b', 1), objet('c', 1)];
    reculerObjet(l[2], l);
    reculerObjet(l.find(o => o.key === 'c'), l);
    expect(l.map(o => o.key)).toEqual(['c', 'a', 'b']);
  });
});

/** Une racine SVG et des vues qui n'enregistrent que l'ordre des ajouts. */
function scene() {
  const ordre: string[] = [];
  const svg = { appendChild: (el: { nom: string }) => ordre.push(el.nom) };
  const vue = (o) => ({
    el: { nom: o.key + '.forme' }, nameEl: { nom: o.key + '.nom' },
    edgeEls: [{ nom: o.key + '.cote' }], segLabelEls: [{ nom: o.key + '.libCote' }],
    pointEls: [{ nom: o.key + '.point' }], ptLabelEls: [{ nom: o.key + '.libPoint' }]
  });
  return { ordre, ctx: { svg, vue } };
}

describe('repeindre le plan', () => {
  it('peint dans l ordre des priorites, le plus grand en dernier donc devant', () => {
    const { ordre, ctx } = scene();
    reappliquerEmpilement([objet('devant', 5), objet('derriere', 1)], ctx);
    expect(ordre[0]).toBe('derriere.forme');
    expect(ordre[ordre.length - 1]).toBe('devant.libPoint');
  });

  it('ne touche pas au tableau qu on lui donne', () => {
    const { ctx } = scene();
    const l = [objet('b', 5), objet('a', 1)];
    reappliquerEmpilement(l, ctx);
    expect(l.map(o => o.key)).toEqual(['b', 'a']);
  });
});

describe('remonter les seules poignees', () => {
  it('laisse la forme et l etiquette ou elles sont', () => {
    // C'est toute la distinction : selectionner rend les poignees attrapables, sans contredire la
    // priorite d'affichage.
    const { ordre, ctx } = scene();
    amenerPoigneesDevant(objet('a', 1), ctx);
    expect(ordre).toEqual(['a.cote', 'a.libCote', 'a.point', 'a.libPoint']);
    expect(ordre).not.toContain('a.forme');
  });

  it('remonte la poignee de rayon d un cercle', () => {
    const ordre: string[] = [];
    const ctx = {
      svg: { appendChild: (el: { nom: string }) => ordre.push(el.nom) },
      vue: () => ({ el: { nom: 'f' }, nameEl: { nom: 'n' }, radiusHandle: { nom: 'rayon' } })
    };
    amenerPoigneesDevant({ key: 'c', type: 'circle' }, ctx);
    expect(ordre).toEqual(['rayon']);
  });
});
