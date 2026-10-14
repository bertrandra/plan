import { describe, it, expect } from 'vitest';
import { chargerCorpus, rejouerScene } from '../../banc/facades/banc.js';
import { detailsVrais, peindreElevation, murSeul, type SceneFacade } from '../../banc/facades/synthese.js';
import { mesurerDetails, cumulerDetails } from '../../banc/facades/mesure.js';

// La justesse des details des ouvertures au banc de facades (lot G17) : la verite que la scene en dit,
// le compte des details lus justes, manques et lus a tort, et la scene 20 qui les montre.

const corpus = chargerCorpus();
const parNom = (debut: string): SceneFacade => {
  const s = corpus.find((c) => c.nom.startsWith(debut));
  if (!s) throw new Error('scene absente : ' + debut);
  return s;
};

describe('detailsVrais', () => {
  it('lit les volets dans le rendu, le balcon dans les balcons de la scene, la forme dans le rendu', () => {
    const s03 = parNom('03-');
    expect(detailsVrais(s03, s03.verite.ouvertures.find((o) => o.rendu?.volets)!)).toEqual({ volets: 'battants' });
    const s06 = parNom('06-');
    const roulants = s06.verite.ouvertures.map((o) => detailsVrais(s06, o));
    expect(roulants.every((d) => d.volets === 'roulant')).toBe(true);
    // Le tablier ferme aux 95 % compte ferme ; a 40 %, non.
    expect(roulants.filter((d) => d.ferme)).toHaveLength(1);
    const s05 = parNom('05-');
    expect(s05.verite.ouvertures.map((o) => detailsVrais(s05, o).allege ?? null).filter(Boolean)).toEqual(['balcon']);
    const s20 = parNom('20-');
    const d20 = s20.verite.ouvertures.map((o) => detailsVrais(s20, o));
    expect(d20.map((d) => d.forme ?? null).filter(Boolean)).toEqual(['cintre', 'rond']);
    expect(d20.map((d) => d.allege ?? null).filter(Boolean)).toEqual(['balcon', 'garde-corps']);
    expect(d20.find((d) => d.volets)).toEqual({ volets: 'persiennes', ferme: true });
    // Une ouverture qui porte ses details les impose.
    expect(detailsVrais(s03, { type: 'fenetre', x: 0, y: 1, l: 1, h: 1, details: { forme: 'rond' } })).toEqual({ forme: 'rond' });
  });
});

describe('mesurerDetails', () => {
  const b = (x: number, details?: Record<string, string>) => ({ x, y: 1, l: 1, h: 1.2, ...(details ? { details } : {}) });
  it('compte, sur les ouvertures retrouvees, les details justes, manques et lus a tort', () => {
    const vraies = [b(0, { volets: 'battants' }), b(2, { forme: 'cintre' }), b(4), b(6, { volets: 'roulant' })];
    const trouvees = [b(0, { volets: 'battants' }), b(2), b(4, { forme: 'cintre' }), b(6, { volets: 'persiennes' })];
    const m = mesurerDetails(vraies, trouvees);
    expect(m.volets).toEqual({ vrais: 2, justes: 1, manques: 0, faux: 1, lusFaux: ['persiennes'] });
    expect(m.forme).toEqual({ vrais: 1, justes: 0, manques: 1, faux: 1, lusFaux: ['cintre'] });
    expect(m.allege.vrais + m.allege.faux).toBe(0);
  });
  it('compte comme faux les details d une detection fausse, pas ceux d une ouverture manquee', () => {
    const m = mesurerDetails([b(0, { volets: 'battants' })], [b(8, { forme: 'cintre' })]);
    expect(m.volets).toEqual({ vrais: 0, justes: 0, manques: 0, faux: 0, lusFaux: [] });
    expect(m.forme.faux).toBe(1);
    const c = cumulerDetails([m, m]);
    expect(c.forme).toEqual({ vrais: 0, justes: 0, manques: 0, faux: 2, lusFaux: ['cintre', 'cintre'] });
  });
});

describe('scene 20 : les details lus', () => {
  it('peint les baies cintree et ronde dans leur contour : les coins du haut de leur boite sont du mur', () => {
    const s = parNom('20-');
    const px = 100;
    const elev = murSeul(s, peindreElevation(s, px, false), px);
    const lum = (x: number, z: number) => {
      const k = (Math.round((s.verite.hauteur - z) * px) * elev.largeur + Math.round(x * px)) * 4;
      return (elev.donnees[k] ?? 0) + (elev.donnees[k + 1] ?? 0) + (elev.donnees[k + 2] ?? 0);
    };
    for (const o of s.verite.ouvertures.filter((v) => v.rendu?.forme)) {
      // Coin haut gauche de la boite : le mur (clair) ; dans la baie, a cote du meneau : la vitre (sombre).
      expect(lum(o.x + 0.03, o.y + o.h - 0.03), o.rendu?.forme).toBeGreaterThan(lum(o.x + o.l * 0.3, o.y + o.h / 2) + 150);
    }
  });

  it('lit les deux formes et les persiennes sur l elevation, sans faux cintre', { timeout: 30_000 }, () => {
    const r = rejouerScene(parNom('20-'));
    expect(r.details.elevation.forme).toMatchObject({ vrais: 2, justes: 2, faux: 0 });
    expect(r.details.elevation.volets).toMatchObject({ vrais: 1, justes: 1 });
  });

  it('ne lit plus de cintre sur la haie des scenes 07 et 17', { timeout: 60_000 }, () => {
    for (const nom of ['07-', '17-']) {
      const r = rejouerScene(parNom(nom));
      expect(r.details.elevation.forme.faux, nom).toBe(0);
      expect(r.details.photo?.forme.faux ?? 0, nom).toBe(0);
    }
  });
});
