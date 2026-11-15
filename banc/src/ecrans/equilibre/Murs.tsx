// Les murs dans l'ecran d'equilibre (demande du proprietaire, 15 novembre 2026 : « Avoid having 2 times the same building ») : les
// doublons deja dans le banc, montres ensemble mur par mur pour en ecarter (rien ne part d'office), et le rattrapage du mur des images
// importees avant que l'import ne le garde.

import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import { TYPES_DE_BATIMENT, typeDeBatiment, type GroupeDeMur } from '../../murs.js';
import type { MetaImage } from '../../types.js';
import { Icone } from '../../ui/Icones.js';
import { Jauge, Section } from '../../ui/Page.js';
import { useMurs } from './useMurs.js';

const LIBELLE_STATUT: Record<MetaImage['statut'], string> = { importee: 'importée', redressee: 'redressée', validee: 'validée', brouillon: 'brouillon', corrigee: 'corrigée', rejetee: 'rejetée' };
const libelleType = (g: GroupeDeMur) => { const m = g.images[0]?.mur; return m ? TYPES_DE_BATIMENT.find((t) => t.cle === typeDeBatiment(m))?.libelle ?? '' : ''; };

export function MursDuBanc({ banc }: { banc: Banc }) {
  const c = useMurs(banc);
  const occupe = !!c.avance;
  return <>
    <Section titre="Doublons : le même mur en plusieurs images" compte={c.groupes.length ? `${c.groupes.length} mur(s), ${c.enTrop} image(s) en trop` : 'aucun'} repliable ouverte={c.groupes.length > 0}>
      {c.groupes.length ? <>
        <p className="aide">Deux images du même bâtiment vu par le même côté n’apprennent presque rien de plus au modèle, et faussent les blocs si l’une part en entraînement et l’autre en test. La première de chaque ligne est celle qu’on garderait (la plus avancée dans le travail, puis la mieux notée). Rien n’est écarté d’office : une image écartée passe « rejetée » et se retrouve dans la mosaïque.</p>
        <ul className="doublons">
          {c.groupes.map((g) => (
            <li key={g.cle} className="groupe-doublons">
              <header>
                <strong>{libelleType(g) || 'Bâtiment'} <code>{g.batiment.slice(-8)}</code>, côté {g.cote + 1}</strong>
                <span className="compte-section">{g.images.length} images</span>
                <span className="espace" />
                <button type="button" onClick={() => { void c.ecarter(g.images.slice(1)); }} title="Garde la première image, écarte les autres (elles passent « rejetées »)"><Icone nom="rejeter" taille={16} /> Ne garder que la première</button>
              </header>
              <ul className="images-doublons">
                {g.images.map((m, k) => (
                  <li key={m.id} className={k === 0 ? 'gardee' : ''}>
                    {m.statut === 'brouillon' || m.statut === 'corrigee'
                      ? <button type="button" className="vignette-bouton" onClick={() => banc.ouvrir(m.id, g.images.map((x) => x.id))} title="Ouvrir dans l’éditeur"><img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt={m.nom ?? m.id} loading="lazy" /></button>
                      : <span className="vignette-bouton"><img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt={m.nom ?? m.id} loading="lazy" /></span>}
                    <small>{LIBELLE_STATUT[m.statut]}{typeof m.mur?.note === 'number' ? ` · note ${m.mur.note}` : ''}{m.date ? ` · ${m.date.slice(0, 7)}` : ''}</small>
                    {k === 0 ? <span className="puce ok">à garder</span> : <button type="button" className="discret" onClick={() => { void c.ecarter([m]); }}>Écarter</button>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </> : <p className="aide">Aucun mur n’a plus d’une image, parmi les images dont le mur est connu. L’import ne propose plus cochée une vue d’un mur déjà dans le banc.</p>}
    </Section>
    {(c.attente.length > 0 || c.bilan) && (
      <Section titre="Images sans mur connu" compte={`${c.attente.length} à chercher`}>
        {c.attente.length > 0 && <p className="aide">Ces images ont été importées avant que l’import ne garde le mur visé. Le rattrapage le retrouve par leur position et leur cap, sur les bâtiments de la BD TOPO de l’IGN, avec les règles du tri de l’import ; il ne lit pas l’image. {c.lot} image(s) par lancement, une lecture par quartier.</p>}
        <div className="rang">
          {c.avance ? <>
            <span className="avance"><Jauge valeur={c.avance.fait} cible={c.avance.total} /> {c.avance.fait} sur {c.avance.total}…</span>
            <button type="button" onClick={c.arreter}>Arrêter</button>
          </> : c.attente.length > 0 && <button type="button" className="principal" disabled={occupe} onClick={() => { void c.rattraper(); }}><Icone nom="auto" /> Retrouver le mur de {c.lot} image(s)</button>}
          {c.bilan && <span className="etat" role="status">{c.bilan}</span>}
        </div>
      </Section>
    )}
  </>;
}
