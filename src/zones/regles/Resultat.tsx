// Le panneau de droite de l'ecran Admin › Regles : le prompt et le schema tels que le serveur les
// recevrait, recalcules a chaque frappe, ce qui change par rapport au livre, et les controles.

import type { Controle, LigneDiff } from '../../regles/sujets/edition.js';

export type Onglet = 'prompt' | 'schema' | 'ecarts' | 'controles';

/** Une ligne de texte genere, marquee quand elle n'est pas dans le livre : un signe, pas seulement une teinte. */
function Lignes({ lignes, nom }: { lignes: readonly LigneDiff[]; nom: string }) {
  return (
    <pre className="reglSortie" tabIndex={0} aria-label={nom}>
      {lignes.filter((l) => l.type !== '-').map((l, i) => (
        <span key={i} className={'reglLigne' + (l.type === '+' ? ' reglAjout' : '')} data-diff={l.type === '+' ? 'ajoute' : undefined}>
          <span className="reglSigne" aria-hidden="true">{l.type === '+' ? '+' : ' '}</span>{l.texte + '\n'}
        </span>
      ))}
    </pre>
  );
}

interface Props {
  onglet: Onglet;
  surOnglet: (o: Onglet) => void;
  prompt: readonly LigneDiff[];
  schema: readonly LigneDiff[];
  ecartsPrompt: readonly LigneDiff[];
  ecartsSchema: readonly LigneDiff[];
  controles: readonly Controle[];
}

const TITRES: { id: Onglet; titre: string }[] = [
  { id: 'prompt', titre: 'Prompt' }, { id: 'schema', titre: 'Schéma' }, { id: 'ecarts', titre: 'Écarts avec le livré' }, { id: 'controles', titre: 'Contrôles' },
];

/** Les lignes qui changent, ajoutees ou retirees, sous un titre. */
function Changements({ titre, lignes }: { titre: string; lignes: readonly LigneDiff[] }) {
  const changees = lignes.filter((l) => l.type !== '=');
  if (!changees.length) return null;
  return (
    <>
      <h2 className="reglTitreEcart">{titre} ({changees.length})</h2>
      <pre className="reglSortie" tabIndex={0} aria-label={titre}>
        {changees.map((l, i) => (
          <span key={i} className={'reglLigne ' + (l.type === '+' ? 'reglAjout' : 'reglRetrait')} data-diff={l.type === '+' ? 'ajoute' : 'retire'}>
            <span className="reglSigne" aria-hidden="true">{l.type === '+' ? '+' : '−'}</span>{l.texte + '\n'}
          </span>
        ))}
      </pre>
    </>
  );
}

export function Resultat({ onglet, surOnglet, prompt, schema, ecartsPrompt, ecartsSchema, controles }: Props) {
  const problemes = controles.filter((c) => c.niveau !== 'ok').length;
  const nEcarts = [...ecartsPrompt, ...ecartsSchema].filter((l) => l.type !== '=').length;
  return (
    <div className="reglResultatCorps">
      <div className="palOnglets consOnglets" role="tablist" aria-label="Résultat">
        {TITRES.map((o) => (
          <button key={o.id} type="button" role="tab" id={'reglOnglet-' + o.id} aria-selected={onglet === o.id} aria-controls="reglVue"
            className={'palOnglet' + (onglet === o.id ? ' actif' : '')} onClick={() => surOnglet(o.id)}>
            {o.titre}{o.id === 'controles' && problemes ? ' (' + problemes + ')' : ''}{o.id === 'ecarts' && nEcarts ? ' (' + nEcarts + ')' : ''}
          </button>
        ))}
      </div>
      <section id="reglVue" className="consVue" role="tabpanel" aria-labelledby={'reglOnglet-' + onglet}>
        {onglet === 'prompt' ? <Lignes lignes={prompt} nom="Prompt généré" />
          : onglet === 'schema' ? <Lignes lignes={schema} nom="Schéma généré" />
          : onglet === 'ecarts' ? (
            nEcarts
              ? <><Changements titre="Prompt" lignes={ecartsPrompt} /><Changements titre="Schéma" lignes={ecartsSchema} /></>
              : <p className="consVide">Rien ne change : le prompt et le schéma sont ceux du dépôt.</p>
          ) : (
            <ul className="reglControles" aria-label="Contrôles">
              {controles.map((c, i) => (
                <li key={i} data-niveau={c.niveau}><strong>{c.niveau === 'erreur' ? 'Erreur' : c.niveau === 'alerte' ? 'Alerte' : 'Bon'}</strong> {c.message}</li>
              ))}
            </ul>
          )}
      </section>
    </div>
  );
}
