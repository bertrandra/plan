// Z8, l'actualisation IGN : ce qu'on redemande a l'IGN, et si l'on ajoute le voisinage.
//
// Le travail est fait par app/actualisationIgn.ts ; ce dialogue ne fait que recueillir les options.
// Les objets dessines a la main ne sont jamais touches, et le dialogue le dit d'emblee.

import { useEffect, useState } from 'react';
import type { InfosActualisation, OptionsActualisation } from '../../app/actualisationIgn.js';
import { filtrerVoisinageRayon, MAX_OBJETS_RAYON, RAYON_ETENDU_DEFAUT_M, RAYON_ETENDU_MAX_M, RAYON_ETENDU_MIN_M, RAYON_ETENDU_PAS_M, RAYON_LEGER_M, rayonDeLecture, type VoisinageRayon } from '../../geo/apiIgn.js';
import { AVERTISSEMENT_RAYON } from './avertissementRayon.js';

interface Props { infos: InfosActualisation; lancer: (o: OptionsActualisation) => void; fermer: () => void }

function Choix({ libelle, aide }: { libelle: string; aide: string }) {
  return <span><b>{libelle}</b><br /><span className="aideChoix">{aide}</span></span>;
}

export function Actualisation({ infos, lancer, fermer }: Props) {
  const [portee, setPortee] = useState<'parcelle' | 'tout'>('parcelle');
  const [voisinage, setVoisinage] = useState(false);
  const [batiments, setBatiments] = useState(true);
  // Haies, vegetation et arbres estimes se demandent : ils chargent le plan d'objets approximatifs.
  const [vegetation, setVegetation] = useState(false);
  const [arbres, setArbres] = useState(false);
  // Les parcelles adjacentes, ou tout ce qui est dans le rayon du curseur, en plusieurs requetes.
  const [enRayon, setEnRayon] = useState(false);
  const [rayon, setRayon] = useState(RAYON_ETENDU_DEFAUT_M);
  // Le disque, lu une fois par palier (200, 500, 1 000 m) des que le mode rayon est choisi : sous le
  // palier lu, le compte suit le curseur sans le reseau ; au-dela, le palier suivant est lu.
  const [disque, setDisque] = useState<VoisinageRayon | null>(null);
  const [echec, setEchec] = useState('');
  // Le relief, coche d'emblee, sur toutes les parcelles du plan.
  const [relief, setRelief] = useState(true);
  const [reliefToutes, setReliefToutes] = useState(true);
  const source = infos.voisinage;
  const palier = rayonDeLecture(rayon);
  useEffect(() => {
    if (!voisinage || !enRayon || !source || (disque && disque.rayonM >= palier)) return;
    let vivant = true;
    source.lire(palier).then(v => { if (vivant) setDisque(v); }).catch(err => { if (vivant) setEchec((err as Error).message || String(err)); });
    return () => { vivant = false; };
  }, [voisinage, enRayon, disque, source, palier]);
  const compte = disque && source && disque.rayonM >= palier ? filtrerVoisinageRayon(disque, source.centre, rayon, { idus: source.idus, ids: source.ids }) : null;
  const sousCase = (libelle: string, coche: boolean, changer: (v: boolean) => void, titre: string) => (
    <label title={titre}><input type="checkbox" data-controle="actualisation.couche" checked={coche} disabled={!voisinage} onChange={(e) => changer(e.target.checked)} /> {libelle}</label>
  );
  return (
    <div className="dialogueImperatif dialogueActualisation" role="dialog" aria-modal="true" aria-label="Actualiser depuis l'IGN">
      <div className="titreParcours">Actualiser depuis l'IGN</div>
      <div className="sousTitreParcours">{infos.parcelle + '. Les objets dessines a la main ne sont jamais touches.'}</div>
      <label className="choixRadio">
        <input type="radio" data-controle="actualisation.portee" name="porteeActualisation" value="parcelle" checked={portee === 'parcelle'} onChange={() => setPortee('parcelle')} />
        <Choix libelle="La parcelle seule" aide="Contour cadastral de la parcelle et zonage PLU. Rien d'autre n'est interroge." />
      </label>
      <label className="choixRadio">
        <input type="radio" data-controle="actualisation.portee" name="porteeActualisation" value="tout" checked={portee === 'tout'} onChange={() => setPortee('tout')} />
        <Choix libelle="Tout ce qui vient de l'IGN" aide={'La parcelle, le PLU, et les ' + infos.nbIgn + ' objet(s) importes de la BD TOPO (batiments, vegetation) deja presents dans ce plan.'} />
      </label>
      <div className="separateurParcours" />
      <label className="choixRadio">
        <input type="checkbox" data-controle="actualisation.voisinage" checked={voisinage} onChange={(e) => setVoisinage(e.target.checked)} />
        <Choix libelle="Ajouter le voisinage" aide={'Import de voisinage : les parcelles absentes du plan' +
          (infos.nbVoisines ? ' (' + infos.nbVoisines + ' deja presente(s), elles ne seront pas dupliquees)' : '') + '.'} />
      </label>
      <div className={'sousOptions' + (voisinage ? '' : ' inactives')}>
        <label title="Les parcelles qui touchent la parcelle du projet, et ce qui est bati dessus."><input type="radio" data-controle="actualisation.rayon" name="rayonVoisinage" checked={!enRayon} disabled={!voisinage} onChange={() => setEnRayon(false)} /> Parcelles adjacentes</label>
        <label title={'Toutes les parcelles et tout le bati a moins de ce rayon du centre de la parcelle, en plusieurs requetes a l\'IGN ; au-dela de ' + MAX_OBJETS_RAYON + ' par famille, les plus proches seulement.'}>
          <input type="radio" data-controle="actualisation.rayon" name="rayonVoisinage" checked={enRayon} disabled={!voisinage} onChange={() => setEnRayon(true)} /> {'Tout dans un rayon de ' + rayon + ' m'}
        </label>
        <label className={'caseParcours curseurRayon' + (voisinage && enRayon ? '' : ' vide')}>
          <input type="range" data-controle="actualisation.rayonM" aria-label="Rayon du voisinage" min={RAYON_ETENDU_MIN_M} max={RAYON_ETENDU_MAX_M} step={RAYON_ETENDU_PAS_M} value={rayon}
            disabled={!voisinage || !enRayon} aria-valuetext={rayon + ' mètres'} onChange={(ev) => setRayon(Number(ev.target.value))} />
          <span className="valeurRayon">{rayon + ' m'}</span>
        </label>
        {voisinage && enRayon && <div className="detailIgn" role="status">
          {echec ? 'Compte indisponible : ' + echec
            : compte ? compte.parcelles.length + ' parcelle(s) et ' + (batiments ? compte.batiments.length + ' bâtiment(s)' : 'aucun bâtiment (couche décochée)') + ' nouveaux à moins de ' + rayon + ' m' + (compte.tronque ? ', coupés aux ' + MAX_OBJETS_RAYON + ' plus proches' : '') + '.'
            : 'Lecture du voisinage…'}
        </div>}
        {voisinage && enRayon && rayon > RAYON_LEGER_M && <div className="detailIgn avertissementRayon" role="note">{AVERTISSEMENT_RAYON}</div>}
        {sousCase('Bâti principal et annexes (BD TOPO, avec hauteur)', batiments, setBatiments, 'Emprise et hauteur reelles ; les batiments des voisins arrivent verrouilles.')}
        {sousCase('Haies et zones de végétation', vegetation, setVegetation, 'Couches haie et zone_de_vegetation de la BD TOPO.')}
        {sousCase('Arbres estimés dans ces zones', arbres, setArbres, 'ESTIMATION : la BD TOPO ne cartographie pas les arbres isoles. Une grille d\'un arbre pour 64 m2 est repartie dans les zones de vegetation' + (enRayon ? ', a moins de 100 m de la parcelle seulement' : '') + '.')}
      </div>
      <div className={'noteVoisinage' + (voisinage ? '' : ' inactives')}>
        Tout ce qui arrive par cet import est marque « voisinage » : l'oeil « Voisinage » de l'explorateur (ou Affichage › Voisinage) le masque d'un coup, sans le supprimer.
      </div>
      {infos.reliefPermis && <>
        <div className="separateurParcours" />
        <label className="choixRadio">
          <input type="checkbox" data-controle="actualisation.relief" checked={relief} onChange={(e) => setRelief(e.target.checked)} />
          <Choix libelle="Relief du terrain" aide={(infos.aUnRelief ? 'Relit la grille d’altitudes et remplace celle du plan' : 'Lit la grille d’altitudes du sol nu')
            + ' (LiDAR HD, sinon RGE ALTI) : courbes de niveau, sol en 3D, hauteur des plots. Il change des quantités.'} />
        </label>
        <div className={'sousOptions' + (relief ? '' : ' inactives')}>
          <label title="La grille couvre aussi les parcelles voisines du plan. Au-delà d’un pas de 5 m, elle revient à la parcelle du projet et ses abords.">
            <input type="checkbox" data-controle="actualisation.reliefToutes" checked={reliefToutes} disabled={!relief} onChange={(e) => setReliefToutes(e.target.checked)} /> Sur toutes les parcelles du plan
          </label>
        </div>
      </>}
      <div className="piedDialogue">
        <button type="button" data-controle="actualisation.annuler" className="secondary" onClick={fermer}>Annuler</button>
        <button type="button" data-controle="actualisation.lancer" onClick={() => lancer({ portee, voisinage: voisinage ? { actif: true, batiments, vegetation, arbres, ...(enRayon ? { rayonM: rayon } : {}) } : { actif: false },
          relief: { actif: infos.reliefPermis && relief, toutesParcelles: reliefToutes } })}>Actualiser</button>
      </div>
    </div>
  );
}
