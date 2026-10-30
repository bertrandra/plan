import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { construireDossierPiscine } from '../../../src/export/dossierPiscine.js';
import { construireNoteCalculPDF } from '../../../src/export/noteCalculPdf.js';
import { calculerPiscine } from '../../../src/engine/piscine.js';
import { calculerPergola, chiffrerPergola } from '../../../src/engine/abri/pergola.js';
import { nouvellePiscine } from '../../../src/model/creation.js';
import type { ObjetPlan } from '../../../src/model/types.js';

// Les exports et les calculs qu'aucune empreinte ne gardait (audit d'architecture, 25 octobre 2026) : le dossier de mairie d'une
// piscine, la note de calcul d'un abri, et les calculs de la piscine et de la pergola. Tout se passe en parametre (version, build,
// date) : rien ne depend de l'horloge ni de la machine. `REECRIRE_EMPREINTES=1` recapture les temoins, ce qui se dit dans
// EMPREINTES.md (une quantite ou un export qui bouge est un evenement de version, CLAUDE.md).

const dorees = resolve(__dirname, '../../fixtures/golden');
const VERSION = '5.1.0', BUILD = '2026-10-30', JOUR = new Date('2026-09-28T23:22:00');
const temoin = (nom: string, contenu: string) => {
  const chemin = resolve(dorees, nom);
  if (process.env.REECRIRE_EMPREINTES) writeFileSync(chemin, contenu, 'latin1');
  return readFileSync(chemin, 'latin1');
};
const empreinte = (s: string) => createHash('sha256').update(Buffer.from(s, 'latin1')).digest('hex');

const parcelle: ObjetPlan = {
  key: 'parcelle', name: 'Parcelle AE 101', type: 'polygon', fonction: 'terrain', nomLieu: 'Le Vésinet', latitude: 48.89, longitude: 2.13,
  pts: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 25 }, { x: 0, y: 25 }], segmentNames: ['Sud', 'Est', 'Nord', 'Ouest'],
  cadastre: { section: 'AE', numero: '0101', commune: 'Le Vésinet', contenance: 750 }
};
const maison: ObjetPlan = { key: 'm', name: 'Maison', type: 'polygon', fonction: 'batiment', fill: '#ddd', stroke: '#333', pts: [{ x: 5, y: 15 }, { x: 15, y: 15 }, { x: 15, y: 22 }, { x: 5, y: 22 }] };
// Le bassin par defaut (32 m2) : sa taxe d'amenagement, 8 000 EUR de base, passe les milliers, ou le moteur ecrivait une espace
// insecable (U+202F) que la police du PDF n'a pas.
const piscine = nouvellePiscine('rectangle', { x: 15, y: 8 }, 'p', 1).obj;
const abri: ObjetPlan = {
  key: 'a', name: 'Carport 1', type: 'polygon', fonction: 'carport',
  pts: [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 5 }, { x: 0, y: 5 }], pergola: { calcul: { zoneNeige: 'C1', zoneVent: 2, altitude: 300 } }
};

describe('les empreintes de la piscine, de la pergola et de la note de calcul', () => {
  it('dossier-piscine.pdf', () => {
    const { pdf } = construireDossierPiscine([parcelle, maison, piscine], null, { appVersion: VERSION, buildAt: BUILD, maintenant: JOUR, nomProjet: 'Parcelle AE 101', dateDuJour: () => '28/09/2026' });
    expect([...pdf].every((ch) => ch.charCodeAt(0) < 256), 'un caractere hors latin1 dans le PDF').toBe(true);
    expect(empreinte(pdf)).toBe(empreinte(temoin('dossier-piscine.pdf', pdf)));
  });
  it('note-calcul.pdf', () => {
    const { pdf } = construireNoteCalculPDF(abri, { appVersion: VERSION, buildAt: BUILD, date: JOUR, nomProjet: 'Maison' })!;
    expect(empreinte(pdf)).toBe(empreinte(temoin('note-calcul.pdf', pdf)));
  });
  it('moteur-piscine-pergola.json', () => {
    const p = calculerPiscine(piscine, [parcelle, maison, piscine]);
    const g = calculerPergola(abri);
    const json = JSON.stringify({ piscine: p, pergola: g, chiffragePergola: g ? chiffrerPergola(g) : null }, null, 1) + '\n';
    expect(empreinte(json)).toBe(empreinte(temoin('moteur-piscine-pergola.json', json)));
  });
});
