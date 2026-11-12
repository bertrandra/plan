// Etape 0 : l'arbre des objets a marquer. Chaque classe : son nom, sa place (son parent), sa forme (rectangle ou polygone), sa couleur
// de marquage, ses attributs a renseigner, et si elle entre dans le jeu YOLO (son indice, dans l'ordre de l'arbre). Ctrl+S enregistre.

import { useEffect } from 'react';
import type { Banc } from '../../App.js';
import { CLASSES_DEFAUT, nomsDeLaClasse, profondeur } from '../../classes.js';
import type { Classe } from '../../types.js';
import { Icone } from '../../ui/Icones.js';
import { Page, Section } from '../../ui/Page.js';
import { FicheClasse } from './FicheClasse.js';
import { useClasses } from './useClasses.js';

/** Les indices YOLO d'une classe, en abrege : « #3 », « #0–8 », « — » sans indice. */
const indicesAffiches = (l: number[]): string => (!l.length ? '—' : l.length === 1 ? '#' + l[0] : `#${l[0]}–${l[l.length - 1]}`);
const SIGNE_FORME = { polygone: '⬠', ligne: '╱', point: '⊕', rectangle: '▭' } as const;

export function EcranClasses({ banc, onClasses }: { banc: Banc; onClasses: (c: Classe[]) => void }) {
  const k = useClasses(banc, onClasses);
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); if (k.modifie) k.enregistrer(); } };
    window.addEventListener('keydown', t);
    return () => window.removeEventListener('keydown', t);
  });
  const { classes, choisie } = k;
  return (
    <Page icone="classes" numero="0" titre="Classes" large
      aide={<p>Trois niveaux : un <b>regroupement</b> classe sans se dessiner (Ouverture → Fenêtre, Porte) ; une <b>classe</b> se dessine et se range dans l’objet de sa classe parente (un cadre dans sa fenêtre) ; ses <b>types</b> la qualifient (fenetre_2v). Ce qui est « appris » entre dans le jeu YOLO avec l’indice affiché ; les détails appris prennent leurs indices après les objets principaux.</p>}
      actions={<>
        {k.modifie && <span className="puce attention">non enregistré</span>}
        <button type="button" className="discret" onClick={() => { if (confirm('Revenir à l’arbre de départ ?')) k.changer(CLASSES_DEFAUT); }}>Arbre de départ</button>
        <button type="button" className="principal" onClick={k.enregistrer} disabled={!k.modifie} title="Ctrl+S"><Icone nom="enregistrer" /> Enregistrer</button>
      </>}>
      <div className="deux-colonnes">
        <Section titre="L’arbre" compte={classes.length}
          actions={<><button type="button" onClick={() => k.ajouter(null)} title="Une classe à la racine">+ Racine</button><button type="button" onClick={() => k.ajouter(choisie)} disabled={!choisie} title="Une classe fille de la classe choisie">+ Fille</button></>}>
          <ul className="arbre" role="listbox" aria-label="Classes">
            {k.ordre.map((x) => (
              <li key={x.id} role="option" aria-selected={x.id === choisie} className={x.id === choisie ? 'choisie' : ''} style={{ paddingLeft: 8 + 18 * profondeur(classes, x.id) }} onClick={() => k.setChoisie(x.id)}>
                <span className="pastille" style={{ background: x.couleur }} />
                {x.regroupement ? <b>{x.nom}</b> : x.nom}{x.aussi?.length ? <em className="aussi"> (aussi {x.aussi.map((a) => classes.find((y) => y.id === a)?.nom ?? a).join(', ')})</em> : null} <small>{x.regroupement ? 'regroupement' : <>{SIGNE_FORME[x.forme]} {indicesAffiches(nomsDeLaClasse(x).map((n) => k.yolo.get(n) ?? -1))}</>}</small>
              </li>
            ))}
          </ul>
          {k.erreurs.length > 0 && <ul className="erreur">{k.erreurs.map((e) => <li key={e}>{e}</li>)}</ul>}
        </Section>
        {k.c ? <FicheClasse c={k.c} classes={classes} onMaj={k.majClasse} onId={k.renommerId} onSupprimer={k.supprimer} onDeplacer={k.deplacer} /> : <div className="panneau"><p className="aide">Choisissez une classe.</p></div>}
      </div>
    </Page>
  );
}
