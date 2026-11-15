// L'apercu des facades d'une photo de la carte (demande du proprietaire, 15 novembre 2026) : survoler ou toucher un point montre, a cote
// de la carte, les vues telles qu'elles seront importees, sans ouvrir « Choisir les vues » dans la liste.

import type { PhotoRue, VueAExtraire } from '../../panoramax.js';
import { Icone } from '../../ui/Icones.js';
import { Apercu, NOM_VUE, usePano } from './panoramiques.js';

/** L'attente avant de lire un panoramique survole : passer sur un point en allant vers un autre ne telecharge rien. */
const DELAI_SURVOL_MS = 180;

export function ApercuPhoto({ p, vues, choisie, epinglee, onBasculer, onChoisirVues, onFermer }: {
  p: PhotoRue | null; vues: VueAExtraire[]; choisie: boolean; epinglee: boolean;
  onBasculer: () => void; onChoisirVues: () => void; onFermer: () => void;
}) {
  // Une photo epinglee (touchee) se lit tout de suite ; une photo survolee, apres un court delai.
  const { pano, erreur, attente } = usePano(p, epinglee ? 0 : DELAI_SURVOL_MS);
  if (!p) {
    return (
      <aside className="apercu-photo vide" aria-label="Aperçu des façades">
        <p className="aide">Survolez ou touchez un point de la carte : les façades que cette photo montre s’affichent ici, telles qu’elles seront importées.</p>
      </aside>
    );
  }
  return (
    <aside className="apercu-photo" aria-label="Aperçu des façades" aria-live="polite">
      <header>
        <strong>{p.panoramique ? 'Panoramique 360°' : 'Photo'}</strong>
        <small>{p.distance} m · {p.date?.slice(0, 10) ?? 'sans date'}</small>
        {epinglee && <button type="button" className="discret fermer-apercu" onClick={onFermer} aria-label="Fermer l’aperçu" title="Fermer l’aperçu"><Icone nom="fermer" taille={18} /></button>}
      </header>
      {/* Les gestes avant les images : ils restent sous la main quand les vues depassent la hauteur de la carte. */}
      <div className="rang gestes-apercu">
        <label className="case"><input type="checkbox" checked={choisie} onChange={onBasculer} aria-label="Photo choisie pour l’import" /> Choisie</label>
        {p.panoramique && <button type="button" onClick={onChoisirVues}>Choisir les vues</button>}
      </div>
      {p.panoramique ? (
        <ul className={vues.length > 2 ? 'apercu-vues serre' : 'apercu-vues'}>
          {vues.map((v, k) => (
            <li key={k}>
              <Apercu pano={pano} azimut={p.azimut ?? 0} cap={v.cap} largeur={480} />
              <span>{NOM_VUE[v.vue]} · {Math.round(v.cap)}°</span>
            </li>
          ))}
          {!vues.length && <li className="aide">Aucune vue de ce panoramique ne sera importée.</li>}
        </ul>
      ) : (
        <ul className="apercu-vues">
          <li>
            {p.vignette ? <img src={p.vignette} alt="La photo" /> : <div className="sans-image" />}
            <span>{p.vise ? 'Vers la parcelle' : 'De côté'}{p.azimut !== null ? ` · ${Math.round(p.azimut)}°` : ''}</span>
          </li>
        </ul>
      )}
      {attente && <p className="etat">Lecture du panoramique…</p>}
      {erreur && <p className="etat">Aperçu impossible : {erreur}</p>}
      {!epinglee && <p className="aide">Touchez le point pour garder cet aperçu ; touchez-le encore pour cocher ou décocher la photo.</p>}
      {(p.auteur || p.licence) && <small className="credit">{[p.auteur, p.licence].filter(Boolean).join(' · ')}</small>}
    </aside>
  );
}
