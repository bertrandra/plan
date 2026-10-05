// Position du soleil (spec §3.2, geo/soleil.ts).
//
// Formules NOAA simplifiees, deplacees depuis legacy.ts sans retouche : declinaison depuis le jour
// de l'annee, equation du temps, puis hauteur et azimut depuis la latitude et l'angle horaire.
//
// `lieuActuel()` reste dans la racine de composition (app/boot.ts) : elle lit la parcelle courante,
// donc l'etat du plan. Ce n'est pas une feuille pure au sens de la phase 2.

/** Hauteur et azimut du soleil, en radians. Azimut : 0 = Nord, 90 = Est (sens horaire). */
export interface PositionSoleil {
  elevRad: number;
  azRad: number;
}

// France (CET/CEST) : UTC+1 toute l'annee, UTC+2 entre le dernier dimanche de mars 01h UTC et le
// dernier dimanche d'octobre 01h UTC (regle DST europeenne) - calculee explicitement plutot que de
// faire confiance au fuseau de l'ordinateur qui fait tourner l'appli (qui peut etre ailleurs que
// la France, alors que Le Vesinet, lui, ne bouge pas).
export function decalageFuseauFrance(anneeRef: number, tsUTC: number): number {
  function dernierDimancheUTC(mois: number): number { // mois 0-index ; renvoie 01:00 UTC du dernier dimanche de ce mois
    const d = new Date(Date.UTC(anneeRef, mois+1, 1, 1, 0, 0));
    d.setUTCDate(d.getUTCDate() - (d.getUTCDay()||7));
    return d.getTime();
  }
  const debutEte = dernierDimancheUTC(2), finEte = dernierDimancheUTC(9);
  return (tsUTC >= debutEte && tsUTC < finEte) ? 2 : 1;
}

// Formules solaires standard (NOAA, simplifiees) : declinaison depuis le jour de l'annee, equation
// du temps (correction de quelques minutes due a l'orbite elliptique/l'inclinaison terrestre),
// puis hauteur/azimut depuis latitude + angle horaire. Azimut en convention 0=Nord/90=Est/180=
// Sud/270=Ouest (sens horaire), converti ensuite vers le repere de la scene (+X=Est, +Z=Sud, meme
// convention que toLocal/buildThreeScene) par l'appelant.
export function positionSoleil(annee: number, mois: number, jour: number, heureDecimale: number, latDeg: number, lonDeg: number): PositionSoleil {
  const jourAnnee = Math.floor((Date.UTC(annee,mois-1,jour) - Date.UTC(annee,0,1))/86400000) + 1;
  const decalageFuseauH = decalageFuseauFrance(annee, Date.UTC(annee,mois-1,jour,12,0,0));
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
 * Le lever et le coucher du soleil, en minutes depuis minuit (heure legale francaise, comme
 * `positionSoleil`) : la premiere et la derniere minute ou son centre est au-dessus de l'horizon.
 * Cherches minute par minute plutot que par la formule de l'angle horaire : c'est le meme modele que
 * celui qui eclaire la scene, donc le soleil se leve a l'ecran a l'heure dite. `null` les jours sans
 * lever ni coucher (au-dela des cercles polaires).
 */
export function leverEtCoucher(annee: number, mois: number, jour: number, latDeg: number, lonDeg: number): { lever: number; coucher: number } | null {
  let lever = -1, coucher = -1;
  for (let m = 0; m < 1440; m++) {
    if (positionSoleil(annee, mois, jour, m / 60, latDeg, lonDeg).elevRad > 0) {
      if (lever < 0) lever = m;
      coucher = m;
    }
  }
  return lever < 0 || (lever === 0 && coucher === 1439) ? null : { lever, coucher };
}
