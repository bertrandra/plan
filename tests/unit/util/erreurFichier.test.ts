import { describe, it, expect } from 'vitest';
import { natureErreurFichier, erreurExport, erreurImport } from '../../../src/util/erreurFichier.js';

// Les erreurs d'un fichier fait ou lu sur l'appareil, dites en clair (lot 4) : ce qui se passe, quoi faire, le message
// d'origine en detail a copier.

describe('la nature d une erreur de fichier', () => {
  it('reconnait la bibliotheque qui ne se charge pas (le reseau), la memoire, le blocage, le dessin, la lecture, le format', () => {
    expect(natureErreurFichier(new TypeError('Failed to fetch dynamically imported module: /assets/pdf.js'))).toBe('bibliotheque');
    expect(natureErreurFichier(new RangeError('Invalid array length'))).toBe('memoire');
    expect(natureErreurFichier(new Error('Array buffer allocation failed'))).toBe('memoire');
    expect(natureErreurFichier(Object.assign(new Error('The request is not allowed'), { name: 'NotAllowedError' }))).toBe('blocage');
    expect(natureErreurFichier(new Error('WebGL : contexte refuse'))).toBe('dessin');
    expect(natureErreurFichier(Object.assign(new Error('The file could not be read'), { name: 'NotReadableError' }))).toBe('lecture');
    expect(natureErreurFichier(new SyntaxError('Unexpected token < in JSON at position 0'))).toBe('format');
    expect(natureErreurFichier(new Error('SVG invalide ou mal forme'))).toBe('format');
    expect(natureErreurFichier(new Error("Cannot read properties of undefined (reading 'x')"))).toBe('autre');
  });
});

describe('les phrases', () => {
  it('un export dit ce qui se passe et quoi faire, accorde au sujet, et garde le message en detail', () => {
    expect(erreurExport(new Error('casse'), 'Le plan en DXF')).toEqual({
      texte: 'Le plan en DXF n’a pas pu être produit. Réessayez ; si l’erreur revient, copiez le détail technique et transmettez-le au support.',
      detail: 'casse'
    });
    expect(erreurExport(new RangeError('Invalid string length'), 'La note de calcul', 'f').texte)
      .toBe('La note de calcul est trop lourde pour la mémoire de cet appareil. Fermez d’autres onglets, puis réessayez ; à défaut, faites-le depuis un ordinateur.');
    expect(erreurExport(new TypeError('Failed to fetch'), 'Le dossier PDF').texte).toMatch(/^Le dossier PDF n’a pas pu être préparé : la bibliothèque qui le fabrique ne s’est pas chargée\. Vérifiez votre connexion/);
    expect(erreurExport(new Error('WebGL : contexte refuse'), 'La scène 3D (GLB)', 'f').texte).toMatch(/^La scène 3D \(GLB\) n’a pas pu être dessinée : le navigateur refuse/);
    expect(erreurExport(Object.assign(new Error('x'), { name: 'SecurityError' }), 'Le plan en PNG').texte).toMatch(/^Le navigateur a bloqué le téléchargement\./);
  });

  it('un import dit que ce n est pas le bon fichier et lequel choisir', () => {
    expect(erreurImport(new SyntaxError('Unexpected end of JSON input'), 'projet Plan (JSON)', 'Choisissez un fichier .json.')).toEqual({
      texte: 'Ce fichier n’est pas un projet Plan (JSON) lisible. Choisissez un fichier .json.',
      detail: 'Unexpected end of JSON input'
    });
    // La nature imposee par l'appelant : un refus de la validation est un mauvais format, quel que soit son message.
    expect(erreurImport(new Error('Aucun objet'), 'projet Plan (JSON)', 'Choisissez un fichier .json.', 'format').texte).toBe('Ce fichier n’est pas un projet Plan (JSON) lisible. Choisissez un fichier .json.');
    expect(erreurImport(new Error('x'), 'SVG', '', 'lecture').texte).toBe('Le fichier n’a pas pu être lu sur l’appareil. Vérifiez qu’il est toujours à sa place, puis choisissez-le de nouveau.');
    expect(erreurImport(new Error('boum'), 'SVG', '').texte).toMatch(/^Le fichier SVG n’a pas pu être ouvert\. Réessayez/);
  });
});
