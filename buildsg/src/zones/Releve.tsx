// Z8, le releve de facade (spec-releve-facade §4 a §10) : un parcours plein ecran en six temps.
//
// 1. **Mur** : choisir la facade sur le contour du batiment (sautee si l'inspecteur l'a designee) ;
//    la boussole du telephone propose celle qu'on a devant soi.
// 2. **Methode** : d'ou vient la photo - une photo de rue (Panoramax, etape « rue »), la camera
//    guidee (« visee »), ou une photo importee (qui passe droit aux coins).
// 2 bis. **Visee** : la camera, avec l'aide au positionnement - la distance au mur (realite augmentee
//    sur Android ; sinon une alerte, et les reperes sur les bords du mur pour l'estimer), ce qu'elle
//    permet (une photo, plusieurs en se decalant, ou reculer) et l'aplomb du telephone. Le LiDAR est
//    eteint (ui/releve/profondeur.ts).
// 3. **Coins** : les quatre coins du mur (ou du morceau de mur) sur chaque photo, proposes d'apres
//    la distance, ajustes au doigt avec une loupe. Ils peuvent deborder de la photo. Plusieurs photos
//    se prennent l'une apres l'autre, et s'assemblent a l'analyse : morceaux cote a cote
//    (facade/mosaique.ts), ou vues du mur entier, de face et de biais, fondues pour voir derriere une
//    voiture ou une haie (facade/fusion.ts, lot L13).
// 4. **Analyse** : hauteur du mur, redressement, ouvertures, silhouette du toit (facade/analyse.ts).
//    **Seule la largeur est connue**, lue sur le plan : la hauteur du cadastre n'est qu'une
//    estimation, c'est la photo qui mesure la hauteur a l'egout - et, sur un pignon, son triangle.
// 5. **Resultat** : la facade a l'echelle, sa hauteur mesuree, les ouvertures corrigeables, le toit
//    lu sur la facade ; Valider ecrit le tout dans le projet par le service (app/releve.ts), en un
//    seul pas d'historique. Le toit lu sur la facade remplace celui du batiment.
//
// Rien n'est ecrit dans le plan avant Valider : fermer le parcours ne laisse aucune trace.
//
// Le parcours vit ici ; chaque etape et ses outils, dans zones/releve/.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Icone } from './icones.js';
import { enPoints } from '../model/formes.js';
import { facadesDuContour, type Facade } from '../facade/geometrie.js';
import { hauteurPignon } from '../facade/toit.js';
import { CHAMP_GRAND_COTE_DEFAUT } from '../facade/cadrage.js';
import { versJpeg, type Photo } from '../ui/releve/camera.js';
import type { MesureDistance } from '../ui/releve/profondeur.js';
import type { ServiceReleve } from '../app/releve.js';
import type { GrilleFacade, ObjetPolygone, Toit } from '../model/types.js';
import { fr } from './releve/commun.js';
import { ChoixMur } from './releve/ChoixMur.js';
import { ChoixMethode } from './releve/ChoixMethode.js';
import { PhotosRue } from './releve/PhotosRue.js';
import { type Prise, useMurVise } from './releve/capteurs.js';
import { Visee } from './releve/Visee.js';
import { type Assemblage, type Etape, type Morceau, type Resultat, coinsDePrise, entreeRecherche, arreterRecherche, estPartielle } from './releve/serie.js';
import { lancerRecherche } from './releve/rechercheCoins.js';
import type { SourceCoin } from '../facade/calageFin.js';
import { EtapeAnalyse, EtapeCoins } from './releve/EtapeCoins.js';
import { EtapeResultat, type Verification } from './releve/EtapeResultat.js';
import { analyserSerie, calageDeSerie, etirerEnHauteur, releveDuMur } from './releve/analyse.js';
import { masqueDeFusion } from './releve/masque.js';
import { useOuvertures } from './releve/ouvertures.js';
import { AideDesCoins, AideDesOuvertures } from './releve/AideEtapes.js';
import type { AideClaudeReleve } from '../app/renfortReleve.js';
import type { Image } from '../facade/homographie.js';

/**
 * Le morceau d'une prise : ses coins predits s'affichent tout de suite ; le calage fin les cherche
 * ensuite sur la photo (dans un worker) et les remplace s'il les trouve, sauf ceux que le doigt a deja
 * deplaces.
 */
function morceauDePrise(p: Prise, facade: Facade, hauteurEstimee: number, partiel: boolean, maj: (f: (ms: Morceau[]) => Morceau[]) => void): Morceau {
  const entree = entreeRecherche(p, facade.largeur, hauteurEstimee, partiel, facade.azimut);
  if (entree) lancerRecherche(p, entree, maj);
  return {
    prise: p,
    coins: coinsDePrise(p, facade.largeur, hauteurEstimee, partiel, facade.azimut),
    sources: ['predit', 'predit', 'predit', 'predit'],
    recherche: !!entree,
    ...(entree?.chercher === false ? { distorsionSeule: true } : {}),
  };
}

/** Les sources des coins une fois le coin `k` deplace au doigt. */
function coinAuDoigt(sources: Morceau['sources'], k: number | undefined): SourceCoin[] {
  const s: SourceCoin[] = [...(sources ?? ['predit', 'predit', 'predit', 'predit'])];
  if (k !== undefined && k >= 0 && k < 4) s[k] = 'doigt';
  return s;
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

const LIBELLES_ETAPE: Record<Etape, string> = { mur: 'Choisir le mur', methode: 'Choisir la méthode', rue: 'Photo de rue', visee: 'Se placer', coins: 'Placer les coins', analyse: 'Analyse', resultat: 'Vérifier' };

/** Les deux ecrans d'ou vient la photo : la methode, et les photos de rue. */
function SourcePhoto({ etape, mur, surPhoto, setEtape, onRetour }: { etape: Etape; mur: ReturnType<typeof useMurVise>; surPhoto: (p: Photo, m: MesureDistance | null) => void; setEtape: (e: Etape) => void; onRetour: () => void }) {
  if (etape === 'methode') {
    return <ChoixMethode rue={mur ? null : 'sansPosition'} onRue={() => setEtape('rue')} onCamera={() => setEtape('visee')} onImporter={(p) => surPhoto(p, null)} onRetour={onRetour} />;
  }
  if (etape === 'rue' && mur) return <PhotosRue mur={mur} onPhoto={surPhoto} onRetour={() => setEtape('methode')} />;
  return null;
}

/** L'etape des coins dans le parcours : la serie de photos, la photo courante et ses gestes. */
function CoinsDuParcours(p: {
  morceaux: Morceau[];
  setMorceaux: (f: (ms: Morceau[]) => Morceau[]) => void;
  courant: number;
  setCourant: (k: number) => void;
  assemblage: Assemblage;
  changerAssemblage: (a: Assemblage) => void;
  prevues: number;
  avis: string | null;
  largeur: number;
  viser: (remplacer: number | null) => void;
  analyser: () => void;
  aide: AideClaudeReleve | null;
  hauteurEstimee: number;
  etiquette: string;
}) {
  const { morceaux, setMorceaux, courant } = p;
  const m = morceaux[Math.min(courant, morceaux.length - 1)];
  // Les coins d'un morceau d'une serie ne sont pas ceux du mur : Claude n'y est pas appele.
  const entiere = morceaux.length === 1 || p.assemblage === 'vues';
  const aide = m && entiere ? <AideDesCoins aide={p.aide} morceau={m} maj={(x) => setMorceaux((ms) => ms.map((y) => (y.prise === x.prise ? x : y)))} largeurM={p.largeur} hauteurM={p.hauteurEstimee} etiquette={p.etiquette} /> : null;
  return (
    <EtapeCoins
      morceaux={morceaux}
      courant={Math.min(courant, morceaux.length - 1)}
      choisir={p.setCourant}
      retirer={(k) => {
        setMorceaux((ms) => ms.filter((_, i) => i !== k));
        p.setCourant(Math.max(0, Math.min(courant, morceaux.length - 2)));
      }}
      setCoins={(c, k) => setMorceaux((ms) => ms.map((m, i) => (i === courant ? { ...m, coins: c, sources: coinAuDoigt(m.sources, k) } : m)))}
      setDecrochement={(d) => setMorceaux((ms) => ms.map((m, i) => (i === courant ? { ...m, decrochement: d } : m)))}
      assemblage={p.assemblage}
      setAssemblage={p.changerAssemblage}
      prevues={p.prevues}
      avis={p.avis}
      largeur={p.largeur}
      onReprendre={() => p.viser(courant)}
      onAjouter={() => p.viser(null)}
      onAnalyser={p.analyser}
      aide={aide}
    />
  );
}

/**
 * Ce que l'analyse laisse a la verification, hors de l'ecran : l'elevation redressee et la grille, que
 * l'aide de Claude regarde ; pour une fusion de vues, son masque d'occlusion et sa vue de reference
 * (lot G20) : c'est la photo que Claude recoit, et le masque part hachure sur l'elevation.
 */
interface ExtrasAnalyse {
  elevation: Image;
  grille: GrilleFacade | null;
  fusion: { occlusion: Uint8Array; masque: number; reference: number } | null;
}

type Analyse = NonNullable<ReturnType<typeof analyserSerie>>;

function extrasDe({ r, fusion }: Analyse): ExtrasAnalyse {
  return { elevation: r.elevation, grille: r.grille, fusion: fusion ? { occlusion: fusion.occlusion, masque: fusion.masque, reference: fusion.reference } : null };
}

/** Le resultat affiche par la verification : la texture, la hauteur, l'avis, le calage et le masque hachure d'une fusion. */
function resultatDe(a: Analyse, morceaux: readonly Morceau[], facade: Facade, assemblage: Assemblage): Resultat {
  const { r } = a;
  return {
    texture: versJpeg(r.texture), hauteurTexture: r.hauteurTexture, hauteurMesuree: r.hauteurMesuree, couverture: r.couverture, toitPropose: r.toitPropose, avis: a.avis, partieBasse: r.partieBasse,
    calage: calageDeSerie(morceaux, facade.largeur, r.hauteur, facade.azimut, assemblage), masque: masqueDeFusion(a.fusion ?? null, facade.largeur),
  };
}

/**
 * L'aide de Claude a la verification : sur une photo seule, ou sur la vue de reference d'une fusion
 * (lot G20) ; jamais sur des morceaux cote a cote, dont aucune photo ne montre le mur entier.
 */
function AideDeVerification(p: { aide: AideClaudeReleve | null; ouv: ReturnType<typeof useOuvertures>; morceaux: readonly Morceau[]; extras: ExtrasAnalyse | null; v: Verification; facade: Facade }) {
  const { extras, morceaux, v } = p;
  const fusion = extras?.fusion ?? null;
  const morceau = fusion ? morceaux[fusion.reference] : morceaux.length === 1 ? morceaux[0] : undefined;
  return (
    <AideDesOuvertures aide={p.aide} ouv={p.ouv} morceau={morceau} elevation={extras?.elevation ?? null} largeurM={p.facade.largeur} hauteurM={v.hauteurMur} hauteurMesuree={v.hauteurMesuree}
      couverture={v.resultat.couverture} masque={fusion?.masque ?? 0} occlusion={fusion?.occlusion ?? null} grille={extras?.grille ?? null} etiquette={p.facade.orientation.toLowerCase()} />
  );
}

function Parcours({ releve, bat, coteInitial }: { releve: ServiceReleve; bat: ObjetPolygone; coteInitial: number | null }) {
  // La hauteur du batiment (le cadastre, ou un releve precedent) n'est qu'une estimation : elle aide a
  // viser et propose les coins ; la photo mesure la vraie.
  const hauteurEstimee = releve.hauteurMur();
  const facades = useMemo(() => facadesDuContour(enPoints(bat).pts, hauteurEstimee), [bat, hauteurEstimee]);
  const [cote, setCote] = useState<number | null>(coteInitial !== null && facades.some((f) => f.cote === coteInitial) ? coteInitial : null);
  const [etape, setEtape] = useState<Etape>(cote === null ? 'mur' : 'methode');
  // La hauteur mesuree a l'analyse, corrigeable ensuite.
  const [hauteurMur, setHauteurMur] = useState(hauteurEstimee);
  const [morceaux, setMorceaux] = useState<Morceau[]>([]);
  const [assemblage, setAssemblage] = useState<Assemblage>('morceaux');
  const [courant, setCourant] = useState(0);
  // Pendant la visee : la photo a remplacer (« Reprendre »), ou null pour en ajouter une.
  const [aRemplacer, setARemplacer] = useState<number | null>(null);
  const [resultat, setResultat] = useState<Resultat | null>(null);
  const ouv = useOuvertures();
  const { ouvertures, setOuvertures, choisie, setChoisie } = ouv;
  const [toit, setToit] = useState<Toit | null>(null);
  const [appliquerToit, setAppliquerToit] = useState(true);
  const [avis, setAvis] = useState<string | null>(null);
  // L'elevation redressee, la grille et le masque d'une fusion : ce que l'aide de Claude regarde a la verification.
  const [extras, setExtras] = useState<ExtrasAnalyse | null>(null);
  const facade = facades.find((f) => f.cote === cote) || null;
  // Ce que la photo doit cadrer en hauteur : l'egout et, sur un pignon du toit connu, son triangle.
  const hauteurACadrer = facade ? hauteurEstimee + hauteurPignon(enPoints(bat).pts, bat.toit, facade.cote) : hauteurEstimee;
  const prevues = Math.max(1, ...morceaux.map((m) => m.prise.photosPrevues ?? 1));
  useEchapFerme(releve);
  const mur = useMurVise(facade, releve.origine());

  const surPrise = (p: Prise) => {
    if (!facade) return;
    const partiel = estPartielle(assemblage, p.photosPrevues, morceaux.length);
    const m = morceauDePrise(p, facade, hauteurEstimee, partiel, setMorceaux);
    const k = aRemplacer ?? morceaux.length;
    setMorceaux(aRemplacer === null ? [...morceaux, m] : morceaux.map((x, i) => (i === aRemplacer ? m : x)));
    setCourant(k);
    setAvis(null);
    setEtape('coins');
  };

  const analyser = () => {
    if (!morceaux.length || !facade) return;
    setEtape('analyse'); setMorceaux((ms) => ms.map(arreterRecherche));
    // Laisser le navigateur peindre l'ecran d'analyse avant le calcul, qui tient le fil une seconde.
    setTimeout(() => {
      const a = analyserSerie(morceaux, facade, hauteurEstimee, bat, assemblage);
      if (!a) {
        setAvis('Les quatre coins ne forment pas un quadrilatère : reprenez-les.');
        setEtape('coins');
        return;
      }
      const { r } = a;
      setHauteurMur(r.hauteur);
      setResultat(resultatDe(a, morceaux, facade, assemblage));
      ouv.poser(r);
      setExtras(extrasDe(a));
      setToit(r.toitPropose);
      // Chaque facade relevee redefinit le toit du batiment : celui qu'elle montre remplace le toit
      // par defaut (cadastre, saisie, releve precedent). Decocher la case garde l'ancien.
      setAppliquerToit(!!r.toitPropose);
      setEtape('resultat');
    }, 40);
  };

  const valider = () => {
    if (!facade || !resultat) return;
    // Le batiment garde sa hauteur (cadastre, saisie) : la facade mesuree y est ramenee, ouvertures,
    // partie basse et toit compris, plutot que d'etirer le batiment a la hauteur lue sur la photo.
    // Les corrections se tracent sur la proposition de l'analyse, ramenee de meme (spec facades §12).
    const k = hauteurMur > 0 && hauteurEstimee > 0 ? hauteurEstimee / hauteurMur : 1;
    const e = Math.abs(k - 1) > 1e-9 ? etirerEnHauteur(resultat, [], toit, k) : { resultat, toit };
    const t = ouv.conclure(k);
    releve.valider(releveDuMur(facade, e.resultat, t.ouvertures, hauteurEstimee, morceaux[0]?.prise.mesure ?? null, t.corrections), appliquerToit ? e.toit : null, hauteurMur);
  };

  // Passer des morceaux aux vues (ou l'inverse) change ce que chaque photo cadre : le mur entier, ou
  // une part. Les coins que le doigt n'a pas touches sont proposes a nouveau, et cherches sur la photo.
  const changerAssemblage = (a: Assemblage) => {
    if (!facade || a === assemblage) return;
    setAssemblage(a);
    setMorceaux(morceaux.map((m) => (m.sources?.includes('doigt') ? m : morceauDePrise({ ...m.prise }, facade, hauteurEstimee, estPartielle(a, m.prise.photosPrevues, morceaux.length), setMorceaux))));
  };
  const viser = (remplacer: number | null) => {
    setARemplacer(remplacer);
    setEtape('visee');
  };
  // Une photo importee ou de rue n'a ni reperes ni plan de prise : ses coins se proposent d'apres
  // la distance quand on la connait (photo de rue), sinon au centre de l'image.
  const surPhoto = (photo: Photo, mesure: MesureDistance | null) => surPrise({ photo, mesure, reperes: null, champ: photo.champ ?? CHAMP_GRAND_COTE_DEFAUT, photosPrevues: null });
  const corrigerHauteur = (v: number) => {
    if (!resultat || !(hauteurMur > 0)) return;
    const e = etirerEnHauteur(resultat, [], toit, v / hauteurMur);
    setHauteurMur(v);
    setResultat(e.resultat);
    ouv.etirer(v / hauteurMur);
    setToit(e.toit);
  };
  // Avant l'analyse, seule la largeur est connue ; la hauteur s'affiche une fois mesuree.
  const titre = facade ? `Façade ${facade.orientation.toLowerCase()} · ${fr(facade.largeur)}${resultat ? ` × ${fr(hauteurMur)}` : ''} m` : 'Relever une façade';
  const verification: Verification | null =
    resultat && facade
      ? { resultat, largeur: facade.largeur, hauteurMur, ouvertures, setOuvertures, choisie, setChoisie, devinees: ouv.devinees, garder: ouv.garder, ecarter: ouv.ecarter, toit, setToit, appliquerToit, setAppliquerToit, contour: bat.pts, cote: facade.cote,
          partieBasse: resultat.partieBasse, setPartieBasse: (pb) => setResultat({ ...resultat, partieBasse: pb }), hauteurEstimee, hauteurMesuree: resultat.hauteurMesuree, corrigerHauteur }
      : null;

  return (
    <div className={'releve' + (etape === 'visee' ? ' camera' : '')} role="dialog" aria-modal="true" aria-label={titre}>
      <div className="releveEntete">
        <div className="releveTitre">
          <span className="releveEtape">{LIBELLES_ETAPE[etape]}</span>
          <span>{titre}</span>
        </div>
        <button data-controle="releve.fermer" type="button" className="releveFermer" aria-label="Fermer le relevé" title="Fermer (Échap)" onClick={() => releve.fermer()}>
          <Icone nom="fermer" taille={22} />
        </button>
      </div>
      {etape === 'mur' && (
        <ChoixMur
          bat={bat}
          facades={facades}
          position={releve.position}
          obstacles={releve.obstacles}
          onChoisir={(c) => {
            setCote(c);
            setEtape('methode');
          }}
        />
      )}
      {facade && <SourcePhoto etape={etape} mur={mur} surPhoto={surPhoto} setEtape={setEtape} onRetour={() => (morceaux.length ? setEtape('coins') : coteInitial === null ? setEtape('mur') : releve.fermer())} />}
      {etape === 'visee' && facade && (
        <Visee
          facade={facade}
          hauteurACadrer={hauteurACadrer}
          faites={aRemplacer ?? morceaux.length}
          onPrise={surPrise}
          onRetour={() => (morceaux.length ? setEtape('coins') : setEtape('methode'))}
        />
      )}
      {etape === 'coins' && morceaux.length > 0 && facade && (
        <CoinsDuParcours morceaux={morceaux} setMorceaux={setMorceaux} courant={courant} setCourant={setCourant} assemblage={assemblage} changerAssemblage={changerAssemblage}
          prevues={prevues} avis={avis} largeur={facade.largeur} viser={viser} analyser={analyser} aide={releve.aide()} hauteurEstimee={hauteurEstimee} etiquette={facade.orientation.toLowerCase()} />
      )}
      {etape === 'analyse' && <EtapeAnalyse vues={assemblage === 'vues' && morceaux.length > 1} />}
      {etape === 'resultat' && verification && facade && (
        <EtapeResultat v={verification} onRevoir={() => setEtape('coins')} onValider={valider} aide={<AideDeVerification aide={releve.aide()} ouv={ouv} morceaux={morceaux} extras={extras} v={verification} facade={facade} />} />
      )}
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
