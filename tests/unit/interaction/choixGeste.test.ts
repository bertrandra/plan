import { describe, it, expect } from 'vitest';
import {
  deciderGeste, corpsMobile, formeModifiable, aGlisse, seuilToucher, cibleDuRole, SEUIL_TOUCHER_PX, type Appui, type ObjetVise
} from '../../../src/interaction/choixGeste.js';

// Que fait un appui sur le plan 2D (demande du proprietaire, 27 novembre 2026) : un glisser deplace la vue, sauf sur l'objet deja
// choisi qui peut bouger ; un toucher bref choisit. Chaque cas de la regle, a la souris et au doigt.

const mobile: ObjetVise = { choisi: false, corpsMobile: true, formeModifiable: true };
const fixe: ObjetVise = { choisi: false, corpsMobile: false, formeModifiable: true };
const verrouille: ObjetVise = { choisi: false, corpsMobile: false, formeModifiable: false };
const appui = (a: Partial<Appui>): Appui => ({ cible: 'corps', bouton: 0, espace: false, outilEnCours: false, lectureSeule: false, objet: mobile, ...a });
const choisi = (o: ObjetVise): ObjetVise => ({ ...o, choisi: true });

describe('deciderGeste', () => {
  it('le vide deplace la vue', () => {
    expect(deciderGeste(appui({ cible: 'vide', objet: undefined }))).toBe('vue');
  });

  it('un objet qui n est pas choisi : un glisser deplace la vue, un toucher le choisit, quelle que soit la partie touchee', () => {
    for (const cible of ['corps', 'cote', 'sommet', 'rayon'] as const) {
      expect(deciderGeste(appui({ cible, objet: mobile }))).toBe('vueOuChoix');
      expect(deciderGeste(appui({ cible, objet: fixe }))).toBe('vueOuChoix');
    }
  });

  it('l objet choisi qui peut bouger : son corps et ses poignees gardent leur geste', () => {
    for (const cible of ['corps', 'cote', 'sommet', 'rayon'] as const) expect(deciderGeste(appui({ cible, objet: choisi(mobile) }))).toBe('objet');
  });

  it('le terrain et le terrain reel, meme choisis : le corps deplace la vue, les poignees se tirent (avec la question de la retouche)', () => {
    expect(deciderGeste(appui({ cible: 'corps', objet: choisi(fixe) }))).toBe('vue');
    expect(deciderGeste(appui({ cible: 'sommet', objet: choisi(fixe) }))).toBe('objet');
    expect(deciderGeste(appui({ cible: 'cote', objet: choisi(fixe) }))).toBe('objet');
  });

  it('verrouille, meme choisi : la vue, corps et poignees', () => {
    for (const cible of ['corps', 'cote', 'sommet', 'rayon'] as const) expect(deciderGeste(appui({ cible, objet: choisi(verrouille) }))).toBe('vue');
  });

  it('lecture seule : la vue partout, et un toucher choisit toujours', () => {
    for (const cible of ['corps', 'cote', 'sommet', 'rayon', 'acces'] as const) {
      expect(deciderGeste(appui({ cible, lectureSeule: true, objet: choisi(mobile) }))).toBe('vue');
    }
    expect(deciderGeste(appui({ lectureSeule: true, objet: mobile }))).toBe('vueOuChoix');
    expect(deciderGeste(appui({ cible: 'vide', lectureSeule: true, objet: undefined }))).toBe('vue');
  });

  it('un acces de la cloture glisse le long de la limite sans que la parcelle soit choisie', () => {
    expect(deciderGeste(appui({ cible: 'acces', objet: fixe }))).toBe('objet');
  });

  it('un outil qui designe garde l appui, sur un objet comme sur le vide', () => {
    expect(deciderGeste(appui({ outilEnCours: true }))).toBe('outil');
    expect(deciderGeste(appui({ outilEnCours: true, cible: 'vide', objet: undefined }))).toBe('outil');
    expect(deciderGeste(appui({ outilEnCours: true, cible: 'cote', objet: choisi(mobile) }))).toBe('outil');
  });

  it('le bouton du milieu et la barre d espace : la vue, toujours, meme sur l objet choisi ou pendant un outil', () => {
    expect(deciderGeste(appui({ bouton: 1, objet: choisi(mobile) }))).toBe('vue');
    expect(deciderGeste(appui({ espace: true, objet: choisi(mobile) }))).toBe('vue');
    expect(deciderGeste(appui({ espace: true, cible: 'sommet', objet: choisi(mobile) }))).toBe('vue');
    expect(deciderGeste(appui({ bouton: 1, outilEnCours: true }))).toBe('vue');
  });

  it('le bouton droit n est pas pour le plan (un menu peut le prendre)', () => {
    expect(deciderGeste(appui({ bouton: 2 }))).toBe('rien');
    expect(deciderGeste(appui({ bouton: 2, espace: true }))).toBe('rien');
  });
});

describe('ce qui bouge au glisser', () => {
  const terrasse = { key: 't', fonction: 'terrasse' };
  it('un ouvrage du projet se deplace ; pas en lecture seule ni verrouille', () => {
    expect(corpsMobile(terrasse, false)).toBe(true);
    expect(corpsMobile(terrasse, true)).toBe(false);
    expect(corpsMobile({ ...terrasse, locked: true }, false)).toBe(false);
  });
  it('jamais la parcelle du projet, une voisine, ni ce qui vient du cadastre ou de l IGN', () => {
    expect(corpsMobile({ key: 'parcelle', fonction: 'terrain' }, false)).toBe(false);
    expect(corpsMobile({ key: 'voisine-1', fonction: 'terrain' }, false)).toBe(false);
    expect(corpsMobile({ key: 'maison', fonction: 'batiment', bdtopo: { id: 'BAT' } }, false)).toBe(false);
    expect(corpsMobile({ key: 'p2', fonction: 'batiment', cadastre: { id: 'X' } }, false)).toBe(false);
  });
  it('les poignees : tout sauf le verrouille et la lecture seule', () => {
    expect(formeModifiable({ key: 'parcelle', fonction: 'terrain' }, false)).toBe(true);
    expect(formeModifiable({ key: 'parcelle', fonction: 'terrain', locked: true }, false)).toBe(false);
    expect(formeModifiable(terrasse, true)).toBe(false);
  });
});

describe('toucher ou glisser', () => {
  it('le seuil est plus large au doigt qu a la souris (memes valeurs que le menu de la vitrine)', () => {
    expect(seuilToucher('touch')).toBe(SEUIL_TOUCHER_PX.doigt);
    expect(seuilToucher('mouse')).toBe(SEUIL_TOUCHER_PX.souris);
    expect(seuilToucher('pen')).toBe(SEUIL_TOUCHER_PX.souris);
    expect(SEUIL_TOUCHER_PX.doigt).toBeGreaterThan(SEUIL_TOUCHER_PX.souris);
  });
  it('quelques pixels de tremblement restent un toucher ; au-dela, un glisser', () => {
    expect(aGlisse(3, 3, 'mouse')).toBe(false);
    expect(aGlisse(6, 0, 'mouse')).toBe(true);
    expect(aGlisse(6, 6, 'touch')).toBe(false);
    expect(aGlisse(9, 6, 'touch')).toBe(true);
  });
  it('le role d un element du plan dit la cible', () => {
    expect(cibleDuRole('obj')).toBe('corps');
    expect(cibleDuRole('point')).toBe('sommet');
    expect(cibleDuRole('edge')).toBe('cote');
    expect(cibleDuRole('radius')).toBe('rayon');
    expect(cibleDuRole('acces')).toBe('acces');
    expect(cibleDuRole(undefined)).toBe('vide');
  });
});
