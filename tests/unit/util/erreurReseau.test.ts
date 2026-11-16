import { describe, it, expect } from 'vitest';
import { phraseReseau, natureErreurReseau, statutHttp, detailTechnique, enClair } from '../../../src/util/erreurReseau.js';

// Les erreurs du reseau en clair (audit de l'IHM du 16 novembre 2026, lot 1) : « Geocodage impossible : Failed to fetch » ne disait
// ni ce qui se passait ni quoi faire.

const IGN = 'Le service d’adresses de l’IGN';
const ENSUITE = 'Réessayez dans un instant, ou dessinez votre terrain à la main.';

describe('les erreurs du reseau en clair', () => {
  it('dit qu un service ne repond pas, et quoi faire, pour les messages des navigateurs', () => {
    for (const e of [new TypeError('Failed to fetch'), new TypeError('NetworkError when attempting to fetch resource.'), new TypeError('Load failed'),
      new Error('Le service ne repond pas (8 s). Reessaie.'), Object.assign(new Error('The operation was aborted.'), { name: 'AbortError' }),
      new TypeError('Failed to fetch dynamically imported module: http://x/assets/moteur3d.js')]) {
      expect(phraseReseau(e, IGN, ENSUITE)).toBe('Le service d’adresses de l’IGN ne répond pas. Réessayez dans un instant, ou dessinez votre terrain à la main.');
    }
  });

  it('lit le statut HTTP, pose par le client ou ecrit dans le message', () => {
    expect(statutHttp(Object.assign(new Error('x'), { statut: 503 }))).toBe(503);
    expect(statutHttp(new Error('Le service a repondu HTTP 502.'))).toBe(502);
    expect(statutHttp(new Error('rien'))).toBe(null);
    expect(statutHttp(new Error('HTTP 500'))).toBe(500);
    // Une phrase qui cite son statut dit deja ce qui se passe : elle reste telle quelle.
    expect(phraseReseau(new Error('Le Géoportail de l’urbanisme ne sert pas ce règlement (HTTP 404).'), 'Le Géoportail')).toBe(null);
    expect(phraseReseau(new Error('Le service a repondu HTTP 503.'), IGN)).toBe('Le service d’adresses de l’IGN est momentanément indisponible. Réessayez dans un instant.');
    expect(phraseReseau(Object.assign(new Error('x'), { statut: 429 }), IGN, ENSUITE)).toBe('Le service d’adresses de l’IGN reçoit trop de demandes en ce moment. Réessayez dans une minute.');
    expect(natureErreurReseau(Object.assign(new Error('x'), { statut: 400 }))).toBe('refus');
  });

  it('reconnait les echecs de la plateforme : reseau, et code brut sans phrase', () => {
    expect(natureErreurReseau(Object.assign(new Error('enregistrement du projet : Failed to fetch'), { reason: 'network' }))).toBe('injoignable');
    expect(natureErreurReseau(Object.assign(new Error('enregistrement du projet : INTERNAL (req_42)'), { reason: 'server' }))).toBe('indisponible');
  });

  it('laisse intact un refus deja dit en phrase : ce n est pas une erreur de reseau', () => {
    const quota = Object.assign(new Error('Votre organisation a atteint ses 3 projets.'), { reason: 'server' });
    expect(phraseReseau(quota, 'La plateforme')).toBe(null);
    expect(phraseReseau(new Error('Aucune parcelle cadastrale trouvee sous ce point.'), IGN)).toBe(null);
    expect(enClair(new Error('Aucune parcelle.'), IGN, ENSUITE, (d) => 'Recherche : ' + d)).toEqual({ texte: 'Recherche : Aucune parcelle.', detail: 'Aucune parcelle.' });
  });

  it('garde le message d origine en detail technique', () => {
    expect(detailTechnique(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
    expect(detailTechnique('texte')).toBe('texte');
    expect(enClair(new TypeError('Failed to fetch'), IGN, ENSUITE, () => '')).toEqual({ texte: 'Le service d’adresses de l’IGN ne répond pas. ' + ENSUITE, detail: 'Failed to fetch' });
  });
});
