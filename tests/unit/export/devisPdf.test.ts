import { describe, it, expect } from 'vitest';
import { creerEtat } from '../../../src/core/state.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { DEMO_TEMOIN_OBJECTS, DEMO_MEASURES } from '../../../src/model/demo.js';
import { chantierDuProjet, clientDuProjet, construireDevisPDF, nombreFr, nomFichierDevis, numeroDevis } from '../../../src/export/devisPdf.js';
import { couperWinAnsi, enWinAnsi, largeurWinAnsi, octetsPdf } from '../../../src/export/pdf/winAnsi.js';
import { assemblerPDF } from '../../../src/export/pdf/writer.js';
import { chiffrerProjet } from '../../../src/engine/postes.js';
import type { ObjetBrut, ObjetPlan } from '../../../src/model/types.js';

// Le devis d'une page (export/devisPdf.ts) : ce qu'il imprime, d'ou il le tient, et qu'il ne devine rien (ni TVA, ni client).

const JOUR = new Date('2026-11-16T10:00:00');
function demo(): ObjetPlan[] {
  return creerEtat({ objects: JSON.parse(JSON.stringify(DEMO_TEMOIN_OBJECTS)), measures: DEMO_MEASURES } as Parameters<typeof creerEtat>[0],
    (b: ObjetBrut[]) => normalizeObjects(b) as ObjetPlan[]).objects;
}
/** Les textes poses sur la page, dans l'ordre, tels qu'ecrits (WinAnsi) : on les compare a `enWinAnsi(attendu)`. */
const ecrits = (pdf: string) => [...pdf.matchAll(/\((.*?)\) Tj/g)].map((m) => m[1]!.replace(/\\([()\\])/g, '$1'));
/** Un texte de la page, ecrit en francais dans le test. */
const textes = (pdf: string) => { const e = ecrits(pdf); return { contient: (t: string) => e.includes(enWinAnsi(t)), tout: () => e.join('\n'), un: (re: RegExp) => e.some((x) => re.test(x)) }; };
const devis = (objets: ObjetPlan[], plus: Partial<Parameters<typeof construireDevisPDF>[2]> = {}) =>
  construireDevisPDF(objets, ['terrasse', 'table'], { appVersion: '5.32.0', buildAt: '2026-10-30', maintenant: JOUR, nomProjet: 'Parcelle AE 101', ...plus })!;

describe('le devis PDF', () => {
  it('la demonstration tient sur une page, ecrite en WinAnsi, avec ses accents et le signe euro', () => {
    const r = devis(demo());
    expect(r.pages).toBe(1);
    expect(r.pdf).toMatch(/\/BaseFont \/Helvetica \/Encoding \/WinAnsiEncoding/);
    expect(r.pdf).toMatch(/\/BaseFont \/Helvetica-Bold \/Encoding \/WinAnsiEncoding/);
    expect([...r.pdf].every((c) => c.charCodeAt(0) < 256)).toBe(true);
    const t = textes(r.pdf);
    expect(t.contient('DEVIS')).toBe(true);
    expect(t.contient('N° PARCELLE-AE-101-20261116')).toBe(true);
    expect(t.contient('Établi le 16/11/2026')).toBe(true);
    expect(t.contient('T1 — Terrasse')).toBe(true);
    expect(t.contient('T2 — Table')).toBe(true);
    expect(t.contient('35,00 €/u')).toBe(true);
    expect(t.contient('1 295,00 €')).toBe(true);
    expect(r.nomFichier).toBe('devis-parcelle-ae-101-20261116.pdf');
  });

  it('imprime les postes et les totaux du chiffrage, rien d autre', () => {
    const objets = demo();
    const c = chiffrerProjet(objets, ['terrasse', 'table']);
    const t = textes(devis(objets).pdf);
    for (const terrasse of c.terrasses) for (const p of terrasse.postes) expect(t.tout()).toContain(enWinAnsi(p.libelle.split(' ')[0]!));
    const arrondi = (v: number) => nombreFr(Math.round(v), 0) + ' €';
    expect(t.contient(arrondi(c.total.bas) + ' – ' + arrondi(c.total.haut))).toBe(true);
    expect(t.contient('Total HT estimé')).toBe(true);
  });

  it('sans taux, la TVA n est pas comprise et rien de TTC ne s ecrit ; avec un taux, la TVA et le TTC', () => {
    const sans = textes(devis(demo()).pdf);
    expect(sans.contient('non comprise')).toBe(true);
    expect(sans.un(/TTC/)).toBe(false);
    const avec = textes(devis(demo(), { tauxTva: 5.5 }).pdf);
    expect(avec.contient('TVA 5,5 %')).toBe(true);
    expect(avec.contient('Total TTC estimé')).toBe(true);
    expect(avec.contient('non comprise')).toBe(false);
  });

  it('le client vient de la declaration prealable, le chantier de l adresse du terrain ; rien n est invente sans eux', () => {
    const objets = demo();
    expect(clientDuProjet(objets)).toEqual([]);
    expect(chantierDuProjet(objets)).toEqual(['2 Allee des Limites', '78110 Le Vesinet', 'Parcelle cadastrale AE 101']);
    const vide = textes(devis(objets).pdf);
    expect(vide.contient('Émetteur non renseigné')).toBe(true);
    expect(vide.contient('À compléter (Exporter › Devis : le client)')).toBe(true);
    const parcelle = objets.find((o) => o.key === 'parcelle')!;
    parcelle.declaration = { prenom: 'Claire', nom: 'Martin', numero: '2', voie: 'Allée des Limites', codePostal: '78110', localite: 'Le Vésinet', terrainVoie: 'Allée des Limites', terrainNumero: '2' };
    expect(clientDuProjet(objets)).toEqual(['Claire Martin', '2 Allée des Limites', '78110 Le Vésinet']);
    expect(chantierDuProjet(objets)[0]).toBe('2 Allée des Limites');
    const t = textes(devis(objets, { emetteur: { nom: 'Atelier Bois', mentions: 'SIRET 000' }, numero: 'D-42' }).pdf);
    expect(t.contient('Claire Martin')).toBe(true);
    expect(t.contient('Atelier Bois')).toBe(true);
    expect(t.contient('SIRET 000')).toBe(true);
    expect(t.contient('N° D-42')).toBe(true);
  });

  it('sans terrasse retenue, pas de devis ; beaucoup de terrasses passent sur une seconde page', () => {
    const objets = demo();
    expect(construireDevisPDF(objets, [], { appVersion: '5.32.0', maintenant: JOUR })).toBeNull();
    const base = objets.find((o) => o.key === 'terrasse')!;
    const copies = [1, 2, 3, 4].map((i) => ({ ...JSON.parse(JSON.stringify(base)), key: 'copie' + i, name: 'Copie ' + i }) as ObjetPlan);
    const r = construireDevisPDF([...objets, ...copies], ['terrasse', 'table', ...copies.map((c) => c.key)], { appVersion: '5.32.0', maintenant: JOUR })!;
    expect(r.pages).toBe(2);
    expect(textes(r.pdf).contient('Page 2 / 2')).toBe(true);
  });

  it('le numero propose est tire du projet et du jour, jamais d un compteur', () => {
    expect(numeroDevis('Parcelle AE 101', JOUR)).toBe('PARCELLE-AE-101-20261116');
    expect(numeroDevis(null, JOUR)).toBe('PLAN-20261116');
    expect(nomFichierDevis('D-42 / bis')).toBe('devis-d-42-bis.pdf');
  });
});

describe('le texte en WinAnsi', () => {
  it('ecrit les accents, l euro et la typographie, un octet par signe', () => {
    expect(enWinAnsi('é€’–—«»œ')).toBe('\xe9\x80\x92\x96\x97\xab\xbb\x9c');
    expect(enWinAnsi('1 234 €')).toBe('1 234 \x80');
    expect(enWinAnsi('ă→✓')).toBe('a->?');
    expect(octetsPdf('\xe9\x80')).toEqual(new Uint8Array([0xe9, 0x80]));
  });
  it('mesure les textes aux chasses de la police, et coupe a la largeur', () => {
    // Helvetica : « 0 » 556, espace 278 ; Helvetica-Bold : « W » 944.
    expect(largeurWinAnsi('00 0', 10)).toBeCloseTo(19.46, 5);
    expect(largeurWinAnsi('W', 10, true)).toBeCloseTo(9.44, 5);
    expect(couperWinAnsi('un deux trois quatre', largeurWinAnsi('un deux', 9), 9)).toEqual(['un deux', 'trois', 'quatre']);
  });
  it('les formats francais ne dependent pas de la machine', () => {
    expect(nombreFr(1234567.891, 2)).toBe('1 234 567,89');
    expect(nombreFr(-0.001, 2)).toBe('0,00');
    expect(nombreFr(950, 0)).toBe('950');
  });
  it('sans l option, l assemblage ecrit le PDF d avant, octet pour octet', () => {
    const pages = [{ l: 100, h: 100, contenu: 'BT ET' }];
    const avant = assemblerPDF(pages, { appVersion: '1', buildAt: 'b', maintenant: JOUR });
    expect(avant).not.toMatch(/WinAnsi|Helvetica-Bold|\/F2/);
    expect(assemblerPDF(pages, { appVersion: '1', buildAt: 'b', maintenant: JOUR }, {})).toBe(avant);
  });
});
