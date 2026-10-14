import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  FORMES_TOIT_SIMPLES, FORMES_TOIT_CATALOGUE, FORME_DESSINEE, estFormeSimple, estFormeToit, formeDessinee, toitDessine,
  boutsDuCorps, formeDuCorpsToit, formeDesCorps, formeDeLaVue,
} from '../../../src/model/formeToit.js';
import { AUTRES_FORMES, FORMES_COURANTES } from '../../../src/model/ceQueJeVois.js';
import { formeDuCorps } from '../../../src/facade/faitsToits.js';
import demo from '../../../src/model/demo-projet.json';
import type { CorpsToit, Toit } from '../../../src/model/types.js';

// La forme d'ensemble d'un toit, deduite de ses corps (MD/spec-regles-toits.md §3.1, §4).

// Un corps de 12 m le long du faitage sur 8 m de large, faitage au milieu a 9 m, egouts a 6 m.
const pts = [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 12, y: 8 }, { x: 0, y: 8 }];
const deuxPans: CorpsToit = { pts, posFaitage: 4, faitage: 9, egouts: [6, 6], pignons: [], ecart: 0.1 };
const brise = { type: 'brise' as const, largeurBrisisM: 1, hauteurBrisM: 8 };

describe('formeDuCorpsToit : un corps sans les champs de T§4 garde la forme d avant', () => {
  it('plat, appentis, deux pans, croupes', () => {
    expect(formeDuCorpsToit(deuxPans)).toBe('deux-pans');
    expect(formeDuCorpsToit({ ...deuxPans, faitage: 6.2 })).toBe('plat');
    expect(formeDuCorpsToit({ ...deuxPans, posFaitage: 0, egouts: [9, 6] })).toBe('appentis');
    expect(formeDuCorpsToit({ ...deuxPans, posFaitage: 8, egouts: [6, 9] })).toBe('appentis');
    expect(formeDuCorpsToit({ ...deuxPans, croupes: [3, 3] })).toBe('croupes');
    expect(formeDuCorpsToit({ ...deuxPans, croupes: [0, 3] })).toBe('croupes');
    expect(formeDuCorpsToit({ ...deuxPans, croupes: [0, 0] })).toBe('deux-pans');
  });

  it('dit la meme chose que la forme des faits sur chaque corps reel (releves de tests/fixtures/toits, projet de demonstration)', () => {
    const dossier = join(__dirname, '../../fixtures/toits');
    let n = 0;
    for (const f of readdirSync(dossier).filter((x) => x.endsWith('.json'))) {
      const d = JSON.parse(readFileSync(join(dossier, f), 'utf8')) as { corps?: CorpsToit[] };
      for (const c of d.corps ?? []) { expect(formeDuCorpsToit(c), f).toBe(formeDuCorps(c)); n++; }
    }
    for (const o of (demo as { objects: { name?: string; corpsToit?: CorpsToit[] }[] }).objects) {
      for (const c of o.corpsToit ?? []) { expect(formeDuCorpsToit(c), o.name).toBe(formeDuCorps(c)); n++; }
    }
    expect(n).toBeGreaterThan(50);
  });
});

describe('formeDuCorpsToit : les formes du catalogue', () => {
  it('profil brise : Mansart avec des brisis (ou des croupes) aux bouts, gambrel avec des pignons', () => {
    expect(formeDuCorpsToit({ ...deuxPans, profil: [brise, brise], bouts: [{ type: 'brisis', largeurM: 1 }, { type: 'brisis', largeurM: 1 }] })).toBe('mansart');
    expect(formeDuCorpsToit({ ...deuxPans, profil: [brise, brise], croupes: [1, 1] })).toBe('mansart');
    expect(formeDuCorpsToit({ ...deuxPans, profil: [brise, brise] })).toBe('gambrel');
    expect(formeDuCorpsToit({ ...deuxPans, profil: [brise, brise], bouts: [{ type: 'brisis', largeurM: 1 }, { type: 'pignon' }] })).toBe('gambrel');
  });

  it('profil courbe : berceau entre deux pignons, carene si un bout est ferme par un pan', () => {
    const courbe = { type: 'courbe' as const, flecheM: 0.8 };
    expect(formeDuCorpsToit({ ...deuxPans, profil: [courbe, courbe] })).toBe('berceau');
    expect(formeDuCorpsToit({ ...deuxPans, profil: [courbe, courbe], croupes: [3, 3] })).toBe('carene');
  });

  it('coyau : un pan retrousse, ou un bord observe en coyau', () => {
    const coyau = { type: 'coyau' as const, largeurM: 0.8, penteDeg: 20 };
    expect(formeDuCorpsToit({ ...deuxPans, profil: [coyau, { type: 'droit' }] })).toBe('coyau');
    expect(formeDuCorpsToit({ ...deuxPans, bords: { coyau: true } })).toBe('coyau');
    expect(formeDuCorpsToit({ ...deuxPans, bords: { coyau: false, debordEgoutM: 0.5 } })).toBe('deux-pans');
  });

  it('demi-croupes, et des pentes droites dites explicitement', () => {
    expect(formeDuCorpsToit({ ...deuxPans, bouts: [{ type: 'demi-croupe', profondeurM: 1.5, hauteurPignonM: 1.8 }, { type: 'pignon' }] })).toBe('demi-croupes');
    expect(formeDuCorpsToit({ ...deuxPans, profil: [{ type: 'droit' }, { type: 'droit' }], bouts: [{ type: 'redents' }, { type: 'pignon' }] })).toBe('deux-pans');
  });

  it('pavillon : un quatre-pans presque carre dont le faitage fait moins de 1 m (spec §3.4, confusion 5)', () => {
    const carre = [{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 8 }, { x: 0, y: 8 }];
    expect(formeDuCorpsToit({ ...deuxPans, pts: carre, croupes: [4.2, 4.2] })).toBe('pavillon');
    expect(formeDuCorpsToit({ ...deuxPans, pts: carre, croupes: [3, 3] })).toBe('croupes');
    // Allonge : l'arete reste, meme courte.
    expect(formeDuCorpsToit({ ...deuxPans, croupes: [5.8, 5.8] })).toBe('croupes');
    // Une seule croupe : pas un pavillon.
    expect(formeDuCorpsToit({ ...deuxPans, pts: carre, croupes: [0, 8.5] })).toBe('croupes');
  });

  it('papillon : un faitage plus bas que les deux egouts (spec §4)', () => {
    expect(formeDuCorpsToit({ ...deuxPans, faitage: 5, egouts: [6.5, 6.5] })).toBe('papillon');
  });
});

describe('boutsDuCorps', () => {
  it('deduits des croupes quand ils ne sont pas dits, sinon tels quels', () => {
    expect(boutsDuCorps(deuxPans)).toEqual([{ type: 'pignon' }, { type: 'pignon' }]);
    expect(boutsDuCorps({ croupes: [0, 2.5] })).toEqual([{ type: 'pignon' }, { type: 'croupe', profondeurM: 2.5 }]);
    const bouts = [{ type: 'redents' }, { type: 'brisis', largeurM: 1 }] as CorpsToit['bouts'];
    expect(boutsDuCorps({ croupes: [3, 3], ...(bouts ? { bouts } : {}) })).toBe(bouts);
  });
});

describe('formeDesCorps', () => {
  it('la forme du corps principal, le plus grand ; null sans corps', () => {
    const aile: CorpsToit = { ...deuxPans, pts: [{ x: 12, y: 0 }, { x: 16, y: 0 }, { x: 16, y: 3 }, { x: 12, y: 3 }], posFaitage: 0, faitage: 4, egouts: [4, 3] };
    expect(formeDesCorps([aile, { ...deuxPans, croupes: [3, 3] }])).toBe('croupes');
    expect(formeDesCorps([aile])).toBe('appentis');
    expect(formeDesCorps([])).toBeNull();
    expect(formeDesCorps(null)).toBeNull();
  });
});

describe('formes simples et formes du catalogue', () => {
  it('chaque forme du catalogue a sa forme dessinee, simple', () => {
    expect(FORMES_TOIT_CATALOGUE.length).toBe(17);
    for (const f of FORMES_TOIT_CATALOGUE) {
      expect(estFormeSimple(f)).toBe(false);
      expect(estFormeToit(f)).toBe(true);
      expect(FORMES_TOIT_SIMPLES).toContain(FORME_DESSINEE[f]);
    }
    for (const f of FORMES_TOIT_SIMPLES) expect(formeDessinee(f)).toBe(f);
    expect(estFormeToit('chaumiere')).toBe(false);
    expect(estFormeToit(3)).toBe(false);
  });

  it('toitDessine rend le meme objet pour une forme simple (rien ne change), une copie sinon', () => {
    const t: Toit = { forme: 'deux-pans', hauteur: 3, angleFaitage: 0 };
    expect(toitDessine(t)).toBe(t);
    const m: Toit = { forme: 'mansart', hauteur: 3, angleFaitage: 10, couleur: '#333333' };
    expect(toitDessine(m)).toEqual({ ...m, forme: 'croupes' });
    expect(m.forme).toBe('mansart');
  });

  it('chaque forme de « Ce que je vois » s ecrit dans le vocabulaire de Toit.forme, sauf « Autre forme »', () => {
    for (const { code } of [...FORMES_COURANTES, ...AUTRES_FORMES]) {
      const f = formeDeLaVue(code);
      if (code === 'autre') expect(f).toBeNull();
      else expect(estFormeToit(f)).toBe(true);
    }
    expect(formeDeLaVue('demi-croupe')).toBe('demi-croupes');
    expect(formeDeLaVue('mansart')).toBe('mansart');
  });
});
