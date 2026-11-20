// Ce que l'ecran dit d'une cle d'entrainement (etape 6) et d'un modele depose par un carnet (etape 3) : banc/src/colab.ts.
import { describe, it, expect } from 'vitest';
import { bilanParType, carnetValable, dateCourte, decimal, etatDuJeton, origineDuModele, photosDuJeu, resteDuJeton } from '../src/colab.js';
import type { DepotModele } from '../src/types.js';

const jeu = { racine: 'banc-rf-detr-nano-20261120-101500', le: '2026-11-20T10:15:00+00:00', images: { train: 80, val: 22, test: 10 }, verifieesSeulement: true, classes: 20 };
const depot: DepotModele = { par: 'colab', le: '2026-11-20T13:32:00+00:00', architecture: 'rf-detr-nano', depart: 'coco', jeu, bilan: { map: 0.6189, map50: 0.9, parType: { porte: 0.4, fenetre_2v: 0.81, volet_roulant: 0.4 } }, octets: 37000000 };

describe('l’aller-retour Colab, à l’écran', () => {
  it('dit d’où vient un modèle déposé : sa date, son jeu, son mAP', () => {
    expect(origineDuModele(depot, 'Europe/Paris')).toBe('Déposé par Colab le 20/11/2026 14:32 · jeu du 20/11/2026 11:15 (112 photos vérifiées) · mAP 0,62');
    expect(origineDuModele({ ...depot, depart: 'zero', bilan: {}, jeu: { ...jeu, images: { train: 1, val: 0, test: 0 }, verifieesSeulement: false } }, 'Europe/Paris'))
      .toBe('Déposé par Colab le 20/11/2026 14:32 · jeu du 20/11/2026 11:15 (1 photo) · de zéro · mAP non mesuré');
    expect(origineDuModele({ ...depot, jeu: { ...jeu, images: { train: 1, val: 0, test: 0 } } }, 'Europe/Paris')).toContain('(1 photo vérifiée) · mAP 0,62');
    expect(photosDuJeu(jeu)).toBe(112);
    expect(decimal(0.5)).toBe('0,50');
    expect(dateCourte('pas une date')).toBe('');
  });
  it('range le mAP par type du meilleur au moins bon', () => {
    expect(bilanParType(depot)).toEqual([{ nom: 'fenetre_2v', map: 0.81 }, { nom: 'porte', map: 0.4 }, { nom: 'volet_roulant', map: 0.4 }]);
    expect(bilanParType({ ...depot, bilan: {} })).toEqual([]);
  });
  it('dit où en est une clé et ce qu’il lui reste à vivre', () => {
    expect(etatDuJeton({ lectures: 0, depose: null }).etat).toBe('attente');
    expect(etatDuJeton({ lectures: 2, depose: null })).toEqual({ etat: 'entrainement', libelle: 'Jeu lu par le carnet : entraînement en cours' });
    expect(etatDuJeton({ lectures: 1, depose: { le: depot.le, modele: 'colab-x' } }).etat).toBe('depose');
    const t = Date.parse('2026-11-20T10:00:00Z');
    expect(resteDuJeton({ expireLe: '2026-11-21T09:59:00+00:00' }, t)).toBe('23 h');
    expect(resteDuJeton({ expireLe: '2026-11-20T10:40:30+00:00' }, t)).toBe('40 min');
    expect(resteDuJeton({ expireLe: '2026-11-20T10:00:20+00:00' }, t)).toBe('1 min');
    expect(resteDuJeton({ expireLe: '2026-11-20T10:00:00+00:00' }, t)).toBe('expirée');
    expect(resteDuJeton({ expireLe: 'n’importe quoi' }, t)).toBe('expirée');
  });
  it('ne propose au téléchargement qu’un carnet lisible', () => {
    expect(carnetValable(JSON.stringify({ nbformat: 4, cells: [{ cell_type: 'code', source: '' }] }))).toBe(true);
    expect(carnetValable(JSON.stringify({ nbformat: 4, cells: [] }))).toBe(false);
    expect(carnetValable('<html>Erreur 500</html>')).toBe(false);
  });
});
