// L'onglet « Réglages » du tableau de bord de la consommation (MD/spec-audit.md 13.2 et 13.3).
//
// Les modeles : celui de chaque usage, choisi dans la liste que le serveur admet, avec son prix en
// vigueur ; il vaut pour les envois suivants, une analyse deja lancee garde le sien.
// Les tarifs : la table datee du serveur, en lecture, et un formulaire qui ajoute une ligne datee
// d'aujourd'hui ou plus tard, reprise des prix en vigueur. Seule une ligne a venir se retire : un
// cout d'hier reste celui d'hier (le serveur le refuse aussi, 409). Les plafonds : par defaut et par
// organisation, par jour et par mois, en dollars. Chaque enregistrement est un `PUT` complet, avec
// l'en-tete admin ; le serveur garde la version precedente en `.bak`.

import { useEffect, useState } from 'react';
import { MODELES_CONNUS, nomModele } from '../../model/consommation.js';
import {
  NOMS_PRIX, PRIX, USAGES_REGLABLES, ajouterLigne, erreurPlafonds, ligneProposee, ligneRetirable, lireModeles, lirePlafonds, lireTarifs,
  prixAuMillion, reglageModeles, retirerLigne,
  type ClePrix, type LigneTarif, type ModelesDesUsages, type Plafonds, type ReglageModeles, type Tarifs
} from '../../model/tarifsClaude.js';
import * as fmt from './format.js';

interface PropsReglages {
  aujourdhui: string;
  lireTarifs: () => Promise<unknown>;
  enregistrerTarifs: (t: Tarifs) => Promise<unknown>;
  lirePlafonds: () => Promise<unknown>;
  enregistrerPlafonds: (p: Plafonds) => Promise<unknown>;
  lireModeles: () => Promise<unknown>;
  enregistrerModeles: (r: ReglageModeles) => Promise<unknown>;
}

/** La table des tarifs, lue une fois pour les deux sections qui s'en servent (prix des modeles, tarifs). */
interface EtatTarifs {
  tarifs: Tarifs | null;
  erreur: string | null;
  poser: (t: Tarifs) => void;
}

type Message = { texte: string; erreur?: boolean } | null;

/** Un nombre saisi a la francaise (virgule ou point) ; NaN si ce n'en est pas un. */
const nombre = (v: string): number => (v.trim() === '' ? NaN : Number(v.replace(/\s/g, '').replace(',', '.')));
const ecrit = (x: number): string => (Number.isFinite(x) ? String(x).replace('.', ',') : '');

function Champ({ libelle, valeur, changer, type = 'decimal', id }: { libelle: string; valeur: string; changer: (v: string) => void; type?: 'decimal' | 'date' | 'texte'; id: string }) {
  return (
    <label className="consChamp" htmlFor={id}>
      <span>{libelle}</span>
      <input id={id} type={type === 'date' ? 'date' : 'text'} inputMode={type === 'decimal' ? 'decimal' : undefined} value={valeur} onChange={(e) => changer(e.target.value)} />
    </label>
  );
}

export function Reglages(props: PropsReglages) {
  const [tarifs, setTarifs] = useState<Tarifs | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const { lireTarifs: lire } = props;
  useEffect(() => {
    lire().then((d) => {
      const t = lireTarifs(d);
      if (t) setTarifs(t); else setErreur('La table des tarifs du serveur n’a pas la forme attendue.');
    }, (e: unknown) => setErreur((e as Error).message || String(e)));
  }, [lire]);
  const etat: EtatTarifs = { tarifs, erreur, poser: setTarifs };
  return (
    <div className="consReglages">
      <SectionModeles {...props} tarifs={tarifs} />
      <SectionTarifs {...props} etat={etat} />
      <SectionPlafonds {...props} />
    </div>
  );
}

/** Le libelle d'un modele dans la liste : son nom et son prix d'entree et de sortie en vigueur. */
function libelleModele(t: Tarifs | null, modele: string, jour: string): string {
  const p = prixAuMillion(t, modele, jour);
  const prix = p ? fmt.prix(p.entree) + ' / ' + fmt.prix(p.sortie) : 'tarif inconnu';
  return nomModele(modele) + ' — ' + prix;
}

function SectionModeles({ aujourdhui, lireModeles: lire, enregistrerModeles, tarifs }: PropsReglages & { tarifs: Tarifs | null }) {
  const [lu, setLu] = useState<ModelesDesUsages | null>(null);
  const [choix, setChoix] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<Message>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    lire().then((d) => {
      const m = lireModeles(d);
      if (m) { setLu(m); setChoix(m.usages); } else setMessage({ texte: 'Le réglage des modèles du serveur n’a pas la forme attendue.', erreur: true });
    }, (e: unknown) => setMessage({ texte: (e as Error).message || String(e), erreur: true }));
  }, [lire]);

  if (!lu) return message ? <section className="palSection"><p className="palMessage palMessage--erreur" role="alert">{message.texte}</p></section> : null;
  const modifie = USAGES_REGLABLES.some((u) => choix[u.id] !== lu.usages[u.id]);

  const enregistrer = async () => {
    setEnvoi(true);
    try {
      const m = lireModeles(await enregistrerModeles(reglageModeles(choix)));
      if (m) { setLu(m); setChoix(m.usages); }
      setMessage({ texte: 'Modèles enregistrés. Ils valent pour les prochains envois ; les analyses déjà lancées gardent leur modèle.' });
    } catch (e) {
      setMessage({ texte: (e as Error).message || String(e), erreur: true });
    } finally { setEnvoi(false); }
  };

  return (
    <section className="palSection" aria-labelledby="consTitreModeles">
      <h2 id="consTitreModeles" className="palSectionTitre">Modèles</h2>
      <p className="palIdee">
        Le modèle que le serveur emploie pour chaque usage. Prix en dollars par million de tokens, entrée / sortie, au tarif du jour
        (moitié prix par l’API Batch). Les analyses déjà lancées gardent leur modèle.
      </p>
      {message && <p className={'palMessage' + (message.erreur ? ' palMessage--erreur' : '')} role={message.erreur ? 'alert' : 'status'}>{message.texte}</p>}
      <fieldset className="consFormulaire">
        <legend>Modèle de chaque usage</legend>
        {USAGES_REGLABLES.map((u) => {
          const actuel = choix[u.id] ?? '';
          // Un modele en place mais plus admis reste affiche : le serveur l'a deja remplace par le defaut.
          const options = lu.admis.includes(actuel) || !actuel ? lu.admis : [actuel, ...lu.admis];
          const defaut = lu.defaut[u.id];
          return (
            <label key={u.id} className="consChamp" htmlFor={'consModele-' + u.id}>
              <span>{u.libelle}</span>
              <select id={'consModele-' + u.id} name={'modele-' + u.id} value={actuel} onChange={(e) => setChoix((c) => ({ ...c, [u.id]: e.target.value }))}>
                {options.map((m) => <option key={m} value={m}>{libelleModele(tarifs, m, aujourdhui) + (m === defaut ? ' (par défaut)' : '')}</option>)}
              </select>
            </label>
          );
        })}
      </fieldset>
      <div className="consFormulaireActions">
        <button type="button" disabled={envoi || !modifie} onClick={() => void enregistrer()}>Enregistrer les modèles</button>
      </div>
    </section>
  );
}

function SectionTarifs({ aujourdhui, enregistrerTarifs, etat }: PropsReglages & { etat: EtatTarifs }) {
  const { tarifs, poser: setTarifs } = etat;
  const [message, setMessage] = useState<Message>(etat.erreur ? { texte: etat.erreur, erreur: true } : null);
  const [modele, setModele] = useState(MODELES_CONNUS[0]?.id ?? 'claude-haiku-5-5');
  const [saisie, setSaisie] = useState<Record<string, string> | null>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => { if (etat.erreur) setMessage({ texte: etat.erreur, erreur: true }); }, [etat.erreur]);

  // La saisie repart des prix en vigueur du modele choisi, a chaque changement de modele.
  useEffect(() => {
    if (!tarifs) return;
    const l = ligneProposee(tarifs, modele, aujourdhui);
    const s: Record<string, string> = { depuis: l.depuis, verifieLe: l.verifieLe, remiseBatch: ecrit(l.remiseBatch), source: l.source ?? '' };
    for (const k of PRIX) s[k] = ecrit(l[k]);
    if (l.auDela) { s.seuil = String(l.auDela.seuil); for (const k of PRIX) s['auDela.' + k] = ecrit(l.auDela[k]); }
    setSaisie(s);
  }, [tarifs, modele, aujourdhui]);

  const enregistrer = async (t: Tarifs, reussite: string) => {
    setEnvoi(true);
    try {
      const d = lireTarifs(await enregistrerTarifs(t));
      setTarifs(d ?? t);
      setMessage({ texte: reussite });
    } catch (e) {
      setMessage({ texte: (e as Error).message || String(e), erreur: true });
    } finally { setEnvoi(false); }
  };

  const ajouter = () => {
    if (!tarifs || !saisie) return;
    const prix = Object.fromEntries(PRIX.map((k) => [k, nombre(saisie[k] ?? '')])) as Record<ClePrix, number>;
    const ligne: LigneTarif = { modele, depuis: saisie.depuis ?? '', verifieLe: saisie.verifieLe ?? '', ...prix, remiseBatch: nombre(saisie.remiseBatch ?? '') };
    if (saisie.source) ligne.source = saisie.source;
    if (saisie.seuil !== undefined) {
      ligne.auDela = { seuil: nombre(saisie.seuil), ...(Object.fromEntries(PRIX.map((k) => [k, nombre(saisie['auDela.' + k] ?? '')])) as Record<ClePrix, number>) };
    }
    const r = ajouterLigne(tarifs, ligne, aujourdhui);
    if ('erreur' in r) { setMessage({ texte: r.erreur, erreur: true }); return; }
    void enregistrer(r.tarifs, 'Tarif de ' + nomModele(modele) + ' ajouté, en vigueur à partir du ' + fmt.date(ligne.depuis) + '.');
  };

  const modeles = [...new Set([...MODELES_CONNUS.map((m) => m.id), ...(tarifs?.lignes.map((l) => l.modele) ?? [])])];
  const lignes = tarifs ? [...tarifs.lignes].sort((a, b) => a.modele.localeCompare(b.modele) || (a.depuis < b.depuis ? 1 : -1)) : [];
  const changer = (k: string) => (v: string) => setSaisie((s) => ({ ...(s ?? {}), [k]: v }));

  return (
    <section className="palSection" aria-labelledby="consTitreTarifs">
      <h2 id="consTitreTarifs" className="palSectionTitre">Tarifs</h2>
      <p className="palIdee">En dollars par million de tokens. Un changement de prix ajoute une ligne datée : un coût d’hier reste celui d’hier. Vérifiez les prix sur la page officielle d’Anthropic et notez la date de vérification.</p>
      {message && <p className={'palMessage' + (message.erreur ? ' palMessage--erreur' : '')} role={message.erreur ? 'alert' : 'status'}>{message.texte}</p>}
      {tarifs && (
        <div className="consTableau">
          <table className="attrTable consTable">
            <thead>
              <tr><th scope="col">Modèle</th><th scope="col">Depuis</th><th scope="col">Vérifié le</th>{PRIX.map((k) => <th key={k} scope="col" className="num">{NOMS_PRIX[k]}</th>)}<th scope="col" className="num">Remise Batch</th><th scope="col">Palier</th><th scope="col"><span className="consCache">Action</span></th></tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.modele + l.depuis}>
                  <td>{nomModele(l.modele)}</td><td>{fmt.date(l.depuis)}</td><td>{fmt.date(l.verifieLe)}</td>
                  {PRIX.map((k) => <td key={k} className="num">{ecrit(l[k])}</td>)}
                  <td className="num">× {ecrit(l.remiseBatch)}</td>
                  <td>{l.auDela ? 'au-delà de ' + fmt.tokens(l.auDela.seuil) + ' tokens' : '—'}</td>
                  <td>{ligneRetirable(l, aujourdhui) ? <button type="button" className="small secondary" disabled={envoi} onClick={() => void enregistrer(retirerLigne(tarifs, l, aujourdhui), 'Tarif à venir retiré.')}>Retirer</button> : <span className="consNote">en vigueur ou passé</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {tarifs && saisie && (
        <fieldset className="consFormulaire">
          <legend>Ajouter un tarif daté</legend>
          <label className="consChamp" htmlFor="consTarifModele">
            <span>Modèle</span>
            <select id="consTarifModele" value={modele} onChange={(e) => setModele(e.target.value)}>
              {modeles.map((m) => <option key={m} value={m}>{nomModele(m)}</option>)}
            </select>
          </label>
          <Champ id="consTarifDepuis" libelle="En vigueur depuis" type="date" valeur={saisie.depuis ?? ''} changer={changer('depuis')} />
          <Champ id="consTarifVerifie" libelle="Vérifié le" type="date" valeur={saisie.verifieLe ?? ''} changer={changer('verifieLe')} />
          {PRIX.map((k) => <Champ key={k} id={'consTarif-' + k} libelle={NOMS_PRIX[k]} valeur={saisie[k] ?? ''} changer={changer(k)} />)}
          <Champ id="consTarifRemise" libelle="Remise Batch (coefficient)" valeur={saisie.remiseBatch ?? ''} changer={changer('remiseBatch')} />
          {saisie.seuil !== undefined && (
            <>
              <Champ id="consTarifSeuil" libelle="Palier : au-delà de (tokens)" valeur={saisie.seuil} changer={changer('seuil')} />
              {PRIX.map((k) => <Champ key={k} id={'consTarifAuDela-' + k} libelle={'Palier : ' + NOMS_PRIX[k].toLowerCase()} valeur={saisie['auDela.' + k] ?? ''} changer={changer('auDela.' + k)} />)}
            </>
          )}
          <Champ id="consTarifSource" libelle="Source" type="texte" valeur={saisie.source ?? ''} changer={changer('source')} />
          <div className="consFormulaireActions">
            <button type="button" disabled={envoi} onClick={ajouter}>Ajouter ce tarif</button>
          </div>
        </fieldset>
      )}
    </section>
  );
}

interface SaisiePlafonds { defautJour: string; defautMois: string; organisations: { id: string; jour: string; mois: string }[]; requetesParBatch: string; estimationRequete: string }

const versSaisie = (p: Plafonds): SaisiePlafonds => ({
  defautJour: ecrit(p.defaut.jour), defautMois: ecrit(p.defaut.mois),
  organisations: Object.entries(p.organisations).map(([id, o]) => ({ id, jour: ecrit(o.jour), mois: ecrit(o.mois) })),
  requetesParBatch: String(p.requetesParBatch), estimationRequete: ecrit(p.estimationRequete)
});

function SectionPlafonds({ lirePlafonds: lire, enregistrerPlafonds }: PropsReglages) {
  const [saisie, setSaisie] = useState<SaisiePlafonds | null>(null);
  const [message, setMessage] = useState<Message>(null);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    lire().then((d) => {
      const p = lirePlafonds(d);
      if (p) setSaisie(versSaisie(p)); else setMessage({ texte: 'Les plafonds du serveur n’ont pas la forme attendue.', erreur: true });
    }, (e: unknown) => setMessage({ texte: (e as Error).message || String(e), erreur: true }));
  }, [lire]);

  if (!saisie) return message ? <section className="palSection"><p className={'palMessage palMessage--erreur'} role="alert">{message.texte}</p></section> : null;
  const maj = (m: Partial<SaisiePlafonds>) => setSaisie({ ...saisie, ...m });
  const majOrg = (i: number, m: Partial<SaisiePlafonds['organisations'][number]>) => maj({ organisations: saisie.organisations.map((o, j) => (j === i ? { ...o, ...m } : o)) });

  const enregistrer = async () => {
    const p: Plafonds = {
      format: 'plan-claude-plafonds',
      defaut: { jour: nombre(saisie.defautJour), mois: nombre(saisie.defautMois) },
      organisations: Object.fromEntries(saisie.organisations.map((o) => [o.id.trim(), { jour: nombre(o.jour), mois: nombre(o.mois) }])),
      requetesParBatch: nombre(saisie.requetesParBatch),
      estimationRequete: nombre(saisie.estimationRequete)
    };
    if (new Set(saisie.organisations.map((o) => o.id.trim())).size !== saisie.organisations.length) { setMessage({ texte: 'Une organisation figure deux fois.', erreur: true }); return; }
    const e = erreurPlafonds(p);
    if (e) { setMessage({ texte: e, erreur: true }); return; }
    setEnvoi(true);
    try {
      const d = lirePlafonds(await enregistrerPlafonds(p));
      setSaisie(versSaisie(d ?? p));
      setMessage({ texte: 'Plafonds enregistrés.' });
    } catch (err) {
      setMessage({ texte: (err as Error).message || String(err), erreur: true });
    } finally { setEnvoi(false); }
  };

  return (
    <section className="palSection" aria-labelledby="consTitrePlafonds">
      <h2 id="consTitrePlafonds" className="palSectionTitre">Plafonds</h2>
      <p className="palIdee">En dollars. Le serveur refuse un batch qui dépasserait le plafond du jour ou du mois, en comptant les batches encore en cours. Une organisation sans plafond propre suit celui par défaut.</p>
      {message && <p className={'palMessage' + (message.erreur ? ' palMessage--erreur' : '')} role={message.erreur ? 'alert' : 'status'}>{message.texte}</p>}
      <fieldset className="consFormulaire">
        <legend>Par défaut</legend>
        <Champ id="consPlafondJour" libelle="Par jour ($)" valeur={saisie.defautJour} changer={(v) => maj({ defautJour: v })} />
        <Champ id="consPlafondMois" libelle="Par mois ($)" valeur={saisie.defautMois} changer={(v) => maj({ defautMois: v })} />
        <Champ id="consRequetes" libelle="Requêtes par batch (au plus)" valeur={saisie.requetesParBatch} changer={(v) => maj({ requetesParBatch: v })} />
        <Champ id="consEstimation" libelle="Estimation par requête ($)" valeur={saisie.estimationRequete} changer={(v) => maj({ estimationRequete: v })} />
      </fieldset>
      <fieldset className="consFormulaire">
        <legend>Par organisation</legend>
        {saisie.organisations.length === 0 && <p className="hint">Aucune organisation n’a de plafond propre.</p>}
        {saisie.organisations.map((o, i) => (
          <div key={i} className="consLigneOrganisation" role="group" aria-label={'Organisation ' + (o.id || (i + 1))}>
            <Champ id={'consOrg-' + i} libelle="Organisation" type="texte" valeur={o.id} changer={(v) => majOrg(i, { id: v })} />
            <Champ id={'consOrgJour-' + i} libelle="Par jour ($)" valeur={o.jour} changer={(v) => majOrg(i, { jour: v })} />
            <Champ id={'consOrgMois-' + i} libelle="Par mois ($)" valeur={o.mois} changer={(v) => majOrg(i, { mois: v })} />
            <button type="button" className="small secondary" onClick={() => maj({ organisations: saisie.organisations.filter((_, j) => j !== i) })}>Retirer</button>
          </div>
        ))}
        <div className="consFormulaireActions">
          <button type="button" className="secondary" onClick={() => maj({ organisations: [...saisie.organisations, { id: '', jour: saisie.defautJour, mois: saisie.defautMois }] })}>Ajouter une organisation</button>
        </div>
      </fieldset>
      <div className="consFormulaireActions">
        <button type="button" disabled={envoi} onClick={() => void enregistrer()}>Enregistrer les plafonds</button>
      </div>
    </section>
  );
}
