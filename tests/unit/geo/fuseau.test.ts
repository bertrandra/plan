import { describe, it, expect, afterEach, vi } from 'vitest';
import {
  fuseauDuLieu, decalageFuseau, decalageALHeureLocale, decalageSansIntl, decalageFuseauFrance, lireDecalage,
  libelleHeureLegale, oublierFuseaux
} from '../../../src/geo/fuseau.js';
import { positionSoleil, leverEtCoucher } from '../../../src/geo/soleil.js';

// La formule d'avant le fuseau du lieu (geo/soleil.ts au 28 octobre 2026), recopiee telle quelle : le decalage de la France,
// lu a midi UTC du jour, pour toute la journee.
function positionAvant(annee: number, mois: number, jour: number, heureDecimale: number, latDeg: number, lonDeg: number) {
  const jourAnnee = Math.floor((Date.UTC(annee,mois-1,jour) - Date.UTC(annee,0,1))/86400000) + 1;
  const decalageFuseauH = decalageFuseauFrance(annee, Date.UTC(annee,mois-1,jour,12,0,0));
  const B = (360/365) * (jourAnnee - 81) * Math.PI/180;
  const eot = 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B);
  const tc = 4*(lonDeg - 15*decalageFuseauH) + eot;
  const heureSolaire = heureDecimale + tc/60;
  const haRad = (15*(heureSolaire - 12)) * Math.PI/180;
  const declRad = (23.45*Math.PI/180) * Math.sin((360/365)*(284+jourAnnee)*Math.PI/180);
  const latRad = latDeg*Math.PI/180;
  const elevRad = Math.asin(Math.sin(declRad)*Math.sin(latRad) + Math.cos(declRad)*Math.cos(latRad)*Math.cos(haRad));
  let cosAz = (Math.sin(declRad) - Math.sin(elevRad)*Math.sin(latRad)) / (Math.cos(elevRad)*Math.cos(latRad));
  cosAz = Math.max(-1, Math.min(1, cosAz));
  let azRad = Math.acos(cosAz);
  if(haRad > 0) azRad = 2*Math.PI - azRad;
  return { elevRad, azRad };
}

/** Le dernier dimanche du mois (1 a 12), jour du mois. */
function dernierDimanche(annee: number, mois: number): number {
  const d = new Date(Date.UTC(annee, mois, 0));
  return d.getUTCDate() - d.getUTCDay();
}

const VESINET = { lat: 48.8923, lon: 2.1331 };
const degres = (r: number) => r * 180 / Math.PI;

afterEach(() => { vi.restoreAllMocks(); oublierFuseaux(); });

describe('fuseauDuLieu', () => {
  const zone = (lat: number, lon: number) => fuseauDuLieu(lat, lon).zone;
  it('met la France metropolitaine et la Corse a Paris, sans repli', () => {
    const villes: [string, number, number][] = [
      ['Le Vésinet', 48.8923, 2.1331], ['Lille', 50.63, 3.06], ['Strasbourg', 48.58, 7.75], ['Mulhouse', 47.75, 7.34],
      ['Forbach', 49.19, 6.90], ['Wissembourg', 49.04, 7.94], ['Delle', 47.51, 6.99], ['Annemasse', 46.19, 6.24],
      ['Thonon', 46.37, 6.48], ['Chamonix', 45.92, 6.87], ['Briançon', 44.90, 6.64], ['Menton', 43.78, 7.50], ['Nice', 43.70, 7.27],
      ['Marseille', 43.30, 5.37], ['Perpignan', 42.70, 2.90], ['Hendaye', 43.36, -1.77], ['Biarritz', 43.48, -1.56],
      ['Bordeaux', 44.84, -0.58], ['Île d’Yeu', 46.71, -2.35], ['Belle-Île', 47.33, -3.18], ['Brest', 48.39, -4.49],
      ['Ouessant', 48.46, -5.09], ['Cherbourg', 49.64, -1.62], ['Calais', 50.95, 1.86], ['Dunkerque', 51.03, 2.37],
      ['Sedan', 49.70, 4.94], ['Longwy', 49.52, 5.76], ['Ajaccio', 41.92, 8.74], ['Bastia', 42.70, 9.45]
    ];
    for (const [nom, lat, lon] of villes) {
      const f = fuseauDuLieu(lat, lon);
      expect([nom, f.zone, f.repli]).toEqual([nom, 'Europe/Paris', false]);
    }
    expect(fuseauDuLieu(48.8923, 2.1331).nom).toBe('France');
  });
  it('reconnait les outre-mer', () => {
    expect(zone(16.24, -61.53)).toBe('America/Guadeloupe');   // Pointe-a-Pitre
    expect(zone(14.60, -61.07)).toBe('America/Martinique');   // Fort-de-France
    expect(zone(18.07, -63.08)).toBe('America/Guadeloupe');   // Marigot (Saint-Martin)
    expect(zone(17.90, -62.85)).toBe('America/Guadeloupe');   // Gustavia
    expect(zone(4.94, -52.33)).toBe('America/Cayenne');
    expect(zone(-20.88, 55.45)).toBe('Indian/Reunion');       // Saint-Denis
    expect(zone(-12.78, 45.23)).toBe('Indian/Mayotte');       // Mamoudzou
    expect(zone(46.78, -56.17)).toBe('America/Miquelon');     // Saint-Pierre
    expect(zone(-17.54, -149.57)).toBe('Pacific/Tahiti');     // Papeete
    expect(zone(-8.91, -140.10)).toBe('Pacific/Marquesas');   // Nuku Hiva
    expect(zone(-23.12, -134.97)).toBe('Pacific/Gambier');    // Rikitea
    expect(zone(-22.27, 166.45)).toBe('Pacific/Noumea');
    expect(zone(-13.28, -176.17)).toBe('Pacific/Wallis');     // Mata-Utu
  });
  it('reconnait les voisins', () => {
    expect(zone(50.85, 4.35)).toBe('Europe/Brussels');
    expect(zone(50.74, 3.21)).toBe('Europe/Brussels');        // Mouscron
    expect(zone(49.61, 6.13)).toBe('Europe/Luxembourg');
    expect(zone(46.20, 6.15)).toBe('Europe/Zurich');          // Geneve
    expect(zone(47.56, 7.59)).toBe('Europe/Zurich');          // Bale
    expect(zone(43.74, 7.42)).toBe('Europe/Monaco');
    expect(zone(42.51, 1.52)).toBe('Europe/Andorra');
    expect(zone(49.23, 6.99)).toBe('Europe/Berlin');          // Sarrebruck
    expect(zone(48.57, 7.81)).toBe('Europe/Berlin');          // Kehl
    expect(zone(45.07, 7.69)).toBe('Europe/Rome');            // Turin
    expect(zone(43.79, 7.61)).toBe('Europe/Rome');            // Vintimille
    expect(zone(38.12, 13.36)).toBe('Europe/Rome');           // Palerme
    expect(zone(41.39, 2.17)).toBe('Europe/Madrid');          // Barcelone
    expect(zone(43.32, -1.98)).toBe('Europe/Madrid');         // Saint-Sebastien
    expect(zone(39.57, 2.65)).toBe('Europe/Madrid');          // Palma
    expect(zone(28.12, -15.43)).toBe('Atlantic/Canary');
  });
  it('retombe sur Paris ailleurs, et le dit', () => {
    for (const [lat, lon] of [[51.51, -0.13], [38.72, -9.14], [36.75, 3.06], [36.81, 10.18], [40.71, -74.0], [49.19, -2.11]]) {
      expect(fuseauDuLieu(lat!, lon!)).toEqual({ zone: 'Europe/Paris', nom: 'France', repli: true });
    }
    expect(libelleHeureLegale(fuseauDuLieu(51.51, -0.13))).toBe('Heure légale de France (Europe/Paris), faute de connaître le fuseau de ce lieu');
  });
  it('se dit en francais', () => {
    expect(libelleHeureLegale(fuseauDuLieu(48.89, 2.13))).toBe('Heure légale de France (Europe/Paris)');
    expect(libelleHeureLegale(fuseauDuLieu(-20.88, 55.45))).toBe('Heure légale de La Réunion (Indian/Reunion)');
    expect(libelleHeureLegale(fuseauDuLieu(49.61, 6.13))).toBe('Heure légale du Luxembourg (Europe/Luxembourg)');
    expect(libelleHeureLegale(fuseauDuLieu(-8.91, -140.10))).toBe('Heure légale des Marquises (Pacific/Marquesas)');
  });
});

describe('decalageFuseau', () => {
  it('lit le decalage de Intl', () => {
    expect(lireDecalage('GMT+2')).toBe(2);
    expect(lireDecalage('GMT-9:30')).toBe(-9.5);
    expect(lireDecalage('GMT')).toBe(0);
    expect(lireDecalage('UTC+11')).toBe(11);
    expect(lireDecalage('heure de Paris')).toBe(null);
    expect(decalageFuseau('Indian/Reunion', Date.UTC(2026, 6, 1))).toBe(4);
    expect(decalageFuseau('America/Cayenne', Date.UTC(2026, 0, 1))).toBe(-3);
    expect(decalageFuseau('Pacific/Noumea', Date.UTC(2026, 0, 1))).toBe(11);
    expect(decalageFuseau('Pacific/Marquesas', Date.UTC(2026, 0, 1))).toBe(-9.5);
    expect(decalageFuseau('America/Miquelon', Date.UTC(2026, 6, 1))).toBe(-2);
    expect(decalageFuseau('America/Miquelon', Date.UTC(2026, 0, 1))).toBe(-3);
  });
  it('ecrit la regle de Miquelon comme Intl la lit', () => {
    // 2026 : 8 mars, 2 h (UTC-3) et 1er novembre, 2 h (UTC-2).
    for (const t of [Date.UTC(2026, 2, 8, 4, 59), Date.UTC(2026, 2, 8, 5), Date.UTC(2026, 10, 1, 3, 59), Date.UTC(2026, 10, 1, 4)]) {
      expect(decalageSansIntl('America/Miquelon', t)).toBe(decalageFuseau('America/Miquelon', t));
    }
    expect(decalageSansIntl('America/Miquelon', Date.UTC(2026, 2, 8, 5))).toBe(-2);
    expect(decalageSansIntl('America/Miquelon', Date.UTC(2026, 10, 1, 4))).toBe(-3);
  });
  it('dit pour Paris ce que disait la regle francaise, de 1996 a 2040', () => {
    for (let a = 1996; a <= 2040; a++) {
      for (const mois of [2, 9]) {
        const jour = dernierDimanche(a, mois + 1);
        for (let h = -2; h <= 3; h += 0.25) {
          const t = Date.UTC(a, mois, jour, 0) + h * 3600000;
          expect(decalageFuseau('Europe/Paris', t)).toBe(decalageFuseauFrance(a, t));
        }
      }
      for (let m = 0; m < 12; m++) {
        const t = Date.UTC(a, m, 10, 12);
        expect(decalageFuseau('Europe/Paris', t)).toBe(decalageFuseauFrance(a, t));
      }
    }
  });
  it('lit une heure qui manque avec le decalage d avant, une heure double avec celui d apres', () => {
    // 2026 : 29 mars (02:00 -> 03:00) et 25 octobre (03:00 -> 02:00).
    const local = (j: number, m: number, h: number, mn = 0) => Date.UTC(2026, m - 1, j, h, mn);
    expect(decalageALHeureLocale('Europe/Paris', local(29, 3, 1, 59))).toBe(1);
    expect(decalageALHeureLocale('Europe/Paris', local(29, 3, 2, 30))).toBe(1);
    expect(decalageALHeureLocale('Europe/Paris', local(29, 3, 3, 0))).toBe(2);
    expect(decalageALHeureLocale('Europe/Paris', local(25, 10, 1, 59))).toBe(2);
    expect(decalageALHeureLocale('Europe/Paris', local(25, 10, 2, 0))).toBe(1);
    expect(decalageALHeureLocale('Europe/Paris', local(25, 10, 2, 30))).toBe(1);
    expect(decalageALHeureLocale('Europe/Paris', local(25, 10, 3, 0))).toBe(1);
  });
  it('retombe sur la regle ecrite sans les fuseaux de Intl', () => {
    const vrai = Intl.DateTimeFormat;
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(((loc: string, opts?: Intl.DateTimeFormatOptions) => {
      if (opts?.timeZone) throw new RangeError('Invalid time zone specified: ' + opts.timeZone);
      return new vrai(loc, opts);
    }) as unknown as typeof Intl.DateTimeFormat);
    oublierFuseaux();
    for (let a = 2020; a <= 2030; a++) {
      for (let j = 0; j < 365; j += 3) {
        const t = Date.UTC(a, 0, 1 + j, 1);
        expect(decalageFuseau('Europe/Paris', t)).toBe(decalageFuseauFrance(a, t));
      }
    }
    expect(decalageFuseau('Indian/Reunion', Date.UTC(2026, 6, 1))).toBe(4);
    expect(decalageFuseau('Pacific/Marquesas', Date.UTC(2026, 6, 1))).toBe(-9.5);
    expect(decalageFuseau('America/Miquelon', Date.UTC(2026, 6, 1))).toBe(-2);
    expect(decalageFuseau('America/Miquelon', Date.UTC(2026, 11, 1))).toBe(-3);
    expect(decalageFuseau('Atlantic/Canary', Date.UTC(2026, 6, 1))).toBe(1);
    expect(decalageFuseau('Inconnu/Nulle_part', Date.UTC(2026, 6, 1))).toBe(2);
    // Le soleil du Vesinet ne bouge pas d'un bit.
    expect(positionSoleil(2026, 6, 21, 15, VESINET.lat, VESINET.lon)).toEqual(positionAvant(2026, 6, 21, 15, VESINET.lat, VESINET.lon));
  });
  it('retombe sur la regle ecrite quand Intl ne sait pas dire shortOffset (anciens Safari)', () => {
    const vrai = Intl.DateTimeFormat;
    vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(((loc: string, opts?: Intl.DateTimeFormatOptions) => {
      if (opts?.timeZoneName === 'shortOffset') throw new RangeError('Value shortOffset out of range');
      return new vrai(loc, opts);
    }) as unknown as typeof Intl.DateTimeFormat);
    oublierFuseaux();
    expect(decalageFuseau('Indian/Reunion', Date.UTC(2026, 6, 1))).toBe(4);
    expect(decalageFuseau('Europe/Paris', Date.UTC(2026, 6, 1))).toBe(2);
    expect(decalageFuseau('Europe/Paris', Date.UTC(2026, 11, 1))).toBe(1);
  });
});

describe('positionSoleil au fuseau du lieu', () => {
  it('rend en France metropolitaine le soleil d avant, au bit pres, hors la nuit des changements d heure', () => {
    const lieux = [VESINET, { lat: 43.70, lon: 7.27 }, { lat: 48.39, lon: -4.49 }, { lat: 41.92, lon: 8.74 }];
    let compares = 0;
    for (const lieu of lieux) {
      for (let a = 1996; a <= 2040; a += 1) {
        for (let m = 1; m <= 12; m++) {
          for (const j of [1, 15, dernierDimanche(a, m)]) {
            const changement = (m === 3 || m === 10) && j === dernierDimanche(a, m);
            for (let minutes = 0; minutes < 1440; minutes += changement ? 5 : 95) {
              // La nuit d'un changement d'heure, avant l'heure du changement : l'ancien decalage, lu a midi, etait faux.
              if (changement && minutes < (m === 3 ? 180 : 120)) continue;
              const h = minutes / 60;
              expect(positionSoleil(a, m, j, h, lieu.lat, lieu.lon)).toEqual(positionAvant(a, m, j, h, lieu.lat, lieu.lon));
              compares++;
            }
          }
        }
      }
    }
    expect(compares).toBeGreaterThan(40000);
  });

  it('corrige la nuit des changements d heure, quand le soleil est couche', () => {
    for (const [m, j, avant, apres] of [[3, 29, 1, 2], [10, 25, 2, 1]] as const) {
      const fin = m === 3 ? 180 : 120;
      for (let minutes = 0; minutes < fin; minutes += 5) {
        const nouveau = positionSoleil(2026, m, j, minutes / 60, VESINET.lat, VESINET.lon);
        expect(nouveau.elevRad).toBeLessThan(0);
        // L'ancien lisait la journee au decalage de midi (`apres`) ; le nouveau, a l'instant (`avant`, sauf l'heure qui manque).
        expect(decalageALHeureLocale('Europe/Paris', Date.UTC(2026, m - 1, j) + minutes * 60000)).toBe(avant);
        expect(apres).not.toBe(avant);
      }
    }
  });

  it('garde le lever et le coucher du Vesinet', () => {
    for (const [m, j] of [[1, 15], [3, 29], [6, 21], [10, 25], [12, 21]] as const) {
      const avant = { lever: -1, coucher: -1 };
      for (let mn = 0; mn < 1440; mn++) {
        if (positionAvant(2026, m, j, mn / 60, VESINET.lat, VESINET.lon).elevRad > 0) { if (avant.lever < 0) avant.lever = mn; avant.coucher = mn; }
      }
      expect(leverEtCoucher(2026, m, j, VESINET.lat, VESINET.lon)).toEqual(avant);
    }
  });

  it('met le soleil au plus haut vers midi legal a La Reunion, en Guyane et a Noumea', () => {
    const cas = [
      { nom: 'Saint-Denis', lat: -20.88, lon: 55.45, midi: 12 },
      { nom: 'Cayenne', lat: 4.94, lon: -52.33, midi: 12 },
      { nom: 'Nouméa', lat: -22.27, lon: 166.45, midi: 12 }
    ];
    for (const c of cas) {
      for (const [m, j] of [[1, 15], [7, 15]] as const) {
        // Midi solaire : l'heure ou la hauteur est la plus grande, a la minute.
        let mieux = 0, haut = -Infinity;
        for (let mn = 0; mn < 1440; mn++) {
          const e = positionSoleil(2026, m, j, mn / 60, c.lat, c.lon).elevRad;
          if (e > haut) { haut = e; mieux = mn; }
        }
        // A une heure de midi legal au plus (longitude dans le fuseau, equation du temps) ; le soleil est haut sous les tropiques.
        expect(Math.abs(mieux - c.midi * 60)).toBeLessThan(60);
        expect(degres(haut)).toBeGreaterThan(40);
        const midi = positionSoleil(2026, m, j, 12, c.lat, c.lon);
        expect(degres(midi.elevRad)).toBeGreaterThan(40);
        // La nuit, il est couche.
        expect(positionSoleil(2026, m, j, 0, c.lat, c.lon).elevRad).toBeLessThan(0);
      }
    }
    // A La Reunion (hemisphere sud), en juillet, le soleil de midi est au nord.
    const az = degres(positionSoleil(2026, 7, 15, 12.25, -20.88, 55.45).azRad);
    expect(az < 30 || az > 330).toBe(true);
    // Lu a l'heure de Paris (UTC+2 en ete), midi a La Reunion tombait a 14 h sur place : le soleil y etait deja bas.
    expect(degres(positionSoleil(2026, 7, 15, 12, -20.88, 55.45).elevRad))
      .toBeGreaterThan(degres(positionSoleil(2026, 7, 15, 12, -20.88, 55.45, 'Europe/Paris').elevRad) + 5);
  });
});
