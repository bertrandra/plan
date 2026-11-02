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

  it('tout le contenu du panneau, hors la languette, est dans le defilement', () => {
    const debut = tsx.indexOf('className={\'panneauToit\''), fin = tsx.indexOf('</>', debut);
    const panneau = tsx.slice(debut, fin);
    const apresLanguette = panneau.slice(panneau.indexOf('</button>') + '</button>'.length);
    // Le premier element ouvert apres la languette est le defilement ; la barre et le catalogue sont apres lui.
    expect(apresLanguette.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').trimStart().startsWith('<div className="defilementToit">')).toBe(true);
    expect(panneau.indexOf('defilementToit')).toBeLessThan(panneau.indexOf('barreToit'));
    expect(panneau.indexOf('defilementToit')).toBeLessThan(panneau.indexOf('toitCatalogue'));
  });
});
