// L'equilibre du jeu de donnees (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 7) : ce que le banc contient deja,
// pour voir ce qui manque avant d'importer encore. Une carte des photos par position, puis des comptes par ce que les metadonnees portent
// vraiment : source, region et departement (deduits de la position), saison et annee (de la date), type de vue, etat d'avancement. Et,
// dit franchement en bas, ce qu'elles ne portent pas.

import { useState } from 'react';
import type { Banc } from '../../App.js';
import type { Compte, Equilibre, Perimetre } from '../../equilibre.js';
import { Page, Section, Segments, Tuile, Tuiles, Vide } from '../../ui/Page.js';
import { CarteEquilibre } from './CarteEquilibre.js';
import { MursDuBanc } from './Murs.js';
import { OuImporter } from './OuImporter.js';
import { useEquilibre } from './useEquilibre.js';

const PERIMETRES: { valeur: Perimetre; libelle: string }[] = [{ valeur: 'toutes', libelle: 'Toutes les photos' }, { valeur: 'jeu', libelle: 'Le jeu (corrigées)' }];
const pourCent = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)} %` : '—');

export function EcranEquilibre({ banc }: { banc: Banc }) {
  const c = useEquilibre(banc), e = c.e;
  const situees = e.total - e.sansPosition, datees = e.total - e.sansDate;
  return (
    <Page icone="equilibre" numero="8" titre="Équilibre du jeu"
      aide={<p>Un modèle n’apprend bien que ce qu’il a vu : un jeu fait de pavillons d’une seule région, pris en été, lira mal un immeuble d’ailleurs en hiver. Cet écran compte les photos du banc par ce que leurs métadonnées disent (lieu, date, source, type de vue, avancement) pour voir où importer ensuite, et montre les doublons (le même mur en plusieurs images). Le département se déduit de la position, à un kilomètre près, sans rien demander à un service.</p>}
      actions={<Segments label="Photos comptées" valeur={c.perimetre} options={PERIMETRES} onChange={c.setPerimetre} />}>
      {!e.total ? (
        c.perimetre === 'jeu' && banc.images.length
          ? <Vide icone="equilibre" titre="Aucune photo dans le jeu" texte="Le jeu ne prend que les photos corrigées (marquage relu et enregistré), hors réserve." action={<button type="button" className="principal" onClick={() => c.setPerimetre('toutes')}>Compter toutes les photos</button>} />
          : <Vide icone="equilibre" titre="Le banc est vide" texte="Importez des photos : cet écran dira d’où elles viennent et ce qui manque." action={<button type="button" className="principal" onClick={() => banc.aller('import')}>Aller à l’import</button>} />
      ) : <>
        <Tuiles>
          <Tuile valeur={e.total} libelle={c.perimetre === 'jeu' ? 'photos dans le jeu' : 'photos'} ton="accent" detail={c.perimetre === 'jeu' ? 'corrigées, hors réserve' : `dont ${c.dansLeJeu} dans le jeu${c.rejetees ? ` ; ${c.rejetees} rejetée(s) non comptée(s)` : ''}`} />
          <Tuile valeur={e.departement.length} libelle={e.departement.length > 1 ? 'départements' : 'département'} ton={e.departement.length >= 10 ? 'ok' : 'attention'} detail={`sur 101 ; ${e.region.filter((r) => r.n > 0).length} région(s) sur 13 en métropole`} />
          <Tuile valeur={pourCent(situees, e.total)} libelle="avec une position" ton={e.sansPosition ? 'attention' : 'ok'} detail={e.sansPosition ? `${e.sansPosition} sans position` : 'toutes situées'} />
          <Tuile valeur={pourCent(datees, e.total)} libelle="avec une date" ton={e.sansDate ? 'attention' : 'ok'} detail={e.sansDate ? `${e.sansDate} sans date` : 'toutes datées'} />
          <Tuile valeur={pourCent(e.sansFeuilles, datees)} libelle="sans feuilles" detail="prises de novembre à mars, parmi les datées" />
        </Tuiles>
        <Section titre="Où sont les photos" compte={`${situees} située(s)`}>
          {situees ? <CarteEquilibre key={c.perimetre} points={e.points} /> : <p className="aide">Aucune photo n’a de position : la carte n’a rien à montrer.</p>}
        </Section>
        <div className="grille-equilibre">
          <Repartition titre="Par région" comptes={e.region} total={situees} manque={e.horsFrance ? `${e.horsFrance} hors de France` : null} />
          <Repartition titre="Par département" comptes={e.departement} total={situees} replie={8} />
          <Repartition titre="Par type de bâtiment" comptes={e.batiment} total={e.total - e.sansMur} manque={e.sansMur ? `${e.sansMur} sans mur connu` : null} />
          <Repartition titre="Par saison" comptes={e.saison} total={datees} />
          <Repartition titre="Par année" comptes={e.annee} total={datees} replie={8} />
          <Repartition titre="Par type de vue" comptes={e.vue} total={e.total} />
          <Repartition titre="Par source" comptes={e.source} total={e.total} />
          <Repartition titre="Par état d’avancement" comptes={e.etat} total={e.total} />
        </div>
        <OuImporter banc={banc} e={e} />
        <MursDuBanc banc={banc} />
        <CeQuiManque e={e} />
      </>}
    </Page>
  );
}

/** Une repartition : chaque ligne, son nombre, sa part et une barre ; une ligne a zero se voit (c'est elle qu'on cherche). */
function Repartition({ titre, comptes, total, replie, manque }: { titre: string; comptes: Compte[]; total: number; replie?: number; manque?: string | null }) {
  const [tout, setTout] = useState(false);
  const max = Math.max(1, ...comptes.map((x) => x.n));
  const montres = replie && !tout ? comptes.slice(0, replie) : comptes;
  return (
    <Section titre={titre} compte={manque ?? undefined}
      actions={replie && comptes.length > replie ? <button type="button" className="discret" onClick={() => setTout((x) => !x)}>{tout ? 'Replier' : comptes.length - replie === 1 ? 'Montrer le dernier' : `Montrer les ${comptes.length - replie} autres`}</button> : undefined}>
      {comptes.length ? (
        <table className="tableau tableau-equilibre">
          <tbody>{montres.map((x) => (
            <tr key={x.cle} className={x.n ? '' : 'zero'}>
              <th scope="row">{x.libelle}</th>
              <td className="nombre">{x.n}</td>
              <td className="nombre part">{pourCent(x.n, total)}</td>
              <td className="col-barre"><span className="barre-equilibre"><span style={{ width: `${(x.n / max) * 100}%` }} /></span></td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p className="aide">Rien à compter : aucune photo ne porte cette information.</p>}
    </Section>
  );
}

/** Ce que les metadonnees ne disent pas (encore) : dit, plutot que de montrer des comptes inventes. */
function CeQuiManque({ e }: { e: Equilibre }) {
  return (
    <Section titre="Ce que cet écran ne peut pas dire" repliable ouverte>
      <ul className="liste-manques">
        {e.sansPosition > 0 && <li><strong>{e.sansPosition} photo(s) sans position</strong> : elles ne comptent ni sur la carte, ni par région. Une photo de l’iPhone la porte dans son EXIF si la localisation de l’appareil photo est permise ; un fichier retouché l’a souvent perdue.</li>}
        {e.sansDate > 0 && <li><strong>{e.sansDate} photo(s) sans date</strong> : elles ne comptent ni par saison, ni par année.</li>}
        {e.horsFrance > 0 && <li><strong>{e.horsFrance} photo(s) hors de France</strong> : situées, mais dans aucun département.</li>}
        {e.sansMur > 0 && <li><strong>{e.sansMur} photo(s) sans mur connu</strong> : elles ne comptent pas par type de bâtiment, et un doublon parmi elles ne se voit pas. Le rattrapage ci-dessus retrouve le mur de celles qui ont une position et un cap ; une photo de l’iPhone sans cap, ou qui ne regarde aucun bâtiment de la BD TOPO, reste sans mur.</li>}
        <li><strong>Le type de bâtiment</strong> (maison, immeuble, commerce) est une heuristique sur ce que la BD TOPO dit du bâtiment visé (usage, logements, étages, hauteur) : sans usage renseigné, fréquent à la campagne, seule la hauteur tranche.</li>
        <li><strong>Le mur visé n’est pas la preuve qu’il se voit</strong> : c’est celui que la géométrie met dans le cadre, une haie peut le cacher.</li>
        <li><strong>Le matériau, l’époque ou le style</strong> de la façade ne sont écrits nulle part ; les classes marquées (fenêtres, volets, portes) se comptent à l’étape 7, Blocs.</li>
        <li><strong>Ville ou campagne</strong> : rien ne le dit ; la carte le laisse deviner.</li>
        <li>Le département vient de contours simplifiés (un kilomètre) : une photo prise sur une limite peut être comptée chez le voisin.</li>
      </ul>
    </Section>
  );
}
