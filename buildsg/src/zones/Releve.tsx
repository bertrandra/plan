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
//
// Le parcours vit ici ; chaque etape et ses outils, dans zones/releve/.

import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Icone } from './icones.js';
import { enPoints } from '../model/formes.js';
import { facadesDuContour } from '../facade/geometrie.js';
import { hauteurPignon } from '../facade/toit.js';
import { versJpeg } from '../ui/releve/camera.js';
import type { ServiceReleve } from '../app/releve.js';
import type { ObjetPolygone, OuvertureFacade, Toit } from '../model/types.js';
import { fr } from './releve/commun.js';
import { ChoixMur } from './releve/ChoixMur.js';
import { type Prise } from './releve/capteurs.js';
import { Visee } from './releve/Visee.js';
import { type Etape, type Morceau, type Resultat, coinsDePrise } from './releve/serie.js';
import { EtapeAnalyse, EtapeCoins } from './releve/EtapeCoins.js';
import { EtapeResultat, type Verification } from './releve/EtapeResultat.js';
import { analyserSerie, etirerEnHauteur, releveDuMur } from './releve/analyse.js';

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
    // Le batiment garde sa hauteur (cadastre, saisie) : la facade mesuree y est ramenee, ouvertures,
    // partie basse et toit compris, plutot que d'etirer le batiment a la hauteur lue sur la photo.
    const k = hauteurMur > 0 && hauteurEstimee > 0 ? hauteurEstimee / hauteurMur : 1;
    const e = Math.abs(k - 1) > 1e-9 ? etirerEnHauteur(resultat, ouvertures, toit, k) : { resultat, ouvertures, toit };
    releve.valider(releveDuMur(facade, e.resultat, e.ouvertures, hauteurEstimee, morceaux[0]?.prise.mesure ?? null), appliquerToit ? e.toit : null, hauteurMur);
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
        <button data-controle="releve.fermer" type="button" className="releveFermer" aria-label="Fermer le relevé" title="Fermer (Échap)" onClick={() => releve.fermer()}>
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
