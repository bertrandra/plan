// L'E5 (Calage du mur) de l'audit sur les scenes du banc : le chemin de l'audit tel quel (facade/releve/enchainement.ts::derouler, vue
// `audit`), une photo prise avec le GPS (a 1 m), la boussole et la focale de l'EXIF, le gabarit vrai de la scene (ce que le LiDAR
// donnerait). Contrairement au banc des facades (banc.ts, coins vrais), les coins se cherchent ici comme sur place.
//
//   npx tsx .claude/skills/facades/scripts/calage-e5.ts [mots] [--sans-capteurs] [--json fichier]
//
// `--sans-capteurs` : les photos importees, sans GPS, boussole ni EXIF (un cas de calibration d'avant, le point 100 de la fumee).
//
// Par scene : l'ecart de chaque coin retenu au coin vrai, en cm sur le mur (HG, HD, BD, BG) ; l'egout (la moyenne des deux coins du
// haut, signee : negatif, trop bas) ; l'etat de l'E5, son score d'explication et ses deux angles. « Juste » : les quatre coins a 2 % de
// la largeur du mur au plus (`facades.enchainement.calageEcartMaxPart`). La ligne qui compte : aucun E5 « ok » sur une pose fausse.
//
// En plus des scenes, trois variantes de la scene 24 vue comme un mur de 5 m que le pignon d'un corps voisin prolonge jusqu'a 8 m (le
// gabarit deborde du mur) : coins cherches (« voisin »), mur pose a la main sur les coins vrais (« voisin, à la main » : l'E5 n'est
// « ok » que si la silhouette l'explique, son score dit si l'explication tient compte du gabarit), et quatre reperes poses sur les
// coins que la chaine avait retenus (« voisin, repères = coins de la chaîne » : ouvrir « Placer 4 repères » puis « Appliquer »).
//
// Le chemin des reperes (decision du proprietaire, 3 novembre 2026 : seuls des coins tires a la main sont « a la main ») : chaque scene
// rejouee une seconde fois avec quatre reperes aux coins de sa premiere ouverture (« repères »), comme egout-sol.ts. Le mur s'y cherche
// sur l'assemblage redresse par eux, l'arbitre juge les poses : la ligne d'ensemble compte ces cas comme les autres.
//
// « Poses fausses refusées » : sur l'image de la pose retenue, quand elle est juste, la meme pose l'egout deplace de 5 et 10 % de la
// largeur du mur vers le haut et vers le bas, puis un bout de 5 % vers l'interieur et l'exterieur (au-dela des 3 % ou un bord est faux,
// `calageEcartMaxPart`), chacune jugee par le test de l'E5 (calageAncres.ts::expliqueLaPhoto, avec le gabarit) : combien il en refuse.
// « Justes à 2 % » : la meme pose, l'egout deplace de 2 % vers le haut et vers le bas (un bord encore juste) : combien il en accepte. Les scenes au grand-angle corrige (13, 14) rendent leurs
// coins sur l'image corrigee de la distorsion : ils ne se comparent pas aux coins de la photo.
import { chargerCorpus } from '../../../../tests/banc/facades/banc.ts';
import { coinsVrais, gabaritVrai, photographier, type PriseCamera, type SceneFacade } from '../../../../tests/banc/facades/synthese.ts';
import { appliquer, homographie, type P2 } from '../../../../src/facade/vision/homographie.ts';
import { derouler } from '../../../../src/facade/releve/enchainement.ts';
import { prisesDeLaFacade } from '../../../../src/facade/releve/prisesFacade.ts';
import { rechercher } from '../../../../src/facade/releve/serie.ts';
import type { GabaritMur } from '../../../../src/facade/gabaritMur.ts';
import type { Facade } from '../../../../src/geometry/cotesVusDeDehors.ts';
import type { PrisePhoto } from '../../../../src/model/audit.ts';
import { expliquer, expliqueLaPhoto, seuilsDuCalage } from '../../../../src/facade/releve/calageAncres.ts';
import { detecterSegments } from '../../../../src/facade/vision/segments.ts';

const args = process.argv.slice(2);
const iJson = args.indexOf('--json');
const json = iJson >= 0 ? args[iJson + 1] : null;
const mots = args.filter((a, i) => !a.startsWith('--') && (iJson < 0 || i !== iJson + 1));
const sansCapteurs = args.includes('--sans-capteurs');

/** La prise de vue de l'audit pour une camera du banc : le GPS a sa place (a 1 m pres), la boussole vers le mur, l'EXIF de sa focale. */
function priseDe(p: PriseCamera, L: number): PrisePhoto {
  const b = ((p.biais ?? 0) * Math.PI) / 180;
  return {
    t: '2026-11-02T10:00:00.000Z', x: L / 2 + p.distance * Math.sin(b), y: -p.distance * Math.cos(b), lat: null, lon: null, precisionM: 1,
    azimutDeg: (360 - (p.biais ?? 0)) % 360, sourceAzimut: 'boussole', champDeg: (2 * Math.atan(18 / (p.focale35 ?? 26)) * 180) / Math.PI, sourceFocale: 'exif',
  };
}

interface Cas { nom: string; s: SceneFacade; largeurM: number; gabarit: GabaritMur; aLaMain?: boolean; reperes?: 'ouverture' | 'chaine' }

const cas: Cas[] = [];
for (const s of chargerCorpus()) {
  if (s.synthese.prise.type !== 'camera') continue;
  cas.push({ nom: s.nom, s, largeurM: s.verite.largeur, gabarit: gabaritVrai(s) });
  if (s.verite.ouvertures.length) cas.push({ nom: s.nom + ', repères', s, largeurM: s.verite.largeur, gabarit: gabaritVrai(s), reperes: 'ouverture' });
  if (s.nom.startsWith('24-')) {
    // Le mur de 5 m, prolonge par le pignon d'un corps voisin jusqu'a 8 m (tests/unit/facade/analyseSilhouette.test.ts).
    const H = s.verite.hauteur;
    const g = [{ u: 0, v: 1 }, { u: 0.8, v: 1 + 3.6 / H }, { u: 1.6, v: 1 }];
    cas.push({ nom: '24-voisin (mur de 5 m)', s, largeurM: 5, gabarit: g }, { nom: '24-voisin, à la main', s, largeurM: 5, gabarit: g, aLaMain: true },
      { nom: '24-voisin, repères = coins de la chaîne', s, largeurM: 5, gabarit: g, reperes: 'chaine' });
  }
}

const cm = (v: number) => (Number.isFinite(v) ? String(Math.round(v * 100)) : '∞');
const lignes = ['| Scène | Coins (cm : HG, HD, BD, BG) | Égout (cm) | Juste | É5 | Score | Angles | Égout (ancre) | Poses fausses refusées | Justes à 2 % |', '|---|---|--:|---|---|--:|---|--:|--:|--:|'];
const bilan = { justes: 0, faux: 0, fauxOk: 0, n: 0, travers: 0, refusees: 0, justesRefusees: 0, proches: 0, prochesAcceptees: 0 };
const seuils = seuilsDuCalage();
const detail: unknown[] = [];
for (const c of cas) {
  if (mots.length && !mots.some((m) => c.nom.includes(m))) continue;
  const p = c.s.synthese.prise as PriseCamera;
  const ph = photographier(c.s, 100, p), vrais8 = coinsVrais(c.s, p);
  if (!ph || !vrais8) continue;
  const H = c.s.verite.hauteur, L8 = c.s.verite.largeur, L = c.largeurM;
  // Le mur de la scene (0..L8) vers la photo ; le mur etudie va de 0 a L.
  const murVersPhoto = homographie([{ x: 0, y: H }, { x: L8, y: H }, { x: L8, y: 0 }, { x: 0, y: 0 }], vrais8);
  if (!murVersPhoto) continue;
  const photoVersMur = homographie(vrais8, [{ x: 0, y: H }, { x: L8, y: H }, { x: L8, y: 0 }, { x: 0, y: 0 }]);
  const vraisM = [{ x: 0, y: H }, { x: L, y: H }, { x: L, y: 0 }, { x: 0, y: 0 }];
  const facade: Facade = { cote: 0, gauche: { x: 0, y: 0 }, droite: { x: L, y: 0 }, largeur: L, hauteur: H, normale: { x: 0, y: -1 }, azimut: 180, orientation: 'Sud' };
  const contour = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 10 }, { x: 0, y: 10 }];
  // La prise : centree sur le mur de la scene ; pour le mur de 5 m, le GPS est le meme, la position se lit dans le repere du mur.
  const prise = priseDe(p, L8);
  const vraisPhoto = vraisM.map((q) => appliquer(murVersPhoto, q));
  const jouer = (corrections: Record<number, { coins?: P2[]; reperes?: P2[] }>) => derouler({ largeurM: L, hauteurM: H, gabarit: c.gabarit,
    prises: prisesDeLaFacade({ facade, contour, photos: [{ rang: 0, image: ph.image, prise: sansCapteurs ? null : prise }], corrections, jpeg: () => '' }) },
  { vue: 'audit', chercherCoins: async (e) => rechercher(e) });
  let corrections: Record<number, { coins?: P2[]; reperes?: P2[] }> = c.aLaMain ? { 0: { coins: vraisPhoto } } : {};
  if (c.reperes === 'chaine') {
    const px = (await jouer({})).sorties.audit?.redressement?.photos[0]?.coinsPx;
    if (px?.length !== 4) continue;
    corrections = { 0: { reperes: px } };
  } else if (c.reperes === 'ouverture') {
    const o = c.s.verite.ouvertures[0]!;
    corrections = { 0: { reperes: [{ x: o.x, y: o.y + o.h }, { x: o.x + o.l, y: o.y + o.h }, { x: o.x + o.l, y: o.y }, { x: o.x, y: o.y }].map((q) => appliquer(murVersPhoto, q)) } };
  }
  const r = await jouer(corrections);
  const e5 = r.etapes.find((x) => x.id === 'calage');
  const coins = r.sorties.calage?.photos[0]?.coins ?? [];
  const ex = r.sorties.calage?.explication;
  let txt = '—', egout = NaN, juste = false;
  const corrigee = !!p.distorsion;
  if (corrigee) txt = 'image corrigée';
  else if (coins.length === 4 && photoVersMur) {
    const surMur = coins.map((q) => appliquer(photoVersMur, q));
    const e = surMur.map((q, i) => Math.hypot(q.x - (vraisM[i] as P2).x, q.y - (vraisM[i] as P2).y));
    egout = ((surMur[0] as P2).y + (surMur[1] as P2).y) / 2 - H;
    juste = Math.max(...e) <= 0.02 * L;
    txt = e.map(cm).join(', ');
  }
  // Les poses de travers, sur l'image de la pose retenue quand elle est juste.
  const pose = r.sorties.calage?.pose;
  let travers = '—', proches = '—';
  if (pose && juste) {
    const cs = pose.coins;
    const R = { x0: ((cs[0] as P2).x + (cs[3] as P2).x) / 2, x1: ((cs[1] as P2).x + (cs[2] as P2).x) / 2, y0: ((cs[0] as P2).y + (cs[1] as P2).y) / 2, y1: ((cs[2] as P2).y + (cs[3] as P2).y) / 2 };
    const w = R.x1 - R.x0, segs = detecterSegments(pose.image);
    const juge = (q: typeof R) => expliqueLaPhoto(expliquer(pose, segs, q, H / L, pose, c.gabarit), seuils);
    if (!juge(R)) bilan.justesRefusees++;
    const fausses = [-0.1, -0.05, 0.05, 0.1].map((d) => ({ ...R, y0: R.y0 + d * w }))
      .concat([0.05, -0.05].flatMap((d) => [{ ...R, x0: R.x0 + d * w }, { ...R, x1: R.x1 - d * w }]));
    const ref = fausses.filter((q) => !juge(q)).length;
    bilan.travers += fausses.length; bilan.refusees += ref;
    travers = `${ref}/${fausses.length}`;
    const pres = [-0.02, 0.02].map((d) => ({ ...R, y0: R.y0 + d * w }));
    const acc = pres.filter(juge).length;
    bilan.proches += pres.length; bilan.prochesAcceptees += acc;
    proches = `${acc}/${pres.length}`;
  }
  bilan.n++;
  if (!corrigee) { if (juste) bilan.justes++; else { bilan.faux++; if (e5?.etat === 'ok') bilan.fauxOk++; } }
  const sc = (x: number | undefined) => (x === undefined ? '—' : x.toFixed(2).replace('.', ','));
  lignes.push(`| ${c.nom} | ${txt} | ${cm(egout)} | ${juste ? 'oui' : '**non**'} | ${e5?.etat ?? '—'}${!juste && e5?.etat === 'ok' ? ' ⚠' : ''} | ${sc(ex?.score)} | ${ex ? sc(ex.angles[0]) + ', ' + sc(ex.angles[1]) : '—'} | ${sc(ex?.egout)}${ex?.silhouette ? ' (silhouette)' : ''} | ${travers} | ${proches} |`);
  detail.push({ nom: c.nom, coins: txt, egout, juste, etat: e5?.etat, score: ex?.score, angles: ex?.angles, resume: e5?.resume });
}
lignes.push(`| **Ensemble** | | | ${bilan.justes}/${bilan.justes + bilan.faux} | ${bilan.fauxOk} faux « ok » sur ${bilan.faux} faux | | | ${bilan.justesRefusees} pose(s) juste(s) refusée(s) | ${bilan.refusees}/${bilan.travers} | ${bilan.prochesAcceptees}/${bilan.proches} |`);
console.log(lignes.join('\n'));
if (json) (await import('node:fs')).writeFileSync(json, JSON.stringify(detail, null, 1));
