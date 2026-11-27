import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Le panneau du mode Toit, pose sur la scene 3D (2 novembre 2026) : au telephone, des qu'un element pose faisait deborder le panneau, la
// vue de facade restait vide au-dessus de lui. Un bloc qui defile, au fond opaque, est compose a part par Chromium et tenu pour opaque :
// le canevas WebGL qu'il recouvre en partie etait ecarte de l'image entiere. Le panneau garde son fond et ne defile pas ; ce qui defile
// est dedans, transparent (`.defilementToit`). Le point 124 de la fumee mesure l'image ; ce test garde la regle dans la feuille.

const css = readFileSync(resolve(__dirname, '../../../src/styles/app.css'), 'utf8');
const tsx = readFileSync(resolve(__dirname, '../../../src/zones/vue3d/ModeToit.tsx'), 'utf8');

/** Les regles de la feuille : selecteur et declarations, sans les commentaires. */
const regles = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selecteur: (m[1] ?? '').trim(), corps: m[2] ?? '' }));
/** Les regles qui visent l'element lui-meme (pas un descendant, ni un pseudo-element). */
const sur = (classe: string) => regles.filter((r) => r.selecteur.split(',').some((s) => new RegExp('\\.' + classe + '(\\.[\\w-]+|\\[[^\\]]*\\])*$').test(s.trim())));
const defile = (corps: string) => /overflow(-[xy])?\s*:\s*(auto|scroll)/.test(corps);

describe('le panneau du mode Toit sur la scene 3D', () => {
  it('ne defile dans aucune classe d ecran : il garde son fond opaque et coupe ce qui depasse', () => {
    const panneau = sur('panneauToit');
    expect(panneau.length).toBeGreaterThan(2);
    expect(panneau.filter((r) => defile(r.corps)).map((r) => r.selecteur)).toEqual([]);
    expect(panneau.some((r) => /overflow\s*:\s*hidden/.test(r.corps) && /background\s*:/.test(r.corps))).toBe(true);
  });

  it('ce qui defile est dedans, sans fond (un defilement transparent n est pas tenu pour opaque)', () => {
    const interieur = sur('defilementToit');
    expect(interieur.some((r) => /overflow\s*:\s*auto/.test(r.corps))).toBe(true);
    expect(interieur.filter((r) => /background/.test(r.corps)).map((r) => r.selecteur)).toEqual([]);
  });

  it('tout le contenu du panneau, hors la languette et le pied, est dans le defilement', () => {
    const debut = tsx.indexOf('className={\'panneauToit\''), fin = tsx.lastIndexOf('</>');
    const panneau = tsx.slice(debut, fin);
    const apresLanguette = panneau.slice(panneau.indexOf('</button>') + '</button>'.length);
    // Le premier element ouvert apres la languette est le defilement ; le titre, les reglages et « Plus de reglages » sont dedans.
    expect(apresLanguette.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trimStart().startsWith('<div className="defilementToit">')).toBe(true);
    const pied = panneau.indexOf('className="piedToit"');
    for (const dedans of ['intentionToit', '<ModifierSimple', '<AjouterSimple', 'className="plusToit"', '<BarreSession', '<CatalogueToit']) {
      expect(panneau.indexOf(dedans), dedans).toBeGreaterThan(panneau.indexOf('defilementToit'));
      expect(panneau.indexOf(dedans), dedans).toBeLessThan(pied);
    }
    // Le pied (Annuler, Valider, « Poser la lucarne ») ne defile pas : il reste sous le pouce, et il n'a pas de defilement a lui.
    expect(pied).toBeGreaterThan(panneau.indexOf('</details>'));
    expect(sur('piedToit').filter((r) => defile(r.corps)).map((r) => r.selecteur)).toEqual([]);
  });

  it('« Plus de reglages » est replie a l ouverture : un <details> pilote par un etat qui part de faux et y revient a chaque session', () => {
    expect(tsx).toMatch(/const \[plus, setPlus\] = useState\(false\)/);
    expect(tsx).toMatch(/if \(!enSession\) setPlus\(false\)/);
    expect(tsx).toMatch(/<details className="plusToit" open=\{plus\}/);
    expect(tsx).toContain('<summary>Plus de réglages</summary>');
  });

  it('les cibles du parcours simple font 48 px', () => {
    for (const classe of ['boutonPas', 'boutonPied', 'boutonTourner']) {
      expect(sur(classe).some((r) => /(min-)?height\s*:\s*48px/.test(r.corps)), classe).toBe(true);
    }
    expect(regles.some((r) => /\.plusToit > summary$/.test(r.selecteur) && /min-height\s*:\s*48px/.test(r.corps))).toBe(true);
  });
});
