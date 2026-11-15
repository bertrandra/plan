// Etape 1b, en lot (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 6) : une zone dessinee sur la carte (un rectangle,
// un polygone), une commune, ou un pave autour d'un point ; une cible (« 200 facades ») ; le banc parcourt la zone par paves, a debit
// borne, garde la meilleure vue de chaque batiment, montre ce qu'il importerait, puis l'importe en tache de fond. La logique est dans
// lot.ts ; ici, l'ecran.

import { useState } from 'react';
import type { Banc } from '../../App.js';
import { CIBLE_MAX, COTE_PAVE_M, PAUSE_ENTRE_REQUETES_MS, PAVES_MAX, PHOTOS_PAR_PAVE, QUOTA_PAR_TRONCON, surfaceKm2 } from '../../lot.js';
import { TYPES_DE_BATIMENT } from '../../murs.js';
import { Icone } from '../../ui/Icones.js';
import { Jauge, Segments, Tuile, Tuiles } from '../../ui/Page.js';
import { CarteZone } from './CarteZone.js';
import { APERCUS_DE_LA_PLANCHE, useImportEnLot, type OutilDeZone } from './useImportEnLot.js';

const OUTILS: { valeur: OutilDeZone; libelle: string }[] = [{ valeur: 'main', libelle: 'Déplacer' }, { valeur: 'rectangle', libelle: 'Rectangle' }, { valeur: 'polygone', libelle: 'Polygone' }];
const km2 = (s: number) => (s < 0.1 ? `${Math.round(s * 100)} ha` : `${s.toFixed(1).replace('.', ',')} km²`);

export function ImportEnLot({ banc }: { banc: Banc }) {
  const c = useImportEnLot(banc);
  const [texte, setTexte] = useState('');
  const a = c.avance, fini = !!a && !c.enCours;
  return (
    <div className="import-lot">
      <p className="aide">Visez une commune, tapez des coordonnées, ou dessinez la zone sur la carte (« Rectangle » : glissez d’un coin à l’autre ; « Polygone » : touchez ses sommets, puis « Fermer »). Le banc parcourt la zone par pavés de {COTE_PAVE_M} m ({PAVES_MAX} au plus), lit dans chacun les photos de Panoramax et les bâtiments de l’IGN — une requête à la fois, {(PAUSE_ENTRE_REQUETES_MS / 1000).toString().replace('.', ',')} s de pause avant chacune —, et garde la meilleure vue de chaque bâtiment : jamais deux fois le même, aucun que le banc a déjà, {QUOTA_PAR_TRONCON} au plus par tronçon de rue, et pas tout du même pavé. Rien n’est importé avant le récapitulatif.</p>
      <form className="rang" onSubmit={(e) => { e.preventDefault(); void c.viser(texte); }}>
        <input className="large" aria-label="Commune ou coordonnées" placeholder="Le Vésinet — ou 48.90507, 2.13254" value={texte} onChange={(e) => setTexte(e.target.value)} disabled={c.occupe} />
        <button type="submit" disabled={c.occupe}>Viser</button>
        <Segments label="Outil de la carte" valeur={c.outil} options={OUTILS} onChange={c.setOutil} />
        <label>Cible <input type="number" aria-label="Cible, en façades" min={1} max={CIBLE_MAX} value={c.cible} disabled={c.occupe} onChange={(e) => c.setCible(Number(e.target.value))} /> façades</label>
        {c.enCours
          ? <button type="button" onClick={c.arreter}><Icone nom="rejeter" taille={16} /> Arrêter</button>
          : <button type="button" className="principal" disabled={!c.zone || c.occupe || a?.etat === 'fini'} onClick={() => { void c.parcourir(); }}><Icone nom="auto" /> {a && a.etat !== 'fini' ? 'Reprendre le parcours' : 'Parcourir la zone'}</button>}
        {c.zone && !c.occupe && <button type="button" className="discret" onClick={() => c.setZone(null)}><Icone nom="fermer" taille={16} /> Effacer la zone</button>}
      </form>
      {c.message && <p className="etat" role="status">{c.message}</p>}
      {c.zone && <p className="etat zone-du-lot">{c.zone.nom ? <b>{c.zone.nom}</b> : 'Zone dessinée'} : {km2(surfaceKm2(c.zone))}{c.parcours ? `, ${c.parcours.paves.length} pavé(s)${c.parcours.tronque ? ` (zone trop grande : les ${PAVES_MAX} premiers, répartis sur toute la zone)` : ''}` : ''}.</p>}
      <CarteZone zone={c.zone} onZone={(z) => { c.setZone(z); c.setOutil('main'); }} outil={c.occupe ? 'main' : c.outil} parcours={c.parcours} retenues={c.retenues} version={a?.fait ?? 0} />
      {a && (
        <p className="etat avance-du-lot" role="status">
          <span className="avance"><Jauge valeur={a.fait} cible={a.paves} /> Pavé {a.fait} sur {a.paves}</span> · {a.photos} photo(s) lue(s) · <b>{a.retenues} façade(s) retenue(s)</b> ({a.batiments} bâtiment(s) vus{a.dejaLa ? `, ${a.dejaLa} déjà dans le banc` : ''}){a.pannes ? ` · ${a.pannes} pavé(s) en panne` : ''}{a.satures ? ` · ${a.satures} pavé(s) saturé(s) (${PHOTOS_PAR_PAVE} photos lues au plus par pavé)` : ''}
          {a.etat === 'fini' && (a.retenues >= c.cible ? ' · cible atteinte.' : ' · zone parcourue en entier.')}
          {a.message && <><br />{a.message}</>}
        </p>
      )}
      {fini && c.retenues.length === 0 && a.etat === 'fini' && <p className="aide">Aucune façade nouvelle dans cette zone : pas de photo de rue, pas de bâtiment à portée, ou le banc les a déjà.</p>}
      {fini && c.retenues.length > 0 && <Recapitulatif c={c} />}
    </div>
  );
}

/** Ce que le lot importerait, avant de l'importer : son compte, son poids, ses types de batiment, une planche d'apercus ; puis l'import et sa jauge. */
function Recapitulatif({ c }: { c: ReturnType<typeof useImportEnLot> }) {
  const r = c.recap, apercus = c.retenues.filter((x) => x.photo.panoramique && x.photo.sd).slice(0, APERCUS_DE_LA_PLANCHE);
  const faites = c.retenues.length - c.restantes.length - c.ecartees;
  return (
    <section className="recap-du-lot" aria-label="Récapitulatif du lot">
      <h4>Récapitulatif avant l’import</h4>
      <Tuiles>
        <Tuile valeur={r.facades} libelle="façades" ton="accent" detail={`de ${r.batiments} bâtiment(s), une par bâtiment`} />
        <Tuile valeur={r.photos} libelle="photos à lire" detail={`sur ${r.troncons} tronçon(s) de rue`} />
        <Tuile valeur={`${r.poidsMo.toString().replace('.', ',')} Mo`} libelle="poids estimé" detail="sur le serveur du banc" />
        <Tuile valeur={r.noteMoyenne} libelle="note moyenne" detail="de 0 à 100" />
      </Tuiles>
      <p className="etat types-du-lot">{TYPES_DE_BATIMENT.filter((t) => r.parType[t.cle] > 0).map((t) => `${r.parType[t.cle]} ${t.libelle.toLowerCase()}`).join(' · ')}</p>
      {apercus.length > 0 && (c.planche.size > 0 ? (
        <ul className="planche-du-lot">{apercus.map((x) => <li key={c.cleDe(x)}>{c.planche.has(c.cleDe(x)) ? <img src={c.planche.get(c.cleDe(x))} alt={`Façade du bâtiment ${x.batiment.id.slice(-6)}`} /> : <div className="sans-image" />}<small>note {x.note}{x.vue.cadre ? ` · ${x.vue.cadre.champ}°` : ''}</small></li>)}</ul>
      ) : <button type="button" disabled={!!c.import} onClick={() => { void c.voirLaPlanche(); }}>Voir {Math.min(apercus.length, APERCUS_DE_LA_PLANCHE)} aperçu(s)</button>)}
      <label className="case" title="À l’import, la façade de chaque vue est lue dans l’image (comme « façade cachée » de l’import sur la carte) : une haie, des arbres ou une clôture devant elle, et la vue n’est pas importée. Personne ne regarde un lot vue par vue ; la lecture se trompe environ une fois sur sept. Le lot peut donc rendre moins que sa cible."><input type="checkbox" checked={c.ecarterCachees} disabled={!!c.import} onChange={(e) => c.setEcarterCachees(e.target.checked)} /> Écarter les façades cachées (lues à l’import)</label>
      <div className="rang">
        {c.import ? <>
          <span className="avance"><Jauge valeur={c.import.fait} cible={c.import.total} /> Import : photo {Math.min(c.import.fait + 1, c.import.total)} sur {c.import.total}…</span>
          <button type="button" onClick={c.arreterLImport}>Arrêter après cette photo</button>
        </> : c.restantes.length > 0
          ? <button type="button" className="principal" onClick={() => { void c.importer(); }}><Icone nom="importer" /> {faites ? `Reprendre : importer les ${c.restantes.length} façade(s) restante(s)` : `Importer les ${c.restantes.length} façade(s)`}</button>
          : <span className="puce ok">Tout le lot est dans le banc{c.ecartees ? ` (${c.ecartees} façade(s) cachée(s) écartée(s))` : ''}</span>}
        {faites > 0 && c.restantes.length > 0 && !c.import && <span className="etat">{faites} déjà importée(s).</span>}
      </div>
    </section>
  );
}
