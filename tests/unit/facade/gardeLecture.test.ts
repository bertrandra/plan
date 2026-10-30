// Le comparateur du garde-fou de la lecture (tests/banc/facades/gardeLecture.ts) : sur des mesures FABRIQUEES depuis la reference,
// il echoue des qu'une ligne de qualite descend, sans marge, liste les lignes, ne bronche pas sur une amelioration ni sur le cout, et
// la relance remplace les scenes relancees. Aucune mesure n'est lancee a rouge expres sur l'API : ce test le montre sans elle.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { comparerLecture, FICHIER_REFERENCE_510, lireEscalade, regressionsApresRelance, remplacerScenes, scenesARelancer, tableauLecture, type LigneLecture, type MesureLecture, type ReferenceLecture } from '../../banc/facades/gardeLecture.js';

const reference = JSON.parse(readFileSync(FICHIER_REFERENCE_510, 'utf8')) as ReferenceLecture;
const copie = (): MesureLecture => structuredClone({ scenes: reference.scenes, totaux: reference.totaux, escalade: reference.escalade ?? null });
const ligne = (m: MesureLecture, scene: string, mode: 'x1' | 'x3') => m.scenes[scene]?.[mode] as LigneLecture;
const JOURNAL = '- escalade d’une façade (claude-sonnet-5-5 ; couvre escalade) : accepté, sortie conforme (6 champs ; 2 angle(s), 1 pointe(s), parement pierre, 4 ouverture(s) dont 3 aux carreaux lus ; sortie structurée refusée) ; tokens entrée 532, cache écrit 4299, cache lu 0, sortie 1283 ; coût journalisé 0.02464 $';

describe('le comparateur de la lecture des facades', () => {
  it('passe sur la reference elle-meme', () => {
    expect(comparerLecture(reference, copie())).toEqual([]);
  });

  it('echoue des qu une baie manque sur une seule passe, et liste la scene et le total', () => {
    const m = copie();
    const l = ligne(m, '02-enduit-uni-face', 'x3');
    l.boites.vp = 5; l.boites.fp = 1; l.genres.fenetre.justes = 4;
    m.totaux.x3.boites.vp -= 1; m.totaux.x3.boites.fp += 1; m.totaux.x3.genres.fenetre.justes -= 1;
    m.totaux.x3.boites.rappel = m.totaux.x3.boites.vp / m.totaux.x3.boites.vraies;
    m.totaux.x3.boites.precision = m.totaux.x3.boites.vp / m.totaux.x3.boites.trouvees;
    const r = comparerLecture(reference, m);
    expect(r.map((x) => `${x.scene} ${x.mode} ${x.ligne} ${x.reference} → ${x.mesure}`)).toEqual([
      '02-enduit-uni-face x3 baies retrouvées (rappel) 6 → 5',
      '02-enduit-uni-face x3 baies en trop (précision) 0 → 1',
      '02-enduit-uni-face x3 genre fenetre retrouvé 5 → 4',
      'Total x3 rappel des baies 0.9921 → ' + m.totaux.x3.boites.rappel,
      'Total x3 précision des baies 1 → ' + m.totaux.x3.boites.precision,
      'Total x3 genre fenetre retrouvé 96 → 95',
    ]);
    expect(scenesARelancer(r)).toEqual(['02-enduit-uni-face']);
    const t = tableauLecture(reference, m, r);
    expect(t).toContain('**6 / 6 / 6 → 5 / 6 / 6**');
    expect(t).toContain('6 ligne(s) sous la référence');
  });

  it('voit chaque ligne de qualite : carreaux, angles, pointes, parement, passes illisibles', () => {
    const m = copie();
    const l = ligne(m, '13-grand-angle-distorsion-forte', 'x3');
    l.carreaux.justes = 1; l.angles.justes = 1; l.parement.juste = 0; l.parement.lu = 'brique'; l.illisibles = 1;
    const p = ligne(m, '22-pignon-decentre-pierre', 'x3');
    p.pointes.justes = 0; p.pointes.enPlus = 1;
    expect(comparerLecture(reference, m).map((x) => x.scene + ' ' + x.ligne)).toEqual([
      '13-grand-angle-distorsion-forte passes illisibles', '13-grand-angle-distorsion-forte carreaux justes', '13-grand-angle-distorsion-forte angles justes',
      '13-grand-angle-distorsion-forte parement juste', '22-pignon-decentre-pierre pointes justes', '22-pignon-decentre-pierre pointes en plus',
    ]);
  });

  it('une scene illisible ou absente est une regression ; une amelioration et le cout ne le sont pas', () => {
    const m = copie();
    (m.scenes['03-brique-volets-battants'] as Record<'x1' | 'x3', LigneLecture | null>).x1 = null;
    delete m.scenes['04-soubassement-pierre-bandeau'];
    const l = ligne(m, '16-vues-voiture-devant', 'x1');
    l.boites.vp = 7; l.boites.trouvees = 7;
    ligne(m, '02-enduit-uni-face', 'x3').info.cout = 1;
    const r = comparerLecture(reference, m).map((x) => x.scene + ' ' + x.mode + ' ' + x.ligne);
    expect(r.filter((x) => x.startsWith('03-'))).toHaveLength(12);
    expect(r).toContain('03-brique-volets-battants x1 baies retrouvées (rappel) (lecture illisible)');
    expect(r).toContain('04-soubassement-pierre-bandeau x1 scène mesurée');
    expect(r.some((x) => x.startsWith('16-') || x.startsWith('02-'))).toBe(false);
  });

  it('la relance remplace les scenes relancees et refait les totaux', () => {
    const premiere = copie();
    const l = ligne(premiere, '05-ombres-debord-balcon', 'x1');
    l.boites.vp = 4; l.boites.fp = 2;
    premiere.totaux.x1.boites.vp -= 2;
    expect(comparerLecture(reference, premiere).length).toBeGreaterThan(0);
    const relance: MesureLecture = { scenes: { '05-ombres-debord-balcon': structuredClone(reference.scenes['05-ombres-debord-balcon'] as Record<'x1' | 'x3', LigneLecture | null>) }, totaux: reference.totaux };
    const apres = remplacerScenes(premiere, relance);
    expect(apres.totaux.x1.boites).toEqual(reference.totaux.x1.boites);
    expect(comparerLecture(reference, apres)).toEqual([]);
  });

  it('apres la relance, seule une ligne en dessous aux deux mesures est une regression', () => {
    // Le run 41012308826 l'a montre : la relance d'une scene pour une ligne (09 x1, une passe vide) a fait baisser une autre ligne de la
    // meme scene (09 x3, un angle), qui etait juste a la premiere mesure. Elle est dite a part, pas comptee.
    const premiere = copie();
    const a = ligne(premiere, '09-focale-inconnue-grand-angle', 'x1');
    a.boites.vp = 0; a.boites.trouvees = 0;
    const b = ligne(premiere, '20-details-cintres-persiennes-garde-corps', 'x3');
    b.genres['porte-fenetre'].justes = 0;
    const relance: MesureLecture = { scenes: structuredClone({ '09-focale-inconnue-grand-angle': reference.scenes['09-focale-inconnue-grand-angle'], '20-details-cintres-persiennes-garde-corps': reference.scenes['20-details-cintres-persiennes-garde-corps'] }) as MesureLecture['scenes'], totaux: reference.totaux };
    ligne(relance, '09-focale-inconnue-grand-angle', 'x3').angles.justes = 0;
    ligne(relance, '20-details-cintres-persiennes-garde-corps', 'x3').genres['porte-fenetre'].justes = 1;
    // Les totaux de la premiere mesure refaits sur ses scenes (remplacerScenes sans scene a remplacer).
    const { restees, nouvelles } = regressionsApresRelance(reference, remplacerScenes(premiere, { scenes: {}, totaux: premiere.totaux }), relance);
    expect(restees.map((r) => r.scene + ' ' + r.mode + ' ' + r.ligne)).toEqual(['20-details-cintres-persiennes-garde-corps x3 genre porte-fenetre retrouvé', 'Total x3 genre porte-fenetre retrouvé']);
    expect(nouvelles.map((r) => r.scene + ' ' + r.mode + ' ' + r.ligne)).toEqual(['09-focale-inconnue-grand-angle x3 angles justes', 'Total x3 angles justes']);
    expect(tableauLecture(reference, remplacerScenes(premiere, relance), restees, nouvelles)).toContain('à la relance seule');
  });

  it('lit l escalade dans le journal du verificateur et la compare', () => {
    const e = lireEscalade('Vérification…\n' + JOURNAL + '\nMesure x1 contre x3');
    expect(e).toEqual({ acceptee: true, conforme: true, angles: 2, pointes: 1, parement: 'pierre', ouvertures: 4, carreaux: 3, modele: 'claude-sonnet-5-5', cout: 0.02464 });
    expect(reference.escalade).toEqual(e);
    const m = copie();
    m.escalade = lireEscalade(JOURNAL.replace('2 angle(s)', '1 angle(s)').replace('parement pierre', 'parement indetermine'));
    expect(comparerLecture(reference, m).map((x) => x.ligne)).toEqual(['angles lus', 'parement lu']);
    m.escalade = null;
    expect(comparerLecture(reference, m).map((x) => x.ligne)).toEqual(['ligne du journal']);
  });
});
