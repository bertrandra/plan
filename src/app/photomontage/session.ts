// La session du photomontage (core/photomontage.ts, three/photomontage3d.ts) : lire la photo choisie, caler la camera sur ce que
// son EXIF en dit, suivre les ajustements a la main, rendre l'image. Chargee a la demande, avec la 3D (app/ecouteurs/photomontage.ts).
//
// Tout se passe dans le navigateur : la photo est lue, ramenee a 2 048 px de cote dans un canevas et posee derriere la scene ; elle
// n'est envoyee ni au serveur ni a Claude, et rien ne s'ecrit dans le projet.

import { photomontage, reglerPhotomontage } from './etat.js';
import { ajusterPose, calerDepuisExif, tailleRamenee, type CibleProjet, type GestePhoto, type Taille } from '../../core/photomontage.js';
import { lireExif } from '../../facade/vision/exif.js';
import { origineDuPlan } from '../ecouteurs/positionGps.js';
import { estAjouteParLeProjet, estBati, estChezUnVoisin, terrasseOuPremiere } from '../../model/fonctions.js';
import { maisonDe } from '../../model/placement.js';
import { aDesSommets } from '../../model/formes.js';
import { centroid } from '../../geometry/basic.js';
import { hauteurFinieMm } from '../../engine/hauteurs.js';
import { avecMoteur3d, moteur3d } from '../../three/demande3d.js';
import { vue3d } from '../../three/etat3d.js';
import { nomFichierTerrasse } from '../../three/nomFichier.js';
import { telechargerBlob } from '../../shell/download.js';
import { showErreur, showToast } from '../../shell/dialogs.js';
import { erreurExport } from '../../util/erreurFichier.js';
import type { Role3d } from '../../three/photomontage3d.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';
import type { Magasin } from '../magasin.js';

/** Ce que la session lit et pilote du reste de l'application. */
export interface DependancesPhotomontage {
  magasin: Magasin;
  objets: () => ObjetPlan[];
  terrasseChoisie: () => string | null;
  ouvrirVue3d: () => void;
  /** « Tous les objets » de la Vue 3D : le photomontage en a besoin pour montrer la maison en transparence. */
  basculerTousLesObjets: (actif: boolean) => void;
  redimensionner3d: () => void;
}

export interface SessionPhotomontage {
  entrer(): void;
  quitter(): void;
  choisirPhoto(fichier: Blob & { name?: string }): Promise<void>;
  ajuster(g: GestePhoto): void;
  recaler(): void;
  reglerAffichage(r: { opacite?: number; maison?: boolean }): void;
  enregistrer(): Promise<void>;
}

/** Ce que le calage vise : la terrasse choisie (a defaut la premiere), sinon tout ce que le projet ajoute ; la maison en fond. */
export function cibleDuProjet(objets: ObjetPlan[], cleTerrasse: string | null): CibleProjet {
  const terrasse = terrasseOuPremiere(objets, cleTerrasse);
  const sommets = (o: ObjetPlan): PtBrut[] => (o.type === 'circle' ? [{ x: o.center.x - o.r, y: o.center.y }, { x: o.center.x + o.r, y: o.center.y }, { x: o.center.x, y: o.center.y - o.r }, { x: o.center.x, y: o.center.y + o.r }] : aDesSommets(o) ? o.pts : []);
  const vises = terrasse && estAjouteParLeProjet(terrasse) ? [terrasse] : objets.filter((o) => !o.hidden && estAjouteParLeProjet(o));
  const pts = vises.flatMap(sommets);
  const maison = maisonDe(objets);
  if (!pts.length) return { centre: maison ? centroid(maison.pts) : { x: 0, y: 0 }, rayon: 5, hauteurM: 0, maison: null };
  const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
  const centre = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const rayon = Math.max(...pts.map((p) => Math.hypot(p.x - centre.x, p.y - centre.y)));
  return { centre, rayon, hauteurM: terrasse ? Math.max(0, hauteurFinieMm(terrasse) / 1000) : 0, maison: maison ? centroid(maison.pts) : null };
}

/** Ce qu'un objet du plan est pour le photomontage (three/photomontage3d.ts) : un batiment de la parcelle aide a caler, un voisin non. */
export function roleDe(o: ObjetPlan | undefined): Role3d {
  if (!o) return 'autre';
  if (estAjouteParLeProjet(o)) return 'projet';
  return estBati(o) && !estChezUnVoisin(o) ? 'bati' : 'autre';
}

/** La photo ramenee dans un canevas : le navigateur redresse l'image d'apres son orientation, la taille lue est celle qu'on voit. */
async function ramener(fichier: Blob): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(fichier);
  try {
    const img = new Image();
    await new Promise<void>((ok, ko) => {
      img.onload = () => ok();
      img.onerror = () => ko(new Error('la photo ne se lit pas'));
      img.src = url;
    });
    const t = tailleRamenee(img.naturalWidth, img.naturalHeight);
    const c = document.createElement('canvas');
    c.width = t.l; c.height = t.h;
    const g = c.getContext('2d');
    if (!g) throw new Error('le navigateur ne sait pas redimensionner la photo');
    g.drawImage(img, 0, 0, t.l, t.h);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function creerSessionPhotomontage(d: DependancesPhotomontage): SessionPhotomontage {
  /** La photo ramenee : gardee le temps de la session, pour revenir au mode sans la rechoisir. */
  let image: HTMLCanvasElement | null = null;
  /** « Tous les objets » etait decoche a l'entree : la sortie le decoche de nouveau. */
  let tousRemis = false;
  // Le role de chaque objet, calcule une fois par rendu du plan : la scene le demande pour chaque objet a chaque geste.
  let roles: { version: number; parCle: Map<string, Role3d> } | null = null;
  const classer = (cle: string): Role3d => {
    const version = d.magasin.store.getState().version;
    if (!roles || roles.version !== version) roles = { version, parCle: new Map(d.objets().map((o) => [o.key, roleDe(o)])) };
    return roles.parCle.get(cle) ?? 'autre';
  };
  const taille = (): Taille | null => (photomontage.photo ? { l: photomontage.photo.l, h: photomontage.photo.h } : null);

  /** Pose le mode sur la scene, ou le change ; sans photo, la scene reste celle de la Vue 3D. */
  function appliquer(): void {
    const pose = photomontage.pose;
    if (!photomontage.actif || !image || !pose) return;
    const img = image;
    avecMoteur3d((m) => { m.reglerPhotomontage3d({ image: img, classer, pose, opacite: photomontage.opacite, maison: photomontage.maison }); });
  }

  function entrer(): void {
    if (photomontage.actif) return;
    if (d.magasin.store.getState().vue !== 'vue3d') d.ouvrirVue3d();
    if (!vue3d.tousLesObjets) { tousRemis = true; d.basculerTousLesObjets(true); }
    reglerPhotomontage({ actif: true });
    // Le trait de l'objet choisi (app/ecouteurs/selection3d.ts) suit le magasin : il se retire a l'entree et revient a la sortie.
    d.magasin.notifier();
    appliquer();
  }

  function quitter(): void {
    if (!photomontage.actif) return;
    moteur3d()?.quitterPhotomontage3d();
    reglerPhotomontage({ actif: false });
    if (tousRemis) { tousRemis = false; d.basculerTousLesObjets(false); }
    d.magasin.notifier();
    // L'hote reprend sa taille au rendu de l'ecran qui suit : le canevas la suit alors.
    requestAnimationFrame(() => d.redimensionner3d());
  }

  // Quitter la Vue 3D quitte le mode : la photo reste en memoire, le photomontage se reprend ou on l'avait laisse.
  d.magasin.store.subscribe((s) => { if (photomontage.actif && s.vue !== 'vue3d') quitter(); });

  async function choisirPhoto(fichier: Blob & { name?: string }): Promise<void> {
    reglerPhotomontage({ lecture: true });
    try {
      // L'EXIF se lit sur le fichier d'origine : la reduction par un canevas l'efface (facade/vision/exif.ts).
      const exif = lireExif(await fichier.arrayBuffer());
      const canevas = await ramener(fichier);
      image = canevas;
      const t = { l: canevas.width, h: canevas.height };
      const calage = calerDepuisExif(exif, origineDuPlan(d.objets()), cibleDuProjet(d.objets(), d.terrasseChoisie()), t);
      reglerPhotomontage({ lecture: false, photo: { ...t, nom: fichier.name ?? 'photo' }, calage, pose: calage.pose });
      appliquer();
    } catch {
      reglerPhotomontage({ lecture: false });
      showToast('Cette photo ne se lit pas. Choisissez une image JPEG ou PNG.');
    }
  }

  function ajuster(g: GestePhoto): void {
    if (!photomontage.pose) return;
    reglerPhotomontage({ pose: ajusterPose(photomontage.pose, g) });
    appliquer();
  }

  function recaler(): void {
    if (!photomontage.calage) return;
    reglerPhotomontage({ pose: photomontage.calage.pose });
    appliquer();
  }

  function reglerAffichage(r: { opacite?: number; maison?: boolean }): void {
    reglerPhotomontage(r);
    appliquer();
  }

  async function enregistrer(): Promise<void> {
    const t = taille(), m = moteur3d();
    if (!t || !m || !photomontage.actif) return;
    const png = photomontage.format === 'png';
    const blob = await m.capturerPhotomontage3d(t, png ? 'image/png' : 'image/jpeg', photomontage.maison && photomontage.maisonDansImage);
    if (!blob) {
      const { texte, detail } = erreurExport(new RangeError('photomontage : canvas.toBlob a rendu null'), 'L’image du photomontage', 'f');
      showErreur(texte, detail);
      return;
    }
    const terrasse = terrasseOuPremiere(d.objets(), d.terrasseChoisie());
    const nom = 'photomontage_' + nomFichierTerrasse(terrasse?.name) + (png ? '.png' : '.jpg');
    telechargerBlob(nom, blob);
    showToast('Image enregistrée : ' + nom + ' (' + t.l + ' × ' + t.h + ' px).');
  }

  return { entrer, quitter, choisirPhoto, ajuster, recaler, reglerAffichage, enregistrer };
}

let session: SessionPhotomontage | null = null;
/** La session, creee au premier besoin ; le panneau du mode (zones/vue3d/Photomontage.tsx) la retrouve ensuite sans ses dependances. */
export function sessionPhotomontage(d?: DependancesPhotomontage): SessionPhotomontage | null {
  if (!session && d) session = creerSessionPhotomontage(d);
  return session;
}
