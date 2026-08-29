import { describe, it, expect } from 'vitest';
import { pdfEscape, assemblerPDF, pdfTexte, pdfPolygone, pdfCercle, echelleQuiTient, A4_L, A4_H } from '../../src/export/pdf/writer.js';
import { dxfNum } from '../../src/export/dxf.js';
import { niceStep } from '../../src/util/format.js';

describe('pdfEscape', () => {
  it('protege les parentheses et l antislash, qui delimitent les chaines PDF', () => {
    // String.raw : sans lui, l'antislash disparait a l'ecriture du test et on croit tester
    // quelque chose qu'on ne teste pas.
    expect(pdfEscape(String.raw`a(b)c\d`)).toBe(String.raw`a\(b\)c\\d`);
  });
  it('translittere les accents, que la police Helvetica standard ne sait pas rendre', () => {
    expect(pdfEscape('Arrière-cour, 18°')).toBe('Arriere-cour, 18deg');
  });
});

describe('dxfNum', () => {
  it('ecrit toujours quatre decimales', () => {
    expect(dxfNum(1)).toBe('1.0000');
    expect(dxfNum(-20.135)).toBe('-20.1350');
  });
  it('reste en notation decimale sur toute la plage utile du plan', () => {
    // Les coordonnees sont des metres autour de l'origine de la parcelle : quelques centaines au
    // plus. toFixed ne bascule en exponentiel qu'a partir de 1e21, hors d'atteinte ici.
    expect(dxfNum(0.00001)).toBe('0.0000');
    expect(dxfNum(-999999.5)).not.toContain('e');
  });
});

describe('assemblerPDF', () => {
  const doc = assemblerPDF([
    { l: A4_L, h: A4_H, contenu: pdfTexte(50, 50, 10, 'Essai') },
    { l: A4_L, h: A4_H, contenu: pdfPolygone([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], [1, 0, 0]) }
  ]);

  it('produit un PDF complet', () => {
    expect(doc.startsWith('%PDF-1.4')).toBe(true);
    expect(doc.trimEnd().endsWith('%%EOF')).toBe(true);
  });

  it('ecrit une table xref dont chaque decalage pointe sur le bon objet', () => {
    // C'est LE point fragile d'un PDF ecrit a la main : un objet ajoute sans recalcul et les
    // lecteurs refusent le fichier.
    const startxref = Number(/startxref\s+(\d+)/.exec(doc)![1]);
    const lignes = doc.slice(startxref).split('\n');
    const nb = Number(lignes[1].trim().split(/\s+/)[1]);
    for (let i = 1; i < nb; i++) {
      const off = parseInt(lignes[i + 2].slice(0, 10), 10);
      expect(doc.substr(off, String(i).length + 6)).toBe(i + ' 0 obj');
    }
  });

  it('declare pour chaque flux une longueur qui tombe juste sur endstream', () => {
    const re = /<< \/Length (\d+) >>\nstream\n/g;
    let m: RegExpExecArray | null;
    let flux = 0;
    while ((m = re.exec(doc))) {
      const debut = m.index + m[0].length;
      expect(doc.substr(debut + Number(m[1]), 11)).toBe('\nendstream\n');
      flux++;
    }
    expect(flux).toBe(2);
  });

  it('estampille la version dans le dictionnaire /Info', () => {
    // SemVer complet, pre-publication comprise : `1.1.0-alpha.1` est un numero valide. La premiere
    // ecriture de ce test ne connaissait que `1.0.0` et n'acceptait que des chiffres et des points.
    expect(doc).toMatch(/\/Producer \(Plan interactif \d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?\)/);
    expect(doc).toMatch(/trailer[\s\S]*\/Info \d+ 0 R/);
  });

  it('numerote une page par entree, plus le catalogue, les pages et la police', () => {
    expect((doc.match(/\/Type \/Page[^s]/g) || []).length).toBe(2);
  });
});

describe('pdfCercle', () => {
  it('approche le cercle par quatre courbes de Bezier', () => {
    const s = pdfCercle(100, 100, 20, [0, 0, 1]);
    expect((s.match(/ c$/gm) || []).length).toBe(4);
  });
});

describe('echelleQuiTient', () => {
  it('prend la plus grande echelle qui rentre dans la place disponible', () => {
    // 10 m dans 500 points : 1/50 demanderait 567 pt (trop), 1/75 en demande 378 - c'est elle.
    expect(echelleQuiTient(10, 10, 500, 500)).toBe(75);
    // Deux fois moins de place : on descend d'un cran dans la liste.
    expect(echelleQuiTient(10, 10, 250, 250)).toBe(125);
  });
  it('retombe sur la derniere echelle quand rien ne rentre', () => {
    expect(echelleQuiTient(10000, 10000, 100, 100)).toBe(2000);
  });
});

describe('niceStep', () => {
  it('choisit un pas rond proche de la cible', () => {
    expect(niceStep(0.37)).toBe(0.5);
    expect(niceStep(3)).toBe(2);
    expect(niceStep(12)).toBe(10);
  });
});
