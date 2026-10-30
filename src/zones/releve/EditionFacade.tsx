// L'editeur d'une facade relevee (zones/Releve.tsx, lot F6) : l'elevation et ses ouvertures, a corriger (nature, cotes, ajout,
// retrait, verification), la partie basse d'un mur en L ; « Valider » ecrit l'edition en un pas d'historique.

import { au } from '../../util/tableaux.js';
import { Icone } from '../icones.js';
import { classer } from '../../facade/detection/detection.js';
import { ajouterDansLaGrille, memeHauteurNiveau, memeTailleTravee } from '../../facade/detection/structure.js';
import { retouchee } from '../../facade/detection/verification.js';
import { texteDetails, texteOrigine } from './ouvertures.js';
import type { OuvertureFacade, TypeOuverture, PartieBasse, CalageReleve } from '../../model/types.js';
import { LIBELLES_OUVERTURE, fr } from './commun.js';
import { ChampCm, Elevation } from './Elevation.js';
import { pxParMDuCalage, textePrecision } from '../../facade/releve/analyseSerie.js';

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

/** La fiche de l'ouverture choisie : origine et details, nature, cotes au centimetre, gestes, verification, retrait. */
function FicheOuverture({ v, i, maj, verifier, retirer }: { v: Verification; i: number; maj: (c: Partial<OuvertureFacade>) => void; verifier: (oui: boolean) => void; retirer: () => void }) {
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
      {/* Verifiee, l'ouverture est verrouillee : plus aucun rejeu de l'audit ne la deplace ni ne la retire (model/protections.ts). */}
      <label className="releveCase">
        <input data-controle="releve.verifierOuverture" type="checkbox" checked={!!o.verifieeLe} onChange={(e) => verifier(e.target.checked)} />
        {o.verifieeLe ? `Vérifiée sur la photo le ${o.verifieeLe.split('-').reverse().join('/')} : aucun rejeu ne la déplace` : 'Vérifiée sur la photo : aucun rejeu ne la déplacera'}
      </label>
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

/** Ce que l'editeur lit et modifie. */
export interface Verification {
  /** L'elevation redressee du releve, ou null (photo restee sur un autre appareil). */
  texture: string | null;
  /** Hauteur couverte par la texture (le mur, puis la bande au-dessus de l'egout). */
  hauteurTexture: number;
  largeur: number;
  hauteurMur: number;
  /** Le calage du releve : la precision de ses cotes. */
  calage: CalageReleve | null;
  ouvertures: OuvertureFacade[];
  setOuvertures: (o: OuvertureFacade[]) => void;
  choisie: number | null;
  setChoisie: (i: number | null) => void;
  /** Les baies devinees rendues au pointille (spec facades §10.5) ; les garder, ou les y rendre. */
  devinees: OuvertureFacade[];
  garder: (i: number) => void;
  ecarter: (i: number) => void;
  partieBasse: PartieBasse | null;
  setPartieBasse: (p: PartieBasse) => void;
  /** Le jour d'aujourd'hui (AAAA-MM-JJ) : la date d'une ouverture que la personne verifie. */
  aujourdhui: string;
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

export function EditionFacade({ v, onAnnuler, onValider }: { v: Verification; onAnnuler: () => void; onValider: () => void }) {
  const { largeur, hauteurMur, ouvertures, setOuvertures, choisie, setChoisie } = v;
  const precision = textePrecision(pxParMDuCalage(v.calage));
  // Corrigee au doigt (cote, type), l'ouverture est verifiee : elle quitte le pointille.
  const maj = (i: number, champ: Partial<OuvertureFacade>) => setOuvertures(ouvertures.map((x, k) => (k === i ? retouchee({ ...x, ...champ }) : x)));
  return (
    <>
      <div className="releveCorps">
        {!v.texture && <p className="releveNote">La photo de ce mur est restée sur l’appareil qui l’a prise : ses ouvertures se corrigent sans elle.</p>}
        <Elevation texture={v.texture} Ht={v.hauteurTexture} L={largeur} H={hauteurMur} partie={v.partieBasse} ouvertures={ouvertures} setOuvertures={setOuvertures} choisie={choisie} setChoisie={setChoisie}
          devinees={v.devinees} garder={v.garder} />
        <BarreOuvertures v={v} />
        {precision && <p className="releveNote">{precision}</p>}
        {choisie !== null && ouvertures[choisie] && (
          <FicheOuverture
            v={v}
            i={choisie}
            maj={(c) => maj(choisie, c)}
            verifier={(oui) => setOuvertures(ouvertures.map((x, k) => { if (k !== choisie) return x; const o = { ...x }; if (oui) o.verifieeLe = v.aujourdhui; else delete o.verifieeLe; return o; }))}
            retirer={() => {
              setOuvertures(ouvertures.filter((_, k) => k !== choisie));
              setChoisie(null);
            }}
          />
        )}
        {v.partieBasse && <CartePartieBasse p={v.partieBasse} largeur={largeur} hauteurMur={hauteurMur} maj={v.setPartieBasse} />}
      </div>
      <div className="relevePied">
        <button data-controle="releve.annuler" type="button" className="secondary" onClick={onAnnuler}>
          Annuler
        </button>
        <button data-controle="releve.valider" type="button" onClick={onValider}>
          Valider la façade
        </button>
      </div>
    </>
  );
}
