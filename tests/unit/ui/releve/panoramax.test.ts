import { describe, it, expect } from 'vitest';
import { bandeEquirectangulaire, champGrandCote, tailleRecadrage, CHAMP_RECADRAGE } from '../../../../src/ui/releve/panoramax.js';
import { capDeLOrientation } from '../../../../src/ui/releve/profondeur.js';
import { facadeFaceAuCap, facadesDuContour } from '../../../../src/facade/geometrie.js';

describe('bandeEquirectangulaire', () => {
  const img = { naturalWidth: 3600, naturalHeight: 1800 };
  it('decoupe la bande utile a pleine definition', () => {
    const b = bandeEquirectangulaire(img, 0, { azimutGauche: -30, azimutDroit: 30, elevationHaut: 20, elevationBas: -20 });
    expect(b.largeur).toBe(600);
    expect(b.hauteur).toBe(400);
    expect(b.morceaux).toEqual([{ sx: 1500, sy: 700, sw: 600, sh: 400, dx: 0 }]);
  });
  it('coupe en deux morceaux quand la bande passe le bord droit de l image', () => {
    const b = bandeEquirectangulaire(img, 0, { azimutGauche: 160, azimutDroit: 200, elevationHaut: 10, elevationBas: -10 });
    expect(b.largeur).toBe(400);
    expect(b.morceaux).toEqual([{ sx: 3400, sy: 800, sw: 200, sh: 200, dx: 0 }, { sx: 0, sy: 800, sw: 200, sh: 200, dx: 200 }]);
  });
  it('tient compte du cap du milieu de l image', () => {
    const b = bandeEquirectangulaire(img, 90, { azimutGauche: 80, azimutDroit: 100, elevationHaut: 10, elevationBas: -10 });
    expect(b.morceaux[0]!.sx).toBe(1700);
  });
});

describe('tailleRecadrage et champGrandCote', () => {
  it('garde la definition du panoramique sans l agrandir ni depasser le plafond', () => {
    expect(tailleRecadrage(8192)).toEqual({ largeur: Math.round((8192 * CHAMP_RECADRAGE) / 360), hauteur: Math.round((Math.round((8192 * CHAMP_RECADRAGE) / 360) * 3) / 4) });
    expect(tailleRecadrage(16000).largeur).toBe(2000);
    expect(tailleRecadrage(1000).largeur).toBe(400);
  });
  it('le champ horizontal d une photo en portrait est celui du petit cote', () => {
    expect(champGrandCote(40, 4000, 3000)).toBe(40);
    expect(champGrandCote(40, 3000, 4000)).toBeCloseTo(51.7, 0);
  });
});

describe('boussole', () => {
  it('capDeLOrientation : iOS, Android absolu, rien sinon', () => {
    expect(capDeLOrientation({ webkitCompassHeading: 95, alpha: 10 })).toBe(95);
    expect(capDeLOrientation({ alpha: 270, absolute: true })).toBe(90);
    expect(capDeLOrientation({ alpha: 270, absolute: false })).toBeNull();
    expect(capDeLOrientation({})).toBeNull();
  });
  it('facadeFaceAuCap : la facade qui fait face a qui regarde vers le cap', () => {
    const f = facadesDuContour([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 6 }, { x: 0, y: 6 }], 5);
    // Regarder vers le nord, c'est avoir devant soi la facade sud.
    expect(facadeFaceAuCap(f, 0)?.orientation).toBe('Sud');
    expect(facadeFaceAuCap(f, 260)?.orientation).toBe('Est');
    // Vers le nord-est, on est entre les facades sud et ouest : a 40 degres pres, aucune ne fait face.
    expect(facadeFaceAuCap(f, 45, 40)).toBeNull();
    expect(facadeFaceAuCap(f, 45)?.orientation).toBeDefined();
  });
});
