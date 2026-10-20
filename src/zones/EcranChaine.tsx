// L'ecran Admin › Chaine (`?admin&ecran=chaine`) : de l'IGN a ma maison, de bout en bout.
//
// Un schema (les etapes, dans l'ordre, chacune ancree plus bas), puis chaque etape avec ses noeuds : les sources, le polygone
// et la hauteur, le decoupage en corps, les objets 3D (dessines par le code de la 3D, pas a la main), les textures, la
// reconciliation, le processus d'audit, et pour chacun s'il se decide seul, a la main ou aux deux, et l'ecran qui le regle
// quand il existe. Tout vient de la liste a plat de model/chaine.ts : cet ecran ne sait rien de ce qu'il montre.

import { useMemo, useState } from 'react';
import { construireArbre, repartitionDesModes, type ArbreNoeud, type ModeNoeud, type NoeudChaine } from '../model/chaine.js';
import type { ChaineVivante, NoeudVivant } from '../app/chaineVivante.js';
import { EXEMPLES_TOITS, vueIsometrique, type VueIso } from '../facade/catalogueToits.js';

const MODES: Record<ModeNoeud, string> = { auto: 'Automatique', manuel: 'Manuel', mixte: 'Automatique puis manuel' };
const GENRES: Record<NoeudChaine['genre'], string> = { etape: 'Étape', source: 'Source', objet: 'Objet', regle: 'Règle', objet3d: 'Objet 3D', texture: 'Texture', processus: 'Processus' };
type Filtre = 'tous' | ModeNoeud;

/** La vignette isometrique d'une forme du catalogue : les facettes que la 3D calcule, teintees par leur exposition. */
export function VignetteToit({ forme }: { forme: string }) {
  const exemple = EXEMPLES_TOITS.find((e) => e.id === forme);
  const vue = useMemo(() => (exemple ? vueIsometrique(exemple) : null), [exemple]);
  if (!exemple || !vue) return null;
  return <VignetteVue vue={vue} titre={exemple.titre} />;
}

/** Une vue isometrique deja calculee (catalogue, element de facade) : les facettes, teintees par leur exposition. */
export function VignetteVue({ vue, titre }: { vue: VueIso; titre: string }) {
  return (
    <svg className="chaineVignette" viewBox={'0 0 ' + Math.round(vue.largeur) + ' ' + Math.round(vue.hauteur)} role="img" aria-label={'Vue 3D : ' + titre}>
      {vue.facettes.map((f, i) => {
        const g = Math.round(60 + f.ton * 170);
        const fill = f.mur ? 'rgb(' + g + ',' + (g - 8) + ',' + (g - 20) + ')' : 'rgb(' + g + ',' + Math.round(g * 0.45) + ',' + Math.round(g * 0.35) + ')';
        return <polygon key={i} points={f.points.map((p) => p.join(',')).join(' ')} fill={fill} stroke="currentColor" strokeWidth="0.6" strokeLinejoin="round" />;
      })}
    </svg>
  );
}

function Ligne({ n, filtre, parId }: { n: NoeudVivant; filtre: Filtre; parId: Map<string, NoeudChaine> }) {
  const renvoi = n.voir ? parId.get(n.voir) : undefined;
  return (
    <div className="chaineLigne" data-genre={n.genre} data-mode={n.mode ?? ''} data-attenue={filtre !== 'tous' && n.mode !== filtre ? 'oui' : undefined}>
      {n.forme && <VignetteToit forme={n.forme} />}
      <div className="chaineTexte">
        <div className="chaineTitre">
          <span className="chaineGenre">{GENRES[n.genre]}</span>
          <strong id={'chaine-' + n.id}>{n.titre}</strong>
          {n.mode && <span className="chaineMode" data-mode={n.mode}>{MODES[n.mode]}</span>}
          {n.lu && <span className="chaineLu" title="Cette ligne vient des données : elle n’est écrite nulle part">Lu des données</span>}
        </div>
        {n.detail && <p className="chaineDetail">{n.detail}</p>}
        {n.lignes && n.lignes.length > 0 && (
          <ul className="chaineSeuils" aria-label={'Seuils : ' + n.titre}>
            {n.lignes.map((l) => <li key={l.nom} title={l.pourquoi}><code>{l.nom}</code> <span>{l.valeur}</span></li>)}
          </ul>
        )}
        <div className="chaineLiens">
          {n.ecran && <a href={n.ecran} className="chaineEcran">Ouvrir l’écran</a>}
          {renvoi && <a href={'#chaine-' + renvoi.id} className="chaineVoir">{'Voir : ' + renvoi.titre}</a>}
          {n.ou && <code className="chaineOu">{n.ou}</code>}
        </div>
      </div>
    </div>
  );
}

function Branche({ a, filtre, parId, niveau }: { a: ArbreNoeud<NoeudVivant>; filtre: Filtre; parId: Map<string, NoeudChaine>; niveau: number }) {
  const formes = a.enfants.filter((e) => e.noeud.forme);
  const autres = a.enfants.filter((e) => !e.noeud.forme);
  return (
    <li className="chaineNoeud" data-niveau={niveau}>
      <Ligne n={a.noeud} filtre={filtre} parId={parId} />
      {formes.length > 0 && (
        <ul className="chaineGalerie" aria-label={'Objets 3D : ' + a.noeud.titre}>
          {formes.map((f) => <li key={f.noeud.id}><Ligne n={f.noeud} filtre={filtre} parId={parId} /></li>)}
        </ul>
      )}
      {autres.length > 0 && <ul className="chaineListe">{autres.map((e) => <Branche key={e.noeud.id} a={e} filtre={filtre} parId={parId} niveau={niveau + 1} />)}</ul>}
    </li>
  );
}

export function EcranChaine({ chaine, retour = '?admin' }: { chaine: ChaineVivante; retour?: string }) {
  const [filtre, setFiltre] = useState<Filtre>('tous');
  const { noeuds, problemes: erreurs, lecture } = chaine;
  const arbre = useMemo(() => construireArbre(noeuds), [noeuds]);
  const parId = useMemo(() => new Map<string, NoeudChaine>(noeuds.map((n) => [n.id, n])), [noeuds]);
  const modes = useMemo(() => repartitionDesModes(noeuds), [noeuds]);
  const total = modes.auto + modes.manuel + modes.mixte;
  return (
    <div className="consEcran chaineEcran">
      <header className="consEntete">
        <a className="ecranRetour" href={retour}><span aria-hidden="true">←</span> Retour au plan</a>
        <h1 className="palTitre">De l’IGN à ma maison</h1>
        <p className="palSous">
          La chaîne de bout en bout : les sources, le polygone, le découpage du toit en corps, les objets 3D, les textures, la réconciliation et
          le processus d’audit. Chaque ligne dit si elle se décide seule, à la main, ou les deux, et renvoie vers l’écran qui la règle quand il existe.
        </p>
      </header>
      <p className="chaineLecture" aria-live="polite">
        {'Lu en direct des fichiers : prompt v' + lecture.promptVersion + ', schéma v' + lecture.schemaVersion + ', lecture des toits v' + lecture.lectureToits + ' · '
          + lecture.sources + ' sources, ' + lecture.attributs + ' attributs, ' + lecture.seuils + ' seuils, ' + lecture.sujets + ' sujets · empreintes ' + lecture.empreintes.reconciliation + ' (réconciliation), ' + lecture.empreintes.reglagesToits + ' (réglages des toits).'}
      </p>
      {erreurs.length > 0 && <ul className="chaineErreur" role="alert" aria-label="Ce qui n’est plus à jour">{erreurs.map((e) => <li key={e}>{e}</li>)}</ul>}
      <nav className="chaineSchema" aria-label="Les étapes">
        <ol>{arbre.map((a, i) => (
          <li key={a.noeud.id}>
            <a href={'#chaine-' + a.noeud.id}>{a.noeud.titre.replace(/^\d+\.\s*/, '')}</a>
            {i < arbre.length - 1 && <span aria-hidden="true" className="chaineFleche">→</span>}
          </li>
        ))}</ol>
      </nav>
      <div className="segmente chaineFiltre" role="group" aria-label="Montrer selon le mode de décision">
        {([['tous', 'Tout (' + total + ')'], ['auto', 'Automatique (' + modes.auto + ')'], ['mixte', 'Les deux (' + modes.mixte + ')'], ['manuel', 'Manuel (' + modes.manuel + ')']] as const).map(([id, libelle]) => (
          <button key={id} type="button" className={filtre === id ? 'actif' : ''} aria-pressed={filtre === id} onClick={() => setFiltre(id)}>{libelle}</button>
        ))}
      </div>
      {arbre.map((a) => (
        <section key={a.noeud.id} className="chaineEtape" aria-labelledby={'chaine-' + a.noeud.id}>
          <h2 id={'chaine-' + a.noeud.id} className="chaineEtapeTitre">{a.noeud.titre}</h2>
          {a.noeud.detail && <p className="chaineDetail">{a.noeud.detail}</p>}
          <ul className="chaineListe">{a.enfants.map((e) => <Branche key={e.noeud.id} a={e} filtre={filtre} parId={parId} niveau={1} />)}</ul>
        </section>
      ))}
    </div>
  );
}
