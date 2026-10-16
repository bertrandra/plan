// L'ecran Admin › Arbres (`?admin&ecran=arbres`, MD/spec-arbres-3d.md).
//
// L'administrateur y cree la bibliotheque d'essences que les utilisateurs retrouvent dans
// l'inspecteur : un nom, caduc ou persistant, les dimensions proposees et les reglages d'EZ-tree qui
// generent l'arbre. A gauche, la liste des essences et les reglages de celle qu'on edite ; a droite,
// l'arbre tel que la 3D le dessinera, avec ce qu'il pese (triangles, generation). « Enregistrer »
// ecrit la bibliotheque sur le serveur (`admin/arbres`) ; chaque page la lit au demarrage
// (io/arbresServeur.ts). Rien ne change pour l'utilisateur final, sinon la liste des essences.
//
// L'ecran ne parle pas a three.js : l'apercu, les presets et les reglages par defaut lui viennent
// de app/ecranArbres.ts, qui les branche sur three/apercuArbre.ts et three/ezTree.ts.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ESPECES_PAR_DEFAUT, completerParDefaut } from '../model/especesParDefaut.js';
import { documentArbres, idDepuisNom, lireDocumentArbres, MAX_ESPECES, type EspeceArbre, type ReglagesEz } from '../model/especesArbre.js';
import { ecrireChemin, GROUPES_EZ, hexEnTeinte, lireChemin, niveauActif, NOMS_PRESETS_EZ, teinteEnHex, type ChampEz } from '../model/reglagesEz.js';
import type { ApercuArbre, ChiffresArbre } from '../three/apercuArbre.js';
import { TRIANGLES_CONSEILLES_MAX } from '../three/apercuArbre.js';

/** Ce que l'ecran recoit de l'application : le serveur, EZ-tree et l'apercu. */
export interface PropsEcranArbres {
  /** La bibliotheque du serveur, ou `null` s'il n'y en a pas. */
  enregistrees: readonly EspeceArbre[] | null;
  enregistrer: (document: unknown) => Promise<string | null>;
  /** Charge EZ-tree et rend ses reglages par defaut et ses presets ; leve si EZ-tree ne vient pas (hors ligne). */
  preparer: () => Promise<{ defaut: ReglagesEz; presets: Record<string, ReglagesEz> }>;
  monterApercu: (hote: HTMLElement) => Promise<ApercuArbre>;
  retour?: string;
}

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function ChampReglage({ champ, reglages, surChangement }: { champ: ChampEz; reglages: ReglagesEz; surChangement: (chemin: string, valeur: number | string | boolean) => void }) {
  const v = lireChemin(reglages, champ.chemin);
  const id = 'arb-' + champ.chemin;
  return (
    <label className="arbChamp" htmlFor={id} title={champ.aide}>
      <span className="arbLibelle">{champ.libelle}</span>
      {champ.type === 'nombre' && (
        <input id={id} type="number" inputMode="decimal" min={champ.min} max={champ.max} step={champ.pas} value={typeof v === 'number' ? v : ''}
          onChange={(e) => { const n = parseFloat(e.target.value); if (Number.isFinite(n)) surChangement(champ.chemin, Math.min(champ.max, Math.max(champ.min, champ.entier ? Math.round(n) : n))); }} />
      )}
      {champ.type === 'choix' && (
        <select id={id} value={typeof v === 'string' ? v : ''} onChange={(e) => surChangement(champ.chemin, e.target.value)}>
          {champ.options.map((o) => <option key={o.valeur} value={o.valeur}>{o.libelle}</option>)}
        </select>
      )}
      {champ.type === 'couleur' && <input id={id} type="color" value={teinteEnHex(v)} onChange={(e) => surChangement(champ.chemin, hexEnTeinte(e.target.value))} />}
      {champ.type === 'case' && <input id={id} type="checkbox" checked={v !== false} onChange={(e) => surChangement(champ.chemin, e.target.checked)} />}
    </label>
  );
}

interface PropsFiche {
  courante: EspeceArbre;
  peutDupliquer: boolean;
  rapport: number | null;
  json: string | null;
  setJson: (j: string | null) => void;
  modifier: (id: string, f: (e: EspeceArbre) => EspeceArbre) => void;
  dupliquer: () => void;
  supprimer: () => void;
  appliquerJson: () => void;
}

/** Les champs de l'essence choisie et ses reglages d'EZ-tree, groupe par groupe. */
function FicheEssence({ courante, peutDupliquer, rapport, json, setJson, modifier, dupliquer, supprimer, appliquerJson }: PropsFiche) {
  return (
    <div className="arbFiche">
              <h2 className="palSectionTitre">Essence</h2>
              <label className="arbChamp"><span className="arbLibelle">Nom</span>
                <input type="text" maxLength={60} value={courante.nom} onChange={(e) => modifier(courante.id, (x) => ({ ...x, nom: e.target.value }))} /></label>
              <label className="arbChamp" title="Un caduc est nu de novembre à mars, à la date de l’étude d’ensoleillement"><span className="arbLibelle">Caduc</span>
                <input type="checkbox" checked={courante.caduc} onChange={(e) => modifier(courante.id, (x) => ({ ...x, caduc: e.target.checked }))} /></label>
              <label className="arbChamp"><span className="arbLibelle">Hauteur proposée (m)</span>
                <input type="number" min={0.5} max={60} step={0.5} value={courante.hauteurM} onChange={(e) => { const n = parseFloat(e.target.value); if (n > 0) modifier(courante.id, (x) => ({ ...x, hauteurM: Math.min(60, n) })); }} /></label>
              <label className="arbChamp"><span className="arbLibelle">Diamètre proposé (m)</span>
                <input type="number" min={0.5} max={40} step={0.5} value={courante.diametreM} onChange={(e) => { const n = parseFloat(e.target.value); if (n > 0) modifier(courante.id, (x) => ({ ...x, diametreM: Math.min(40, n) })); }} /></label>
              <label className="arbChamp" title="Mots de la nature BD TOPO (conifère, verger…) pour lesquels cette essence est proposée à l’import du cadastre"><span className="arbLibelle">Proposée pour (BD TOPO)</span>
                <input type="text" value={courante.natures.join(', ')} placeholder="conif, verger…" onChange={(e) => modifier(courante.id, (x) => ({ ...x, natures: e.target.value.split(',').map((m) => m.trim()).filter(Boolean) }))} /></label>
              {rapport !== null && (
                <p className="arbNote">Le modèle fait {rapport.toFixed(2)} fois plus haut que large.{' '}
                  <button type="button" className="small secondary" onClick={() => modifier(courante.id, (x) => ({ ...x, hauteurM: Math.round(x.diametreM * rapport * 2) / 2 }))}>Régler la hauteur proposée sur ce rapport</button></p>
              )}
              <div className="arbActionsFiche">
                <button type="button" className="small secondary" disabled={!peutDupliquer} onClick={dupliquer}>Dupliquer</button>
                <button type="button" className="small danger" onClick={supprimer}>Supprimer</button>
              </div>

              <h2 className="palSectionTitre">Réglages d’EZ-tree</h2>
              {GROUPES_EZ.map((g, i) => (
                <details key={g.id} className="arbGroupe" open={i === 0}>
                  <summary>{g.titre}</summary>
                  <div className="arbGrille">
                    {g.champs.filter((c) => niveauActif(c.chemin, courante.reglages)).map((c) => (
                      <ChampReglage key={c.chemin} champ={c} reglages={courante.reglages} surChangement={(chemin, v) => modifier(courante.id, (x) => ({ ...x, reglages: ecrireChemin(x.reglages, chemin, v) }))} />
                    ))}
                  </div>
                </details>
              ))}
              <details className="arbGroupe" open={json !== null} onToggle={(e) => { if ((e.target as HTMLDetailsElement).open && json === null) setJson(JSON.stringify(courante.reglages, null, 2)); }}>
                <summary>Réglages complets (JSON)</summary>
                <textarea className="arbJson" spellCheck={false} rows={12} value={json ?? ''} onChange={(e) => setJson(e.target.value)} aria-label="Réglages complets d’EZ-tree en JSON" />
                <button type="button" className="small secondary" onClick={appliquerJson} disabled={json === null}>Appliquer ce JSON</button>
              </details>
            </div>
  );
}

interface PropsApercu {
  hote: React.RefObject<HTMLDivElement | null>;
  chargement: boolean;
  courante: EspeceArbre | null;
  nu: boolean;
  setNu: (v: boolean) => void;
  chiffres: ChiffresArbre | null;
  lourd: boolean;
}

/** Les essences par defaut ajoutees a la bibliotheque (pour les retoucher), et ce qu'on en dit ; `liste` : null si rien ne change. */
function repriseParDefaut(especes: readonly EspeceArbre[]): { liste: EspeceArbre[] | null; message: string } {
  const { liste, ajoutees, restantes } = completerParDefaut(especes, MAX_ESPECES);
  if (!ajoutees && !restantes) return { liste: null, message: 'Toutes les essences par défaut sont déjà dans la bibliothèque.' };
  const message = restantes ? ajoutees + ' essence(s) par défaut ajoutée(s) : la bibliothèque est pleine (' + MAX_ESPECES + ' au plus).'
    : ajoutees + ' essence(s) par défaut ajoutée(s). Enregistrez pour qu’elles remplacent la bibliothèque livrée avec Plan.';
  return { liste: ajoutees ? liste : null, message };
}

/** « Reprendre les essences par défaut » : les essences livrées avec Plan s'ajoutent à la bibliothèque, pour les retoucher. */
function BoutonReprise({ especes, setEspeces, setChoisie, setMessage }: {
  especes: EspeceArbre[]; setEspeces: (l: EspeceArbre[]) => void; setChoisie: (f: (c: string | null) => string | null) => void; setMessage: (m: string) => void;
}) {
  return (
    <button type="button" className="secondary" id="arbDefaut" onClick={() => {
      const r = repriseParDefaut(especes);
      setMessage(r.message);
      if (!r.liste) return;
      setEspeces(r.liste);
      setChoisie((c) => c ?? r.liste?.[0]?.id ?? null);
    }}>Reprendre les essences par défaut</button>
  );
}

/** L'arbre tel que la 3D le dessinera, et ce qu'il pese. */
function PanneauApercu({ hote, chargement, courante, nu, setNu, chiffres, lourd }: PropsApercu) {
  return (
        <aside className="arbApercu" aria-label="Aperçu">
          <div className="arbToile" ref={hote} role="img" aria-label="Aperçu en trois dimensions de l’essence en cours d’édition" />
          {chargement && <p className="arbNote">Chargement d’EZ-tree…</p>}
          {courante?.caduc && (
            <label className="arbChamp"><span className="arbLibelle">Voir l’arbre nu (hiver)</span>
              <input type="checkbox" checked={nu} onChange={(e) => setNu(e.target.checked)} /></label>
          )}
          {chiffres && (
            <dl className="arbChiffres">
              <div><dt>Triangles</dt><dd className={lourd ? 'arbLourd' : ''}>{chiffres.triangles.toLocaleString('fr-FR')}</dd></div>
              <div><dt>Sommets</dt><dd>{chiffres.sommets.toLocaleString('fr-FR')}</dd></div>
              <div><dt>Génération</dt><dd>{chiffres.dureeMs} ms</dd></div>
              <div><dt>Modèle</dt><dd>{chiffres.largeur} × {chiffres.hauteur}</dd></div>
            </dl>
          )}
          {lourd && <p className="arbMessage">Cet arbre pèse plus de {TRIANGLES_CONSEILLES_MAX.toLocaleString('fr-FR')} triangles : trois variantes par essence et des centaines d’exemplaires dans un voisinage ralentiront les téléphones et alourdiront l’export. Réduisez les niveaux, les sections ou les feuilles.</p>}
          <p className="arbNote">Les arbres d’une même essence sont dessinés en instances : le poids d’un modèle compte une fois par variante (trois), pas une fois par arbre.</p>
        </aside>
  );
}

export function EcranArbres({ enregistrees, enregistrer, preparer, monterApercu, retour = '?admin' }: PropsEcranArbres) {
  const [especes, setEspeces] = useState<EspeceArbre[]>(() => clone([...(enregistrees ?? [])]));
  const [choisie, setChoisie] = useState<string | null>(() => enregistrees?.[0]?.id ?? null);
  const [reference, setReference] = useState(() => JSON.stringify(enregistrees ?? []));
  const [ez, setEz] = useState<{ defaut: ReglagesEz; presets: Record<string, ReglagesEz> } | null>(null);
  const [erreurEz, setErreurEz] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null), [enCours, setEnCours] = useState(false);
  const [chiffres, setChiffres] = useState<ChiffresArbre | null>(null);
  const [nu, setNu] = useState(false);
  const [json, setJson] = useState<string | null>(null);
  const hoteApercu = useRef<HTMLDivElement | null>(null);
  const apercu = useRef<ApercuArbre | null>(null);
  const courante = especes.find((e) => e.id === choisie) ?? null;
  const modifiee = JSON.stringify(especes) !== reference;

  // EZ-tree se charge a l'ouverture (4 Mo) ; sans lui, l'ecran dit pourquoi et ne propose rien.
  useEffect(() => {
    let vivant = true;
    preparer().then((r) => { if (vivant) setEz(r); }, (e: unknown) => { if (vivant) setErreurEz((e as Error).message || String(e)); });
    return () => { vivant = false; };
  }, [preparer]);

  useEffect(() => {
    if (!ez || !hoteApercu.current) return;
    let vivant = true;
    monterApercu(hoteApercu.current).then((a) => { if (vivant) apercu.current = a; else a.detruire(); }, (e: unknown) => { if (vivant) setErreurEz('Aperçu indisponible : ' + ((e as Error).message || String(e))); });
    return () => { vivant = false; apercu.current?.detruire(); apercu.current = null; };
  }, [ez, monterApercu]);

  // L'apercu suit les reglages, un instant apres la derniere frappe : generer un arbre prend du temps.
  const signature = courante ? JSON.stringify(courante.reglages) + (courante.caduc && nu ? '|nu' : '') : '';
  useEffect(() => {
    if (!courante) { apercu.current?.montrer({}, undefined, false); setChiffres(null); return; }
    const t = setTimeout(() => {
      const a = apercu.current;
      if (!a) return;
      const seed = lireChemin(courante.reglages, 'seed');
      setChiffres(a.montrer(courante.reglages, typeof seed === 'number' ? seed : 0, courante.caduc && nu));
    }, 250);
    return () => clearTimeout(t);
    // `courante` change a chaque frappe ; la signature suffit a decider d'un nouvel apercu.
  }, [signature, choisie, ez, nu]);

  const modifier = useCallback((id: string, f: (e: EspeceArbre) => EspeceArbre) => {
    setEspeces((liste) => liste.map((e) => (e.id === id ? f(e) : e)));
    setMessage(null);
  }, []);

  function ajouter(depart: ReglagesEz, nom: string, plus: Partial<EspeceArbre> = {}): void {
    if (especes.length >= MAX_ESPECES) { setMessage('La bibliothèque est pleine (' + MAX_ESPECES + ' essences au plus).'); return; }
    const id = idDepuisNom(nom, new Set(especes.map((e) => e.id)));
    setEspeces([...especes, { id, nom, caduc: true, natures: [], hauteurM: 12, diametreM: 8, reglages: clone(depart), ...plus }]);
    setChoisie(id);
    setMessage(null);
  }

  function supprimer(): void {
    if (!courante || !window.confirm('Supprimer l’essence « ' + courante.nom + ' » ? Les arbres du plan qui la portent suivront la première essence.')) return;
    const reste = especes.filter((e) => e.id !== courante.id);
    setEspeces(reste);
    setChoisie(reste[0]?.id ?? null);
  }

  async function sauver(): Promise<void> {
    setEnCours(true);
    setMessage(null);
    const doc = documentArbres(especes);
    const erreur = await enregistrer(doc);
    setEnCours(false);
    if (erreur) { setMessage('Enregistrement refusé : ' + erreur); return; }
    // Relu comme les pages le liront : ce qui est abime en est retire.
    const relue = lireDocumentArbres(doc);
    setReference(JSON.stringify(especes));
    setMessage('Bibliothèque enregistrée (' + (relue?.especes.length ?? 0) + ' essence' + ((relue?.especes.length ?? 0) > 1 ? 's' : '') + '). Les pages ouvertes la liront au prochain chargement.');
  }

  function appliquerJson(): void {
    if (!courante || json === null) return;
    try {
      const v = JSON.parse(json) as unknown;
      if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('un objet de réglages est attendu');
      modifier(courante.id, (e) => ({ ...e, reglages: v as ReglagesEz }));
      setJson(null);
    } catch (e) {
      setMessage('JSON refusé : ' + ((e as Error).message || e));
    }
  }

  const lourd = chiffres !== null && chiffres.triangles > TRIANGLES_CONSEILLES_MAX;
  const rapport = chiffres && chiffres.largeur > 0 ? chiffres.hauteur / chiffres.largeur : null;
  const presets = useMemo(() => NOMS_PRESETS_EZ.filter((n) => ez?.presets[n]), [ez]);

  return (
    <main className="palEcran arbEcran">
      <header className="palEntete">
        <div>
          <h1 className="palTitre">Arbres</h1>
          <p className="palSous">La bibliothèque d’essences que les utilisateurs retrouvent dans l’inspecteur. Chaque essence est générée par EZ-tree à partir des réglages ci-dessous ; l’utilisateur choisit une essence et ses dimensions, sans rien voir de ces réglages.</p>
        </div>
        <div className="palActions">
          <a className="palLien" href={retour}>← Retour à l’admin</a>
        </div>
      </header>

      <div className="palBarre" role="status">
        <p className="palEtatPalette">{modifiee ? <span className="palNonEnregistre">Modifications non enregistrées</span> : 'Enregistrée sur le serveur'} · {especes.length} essence{especes.length > 1 ? 's' : ''}</p>
        <div className="palBarreActions">
          <button type="button" onClick={() => { void sauver(); }} disabled={!modifiee || enCours}>{enCours ? 'Enregistrement…' : 'Enregistrer'}</button>
          <button type="button" className="secondary" onClick={() => { setEspeces(clone(JSON.parse(reference) as EspeceArbre[])); setChoisie((JSON.parse(reference) as EspeceArbre[])[0]?.id ?? null); setMessage(null); }} disabled={!modifiee || enCours}>Annuler les modifications</button>
        </div>
      </div>
      {message && <p className="arbMessage" role="alert">{message}</p>}
      {erreurEz && <p className="arbMessage" role="alert">EZ-tree n’a pas pu être chargé (connexion internet requise) : {erreurEz}</p>}

      <div className="arbCorps">
        <section className="arbEdition" aria-label="Essences">
          <div className="arbListe" role="group" aria-label="Liste des essences">
            {especes.map((e) => (
              <button key={e.id} type="button" className={'arbEssence' + (e.id === choisie ? ' actif' : '')} aria-pressed={e.id === choisie} onClick={() => { setChoisie(e.id); setJson(null); }}>
                {e.nom}<small>{e.caduc ? 'caduc' : 'persistant'}</small>
              </button>
            ))}
            {!especes.length && <p className="palIdee">Aucune essence enregistrée : Plan utilise sa bibliothèque par défaut ({ESPECES_PAR_DEFAUT.length} essences). Reprenez-les ci-dessous pour les retoucher, ou ajoutez les vôtres : une bibliothèque enregistrée remplace celle de Plan.</p>}
          </div>
          <div className="arbAjout">
            <select aria-label="Partir d’un modèle d’EZ-tree" id="arbPreset" defaultValue="" disabled={!ez} onChange={(e) => {
              const n = e.target.value;
              if (!n || !ez) return;
              ajouter(ez.presets[n] ?? ez.defaut, n.replace('Small', 'petit').replace('Medium', 'moyen').replace('Large', 'grand'), { caduc: !/pine/i.test(n) });
              e.target.value = '';
            }}>
              <option value="">Ajouter à partir d’un modèle…</option>
              {presets.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
            <button type="button" className="secondary" disabled={!ez} onClick={() => ez && ajouter(ez.defaut, 'Nouvelle essence')}>Ajouter une essence vierge</button>
            <BoutonReprise especes={especes} setEspeces={setEspeces} setChoisie={setChoisie} setMessage={setMessage} />
          </div>

          {courante && (
            <FicheEssence courante={courante} peutDupliquer={!!ez} rapport={rapport} json={json} setJson={setJson}
              modifier={modifier} dupliquer={() => ajouter(courante.reglages, courante.nom + ' (copie)', { caduc: courante.caduc, hauteurM: courante.hauteurM, diametreM: courante.diametreM, natures: [] })}
              supprimer={supprimer} appliquerJson={appliquerJson} />
          )}
        </section>

        <PanneauApercu hote={hoteApercu} chargement={!ez && !erreurEz} courante={courante} nu={nu} setNu={setNu} chiffres={chiffres} lourd={lourd} />
      </div>
    </main>
  );
}
