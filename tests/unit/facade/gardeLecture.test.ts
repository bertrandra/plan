// Le comparateur du garde-fou de la lecture (tests/banc/facades/gardeLecture.ts) : sur des mesures FABRIQUEES depuis la reference, il
// juge chaque ligne contre son plancher (le pire de trois mesures de main), a la granularite decidee (x3 par scene : baies, genres,
// pointes, parement ; x3 au total : tout, dont angles et carreaux ; x1 : au total seulement), echoue des qu'une ligne passe sous le
// plancher, sans marge de plus, et la relance ne compte que les lignes en dessous aux deux mesures. Aucune mesure n'est lancee a rouge
// expres sur l'API : ce test le montre sans elle.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { comparerLecture, FICHIER_REFERENCE_510, lireEscalade, plancherDe, regressionsApresRelance, remplacerScenes, scenesARelancer, tableauLecture, type LigneLecture, type MesureLecture, type ReferenceLecture } from '../../banc/facades/gardeLecture.js';

const reference = JSON.parse(readFileSync(FICHIER_REFERENCE_510, 'utf8')) as ReferenceLecture;
const { plancher } = reference;
/** La mesure du run 40998593930 : au-dessus du plancher par construction. */
const copie = (): MesureLecture => structuredClone((reference.mesures[0] as ReferenceLecture['mesures'][number]).mesure);
const ligne = (m: MesureLecture, scene: string, mode: 'x1' | 'x3') => m.scenes[scene]?.[mode] as LigneLecture;
/** Les totaux refaits sur les scenes (remplacerScenes sans scene a remplacer). */
const refaite = (m: MesureLecture) => remplacerScenes(m, { scenes: {}, totaux: m.totaux });
const noms = (l: readonly { scene: string; mode: string; ligne: string }[]) => l.map((r) => r.scene + ' ' + r.mode + ' ' + r.ligne);
const JOURNAL = '- escalade d’une façade (claude-sonnet-5-5 ; couvre escalade) : accepté, sortie conforme (6 champs ; 2 angle(s), 1 pointe(s), parement pierre, 4 ouverture(s) dont 3 aux carreaux lus ; sortie structurée refusée) ; tokens entrée 532, cache écrit 4299, cache lu 0, sortie 1283 ; coût journalisé 0.02464 $';

describe('le comparateur de la lecture des facades, contre les planchers', () => {
  it('le plancher est le pire des mesures : le plus bas d une ligne ou plus vaut mieux, le plus haut sinon', () => {
    const a = copie(), b = copie();
    ligne(b, '02-enduit-uni-face', 'x3').boites.vp = 4;
    ligne(b, '03-brique-volets-battants', 'x3').boites.fp = 2;
    const p = plancherDe([a, refaite(b)]);
    expect(p.scenes['02-enduit-uni-face']?.['baies retrouvées (rappel)']).toBe(4);
    expect(p.scenes['03-brique-volets-battants']?.['baies en trop (précision)']).toBe(2);
    expect(p.scenes['04-soubassement-pierre-bandeau']?.['baies retrouvées (rappel)']).toBe(6);
    // Les angles et les carreaux ne se jugent pas par scene.
    expect(Object.keys(p.scenes['02-enduit-uni-face'] ?? {})).not.toContain('angles justes');
    expect(Object.keys(p.scenes['02-enduit-uni-face'] ?? {})).not.toContain('carreaux justes');
  });

  it('passe sur chacune des trois mesures de main', () => {
    for (const m of reference.mesures) expect(comparerLecture(plancher, m.mesure)).toEqual([]);
  });

  it('echoue des qu une baie x3 manque sur une scene, et liste la scene et le total', () => {
    const m = copie();
    const l = ligne(m, '02-enduit-uni-face', 'x3');
    l.boites.vp = 5; l.boites.fp = 1; l.genres.fenetre.justes = 4;
    const r = comparerLecture(plancher, refaite(m));
    expect(noms(r)).toEqual([
      '02-enduit-uni-face x3 baies retrouvées (rappel)', '02-enduit-uni-face x3 baies en trop (précision)', '02-enduit-uni-face x3 genre fenetre retrouvé',
      'Total x3 rappel des baies', 'Total x3 précision des baies', 'Total x3 genre fenetre retrouvé',
    ]);
    expect(scenesARelancer(r, ['02-enduit-uni-face', '03-brique-volets-battants'])).toEqual(['02-enduit-uni-face', '03-brique-volets-battants']);
    expect(scenesARelancer(r.filter((x) => x.scene !== 'Total'), ['02-enduit-uni-face', '03-brique-volets-battants'])).toEqual(['02-enduit-uni-face']);
    const t = tableauLecture(plancher, refaite(m), r);
    expect(t).toContain('**6 → 5**');
    expect(t).toContain('6 ligne(s) sous le plancher');
  });

  it('x1 et les angles et carreaux x3 ne se jugent qu au total', () => {
    const m = copie();
    const a = ligne(m, '02-enduit-uni-face', 'x1');
    a.boites.vp = 0; a.boites.fp = 0; a.boites.trouvees = 0;
    const b = ligne(m, '02-enduit-uni-face', 'x3');
    b.carreaux.justes = 0; b.angles.justes = 0;
    const c = ligne(m, '13-grand-angle-distorsion-forte', 'x3');
    c.carreaux.justes = 0; c.angles.justes = 0;
    const d = ligne(m, '04-soubassement-pierre-bandeau', 'x3');
    d.angles.justes = 0;
    const r = noms(comparerLecture(plancher, refaite(m)));
    // x1 : le total seul (92,9 % de rappel au plancher : 6 baies de moins le passent).
    expect(r).toContain('Total x1 rappel des baies');
    expect(r.some((x) => x.startsWith('02-enduit-uni-face x1'))).toBe(false);
    // x3 : carreaux 7 → 0 et angles 38 → 33, sous les planchers 2 et 34 ; aucune ligne de scene.
    expect(r).toContain('Total x3 carreaux justes');
    expect(r).toContain('Total x3 angles justes');
    expect(r.some((x) => / x3 (carreaux|angles)/.test(x) && !x.startsWith('Total'))).toBe(false);
  });

  it('voit le parement, les pointes et une scene illisible ou absente ; une amelioration et le cout ne comptent pas', () => {
    const m = copie();
    const p = ligne(m, '22-pignon-decentre-pierre', 'x3');
    p.pointes.justes = 0; p.pointes.enPlus = 1; p.parement.juste = 0;
    (m.scenes['03-brique-volets-battants'] as Record<'x1' | 'x3', LigneLecture | null>).x3 = null;
    delete m.scenes['04-soubassement-pierre-bandeau'];
    ligne(m, '16-vues-voiture-devant', 'x1').boites.vp = 7;
    ligne(m, '02-enduit-uni-face', 'x3').info.cout = 1;
    const r = noms(comparerLecture(plancher, m));
    expect(r).toEqual(expect.arrayContaining(['22-pignon-decentre-pierre x3 pointes justes', '22-pignon-decentre-pierre x3 pointes en plus', '22-pignon-decentre-pierre x3 parement juste',
      '03-brique-volets-battants x3 baies retrouvées (rappel) (lecture illisible)', '04-soubassement-pierre-bandeau x3 scène mesurée']));
    expect(r.some((x) => x.startsWith('16-') || x.startsWith('02-'))).toBe(false);
  });

  it('apres la relance, seule une ligne sous le plancher aux deux mesures est une regression', () => {
    const premiere = copie();
    ligne(premiere, '09-focale-inconnue-grand-angle', 'x3').parement.juste = 0;
    ligne(premiere, '05-ombres-debord-balcon', 'x3').genres['porte-fenetre'].justes = 0;
    const r09 = structuredClone(premiere.scenes['09-focale-inconnue-grand-angle']), r05 = structuredClone(premiere.scenes['05-ombres-debord-balcon']);
    if (!r09 || !r05) throw new Error('scenes absentes');
    (r09.x3 as LigneLecture).parement.juste = 1;
    (r09.x3 as LigneLecture).pointes.enPlus = 1;
    const relance: MesureLecture = { scenes: { '09-focale-inconnue-grand-angle': r09, '05-ombres-debord-balcon': r05 }, totaux: premiere.totaux };
    const { restees, nouvelles } = regressionsApresRelance(plancher, refaite(premiere), relance);
    expect(noms(restees)).toEqual(['05-ombres-debord-balcon x3 genre porte-fenetre retrouvé']);
    expect(noms(nouvelles)).toEqual(['09-focale-inconnue-grand-angle x3 pointes en plus', 'Total x3 pointes en plus']);
    expect(tableauLecture(plancher, remplacerScenes(premiere, relance), restees, nouvelles)).toContain('à la relance seule');
  });

  it('lit l escalade dans le journal du verificateur et la juge contre son plancher', () => {
    const e = lireEscalade('Vérification…\n' + JOURNAL + '\nMesure x1 contre x3');
    expect(e).toEqual({ acceptee: true, conforme: true, angles: 2, pointes: 1, parement: 'pierre', ouvertures: 4, carreaux: 3, modele: 'claude-sonnet-5-5', cout: 0.02464 });
    expect(plancher.escalade).toEqual({ 'acceptée et conforme': 1, 'angles lus': 2, 'parement lu': 1 });
    const m = copie();
    m.escalade = lireEscalade(JOURNAL.replace('2 angle(s)', '1 angle(s)').replace('parement pierre', 'parement indetermine'));
    expect(comparerLecture(plancher, m).map((x) => x.ligne)).toEqual(['angles lus', 'parement lu']);
    m.escalade = null;
    expect(comparerLecture(plancher, m).map((x) => x.ligne)).toEqual(['ligne du journal']);
  });
});
