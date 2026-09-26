// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { etiqueterTableaux } from '../../../src/ui/tableau.js';

// Les tableaux des resultats en cartes sur telephone (MD/spec-ihm-mobile.md §7.2) : chaque cellule
// porte le nom de sa colonne, et les cellules editables le restent.

describe('l etiquetage des tableaux', () => {
  it('pose le nom de colonne sur chaque cellule, colspan compris', () => {
    document.body.innerHTML = `<div id="r"><table>
      <tr><th>Poste</th><th>Qte</th><th colspan="2">Prix</th><th>Reel</th></tr>
      <tr><td>Vis</td><td>37 u</td><td>25</td><td>45</td><td><input type="number"></td></tr>
      <tr class="sectionRow"><td colspan="5">Structure</td></tr>
    </table></div>`;
    etiqueterTableaux(document.getElementById('r')!);
    const cellules = [...document.querySelectorAll('tr:nth-child(2) td')].map(td => td.getAttribute('data-label'));
    expect(cellules).toEqual(['Poste', 'Qte', 'Prix', 'Prix', 'Reel']);
    expect(document.querySelector('table')!.classList.contains('tableauCartes')).toBe(true);
    expect(document.querySelector('tr')!.classList.contains('enteteTableau')).toBe(true);
    expect(document.querySelector('tr.sectionRow')!.classList.contains('ligneTitre')).toBe(true);
    // Le champ editable est toujours la, dans sa cellule.
    expect(document.querySelector('td[data-label="Reel"] input')).not.toBeNull();
  });

  it('laisse tranquille un tableau sans en-tete', () => {
    document.body.innerHTML = '<div id="r"><table><tr><td>a</td></tr></table></div>';
    etiqueterTableaux(document.getElementById('r')!);
    expect(document.querySelector('table')!.classList.contains('tableauCartes')).toBe(false);
  });
});

describe('franciserDecimales', () => {
  it('ecrit la virgule et les accents a l ecran, sans toucher au resume ni aux champs', async () => {
    const { franciserDecimales } = await import('../../../src/ui/tableau.js');
    document.body.innerHTML = `
      <div id="r">
        <table><tr><td>Lames — barres achetees</td><td>92.50 ml</td><td>calcule — prix par longueur, debit 45x70</td><td><input value="12.5"></td></tr></table>
        <p>Type de pose : v2</p>
        <div id="panelResume"><textarea>3.5 m</textarea><span>4.25 m</span></div>
      </div>`;
    franciserDecimales(document.getElementById('r')!);
    const cellules = [...document.querySelectorAll('td')].map(td => td.textContent);
    expect(cellules.slice(0, 3)).toEqual(['Lames — barres achetées', '92,50 ml', 'calculé — prix par longueur, débit 45x70']);
    expect(document.querySelector('input')!.value).toBe('12.5');
    expect(document.querySelector('p')!.textContent).toBe('Type de pose : v2');
    expect(document.querySelector('#panelResume span')!.textContent).toBe('4.25 m');
    expect(document.querySelector('textarea')!.value).toBe('3.5 m');
  });
});
