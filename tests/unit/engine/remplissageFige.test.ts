import { describe, it, expect } from 'vitest';
import { ensureConstruction, constructionTerrasseNeuve, defaultConstruction } from '../../../src/engine/construction.js';
import { REMPLISSAGE, RAIDEUR_LAME_FIGEE } from '../../../src/engine/remplissageFige.js';
import { LAME_RAIDEUR, CHARGE_NORMALE_DEFAUT } from '../../../src/engine/portees.js';
import type { Construction } from '../../../src/model/types.js';

// Le remplissage d'un ancien projet est fige (MD/roadmap-architecture.md, etape 1.1 ; AD-19) : ce qu'il recoit quand un reglage lui
// manque ne suit plus les constantes du moteur d'aujourd'hui. Le temoin tests/fixtures/golden/defauts-construction.json garde les
// valeurs ; ces tests gardent la separation.

describe('le remplissage fige des anciens projets', () => {
  it('une construction vide recoit exactement la table figee', () => {
    const c = ensureConstruction({ construction: {} as Construction }) as unknown as Record<string, unknown>;
    for (const [champ, valeur] of Object.entries(REMPLISSAGE)) expect(c[champ], champ).toEqual(valeur);
  });

  it('la raideur d une essence se lit dans la table figee, meme si celle du moteur change', () => {
    const avant = { ...LAME_RAIDEUR };
    try {
      // Le moteur d'aujourd'hui decide qu'une lame exotique est plus raide : un projet enregistre avant `coefRaideurLame` ne bouge pas.
      LAME_RAIDEUR.exotique = 2;
      LAME_RAIDEUR.composite = 0.5;
      expect(ensureConstruction({ construction: { essenceBois: 'exotique' } as Construction }).coefRaideurLame).toBe(1.05);
      expect(ensureConstruction({ construction: { essenceBois: 'composite' } as Construction }).coefRaideurLame).toBe(0.8);
      expect(ensureConstruction({ construction: { essenceBois: 'inconnue' } as Construction }).coefRaideurLame).toBe(1);
    } finally {
      Object.assign(LAME_RAIDEUR, avant);
    }
    expect(RAIDEUR_LAME_FIGEE).toEqual(avant);
  });

  it('la table et la construction sans reglage ne se modifient pas', () => {
    expect(Object.isFrozen(REMPLISSAGE)).toBe(true);
    expect(Object.isFrozen(RAIDEUR_LAME_FIGEE)).toBe(true);
    // Chaque appel rend une construction neuve : la modifier ne touche pas la suivante.
    const a = defaultConstruction();
    a.chargeNormale = 999;
    (a.prixLongueurs as Record<string, number>)['3'] = 1;
    expect(defaultConstruction().chargeNormale).toBe(250);
    expect(defaultConstruction().prixLongueurs).toEqual({});
  });

  it('les valeurs figees sont celles du moteur au jour du gel (un ecart se dit ici, jamais en changeant la table)', () => {
    // Le jour ou une charge par defaut change pour les terrasses neuves, ce test casse : la nouvelle valeur va dans
    // constructionTerrasseNeuve, et ce test s'adapte ; REMPLISSAGE, lui, ne change pas.
    expect(REMPLISSAGE.chargeNormale).toBe(CHARGE_NORMALE_DEFAUT);
    expect(constructionTerrasseNeuve().chargeNormale).toBe(CHARGE_NORMALE_DEFAUT);
  });
});
