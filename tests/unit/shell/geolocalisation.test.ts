import { describe, it, expect, vi, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { lirePositionGps, geolocalisationDisponible, SansPosition } from '../../../src/shell/geolocalisation.js';

// La position de l'appareil : l'API du navigateur, ses trois refus, et l'en-tete du serveur qui
// doit la permettre au site lui-meme — `geolocation=()` l'interdisait, meme apres permission.

afterEach(() => vi.unstubAllGlobals());

const racine = path.resolve(__dirname, '../../..');
type Rappels = [(p: unknown) => void, (e: unknown) => void, unknown];
function navigateur(agir: (ok: Rappels[0], ko: Rappels[1]) => void) {
  const getCurrentPosition = vi.fn((ok: Rappels[0], ko: Rappels[1]) => agir(ok, ko));
  vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } });
  vi.stubGlobal('isSecureContext', true);
  return getCurrentPosition;
}
const erreur = (code: number) => ({ code, PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 });

describe('lirePositionGps', () => {
  it('rend la position et sa precision, en demandant la plus precise', async () => {
    const appel = navigateur((ok) => ok({ coords: { latitude: 48.9, longitude: 2.15, accuracy: 7.4 } }));
    expect(await lirePositionGps()).toEqual({ lat: 48.9, lon: 2.15, precisionM: 7.4 });
    expect((appel.mock.calls as unknown as unknown[][])[0]![2]).toMatchObject({ enableHighAccuracy: true });
  });

  it('dit pourquoi il n y a pas de position : refus, delai, ou rien', async () => {
    navigateur((_ok, ko) => ko(erreur(1)));
    await expect(lirePositionGps()).rejects.toMatchObject({ raison: 'refusee' });
    navigateur((_ok, ko) => ko(erreur(3)));
    await expect(lirePositionGps()).rejects.toMatchObject({ raison: 'delai' });
    navigateur((_ok, ko) => ko(erreur(2)));
    await expect(lirePositionGps()).rejects.toBeInstanceOf(SansPosition);
  });

  it('n existe pas sans API ni hors contexte securise', async () => {
    vi.stubGlobal('navigator', {});
    expect(geolocalisationDisponible()).toBe(false);
    await expect(lirePositionGps()).rejects.toMatchObject({ raison: 'indisponible' });
    navigateur(() => {});
    vi.stubGlobal('isSecureContext', false);
    expect(geolocalisationDisponible()).toBe(false);
  });
});

describe('l en-tete Permissions-Policy du serveur', () => {
  it('permet la position au site lui-meme, sur Apache comme sur le serveur Node', () => {
    for (const f of ['deploy/htaccess.template', 'buildsg/app.js']) {
      const texte = readFileSync(path.join(racine, f), 'utf8');
      expect(texte, f).toContain('geolocation=(self)');
      expect(texte, f).not.toContain('geolocation=()');
    }
  });
});
