// L'ecran Admin › Regles (`?admin&ecran=regles`, MD/architecture.md §5.2.4) : les sujets que l'audit sait
// lire et proposer, et le prompt et le schema que Claude recoit, recalcules en direct a chaque frappe.
//
// Un ecran de l'admin, sur toute la page, comme la conformite. Il montre :
//   - les sujets (src/regles/sujets/) : ce que chacun lit, s'il propose au projet (et ce qu'il ecrit, et
//     l'accord mesure de Claude) ou s'il observe seulement ; on peut en exclure un du prompt, editer ses
//     textes et son schema, ou en ajouter un en brouillon ;
//   - le resultat : le prompt, le schema, ce qui change par rapport au livre, les controles.
// L'ecran EXPLORE : ce qui est bon se telecharge (le module du sujet, ou les deux fichiers) et entre dans
// le depot par une PR (`npm run regles:generer`). Le brouillon reste dans ce navigateur, pour ne pas perdre
// une edition en cours ; « Enregistrer sur le serveur » le garde en plus cote serveur (admin/claude/regles),
// ou une analyse (`?regles=local`) et un rejeu d'Admin › Audits peuvent partir avec son prompt AVANT la PR.
// Le prompt livre n'est jamais remplace : seule une demande de l'administrateur qui le nomme le lit.

import { useEffect, useMemo, useRef, useState } from 'react';
import { controler, diffLignes, estimerTokens, insererAvantLaFin, lignesModifiees, remplacerSujet } from '../regles/sujets/edition.js';
import { genererFichiers } from '../regles/sujets/generation.js';
import type { DescriptionSujet } from '../regles/sujets/description.js';
import type { Sujet } from '../app/regles/sujets/contrat.js';
import { EditeurSujet } from './regles/EditeurSujet.js';
import { NouveauSujet } from './regles/NouveauSujet.js';
import { Resultat, type Onglet } from './regles/Resultat.js';
import type { BrouillonReglesServeur, ClientRegles } from '../io/reglesServeur.js';
import type { BrouillonServeur } from '../io/analyseClaude.js';

export interface BrouillonRegles { lire(): string | null; ecrire(texte: string): void; effacer(): void }

export interface PropsEcranRegles {
  /** Les sujets tels que le depot les livre. */
  sujets: readonly DescriptionSujet[];
  /** Ce que l'audit sait proposer, apparie aux sujets par le meme `id`. */
  proposeurs: readonly Pick<Sujet, 'id' | 'attribut' | 'effet'>[];
  /** Le taux d'accord de Claude mesure par attribut ; absent : pas encore mesure. */
  accords: Readonly<Partial<Record<string, number>>>;
  brouillon?: BrouillonRegles;
  /** Le brouillon sur le serveur ; absent : l'ecran n'enregistre qu'ici (tests, pas de session d'administrateur). */
  serveur?: ClientRegles;
  telecharger: (nom: string, contenu: string, type: string) => void;
  copier: (texte: string) => Promise<void>;
  retour?: string;
}

interface Etat { liste: DescriptionSujet[]; exclus: string[] }

/** Le brouillon relu : une liste de sujets qui ont au moins un identifiant et des champs ; sinon on repart du livre. */
function lireBrouillon(texte: string | null, livre: readonly DescriptionSujet[]): Etat {
  const neuf: Etat = { liste: [...livre], exclus: [] };
  if (!texte) return neuf;
  try {
    const d = JSON.parse(texte) as { liste?: unknown; exclus?: unknown };
    if (!Array.isArray(d.liste) || !d.liste.every((s) => s && typeof s === 'object' && typeof (s as { id?: unknown }).id === 'string' && typeof (s as { champs?: unknown }).champs === 'object')) return neuf;
    return { liste: d.liste as DescriptionSujet[], exclus: Array.isArray(d.exclus) ? d.exclus.filter((x): x is string => typeof x === 'string') : [] };
  } catch { return neuf; }
}

const pluriel = (n: number, mot: string) => n + ' ' + mot + (n > 1 ? 's' : '');
const quand = (iso: string | null) => (iso ?? '?').slice(0, 16).replace('T', ' ');

export function EcranRegles(props: PropsEcranRegles) {
  const { sujets: livres, proposeurs, accords, brouillon, serveur, telecharger, copier, retour = '?admin' } = props;
  const [etat, setEtat] = useState<Etat>(() => lireBrouillon(brouillon?.lire() ?? null, livres));
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [onglet, setOnglet] = useState<Onglet>('prompt');
  const [nouveau, setNouveau] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  // Le brouillon du serveur : `undefined` tant qu'on ne l'a pas lu, `null` quand il n'y en a pas.
  const [surServeur, setSurServeur] = useState<BrouillonReglesServeur | null | undefined>(serveur ? undefined : null);
  const [occupe, setOccupe] = useState(false);
  const { liste, exclus } = etat;
  const monte = useRef(true);
  useEffect(() => () => { monte.current = false; }, []);
  useEffect(() => {
    if (!serveur) return;
    serveur.lire().then((b) => { if (monte.current) setSurServeur(b); }, (e: Error) => { if (monte.current) { setSurServeur(null); setMessage('Le brouillon du serveur n’a pas pu être lu : ' + e.message); } });
  }, [serveur]);

  // Le brouillon suit l'edition ; revenu au livre, il n'y a plus rien a garder.
  useEffect(() => {
    try {
      if (!etat.exclus.length && JSON.stringify(etat.liste) === JSON.stringify(livres)) brouillon?.effacer();
      else brouillon?.ecrire(JSON.stringify(etat));
    } catch { /* sans stockage : l'edition reste a l'ecran */ }
  }, [etat, brouillon, livres]);

  const livre = useMemo(() => genererFichiers(livres), [livres]);
  const actifs = useMemo(() => liste.filter((s) => !exclus.includes(s.id)), [liste, exclus]);
  const sortie = useMemo(() => {
    const brut = genererFichiers(actifs);
    const promptChange = brut.corpsPrompt !== livre.corpsPrompt;
    const schemaChange = JSON.stringify(JSON.parse(brut.schema)) !== JSON.stringify(JSON.parse(livre.schema));
    // Un texte change monte la version (regles/sujets/versions.ts) : l'ecran dit laquelle, et la met dans l'en-tete.
    return genererFichiers(actifs, { prompt: livre.versionPrompt + (promptChange ? 1 : 0), schema: livre.versionSchema + (schemaChange ? 1 : 0) });
  }, [actifs, livre]);
  const controles = useMemo(() => controler(actifs), [actifs]);
  const diffPrompt = useMemo(() => diffLignes(livre.prompt, sortie.prompt), [livre, sortie]);
  const diffSchema = useMemo(() => diffLignes(livre.schema, sortie.schema), [livre, sortie]);
  const erreurs = controles.filter((c) => c.niveau === 'erreur').length;
  const alertes = controles.filter((c) => c.niveau === 'alerte').length;
  // Les lignes du corps seulement : l'en-tete change avec la version, ce n'est pas un changement de texte.
  const changees = lignesModifiees(diffLignes(livre.corpsPrompt, sortie.corpsPrompt));
  const champs = actifs.reduce((n, s) => n + Object.keys(s.champs).length, 0);
  const identique = diffPrompt.every((l) => l.type === '=') && diffSchema.every((l) => l.type === '=');
  const brouillons = liste.filter((s) => !livres.some((l) => l.id === s.id));
  const raisonFichiers = erreurs ? 'Corrigez les erreurs des contrôles : un prompt invalide ne s’écrit pas.' : null;

  const modifie = (s: DescriptionSujet): boolean => { const l = livres.find((x) => x.id === s.id); return !!l && JSON.stringify(l) !== JSON.stringify(s); };
  const remplacer = (s: DescriptionSujet) => setEtat((e) => ({ ...e, liste: remplacerSujet(e.liste, s.id, () => s) }));
  const basculer = (id: string) => setEtat((e) => ({ ...e, exclus: e.exclus.includes(id) ? e.exclus.filter((x) => x !== id) : [...e.exclus, id] }));
  const toutRevenir = () => { setEtat({ liste: [...livres], exclus: [] }); setOuvert(null); setMessage('Retour au prompt et au schéma du dépôt.'); try { brouillon?.effacer(); } catch { /* rien a effacer */ } };

  /** Garde sur le serveur le prompt et le schema recalcules, et l'etat de l'editeur qui les produit. */
  const enregistrerSurServeur = () => {
    if (!serveur) return;
    setOccupe(true);
    serveur.enregistrer({ prompt: sortie.prompt, schema: sortie.schema, etat }).then((b: BrouillonServeur) => {
      if (!monte.current) return;
      setSurServeur({ ...b, promptTexte: sortie.prompt, schemaTexte: sortie.schema, etat });
      setMessage('Brouillon enregistré sur le serveur (prompt version ' + b.prompt + '). Essayez-le : ouvrez le plan avec ?regles=local, ou « Rejouer avec le brouillon » dans Admin › Audits.');
    }, (e: Error) => { if (monte.current) setMessage('Enregistrement impossible : ' + e.message); }).finally(() => { if (monte.current) setOccupe(false); });
  };
  const reprendreDuServeur = () => {
    const e = surServeur?.etat;
    const relu = e ? lireBrouillon(JSON.stringify(e), livres) : null;
    if (!relu || !surServeur) return;
    setEtat(relu);
    setOuvert(null);
    setMessage('Brouillon du serveur repris (enregistré le ' + quand(surServeur.enregistreLe) + ').');
  };
  const retirerDuServeur = () => {
    if (!serveur) return;
    setOccupe(true);
    serveur.retirer().then(() => { if (monte.current) { setSurServeur(null); setMessage('Brouillon retiré du serveur : les analyses repartent avec le prompt livré.'); } },
      (e: Error) => { if (monte.current) setMessage('Retrait impossible : ' + e.message); }).finally(() => { if (monte.current) setOccupe(false); });
  };

  const copierPrompt = () => { copier(sortie.prompt).then(() => setMessage('Prompt copié.'), () => setMessage('Copie impossible : sélectionnez le texte à la main.')); };

  return (
    <div className="consEcran reglEcran">
      <header className="consEntete">
        <a className="ecranRetour" href={retour}><span aria-hidden="true">←</span> Retour au plan</a>
        <h1 className="palTitre">Règles</h1>
        <p className="palSous">
          Les sujets que l’audit sait lire, et le prompt et le schéma que Claude reçoit, recalculés à chaque frappe. « Enregistrer sur le
          serveur » garde le brouillon pour l’essayer (<code>?regles=local</code>, ou un rejeu dans Admin › Audits) sans toucher au prompt livré :
          ce qui est bon se télécharge et entre dans le dépôt par une PR (<code>npm run regles:generer</code>). Visible de l’administrateur seulement.
        </p>
      </header>

      <div className="consTuiles" aria-label="Chiffres clés">
        <div className="consTuile"><span className="consTuileTitre">Sujets</span><span className="consTuileValeur">{actifs.length} / {liste.length}</span>
          <span className="consTuileNote">{brouillons.length ? pluriel(brouillons.length, 'brouillon') : 'dans le dépôt'}</span></div>
        <div className="consTuile"><span className="consTuileTitre">Prompt</span><span className="consTuileValeur">≈ {estimerTokens(sortie.prompt).toLocaleString('fr-FR')} tokens</span>
          <span className="consTuileNote">{sortie.prompt.length.toLocaleString('fr-FR')} caractères · version {sortie.versionPrompt}</span></div>
        <div className="consTuile"><span className="consTuileTitre">Schéma</span><span className="consTuileValeur">{pluriel(champs, 'champ')}</span>
          <span className="consTuileNote">version {sortie.versionSchema}</span></div>
        <div className="consTuile"><span className="consTuileTitre">Contrôles</span><span className="consTuileValeur">{pluriel(erreurs, 'erreur')}</span>
          <span className="consTuileNote">{pluriel(alertes, 'alerte')}</span></div>
        <div className="consTuile"><span className="consTuileTitre">Par rapport au livré</span>
          <span className="consTuileValeur">{identique ? 'Identique' : pluriel(Math.max(changees, 1), 'ligne') + ' change' + (changees > 1 ? 'nt' : '')}</span>
          <span className="consTuileNote">{identique ? 'prompt v' + livre.versionPrompt + ', schéma v' + livre.versionSchema : 'version ' + sortie.versionPrompt + ' à poser dans versions.ts'}</span></div>
      </div>

      <div className="consFiltres" role="group" aria-label="Actions">
        <button type="button" onClick={() => { setNouveau(true); setOuvert(null); }}>Nouveau sujet</button>
        <button type="button" className="secondary" onClick={copierPrompt}>Copier le prompt</button>
        <button type="button" className="secondary" disabled={raisonFichiers !== null} title={raisonFichiers ?? 'prompt-analyse.md tel que le serveur le lirait'} onClick={() => telecharger('prompt-analyse.md', sortie.prompt, 'text/markdown')}>Télécharger le prompt</button>
        <button type="button" className="secondary" disabled={raisonFichiers !== null} title={raisonFichiers ?? 'schema-analyse.json tel que le serveur le lirait'} onClick={() => telecharger('schema-analyse.json', sortie.schema, 'application/json')}>Télécharger le schéma</button>
        <button type="button" className="secondary" disabled={identique && !exclus.length} onClick={toutRevenir}>Revenir au livré</button>
        {serveur && <>
          <button type="button" data-controle="regles.enregistrerServeur" disabled={occupe || erreurs > 0 || (identique && !exclus.length)}
            title={erreurs ? raisonFichiers ?? undefined : identique && !exclus.length ? 'Rien ne diffère du livré : il n’y a rien à essayer.' : 'Garde le prompt et le schéma sur le serveur, pour une analyse ou un rejeu d’essai'}
            onClick={enregistrerSurServeur}>Enregistrer sur le serveur</button>
          <button type="button" className="secondary" data-controle="regles.reprendreServeur" disabled={occupe || !surServeur || !surServeur.etat} onClick={reprendreDuServeur}>Reprendre celui du serveur</button>
          <button type="button" className="secondary" data-controle="regles.retirerServeur" disabled={occupe || !surServeur} onClick={retirerDuServeur}>Retirer du serveur</button>
        </>}
        <span className="consEtat" role="status">{message ?? ''}</span>
      </div>
      {raisonFichiers && <p className="consNote confRaison">{raisonFichiers}</p>}
      {serveur && <p className="consNote" role="status" data-controle="regles.etatServeur">
        {surServeur === undefined ? 'Lecture du brouillon du serveur…'
          : surServeur ? 'Brouillon du serveur : prompt version ' + surServeur.prompt + ', schéma version ' + surServeur.schema + ', enregistré le ' + quand(surServeur.enregistreLe) + '. Ouvrez le plan avec ?regles=local pour qu’une analyse parte avec lui.'
          : 'Aucun brouillon sur le serveur : les analyses partent avec le prompt livré.'}
      </p>}

      <div className="reglCorps">
        <section className="reglSujets" aria-label="Sujets">
          {nouveau && <NouveauSujet existants={liste} surAnnuler={() => setNouveau(false)}
            surAjout={(s) => { setEtat((e) => ({ ...e, liste: insererAvantLaFin(e.liste, s) })); setNouveau(false); setOuvert(s.id); setMessage('Brouillon « ' + s.libelle + ' » ajouté : il est dans le prompt et le schéma ci-contre.'); }} />}
          <ul className="reglListe">
            {liste.map((s) => {
              const exclu = exclus.includes(s.id);
              const brouillonDuSujet = !livres.some((l) => l.id === s.id);
              const propose = proposeurs.find((p) => p.id === s.id);
              return (
                <li key={s.id} className="reglSujet" data-sujet={s.id} data-exclu={exclu ? 'oui' : undefined}>
                  <div className="reglSujetEntete">
                    <label className="reglInclure">
                      <input type="checkbox" checked={!exclu} onChange={() => basculer(s.id)} aria-label={'Dans le prompt : ' + s.libelle} />
                      <strong>{s.libelle}</strong> <code>{s.id}</code>
                    </label>
                    <span className="reglBadges">
                      {propose ? <span className="reglBadge">Propose · écrit <code>{propose.effet}</code> · accord {propose.attribut && accords[propose.attribut] !== undefined ? Math.round((accords[propose.attribut] ?? 0) * 100) + ' %' : 'non mesuré'}</span>
                        : <span className="reglBadge">{brouillonDuSujet ? 'Brouillon · observation seule' : 'Observation seule'}</span>}
                      {brouillonDuSujet && propose && <span className="reglBadge">Brouillon</span>}
                      {modifie(s) && <span className="reglBadge reglModifie">Modifié</span>}
                      {exclu && <span className="reglBadge">Hors du prompt</span>}
                    </span>
                    <button type="button" className="secondary small" aria-expanded={ouvert === s.id} onClick={() => { setOuvert(ouvert === s.id ? null : s.id); setNouveau(false); }}>
                      {ouvert === s.id ? 'Fermer' : 'Modifier'}
                    </button>
                  </div>
                  <p className="consNote reglResume">
                    {pluriel(Object.keys(s.champs).length, 'champ')} · {pluriel(s.consignes.length, 'consigne')} · {pluriel(s.vocabulaire.length, 'entrée')} de vocabulaire
                    {s.confusions.length ? ' · ' + pluriel(s.confusions.length, 'confusion') : ''}
                  </p>
                  {ouvert === s.id && (
                    <EditeurSujet sujet={s} livre={livres.find((l) => l.id === s.id)} surChangement={remplacer} telecharger={telecharger}
                      surRetour={brouillonDuSujet ? () => { setEtat((e) => ({ liste: e.liste.filter((x) => x.id !== s.id), exclus: e.exclus.filter((x) => x !== s.id) })); setOuvert(null); } : undefined} />
                  )}
                </li>
              );
            })}
          </ul>
        </section>

        <section className="reglResultat" aria-label="Résultat">
          <Resultat onglet={onglet} surOnglet={setOnglet} prompt={diffPrompt} schema={diffSchema} ecartsPrompt={diffPrompt} ecartsSchema={diffSchema} controles={controles} />
        </section>
      </div>
    </div>
  );
}
