import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { creerEtat } from '../../../src/core/state.js';
import { normalizeObjects } from '../../../src/model/normalisation.js';
import { DEMO_TEMOIN_OBJECTS, DEMO_MEASURES } from '../../../src/model/demo.js';
import { construireSVG } from '../../../src/export/svgPlan.js';
import { construireDXF } from '../../../src/export/dxfPlan.js';
import { construirePDF } from '../../../src/export/pdfPlan.js';
import { construireDossierPDF } from '../../../src/export/dossierPdf.js';
import { construireResume } from '../../../src/export/resume.js';
import { creerMesures } from '../../../src/app/assemblage/mesures.js';
import { clesDossier } from '../../../src/app/dossier.js';
import { contraindreParasols } from '../../../src/engine/parasol.js';
import { schemaMinimal } from '../../../src/model/migrations.js';
import type { ObjetBrut, ObjetPlan } from '../../../src/model/types.js';

const dorees = resolve(__dirname, '../../fixtures/golden');
const lire = (nom: string) => readFileSync(resolve(dorees, nom), 'latin1');

/** La normalisation d'EMPREINTES.md : dates et horodatages remplaces par un motif de meme longueur. */
const neutraliser = (s: string) => s
  .replace(/\d{2}\/\d{2}\/\d{4}/g, 'JJ/MM/AAAA')
  .replace(/D:\d{14}/g, 'D:AAAAMMJJHHMMSS');
// Le navigateur ecrit un `Blob([texte])` en UTF-8 : c'est ce que les temoins portent. On encode de
// meme, puis on relit en latin1, comme le test d'echafaudage lit les fichiers.
const enOctets = (s: string) => Buffer.from(s, 'utf8').toString('latin1');
const ecrire = (nom: string, s: string) => { const o = enOctets(s); if (process.env.SORTIE) writeFileSync(process.env.SORTIE + '/' + nom, o, 'latin1'); return o; };
const empreinte = (s: string) => createHash('sha256').update(Buffer.from(neutraliser(s), 'latin1')).digest('hex');

// Les temoins ont ete recaptures a la 5.2.0, build du 30 octobre 2026 (EMPREINTES.md) : les
// generateurs recoivent ces valeurs en parametre, et l'horloge est posee au jour de la capture. Le
// schema est celui que l'application ecrit pour ce plan : le plus petit qui le decrit, 3 depuis que
// sa maison porte un toit a croupes (model/migrations.ts, MD/spec-toit-ign.md).
const VERSION = '5.2.0', BUILD = '2026-10-30', SCHEMA = schemaMinimal(DEMO_TEMOIN_OBJECTS);

function etatTemoin() {
  const etat = creerEtat({ objects: DEMO_TEMOIN_OBJECTS, measures: DEMO_MEASURES } as Parameters<typeof creerEtat>[0],
    (b: ObjetBrut[]) => normalizeObjects(b) as ObjetPlan[]);
  // Le premier rendu contraint les parasols a leur terrasse avant tout export (app/assemblage/dessin.ts) :
  // le temoin a ete capture apres lui.
  contraindreParasols(etat.objects, etat.terrasseSelectedKey);
  return etat;
}

beforeAll(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-09-28T23:22:00')); });
afterAll(() => { vi.useRealTimers(); });

describe('les exports, regeneres depuis le code, redonnent les temoins (FF-4)', () => {
  it('plan.svg', () => {
    const e = etatTemoin();
    expect(empreinte(ecrire('plan.svg', construireSVG(e.objects, e.measures, { appVersion: VERSION, schemaVersion: SCHEMA })))).toBe(empreinte(lire('plan.svg')));
  });
  it('plan.dxf', () => {
    const e = etatTemoin();
    expect(empreinte(ecrire('plan.dxf', construireDXF(e.objects, e.measures, 'Plan interactif ' + VERSION + ' — 28/09/2026')))).toBe(empreinte(lire('plan.dxf')));
  });
  it('resume.txt', () => {
    const e = etatTemoin();
    const m = creerMesures(e);
    const txt = construireResume(e.objects, e.measures, { appVersion: VERSION, computeMeasureGeom: m.computeMeasureGeom, refLabel: m.refLabel, targetLabel: m.targetLabel });
    expect(empreinte(ecrire('resume.txt', txt))).toBe(empreinte(lire('resume.txt')));
  });
  it('quantites-demo.txt : chaque surface et chaque longueur se retrouvent, dans l ordre, dans le resume regenere', () => {
    // Le fichier qu'EMPREINTES.md dit de regarder en premier : il nomme le nombre qui a change, la ou l'empreinte dit seulement
    // que quelque chose a change. Il n'etait verifie par rien.
    const e = etatTemoin();
    const m = creerMesures(e);
    const txt = construireResume(e.objects, e.measures, { appVersion: VERSION, computeMeasureGeom: m.computeMeasureGeom, refLabel: m.refLabel, targetLabel: m.targetLabel });
    let depuis = 0;
    for (const ligne of readFileSync(resolve(dorees, 'quantites-demo.txt'), 'utf8').split('\n').filter((l) => l.trim())) {
      const k = txt.indexOf(ligne, depuis);
      expect(k, 'absente du resume : ' + ligne).toBeGreaterThanOrEqual(0);
      depuis = k + ligne.length;
    }
  });
  it('plan.pdf', () => {
    const e = etatTemoin();
    const pdf = construirePDF(e.objects, e.measures, 200, { appVersion: VERSION, buildAt: BUILD, montrerNord: e.showNorth });
    expect(empreinte(ecrire('plan.pdf', pdf))).toBe(empreinte(lire('plan.pdf')));
  });
  it('dossier.pdf', () => {
    const e = etatTemoin();
    // La version, le build et l'heure se passent en parametre (MetaDossier) : plus d'octets a reecrire.
    const { pdf } = construireDossierPDF(e.objects, clesDossier(e.objects), true, { appVersion: VERSION, buildAt: BUILD, nomProjet: 'Parcelle AE 101', maintenant: new Date('2026-09-28T23:22:00') });
    expect(empreinte(ecrire('dossier.pdf', pdf))).toBe(empreinte(lire('dossier.pdf')));
  });
});
