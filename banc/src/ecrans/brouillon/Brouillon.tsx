// Etape 3 : le marquage brouillon, en lot sur les photos validees. Les modeles actifs (ceux du depot facade, puis les votres) et
// l'algorithme de recherche des baies proposent des rectangles ; la personne les corrige ensuite (etape 4).

import type { Banc } from '../../App.js';
import { Icone } from '../../ui/Icones.js';
import { Jauge, Page, Section, Vide } from '../../ui/Page.js';
import { Modeles } from './Modeles.js';
import { useBrouillon } from './useBrouillon.js';

export function EcranBrouillon({ banc }: { banc: Banc }) {
  const c = useBrouillon(banc);
  const aRelire = banc.images.filter((m) => m.statut === 'brouillon').map((m) => m.id);
  const sources = [...c.actifs.map((m) => m.nom), ...(c.recherche ? ['recherche des baies'] : [])];
  return (
    <Page icone="brouillon" numero="3" titre="Pré-marquage"
      aide={<p>Sur les photos validées (2a) qui n’ont pas encore de marquage. Les objets proposés sont « auto » : ils ne comptent pour l’apprentissage qu’une fois relus et enregistrés (4).</p>}
      actions={aRelire.length > 0 && <button type="button" onClick={() => banc.ouvrir(aRelire[0] ?? '', aRelire)}><Icone nom="suivant" /> Relire les {aRelire.length} pré-marquée(s)</button>}>
      <Section titre="Marquer en lot">
        {c.cibles.length || c.avance ? (
          <div className="lance-brouillon">
            <div className="options-brouillon">
              <label className="interrupteur-ligne"><span className="interrupteur"><input type="checkbox" checked={c.recherche} onChange={(e) => c.setRecherche(e.target.checked)} /><span /></span> Recherche des baies <small>(sans modèle)</small></label>
              <label className="interrupteur-ligne"><span className="interrupteur"><input type="checkbox" checked={c.refaire} onChange={(e) => c.setRefaire(e.target.checked)} /><span /></span> Aussi les photos déjà marquées <small>(garde ce qui a été fait à la main)</small></label>
            </div>
            <button type="button" className="principal grand" disabled={!c.possible} onClick={() => { void c.marquer(c.cibles); }}>
              <Icone nom="brouillon" /> Pré-marquer {c.cibles.length} photo(s)
            </button>
            <p className="aide">{sources.length ? `Avec ${sources.join(', ')}.` : 'Activez un modèle ou la recherche des baies.'}</p>
            {c.avance && <span className="avance"><Jauge valeur={c.avance.fait} cible={c.avance.total} /> Pré-marquage {c.avance.fait + 1} sur {c.avance.total}…</span>}
          </div>
        ) : (
          <Vide icone="brouillon" titre="Aucune photo à pré-marquer" texte={c.bilan ? `${c.bilan.photos} photo(s) pré-marquée(s), ${c.bilan.objets} objet(s) proposé(s) : à relire.` : 'Les photos validées (étape 2a) arrivent ici. Cochez « Aussi les photos déjà marquées » pour repasser sur les autres.'}
            action={<label className="interrupteur-ligne"><span className="interrupteur"><input type="checkbox" checked={c.refaire} onChange={(e) => c.setRefaire(e.target.checked)} /><span /></span> Aussi les photos déjà marquées</label>} />
        )}
      </Section>
      <Modeles banc={banc} />
    </Page>
  );
}
