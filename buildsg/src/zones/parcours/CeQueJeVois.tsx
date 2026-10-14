// « Ce que je vois » (MD/spec-audit.md §8.1) : le positif d'une observation, avec le vocabulaire des
// toits (MD/spec-regles-toits.md §2, §3, §7.2). Un composant partage : chaque ligne de la liste de
// controle de l'audit de la parcelle en montre une partie (toit, cheminees, terrasse, materiaux), la
// fiche de la promenade le montre en entier, en section facultative.
//
// On n'ecrit que ce que l'on a vu : toucher un choix deja retenu le retire. Chaque geste rend un
// nouvel objet a `changer`, qui l'ecrit (la capture, ou le cas de la promenade).

import { useState } from 'react';
import {
  ACROTERES, AUTRES_FORMES, BOUTS, COUVERTURES_VUES, COURONNEMENTS, FORMES_COURANTES, MATERIAUX_CHEMINEE, MATERIAUX_MURS_VUS,
  NOMBRE_VU_MAX, PANS_LUCARNES, POSITIONS_CHEMINEE, REVETEMENTS_TERRASSE, SENS_FAITAGE, avecNombreDeCheminees, avecSouche,
  type CeQueJeVois as Vu, type PartieVue,
} from '../../model/ceQueJeVois.js';

interface Props {
  vu: Vu;
  changer: (vu: Vu) => void;
  /** Les parties a montrer ; toutes par defaut. */
  parties?: readonly PartieVue[];
}

const NOMBRES = Array.from({ length: NOMBRE_VU_MAX + 1 }, (_, i) => i);
const OUI_NON = [{ code: 'oui', libelle: 'Oui' }, { code: 'non', libelle: 'Non' }] as const;
const ouiNon = (v: boolean | undefined) => (v === undefined ? undefined : v ? 'oui' : 'non');
/** Toucher le choix retenu le retire : on n'affirme que ce que l'on a vu. */
const basculer = <T,>(actuel: T | undefined, choix: T): T | undefined => (actuel === choix ? undefined : choix);
/** Une copie avec cette cle posee, ou retiree quand elle n'a plus de valeur : rien d'indefini ne s'ecrit. */
function avec<T extends object, K extends keyof T>(o: T, k: K, v: T[K] | undefined): T {
  const suite = { ...o };
  if (v === undefined) delete suite[k]; else suite[k] = v;
  return suite;
}

function Toit({ vu, changer }: { vu: Vu; changer: (v: Vu) => void }) {
  const [autres, setAutres] = useState(() => AUTRES_FORMES.some((f) => f.code === vu.forme));
  const formes = autres ? [...FORMES_COURANTES, ...AUTRES_FORMES] : FORMES_COURANTES;
  return (
    <>
      <div className="libelleChamp">Forme du toit</div>
      <div className="puces" role="group" aria-label="Forme du toit">
        {formes.map((f) => <button key={f.code} type="button" data-controle="vu.forme" aria-pressed={vu.forme === f.code}
          onClick={() => changer(avec(vu, 'forme', basculer(vu.forme, f.code)))}>{f.libelle}</button>)}
        {!autres && <button type="button" data-controle="vu.autresFormes" aria-expanded={false} onClick={() => setAutres(true)}>Autres formes…</button>}
      </div>
      <div className="libelleChamp">Faîtage</div>
      <div className="puces" role="group" aria-label="Sens du faîtage">
        {SENS_FAITAGE.map((s) => <button key={s.code} type="button" data-controle="vu.sensFaitage" aria-pressed={vu.sensFaitage === s.code}
          onClick={() => changer(avec(vu, 'sensFaitage', basculer(vu.sensFaitage, s.code)))}>{s.libelle}</button>)}
      </div>
      <div className="libelleChamp">Bouts</div>
      <div className="puces" role="group" aria-label="Bouts du toit">
        {BOUTS.map((b) => <button key={b.code} type="button" data-controle="vu.bouts" aria-pressed={vu.bouts === b.code}
          onClick={() => changer(avec(vu, 'bouts', basculer(vu.bouts, b.code)))}>{b.libelle}</button>)}
      </div>
      <div className="libelleChamp">Lucarnes</div>
      <div className="puces" role="group" aria-label="Nombre de lucarnes">
        {NOMBRES.map((n) => <button key={n} type="button" data-controle="vu.lucarnes" aria-pressed={vu.lucarnes?.nombre === n}
          onClick={() => changer(avec(vu, 'lucarnes', vu.lucarnes?.nombre === n ? undefined : vu.lucarnes?.pan && n ? { nombre: n, pan: vu.lucarnes.pan } : { nombre: n }))}>{n === 0 ? 'Aucune' : String(n)}</button>)}
      </div>
      {!!vu.lucarnes?.nombre && <div className="puces" role="group" aria-label="Pan des lucarnes">
        {PANS_LUCARNES.map((p) => <button key={p.code} type="button" data-controle="vu.panLucarnes" aria-pressed={vu.lucarnes?.pan === p.code}
          onClick={() => vu.lucarnes && changer(avec(vu, 'lucarnes', avec(vu.lucarnes, 'pan', basculer(vu.lucarnes.pan, p.code))))}>{p.libelle}</button>)}
      </div>}
    </>
  );
}

function Cheminees({ vu, changer }: { vu: Vu; changer: (v: Vu) => void }) {
  const souches = vu.cheminees?.souches ?? [];
  return (
    <>
      <div className="libelleChamp">Cheminées</div>
      <div className="puces" role="group" aria-label="Nombre de cheminées">
        {NOMBRES.map((n) => <button key={n} type="button" data-controle="vu.cheminees" aria-pressed={vu.cheminees?.nombre === n}
          onClick={() => changer(vu.cheminees?.nombre === n ? avec(vu, 'cheminees', undefined) : avecNombreDeCheminees(vu, n))}>{n === 0 ? 'Aucune' : String(n)}</button>)}
      </div>
      {souches.map((s, i) => (
        <div key={i} className="soucheVue" role="group" aria-label={'Cheminée ' + (i + 1)}>
          <div className="libelleChamp">{'Cheminée ' + (i + 1)}</div>
          <div className="puces" role="group" aria-label={'Position de la cheminée ' + (i + 1)}>
            {POSITIONS_CHEMINEE.map((p) => <button key={p.code} type="button" data-controle="vu.positionCheminee" aria-pressed={s.position === p.code}
              onClick={() => changer(avecSouche(vu, i, avec(s, 'position', basculer(s.position, p.code))))}>{p.libelle}</button>)}
          </div>
          <div className="puces" role="group" aria-label={'Matériau de la cheminée ' + (i + 1)}>
            {MATERIAUX_CHEMINEE.map((m) => <button key={m.code} type="button" data-controle="vu.materiauCheminee" aria-pressed={s.materiau === m.code}
              onClick={() => changer(avecSouche(vu, i, avec(s, 'materiau', basculer(s.materiau, m.code))))}>{m.libelle}</button>)}
          </div>
          <div className="puces" role="group" aria-label={'Couronnement de la cheminée ' + (i + 1)}>
            {COURONNEMENTS.map((c) => <button key={c.code} type="button" data-controle="vu.couronnement" aria-pressed={s.couronnement === c.code}
              onClick={() => changer(avecSouche(vu, i, avec(s, 'couronnement', basculer(s.couronnement, c.code))))}>{c.libelle}</button>)}
          </div>
        </div>
      ))}
    </>
  );
}

function Terrasse({ vu, changer }: { vu: Vu; changer: (v: Vu) => void }) {
  type T = NonNullable<Vu['terrasse']>;
  const t: T = vu.terrasse ?? {};
  const poser = <K extends keyof T>(k: K, v: T[K] | undefined) => {
    const suite = avec(t, k, v);
    changer(avec(vu, 'terrasse', Object.keys(suite).length ? suite : undefined));
  };
  return (
    <>
      <div className="libelleChamp">Toiture-terrasse accessible</div>
      <div className="puces" role="group" aria-label="Toiture-terrasse accessible">
        {OUI_NON.map((o) => <button key={o.code} type="button" data-controle="vu.accessible" aria-pressed={ouiNon(t.accessible) === o.code}
          onClick={() => poser('accessible', ouiNon(t.accessible) === o.code ? undefined : o.code === 'oui')}>{o.libelle}</button>)}
      </div>
      <div className="libelleChamp">Revêtement</div>
      <div className="puces" role="group" aria-label="Revêtement de la terrasse">
        {REVETEMENTS_TERRASSE.map((r) => <button key={r.code} type="button" data-controle="vu.revetement" aria-pressed={t.revetement === r.code}
          onClick={() => poser('revetement', basculer(t.revetement, r.code))}>{r.libelle}</button>)}
      </div>
      <div className="libelleChamp">Acrotère</div>
      <div className="puces" role="group" aria-label="Hauteur de l’acrotère, à vue">
        {ACROTERES.map((a) => <button key={a.valeur} type="button" data-controle="vu.acrotere" aria-pressed={t.acrotereM === a.valeur}
          onClick={() => poser('acrotereM', basculer(t.acrotereM, a.valeur))}>{a.libelle}</button>)}
      </div>
      <div className="libelleChamp">Garde-corps</div>
      <div className="puces" role="group" aria-label="Garde-corps">
        {OUI_NON.map((o) => <button key={o.code} type="button" data-controle="vu.gardeCorps" aria-pressed={ouiNon(t.gardeCorps) === o.code}
          onClick={() => poser('gardeCorps', ouiNon(t.gardeCorps) === o.code ? undefined : o.code === 'oui')}>{o.libelle}</button>)}
      </div>
      <div className="libelleChamp">Édicules (cage d’escalier, local technique)</div>
      <div className="puces" role="group" aria-label="Nombre d’édicules">
        {NOMBRES.slice(0, 4).map((n) => <button key={n} type="button" data-controle="vu.edicules" aria-pressed={t.edicules === n}
          onClick={() => poser('edicules', basculer(t.edicules, n))}>{n === 0 ? 'Aucun' : String(n)}</button>)}
      </div>
    </>
  );
}

function Materiaux({ vu, changer }: { vu: Vu; changer: (v: Vu) => void }) {
  return (
    <>
      <div className="libelleChamp">Murs</div>
      <div className="puces" role="group" aria-label="Matériau des murs">
        {MATERIAUX_MURS_VUS.map((m) => <button key={m.code} type="button" data-controle="vu.murs" aria-pressed={vu.murs === m.code}
          onClick={() => changer(avec(vu, 'murs', basculer(vu.murs, m.code)))}>{m.libelle}</button>)}
      </div>
      <div className="libelleChamp">Couverture</div>
      <div className="puces" role="group" aria-label="Matériau de la couverture">
        {COUVERTURES_VUES.map((c) => <button key={c.code} type="button" data-controle="vu.couverture" aria-pressed={vu.couverture === c.code}
          onClick={() => changer(avec(vu, 'couverture', basculer(vu.couverture, c.code)))}>{c.libelle}</button>)}
      </div>
    </>
  );
}

const TOUTES: readonly PartieVue[] = ['toit', 'cheminees', 'terrasse', 'materiaux'];

export function CeQueJeVois({ vu, changer, parties = TOUTES }: Props) {
  return (
    <div className="ceQueJeVois">
      {parties.includes('toit') && <Toit vu={vu} changer={changer} />}
      {parties.includes('cheminees') && <Cheminees vu={vu} changer={changer} />}
      {parties.includes('terrasse') && <Terrasse vu={vu} changer={changer} />}
      {parties.includes('materiaux') && <Materiaux vu={vu} changer={changer} />}
    </div>
  );
}
