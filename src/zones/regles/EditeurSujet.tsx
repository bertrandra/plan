// L'edition d'un sujet de l'ecran Admin › Regles : chaque texte du prompt qu'il apporte (consignes,
// vocabulaire, grille, confusions...) dans son champ, avec son rang, et le schema de ses champs en JSON.
// Chaque frappe est rendue a l'ecran parent, qui recalcule le prompt : rien n'est enregistre ici.

import { useState } from 'react';
import { FAMILLES, modifierBloc, modifierChamp, retirerBloc, sourceDescription, type BlocEditable, type Famille } from '../../regles/sujets/edition.js';
import type { DescriptionSujet } from '../../regles/sujets/description.js';

const ORDRE: Famille[] = ['consignes', 'vocabulaire', 'lectures', 'grille', 'confusions', 'rappels'];

/** Le JSON d'un champ du schema : une frappe valide est rendue au parent, une frappe fausse se garde et se dit. */
function ChampJson({ nom, valeur, surChangement }: { nom: string; valeur: unknown; surChangement: (json: string) => string | null }) {
  const [texte, setTexte] = useState(() => JSON.stringify(valeur, null, 2));
  const [erreur, setErreur] = useState<string | null>(null);
  return (
    <label className="reglChamp">
      <span className="reglChampNom"><code>{nom}</code> — schéma JSON</span>
      <textarea className="reglTexte reglMono" spellCheck={false} rows={Math.min(14, texte.split('\n').length + 1)} value={texte} aria-invalid={erreur !== null}
        onChange={(e) => { setTexte(e.target.value); setErreur(surChangement(e.target.value)); }} />
      {erreur && <span className="reglErreur" role="alert">{erreur}</span>}
    </label>
  );
}

interface Props {
  sujet: DescriptionSujet;
  /** Le sujet tel que le depot le livre ; absent pour un brouillon. */
  livre?: DescriptionSujet | undefined;
  surChangement: (s: DescriptionSujet) => void;
  surRetour?: (() => void) | undefined;
  telecharger: (nom: string, contenu: string, type: string) => void;
}

export function EditeurSujet({ sujet, livre, surChangement, surRetour, telecharger }: Props) {
  const changer = (f: Famille, i: number, patch: Partial<BlocEditable>) => surChangement(modifierBloc(sujet, f, i, patch));
  return (
    <div className="reglEditeur" role="group" aria-label={'Édition du sujet ' + sujet.libelle}>
      {ORDRE.map((f) => {
        const blocs = sujet[f] as BlocEditable[];
        if (!blocs.length) return null;
        return (
          <fieldset key={f} className="reglFamille">
            <legend>{FAMILLES[f]}</legend>
            {blocs.map((b, i) => (
              <div key={i} className="reglBloc">
                <div className="reglBlocEntete">
                  <label>Rang <input type="number" step="0.5" value={b.rang} onChange={(e) => { const r = Number(e.target.value); if (Number.isFinite(r)) changer(f, i, { rang: r }); }} /></label>
                  {b.section !== undefined && <label>Section <input type="text" value={b.section} onChange={(e) => changer(f, i, { section: e.target.value })} /></label>}
                  {b.titre !== undefined && <label>Titre <input type="text" value={b.titre} onChange={(e) => changer(f, i, { titre: e.target.value })} /></label>}
                  <button type="button" className="secondary small" aria-label={'Retirer ce texte (' + FAMILLES[f] + ' ' + (i + 1) + ')'} onClick={() => surChangement(retirerBloc(sujet, f, i))}>Retirer</button>
                </div>
                <textarea className="reglTexte" rows={Math.min(12, b.texte.split('\n').length + 1)} value={b.texte} aria-label={FAMILLES[f] + ' ' + (i + 1)}
                  onChange={(e) => changer(f, i, { texte: e.target.value })} />
              </div>
            ))}
          </fieldset>
        );
      })}
      <fieldset className="reglFamille">
        <legend>Champs du schéma</legend>
        {Object.entries(sujet.champs).map(([nom, schema]) => (
          <ChampJson key={nom} nom={nom} valeur={schema} surChangement={(json) => {
            const r = modifierChamp(sujet, nom, json);
            if ('erreur' in r) return r.erreur;
            surChangement(r.sujet);
            return null;
          }} />
        ))}
      </fieldset>
      <div className="reglActionsSujet">
        <button type="button" className="secondary small" onClick={() => telecharger(sujet.id + '.ts', sourceDescription(sujet), 'text/typescript')}
          title={'À poser dans src/regles/sujets/descriptions/ puis lancer npm run regles:generer'}>
          Télécharger descriptions/{sujet.id}.ts
        </button>
        {livre && <button type="button" className="secondary small" onClick={() => surChangement(livre)}>Revenir au texte livré</button>}
        {surRetour && <button type="button" className="secondary small danger" onClick={surRetour}>Retirer ce brouillon</button>}
      </div>
    </div>
  );
}
