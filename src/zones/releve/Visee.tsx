// Le releve de facade (zones/Releve.tsx), etape 2 : la visee (reperes, distance, objectif, prise).

import { useCallback, useMemo, useRef, useState, type PointerEvent as PE } from 'react';
import { Icone } from '../icones.js';
import { type Facade } from '../../facade/geometrie.js';
import { focalePx, distanceParCadrage, consigneAplomb, planDePrise, consignePrise, type ConsignePrise } from '../../facade/cadrage.js';
import { cameraDisponible, saisir, lireFichier, lirePhotoNative, type Photo } from '../../ui/releve/camera.js';
import { type Objectif } from '../../facade/objectifs.js';
import { natifDisponible, attendrePhotoNative, type MesureDistance } from '../../ui/releve/profondeur.js';
import { fr } from './commun.js';
import { type Prise, type Reperes, useCadreVideo, useCamera, useInclinaison, useObjectif, useWebxr } from './capteurs.js';

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
      <button data-controle="releve.objectif" type="button" aria-pressed={objectif === 'grand-angle'} onClick={() => choisir('grand-angle')}>
        0,5× grand-angle
      </button>
      <button data-controle="releve.objectif" type="button" aria-pressed={objectif === 'principal'} onClick={() => choisir('principal')}>
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
      <input data-controle="releve.champObjectif"
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
export function Visee({ facade, hauteurACadrer, faites, onPrise, onRetour }: { facade: Facade; hauteurACadrer: number; faites: number; onPrise: (p: Prise) => void; onRetour: () => void }) {
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
          <button data-controle="releve.retour" type="button" className="secondary" onClick={onRetour}>
            Retour
          </button>
          <button data-controle="releve.declencher" type="button" className="releveDeclencheur" aria-label="Prendre la photo" disabled={prise.enCours || (!natif && !!erreur && !cameraDisponible())} onClick={() => void prise.declencher()}>
            <Icone nom="camera" taille={30} />
          </button>
          <button data-controle="releve.importerPhoto" type="button" className="secondary" onClick={() => fichier.current?.click()}>
            <Icone nom="image" taille={18} /> Importer
          </button>
          <input data-controle="releve.importerPhoto" ref={fichier} type="file" accept="image/*" hidden onChange={(e) => void prise.importer(e.target.files)} />
        </div>
        <div className="releveRangee releveSecondaire">
          {ar.xr && (
            <button data-controle="releve.realiteAugmentee" type="button" className="secondary small" aria-pressed={ar.actif} onClick={() => void ar.basculer()}>
              {ar.actif ? 'Arrêter la mesure AR' : 'Mesurer en réalité augmentée'}
            </button>
          )}
          {niveau.aDemander && (
            <button data-controle="releve.niveau" type="button" className="secondary small" onClick={niveau.activer}>
              Activer le niveau
            </button>
          )}
          <ChampObjectif champ={champ} setChamp={obj.setChamp} />
        </div>
      </div>
    </div>
  );
}
