// Le releve de facade (zones/Releve.tsx), etape 5 : verifier, corriger, valider.

import { useEffect, useState, type ReactNode } from 'react';
import { au } from '../../util/tableaux.js';
import { Icone } from '../icones.js';
import { classer } from '../../facade/detection.js';
import { ajouterDansLaGrille, memeHauteurNiveau, memeTailleTravee } from '../../facade/structure.js';
import { retouchee } from '../../facade/verification.js';
import { texteDetails, texteOrigine } from './ouvertures.js';
import { LIBELLES_FORME_TOIT, penteDeg, hauteurPignon } from '../../facade/toit.js';
import type { OuvertureFacade, TypeOuverture, Toit, FormeToit, PtBrut, PartieBasse } from '../../model/types.js';
import { LIBELLES_OUVERTURE, fr } from './commun.js';
import { ChampCm, Elevation } from './Elevation.js';
import { type Resultat } from './serie.js';
import { pxParMDuCalage, textePrecision } from './analyse.js';

/**
 * Les gestes de la structure (spec facades §12), en une touche : la taille de l'ouverture choisie
 * donnee a sa travee, sa hauteur a son niveau (meme type). Grises quand il n'y a rien a egaliser.
 */
function GestesGrille({ i, ouvertures, setOuvertures, largeur }: { i: number; ouvertures: OuvertureFacade[]; setOuvertures: (o: OuvertureFacade[]) => void; largeur: number }) {
  const taille = memeTailleTravee(ouvertures, i, largeur),
    hauteur = memeHauteurNiveau(ouvertures, i, largeur);
  const appliquer = (r: { ouvertures: OuvertureFacade[]; touchees: number[] }) => setOuvertures(r.ouvertures.map((x, k) => (r.touchees.includes(k) ? retouchee(x) : x)));
  const nT = taille.touchees.length,
    nH = hauteur.touchees.length;
  return (
    <div className="releveGestes" role="group" aria-label="Égaliser sur la grille">
      <button data-controle="releve.memeTailleTravee" type="button" className="secondary small" disabled={!nT}
        title={nT ? `Donner cette largeur à ${nT} ouverture${nT > 1 ? 's' : ''} de la travée` : 'Aucune autre ouverture de ce type dans la travée, ou déjà de cette taille'}
        onClick={() => appliquer(taille)}>
        Même taille pour la travée
      </button>
      <button data-controle="releve.memeHauteurNiveau" type="button" className="secondary small" disabled={!nH}
        title={nH ? `Donner cet appui et cette hauteur à ${nH} ouverture${nH > 1 ? 's' : ''} du niveau` : 'Aucune autre ouverture de ce type au niveau, ou déjà à cette hauteur'}
        onClick={() => appliquer(hauteur)}>
        Même hauteur pour le niveau
      </button>
      {!nT && !nH && <p className="releveNote">Rien à égaliser : aucune autre ouverture de ce type dans sa travée ni à son niveau, ou déjà à ses cotes.</p>}
    </div>
  );
}

/** La fiche de l'ouverture choisie : origine et details, nature, cotes au centimetre, gestes, retrait. */
function FicheOuverture({ v, i, maj, retirer }: { v: Verification; i: number; maj: (c: Partial<OuvertureFacade>) => void; retirer: () => void }) {
  const o = au(v.ouvertures, i);
  const { largeur, hauteurMur } = v;
  const details = texteDetails(o.details);
  return (
    <div className="releveFiche" role="group" aria-label="Ouverture choisie">
      <p className="releveNote">
        {texteOrigine(o)}
        {details ? ` ${details}` : ''}
      </p>
      {o.source === 'devinee' && (
        <label className="releveCase">
          <input data-controle="releve.garderDevinee" type="checkbox" checked onChange={() => v.ecarter(i)} />
          Garder cette baie devinée
        </label>
      )}
      <div className="releveSegment" role="group" aria-label="Nature">
        {(Object.keys(LIBELLES_OUVERTURE) as TypeOuverture[]).map((t) => (
          <button data-controle="releve.typeOuverture" key={t} type="button" aria-pressed={o.type === t} onClick={() => maj({ type: t })}>
            {LIBELLES_OUVERTURE[t]}
          </button>
        ))}
      </div>
      <div className="releveChamps">
        <ChampCm libelle="Depuis la gauche" valeur={o.x} onChange={(x) => maj({ x: Math.min(x, largeur - o.l) })} />
        <ChampCm libelle="Appui" valeur={o.y} onChange={(y) => maj({ y: Math.min(y, hauteurMur - o.h) })} />
        <ChampCm libelle="Largeur" valeur={o.l} onChange={(l) => maj({ l: Math.max(0.1, Math.min(l, largeur - o.x)) })} />
        <ChampCm libelle="Hauteur" valeur={o.h} onChange={(h) => maj({ h: Math.max(0.1, Math.min(h, hauteurMur - o.y)) })} />
      </div>
      <GestesGrille i={i} ouvertures={v.ouvertures} setOuvertures={v.setOuvertures} largeur={largeur} />
      <button data-controle="releve.retirerOuverture" type="button" className="secondary small" onClick={retirer}>
        <Icone nom="supprimer" taille={16} /> Retirer cette ouverture
      </button>
    </div>
  );
}

/**
 * La barre sous l'elevation : le decompte, les devinees en attente, et les deux facons d'ajouter une
 * ouverture - au croisement libre de la grille le plus proche (spec facades §12), ou au milieu.
 */
function BarreOuvertures({ v }: { v: Verification }) {
  const { ouvertures, setOuvertures, setChoisie, largeur, hauteurMur, choisie } = v;
  const decompte = (Object.keys(LIBELLES_OUVERTURE) as TypeOuverture[])
    .map((t) => [t, ouvertures.filter((x) => x.type === t).length] as const)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${LIBELLES_OUVERTURE[t].toLowerCase()}${n > 1 ? 's' : ''}`)
    .join(', ');
  const o = choisie !== null ? ouvertures[choisie] : undefined;
  const dansGrille = ajouterDansLaGrille(ouvertures, largeur, hauteurMur, o ? { x: o.x + o.l / 2, y: o.y + o.h / 2 } : null);
  const ajouter = (b: Pick<OuvertureFacade, 'type' | 'x' | 'y' | 'l' | 'h'>) => {
    setOuvertures([...ouvertures, { type: b.type, x: b.x, y: b.y, l: b.l, h: b.h, source: 'ajoutee' }]);
    setChoisie(ouvertures.length);
  };
  const auMilieu = () => {
    const l = Math.min(1, largeur * 0.3),
      h = Math.min(1.2, hauteurMur * 0.4);
    ajouter({ type: classer(1, l, h), x: Math.round((largeur - l) * 50) / 100, y: 1, l, h });
  };
  const n = v.devinees.length;
  return (
    <>
      <div className="releveBarre">
        <span className="releveNote">{ouvertures.length ? decompte : 'Aucune ouverture trouvée.'}</span>
        <span className="releveGestes" role="group" aria-label="Ajouter une ouverture">
          <button data-controle="releve.ajouterDansGrille" type="button" className="secondary small" disabled={!dansGrille}
            title={dansGrille ? 'Ajouter une baie au croisement libre le plus proche, à la taille de sa travée et de son niveau' : 'Aucun croisement libre : la grille de la façade est pleine, ou il faut au moins une ouverture'}
            onClick={() => dansGrille && ajouter(dansGrille)}>
            <Icone nom="plus" taille={16} /> Ajouter dans la grille
          </button>
          <button data-controle="releve.ajouterOuverture" type="button" className="secondary small" onClick={auMilieu}>
            <Icone nom="plus" taille={16} /> Ajouter une ouverture
          </button>
        </span>
      </div>
      {n > 0 && (
        <p className="releveNote">
          {n === 1 ? 'Une baie devinée par la grille est en pointillé : touchez-la pour la garder.' : `${n} baies devinées par la grille sont en pointillé : touchez-en une pour la garder.`}
        </p>
      )}
    </>
  );
}

/**
 * Le toit lu sur la facade, corrigeable. Il remplace celui du batiment (celui du cadastre, ou d'un
 * releve precedent) : c'est la derniere facade relevee qui definit le toit. Sur un pignon, la facade
 * porte le triangle du toit, dont la hauteur s'ajoute a celle de l'egout.
 */
function CarteToit({
  toit,
  setToit,
  appliquer,
  setAppliquer,
  contour,
  cote,
  hauteurMur,
}: {
  toit: Toit | null;
  setToit: (t: Toit) => void;
  appliquer: boolean;
  setAppliquer: (v: boolean) => void;
  contour: PtBrut[];
  cote: number;
  hauteurMur: number;
}) {
  if (!toit) {
    return (
      <div className="releveToit">
        <div className="releveSousTitre">Toit</div>
        <p className="releveNote">Le toit n'est pas assez visible sur la photo : celui du bâtiment reste tel quel.</p>
      </div>
    );
  }
  const pignon = hauteurPignon(contour, toit, cote);
  return (
    <div className="releveToit">
      <div className="releveSousTitre">Toit</div>
      <p className="releveNote">
        Lu sur la façade : {LIBELLES_FORME_TOIT[toit.forme].toLowerCase()}
        {toit.forme !== 'plat' ? `, faîtage à ${fr(toit.hauteur)} m au-dessus de l'égout (pente ${fr(penteDeg(contour, toit), 0)}°)` : ''}.
        {pignon > 0.01 ? ` Ce mur est un pignon : la façade monte à ${fr(hauteurMur + pignon)} m au faîtage.` : ''}
      </p>
      <label className="releveCase">
        <input data-controle="releve.appliquerToit" type="checkbox" checked={appliquer} onChange={(e) => setAppliquer(e.target.checked)} />
        Remplacer le toit du bâtiment par celui-ci
      </label>
      {appliquer && (
        <div className="releveChamps">
          <label className="releveCm">
            <span>Forme</span>
            <select data-controle="releve.formeToit" value={toit.forme} onChange={(e) => setToit({ ...toit, forme: e.target.value as FormeToit })}>
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
                <input data-controle="releve.faitage"
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
export interface Verification {
  resultat: Resultat;
  largeur: number;
  hauteurMur: number;
  ouvertures: OuvertureFacade[];
  setOuvertures: (o: OuvertureFacade[]) => void;
  choisie: number | null;
  setChoisie: (i: number | null) => void;
  /** Les baies devinees decochees, en pointille (spec facades §10.5) ; les garder, ou les y rendre. */
  devinees: OuvertureFacade[];
  garder: (i: number) => void;
  ecarter: (i: number) => void;
  toit: Toit | null;
  setToit: (t: Toit) => void;
  appliquerToit: boolean;
  setAppliquerToit: (v: boolean) => void;
  contour: PtBrut[];
  cote: number;
  partieBasse: PartieBasse | null;
  setPartieBasse: (p: PartieBasse) => void;
  /** La hauteur d'egout du batiment avant ce releve (cadastre, ou releve precedent), pour comparaison. */
  hauteurEstimee: number;
  hauteurMesuree: boolean;
  /** Corrige la hauteur mesuree : la facade s'etire en hauteur, sa largeur (le plan) ne bouge pas. */
  corrigerHauteur: (v: number) => void;
}

/** La hauteur du mur, mesuree sur la photo ; corrigeable si l'on connait mieux. */
function CarteHauteur({ v }: { v: Verification }) {
  return (
    <div className="releveToit">
      <div className="releveSousTitre">Hauteur</div>
      <p className="releveNote">
        {v.hauteurMesuree
          ? `Mesurée sur la photo, à l'échelle de la largeur du plan (${fr(v.largeur)} m). Le bâtiment garde ses ${fr(v.hauteurEstimee)} m : la façade y sera ramenée, ouvertures comprises.`
          : `La photo ne permettait pas de la mesurer : c'est celle du bâtiment jusqu'ici (cadastre ou relevé précédent). Corrigez-la si vous la connaissez.`}
      </p>
      <div className="releveChamps">
        <ChampHauteur valeur={v.hauteurMur} onChange={v.corrigerHauteur} />
      </div>
    </div>
  );
}

/**
 * La hauteur a l'egout, en metres. Elle ne s'applique qu'a la validation du champ (Entree, ou en le
 * quittant) : chaque correction etire les ouvertures, une frappe intermediaire (« 5 » avant « 5,8 »)
 * ne doit pas le faire.
 */
function ChampHauteur({ valeur, onChange }: { valeur: number; onChange: (v: number) => void }) {
  const [texte, setTexte] = useState(valeur.toFixed(2));
  useEffect(() => setTexte(valeur.toFixed(2)), [valeur]);
  const appliquer = () => {
    const v = parseFloat(texte.replace(',', '.'));
    if (Number.isFinite(v) && v >= 1 && v <= 60 && Math.abs(v - valeur) >= 0.005) onChange(Math.round(v * 100) / 100);
    else setTexte(valeur.toFixed(2));
  };
  return (
    <label className="releveCm">
      <span>À l'égout</span>
      <span className="champNombre">
        <input data-controle="releve.hauteur"
          type="number"
          inputMode="decimal"
          step={0.01}
          min={1}
          max={60}
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          onBlur={appliquer}
          onKeyDown={(e) => {
            if (e.key === 'Enter') appliquer();
          }}
        />
        <span className="unite">m</span>
      </span>
    </label>
  );
}

/** La partie basse d'un mur en L, telle que la photo l'a mesuree : la position du decrochement et l'egout bas. */
function CartePartieBasse({ p, largeur, hauteurMur, maj }: { p: PartieBasse; largeur: number; hauteurMur: number; maj: (p: PartieBasse) => void }) {
  const aDroite = p.debut > 0;
  const x = aDroite ? p.debut : p.fin;
  return (
    <div className="releveToit">
      <div className="releveSousTitre">Mur en L</div>
      <p className="releveNote">
        Partie basse {aDroite ? 'à droite' : 'à gauche'}, sur {fr(p.fin - p.debut)} m ; elle va jusqu'au pignon voisin.
      </p>
      <div className="releveChamps">
        <ChampCm libelle="Décrochement à" valeur={x} onChange={(v) => {
          const c = Math.max(0.1, Math.min(largeur - 0.1, v));
          maj(aDroite ? { ...p, debut: c } : { ...p, fin: c });
        }} />
        <ChampCm libelle="Égout bas" valeur={p.hauteur} onChange={(v) => maj({ ...p, hauteur: Math.max(0.5, Math.min(hauteurMur - 0.1, v)) })} />
      </div>
    </div>
  );
}

export function EtapeResultat({ v, onRevoir, onValider, aide = null }: { v: Verification; onRevoir: () => void; onValider: () => void; aide?: ReactNode }) {
  const { resultat, largeur, hauteurMur, ouvertures, setOuvertures, choisie, setChoisie } = v;
  const precision = textePrecision(pxParMDuCalage(resultat.calage));
  // Corrigee au doigt (cote, type), l'ouverture est verifiee : elle quitte le pointille.
  const maj = (i: number, champ: Partial<OuvertureFacade>) => setOuvertures(ouvertures.map((x, k) => (k === i ? retouchee({ ...x, ...champ }) : x)));
  return (
    <>
      <div className="releveCorps releveCorpsPhoto">
        {resultat.avis && (
          <p className="releveAvis" role="alert">
            {resultat.avis}
          </p>
        )}
        {resultat.couverture < 0.9 && <p className="releveAvis">La photo couvrait {Math.round(resultat.couverture * 100)} % du mur ; le reste est complété à la teinte du mur.</p>}
        <Elevation texture={resultat.texture} Ht={resultat.hauteurTexture} L={largeur} H={hauteurMur} partie={v.partieBasse} ouvertures={ouvertures} setOuvertures={setOuvertures} choisie={choisie} setChoisie={setChoisie}
          devinees={v.devinees} garder={v.garder} />
        <BarreOuvertures v={v} />
        {aide}
        {precision && <p className="releveNote">{precision}</p>}
        {choisie !== null && ouvertures[choisie] && (
          <FicheOuverture
            v={v}
            i={choisie}
            maj={(c) => maj(choisie, c)}
            retirer={() => {
              setOuvertures(ouvertures.filter((_, k) => k !== choisie));
              setChoisie(null);
            }}
          />
        )}
        <CarteHauteur v={v} />
        {v.partieBasse && <CartePartieBasse p={v.partieBasse} largeur={largeur} hauteurMur={hauteurMur} maj={v.setPartieBasse} />}
        <CarteToit toit={v.toit} setToit={v.setToit} appliquer={v.appliquerToit} setAppliquer={v.setAppliquerToit} contour={v.contour} cote={v.cote} hauteurMur={hauteurMur} />
      </div>
      <div className="relevePied">
        <button data-controle="releve.revoir" type="button" className="secondary" onClick={onRevoir}>
          Revoir les coins
        </button>
        <button data-controle="releve.valider" type="button" onClick={onValider}>
          Valider le relevé
        </button>
      </div>
    </>
  );
}
