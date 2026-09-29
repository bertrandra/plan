import { describe, it, expect } from 'vitest';
import { genreCamera, grandAngleParmi, champAvecZoom, zoomGrandAngle, CHAMP_GRAND_ANGLE_DEFAUT } from '../../../src/facade/objectifs.js';
import { champDepuisFocale35 } from '../../../src/facade/exif.js';

describe('genreCamera', () => {
  it('reconnait les cameras d un iPhone, en anglais et en francais', () => {
    expect(genreCamera('Back Ultra Wide Camera')).toBe('grand-angle');
    expect(genreCamera('Caméra arrière ultra grand-angle')).toBe('grand-angle');
    expect(genreCamera('Back Camera')).toBe('arriere');
    expect(genreCamera('Back Telephoto Camera')).toBe('tele');
    expect(genreCamera('Back Triple Camera')).toBe('virtuelle');
    expect(genreCamera('Back Dual Wide Camera')).toBe('virtuelle');
    expect(genreCamera('Front Camera')).toBe('avant');
  });

  it('ne devine rien sur un nom Android anonyme', () => {
    expect(genreCamera('camera2 2, facing back')).toBe('arriere');
  });
});

describe('grandAngleParmi', () => {
  it('trouve l identifiant du grand-angle', () => {
    const cameras = [
      { deviceId: 'a', label: 'Front Camera' },
      { deviceId: 'b', label: 'Back Camera' },
      { deviceId: 'c', label: 'Back Ultra Wide Camera' },
    ];
    expect(grandAngleParmi(cameras)).toBe('c');
  });

  it('ne trouve rien avant la permission (noms vides)', () => {
    expect(grandAngleParmi([{ deviceId: 'x', label: '' }])).toBeNull();
  });
});

describe('champ et zoom', () => {
  it('un zoom de 0,5 double la tangente du demi-champ', () => {
    const c = champAvecZoom(67, 0.5);
    expect(Math.tan((c * Math.PI) / 360)).toBeCloseTo(2 * Math.tan((67 * Math.PI) / 360), 9);
    expect(c).toBeGreaterThan(100);
    expect(champAvecZoom(67, 1)).toBeCloseTo(67, 9);
  });

  it('le grand-angle par defaut est celui d un 13 mm', () => {
    expect(champDepuisFocale35(13)).toBeCloseTo(CHAMP_GRAND_ANGLE_DEFAUT, 0);
  });

  it('ne retient qu un zoom nettement inferieur a 1', () => {
    expect(zoomGrandAngle(0.5)).toBe(0.5);
    expect(zoomGrandAngle(1)).toBeNull();
    expect(zoomGrandAngle(undefined)).toBeNull();
  });
});
