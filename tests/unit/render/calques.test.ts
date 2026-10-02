// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { dessinerCalqueParasols } from '../../../src/render/parasolOverlay.js';
import { dessinerReleves } from '../../../src/render/releve.js';
import { dessinerCotes } from '../../../src/render/measures.js';
import type { EtatScene } from '../../../src/geometry/vue.js';
import type { EtatApp } from '../../../src/core/state.js';

// Les calques du plan : les parasols (ombres, carte d'ensoleillement, pieds de mat) et les releves
// de facade (ouvertures coupees a 1,10 m, comme sur un plan d'architecte).

const NS = 'http://www.w3.org/2000/svg';
const scene = { scale: 10, origine: { x: 0, y: 0 } } as unknown as EtatScene;
const midiEte = { dateStr: '2026-06-21', minutes: 13 * 60 + 30, lieu: { latitude: 48.1, longitude: -1.7 } };
const nuit = { ...midiEte, minutes: 2 * 60 };
let svg: SVGElement, ombres: SVGElement, mats: SVGElement;
beforeEach(() => {
  document.body.innerHTML = '';
  svg = document.createElementNS(NS, 'svg'); ombres = document.createElementNS(NS, 'g'); mats = document.createElementNS(NS, 'g');
  svg.appendChild(ombres); document.body.appendChild(svg);
});

const parasol = (plus: object = {}) => ({ key: 'p', type: 'circle', fonction: 'parasol', center: { x: 5, y: 5 }, r: 1.5, hauteurMat: 2.4, ...plus });
const calque = (objets: object[], ombreAffichee = true, carteAffichee = false, ctxSoleil = midiEte, isolement: string | null = null) =>
  dessinerCalqueParasols({ groupeOmbres: ombres, groupeMats: mats, racine: svg, etat: { objects: objets as never, scene, parasol: { ombreAffichee, carteAffichee }, isolement }, ctxSoleil, positionMat: () => ({ x: 5, y: 5 }) });

describe('calque des parasols', () => {
  it('dessine l ombre d un parasol au soleil, et le pied de son mat par-dessus tout', () => {
    calque([parasol()]);
    expect(ombres.querySelectorAll('ellipse')).toHaveLength(1);
    expect(mats.querySelectorAll('circle')).toHaveLength(1);
    expect(svg.lastChild).toBe(mats);
  });

  it('ne dessine pas d ombre la nuit, ni quand elle est cachee', () => {
    calque([parasol()], true, false, nuit);
    expect(ombres.querySelectorAll('ellipse')).toHaveLength(0);
    calque([parasol()], false);
    expect(ombres.querySelectorAll('ellipse')).toHaveLength(0);
  });

  it('relie le mat deporte au centre de la toile', () => {
    calque([parasol({ matDeporte: true })]);
    expect(mats.querySelectorAll('line')).toHaveLength(1);
  });

  it('ignore un parasol masque, ou hors de la terrasse isolee', () => {
    calque([parasol({ hidden: true })]);
    expect(mats.childNodes).toHaveLength(0);
    calque([parasol()], true, false, midiEte, 'autre');
    expect(mats.childNodes).toHaveLength(0);
  });

  it('vide le calque d un rendu a l autre', () => {
    calque([parasol()]); calque([parasol()]);
    expect(ombres.querySelectorAll('ellipse')).toHaveLength(1);
  });
});

describe('releves de facade sur le plan', () => {
  const groupe = () => { const g = document.createElementNS(NS, 'g') as SVGGElement; svg.appendChild(g); return g; };
  const maison = (ouvertures: object[], plus: object = {}) => ({
    key: 'm', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 6 }, { x: 0, y: 6 }],
    facades: [{ cote: 0, ouvertures }], ...plus
  });
  const etat = (objets: object[]) => ({ objects: objets, scene } as unknown as EtatApp);
  const versEcran = (p: { x: number; y: number }) => ({ x: p.x * 10, y: -p.y * 10 });

  it('coupe une fenetre a 1,10 m : son tableau, ses deux joues et sa vitre', () => {
    const g = groupe();
    dessinerReleves(g, etat([maison([{ type: 'fenetre', x: 1, y: 0.9, l: 1.2, h: 1.25 }])]), versEcran, () => false);
    expect(g.querySelectorAll('line')).toHaveLength(4);
    expect(g.querySelectorAll('path')).toHaveLength(0);
  });

  it('dessine une porte avec son arc d ouverture', () => {
    const g = groupe();
    dessinerReleves(g, etat([maison([{ type: 'porte', x: 3, y: 0, l: 0.9, h: 2.1 }])]), versEcran, () => false);
    expect(g.querySelectorAll('path')).toHaveLength(1);
  });

  it('ignore une ouverture que la coupe ne traverse pas, ou qui deborde du mur', () => {
    const g = groupe();
    dessinerReleves(g, etat([maison([{ type: 'fenetre', x: 1, y: 1.5, l: 1, h: 0.6 }, { type: 'fenetre', x: 7.5, y: 0.9, l: 2, h: 1 }])]), versEcran, () => false);
    expect(g.childNodes).toHaveLength(0);
  });

  it('ignore un batiment masque, et vide le calque a chaque rendu', () => {
    const g = groupe();
    const m = maison([{ type: 'fenetre', x: 1, y: 0.9, l: 1.2, h: 1.25 }]);
    dessinerReleves(g, etat([m]), versEcran, () => false);
    dessinerReleves(g, etat([m]), versEcran, () => true);
    expect(g.childNodes).toHaveLength(0);
  });
});

describe('cotes sur le plan', () => {
  const parcelle = { key: 'parcelle', type: 'polygon', pts: [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }] };
  const terrasse = { key: 't', type: 'polygon', pts: [{ x: 5, y: 5 }, { x: 9, y: 5 }, { x: 9, y: 8 }, { x: 5, y: 8 }] };
  const cote = (plus: object = {}) => ({ id: 'm1', refObjKey: 'parcelle', refSegIndex: 0, startEnd: 'A', targetObjKey: 't', targetPtIndex: 0, show: true, ...plus });
  const dessiner = (mesures: object[], brouillonRef: { objKey: string; segIndex: number } | null = null, brouillonCibles: { objKey: string; ptIndex: number }[] = []) => {
    const g = document.createElementNS(NS, 'g');
    dessinerCotes(g, { scene, objets: [parcelle, terrasse] as never, mesures: mesures as never, brouillonRef, brouillonCibles });
    return g;
  };

  it('dessine une cote enregistree : trait de rappel et valeur', () => {
    const g = dessiner([cote()]);
    expect(g.querySelectorAll('line').length).toBeGreaterThan(0);
    expect([...g.querySelectorAll('text')].map((t) => t.textContent).join(' ')).toMatch(/5[.,]00/);
  });

  it('ne dessine pas une cote masquee, ni une cote sans parcelle', () => {
    expect(dessiner([cote({ show: false })]).childNodes).toHaveLength(0);
    const g = document.createElementNS(NS, 'g');
    dessinerCotes(g, { scene, objets: [terrasse] as never, mesures: [cote()] as never, brouillonRef: null, brouillonCibles: [] });
    expect(g.childNodes).toHaveLength(0);
  });

  it('montre la cote en cours : son cote de reference et ses points designes', () => {
    const g = dessiner([], { objKey: 'parcelle', segIndex: 0 }, [{ objKey: 't', ptIndex: 0 }, { objKey: 't', ptIndex: 2 }]);
    expect(g.querySelectorAll('line')).toHaveLength(1);
    expect(g.querySelectorAll('circle')).toHaveLength(2);
  });
});
