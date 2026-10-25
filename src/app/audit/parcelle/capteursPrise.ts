// Le GPS et la boussole pendant la prise de l'audit de la parcelle (controleur.ts) : la position dans le plan, le cap, l'attitude,
// et la prise de vue d'une photo.

import { suivrePositionGps, type PositionGps } from '../../../shell/geolocalisation.js';
import { autoriserBoussole, suivreBoussole, lisserCap, type Attitude } from '../../../shell/boussole.js';
import { filtrePosition, surLaParcelle } from './positionFiltree.js';
import { poserPositionGps, retirerPositionGps } from '../../../three/positionGps3d.js';
import { positionDansLePlan } from '../../ecouteurs/positionGps.js';
import { capDuDeplacement } from '../camera.js';
import type { PrisePhoto } from '../../../model/audit.js';
import type { PtBrut } from '../../../model/types.js';
import type { ContexteAuditParcelle, EtatPosition } from './typesSession.js';
import { MESSAGES_GPS_PARCELLE } from './textesSession.js';

/**
 * Le GPS et la boussole : la position dans le plan (lissee, et ramenee sur la parcelle quand elle
 * tombe chez un voisin : positionFiltree.ts), le cap (boussole, sinon sens de la marche), l'attitude.
 */
export function capteurs(ctx: ContexteAuditParcelle, change: (quoi: 'position' | 'cap') => void) {
  let position: PtBrut | null = null, gps: PositionGps | null = null, precision: number | null = null;
  const filtre = filtrePosition();
  const horloge = ctx.horloge ?? (() => Date.now());
  let etat: EtatPosition = 'attente';
  let capBoussole: number | null = null, capMarche: number | null = null, pointDeCap: PtBrut | null = null;
  let attitude: Attitude | null = null;
  let arretGps: (() => void) | null = null, arretBoussole: (() => void) | null = null;
  const poser = ctx.poserPosition ?? poserPositionGps;
  function surGps(g: PositionGps): void {
    const brute = positionDansLePlan(ctx.etat.objects, g);
    if (!brute) { etat = 'horsPlan'; change('position'); return; }
    const lisse = filtre.ajouter(brute, g.precisionM, g.t ?? horloge());
    const p = surLaParcelle(ctx.etat.objects, lisse.p, lisse.precisionM);
    gps = g; position = p; precision = lisse.precisionM; etat = 'ok';
    if (!pointDeCap) pointDeCap = p;
    const c = capDuDeplacement(pointDeCap, p);
    if (c !== null) { capMarche = c; pointDeCap = p; }
    poser(p, lisse.precisionM);
    change('position');
  }
  return {
    position: () => position,
    gps: () => gps,
    /** La precision de la position lissee, en metres. */
    precision: () => precision,
    etat: () => etat,
    capBoussole: () => capBoussole,
    cap: () => capBoussole ?? capMarche,
    attitude: () => attitude,
    demarrer(): void {
      if (!arretGps) {
        arretGps = (ctx.suivre ?? suivrePositionGps)(surGps, (e) => {
          if (e.raison === 'refusee') { etat = 'refusee'; change('position'); }
          ctx.signaler(MESSAGES_GPS_PARCELLE[e.raison]);
        });
      }
      if (!arretBoussole) {
        const b = ctx.boussole ?? { suivre: suivreBoussole, autoriser: autoriserBoussole };
        arretBoussole = b.suivre((c) => { capBoussole = lisserCap(capBoussole, c); change('cap'); }, (a) => { attitude = a; });
      }
    },
    /**
     * Safari ne donne la boussole qu'apres une autorisation demandee pendant un geste : a appeler
     * dans le geste meme (la commande, « Photographier en marchant »), avant toute attente.
     */
    autoriser(): void { void (ctx.boussole?.autoriser ?? autoriserBoussole)().catch(() => false); },
    arreter(): void {
      arretGps?.(); arretGps = null; arretBoussole?.(); arretBoussole = null;
      // Au retour, on peut etre ailleurs : le lissage repart de la premiere position.
      filtre.oublier();
      (ctx.retirerPosition ?? retirerPositionGps)();
    },
  };
}

/** La prise de vue d'une photo : la position (repere du plan et degres), sa precision, le cap et l'attitude. */
export function priseDe(c: ReturnType<typeof capteurs>, maintenant: Date): PrisePhoto | null {
  const p = c.position(), g = c.gps();
  if (!p || !g) return null;
  const r = (v: number, n: number) => Math.round(v * n) / n;
  const boussole = c.capBoussole(), cap = c.cap(), a = c.attitude();
  return {
    t: maintenant.toISOString(), x: r(p.x, 10), y: r(p.y, 10), lat: r(g.lat, 1e7), lon: r(g.lon, 1e7), precisionM: g.precisionM,
    azimutDeg: cap === null ? null : Math.round(cap) % 360, sourceAzimut: boussole !== null ? 'boussole' : cap !== null ? 'deplacement' : null,
    inclinaisonDeg: a?.inclinaisonDeg ?? null, roulisDeg: a?.roulisDeg ?? null,
  };
}
