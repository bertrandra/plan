// Le releve de facade (zones/Releve.tsx), etape 5 : verifier, corriger, valider.

import { useEffect, useState } from 'react';
import { Icone } from '../icones.js';
import { classer } from '../../facade/detection.js';
import { LIBELLES_FORME_TOIT, penteDeg, hauteurPignon } from '../../facade/toit.js';
import type { OuvertureFacade, TypeOuverture, Toit, FormeToit, PtBrut, PartieBasse } from '../../model/types.js';
import { LIBELLES_OUVERTURE, fr } from './commun.js';
import { ChampCm, Elevation } from './Elevation.js';
import { type Resultat } from './serie.js';

/** La fiche de l'ouverture choisie : nature, cotes au centimetre, retrait. */
function FicheOuverture({ o, largeur, hauteurMur, maj, retirer }: { o: OuvertureFacade; largeur: number; hauteurMur: number; maj: (c: Partial<OuvertureFacade>) => void; retirer: () => void }) {
  return (
    <div className="releveFiche" role="group" aria-label="Ouverture choisie">
      <div className="releveSegment" role="group" aria-label="Nature">
        {(Object.keys(LIBELLES_OUVERTURE) as TypeOuverture[]).map((t) => (
          <button data-controle="releve.typeOuverture" key={t} type="button" aria-pressed={o.type === t} onClick={() => maj({ type: t })}>
            {LIBELLES_OUVERTURE[t]}
          </button>
        ))}
      </div>
      <div className="releveChamps">
        <ChampCm libelle="Depuis la gauche" valeur={o.x} onChange={(v) => maj({ x: Math.min(v, largeur - o.l) })} />
        <ChampCm libelle="Appui" valeur={o.y} onChange={(v) => maj({ y: Math.min(v, hauteurMur - o.h) })} />
        <ChampCm libelle="Largeur" valeur={o.l} onChange={(v) => maj({ l: Math.max(0.1, Math.min(v, largeur - o.x)) })} />
        <ChampCm libelle="Hauteur" valeur={o.h} onChange={(v) => maj({ h: Math.max(0.1, Math.min(v, hauteurMur - o.y)) })} />
      </div>
      <button data-controle="releve.retirerOuverture" type="button" className="secondary small" onClick={retirer}>
        <Icone nom="supprimer" taille={16} /> Retirer cette ouverture
      </button>
    </div>
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
          ? `Mesurée sur la photo, à l'échelle de la largeur du plan (${fr(v.largeur)} m). Le bâtiment avait jusqu'ici ${fr(v.hauteurEstimee)} m (cadastre ou relevé précédent).`
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

export function EtapeResultat({ v, onRevoir, onValider }: { v: Verification; onRevoir: () => void; onValider: () => void }) {
  const { resultat, largeur, hauteurMur, ouvertures, setOuvertures, choisie, setChoisie } = v;
  const o = choisie !== null ? ouvertures[choisie] : undefined;
  const decompte = (Object.keys(LIBELLES_OUVERTURE) as TypeOuverture[])
    .map((t) => [t, ouvertures.filter((x) => x.type === t).length] as const)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${n} ${LIBELLES_OUVERTURE[t].toLowerCase()}${n > 1 ? 's' : ''}`)
    .join(', ');
  const maj = (i: number, champ: Partial<OuvertureFacade>) => setOuvertures(ouvertures.map((x, k) => (k === i ? { ...x, ...champ } : x)));
  const ajouter = () => {
    const l = Math.min(1, largeur * 0.3),
      h = Math.min(1.2, hauteurMur * 0.4);
    setOuvertures([...ouvertures, { type: classer(1, l, h), x: Math.round((largeur - l) * 50) / 100, y: 1, l, h }]);
    setChoisie(ouvertures.length);
  };
  return (
    <>
      <div className="releveCorps releveCorpsPhoto">
        {resultat.avis && (
          <p className="releveAvis" role="alert">
            {resultat.avis}
          </p>
        )}
        {resultat.couverture < 0.9 && <p className="releveAvis">La photo couvrait {Math.round(resultat.couverture * 100)} % du mur ; le reste est complété à la teinte du mur.</p>}
        <Elevation texture={resultat.texture} Ht={resultat.hauteurTexture} L={largeur} H={hauteurMur} partie={v.partieBasse} ouvertures={ouvertures} setOuvertures={setOuvertures} choisie={choisie} setChoisie={setChoisie} />
        <div className="releveBarre">
          <span className="releveNote">{ouvertures.length ? decompte : 'Aucune ouverture trouvée.'}</span>
          <button data-controle="releve.ajouterOuverture" type="button" className="secondary small" onClick={ajouter}>
            <Icone nom="plus" taille={16} /> Ajouter une ouverture
          </button>
        </div>
        {o && choisie !== null && (
          <FicheOuverture
            o={o}
            largeur={largeur}
            hauteurMur={hauteurMur}
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
