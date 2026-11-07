// Les outils des tests de l'orchestration d'une facade (uneOrchestration.test.ts, rejeuPartielAudit.test.ts) : une scene du banc vue
// comme l'audit l'a sous la main, et ce que chaque etape a rendu, les images en empreintes.

import type { Enchainement } from '../../../../src/facade/releve/enchainement.js';
import { facadesDuContour } from '../../../../src/geometry/cotesVusDeDehors.js';
import type { Image } from '../../../../src/facade/vision/homographie.js';
import type { PhotoCas, PrisePhoto } from '../../../../src/model/audit.js';
import type { CorpsToit, PtBrut } from '../../../../src/model/types.js';
import { chargerCorpus } from '../../../banc/facades/banc.js';
import { photographier, type PriseCamera, type SceneFacade } from '../../../../src/facade/banc/synthese.js';

/** Une empreinte d'image (FNV-1a sur tous ses octets) : comparer des images entieres couterait des secondes a l'outil de test. */
export function empreinte(img: Image | null | undefined): string {
  if (!img) return '-';
  let h = 2166136261;
  for (let i = 0; i < img.donnees.length; i++) { h ^= img.donnees[i] ?? 0; h = Math.imul(h, 16777619); }
  return img.largeur + 'x' + img.hauteur + ':' + (h >>> 0).toString(16);
}
export const jpeg = (img: Image) => 'jpeg:' + empreinte(img);

/** Ce que chaque etape a rendu, les images en empreintes ; sans la date du releve (l'horloge) ni ce qui ne sert qu'a la verite. */
export function sorties(r: Enchainement) {
  const s = r.sorties, a = s.analyse, m = s.audit?.mesure;
  return {
    preparation: s.preparation,
    vues: s.vues?.map((v) => (v ? [empreinte(v.image), v.versPhoto] : null)),
    calage: s.calage && { photos: s.calage.photos, pose: s.calage.pose && { image: empreinte(s.calage.pose.image), coins: s.calage.pose.coins, vues: s.calage.pose.vues }, explication: s.calage.explication },
    silhouette: s.silhouette, forme: s.forme,
    analyse: a && { elevation: empreinte(a.elevation), facade: empreinte(a.facade.image), texture: empreinte(a.texture), pxParM: a.pxParM, hauteurTexture: a.hauteurTexture, ouvertures: a.ouvertures, devinees: a.devinees, toitEstime: a.toitEstime, fusion: a.fusion && { statut: a.fusion.statut, masque: a.fusion.masque, vues: a.fusion.vues } },
    audit: s.audit && { ...s.audit, mesure: m && { ...m, releve: { ...m.releve, releveLe: '' } } },
    ia: s.ia && { pose: s.ia.pose, ecart: s.ia.ecart, accord: s.ia.accord, descentes: s.ia.descentes },
    facade: s.facade,
  };
}
/** Une prise de vue d'audit pour une camera du banc : le GPS a sa place (a 1 m pres), la boussole vers le mur, l'EXIF de sa focale. */
export function priseDe(p: PriseCamera, L: number): PrisePhoto {
  const b = ((p.biais ?? 0) * Math.PI) / 180;
  return {
    t: '2026-11-02T10:00:00.000Z', x: L / 2 + p.distance * Math.sin(b), y: -p.distance * Math.cos(b), lat: null, lon: null, precisionM: 1,
    azimutDeg: (360 - (p.biais ?? 0)) % 360, sourceAzimut: 'boussole', champDeg: (2 * Math.atan(18 / (p.focale35 ?? 26)) * 180) / Math.PI, sourceFocale: 'exif',
  };
}

/**
 * La facade d'une scene, comme l'audit l'a sous la main : le cote sud d'un batiment de L x 10 m, un deux-pans dont le faitage est
 * perpendiculaire a la facade (un pignon, a la hauteur de celui de la scene), les photos avec leur prise de vue.
 */
export function facadeDeLaScene(s: SceneFacade, prises: readonly PriseCamera[]) {
  const L = s.verite.largeur, H = s.verite.hauteur, pg = s.synthese.mur.pignon ?? 0;
  const contour: PtBrut[] = [{ x: 0, y: 0 }, { x: L, y: 0 }, { x: L, y: 10 }, { x: 0, y: 10 }];
  const corps: CorpsToit = { pts: [{ x: 0, y: 0 }, { x: 0, y: 10 }, { x: L, y: 10 }, { x: L, y: 0 }], posFaitage: L / 2, faitage: H + pg, egouts: [H, H], pignons: [], ecart: 0 };
  const f = facadesDuContour(contour, H).find((x) => x.normale.y < -0.9);
  if (!f) throw new Error('pas de facade sud');
  const images = prises.map((p) => { const ph = photographier(s, 100, p); if (!ph) throw new Error('prise impossible'); return ph.image; });
  const photos: PhotoCas[] = prises.map((p, k) => ({ type: 'image/jpeg', base64: 'photo-' + k, prise: priseDe(p, L) }));
  return { f, contour, corps, images, photos };
}

/** Une scene du corpus, par le debut de son nom. */
export const scene = (prefixe: string) => {
  const s = chargerCorpus().find((c) => c.nom.startsWith(prefixe));
  if (!s) throw new Error('scene absente');
  return s;
};
