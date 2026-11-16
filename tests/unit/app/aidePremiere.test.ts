// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { aidePremiere, demarrerAidePremiere, BULLES, CLE_AIDE_PREMIERE } from '../../../src/app/aidePremiere.js';
import { parcours } from '../../../src/app/parcours.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// L'aide de premiere utilisation (lot 2 de la simplification, 16 novembre 2026) : trois bulles, une fois par appareil, apres que le plan
// s'est affiche et que rien n'est ouvert par-dessus ; « Passer » les ferme toutes.

/** Un minuteur qu'on declenche a la main. */
function minuteur() { const f: (() => void)[] = []; return { horloge: (g: () => void) => { f.push(g); }, tic: () => f.splice(0).forEach((g) => g()) }; }

beforeEach(() => { localStorage.clear(); aidePremiere.passer(); parcours.fermer(); });

describe('l aide de premiere utilisation', () => {
  it('montre trois bulles, l une apres l autre, puis plus rien, et le retient', () => {
    const m = minuteur();
    demarrerAidePremiere(m.horloge);
    expect(aidePremiere.etape()).toBeNull();
    m.tic();
    expect(aidePremiere.etape()).toBe(0);
    expect(localStorage.getItem(CLE_AIDE_PREMIERE)).toBe('vue');
    expect(BULLES).toHaveLength(3);
    aidePremiere.suivante(); expect(aidePremiere.etape()).toBe(1);
    aidePremiere.suivante(); expect(aidePremiere.etape()).toBe(2);
    aidePremiere.suivante(); expect(aidePremiere.etape()).toBeNull();
  });

  it('ne revient pas sur un appareil qui l a vue', () => {
    localStorage.setItem(CLE_AIDE_PREMIERE, 'vue');
    const m = minuteur();
    demarrerAidePremiere(m.horloge);
    m.tic();
    expect(aidePremiere.etape()).toBeNull();
  });

  it('attend qu un parcours ouvert se ferme', () => {
    const m = minuteur();
    parcours.ouvrir({ type: 'texture', titre: 't', choisir: () => {} });
    demarrerAidePremiere(m.horloge);
    m.tic();
    expect(aidePremiere.etape()).toBeNull();
    expect(localStorage.getItem(CLE_AIDE_PREMIERE)).toBeNull();
    parcours.fermer();
    expect(aidePremiere.etape()).toBe(0);
  });

  it('« Passer » ferme toutes les bulles', () => {
    const m = minuteur();
    demarrerAidePremiere(m.horloge);
    m.tic();
    aidePremiere.passer();
    expect(aidePremiere.etape()).toBeNull();
  });

  it('dit a la souris et au doigt ce que fait la main', () => {
    expect(BULLES[0]!.souris).toMatch(/^Cliquez/);
    expect(BULLES[0]!.doigt).toMatch(/^Touchez/);
  });

  it('ne demarre ni dans la vitrine, ni dans l audit, ni pour un projet partage, ni en lecture seule', () => {
    const boot = readFileSync(resolve(__dirname, '../../../src/app/boot.ts'), 'utf8');
    expect(boot).toContain('if (!enAdmin() && !etat.lectureSeule) demarrerAidePremiere();');
    expect(boot).toContain('if (options.essai) demarrerAidePremiere();');
  });
});
