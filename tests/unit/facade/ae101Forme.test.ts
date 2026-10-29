import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { lireEtalon } from '../../banc/facades/reel.js';
import { sceneAe101 } from '../../banc/facades/ae101.js';
import { silhouetteLue } from '../../../src/facade/vision/mosaiqueFuites.js';
import { facadesDuContour } from '../../../src/geometry/cotesVusDeDehors.js';
import { diagnostiquerForme } from '../../../src/facade/regles/facades/diagnosticForme.js';
import { observationsDuRun } from '../../../src/facade/regles/facades/ia.js';
import { lireRunEnregistre } from '../../../src/regles/facades/observations.js';
import { etapeDiagnostic, hautEnPartsDuMur } from '../../../src/facade/releve/etapesForme.js';
import { corpsSousContrainte, ecartsAuFait, plusGrand } from '../../../src/facade/regles/toits/faits.js';
import { murDuCorps } from '../../../src/facade/regles/toits/murDuCorps.js';
import { reconstruireCorps, type Grille } from '../../../src/facade/toits/toitCorps.js';
import { toitMesureDepuisGrille } from '../../../src/model/toitMesure.js';
import type { CorpsToit, PtBrut, ToitMesure } from '../../../src/model/types.js';

// L'acceptation du lot F4 (MD/spec-facade-calage-audit.md §9) sur la facade sud d'AE 101 : la proposition juste, sur le BON corps,
// decochee ; l'accepter change le toit par le moteur seulement ; les hauteurs du LiDAR ne bougent pas ; AE 101 identique sans
// proposition acceptee. Les photos du cas ne sont pas dans le depot (donnee personnelle) : l'assemblage est celui refait en synthese
// a partir de l'etalon (tests/banc/facades/ae101.ts), et la reponse de Claude est la reponse synthetique du lot F2.
//
// Le toit en question est celui que le LiDAR servi par l'IGN donnait le 14 octobre au soir (tests/fixtures/toits/vesinet-ae101-lidar-
// soir.json) : le calcul seul y perd le pignon est de la facade sud (skill toits, §0) ; c'est la photo qui doit le rendre.

const etalon = lireEtalon(JSON.parse(readFileSync('tests/fixtures/facades-reel/etalons/ae101-sud.json', 'utf8')));
const ae101 = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101.json', 'utf8')) as { contour: PtBrut[]; corpsAvecFaits: CorpsToit[] };
const soir = JSON.parse(readFileSync('tests/fixtures/toits/vesinet-ae101-lidar-soir.json', 'utf8')) as { contour: PtBrut[]; grille: Grille };
const mesureSoir = toitMesureDepuisGrille(soir.grille as never, soir.contour) as ToitMesure;
const seul = reconstruireCorps(mesureSoir, soir.contour, { grille: soir.grille })!;
const facade = facadesDuContour(soir.contour, 0).find((f) => f.cote === etalon.source.cote)!;
const run = lireRunEnregistre(JSON.parse(readFileSync('tests/fixtures/facades-ia/ae101-sud-synthetique.json', 'utf8')))!;
const ia = observationsDuRun(run);
const scene = sceneAe101(etalon, 'buisson');
const lue = (() => { const l = silhouetteLue(scene, scene.vrai); return l ? hautEnPartsDuMur(l.silhouette, scene.vrai) : null; })();
const [principalVrai] = etalon.toitVrai;
/** La mesure de l'E5 bis contre la vraie forme du toit de l'etalon. */
const contreLaVerite = (corps: readonly CorpsToit[], l: typeof lue) => etapeDiagnostic({ mur: { gauche: facade.gauche, droite: facade.droite }, corps }, etalon.hauteurM, l, ia, undefined, etalon.toitVrai).etape.verite;

describe('AE 101 sud : le diagnostic de forme, corps par corps (lot F4)', () => {
  it('le LiDAR du soir perd le pignon est ; la facade sud est portee par le long pan du corps principal', () => {
    const k = murDuCorps(seul, principalVrai!.mur.gauche, principalVrai!.mur.droite)!;
    expect(k.corps).toBe(plusGrand(seul));
    expect(seul[k.corps]!.pignons.filter((p) => p.pan === 1)).toHaveLength(1);
    const d = diagnostiquerForme({ facade, corps: seul, hauteurMur: etalon.hauteurM, lue, ia });
    expect(d.troncons).toEqual([expect.objectContaining({ corps: k.corps, cote: 2, u0: 0, u1: 1 })]);
  });

  it('propose le pignon est, sur le corps principal et lui seul ; la proposition est juste contre la vraie forme du toit', () => {
    const d = diagnostiquerForme({ facade, corps: seul, hauteurMur: etalon.hauteurM, lue, ia });
    // Le haut lu a la teinte passe sous l'egout (la galerie a l'ombre, l'enduit de la teinte du ciel) : il ne sert pas, c'est Claude qui
    // propose, seul ; sa proposition reste decochee (decision 10 ; §5 bis, regle 5).
    expect(d.lue).toBe(false);
    expect(d.propositions).toHaveLength(1);
    const p = d.propositions[0]!;
    expect(p.corps).toBe(murDuCorps(seul, principalVrai!.mur.gauche, principalVrai!.mur.droite)!.corps);
    expect(p.natures).toEqual(['ajouter-pignon']);
    expect(p.provenance).toBe('ia');
    expect(p.pignons).toHaveLength(2);
    expect(contreLaVerite(seul, lue)).toMatchObject({ juste: true, texte: expect.stringMatching(/Corps principal \(corps 1\) : proposition juste \(2 pignons vrais, bords à/) });
    // L'observation porte le corps par son mur, jamais par son rang.
    expect(p.observation.pignons?.[0]).toMatchObject({ mur: p.mur, position: 'places' });
  });

  it('accepter la proposition change le toit par le moteur seulement : le pignon est se pose, les hauteurs du LiDAR restent', () => {
    const p = diagnostiquerForme({ facade, corps: seul, hauteurMur: etalon.hauteurM, lue, ia }).propositions[0]!;
    const fait = { observation: p.observation, application: 'contrainte' as const };
    const apres = corpsSousContrainte(fait, seul, mesureSoir, soir.contour, soir.grille)!;
    expect(ecartsAuFait(fait, apres, soir.contour)).toEqual([]);
    apres.forEach((c, i) => {
      // Les autres corps ne bougent pas ; celui-ci garde ses murs, son faitage et ses egouts (decision 12).
      if (i !== p.corps) { expect(c).toEqual(seul[i]); return; }
      const avant = seul[i]!;
      expect({ pts: c.pts, posFaitage: c.posFaitage, faitage: c.faitage, egouts: c.egouts }).toEqual({ pts: avant.pts, posFaitage: avant.posFaitage, faitage: avant.faitage, egouts: avant.egouts });
      const pg = c.pignons.filter((x) => x.pan === 1).sort((a, b) => a.debut - b.debut);
      expect(pg).toHaveLength(2);
      // Chaque pignon vrai est recouvert a moitie au moins (sa place) ; la largeur du pignon ajoute est celle du pignon voisin, une estimation.
      pg.forEach((x, j) => { const v = principalVrai!.pignons![j]!; expect(Math.min(x.fin, v.fin) - Math.max(x.debut, v.debut)).toBeGreaterThan(0.5 * (v.fin - v.debut)); });
      // Le pignon ajoute monte au faitage du corps ; celui que le LiDAR avait lu garde sa hauteur.
      expect(pg[0]!.faitage).toBe(c.faitage);
      expect(pg[1]).toEqual(avant.pignons.find((x) => x.pan === 1));
    });
  });

  it('AE 101 d aujourd hui (sous ses faits) : aucune proposition, le toit ne bouge pas', () => {
    const d = diagnostiquerForme({ facade, corps: ae101.corpsAvecFaits, hauteurMur: etalon.hauteurM, lue, ia });
    expect(d.propositions).toEqual([]);
    expect(d.alertes).toEqual([]);
  });

  it('un haut lu juste (le gabarit de l etalon) fait la meme proposition par le deterministe, que Claude confirme', () => {
    // Le haut vrai : le gabarit de l'etalon (les corps d'AE 101 sous leurs faits), lu tous les centiemes du mur.
    const g = etalon.gabarit;
    const en = (u: number) => { for (let i = 1; i < g.length; i++) { const a = g[i - 1]!, b = g[i]!; if (u <= b.u) return a.v + ((b.v - a.v) * (u - a.u)) / (b.u - a.u); } return g[g.length - 1]!.v; };
    const d = diagnostiquerForme({ facade, corps: seul, hauteurMur: etalon.hauteurM, lue: Array.from({ length: 101 }, (_, k) => ({ u: k / 100, v: en(k / 100) })), ia });
    expect(d.lue).toBe(true);
    const p = d.propositions[0]!;
    expect(p.natures).toContain('ajouter-pignon');
    expect(p.provenance).toBe('les-deux');
    expect(p.gain).toBeGreaterThan(0.5);
    expect(contreLaVerite(seul, Array.from({ length: 101 }, (_, k) => ({ u: k / 100, v: en(k / 100) })))?.juste).toBe(true);
  });
});
