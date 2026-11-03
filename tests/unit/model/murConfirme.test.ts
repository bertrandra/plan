import { describe, it, expect } from 'vitest';
import { estLeMurConfirme, murAConfirmer, MUR_CONFIRME_ECART_PX, captureVide } from '../../../src/model/auditParcelle.js';
import { creerCapture } from '../../../src/app/audit/parcelle/capture.js';
import { captureDuFichier, fichierAuditParcelle, lireFichierAuditParcelle } from '../../../src/model/fichierAuditParcelle.js';
import type { PhotoCas } from '../../../src/model/audit.js';

// Le mur confirme au point V1 (« Confirmer le mur », decision du proprietaire du 3 novembre 2026) : les coins que la chaine avait
// retenus, par photo, et le jour. Il survit au rejeu tant que la chaine retient le meme mur ; un autre mur ne l'est plus.

const COINS = [{ x: 10, y: 20 }, { x: 700, y: 22 }, { x: 702, y: 500 }, { x: 8, y: 498 }];
const LE = '2026-11-03T10:00:00.000Z';
const PHOTO: PhotoCas = { type: 'image/jpeg', base64: 'AAAA' };

describe('le mur confirme', () => {
  it('se forme des photos qui ont leurs quatre coins, et rien sans elles', () => {
    expect(murAConfirmer([{ rang: 0, coins: COINS }, { rang: 1, coins: [] }], LE)).toEqual({ le: LE, coins: [{ rang: 0, coins: COINS }] });
    expect(murAConfirmer([{ rang: 0, coins: [] }], LE)).toBeNull();
  });

  it('est le meme mur au pixel pres, sur chaque photo confirmee ; un coin deplace, une photo perdue, et il ne l est plus', () => {
    const m = murAConfirmer([{ rang: 0, coins: COINS }], LE)!;
    const decale = (d: number) => COINS.map((c, k) => (k === 1 ? { x: c.x + d, y: c.y } : c));
    expect(estLeMurConfirme(m, [{ rang: 0, coins: decale(MUR_CONFIRME_ECART_PX * 0.9) }])).toBe(true);
    expect(estLeMurConfirme(m, [{ rang: 0, coins: decale(MUR_CONFIRME_ECART_PX * 3) }])).toBe(false);
    expect(estLeMurConfirme(m, [{ rang: 1, coins: COINS }])).toBe(false);
    expect(estLeMurConfirme({ le: LE, coins: [] }, [{ rang: 0, coins: COINS }])).toBe(false);
  });

  it('s ecrit dans la capture et s en retire ; une photo retiree le retire aussi (ses rangs ont bouge)', () => {
    const c = creerCapture('78650000AE0101', () => new Date(LE));
    c.ajouterPhotoFacade('maison', 0, PHOTO);
    c.ajouterPhotoFacade('maison', 0, PHOTO);
    const m = murAConfirmer([{ rang: 0, coins: COINS }], LE);
    c.confirmerMur('maison', 0, m);
    expect(c.lire().batiments.maison?.facades['0']?.murConfirme).toEqual(m);
    c.confirmerMur('maison', 0, null);
    expect(c.lire().batiments.maison?.facades['0']?.murConfirme).toBeUndefined();
    c.confirmerMur('maison', 0, m);
    c.retirerPhotoFacade('maison', 0, 1);
    expect(c.lire().batiments.maison?.facades['0']?.murConfirme).toBeUndefined();
  });

  it('passe par le fichier de l audit et en revient (la capture reprise le garde)', () => {
    const cap = captureVide('78650000AE0101', new Date(LE));
    const m = murAConfirmer([{ rang: 0, coins: COINS }], LE)!;
    cap.batiments.maison = { facades: { '0': { photos: [PHOTO], murConfirme: m } }, vu: {}, photos: [] };
    const f = fichierAuditParcelle({
      parcelle: { idu: '78650000AE0101', adresse: null, origine: { lat: 48.9, lon: 2.13 } }, code: { version: '5.5.0', commit: 'x' }, regles: { lectureToits: 7, lectureMurs: 2, reglagesToits: 'r1' },
      capture: cap, batiments: [{ cle: 'maison', nom: 'Maison', mitoyen: false, cas: null, facades: [{ cote: 0, orientation: 'Sud', largeurM: 10, hauteurM: 6 }] }],
      mesures: new Map(), propositions: [], ecritLe: new Date(LE),
    } as never);
    expect(f.batiments[0]?.facades[0]?.murConfirme).toEqual(m);
    const relu = lireFichierAuditParcelle(JSON.parse(JSON.stringify(f)));
    expect(captureDuFichier(relu).batiments.maison?.facades['0']?.murConfirme).toEqual(m);
  });
});

describe('les gestes d une facade dans la capture (Ctrl+Z avant V4)', () => {
  it('un geste en un pas, quelles que soient ses ecritures ; rien sans changement ; une photo ajoutee oublie les gestes', () => {
    const c = creerCapture('78650000AE0101', () => new Date(LE));
    c.ajouterPhotoFacade('maison', 0, PHOTO);
    c.ajouterPhotoFacade('maison', 0, PHOTO);
    // Le mur tire sur l'assemblage : deux photos corrigees, un seul geste.
    c.geste('maison', 0, () => { c.corrigerRedressement('maison', 0, 0, { coins: COINS }); c.corrigerRedressement('maison', 0, 1, { coins: COINS }); });
    c.geste('maison', 0, () => c.confirmerMur('maison', 0, murAConfirmer([{ rang: 0, coins: COINS }], LE)));
    c.geste('maison', 0, () => {});
    expect(c.annulerGeste()).toEqual({ cle: 'maison', cote: 0 });
    expect(c.lire().batiments.maison?.facades['0']?.murConfirme).toBeUndefined();
    expect(Object.keys(c.lire().batiments.maison?.facades['0']?.corrections ?? {})).toEqual(['0', '1']);
    expect(c.annulerGeste()).toEqual({ cle: 'maison', cote: 0 });
    expect(c.lire().batiments.maison?.facades['0']?.corrections).toBeUndefined();
    expect(c.annulerGeste()).toBeNull();
    expect(c.retablirGeste()).toEqual({ cle: 'maison', cote: 0 });
    expect(Object.keys(c.lire().batiments.maison?.facades['0']?.corrections ?? {})).toEqual(['0', '1']);
    c.ajouterPhotoFacade('maison', 0, PHOTO);
    expect([c.peutAnnulerGeste(), c.peutRetablirGeste()]).toEqual([false, false]);
  });
});
