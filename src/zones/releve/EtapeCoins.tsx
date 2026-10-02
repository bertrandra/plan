// Le releve de facade (zones/Releve.tsx), etapes 3 et 4 : les coins de chaque photo, puis l'analyse.

import { au } from '../../util/tableaux.js';
import { Icone } from '../icones.js';
import { type CoteBas, type Decrochement } from '../../facade/profil.js';
import type { P2 } from '../../facade/homographie.js';
import { fr } from './commun.js';
import { Coins, decrochementPropose, nomsEnL, ordreDuContour } from './Coins.js';
import { type Morceau, consigneCoins } from './serie.js';

/** Les photos de la serie, de gauche a droite : on en choisit une pour la reprendre ou la retirer. */
function BandeauMorceaux({ morceaux, courant, choisir, retirer }: { morceaux: Morceau[]; courant: number; choisir: (k: number) => void; retirer: (k: number) => void }) {
  return (
    <div className="releveMorceaux" role="group" aria-label="Photos de la façade">
      {morceaux.map((m, k) => (
        <div key={k} className={'releveMorceau' + (k === courant ? ' choisi' : '')}>
          <button data-controle="releve.vignette" type="button" className="releveVignette" aria-pressed={k === courant} aria-label={`Photo ${k + 1}`} onClick={() => choisir(k)}>
            <img src={m.prise.photo.url} alt="" />
            <span>{k + 1}</span>
          </button>
          {morceaux.length > 1 && (
            <button data-controle="releve.retirerPhoto" type="button" className="secondary small" aria-label={`Retirer la photo ${k + 1}`} onClick={() => retirer(k)}>
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
      <button data-controle="releve.formeMur" type="button" aria-pressed={!decro} onClick={() => choisir(null)}>
        Rectangle
      </button>
      <button data-controle="releve.formeMur" type="button" aria-pressed={decro?.cote === 'gauche'} onClick={() => choisir('gauche')}>
        En L, bas à gauche
      </button>
      <button data-controle="releve.formeMur" type="button" aria-pressed={decro?.cote === 'droite'} onClick={() => choisir('droite')}>
        En L, bas à droite
      </button>
    </div>
  );
}

export function EtapeCoins({
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
        <button data-controle="releve.reprendre" type="button" className="secondary" onClick={onReprendre}>
          Reprendre cette photo
        </button>
        <button data-controle="releve.ajouterPhoto" type="button" className={manque > 0 ? '' : 'secondary'} onClick={onAjouter}>
          <Icone nom="plus" taille={16} /> Ajouter une photo
        </button>
        <button data-controle="releve.analyser" type="button" className={manque > 0 ? 'secondary' : ''} onClick={onAnalyser}>
          Analyser
        </button>
      </div>
    </>
  );
}

export function EtapeAnalyse() {
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
