// Les poids de la reconciliation dans Admin › Regles (MD/spec-reconciliation.md) : ceux des sources et ceux que chaque attribut leur
// donne, a la main (un champ par poids, qui ecrit sa seule ligne du fichier) ou recales sur les audits recus (la justesse de chaque
// source, mesuree sur ce que la personne a garde). Rien ne s'ecrit sans passer par le brouillon du fichier : le diff le montre, le
// fichier se telecharge et entre dans le depot par une PR.

import { useMemo, useState } from 'react';
import { ATTRIBUTS, SOURCES, lireReconciliation, type ReglesReconciliation, type SourceConstat } from '../../regles/reconciliation.js';
import { changerPoids, type CiblePoids } from '../../regles/donnees/edition.js';

/** Un poids que les audits recus proposent de changer. */
export interface PoidsPropose { attribut: string; source: SourceConstat; actuel: number; propose: number; taux: number; decisions: number }
export interface ResultatPoids { audits: number; ignores: number; propositions: PoidsPropose[] }
/** Lit des fichiers d'audit (leur texte) et dit les poids a changer, d'apres les regles du brouillon. */
export type ProposerPoids = (textes: string[], regles: ReglesReconciliation) => ResultatPoids;

export interface PropsPoids {
  texte: string;
  livre: string;
  surTexte: (t: string, remonter: boolean) => void;
  cle: number;
  proposer?: ProposerPoids | undefined;
}

const fr = (v: number): string => String(v).replace('.', ',');
const pct = (x: number): string => Math.round(x * 100) + ' %';
const lire = (t: string): ReglesReconciliation | null => { try { return lireReconciliation(JSON.parse(t)); } catch { return null; } };

export function Poids({ texte, livre, surTexte, cle, proposer }: PropsPoids) {
  const regles = useMemo(() => lire(texte), [texte]);
  const livrees = useMemo(() => lire(livre), [livre]);
  const [auto, setAuto] = useState<ResultatPoids | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  if (!regles) return <p className="consNote">Les poids reviennent quand le fichier redevient lisible par le moteur.</p>;

  const poser = (cible: CiblePoids, valeur: number | null, remonter = false): string | null => {
    const neuf = changerPoids(texte, cible, valeur);
    if (neuf === null) { setErreur('Ce poids ne tient pas sur une ligne du fichier : modifiez-le dans le texte du fichier, plus bas.'); return null; }
    setErreur(null);
    surTexte(neuf, remonter);
    return neuf;
  };
  const surChamp = (cible: CiblePoids, brut: string) => {
    if (brut.trim() === '') { if (cible.attribut) poser(cible, null); return; }
    const v = Number(brut.replace(',', '.'));
    if (Number.isFinite(v) && v >= 0 && v <= 100) poser(cible, v);
  };
  const appliquer = (liste: readonly PoidsPropose[]) => {
    let t = texte;
    for (const p of liste) { const n = changerPoids(t, { attribut: p.attribut, source: p.source }, p.propose); if (n !== null) t = n; }
    if (t !== texte) surTexte(t, true);
    setAuto((a) => (a ? { ...a, propositions: a.propositions.filter((p) => !liste.includes(p)) } : a));
  };
  const lireAudits = async (fichiers: FileList | null) => {
    if (!fichiers?.length || !proposer) return;
    setErreur(null);
    try {
      const textes = await Promise.all([...fichiers].map((f) => f.text()));
      setAuto(proposer(textes, regles));
    } catch (e) { setErreur('Lecture impossible : ' + (e as Error).message); }
  };
  const livre0 = (a: string | null, s: SourceConstat): number | undefined => (a ? livrees?.attributs[a as keyof ReglesReconciliation['attributs']]?.poids[s] : livrees?.sources[s].poids);

  return (
    <div className="reglPoids" aria-label="Poids des sources">
      <p className="consNote">
        Chaque constat vaut le poids de sa source fois sa confiance. Un poids laissé vide pour un attribut reprend celui de la source. Changer un poids ne change
        aucune toiture déjà lue : il règle les prochaines propositions de l’audit.
      </p>
      {erreur && <p className="reglErreur" role="alert">{erreur}</p>}
      <div className="defileAudit">
        <table className="attrTable tableAudit" aria-label="Poids par attribut">
          <thead><tr><th>Attribut</th>{SOURCES.map((s) => <th key={s}>{regles.sources[s].libelle}</th>)}</tr></thead>
          <tbody>
            <tr data-poids="sources">
              <td><strong>Poids de la source</strong><div className="detailPhoto">Par défaut, pour tout attribut</div></td>
              {SOURCES.map((s) => {
                const modifie = livre0(null, s) !== regles.sources[s].poids;
                return <td key={s + ':' + cle} data-source={s}>
                  <input type="number" step="0.1" min="0" max="100" className="reglValeur" aria-label={'Poids de ' + regles.sources[s].libelle} defaultValue={regles.sources[s].poids} onChange={(e) => surChamp({ source: s }, e.target.value)} />
                  {modifie && <span className="reglBadge reglModifie"> Modifié</span>}
                </td>;
              })}
            </tr>
            {ATTRIBUTS.map((a) => (
              <tr key={a} data-attribut={a}>
                <td>{regles.attributs[a].libelle}<div className="detailPhoto"><code>{a}</code></div></td>
                {SOURCES.map((s) => {
                  const propre = regles.attributs[a].poids[s];
                  const modifie = livre0(a, s) !== propre;
                  return <td key={s + ':' + cle} data-source={s}>
                    <input type="number" step="0.1" min="0" max="100" className="reglValeur" placeholder={fr(regles.sources[s].poids)} aria-label={'Poids de ' + regles.sources[s].libelle + ' pour ' + regles.attributs[a].libelle}
                      defaultValue={propre ?? ''} onChange={(e) => surChamp({ attribut: a, source: s }, e.target.value)} />
                    {modifie && <span className="reglBadge reglModifie"> Modifié</span>}
                  </td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {proposer && <div className="reglPoidsAuto">
        <strong>Recaler sur les audits reçus</strong>
        <p className="consNote">
          Choisissez des fichiers d’audit (Admin › Audits les télécharge). Pour chaque source et chaque attribut, Plan compte les fois où sa valeur est celle que la personne a gardée :
          une source souvent juste pèse plus, une source souvent écartée pèse moins (au plus de moitié, au dixième). Ce que la personne a vu sur place n’est jamais recalé.
        </p>
        <label className="reglChamp">
          <span className="reglChampNom">Fichiers d’audit (.json)</span>
          <input type="file" accept="application/json,.json" multiple aria-label="Fichiers d’audit à lire" onChange={(e) => { void lireAudits(e.target.files); e.target.value = ''; }} />
        </label>
        {auto && <div role="status" aria-label="Poids proposés">
          <p className="consNote">{auto.audits} audit{auto.audits > 1 ? 's' : ''} lu{auto.audits > 1 ? 's' : ''}{auto.ignores ? ', ' + auto.ignores + ' fichier' + (auto.ignores > 1 ? 's' : '') + ' ignoré' + (auto.ignores > 1 ? 's' : '') : ''}.
            {auto.propositions.length ? '' : ' Aucun poids à changer : trop peu de décisions lues, ou des poids déjà justes.'}</p>
          {auto.propositions.length > 0 && <>
            <table className="attrTable tableAudit" aria-label="Poids proposés">
              <thead><tr><th>Attribut</th><th>Source</th><th>Actuel</th><th>Proposé</th><th>Justesse</th><th /></tr></thead>
              <tbody>{auto.propositions.map((p) => (
                <tr key={p.attribut + p.source} data-attribut={p.attribut} data-source={p.source}>
                  <td>{regles.attributs[p.attribut as keyof ReglesReconciliation['attributs']]?.libelle ?? p.attribut}</td>
                  <td>{regles.sources[p.source].libelle}</td>
                  <td>{fr(p.actuel)}</td><td><strong>{fr(p.propose)}</strong></td>
                  <td>{pct(p.taux)} sur {p.decisions} décisions</td>
                  <td><button type="button" className="secondary small" onClick={() => appliquer([p])}>Appliquer</button></td>
                </tr>
              ))}</tbody>
            </table>
            <div className="reglActionsSujet"><button type="button" className="secondary small" onClick={() => appliquer(auto.propositions)}>Tout appliquer</button></div>
          </>}
        </div>}
      </div>}
    </div>
  );
}
