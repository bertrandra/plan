// Position du soleil (spec §3.2, geo/soleil.ts).
//
// Une astronomie simplifiee, deplacee depuis legacy.ts sans retouche : declinaison de Cooper (23,45°
// x sin), equation du temps approchee (trois termes), puis hauteur et azimut depuis la latitude et
// l'angle horaire, sans refraction. Ce ne sont PAS les formules de la NOAA (serie de Spencer, ou
// algorithme de Meeus), que l'ancien commentaire citait a tort : l'ecart est de l'ordre de la minute
// d'heure et du demi-degre, sans effet sur une ombre de parasol.
//
// `lieuActuel()` reste dans la racine de composition (app/boot.ts) : elle lit la parcelle courante,
// donc l'etat du plan. Ce n'est pas une feuille pure au sens de la phase 2.

import { decalageALHeureLocale, fuseauDuLieu } from './fuseau.js';

/** Hauteur et azimut du soleil, en radians. Azimut : 0 = Nord, 90 = Est (sens horaire). */
export interface PositionSoleil {
  elevRad: number;
  azRad: number;
}

// Le decalage horaire est celui du lieu (geo/fuseau.ts) : l'heure tapee est l'heure legale du lieu de la parcelle. La
// regle francaise d'avant y vit encore (le repli sans `Intl`) et reste exportee d'ici.
export { decalageFuseauFrance } from './fuseau.js';

// Formules solaires simplifiees (voir l'en-tete) : declinaison depuis le jour de l'annee, equation
// du temps (correction de quelques minutes due a l'orbite elliptique/l'inclinaison terrestre),
// puis hauteur/azimut depuis latitude + angle horaire. Azimut en convention 0=Nord/90=Est/180=
// Sud/270=Ouest (sens horaire), converti ensuite vers le repere de la scene (+X=Est, +Z=Sud, meme
// convention que toLocal/buildThreeScene) par l'appelant.
//
// L'heure est l'heure legale du lieu (`zone`, par defaut celle que sa latitude et sa longitude donnent), et son decalage
// sur UTC est celui de l'instant meme : le jour d'un changement d'heure, la nuit avant le changement garde l'ancien (il
// valait jusqu'ici pour la journee entiere, lu a midi). Partout ailleurs, en France, le resultat est celui d'avant au bit
// pres (tests/unit/geo/fuseau.test.ts).
export function positionSoleil(annee: number, mois: number, jour: number, heureDecimale: number, latDeg: number, lonDeg: number, zone: string = fuseauDuLieu(latDeg, lonDeg).zone): PositionSoleil {
  const jourAnnee = Math.floor((Date.UTC(annee,mois-1,jour) - Date.UTC(annee,0,1))/86400000) + 1;
  const decalageFuseauH = decalageALHeureLocale(zone, Date.UTC(annee,mois-1,jour) + heureDecimale*3600000);
  const B = (360/365) * (jourAnnee - 81) * Math.PI/180;
  const eot = 9.87*Math.sin(2*B) - 7.53*Math.cos(B) - 1.5*Math.sin(B); // minutes
  const tc = 4*(lonDeg - 15*decalageFuseauH) + eot; // minutes
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

/**
 * Le lever et le coucher du soleil, en minutes depuis minuit (heure legale du lieu, comme
 * `positionSoleil`) : la premiere et la derniere minute ou son centre est au-dessus de l'horizon.
 * Cherches minute par minute plutot que par la formule de l'angle horaire : c'est le meme modele que
 * celui qui eclaire la scene, donc le soleil se leve a l'ecran a l'heure dite. `null` les jours sans
 * lever ni coucher (au-dela des cercles polaires).
 */
export function leverEtCoucher(annee: number, mois: number, jour: number, latDeg: number, lonDeg: number, zone: string = fuseauDuLieu(latDeg, lonDeg).zone): { lever: number; coucher: number } | null {
  let lever = -1, coucher = -1;
  for (let m = 0; m < 1440; m++) {
    if (positionSoleil(annee, mois, jour, m / 60, latDeg, lonDeg, zone).elevRad > 0) {
      if (lever < 0) lever = m;
      coucher = m;
    }
  }
  return lever < 0 || (lever === 0 && coucher === 1439) ? null : { lever, coucher };
}
