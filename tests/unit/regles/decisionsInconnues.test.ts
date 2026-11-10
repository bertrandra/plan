import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { appliquerPropositions, type Proposition, type EffetProposition } from '../../../src/regles/decisions.js';
import { versMemoire } from '../../../src/model/champsFonction.js';
import { poserAvertissementMotsInconnus } from '../../../src/shell/motsInconnus.js';
import type { ObjetPlan, PtBrut, ReleveFacade, TypeOuverture } from '../../../src/model/types.js';

// Les propositions d'un audit recu se lisent dans son fichier telles quelles (model/fichierAuditParcelle.ts), et les releves du
// projet aussi (le type d'une ouverture n'est pas verifie). Deux mots d'une version plus recente : un effet inconnu (son rang
// rendait NaN, l'ordre d'ecriture n'etait plus defini) et une ouverture inconnue (completerDetails parcourait `undefined`).

let signaux: string[] = [];
beforeEach(() => { signaux = []; poserAvertissementMotsInconnus((m) => signaux.push(m)); });
afterAll(() => poserAvertissementMotsInconnus(null));

const rect = (x0: number, y0: number, x1: number, y1: number): PtBrut[] => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const proposition = (id: string, effet: EffetProposition): Proposition =>
  ({ id, cible: { type: 'batiment', cle: 'maison' }, objet: id, avant: '', apres: '', source: 'mesure', indices: [], confiance: null, remplaceChoix: null, reserve: null, effet });
const RELEVE = (type: TypeOuverture): ReleveFacade => ({
  cote: 0, largeur: 10, hauteur: 5, texture: 'data:image/jpeg;base64,AA', hauteurTexture: 6, distance: 8, sourceDistance: 'gps', releveLe: '2026-10-13T09:00:00Z',
  ouvertures: [{ type, x: 1, y: 1, l: 1.2, h: 1.5 }, { type: 'fenetre', x: 4, y: 1, l: 1.2, h: 1.5 }], partieBasse: null,
});
const maison = (type: TypeOuverture): ObjetPlan =>
  versMemoire({ key: 'maison', name: 'maison', type: 'polygon', fonction: 'batiment', pts: rect(5, 10, 15, 18), elevation: 6, batiment: { facades: [RELEVE(type)] } }) as ObjetPlan;

describe('audit recu : des mots d une version plus recente', () => {
  it('un effet inconnu passe en dernier, n ecrit rien, et ne derange pas l ordre des autres', () => {
    const o = maison('fenetre');
    const inconnu = proposition('x', { type: 'peinture', teinte: 'ocre' } as unknown as EffetProposition);
    expect(() => appliquerPropositions([o], [inconnu, proposition('h', { type: 'hauteur', hauteurM: 5.8 })], [], '2026-10-30')).not.toThrow();
    expect(o.elevation).toBe(5.8);
  });

  it('une ouverture d un type inconnu reste telle quelle ; les autres recoivent les details de la facade', () => {
    const o = maison('oculus' as TypeOuverture);
    const avant = JSON.stringify(o.batiment!.facades![0]!.ouvertures[0]);
    const effet = { type: 'detailsOuvertures', cote: 0, details: { volets: 'battants' } } as EffetProposition;
    expect(() => appliquerPropositions([o], [proposition('d', effet)], [], '2026-10-30')).not.toThrow();
    const [oculus, fenetre] = o.batiment!.facades![0]!.ouvertures;
    expect(JSON.stringify(oculus)).toBe(avant);
    expect(fenetre!.details).toEqual({ volets: 'battants' });
    expect(signaux).toEqual(['Ouverture inconnue (« oculus »), laissée sans les détails de la façade.']);
  });
});
