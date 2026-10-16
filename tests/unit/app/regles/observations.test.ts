import { describe, it, expect } from 'vitest';
import { observerSujets } from '../../../../src/app/regles/sujets/observations.js';
import { SUJETS } from '../../../../src/app/regles/sujets/index.js';
import { DESCRIPTIONS_SUJETS } from '../../../../src/regles/sujets/liste.js';
import { insererAvantLaFin, nouveauSujet } from '../../../../src/regles/sujets/edition.js';
import { champsSimples } from '../../../../src/regles/sujets/vote.js';
import { voter } from '../../../../src/model/analyseClaude.js';
import { reponse } from '../../../fixtures/audit/reponseClaude.js';
import type { ObjetPlan } from '../../../../src/model/types.js';
import type { ReponseAnalyse } from '../../../../src/model/analyseClaude.js';

// Les observations par le registre : chaque sujet dit comment il se montre (`Sujet.observer`), dans l'ordre
// du prompt ; un sujet sans module, dont le champ est simple, se dit d'apres sa description.

const o = { key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment' } as ObjetPlan;
const passe = (plus: Record<string, unknown> = {}): ReponseAnalyse => ({
  ...reponse({
    forme: { indices: [{ image: 1, vu: 'deux pignons' }], valeur: 'deux-pans' },
    bouts: { indices: [], gauche: 'pignon', droite: 'pignon' },
    lucarnes: { indices: [], nombre: 2, types: ['jacobine'], pan: 'rue' },
    elements: [{ indices: [], element: 'verriere' }],
  }), ...plus,
}) as ReponseAnalyse;

describe('le registre dit les observations', () => {
  it('chaque sujet sans proposition en a une, et les lignes suivent l’ordre du prompt', () => {
    const reponses = [passe(), passe(), passe()];
    const lignes = observerSujets({ o, v: voter(reponses), reponses });
    const sujets = lignes.map((l) => l.sujet);
    expect(sujets.indexOf('forme')).toBeLessThan(sujets.indexOf('lucarnes'));
    expect(sujets.indexOf('lucarnes')).toBeLessThan(sujets.indexOf('elements'));
    expect(sujets.indexOf('elements')).toBeLessThan(sujets.findIndex((s) => s.startsWith('details:')));
    expect(lignes.find((l) => l.sujet === 'lucarnes')?.texte).toBe('2 lucarnes vues (jacobine), côté rue');
    expect(lignes.find((l) => l.sujet === 'pignons')?.texte).toBe('Pignons aux deux bouts du faîtage');
    expect(lignes.find((l) => l.sujet === 'elements')?.texte).toBe('Vu aussi : verrière');
  });

  it('un sujet qui propose peut aussi se dire : la forme du toit, les façades', () => {
    expect(SUJETS.find((s) => s.id === 'formeToit')).toMatchObject({ proposer: expect.any(Function), observer: expect.any(Function) });
    expect(SUJETS.find((s) => s.id === 'facades')).toMatchObject({ proposer: expect.any(Function), observer: expect.any(Function) });
  });
});

describe('un sujet ajouté sans module', () => {
  const chienAssis = nouveauSujet({ id: 'chienAssis', libelle: 'Chiens-assis', question: 'le nombre de chiens-assis', termes: [] }, DESCRIPTIONS_SUJETS);
  const objetJardin = nouveauSujet({ id: 'objetJardin', libelle: 'Objets du jardin', question: 'les objets', termes: [{ terme: 'abri-de-jardin', definition: 'petite construction' }] }, DESCRIPTIONS_SUJETS);
  const descriptions = insererAvantLaFin(insererAvantLaFin(DESCRIPTIONS_SUJETS, chienAssis), objetJardin);
  const simples = champsSimples(descriptions);

  it('se dit d’après sa description : son libellé et la valeur votée, avec ses indices et son accord', () => {
    const ia = { image: 2, vu: 'une lucarne à un pan' };
    const reponses = [
      passe({ chienAssis: { indices: [ia], nombre: 1 }, objetJardin: { indices: [], valeur: 'abri-de-jardin' } }),
      passe({ chienAssis: { indices: [], nombre: 1 }, objetJardin: { indices: [], valeur: 'abri-de-jardin' } }),
      passe({ chienAssis: { indices: [], nombre: 4 }, objetJardin: { indices: [], valeur: 'indetermine' } }),
    ];
    const lignes = observerSujets({ o, v: voter(reponses, simples), reponses }, descriptions);
    expect(lignes.find((l) => l.sujet === 'chienAssis')).toEqual({ sujet: 'chienAssis', texte: 'Chiens-assis vu : 1', indices: [ia], accord: 2 / 3 });
    expect(lignes.find((l) => l.sujet === 'objetJardin')).toMatchObject({ texte: 'Objets du jardin vu : abri de jardin', accord: 2 / 3 });
  });

  it('ne dit rien d’un champ indéterminé ou à zéro', () => {
    const reponses = [passe({ chienAssis: { indices: [], nombre: 0 } }), passe({ chienAssis: { indices: [], nombre: 0 } }), passe({ chienAssis: { indices: [], nombre: 0 } })];
    expect(observerSujets({ o, v: voter(reponses, simples), reponses }, descriptions).some((l) => l.sujet === 'chienAssis')).toBe(false);
    expect(observerSujets({ o, v: voter([passe(), passe(), passe()], simples), reponses: [passe()] }, descriptions).some((l) => l.sujet === 'objetJardin')).toBe(false);
  });
});
