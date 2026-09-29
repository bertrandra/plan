// Z8, le releve de facade (spec-releve-facade §4 a §10) : un parcours plein ecran en cinq temps.
//
// 1. **Mur** : choisir la facade sur le contour du batiment (sautee si l'inspecteur l'a designee).
// 2. **Visee** : la camera, avec l'aide au positionnement - la distance au mur (realite augmentee
//    sur Android ; sinon une alerte, et les reperes sur les bords du mur pour l'estimer), ce qu'elle
//    permet (une photo, plusieurs en se decalant, ou reculer) et l'aplomb du telephone. Le LiDAR est
//    eteint (ui/releve/profondeur.ts).
// 3. **Coins** : les quatre coins du mur (ou du morceau de mur) sur chaque photo, proposes d'apres
//    la distance, ajustes au doigt avec une loupe. Ils peuvent deborder de la photo. Plusieurs photos
//    se prennent l'une apres l'autre, et s'assemblent a l'analyse (facade/mosaique.ts).
// 4. **Analyse** : hauteur du mur, redressement, ouvertures, silhouette du toit (facade/analyse.ts).
//    **Seule la largeur est connue**, lue sur le plan : la hauteur du cadastre n'est qu'une
//    estimation, c'est la photo qui mesure la hauteur a l'egout - et, sur un pignon, son triangle.
// 5. **Resultat** : la facade a l'echelle, sa hauteur mesuree, les ouvertures corrigeables, le toit
//    lu sur la facade ; Valider ecrit le tout dans le projet par le service (app/releve.ts), en un
//    seul pas d'historique. Le toit lu sur la facade remplace celui du batiment.
//
// Rien n'est ecrit dans le plan avant Valider : fermer le parcours ne laisse aucune trace.

import { au } from '../util/tableaux.js';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as PE } from 'react';
import { Icone } from './icones.js';
import { enPoints } from '../model/formes.js';
import { facadesDuContour, type Facade } from '../facade/geometrie.js';
import { focalePx, distanceParCadrage, consigneAplomb, planDePrise, consignePrise, CHAMP_GRAND_COTE_DEFAUT, type ConsignePrise } from '../facade/cadrage.js';
import { analyserReleve, coinsProposes, type ResultatAnalyse } from '../facade/analyse.js';
import { analyserMosaique } from '../facade/mosaique.js';
import { type CoteBas, type Decrochement } from '../facade/profil.js';
import { classer } from '../facade/detection.js';
import { LIBELLES_FORME_TOIT, penteDeg, hauteurPignon } from '../facade/toit.js';
import type { P2 } from '../facade/homographie.js';
import { cameraDisponible, ouvrirCamera, fermerCamera, decouvrirGrandAngle, saisir, lireFichier, lirePhotoNative, versJpeg, type Photo, type ChoixCamera, type OffreGrandAngle } from '../ui/releve/camera.js';
import { champAvecZoom, CHAMP_GRAND_ANGLE_DEFAUT, type Objectif } from '../facade/objectifs.js';
import {
  natifDisponible,
  ecouterNatif,
  attendrePhotoNative,
  webxrDisponible,
  mesurerWebXR,
  demanderPermissionOrientation,
  suivreInclinaison,
  type MesureDistance,
} from '../ui/releve/profondeur.js';
import type { ServiceReleve } from '../app/releve.js';
import type { ObjetPolygone, OuvertureFacade, TypeOuverture, Toit, FormeToit, PtBrut, PartieBasse, ReleveFacade } from '../model/types.js';

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/** Reglages propres a l'appareil : l'objectif choisi et le champ de chacun. Jamais dans le projet. */
function lireReglage(cle: string, defaut: number): number {
  try {
    const v = parseFloat(localStorage.getItem('plan.releve.' + cle) || '');
    return Number.isFinite(v) && v > 0 ? v : defaut;
  } catch {
    return defaut;
  }
}
function ecrireReglage(cle: string, v: number): void {
  try {
    localStorage.setItem('plan.releve.' + cle, String(v));
  } catch {
    /* navigation privee : le reglage vaut pour la seance */
  }
}

/** Un point d'un SVG sous le doigt, dans le repere de son viewBox. */
function pointSvg(svg: SVGSVGElement, e: { clientX: number; clientY: number }): P2 {
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = svg.createSVGPoint();
  p.x = e.clientX;
  p.y = e.clientY;
  const q = p.matrixTransform(m.inverse());
  return { x: q.x, y: q.y };
}

/** Pixels d'ecran par unite du viewBox, suivi au redimensionnement. */
function useEchelle(ref: React.RefObject<SVGSVGElement | null>, largeurVue: number): number {
  const [echelle, setEchelle] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const maj = () => {
      const m = el.getScreenCTM();
      setEchelle(m ? Math.abs(m.a) : el.clientWidth / Math.max(1, largeurVue));
    };
    maj();
    const ro = new ResizeObserver(maj);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, largeurVue]);
  return echelle || 1;
}

const LIBELLES_OUVERTURE: Record<TypeOuverture, string> = {
  fenetre: 'Fenêtre',
  'porte-fenetre': 'Porte-fenêtre',
  porte: 'Porte',
  garage: 'Garage',
};

/* ------------------------------------------------------------------------------------------------
 * 1. Le mur
 * --------------------------------------------------------------------------------------------- */

function ChoixMur({ bat, facades, onChoisir }: { bat: ObjetPolygone; facades: Facade[]; onChoisir: (cote: number) => void }) {
  const pts = bat.pts;
  const xs = pts.map((p) => p.x),
    ys = pts.map((p) => p.y);
  const x0 = Math.min(...xs),
    x1 = Math.max(...xs),
    y0 = Math.min(...ys),
    y1 = Math.max(...ys);
  const marge = Math.max(x1 - x0, y1 - y0) * 0.28 + 1;
  // Nord en haut : Y du plan vers le haut, donc -y dans le SVG.
  const vb = `${x0 - marge} ${-y1 - marge} ${x1 - x0 + 2 * marge} ${y1 - y0 + 2 * marge}`;
  const releve = new Set((bat.facades || []).map((r) => r.cote));
  const taille = Math.max(x1 - x0, y1 - y0);
  return (
    <div className="releveCorps">
      <p className="releveConsigne">Touchez le mur à photographier. Le nord est en haut.</p>
      <svg className="releveMur" viewBox={vb} role="group" aria-label="Contour du bâtiment">
        <polygon points={pts.map((p) => `${p.x},${-p.y}`).join(' ')} className="releveMurContour" vectorEffect="non-scaling-stroke" />
        {facades.map((f) => {
          const m = { x: (f.gauche.x + f.droite.x) / 2, y: (f.gauche.y + f.droite.y) / 2 };
          const lx = m.x + f.normale.x * taille * 0.12,
            ly = m.y + f.normale.y * taille * 0.12;
          return (
            <g
              key={f.cote}
              role="button"
              tabIndex={0}
              aria-label={`Façade ${f.orientation}, ${fr(f.largeur)} mètres`}
              className={'releveMurCote' + (releve.has(f.cote) ? ' releve' : '')}
              onClick={() => onChoisir(f.cote)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onChoisir(f.cote);
              }}
            >
              <line x1={f.gauche.x} y1={-f.gauche.y} x2={f.droite.x} y2={-f.droite.y} className="releveMurCible" vectorEffect="non-scaling-stroke" />
              <line x1={f.gauche.x} y1={-f.gauche.y} x2={f.droite.x} y2={-f.droite.y} className="releveMurTrait" vectorEffect="non-scaling-stroke" />
              <text x={lx} y={-ly} fontSize={taille * 0.07} textAnchor="middle" dominantBaseline="middle">
                {f.orientation}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="releveListe" role="group" aria-label="Façades">
        {facades.map((f) => (
          <button key={f.cote} type="button" className="secondary" onClick={() => onChoisir(f.cote)}>
            <span>
              Façade {f.orientation.toLowerCase()} · {fr(f.largeur)} m
            </span>
            {releve.has(f.cote) && (
              <span className="releveDeja">
                <Icone nom="coche" taille={16} /> relevée
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 2. La visee
 * --------------------------------------------------------------------------------------------- */

/**
 * Les deux reperes a poser sur les bords du mur : sa largeur est la seule taille connue (le plan), la
 * distance s'en deduit. La hauteur, elle, ne l'est pas - c'est la photo qui la mesure.
 */
interface Reperes {
  a: number;
  b: number;
  touches: boolean;
}

interface Prise {
  photo: Photo;
  mesure: MesureDistance | null;
  reperes: Reperes | null;
  champ: number;
  /** Photos que le plan de prise prevoyait au declenchement (null sans distance). */
  photosPrevues: number | null;
}

/**
 * L'objectif choisi (principal ou grand-angle), ce que le telephone offre pour le grand-angle, et le
 * champ de chacun. Le champ se regle et se retient par objectif : ce n'est pas le meme verre.
 */
function useObjectif() {
  const [objectif, setObjectif] = useState<Objectif>(() => (lireReglage('objectif', 1) < 1 ? 'grand-angle' : 'principal'));
  const [offre, setOffre] = useState<OffreGrandAngle | null>(null);
  const [champs, setChamps] = useState(() => ({ principal: lireReglage('champ', CHAMP_GRAND_COTE_DEFAUT), grandAngle: lireReglage('champ-grand-angle', 0) }));
  const disponible = !!offre && (!!offre.deviceId || !!offre.zoom);
  const actif: Objectif = objectif === 'grand-angle' && disponible ? 'grand-angle' : 'principal';
  // Sans reglage retenu, le grand-angle d'un iPhone vaut 13 mm ; atteint par un zoom (Android), il
  // se deduit du champ du principal.
  const champGrandAngle = champs.grandAngle || (offre?.deviceId || !offre?.zoom ? CHAMP_GRAND_ANGLE_DEFAUT : champAvecZoom(champs.principal, offre.zoom));
  const champ = actif === 'grand-angle' ? champGrandAngle : champs.principal;
  const choix: ChoixCamera = actif === 'grand-angle' && offre ? (offre.deviceId ? { deviceId: offre.deviceId } : { zoom: offre.zoom }) : {};
  const choisir = useCallback((o: Objectif) => {
    setObjectif(o);
    ecrireReglage('objectif', o === 'grand-angle' ? 0.5 : 1);
  }, []);
  return {
    objectif: actif,
    disponible,
    choix,
    champ,
    setOffre,
    choisir,
    setChamp(v: number) {
      setChamps((c) => (actif === 'grand-angle' ? { ...c, grandAngle: v } : { ...c, principal: v }));
      ecrireReglage(actif === 'grand-angle' ? 'champ-grand-angle' : 'champ', v);
    },
  };
}

/**
 * La camera, ou le module natif : ouverte au montage et a chaque changement d'objectif, fermee au
 * demontage. A la premiere ouverture, elle dit ce que le telephone offre pour le grand-angle.
 */
function useCamera(
  natif: boolean,
  video: React.RefObject<HTMLVideoElement | null>,
  setCapteur: (m: MesureDistance) => void,
  choix: ChoixCamera,
  surOffre: (o: OffreGrandAngle) => void,
  /** Le grand-angle n'a pas pu s'ouvrir : revenir a l'objectif principal plutot qu'a un ecran noir. */
  surEchecGrandAngle: () => void,
) {
  const [erreur, setErreur] = useState<string | null>(null);
  const deviceId = choix.deviceId ?? null,
    zoom = choix.zoom ?? null;
  useEffect(() => {
    let flux: MediaStream | null = null;
    let fini = false;
    if (natif) {
      document.documentElement.classList.add('releveNatif');
      const arreter = ecouterNatif(setCapteur);
      return () => {
        arreter();
        document.documentElement.classList.remove('releveNatif');
      };
    }
    const el = video.current;
    if (!cameraDisponible() || !el) {
      setErreur("Cet appareil ne donne pas accès à une caméra. Importez une photo prise face au mur.");
      return;
    }
    ouvrirCamera(el, { deviceId, zoom })
      .then((f) => {
        if (fini) {
          fermerCamera(f);
          return;
        }
        flux = f;
        setErreur(null);
        if (!deviceId && !zoom) void decouvrirGrandAngle(f).then(surOffre);
      })
      .catch(() => {
        if (fini) return;
        if (deviceId || zoom) surEchecGrandAngle();
        else setErreur("La caméra n'a pas pu s'ouvrir. Autorisez-la dans les réglages du navigateur, ou importez une photo.");
      });
    return () => {
      fini = true;
      fermerCamera(flux);
    };
  }, [natif, video, setCapteur, deviceId, zoom, surOffre, surEchecGrandAngle]);
  return { erreur, setErreur };
}

/** L'inclinaison : directe sur Android ; sur iOS, elle attend un geste (bouton « Activer le niveau »). */
function useInclinaison() {
  const [beta, setBeta] = useState<number | null>(null);
  const [aDemander, setADemander] = useState(false);
  useEffect(() => {
    const D = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: unknown } }).DeviceOrientationEvent;
    if (!D) return;
    if (typeof D.requestPermission === 'function') {
      setADemander(true);
      return;
    }
    return suivreInclinaison(setBeta);
  }, []);
  const activer = () =>
    void demanderPermissionOrientation().then((ok) => {
      if (ok) suivreInclinaison(setBeta);
      setADemander(false);
    });
  return { beta, aDemander: aDemander && beta === null, activer };
}

/** Tailles de la video et de la scene, pour placer les reperes sur l'image et non sur les bandes. */
function useCadreVideo(video: React.RefObject<HTMLVideoElement | null>, scene: React.RefObject<HTMLDivElement | null>) {
  const [taille, setTaille] = useState({ vw: 0, vh: 0, ew: 0, eh: 0 });
  useEffect(() => {
    const maj = () => {
      const v = video.current,
        s = scene.current;
      if (!s) return;
      setTaille({ vw: v?.videoWidth || s.clientWidth, vh: v?.videoHeight || s.clientHeight, ew: s.clientWidth, eh: s.clientHeight });
    };
    maj();
    const ro = new ResizeObserver(maj);
    if (scene.current) ro.observe(scene.current);
    const v = video.current;
    v?.addEventListener('loadedmetadata', maj);
    return () => {
      ro.disconnect();
      v?.removeEventListener('loadedmetadata', maj);
    };
  }, [video, scene]);
  const k = taille.vw && taille.vh ? Math.min(taille.ew / taille.vw, taille.eh / taille.vh) : 1;
  const cadre = { l: taille.vw * k, h: taille.vh * k, x: (taille.ew - taille.vw * k) / 2, y: (taille.eh - taille.vh * k) / 2 };
  return { taille, cadre };
}

/** La mesure en realite augmentee (Android) : disponible ou non, en cours ou non. */
function useWebxr(natif: boolean, scene: React.RefObject<HTMLDivElement | null>, setCapteur: (m: MesureDistance | null) => void, setErreur: (e: string) => void) {
  const [xr, setXr] = useState(false);
  const [actif, setActif] = useState(false);
  const fin = useRef<(() => void) | null>(null);
  useEffect(() => {
    let vivant = true;
    webxrDisponible()
      .then((ok) => vivant && setXr(ok && !natif))
      .catch(() => undefined);
    return () => {
      vivant = false;
      fin.current?.();
    };
  }, [natif]);
  const basculer = async () => {
    if (actif) {
      fin.current?.();
      return;
    }
    const racine = scene.current;
    if (!racine) return;
    try {
      fin.current = await mesurerWebXR(racine, setCapteur, () => {
        setActif(false);
        fin.current = null;
      });
      setActif(true);
    } catch {
      setErreur("La réalité augmentée n'a pas pu démarrer. La distance reste estimée au cadrage.");
    }
  };
  return { xr, actif, basculer };
}

type Cadre = { l: number; h: number; x: number; y: number };

/** Les deux reperes a faire glisser sur les bords du mur. */
function RepereVisee({ reperes, setReperes, cadre, scene }: { reperes: Reperes; setReperes: React.Dispatch<React.SetStateAction<Reperes>>; cadre: Cadre; scene: React.RefObject<HTMLDivElement | null> }) {
  const glisser = (quel: 'a' | 'b') => (e: PE<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const bouger = (ev: PointerEvent) => {
      const r = scene.current?.getBoundingClientRect();
      if (!r) return;
      const t = (ev.clientX - r.left - cadre.x) / cadre.l;
      setReperes((p) => ({ ...p, [quel]: Math.max(0, Math.min(1, t)), touches: true }));
    };
    const lacher = () => {
      el.removeEventListener('pointermove', bouger);
      el.removeEventListener('pointerup', lacher);
      el.removeEventListener('pointercancel', lacher);
    };
    el.addEventListener('pointermove', bouger);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };
  return (
    <div className="releveReperes" style={{ left: cadre.x, top: cadre.y, width: cadre.l, height: cadre.h }}>
      {(['a', 'b'] as const).map((q) => {
        const v = reperes[q];
        const nom = q === 'a' ? 'Bord gauche' : 'Bord droit';
        return (
          <div
            key={q}
            className="releveRepere vertical"
            style={{ left: `${v * 100}%` }}
            onPointerDown={glisser(q)}
            role="slider"
            aria-label={nom}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(v * 100)}
            tabIndex={0}
            onKeyDown={(e) => {
              const pas = e.key === 'ArrowRight' ? 0.01 : e.key === 'ArrowLeft' ? -0.01 : 0;
              if (pas) setReperes((p) => ({ ...p, [q]: Math.max(0, Math.min(1, p[q] + pas)), touches: true }));
            }}
          >
            <span className="releveRepereEtiquette">{nom}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * La distance et ce qu'elle permet, en haut de l'image. Mesuree (realite augmentee) : le plan de
 * prise en decoule. Sans mesure, une alerte le dit ; les reperes restent, pour une estimation
 * annoncee comme telle.
 */
function MesureVisee({
  mesure,
  consigne,
  mesuree,
  natif,
  xr,
  beta,
}: {
  mesure: MesureDistance | null;
  consigne: ConsignePrise | null;
  mesuree: boolean;
  natif: boolean;
  /** La realite augmentee est-elle disponible pour mesurer ? */
  xr: boolean;
  beta: number | null;
}) {
  const aplomb = consigneAplomb(beta);
  const source = mesure ? { lidar: 'LiDAR', webxr: 'Réalité augmentée', cadrage: 'Estimée, non mesurée' }[mesure.source] : '';
  const alerte = mesuree
    ? null
    : natif
      ? "Le LiDAR ne répond pas : cet iPhone n'en a peut-être pas. Placez les repères pour estimer la distance."
      : xr
        ? 'Distance non mesurée : mesurez-la en réalité augmentée, ou estimez-la avec les repères.'
        : 'Distance non mesurée : estimez-la avec les repères.';
  return (
    <div className="releveMesure" aria-live="polite">
      <div className="releveMesureLigne">
        <span className="releveDistance">{mesure ? `${fr(mesure.distance, 1)} m` : '— m'}</span>
        {mesure && <span className="releveSource">{source}</span>}
      </div>
      {alerte && (
        <div className="releveConsigneCamera aregler" role="alert">
          <Icone nom="info" taille={16} />
          {alerte}
        </div>
      )}
      {consigne ? (
        <div className={'releveConsigneCamera ' + (consigne.ton === 'bon' ? 'bon' : consigne.ton === 'alerte' ? 'aregler' : 'info')}>
          <Icone nom={consigne.ton === 'bon' ? 'coche' : 'info'} taille={16} />
          {consigne.message}
        </div>
      ) : (
        !mesuree && (
          <div className="releveConsigneCamera info">
            <Icone nom="info" taille={16} />
            Faites glisser les deux repères sur les bords du mur.
          </div>
        )
      )}
      {aplomb.message && (
        <div className={'releveConsigneCamera ' + (aplomb.bon ? 'bon' : 'aregler')}>
          <Icone nom={aplomb.bon ? 'coche' : 'info'} taille={16} />
          {aplomb.message}
        </div>
      )}
    </div>
  );
}

/** Le choix de l'objectif, quand le telephone a un grand-angle que la page peut atteindre. */
function ChoixObjectif({ objectif, choisir }: { objectif: Objectif; choisir: (o: Objectif) => void }) {
  return (
    <div className="releveSegment" role="group" aria-label="Objectif">
      <button type="button" aria-pressed={objectif === 'grand-angle'} onClick={() => choisir('grand-angle')}>
        0,5× grand-angle
      </button>
      <button type="button" aria-pressed={objectif === 'principal'} onClick={() => choisir('principal')}>
        1×
      </button>
    </div>
  );
}

/** Le champ de l'objectif en cours, reglage de l'appareil (jamais du projet). */
function ChampObjectif({ champ, setChamp }: { champ: number; setChamp: (v: number) => void }) {
  return (
    <label className="releveChamp">
      Champ de l'objectif
      <input
        type="number"
        min={30}
        max={140}
        step={1}
        value={Math.round(champ)}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          if (v >= 30 && v <= 140) setChamp(v);
        }}
      />
      °
    </label>
  );
}

/** Prendre la photo (camera ou module natif), ou en importer une. */
function usePrise(natif: boolean, video: React.RefObject<HTMLVideoElement | null>, setErreur: (e: string) => void, onPhoto: (p: Photo, importee: boolean) => void) {
  const [enCours, setEnCours] = useState(false);
  const declencher = async () => {
    if (enCours) return;
    setEnCours(true);
    try {
      let photo: Photo | null = null;
      if (natif) {
        const n = await attendrePhotoNative();
        if (n) photo = await lirePhotoNative(n.dataUrl, n.focalePx);
      } else if (video.current) photo = saisir(video.current);
      if (!photo) {
        setErreur("La photo n'a pas pu être prise. Réessayez, ou importez une photo.");
        return;
      }
      onPhoto(photo, false);
    } finally {
      setEnCours(false);
    }
  };
  const importer = async (fichiers: FileList | null) => {
    const fi = fichiers?.[0];
    if (!fi) return;
    try {
      onPhoto(await lireFichier(fi), true);
    } catch {
      setErreur("Cette image n'a pas pu être lue. Choisissez une photo JPEG ou PNG.");
    }
  };
  return { enCours, declencher, importer };
}

/**
 * `hauteurACadrer` : ce que la photo doit contenir en hauteur - l'egout estime (cadastre) et, sur un
 * pignon, le triangle du toit, sans lequel ni la hauteur de la facade ni le toit ne se lisent.
 */
function Visee({ facade, hauteurACadrer, faites, onPrise, onRetour }: { facade: Facade; hauteurACadrer: number; faites: number; onPrise: (p: Prise) => void; onRetour: () => void }) {
  const natif = useMemo(() => natifDisponible(), []);
  const video = useRef<HTMLVideoElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const [capteur, setCapteur] = useState<MesureDistance | null>(null);
  const [reperes, setReperes] = useState<Reperes>({ a: 0.2, b: 0.8, touches: false });
  const obj = useObjectif();
  const champ = obj.champ;
  const { choisir } = obj;
  // Le message survit a la reouverture de l'objectif principal, qui efface les erreurs de camera.
  const [repli, setRepli] = useState(false);
  const surEchecGrandAngle = useCallback(() => {
    choisir('principal');
    setRepli(true);
  }, [choisir]);
  const { erreur, setErreur } = useCamera(natif, video, setCapteur, obj.choix, obj.setOffre, surEchecGrandAngle);
  const niveau = useInclinaison();
  const { taille, cadre } = useCadreVideo(video, scene);
  const ar = useWebxr(natif, scene, setCapteur, setErreur);

  const f = taille.vw ? focalePx(taille.vw, taille.vh, champ) : 0;
  // La largeur du mur est la seule taille connue : c'est elle que les reperes encadrent.
  const px = Math.abs(reperes.b - reperes.a) * taille.vw;
  const dCadrage = reperes.touches && f ? distanceParCadrage(facade.largeur, px, f) : null;
  const mesure: MesureDistance | null = capteur ?? (dCadrage ? { distance: dCadrage, source: 'cadrage' } : null);
  // La distance mesuree (ou estimee) dit combien de photos il faut, ou s'il faut reculer.
  // L'image de reference : celle du capteur natif s'il la donne, sinon la video de la page.
  const img = capteur?.camera ?? (f ? { largeurPx: taille.vw, hauteurPx: taille.vh, focalePx: f } : null);
  const plan = mesure && img ? planDePrise(facade.largeur, hauteurACadrer, mesure.distance, img.largeurPx, img.hauteurPx, img.focalePx) : null;
  const consigne = plan ? consignePrise(plan, faites, obj.disponible && obj.objectif !== 'grand-angle') : null;
  const photosPrevues = plan?.photos ?? null;
  const prise = usePrise(natif, video, setErreur, (photo, importee) =>
    onPrise(
      importee
        ? { photo, mesure: capteur, reperes: null, champ: photo.champ ?? champ, photosPrevues }
        : { photo, mesure, reperes: reperes.touches && !capteur ? reperes : null, champ, photosPrevues },
    ),
  );

  return (
    <div className="releveCamera">
      <div className="releveScene" ref={scene}>
        {!natif && <video ref={video} className="releveVideo" playsInline muted aria-label="Caméra" />}
        {!capteur && taille.vw > 0 && <RepereVisee reperes={reperes} setReperes={setReperes} cadre={cadre} scene={scene} />}
        <div className="releveViseur" aria-hidden="true" />
        <MesureVisee mesure={mesure} consigne={consigne} mesuree={!!capteur} natif={natif} xr={ar.xr} beta={niveau.beta} />
        {(erreur || repli) && (
          <div className="releveErreur" role="alert">
            {erreur || "Le grand-angle n'a pas pu s'ouvrir : retour à l'objectif principal."}
          </div>
        )}
      </div>
      <div className="releveOutils">
        <div className="releveRangee">
          {!natif && obj.disponible && (
            <ChoixObjectif
              objectif={obj.objectif}
              choisir={(o) => {
                setRepli(false);
                obj.choisir(o);
              }}
            />
          )}
        </div>
        <div className="releveRangee releveDeclenchement">
          <button type="button" className="secondary" onClick={onRetour}>
            Retour
          </button>
          <button type="button" className="releveDeclencheur" aria-label="Prendre la photo" disabled={prise.enCours || (!natif && !!erreur && !cameraDisponible())} onClick={() => void prise.declencher()}>
            <Icone nom="camera" taille={30} />
          </button>
          <button type="button" className="secondary" onClick={() => fichier.current?.click()}>
            <Icone nom="image" taille={18} /> Importer
          </button>
          <input ref={fichier} type="file" accept="image/*" hidden onChange={(e) => void prise.importer(e.target.files)} />
        </div>
        <div className="releveRangee releveSecondaire">
          {ar.xr && (
            <button type="button" className="secondary small" aria-pressed={ar.actif} onClick={() => void ar.basculer()}>
              {ar.actif ? 'Arrêter la mesure AR' : 'Mesurer en réalité augmentée'}
            </button>
          )}
          {niveau.aDemander && (
            <button type="button" className="secondary small" onClick={niveau.activer}>
              Activer le niveau
            </button>
          )}
          <ChampObjectif champ={champ} setChamp={obj.setChamp} />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 3. Les coins
 * --------------------------------------------------------------------------------------------- */

const NOMS_COINS = ['Égout, à gauche', 'Égout, à droite', 'Pied du mur, à droite', 'Pied du mur, à gauche'];

/** Les poignees d'un mur en L : les quatre coins visibles du L, puis les deux points du decrochement. */
function nomsEnL(cote: CoteBas): string[] {
  return cote === 'droite'
    ? ['Égout haut, à gauche', 'Égout bas, à droite', 'Pied du mur, à droite', 'Pied du mur, à gauche', 'Décrochement, égout haut', 'Décrochement, égout bas']
    : ['Égout bas, à gauche', 'Égout haut, à droite', 'Pied du mur, à droite', 'Pied du mur, à gauche', 'Décrochement, égout haut', 'Décrochement, égout bas'];
}

/** Ordre de trace du contour : le rectangle, ou le L en passant par le decrochement. */
function ordreDuContour(decro: Decrochement | null | undefined): number[] {
  if (!decro) return [0, 1, 2, 3];
  return decro.cote === 'droite' ? [0, 4, 5, 1, 2, 3] : [0, 5, 4, 1, 2, 3];
}

/** Le decrochement propose quand on bascule en L : aux trois cinquiemes du mur, cote bas. */
function decrochementPropose(coins: readonly P2[], cote: CoteBas): Decrochement {
  const t = cote === 'droite' ? 0.6 : 0.4;
  const lerp = (a: P2, b: P2, k: number) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
  const haut = lerp(au(coins, 0), au(coins, 1), t);
  const pied = lerp(au(coins, 3), au(coins, 2), t);
  return { cote, haut, bas: lerp(haut, pied, 0.5) };
}

function Coins({ photo, coins, setCoins, noms = NOMS_COINS, ordre = [0, 1, 2, 3] }: { photo: Photo; coins: P2[]; setCoins: (c: P2[]) => void; noms?: string[]; ordre?: number[] }) {
  const W = photo.image.largeur,
    H = photo.image.hauteur;
  const m = Math.max(W, H) * 0.22;
  const svg = useRef<SVGSVGElement>(null);
  const echelle = useEchelle(svg, W + 2 * m);
  const [actif, setActif] = useState<number | null>(null);
  const r = 16 / echelle;

  const saisirCoin = (i: number) => (e: PE<SVGCircleElement>) => {
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setActif(i);
    const racine = svg.current;
    if (!racine) return;
    const depart = pointSvg(racine, e);
    const origine = au(coins, i);
    const bouger = (ev: PointerEvent) => {
      const q = pointSvg(racine, ev);
      const n = [...coins];
      n[i] = { x: Math.max(-m, Math.min(W + m, origine.x + q.x - depart.x)), y: Math.max(-m, Math.min(H + m, origine.y + q.y - depart.y)) };
      setCoins(n);
    };
    const lacher = () => {
      setActif(null);
      el.removeEventListener('pointermove', bouger);
      el.removeEventListener('pointerup', lacher);
      el.removeEventListener('pointercancel', lacher);
    };
    el.addEventListener('pointermove', bouger);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };

  const milieu = (a: P2, b: P2) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const haut = milieu(au(coins, 0), au(coins, 1)),
    bas = milieu(au(coins, 2), au(coins, 3));
  const loupe = actif !== null ? au(coins, actif) : null;
  const fen = Math.max(W, H) * 0.06;

  return (
    <div className="releveCoinsZone">
      <svg ref={svg} className="releveCoins" viewBox={`${-m} ${-m} ${W + 2 * m} ${H + 2 * m}`} aria-label="Photo : placez les quatre coins du mur">
        <rect x={-m} y={-m} width={W + 2 * m} height={H + 2 * m} className="releveCoinsFond" />
        <image href={photo.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
        <polygon points={ordre.map((i) => au(coins, i)).map((c) => `${c.x},${c.y}`).join(' ')} className="releveQuad" vectorEffect="non-scaling-stroke" />
        <text x={haut.x} y={haut.y - r * 1.6} fontSize={13 / echelle} textAnchor="middle" className="releveQuadEtiquette">
          Égout
        </text>
        <text x={bas.x} y={bas.y + r * 2.4} fontSize={13 / echelle} textAnchor="middle" className="releveQuadEtiquette">
          Sol
        </text>
        {coins.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={r * 1.7} className="releveCoinCible" onPointerDown={saisirCoin(i)} role="slider" aria-label={noms[i]} aria-valuenow={0} tabIndex={0} />
            <circle cx={c.x} cy={c.y} r={r * 0.35} className="releveCoinCentre" pointerEvents="none" />
          </g>
        ))}
      </svg>
      {loupe && (
        <svg className="releveLoupe" viewBox={`${loupe.x - fen} ${loupe.y - fen} ${2 * fen} ${2 * fen}`} aria-hidden="true">
          <rect x={-m} y={-m} width={W + 2 * m} height={H + 2 * m} className="releveCoinsFond" />
          <image href={photo.url} x={0} y={0} width={W} height={H} preserveAspectRatio="none" />
          <path d={`M${loupe.x - fen} ${loupe.y}H${loupe.x + fen}M${loupe.x} ${loupe.y - fen}V${loupe.y + fen}`} className="releveLoupeCroix" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------
 * 5. Le resultat : ouvertures corrigeables, toit propose
 * --------------------------------------------------------------------------------------------- */

function Elevation({
  texture,
  partie,
  Ht,
  L,
  H,
  ouvertures,
  setOuvertures,
  choisie,
  setChoisie,
}: {
  texture: string;
  /** Hauteur couverte par la texture : le mur, et au-dessus la bande du pignon, hors du cadre. */
  Ht: number;
  /** Mur en L : au-dessus de la partie basse, il n'y a pas de mur. */
  partie?: PartieBasse | null;
  L: number;
  H: number;
  ouvertures: OuvertureFacade[];
  setOuvertures: (o: OuvertureFacade[]) => void;
  choisie: number | null;
  setChoisie: (i: number | null) => void;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const echelle = useEchelle(svg, L);
  const r = 9 / echelle;

  /** Deplace l'ouverture (`coin` = -1) ou un de ses coins, en metres, au centimetre pres. */
  const saisir = (i: number, coin: number) => (e: PE<SVGElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    setChoisie(i);
    const racine = svg.current;
    if (!racine) return;
    const depart = pointSvg(racine, e);
    const o0 = au(ouvertures, i);
    const bouger = (ev: PointerEvent) => {
      const q = pointSvg(racine, ev);
      const dx = q.x - depart.x,
        dy = -(q.y - depart.y); // SVG vers le bas, facade vers le haut
      const o = { ...o0 };
      if (coin === -1) {
        o.x = Math.max(0, Math.min(L - o.l, o0.x + dx));
        o.y = Math.max(0, Math.min(H - o.h, o0.y + dy));
      } else {
        const gauche = coin === 0 || coin === 3,
          dessus = coin === 0 || coin === 1;
        if (gauche) {
          o.x = Math.min(o0.x + o0.l - 0.2, Math.max(0, o0.x + dx));
          o.l = o0.x + o0.l - o.x;
        } else o.l = Math.max(0.2, Math.min(L - o0.x, o0.l + dx));
        if (dessus) o.h = Math.max(0.2, Math.min(H - o0.y, o0.h + dy));
        else {
          o.y = Math.min(o0.y + o0.h - 0.2, Math.max(0, o0.y + dy));
          o.h = o0.y + o0.h - o.y;
        }
      }
      const cm = (v: number) => Math.round(v * 100) / 100;
      const n = [...ouvertures];
      n[i] = { ...o, x: cm(o.x), y: cm(o.y), l: cm(o.l), h: cm(o.h) };
      setOuvertures(n);
    };
    const lacher = () => {
      el.removeEventListener('pointermove', bouger);
      el.removeEventListener('pointerup', lacher);
      el.removeEventListener('pointercancel', lacher);
    };
    el.addEventListener('pointermove', bouger);
    el.addEventListener('pointerup', lacher);
    el.addEventListener('pointercancel', lacher);
  };

  return (
    <svg ref={svg} className="releveElevation" viewBox={`${-0.2} ${-0.2} ${L + 0.4} ${H + 0.4}`} onPointerDown={() => setChoisie(null)} aria-label="Façade redressée et ses ouvertures">
      <svg x={0} y={0} width={L} height={H} viewBox={`0 0 ${L} ${H}`} overflow="hidden">
        <image href={texture} x={0} y={H - Ht} width={L} height={Ht} preserveAspectRatio="none" />
      </svg>
      <rect x={0} y={0} width={L} height={H} className="releveElevationCadre" vectorEffect="non-scaling-stroke" />
      {partie && <rect x={partie.debut} y={0} width={partie.fin - partie.debut} height={H - partie.hauteur} className="releveVide" pointerEvents="none" />}
      {ouvertures.map((o, i) => {
        const y = H - o.y - o.h;
        const sel = i === choisie;
        return (
          <g key={i} className={'releveOuverture' + (sel ? ' choisie' : '')}>
            <rect x={o.x} y={y} width={o.l} height={o.h} vectorEffect="non-scaling-stroke" onPointerDown={saisir(i, -1)} role="button" aria-label={`${LIBELLES_OUVERTURE[o.type]} ${fr(o.l)} × ${fr(o.h)} m`} tabIndex={0} />
            <text x={o.x + o.l / 2} y={y + o.h / 2} fontSize={12 / echelle} strokeWidth={3 / echelle} textAnchor="middle" dominantBaseline="middle" pointerEvents="none">
              {Math.round(o.l * 100)}×{Math.round(o.h * 100)}
            </text>
            {sel &&
              [
                [o.x, y],
                [o.x + o.l, y],
                [o.x + o.l, y + o.h],
                [o.x, y + o.h],
              ].map(([cx, cy], k) => <circle key={k} cx={cx} cy={cy} r={r} className="relevePoignee" onPointerDown={saisir(i, k)} />)}
          </g>
        );
      })}
    </svg>
  );
}

function ChampCm({ libelle, valeur, onChange }: { libelle: string; valeur: number; onChange: (v: number) => void }) {
  const [texte, setTexte] = useState(String(Math.round(valeur * 100)));
  useEffect(() => setTexte(String(Math.round(valeur * 100))), [valeur]);
  return (
    <label className="releveCm">
      <span>{libelle}</span>
      <span className="champNombre">
        <input
          type="number"
          inputMode="numeric"
          value={texte}
          onChange={(e) => {
            setTexte(e.target.value);
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v) && v >= 0) onChange(v / 100);
          }}
        />
        <span className="unite">cm</span>
      </span>
    </label>
  );
}

/* ------------------------------------------------------------------------------------------------
 * Le parcours
 * --------------------------------------------------------------------------------------------- */

type Etape = 'mur' | 'visee' | 'coins' | 'analyse' | 'resultat';

interface Resultat {
  /** La partie basse d'un mur en L, mesuree ; corrigeable avant de valider. */
  partieBasse: PartieBasse | null;
  texture: string;
  hauteurTexture: number;
  /** La hauteur a-t-elle ete mesuree sur la photo (sinon, c'est celle du cadastre) ? */
  hauteurMesuree: boolean;
  couverture: number;
  toitPropose: Toit | null;
  /** Ce que l'assemblage de plusieurs photos a trouve a redire, s'il y a lieu. */
  avis: string | null;
}

/** Une photo d'un morceau du mur et ses quatre coins. */
interface Morceau {
  prise: Prise;
  coins: P2[];
  /** Mur a deux hauteurs d'egout : le decrochement pose sur la photo (une seule photo). */
  decrochement?: Decrochement | null;
}

/**
 * Les coins proposes pour une prise : projection d'apres la distance (et la hauteur estimee), ou les
 * reperes poses sur la video, qui disent exactement ou sont les bords et l'emportent. Quand le mur
 * se photographie en plusieurs fois, le rectangle propose est la part de mur que l'image couvre, pas
 * le mur entier.
 */
function coinsDePrise(p: Prise, largeurMur: number, hauteurEstimee: number, partiel: boolean): P2[] {
  const w = p.photo.image.largeur,
    h = p.photo.image.hauteur;
  const f = p.photo.focalePx ?? focalePx(w, h, p.photo.champ ?? p.champ);
  const d = p.mesure?.distance ?? null;
  const visible = d ? (d * w) / f : largeurMur;
  const c = coinsProposes(w, h, f, d, partiel ? Math.min(largeurMur, 0.8 * visible) : largeurMur, hauteurEstimee);
  if (p.reperes) {
    const [a, b] = [Math.min(p.reperes.a, p.reperes.b), Math.max(p.reperes.a, p.reperes.b)];
    au(c, 0).x = au(c, 3).x = a * w;
    au(c, 1).x = au(c, 2).x = b * w;
  }
  // A courte distance, le mur deborde de l'image : les coins projetes tombent loin hors cadre.
  // On les ramene dans la marge ou le doigt peut les saisir (celle de <Coins>).
  const m = Math.max(w, h) * 0.2;
  return c.map((q) => ({ x: Math.max(-m, Math.min(w + m, q.x)), y: Math.max(-m, Math.min(h + m, q.y)) }));
}

/** La consigne des coins, selon la place de la photo dans la serie. */
function consigneCoins(numero: number, total: number): string {
  if (total <= 1) return "Placez chaque rond sur un coin du mur : les deux du haut à l'égout, les deux du bas au pied du mur. Un coin caché ou hors cadre se place là où il serait.";
  const bords =
    numero === 0
      ? 'Ceux de gauche sur le coin gauche du mur, ceux de droite sur une verticale du mur près du bord droit de la photo.'
      : numero === total - 1
        ? 'Ceux de droite sur le coin droit du mur, ceux de gauche sur une verticale du mur près du bord gauche de la photo.'
        : 'À gauche et à droite, sur une verticale du mur près du bord de la photo.';
  return `Photo ${numero + 1} sur ${total} : les ronds du haut sur l'égout, ceux du bas au pied du mur. ${bords}`;
}

/** Les photos de la serie, de gauche a droite : on en choisit une pour la reprendre ou la retirer. */
function BandeauMorceaux({ morceaux, courant, choisir, retirer }: { morceaux: Morceau[]; courant: number; choisir: (k: number) => void; retirer: (k: number) => void }) {
  return (
    <div className="releveMorceaux" role="group" aria-label="Photos de la façade">
      {morceaux.map((m, k) => (
        <div key={k} className={'releveMorceau' + (k === courant ? ' choisi' : '')}>
          <button type="button" className="releveVignette" aria-pressed={k === courant} aria-label={`Photo ${k + 1}`} onClick={() => choisir(k)}>
            <img src={m.prise.photo.url} alt="" />
            <span>{k + 1}</span>
          </button>
          {morceaux.length > 1 && (
            <button type="button" className="secondary small" aria-label={`Retirer la photo ${k + 1}`} onClick={() => retirer(k)}>
              <Icone nom="supprimer" taille={14} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/** Rectangle, ou mur en L avec la partie basse a gauche ou a droite. */
function FormeDuMur({ decro, choisir }: { decro: Decrochement | null; choisir: (c: CoteBas | null) => void }) {
  return (
    <div className="releveSegment" role="group" aria-label="Forme du mur">
      <button type="button" aria-pressed={!decro} onClick={() => choisir(null)}>
        Rectangle
      </button>
      <button type="button" aria-pressed={decro?.cote === 'gauche'} onClick={() => choisir('gauche')}>
        En L, bas à gauche
      </button>
      <button type="button" aria-pressed={decro?.cote === 'droite'} onClick={() => choisir('droite')}>
        En L, bas à droite
      </button>
    </div>
  );
}

function EtapeCoins({
  morceaux,
  courant,
  choisir,
  retirer,
  setCoins,
  setDecrochement,
  prevues,
  avis,
  largeur,
  onReprendre,
  onAjouter,
  onAnalyser,
}: {
  morceaux: Morceau[];
  courant: number;
  choisir: (k: number) => void;
  retirer: (k: number) => void;
  setCoins: (c: P2[]) => void;
  setDecrochement: (d: Decrochement | null) => void;
  prevues: number;
  avis: string | null;
  largeur: number;
  onReprendre: () => void;
  onAjouter: () => void;
  onAnalyser: () => void;
}) {
  const m = au(morceaux, courant);
  const total = Math.max(morceaux.length, prevues);
  const manque = prevues > morceaux.length ? prevues - morceaux.length : 0;
  return (
    <>
      <div className="releveCorps releveCorpsPhoto">
        {total > 1 && <BandeauMorceaux morceaux={morceaux} courant={courant} choisir={choisir} retirer={retirer} />}
        <p className="releveConsigne">
          {m.decrochement
            ? "Mur en L : les coins du pied aux deux bouts, l'égout haut au bout haut, l'égout bas au bout bas ; puis les deux ronds du décrochement, sur l'égout haut et l'égout bas, là où la hauteur change."
            : consigneCoins(courant, total)}
        </p>
        {avis && (
          <p className="releveAvis" role="alert">
            {avis}
          </p>
        )}
        {total === 1 && <FormeDuMur decro={m.decrochement ?? null} choisir={(c) => setDecrochement(c ? decrochementPropose(m.coins, c) : null)} />}
        {m.decrochement ? (
          <Coins
            key={courant + m.decrochement.cote}
            photo={m.prise.photo}
            coins={[...m.coins, m.decrochement.haut, m.decrochement.bas]}
            setCoins={(c) => {
              setCoins(c.slice(0, 4));
              const d = m.decrochement;
              if (d) setDecrochement({ ...d, haut: au(c, 4), bas: au(c, 5) });
            }}
            noms={nomsEnL(m.decrochement.cote)}
            ordre={ordreDuContour(m.decrochement)}
          />
        ) : (
          <Coins key={courant} photo={m.prise.photo} coins={m.coins} setCoins={setCoins} />
        )}
        <p className="releveNote">Largeur du mur : {fr(largeur)} m, lue sur le plan. La hauteur se mesure sur la photo, d'après ces coins.</p>
        {manque > 0 && (
          <p className="releveNote">
            D'après la distance mesurée, il reste {manque} photo{manque > 1 ? 's' : ''} à prendre pour couvrir le mur.
          </p>
        )}
      </div>
      <div className="relevePied">
        <button type="button" className="secondary" onClick={onReprendre}>
          Reprendre cette photo
        </button>
        <button type="button" className={manque > 0 ? '' : 'secondary'} onClick={onAjouter}>
          <Icone nom="plus" taille={16} /> Ajouter une photo
        </button>
        <button type="button" className={manque > 0 ? 'secondary' : ''} onClick={onAnalyser}>
          Analyser
        </button>
      </div>
    </>
  );
}

function EtapeAnalyse() {
  return (
    <div className="releveCorps releveAnalyse" aria-live="polite">
      <div className="releveSablier" aria-hidden="true" />
      <p className="releveConsigne">Analyse de votre façade…</p>
      <ul>
        <li>Mesure de la hauteur du mur</li>
        <li>Redressement de la photo à l'échelle</li>
        <li>Recherche des fenêtres et des portes</li>
        <li>Lecture de la silhouette du toit</li>
      </ul>
    </div>
  );
}

/** La fiche de l'ouverture choisie : nature, cotes au centimetre, retrait. */
function FicheOuverture({ o, largeur, hauteurMur, maj, retirer }: { o: OuvertureFacade; largeur: number; hauteurMur: number; maj: (c: Partial<OuvertureFacade>) => void; retirer: () => void }) {
  return (
    <div className="releveFiche" role="group" aria-label="Ouverture choisie">
      <div className="releveSegment" role="group" aria-label="Nature">
        {(Object.keys(LIBELLES_OUVERTURE) as TypeOuverture[]).map((t) => (
          <button key={t} type="button" aria-pressed={o.type === t} onClick={() => maj({ type: t })}>
            {LIBELLES_OUVERTURE[t]}
          </button>
        ))}
      </div>
      <div className="releveChamps">
        <ChampCm libelle="Depuis la gauche" valeur={o.x} onChange={(v) => maj({ x: Math.min(v, largeur - o.l) })} />
        <ChampCm libelle="Appui" valeur={o.y} onChange={(v) => maj({ y: Math.min(v, hauteurMur - o.h) })} />
        <ChampCm libelle="Largeur" valeur={o.l} onChange={(v) => maj({ l: Math.max(0.1, Math.min(v, largeur - o.x)) })} />
        <ChampCm libelle="Hauteur" valeur={o.h} onChange={(v) => maj({ h: Math.max(0.1, Math.min(v, hauteurMur - o.y)) })} />
      </div>
      <button type="button" className="secondary small" onClick={retirer}>
        <Icone nom="supprimer" taille={16} /> Retirer cette ouverture
      </button>
    </div>
  );
}

/**
 * Le toit lu sur la facade, corrigeable. Il remplace celui du batiment (celui du cadastre, ou d'un
 * releve precedent) : c'est la derniere facade relevee qui definit le toit. Sur un pignon, la facade
 * porte le triangle du toit, dont la hauteur s'ajoute a celle de l'egout.
 */
function CarteToit({
  toit,
  setToit,
  appliquer,
  setAppliquer,
  contour,
  cote,
  hauteurMur,
}: {
  toit: Toit | null;
  setToit: (t: Toit) => void;
  appliquer: boolean;
  setAppliquer: (v: boolean) => void;
  contour: PtBrut[];
  cote: number;
  hauteurMur: number;
}) {
  if (!toit) {
    return (
      <div className="releveToit">
        <div className="releveSousTitre">Toit</div>
        <p className="releveNote">Le toit n'est pas assez visible sur la photo : celui du bâtiment reste tel quel.</p>
      </div>
    );
  }
  const pignon = hauteurPignon(contour, toit, cote);
  return (
    <div className="releveToit">
      <div className="releveSousTitre">Toit</div>
      <p className="releveNote">
        Lu sur la façade : {LIBELLES_FORME_TOIT[toit.forme].toLowerCase()}
        {toit.forme !== 'plat' ? `, faîtage à ${fr(toit.hauteur)} m au-dessus de l'égout (pente ${fr(penteDeg(contour, toit), 0)}°)` : ''}.
        {pignon > 0.01 ? ` Ce mur est un pignon : la façade monte à ${fr(hauteurMur + pignon)} m au faîtage.` : ''}
      </p>
      <label className="releveCase">
        <input type="checkbox" checked={appliquer} onChange={(e) => setAppliquer(e.target.checked)} />
        Remplacer le toit du bâtiment par celui-ci
      </label>
      {appliquer && (
        <div className="releveChamps">
          <label className="releveCm">
            <span>Forme</span>
            <select value={toit.forme} onChange={(e) => setToit({ ...toit, forme: e.target.value as FormeToit })}>
              {(Object.keys(LIBELLES_FORME_TOIT) as FormeToit[]).map((k) => (
                <option key={k} value={k}>
                  {LIBELLES_FORME_TOIT[k]}
                </option>
              ))}
            </select>
          </label>
          {toit.forme !== 'plat' && (
            <label className="releveCm">
              <span>Faîtage</span>
              <span className="champNombre">
                <input
                  type="number"
                  step={0.05}
                  min={0}
                  max={20}
                  value={toit.hauteur}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    if (v >= 0) setToit({ ...toit, hauteur: v });
                  }}
                />
                <span className="unite">m</span>
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}

/** Ce que l'etape Verifier lit et modifie. */
interface Verification {
  resultat: Resultat;
  largeur: number;
  hauteurMur: number;
  ouvertures: OuvertureFacade[];
  setOuvertures: (o: OuvertureFacade[]) => void;
  choisie: number | null;
  setChoisie: (i: number | null) => void;
  toit: Toit | null;
  setToit: (t: Toit) => void;
  appliquerToit: boolean;
  setAppliquerToit: (v: boolean) => void;
  contour: PtBrut[];
  cote: number;
  partieBasse: PartieBasse | null;
  setPartieBasse: (p: PartieBasse) => void;
  /** La hauteur d'egout du batiment avant ce releve (cadastre, ou releve precedent), pour comparaison. */
  hauteurEstimee: number;
  hauteurMesuree: boolean;
  /** Corrige la hauteur mesuree : la facade s'etire en hauteur, sa largeur (le plan) ne bouge pas. */
  corrigerHauteur: (v: number) => void;
}

/** La hauteur du mur, mesuree sur la photo ; corrigeable si l'on connait mieux. */
function CarteHauteur({ v }: { v: Verification }) {
  return (
    <div className="releveToit">
      <div className="releveSousTitre">Hauteur</div>
      <p className="releveNote">
        {v.hauteurMesuree
          ? `Mesurée sur la photo, à l'échelle de la largeur du plan (${fr(v.largeur)} m). Le bâtiment avait jusqu'ici ${fr(v.hauteurEstimee)} m (cadastre ou relevé précédent).`
          : `La photo ne permettait pas de la mesurer : c'est celle du bâtiment jusqu'ici (cadastre ou relevé précédent). Corrigez-la si vous la connaissez.`}
      </p>
      <div className="releveChamps">
        <ChampHauteur valeur={v.hauteurMur} onChange={v.corrigerHauteur} />
      </div>
    </div>
  );
}

/**
 * La hauteur a l'egout, en metres. Elle ne s'applique qu'a la validation du champ (Entree, ou en le
 * quittant) : chaque correction etire les ouvertures, une frappe intermediaire (« 5 » avant « 5,8 »)
 * ne doit pas le faire.
 */
function ChampHauteur({ valeur, onChange }: { valeur: number; onChange: (v: number) => void }) {
  const [texte, setTexte] = useState(valeur.toFixed(2));
  useEffect(() => setTexte(valeur.toFixed(2)), [valeur]);
  const appliquer = () => {
    const v = parseFloat(texte.replace(',', '.'));
    if (Number.isFinite(v) && v >= 1 && v <= 60 && Math.abs(v - valeur) >= 0.005) onChange(Math.round(v * 100) / 100);
    else setTexte(valeur.toFixed(2));
  };
  return (
    <label className="releveCm">
      <span>À l'égout</span>
      <span className="champNombre">
        <input
          type="number"
          inputMode="decimal"
          step={0.01}
          min={1}
          max={60}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={appliquer}
          onKeyDown={(e) => {
            if (e.key === 'Enter') appliquer();
          }}
        />
        <span className="unite">m</span>
      </span>
    </label>
  );
}

/** La partie basse d'un mur en L, telle que la photo l'a mesuree : la position du decrochement et l'egout bas. */
function CartePartieBasse({ p, largeur, hauteurMur, maj }: { p: PartieBasse; largeur: number; hauteurMur: number; maj: (p: PartieBasse) => void }) {
  const aDroite = p.debut > 0;
  const x = aDroite ? p.debut : p.fin;
  return (
    <div className="releveToit">
      <div className="releveSousTitre">Mur en L</div>
      <p className="releveNote">
        Partie basse {aDroite ? 'à droite' : 'à gauche'}, sur {fr(p.fin - p.debut)} m ; elle va jusqu'au pignon voisin.
      </p>
      <div className="releveChamps">
        <ChampCm libelle="Décrochement à" valeur={x} onChange={(v) => {
          const c = Math.max(0.1, Math.min(largeur - 0.1, v));
          maj(aDroite ? { ...p, debut: c } : { ...p, fin: c });
        }} />
        <ChampCm libelle="Égout bas" valeur={p.hauteur} onChange={(v) => maj({ ...p, hauteur: Math.max(0.5, Math.min(hauteurMur - 0.1, v)) })} />
      </div>
    </div>
  );
}

function EtapeResultat({ v, onRevoir, onValider }: { v: Verification; onRevoir: () => void; onValider: () => void }) {
  const { resultat, largeur, hauteurMur, ouvertures, setOuvertures, choisie, setChoisie } = v;
  const o = choisie !== null ? ouvertures[choisie] : undefined;
  const decompte = (Object.keys(LIBELLES_OUVERTURE) as TypeOuverture[])
    .map((t) => [t, ouvertures.filter((x) => x.type === t).length] as const)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${LIBELLES_OUVERTURE[t].toLowerCase()}${n > 1 ? 's' : ''}`)
    .join(', ');
  const maj = (i: number, champ: Partial<OuvertureFacade>) => setOuvertures(ouvertures.map((x, k) => (k === i ? { ...x, ...champ } : x)));
  const ajouter = () => {
    const l = Math.min(1, largeur * 0.3),
      h = Math.min(1.2, hauteurMur * 0.4);
    setOuvertures([...ouvertures, { type: classer(1, l, h), x: Math.round((largeur - l) * 50) / 100, y: 1, l, h }]);
    setChoisie(ouvertures.length);
  };
  return (
    <>
      <div className="releveCorps releveCorpsPhoto">
        {resultat.avis && (
          <p className="releveAvis" role="alert">
            {resultat.avis}
          </p>
        )}
        {resultat.couverture < 0.9 && <p className="releveAvis">La photo couvrait {Math.round(resultat.couverture * 100)} % du mur ; le reste est complété à la teinte du mur.</p>}
        <Elevation texture={resultat.texture} Ht={resultat.hauteurTexture} L={largeur} H={hauteurMur} partie={v.partieBasse} ouvertures={ouvertures} setOuvertures={setOuvertures} choisie={choisie} setChoisie={setChoisie} />
        <div className="releveBarre">
          <span className="releveNote">{ouvertures.length ? decompte : 'Aucune ouverture trouvée.'}</span>
          <button type="button" className="secondary small" onClick={ajouter}>
            <Icone nom="plus" taille={16} /> Ajouter une ouverture
          </button>
        </div>
        {o && choisie !== null && (
          <FicheOuverture
            o={o}
            largeur={largeur}
            hauteurMur={hauteurMur}
            maj={(c) => maj(choisie, c)}
            retirer={() => {
              setOuvertures(ouvertures.filter((_, k) => k !== choisie));
              setChoisie(null);
            }}
          />
        )}
        <CarteHauteur v={v} />
        {v.partieBasse && <CartePartieBasse p={v.partieBasse} largeur={largeur} hauteurMur={hauteurMur} maj={v.setPartieBasse} />}
        <CarteToit toit={v.toit} setToit={v.setToit} appliquer={v.appliquerToit} setAppliquer={v.setAppliquerToit} contour={v.contour} cote={v.cote} hauteurMur={hauteurMur} />
      </div>
      <div className="relevePied">
        <button type="button" className="secondary" onClick={onRevoir}>
          Revoir les coins
        </button>
        <button type="button" onClick={onValider}>
          Valider le relevé
        </button>
      </div>
    </>
  );
}

/** Echap ferme le parcours, sans rien ecrire. */
function useEchapFerme(releve: ServiceReleve) {
  useEffect(() => {
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === 'Escape') releve.fermer();
    };
    window.addEventListener('keydown', surTouche);
    return () => window.removeEventListener('keydown', surTouche);
  }, [releve]);
}

const LIBELLES_ETAPE: Record<Etape, string> = { mur: 'Choisir le mur', visee: 'Se placer', coins: 'Placer les coins', analyse: 'Analyse', resultat: 'Vérifier' };

/** La focale d'une prise, en pixels : exacte quand la photo la donne, sinon d'apres le champ de l'objectif. */
function focaleDe(m: Morceau): number {
  const img = m.prise.photo.image;
  return m.prise.photo.focalePx ?? focalePx(img.largeur, img.hauteur, m.prise.photo.champ ?? m.prise.champ);
}

/**
 * Ce que la hauteur mesuree a d'etonnant : loin de l'estimation (cadastre, ou releve precedent), c'est
 * le plus souvent un coin mal place (ou une focale mal reglee) ; non mesuree, l'estimation reste.
 */
function avisHauteur(r: ResultatAnalyse, hauteurEstimee: number): string | null {
  if (!r.hauteurMesuree) return `La hauteur n'a pas pu se mesurer sur la photo : celle du bâtiment (${fr(hauteurEstimee)} m) est gardée.`;
  if (hauteurEstimee > 0 && Math.abs(r.hauteur - hauteurEstimee) / hauteurEstimee > 0.25)
    return `Hauteur mesurée : ${fr(r.hauteur)} m, pour ${fr(hauteurEstimee)} m jusqu'ici. Si l'écart vous étonne, vérifiez les coins du haut et du bas, et le champ de l'objectif.`;
  return null;
}

/**
 * Analyse une serie : une photo, c'est le mur entier entre ses coins ; plusieurs, ce sont des
 * morceaux a assembler. Dans les deux cas la hauteur se mesure (la largeur du plan donne l'echelle) ;
 * `hauteurEstimee` (le cadastre) ne sert que de depart et de repli. L'analyse dit ce qu'elle a trouve
 * a redire : deux photos voisines qui se ressemblent mal sur leur partie commune, une hauteur loin de
 * celle du cadastre.
 */
function analyserSerie(morceaux: Morceau[], facade: Facade, hauteurEstimee: number, bat: ObjetPolygone): { r: ResultatAnalyse; avis: string | null } | null {
  const commun = { largeur: facade.largeur, hauteur: hauteurEstimee, contour: bat.pts, cote: facade.cote, distance: au(morceaux, 0).prise.mesure?.distance ?? null };
  if (morceaux.length === 1) {
    const m = au(morceaux, 0);
    const r = analyserReleve({ ...commun, photo: m.prise.photo.image, coins: m.coins, focalePx: focaleDe(m), decrochement: m.decrochement ?? null });
    return r ? { r, avis: avisHauteur(r, hauteurEstimee) } : null;
  }
  const r = analyserMosaique({
    ...commun,
    morceaux: morceaux.map((m) => ({ photo: m.prise.photo.image, coins: m.coins, focalePx: focaleDe(m) })),
  });
  if (!r) return null;
  const mauvaise = r.jointures.findIndex((s) => s < 0.5);
  let avis: string | null = null;
  if (mauvaise >= 0) avis = `Les photos ${mauvaise + 1} et ${mauvaise + 2} se raccordent mal : reprenez-en une en gardant un tiers de mur en commun.`;
  else if (Math.abs(r.rapportLargeur - 1) > 0.06) avis = "Les photos s'assemblent mal : vérifiez les coins, surtout ceux des extrémités.";
  else avis = avisHauteur(r, hauteurEstimee);
  return { r, avis };
}

/**
 * Corrige la hauteur mesuree d'un facteur `k`. La largeur est celle du plan : c'est la hauteur seule
 * qui etait fausse, donc la facade s'etire en hauteur - ouvertures, partie basse, bande du pignon et
 * toit lu dessus, tous du meme facteur.
 */
function etirerEnHauteur(r: Resultat, ouvertures: OuvertureFacade[], toit: Toit | null, k: number): { resultat: Resultat; ouvertures: OuvertureFacade[]; toit: Toit | null } {
  const cm = (x: number) => Math.round(x * k * 100) / 100;
  return {
    resultat: { ...r, hauteurTexture: r.hauteurTexture * k, partieBasse: r.partieBasse ? { ...r.partieBasse, hauteur: cm(r.partieBasse.hauteur) } : null },
    ouvertures: ouvertures.map((o) => ({ ...o, y: cm(o.y), h: cm(o.h) })),
    toit: toit ? { ...toit, hauteur: cm(toit.hauteur) } : null,
  };
}

/** Ce qui s'ecrit pour le mur : sa hauteur mesuree (ou corrigee), sa photo, ses ouvertures. */
function releveDuMur(facade: Facade, r: Resultat, ouvertures: OuvertureFacade[], hauteur: number, mesure: MesureDistance | null): ReleveFacade {
  const cm = (v: number) => Math.round(v * 100) / 100;
  return {
    cote: facade.cote,
    largeur: cm(facade.largeur),
    hauteur,
    texture: r.texture,
    hauteurTexture: cm(r.hauteurTexture),
    ouvertures,
    distance: mesure ? cm(mesure.distance) : null,
    sourceDistance: mesure?.source ?? null,
    releveLe: new Date().toISOString(),
    partieBasse: r.partieBasse,
  };
}

function Parcours({ releve, bat, coteInitial }: { releve: ServiceReleve; bat: ObjetPolygone; coteInitial: number | null }) {
  // La hauteur du batiment (le cadastre, ou un releve precedent) n'est qu'une estimation : elle aide a
  // viser et propose les coins ; la photo mesure la vraie.
  const hauteurEstimee = releve.hauteurMur();
  const facades = useMemo(() => facadesDuContour(enPoints(bat).pts, hauteurEstimee), [bat, hauteurEstimee]);
  const [cote, setCote] = useState<number | null>(coteInitial !== null && facades.some((f) => f.cote === coteInitial) ? coteInitial : null);
  const [etape, setEtape] = useState<Etape>(cote === null ? 'mur' : 'visee');
  // La hauteur mesuree a l'analyse, corrigeable ensuite.
  const [hauteurMur, setHauteurMur] = useState(hauteurEstimee);
  const [morceaux, setMorceaux] = useState<Morceau[]>([]);
  const [courant, setCourant] = useState(0);
  // Pendant la visee : la photo a remplacer (« Reprendre »), ou null pour en ajouter une.
  const [aRemplacer, setARemplacer] = useState<number | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [ouvertures, setOuvertures] = useState<OuvertureFacade[]>([]);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [toit, setToit] = useState<Toit | null>(null);
  const [appliquerToit, setAppliquerToit] = useState(true);
  const [avis, setAvis] = useState<string | null>(null);
  const facade = facades.find((f) => f.cote === cote) || null;
  // Ce que la photo doit cadrer en hauteur : l'egout et, sur un pignon du toit connu, son triangle.
  const hauteurACadrer = facade ? hauteurEstimee + hauteurPignon(enPoints(bat).pts, bat.toit, facade.cote) : hauteurEstimee;
  const prevues = Math.max(1, ...morceaux.map((m) => m.prise.photosPrevues ?? 1));
  useEchapFerme(releve);

  const surPrise = (p: Prise) => {
    if (!facade) return;
    const partiel = (p.photosPrevues ?? 1) > 1 || morceaux.length > 0;
    const m: Morceau = { prise: p, coins: coinsDePrise(p, facade.largeur, hauteurEstimee, partiel) };
    const k = aRemplacer ?? morceaux.length;
    setMorceaux(aRemplacer === null ? [...morceaux, m] : morceaux.map((x, i) => (i === aRemplacer ? m : x)));
    setCourant(k);
    setAvis(null);
    setEtape('coins');
  };

  const analyser = () => {
    if (!morceaux.length || !facade) return;
    setEtape('analyse');
    // Laisser le navigateur peindre l'ecran d'analyse avant le calcul, qui tient le fil une seconde.
    setTimeout(() => {
      const a = analyserSerie(morceaux, facade, hauteurEstimee, bat);
      if (!a) {
        setAvis('Les quatre coins ne forment pas un quadrilatère : reprenez-les.');
        setEtape('coins');
        return;
      }
      const { r } = a;
      setHauteurMur(r.hauteur);
      setResultat({ texture: versJpeg(r.texture), hauteurTexture: r.hauteurTexture, hauteurMesuree: r.hauteurMesuree, couverture: r.couverture, toitPropose: r.toitPropose, avis: a.avis, partieBasse: r.partieBasse });
      setOuvertures(r.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })));
      setToit(r.toitPropose);
      // Chaque facade relevee redefinit le toit du batiment : celui qu'elle montre remplace le toit
      // par defaut (cadastre, saisie, releve precedent). Decocher la case garde l'ancien.
      setAppliquerToit(!!r.toitPropose);
      setChoisie(null);
      setEtape('resultat');
    }, 40);
  };

  const valider = () => {
    if (!facade || !resultat) return;
    releve.valider(releveDuMur(facade, resultat, ouvertures, hauteurMur, morceaux[0]?.prise.mesure ?? null), appliquerToit ? toit : null, hauteurMur);
  };

  const viser = (remplacer: number | null) => {
    setARemplacer(remplacer);
    setEtape('visee');
  };
  const corrigerHauteur = (v: number) => {
    if (!resultat || !(hauteurMur > 0)) return;
    const e = etirerEnHauteur(resultat, ouvertures, toit, v / hauteurMur);
    setHauteurMur(v);
    setResultat(e.resultat);
    setOuvertures(e.ouvertures);
    setToit(e.toit);
  };
  // Avant l'analyse, seule la largeur est connue ; la hauteur s'affiche une fois mesuree.
  const titre = facade ? `Façade ${facade.orientation.toLowerCase()} · ${fr(facade.largeur)}${resultat ? ` × ${fr(hauteurMur)}` : ''} m` : 'Relever une façade';
  const verification: Verification | null =
    resultat && facade
      ? { resultat, largeur: facade.largeur, hauteurMur, ouvertures, setOuvertures, choisie, setChoisie, toit, setToit, appliquerToit, setAppliquerToit, contour: bat.pts, cote: facade.cote,
          partieBasse: resultat.partieBasse, setPartieBasse: (pb) => setResultat({ ...resultat, partieBasse: pb }), hauteurEstimee, hauteurMesuree: resultat.hauteurMesuree, corrigerHauteur }
      : null;

  return (
    <div className={'releve' + (etape === 'visee' ? ' camera' : '')} role="dialog" aria-modal="true" aria-label={titre}>
      <div className="releveEntete">
        <div className="releveTitre">
          <span className="releveEtape">{LIBELLES_ETAPE[etape]}</span>
          <span>{titre}</span>
        </div>
        <button type="button" className="releveFermer" aria-label="Fermer le relevé" title="Fermer (Échap)" onClick={() => releve.fermer()}>
          <Icone nom="fermer" taille={22} />
        </button>
      </div>
      {etape === 'mur' && (
        <ChoixMur
          bat={bat}
          facades={facades}
          onChoisir={(c) => {
            setCote(c);
            setEtape('visee');
          }}
        />
      )}
      {etape === 'visee' && facade && (
        <Visee
          facade={facade}
          hauteurACadrer={hauteurACadrer}
          faites={aRemplacer ?? morceaux.length}
          onPrise={surPrise}
          onRetour={() => (morceaux.length ? setEtape('coins') : coteInitial === null ? setEtape('mur') : releve.fermer())}
        />
      )}
      {etape === 'coins' && morceaux.length > 0 && facade && (
        <EtapeCoins
          morceaux={morceaux}
          courant={Math.min(courant, morceaux.length - 1)}
          choisir={setCourant}
          retirer={(k) => {
            setMorceaux(morceaux.filter((_, i) => i !== k));
            setCourant(Math.max(0, Math.min(courant, morceaux.length - 2)));
          }}
          setCoins={(c) => setMorceaux((ms) => ms.map((m, i) => (i === courant ? { ...m, coins: c } : m)))}
          setDecrochement={(d) => setMorceaux((ms) => ms.map((m, i) => (i === courant ? { ...m, decrochement: d } : m)))}
          prevues={prevues}
          avis={avis}
          largeur={facade.largeur}
          onReprendre={() => viser(courant)}
          onAjouter={() => viser(null)}
          onAnalyser={analyser}
        />
      )}
      {etape === 'analyse' && <EtapeAnalyse />}
      {etape === 'resultat' && verification && <EtapeResultat v={verification} onRevoir={() => setEtape('coins')} onValider={valider} />}
    </div>
  );
}

export function Releve({ releve }: { releve: ServiceReleve }) {
  const ouvert = useSyncExternalStore(releve.abonner, releve.courant, releve.courant);
  if (!ouvert) return null;
  const bat = releve.batiment();
  if (!bat) return null;
  return <Parcours key={ouvert.objKey + ':' + ouvert.cote} releve={releve} bat={bat} coteInitial={ouvert.cote} />;
}
