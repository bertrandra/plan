// Le controleur du mode audit (MD/spec-audit.md) : il branche la promenade sur le GPS (ou une adresse
// de depart), la Vue 3D et le doigt.
//
// - Depart : la parcelle sous le premier point precis, puis tout ce qui est a 70 m ; a chaque pas de
//   plus de 10 m, une nouvelle lecture autour de la position (app/audit/chargement.ts).
// - Vue 3D : votre position (three/positionGps3d.ts), une camera « drone » (app/audit/camera.ts)
//   dont le centre de rotation et de zoom est votre position. « Me suivre » recadre dans l'axe de
//   votre cap (la boussole, sinon le sens de la marche) et le suit ; tourner la vue au doigt le lache.
// - Doigt : un tapotement sur un batiment le marque en rouge (ou retire la marque) ; un appui long
//   ouvre sa fiche. Au depart d'une adresse, un tapotement au sol y deplace votre position.
// - Fin : la liste des cas, puis un seul fichier partage par le telephone.
//
// Rien n'est enregistre sur la plateforme : main.ts ne pose aucun depot de projets, et la lecture des
// toits en tache de fond n'est pas lancee (app/boot.ts). La promenade, elle, est gardee au fil de
// l'eau dans le telephone (io/brouillonAudit.ts) : a la reouverture, « Reprendre l'audit du … » ou
// « Le jeter » ; une fois le fichier partage, le brouillon s'efface si vous le confirmez.

import { suivrePositionGps, type PositionGps } from '../../shell/geolocalisation.js';
import { type PrisePhoto } from '../../model/audit.js';
import { hotes3d } from '../../three/etat3d.js';
import { poserPositionGps } from '../../three/positionGps3d.js';
import { objetSousLePointeur } from '../../three/scene.js';
import { COULEURS_DIAGNOSTIC } from '../diagnostic.js';
import { parcours } from '../parcours.js';
import { planDeDepart, chargerAutour, fautRecharger } from './chargement.js';
import type { DemandeAudit } from './demande.js';
import type { ProjecteurLocal } from '../../geo/projection.js';
import type { ObjetBrut, PtBrut } from '../../model/types.js';
import { PRECISION_DEPART_MAX_M, type ContexteAudit, type ControleurAudit, MESSAGES_GPS } from './controleur/contexte.js';
import { prisePhotoDe, suiviDuCap, facadeReconnue, resume, estBatiment } from './controleur/cap.js';
import { couleursDuPlan, promenadeDuPlan, repriseDuControleur, partirDeLAdresse } from './controleur/promenade.js';
import { partagerPromenade } from './controleur/partage.js';

export { PRECISION_DEPART_MAX_M, type ContexteAudit, type ControleurAudit } from './controleur/contexte.js';
export { facadeDevantDans } from './controleur/cap.js';


// Le doigt sur la Vue 3D vit a part (doigt.ts) : leger, il se branche au demarrage, avant que l'audit ne soit charge.
export { brancherDoigtAudit } from './doigt.js';


export function creerControleurAudit(ctx: ContexteAudit, demande: DemandeAudit): ControleurAudit {
  const { etat } = ctx;
  let proj: ProjecteurLocal | null = null;
  let position: PtBrut | null = null;
  let precision: number | null = null;
  let derniereLecture: PtBrut | null = null;
  let lecture = false;
  let enAttente: PtBrut | null = null;
  let arreterGps: (() => void) | null = null;
  let depart = false;

  const objet = (cle: string) => etat.objects.find((o) => o.key === cle);
  const promenade = promenadeDuPlan(ctx, () => proj);
  // Le brouillon local : tant que la question de la reprise attend sa reponse, le depart attend aussi.
  const reprise = repriseDuControleur(ctx, promenade, (s) => dire(s), (lon, lat) => partir(lon, lat, null));
  let gpsEnAttente: PositionGps | null = null;

  let statut = demande.depart ? 'Recherche de l’adresse de départ…' : 'En attente d’un GPS précis…';
  const publier = () => {
    etat.audit = { statut, cas: promenade.liste().length, suivre: suivi.suivre(), facade: reconnue.texte() };
    ctx.notifier();
  };
  const resumer = () => resume(etat.objects, precision) + (suivi.capBoussole() !== null ? ' · boussole' : '');
  const dire = (s: string) => { statut = s; publier(); };
  promenade.abonner(publier);

  const reconnue = facadeReconnue(() => etat.objects, () => position, () => suivi.capBoussole(), () => publier());
  const suivi = suiviDuCap(ctx, () => dire(resumer()), reconnue.capChange);

  function recharger(p: PtBrut): void {
    if (!proj) return;
    if (lecture) { enAttente = p; return; }
    lecture = true;
    derniereLecture = p;
    dire('Lecture autour de vous…');
    void chargerAutour(etat.objects, p, proj, ctx.chargement).then((ajouts) => {
      if (!ajouts.length) return;
      ctx.remplacerObjets([...(etat.objects as ObjetBrut[]), ...ajouts]);
      ctx.reconstruire3d();
      promenade.relireManquants((cle) => estBatiment(objet(cle)));
      reconnue.reconnaitre();
    }).finally(() => {
      lecture = false;
      dire(resumer());
      const q = enAttente;
      enAttente = null;
      if (q && fautRecharger(derniereLecture, q)) recharger(q);
    });
  }

  function nouvellePosition(p: PtBrut, precisionM: number | null): void {
    position = p;
    precision = precisionM;
    poserPositionGps(p, precisionM ?? 3);
    suivi.position(p);
    reconnue.reconnaitre();
    if (fautRecharger(derniereLecture, p)) recharger(p);
    else if (!lecture) dire(resumer());
  }

  async function partir(lon: number, lat: number, precisionM: number | null): Promise<void> {
    if (proj || depart) return;
    depart = true;
    dire('Parcelle de départ…');
    const d = await planDeDepart(lon, lat, ctx.chargement).catch(() => null);
    if (!d) { depart = false; dire('Aucune parcelle trouvée ici.'); return; }
    proj = d.proj;
    reprise.poserDepart(lon, lat);
    ctx.remplacerObjets(d.objets as ObjetBrut[]);
    ctx.ouvrir3d();
    const p = proj.versMetres(lon, lat);
    nouvellePosition(p, precisionM);
  }

  function surGps(g: PositionGps): void {
    if (!reprise.repondu()) { gpsEnAttente = g; return; }
    if (proj) { nouvellePosition(proj.versMetres(g.lon, g.lat), g.precisionM); return; }
    if (depart) return;
    if (g.precisionM > PRECISION_DEPART_MAX_M) { dire('En attente d’un GPS précis (± ' + Math.round(g.precisionM) + ' m)…'); return; }
    void partir(g.lon, g.lat, g.precisionM);
  }

  if (demande.depart) {
    const adresse = demande.depart;
    // Un audit repris est reparti de sa propre parcelle : l'adresse ne sert plus.
    reprise.apresReponse(() => { if (!proj && !depart) partirDeLAdresse(ctx, adresse, dire, (lon, lat) => partir(lon, lat, null)); });
  } else {
    reprise.apresReponse(() => { const g = gpsEnAttente; gpsEnAttente = null; if (g) surGps(g); });
    arreterGps = (ctx.suivre ?? suivrePositionGps)(surGps, (e) => {
      ctx.signaler(MESSAGES_GPS[e.raison]);
      if (e.raison === 'refusee') dire('Position refusée.');
    });
  }
  void reprise.proposer();
  publier();
  // La Vue 3D s'ouvre d'emblee : la bibliotheque se charge pendant qu'on cherche le depart.
  ctx.ouvrir3d();

  const prisePhoto = (): PrisePhoto | null => prisePhotoDe(position, precision, proj, suivi);

  const couleurs = couleursDuPlan(etat, promenade);
  const retirer = (cle: string) => { promenade.retirer(cle); ctx.repeindre3d([cle]); };
  /** La fiche d'un batiment ; ouverte depuis la liste de fin, elle y ramene. */
  function ouvrirFiche(cle: string, retour?: () => void): void {
    parcours.ouvrir({ type: 'auditCas', promenade, cle, retirer: () => retirer(cle), prise: prisePhoto, couleurs, ...(retour ? { retour } : {}) });
  }
  function ouvrirListe(): void {
    parcours.ouvrir({ type: 'auditFin', promenade, modifier: (cle) => ouvrirFiche(cle, ouvrirListe), retirer, partager });
  }

  const partager = () => partagerPromenade(ctx, promenade, reprise.apresPartage);

  return {
    promenade,
    couleurs,
    couleur: (o) => (promenade.estMarque(o.key) ? COULEURS_DIAGNOSTIC.rouge : null),
    reprendreSuivi() { suivi.reprendre(position); publier(); },
    lacherSuivi() { if (suivi.lacher()) publier(); },
    prisePhoto,
    facadeDevant: reconnue.courante,
    ouvrirListe,
    partager,
    nouvellePosition,
    tapoter(ndc) {
      const { cle, point } = objetSousLePointeur(ndc);
      const o = cle ? objet(cle) : undefined;
      if (cle && estBatiment(o)) {
        if (promenade.estMarque(cle)) promenade.retirer(cle);
        else promenade.marquer(cle, position ?? point ?? { x: 0, y: 0 }, precision);
        ctx.repeindre3d([cle]);
        return;
      }
      // Au depart d'une adresse, le doigt deplace la position : c'est la promenade sans sortir.
      if (demande.depart && point && proj) nouvellePosition(point, null);
    },
    appuiLong(ndc) {
      const { cle, point } = objetSousLePointeur(ndc);
      const o = cle ? objet(cle) : undefined;
      if (!cle || !estBatiment(o)) return;
      if (!promenade.estMarque(cle)) { promenade.marquer(cle, position ?? point ?? { x: 0, y: 0 }, precision); ctx.repeindre3d([cle]); }
      ouvrirFiche(cle);
    },
    sceneBatie() { if (position) suivi.camera(position); },
    ecrireBrouillon: () => reprise.ecrire(),
    arreter() { arreterGps?.(); arreterGps = null; suivi.arreter(); reconnue.oublier(); void reprise.ecrire(); },
  };
}



/** L'hote de la Vue 3D, ou null s'il n'est pas encore monte. */
export const hoteVue3d = (): HTMLElement | null => hotes3d.vue3d;
