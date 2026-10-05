import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as lib from 'pdf-lib';
import { assemblerDossierMairie, pourWinAnsi } from '../../../src/export/dossierMairie.js';
import { dateCerfa, decouperAdresse, referenceCadastrale, remplirCerfa13703 } from '../../../src/export/cerfa13703.js';
import type { ObjetPlan } from '../../../src/model/types.js';

const cerfa = new Uint8Array(readFileSync(resolve(__dirname, '../../../public/cerfa/cerfa_13703-12.pdf')));
// Une image PNG de 1 x 1 pixel.
const PNG = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='), c => c.charCodeAt(0));

function projet(): ObjetPlan[] {
  const rect = (x: number, y: number, L: number, l: number) => [{ x, y }, { x: x + L, y }, { x: x + L, y: y + l }, { x, y: y + l }];
  return [
    {
      key: 'parcelle', name: 'Parcelle AB 123', type: 'polygon', fonction: 'terrain', pts: rect(0, 0, 30, 20),
      cadastre: { idu: '78650000AB0123', section: 'AB', numero: '0123', contenanceM2: 612, commune: 'Le Vésinet', adresse: '12 bis Rue des Lilas 78110 Le Vésinet' },
      declaration: { nom: 'Dupont', prenom: 'Claire', naissance: '1980-04-17', voie: 'Rue des Lilas', numero: '12 bis', localite: 'Le Vésinet', codePostal: '78110', telephone: '01 23 45 67 89', email: 'claire@exemple.fr', accepteEmail: true }
    },
    { key: 'maison', name: 'Maison', type: 'polygon', fonction: 'batiment', elevation: 6, pts: rect(10, 10, 10, 8) },
    { key: 'p', name: 'Pergola 1', type: 'polygon', fonction: 'pergola', pts: rect(2, 2, 4, 3), pergola: { debord: 0.2 } },
    { key: 'k', name: 'Carport 1', type: 'polygon', fonction: 'carport', pts: rect(22, 2, 3, 5), pergola: { debord: 0.2 } }
  ];
}

describe('cerfa 13703 : ce que le plan sait ecrire', () => {
  it('decoupe une adresse de la BAN et une reference cadastrale', () => {
    expect(decouperAdresse('12 bis Rue des Lilas 78110 Le Vésinet')).toEqual({ numero: '12 bis', voie: 'Rue des Lilas', codePostal: '78110', localite: 'Le Vésinet' });
    expect(decouperAdresse('2 Allée des Limites 78110 Le Vésinet')).toEqual({ numero: '2', voie: 'Allée des Limites', codePostal: '78110', localite: 'Le Vésinet' });
    expect(decouperAdresse('12B Rue Haute 75001 Paris').numero).toBe('12B');
    expect(decouperAdresse('Chemin des Vignes 13100 Aix-en-Provence')).toEqual({ numero: '', voie: 'Chemin des Vignes', codePostal: '13100', localite: 'Aix-en-Provence' });
    expect(referenceCadastrale('78650000AB0123', 'AB', '0123')).toEqual({ prefixe: '000', section: 'AB', numero: '123' });
    expect(dateCerfa('1980-04-17')).toBe('17041980');
    expect(dateCerfa(new Date(2026, 9, 5))).toBe('05102026');
  });

  it('remplit le declarant, le terrain, le projet et le bordereau', () => {
    const r = remplirCerfa13703(projet(), new Date(2026, 9, 5), ['DP1', 'DP2', 'DP4']);
    expect(r.textes).toMatchObject({
      D1N_nom: 'DUPONT', D1P_prenom: 'Claire', D1A_naissance: '17041980', D3T_telephone: '0123456789',
      D5GE1_email: 'claire', D5GE2_email: 'exemple.fr', T2Q_numero: '12 bis', T2V_voie: 'Rue des Lilas', T2C_code: '78110',
      T2F_prefixe: '000', T2S_section: 'AB', T2N_numero: '123', T2T_superficie: '612', E1D_date: '05102026'
    });
    expect(r.cases).toEqual(expect.arrayContaining(['C2ZA1_nouvelle', 'C2ZF1_principale', 'D5A_acceptation', 'P5PA1', 'P5PB1', 'P3GD1']));
    expect(r.cases).not.toContain('P3GF1');
    expect(r.textes.C2ZD1_description).toMatch(/une pergola en bois de 4,00 x 3,00 m.*un carport \(abri de voiture ouvert\)/);
    expect(r.textes.C2ZA7_autres).toBe('pergola, carport (abri voiture ouvert)');
    expect(r.ouvrages).toHaveLength(2);
    expect(r.regime).toBe('permis');
    expect(r.manques.join(' ')).toMatch(/signature.*DP6.*DP7/);
  });

  it('passe en declaration sous 20 m² d\'emprise', () => {
    const r = remplirCerfa13703(projet().filter(o => o.key !== 'k'), new Date(), ['DP1']);
    expect(r.regime).toBe('declaration');
  });

  it('transcrit ce que la police du formulaire ne sait pas ecrire', () => {
    expect(pourWinAnsi('φ ≤ 2 m² — été')).toBe('phi <= 2 m² — été');
  });
});

describe('dossier de declaration prealable', () => {
  it('remplit le cerfa officiel et y ajoute les pieces numerotees', async () => {
    const res = await assemblerDossierMairie(lib, cerfa, projet(), { date: new Date(2026, 9, 5), meta: { adresse: '12 bis Rue des Lilas', references: 'AB 123' }, carte: PNG, vue3d: PNG });
    expect(res.pieces).toEqual(['DP1', 'DP2', 'DP4', 'DP6']);
    const relu = await lib.PDFDocument.load(res.pdf);
    // 15 pages du cerfa, la carte, l'extrait cadastral, le plan de masse, deux facades, l'insertion.
    expect(relu.getPageCount()).toBe(15 + 1 + 1 + 1 + 2 + 1);
    const form = relu.getForm();
    expect(form.getTextField('D1N_nom').getText()).toBe('DUPONT');
    expect(form.getTextField('T2V_voie').getText()).toBe('Rue des Lilas');
    expect(form.getTextField('C2ZD1_description').getText()).toMatch(/^Construction de une pergola/);
    expect(form.getCheckBox('P3GF1').isChecked()).toBe(true);
    expect(form.getCheckBox('C2ZA1_nouvelle').isChecked()).toBe(true);
    expect(form.getCheckBox('X1N_innovation').isChecked()).toBe(false);
  });

  it('se passe de la carte et de la vue 3D', async () => {
    const res = await assemblerDossierMairie(lib, cerfa, projet(), { date: new Date(), meta: {} });
    expect(res.pieces).toEqual(['DP1', 'DP2', 'DP4']);
    expect((await lib.PDFDocument.load(res.pdf)).getPageCount()).toBe(15 + 1 + 1 + 2);
  });
});

describe('section Déclaration préalable de la parcelle', () => {
  it('apparait sur la parcelle du projet, ecrit le declarant, previent du permis', async () => {
    const { sectionsObjet } = await import('../../../src/ui/champs/objet.js');
    const objets = projet();
    const parcelle = objets[0]!;
    parcelle.declaration = {};
    const c = { obj: parcelle, objets, parcelle, elevationOf: () => 0 } as unknown as import('../../../src/ui/champs/types.js').ContexteChamps;
    const s = sectionsObjet(c).find(x => x.id === 'declaration')!;
    expect(s).toBeDefined();
    const nom = s.champs.find(x => x.cle === 'dp-nom')!;
    if (nom.type !== 'texte') throw new Error('texte attendu');
    nom.ecrire(c, ' Martin ');
    expect(parcelle.declaration).toEqual({ nom: 'Martin' });
    nom.ecrire(c, '');
    expect(parcelle.declaration).toEqual({});
    expect(s.champs.find(x => x.cle === 'dp-permis')).toBeDefined();
    const autre = { ...c, obj: objets[2]! } as typeof c;
    expect(sectionsObjet(autre).find(x => x.id === 'declaration')).toBeUndefined();
  });
});
