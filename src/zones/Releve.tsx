// Z8, le releve de facade (spec-releve-facade §4 a §10) : un parcours plein ecran en cinq temps.
//
// 1. **Mur** : choisir la facade sur le contour du batiment (sautee si l'inspecteur l'a designee).
// 2. **Visee** : la camera, avec l'aide au positionnement - la distance au mur (LiDAR par le module
//    natif, realite augmentee sur Android, sinon deduite du cadrage), la consigne pour atteindre la
//    distance cible (3 m par defaut) et l'aplomb du telephone.
// 3. **Coins** : les quatre coins du mur sur la photo, proposes d'apres la distance, ajustes au
//    doigt avec une loupe. Ils peuvent deborder de la photo.
// 4. **Analyse** : redressement, ouvertures, silhouette du toit (facade/analyse.ts).
// 5. **Resultat** : la facade a l'echelle, les ouvertures corrigeables, le toit propose ; Valider
//    ecrit le tout dans le projet par le service (app/releve.ts), en un seul pas d'historique.
//
// Rien n'est ecrit dans le plan avant Valider : fermer le parcours ne laisse aucune trace.

import { au } from '../util/tableaux.js';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as PE } from 'react';
import { Icone } from './icones.js';
import { enPoints } from '../model/formes.js';
import { facadesDuContour, type Facade } from '../facade/geometrie.js';
import { focalePx, distanceParCadrage, consigneDistance, consigneAplomb, distancePourToutCadrer, CHAMP_GRAND_COTE_DEFAUT, DISTANCE_CIBLE_DEFAUT } from '../facade/cadrage.js';
import { analyserReleve, coinsProposes } from '../facade/analyse.js';
import { classer } from '../facade/detection.js';
import { LIBELLES_FORME_TOIT, penteDeg } from '../facade/toit.js';
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
import type { ObjetPolygone, OuvertureFacade, TypeOuverture, Toit, FormeToit, PtBrut } from '../model/types.js';

const fr = (v: number, d = 2) => v.toFixed(d).replace('.', ',');

/** Reglages propres a l'appareil : la distance cible et le champ de la camera. Jamais dans le projet. */
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

interface Reperes {
  mode: 'bords' | 'hauteur';
  a: number;
  b: number;
  touches: boolean;
}

interface Prise {
  photo: Photo;
  mesure: MesureDistance | null;
  reperes: Reperes | null;
  champ: number;
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
  return {
    objectif: actif,
    disponible,
    choix,
    champ,
    setOffre,
    choisir(o: Objectif) {
      setObjectif(o);
      ecrireReglage('objectif', o === 'grand-angle' ? 0.5 : 1);
    },
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
      .catch(() => setErreur("La caméra n'a pas pu s'ouvrir. Autorisez-la dans les réglages du navigateur, ou importez une photo."));
    return () => {
      fini = true;
      fermerCamera(flux);
    };
  }, [natif, video, setCapteur, deviceId, zoom, surOffre]);
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

/** Les deux reperes a faire glisser sur les bords du mur (ou sur l'egout et le pied). */
function RepereVisee({ reperes, setReperes, cadre, scene }: { reperes: Reperes; setReperes: React.Dispatch<React.SetStateAction<Reperes>>; cadre: Cadre; scene: React.RefObject<HTMLDivElement | null> }) {
  const glisser = (quel: 'a' | 'b') => (e: PE<HTMLDivElement>) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    const bouger = (ev: PointerEvent) => {
      const r = scene.current?.getBoundingClientRect();
      if (!r) return;
      const t = reperes.mode === 'bords' ? (ev.clientX - r.left - cadre.x) / cadre.l : (ev.clientY - r.top - cadre.y) / cadre.h;
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
  const vertical = reperes.mode === 'bords';
  return (
    <div className="releveReperes" style={{ left: cadre.x, top: cadre.y, width: cadre.l, height: cadre.h }}>
      {(['a', 'b'] as const).map((q) => {
        const v = reperes[q];
        const nom = vertical ? (q === 'a' ? 'Bord gauche' : 'Bord droit') : q === 'a' ? 'Égout' : 'Sol';
        return (
          <div
            key={q}
            className={'releveRepere ' + (vertical ? 'vertical' : 'horizontal')}
            style={vertical ? { left: `${v * 100}%` } : { top: `${v * 100}%` }}
            onPointerDown={glisser(q)}
            role="slider"
            aria-label={nom}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(v * 100)}
            tabIndex={0}
            onKeyDown={(e) => {
              const pas = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 0.01 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -0.01 : 0;
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

/** La lecture de la distance, sa source, la consigne et l'aplomb, en haut de l'image. */
function MesureVisee({ mesure, cible, modeReperes, beta }: { mesure: MesureDistance | null; cible: number; modeReperes: Reperes['mode']; beta: number | null }) {
  const consigne = consigneDistance(mesure?.distance ?? null, cible);
  const aplomb = consigneAplomb(beta);
  const source = mesure ? { lidar: 'LiDAR', webxr: 'Réalité augmentée', cadrage: 'Estimée au cadrage' }[mesure.source] : '';
  return (
    <div className="releveMesure" aria-live="polite">
      <div className="releveMesureLigne">
        <span className="releveDistance">{mesure ? `${fr(mesure.distance, 1)} m` : '— m'}</span>
        {mesure && <span className="releveSource">{source}</span>}
      </div>
      <div className={'releveConsigneCamera ' + (consigne.bon ? 'bon' : 'aregler')}>
        <Icone nom={consigne.bon ? 'coche' : 'info'} taille={16} />
        {mesure ? consigne.message : modeReperes === 'bords' ? 'Faites glisser les deux repères sur les bords du mur' : "Faites glisser les repères sur l'égout et le pied du mur"}
      </div>
      {aplomb.message && (
        <div className={'releveConsigneCamera ' + (aplomb.bon ? 'bon' : 'aregler')}>
          <Icone nom={aplomb.bon ? 'coche' : 'info'} taille={16} />
          {aplomb.message}
        </div>
      )}
    </div>
  );
}

/** Les reglages de la visee : distance cible, nature des reperes, et ce que la cible permet de cadrer. */
function ReglagesVisee({
  cible,
  changerCible,
  reperes,
  setReperes,
  avecReperes,
  pourTout,
  facade,
  hauteurMur,
}: {
  cible: number;
  changerCible: (d: number) => void;
  reperes: Reperes;
  setReperes: (r: Reperes) => void;
  avecReperes: boolean;
  pourTout: number | null;
  facade: Facade;
  hauteurMur: number;
}) {
  return (
    <>
      <div className="releveRangee">
        <div className="releveCible" role="group" aria-label="Distance cible">
          <span>Cible</span>
          <button type="button" className="secondary small" aria-label="Diminuer la distance cible" onClick={() => changerCible(-0.5)}>
            <Icone nom="moins" taille={16} />
          </button>
          <strong>{fr(cible, 1)} m</strong>
          <button type="button" className="secondary small" aria-label="Augmenter la distance cible" onClick={() => changerCible(0.5)}>
            <Icone nom="plus" taille={16} />
          </button>
        </div>
        {avecReperes && (
          <div className="releveSegment" role="group" aria-label="Repères">
            <button type="button" aria-pressed={reperes.mode === 'bords'} onClick={() => setReperes({ mode: 'bords', a: 0.2, b: 0.8, touches: false })}>
              Bords
            </button>
            <button type="button" aria-pressed={reperes.mode === 'hauteur'} onClick={() => setReperes({ mode: 'hauteur', a: 0.25, b: 0.75, touches: false })}>
              Égout et sol
            </button>
          </div>
        )}
      </div>
      {pourTout !== null && (
        <p className="releveNote">
          Mur de {fr(facade.largeur)} × {fr(hauteurMur)} m : il tient en entier dans l'image à partir de {fr(pourTout, 1)} m.
          {pourTout > cible + 0.3 ? ' À la distance cible, les coins pourront sortir du cadre : vous les placerez au-delà de la photo.' : ''}
        </p>
      )}
    </>
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

function Visee({ facade, hauteurMur, onPrise, onRetour }: { facade: Facade; hauteurMur: number; onPrise: (p: Prise) => void; onRetour: () => void }) {
  const natif = useMemo(() => natifDisponible(), []);
  const video = useRef<HTMLVideoElement>(null);
  const scene = useRef<HTMLDivElement>(null);
  const fichier = useRef<HTMLInputElement>(null);
  const [capteur, setCapteur] = useState<MesureDistance | null>(null);
  const [cible, setCible] = useState(() => lireReglage('cible', DISTANCE_CIBLE_DEFAUT));
  const [reperes, setReperes] = useState<Reperes>({ mode: 'bords', a: 0.2, b: 0.8, touches: false });
  const obj = useObjectif();
  const champ = obj.champ;
  const { erreur, setErreur } = useCamera(natif, video, setCapteur, obj.choix, obj.setOffre);
  const niveau = useInclinaison();
  const { taille, cadre } = useCadreVideo(video, scene);
  const ar = useWebxr(natif, scene, setCapteur, setErreur);

  const f = taille.vw ? focalePx(taille.vw, taille.vh, champ) : 0;
  const tailleReelle = reperes.mode === 'bords' ? facade.largeur : hauteurMur;
  const px = Math.abs(reperes.b - reperes.a) * (reperes.mode === 'bords' ? taille.vw : taille.vh);
  const dCadrage = reperes.touches && f ? distanceParCadrage(tailleReelle, px, f) : null;
  const mesure: MesureDistance | null = capteur ?? (dCadrage ? { distance: dCadrage, source: 'cadrage' } : null);
  const pourTout = f ? distancePourToutCadrer(facade.largeur, hauteurMur, taille.vw, taille.vh, f) : null;
  const prise = usePrise(natif, video, setErreur, (photo, importee) =>
    onPrise(importee ? { photo, mesure: capteur, reperes: null, champ: photo.champ ?? champ } : { photo, mesure, reperes: reperes.touches && !capteur ? reperes : null, champ }),
  );
  const changerCible = (d: number) => {
    const v = Math.max(1, Math.min(30, Math.round((cible + d) * 2) / 2));
    setCible(v);
    ecrireReglage('cible', v);
  };

  return (
    <div className="releveCamera">
      <div className="releveScene" ref={scene}>
        {!natif && <video ref={video} className="releveVideo" playsInline muted aria-label="Caméra" />}
        {!capteur && taille.vw > 0 && <RepereVisee reperes={reperes} setReperes={setReperes} cadre={cadre} scene={scene} />}
        <div className="releveViseur" aria-hidden="true" />
        <MesureVisee mesure={mesure} cible={cible} modeReperes={reperes.mode} beta={niveau.beta} />
        {erreur && (
          <div className="releveErreur" role="alert">
            {erreur}
          </div>
        )}
      </div>
      <div className="releveOutils">
        <ReglagesVisee cible={cible} changerCible={changerCible} reperes={reperes} setReperes={setReperes} avecReperes={!capteur} pourTout={pourTout} facade={facade} hauteurMur={hauteurMur} />
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
          {!natif && obj.disponible && <ChoixObjectif objectif={obj.objectif} choisir={obj.choisir} />}
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

function Coins({ photo, coins, setCoins }: { photo: Photo; coins: P2[]; setCoins: (c: P2[]) => void }) {
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
        <polygon points={coins.map((c) => `${c.x},${c.y}`).join(' ')} className="releveQuad" vectorEffect="non-scaling-stroke" />
        <text x={haut.x} y={haut.y - r * 1.6} fontSize={13 / echelle} textAnchor="middle" className="releveQuadEtiquette">
          Égout
        </text>
        <text x={bas.x} y={bas.y + r * 2.4} fontSize={13 / echelle} textAnchor="middle" className="releveQuadEtiquette">
          Sol
        </text>
        {coins.map((c, i) => (
          <g key={i}>
            <circle cx={c.x} cy={c.y} r={r * 1.7} className="releveCoinCible" onPointerDown={saisirCoin(i)} role="slider" aria-label={NOMS_COINS[i]} aria-valuenow={0} tabIndex={0} />
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
  texture: string;
  hauteurTexture: number;
  couverture: number;
  toitPropose: Toit | null;
}

/**
 * Les coins proposes pour une prise : projection d'apres la distance, ou les reperes poses sur la
 * video, qui disent exactement ou sont les bords (ou l'egout et le sol) et l'emportent.
 */
function coinsDePrise(p: Prise, largeurMur: number, hauteurMur: number): P2[] {
  const w = p.photo.image.largeur,
    h = p.photo.image.hauteur;
  const f = p.photo.focalePx ?? focalePx(w, h, p.photo.champ ?? p.champ);
  const c = coinsProposes(w, h, f, p.mesure?.distance ?? null, largeurMur, hauteurMur);
  if (p.reperes) {
    const [a, b] = [Math.min(p.reperes.a, p.reperes.b), Math.max(p.reperes.a, p.reperes.b)];
    if (p.reperes.mode === 'bords') {
      au(c, 0).x = au(c, 3).x = a * w;
      au(c, 1).x = au(c, 2).x = b * w;
    } else {
      au(c, 0).y = au(c, 1).y = a * h;
      au(c, 2).y = au(c, 3).y = b * h;
    }
  }
  // A courte distance, le mur deborde de l'image : les coins projetes tombent loin hors cadre.
  // On les ramene dans la marge ou le doigt peut les saisir (celle de <Coins>).
  const m = Math.max(w, h) * 0.2;
  return c.map((q) => ({ x: Math.max(-m, Math.min(w + m, q.x)), y: Math.max(-m, Math.min(h + m, q.y)) }));
}

function EtapeCoins({
  prise,
  coins,
  setCoins,
  avis,
  hauteurMur,
  setHauteurMur,
  largeur,
  onReprendre,
  onAnalyser,
}: {
  prise: Prise;
  coins: P2[];
  setCoins: (c: P2[]) => void;
  avis: string | null;
  hauteurMur: number;
  setHauteurMur: (v: number) => void;
  largeur: number;
  onReprendre: () => void;
  onAnalyser: () => void;
}) {
  return (
    <>
      <div className="releveCorps releveCorpsPhoto">
        <p className="releveConsigne">
          Placez chaque rond sur un coin du mur : les deux du haut à l'égout, les deux du bas au pied du mur. Un coin caché ou hors cadre se place là où il serait.
        </p>
        {avis && (
          <p className="releveAvis" role="alert">
            {avis}
          </p>
        )}
        <Coins photo={prise.photo} coins={coins} setCoins={setCoins} />
        <div className="releveChamps">
          <label className="releveCm">
            <span>Hauteur à l'égout</span>
            <span className="champNombre">
              <input
                type="number"
                step={0.05}
                min={1}
                max={30}
                value={hauteurMur}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  if (v > 0) setHauteurMur(v);
                }}
              />
              <span className="unite">m</span>
            </span>
          </label>
          <span className="releveNote">Largeur du mur : {fr(largeur)} m, lue sur le plan.</span>
        </div>
      </div>
      <div className="relevePied">
        <button type="button" className="secondary" onClick={onReprendre}>
          Reprendre la photo
        </button>
        <button type="button" onClick={onAnalyser}>
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

/** Le toit propose d'apres la photo, a appliquer ou non, corrigeable. */
function CarteToit({ toit, setToit, appliquer, setAppliquer, contour }: { toit: Toit | null; setToit: (t: Toit) => void; appliquer: boolean; setAppliquer: (v: boolean) => void; contour: PtBrut[] }) {
  if (!toit) {
    return (
      <div className="releveToit">
        <div className="releveSousTitre">Toit</div>
        <p className="releveNote">Le toit n'est pas assez visible sur la photo : celui du bâtiment reste tel quel.</p>
      </div>
    );
  }
  return (
    <div className="releveToit">
      <div className="releveSousTitre">Toit</div>
      <p className="releveNote">
        Proposé d'après la photo : {LIBELLES_FORME_TOIT[toit.forme].toLowerCase()}
        {toit.forme !== 'plat' ? `, faîtage à ${fr(toit.hauteur)} m au-dessus de l'égout (pente ${fr(penteDeg(contour, toit), 0)}°)` : ''}.
      </p>
      <label className="releveCase">
        <input type="checkbox" checked={appliquer} onChange={(e) => setAppliquer(e.target.checked)} />
        Appliquer ce toit au bâtiment
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
        {resultat.couverture < 0.9 && <p className="releveAvis">La photo couvrait {Math.round(resultat.couverture * 100)} % du mur ; le reste est complété à la teinte du mur.</p>}
        <Elevation texture={resultat.texture} Ht={resultat.hauteurTexture} L={largeur} H={hauteurMur} ouvertures={ouvertures} setOuvertures={setOuvertures} choisie={choisie} setChoisie={setChoisie} />
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
        <CarteToit toit={v.toit} setToit={v.setToit} appliquer={v.appliquerToit} setAppliquer={v.setAppliquerToit} contour={v.contour} />
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

function Parcours({ releve, bat, coteInitial }: { releve: ServiceReleve; bat: ObjetPolygone; coteInitial: number | null }) {
  const hauteurInitiale = releve.hauteurMur();
  const facades = useMemo(() => facadesDuContour(enPoints(bat).pts, hauteurInitiale), [bat, hauteurInitiale]);
  const [cote, setCote] = useState<number | null>(coteInitial !== null && facades.some((f) => f.cote === coteInitial) ? coteInitial : null);
  const [etape, setEtape] = useState<Etape>(cote === null ? 'mur' : 'visee');
  const [hauteurMur, setHauteurMur] = useState(hauteurInitiale);
  const [prise, setPrise] = useState<Prise | null>(null);
  const [coins, setCoins] = useState<P2[]>([]);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const [ouvertures, setOuvertures] = useState<OuvertureFacade[]>([]);
  const [choisie, setChoisie] = useState<number | null>(null);
  const [toit, setToit] = useState<Toit | null>(null);
  const [appliquerToit, setAppliquerToit] = useState(true);
  const [avis, setAvis] = useState<string | null>(null);
  const facade = facades.find((f) => f.cote === cote) || null;
  useEchapFerme(releve);

  const surPrise = (p: Prise) => {
    if (!facade) return;
    setPrise(p);
    setCoins(coinsDePrise(p, facade.largeur, hauteurMur));
    setAvis(null);
    setEtape('coins');
  };

  const analyser = () => {
    if (!prise || !facade) return;
    setEtape('analyse');
    // Laisser le navigateur peindre l'ecran d'analyse avant le calcul, qui tient le fil une seconde.
    setTimeout(() => {
      const r = analyserReleve({ photo: prise.photo.image, coins, largeur: facade.largeur, hauteur: hauteurMur, contour: bat.pts, cote: facade.cote, distance: prise.mesure?.distance ?? null });
      if (!r) {
        setAvis('Les quatre coins ne forment pas un quadrilatère : reprenez-les.');
        setEtape('coins');
        return;
      }
      setResultat({ texture: versJpeg(r.texture), hauteurTexture: r.hauteurTexture, couverture: r.couverture, toitPropose: r.toitPropose });
      setOuvertures(r.ouvertures.map(({ type, x, y, l, h }) => ({ type, x, y, l, h })));
      setToit(r.toitPropose);
      // Un toit saisi a la main ne s'ecrase pas d'office par une estimation.
      setAppliquerToit(!!r.toitPropose && bat.toit?.source !== 'saisie');
      setChoisie(null);
      setEtape('resultat');
    }, 40);
  };

  const valider = () => {
    if (!facade || !resultat) return;
    const cm = (v: number) => Math.round(v * 100) / 100;
    releve.valider(
      {
        cote: facade.cote,
        largeur: cm(facade.largeur),
        hauteur: hauteurMur,
        texture: resultat.texture,
        hauteurTexture: cm(resultat.hauteurTexture),
        ouvertures,
        distance: prise?.mesure ? cm(prise.mesure.distance) : null,
        sourceDistance: prise?.mesure?.source ?? null,
        releveLe: new Date().toISOString(),
      },
      appliquerToit ? toit : null,
      hauteurMur,
    );
  };

  const titre = facade ? `Façade ${facade.orientation.toLowerCase()} · ${fr(facade.largeur)} × ${fr(hauteurMur)} m` : 'Relever une façade';
  const verification: Verification | null =
    resultat && facade
      ? { resultat, largeur: facade.largeur, hauteurMur, ouvertures, setOuvertures, choisie, setChoisie, toit, setToit, appliquerToit, setAppliquerToit, contour: bat.pts }
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
      {etape === 'visee' && facade && <Visee facade={facade} hauteurMur={hauteurMur} onPrise={surPrise} onRetour={() => (coteInitial === null ? setEtape('mur') : releve.fermer())} />}
      {etape === 'coins' && prise && facade && (
        <EtapeCoins prise={prise} coins={coins} setCoins={setCoins} avis={avis} hauteurMur={hauteurMur} setHauteurMur={setHauteurMur} largeur={facade.largeur} onReprendre={() => setEtape('visee')} onAnalyser={analyser} />
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
