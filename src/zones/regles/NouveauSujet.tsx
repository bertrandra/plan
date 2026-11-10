// Le formulaire « Nouveau sujet » de l'ecran Admin › Regles : ce que l'on sait dire d'un sujet (son nom, ce que
// Claude doit en dire, les valeurs admises avec leur definition) suffit a le faire entrer, en brouillon, dans
// le prompt et le schema recalcules a l'ecran. Il n'entre dans le depot que par son module (EditeurSujet).

import { useState } from 'react';
import { IDENTIFIANT, nouveauSujet, type TermeNouveau } from '../../regles/sujets/edition.js';
import type { DescriptionSujet } from '../../regles/sujets/description.js';

/** Une ligne « terme : definition » par valeur ; une ligne sans « : » est un terme sans definition. */
function lireTermes(texte: string): TermeNouveau[] {
  return texte.split('\n').map((l) => l.trim()).filter(Boolean).map((l) => {
    const i = l.indexOf(':');
    return i < 0 ? { terme: l, definition: '' } : { terme: l.slice(0, i).trim(), definition: l.slice(i + 1).trim() };
  });
}

interface Props { existants: readonly DescriptionSujet[]; surAjout: (s: DescriptionSujet) => void; surAnnuler: () => void }

export function NouveauSujet({ existants, surAjout, surAnnuler }: Props) {
  const [id, setId] = useState('');
  const [libelle, setLibelle] = useState('');
  const [question, setQuestion] = useState('');
  const [termes, setTermes] = useState('');

  const termesLus = lireTermes(termes);
  const probleme = !IDENTIFIANT.test(id) ? 'L’identifiant s’écrit en lettres et chiffres, sans espace, en commençant par une minuscule (chienAssis).'
    : existants.some((s) => s.id === id || id in s.champs) ? 'Ce nom est déjà pris par un sujet ou un champ.'
    : !question.trim() ? 'Dites ce que Claude doit répondre sur ce sujet.'
    : termesLus.some((t) => !t.definition) ? 'Chaque valeur a sa définition : « terme : ce que c’est ».'
    : null;

  return (
    <form onSubmit={(e) => { e.preventDefault(); if (!probleme) surAjout(nouveauSujet({ id, libelle, question, termes: termesLus }, existants)); }}>
      <fieldset className="consFormulaire reglNouveau">
      <legend>Nouveau sujet</legend>
      <label className="consChamp">Identifiant
        <input type="text" name="id" value={id} placeholder="chienAssis" autoCapitalize="off" autoCorrect="off" spellCheck={false} onChange={(e) => setId(e.target.value)} />
      </label>
      <label className="consChamp">Nom à l’écran
        <input type="text" name="libelle" value={libelle} placeholder="Chiens-assis" onChange={(e) => setLibelle(e.target.value)} />
      </label>
      <label className="consChamp reglLarge">Ce que Claude doit dire
        <input type="text" name="question" value={question} placeholder="le nombre de chiens-assis vus sur le versant, ou « indetermine »" onChange={(e) => setQuestion(e.target.value)} />
      </label>
      <label className="consChamp reglLarge">Valeurs admises, une par ligne (vide : un nombre)
        <textarea className="reglTexte" name="termes" rows={4} value={termes} placeholder={'abri : petite construction fermée\nbassin : pièce d’eau'} onChange={(e) => setTermes(e.target.value)} />
      </label>
      {probleme && <p className="consNote reglLarge" role="status">{probleme}</p>}
      <div className="consFormulaireActions">
        <button type="submit" disabled={probleme !== null} title={probleme ?? 'Ajoute le sujet au prompt et au schéma, en brouillon'}>Ajouter en brouillon</button>
        <button type="button" className="secondary" onClick={surAnnuler}>Annuler</button>
      </div>
      </fieldset>
    </form>
  );
}
