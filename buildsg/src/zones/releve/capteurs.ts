// Le releve de facade (zones/Releve.tsx), etape 2 : les capteurs de la visee (objectif, camera, inclinaison, realite augmentee).

import { useCallback, useEffect, useRef, useState } from 'react';
import { CHAMP_GRAND_COTE_DEFAUT } from '../../facade/cadrage.js';
import { cameraDisponible, ouvrirCamera, fermerCamera, decouvrirGrandAngle, type Photo, type ChoixCamera, type OffreGrandAngle } from '../../ui/releve/camera.js';
import { champAvecZoom, CHAMP_GRAND_ANGLE_DEFAUT, type Objectif } from '../../facade/objectifs.js';
import { ecouterNatif, webxrDisponible, mesurerWebXR, demanderPermissionOrientation, suivreInclinaison, type MesureDistance } from '../../ui/releve/profondeur.js';
import { ecrireReglage, lireReglage } from './commun.js';

/* ------------------------------------------------------------------------------------------------
 * 2. La visee
 * --------------------------------------------------------------------------------------------- */

/**
 * Les deux reperes a poser sur les bords du mur : sa largeur est la seule taille connue (le plan), la
 * distance s'en deduit. La hauteur, elle, ne l'est pas - c'est la photo qui la mesure.
 */
export interface Reperes {
  a: number;
  b: number;
  touches: boolean;
}

export interface Prise {
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
export function useObjectif() {
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
export function useCamera(
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
export function useInclinaison() {
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
export function useCadreVideo(video: React.RefObject<HTMLVideoElement | null>, scene: React.RefObject<HTMLDivElement | null>) {
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
export function useWebxr(natif: boolean, scene: React.RefObject<HTMLDivElement | null>, setCapteur: (m: MesureDistance | null) => void, setErreur: (e: string) => void) {
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
