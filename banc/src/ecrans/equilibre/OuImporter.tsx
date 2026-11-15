// « Ou importer ensuite » (demande du proprietaire, 15 novembre 2026, « niveau suivant » n° 8) : trois a cinq zones la ou le jeu est
// pauvre et ou Panoramax a des photos, chacune avec le geste qui ouvre l'import en lot sur elle. Une heuristique simple, dite comme
// telle (ouImporter.ts) : rien n'est demande au reseau avant qu'on le lance.

import { useMemo, useState } from 'react';
import type { Banc } from '../../App.js';
import type { Equilibre } from '../../equilibre.js';
import { PAUSE_ENTRE_REQUETES_MS } from '../../lot.js';
import { aDesPhotos, avisDeSaison, COTE_PROPOSE_M, ouImporter, PROPOSITIONS_MAX, SONDES_MAX, urlSondeDuLieu, zoneDuLieu, type Proposition } from '../../ouImporter.js';
import { Icone } from '../../ui/Icones.js';
import { Section } from '../../ui/Page.js';

export function OuImporter({ banc, e }: { banc: Banc; e: Equilibre }) {
  const rangees = useMemo(() => ouImporter(e), [e]);
  const [couvertes, setCouvertes] = useState<Proposition[] | null>(null);
  const [etat, setEtat] = useState<string | null>(null);
  const saison = avisDeSaison(e);

  /** Sonde les lieux les mieux places, un par un, jusqu'a en avoir assez : une photo demandee a Panoramax pour chacun, une pause entre deux. */
  const chercher = async () => {
    const gardees: Proposition[] = [];
    let sondes = 0, pannes = 0;
    setCouvertes(null);
    for (const p of rangees) {
      if (gardees.length >= PROPOSITIONS_MAX || sondes >= SONDES_MAX) break;
      setEtat(`Couverture de Panoramax : ${p.lieu.nom}…`);
      sondes++;
      try {
        const r = await fetch(urlSondeDuLieu(p.lieu));
        if (r.status === 429) { setEtat('Panoramax limite les requêtes : réessayez dans quelques minutes.'); break; }
        if (r.ok && aDesPhotos(await r.json())) gardees.push(p);
      } catch { pannes++; }
      await new Promise((ok) => setTimeout(ok, PAUSE_ENTRE_REQUETES_MS));
    }
    setCouvertes(gardees);
    setEtat((x) => (x?.startsWith('Panoramax limite') ? x : pannes ? `${pannes} lieu(x) n’ont pas pu être sondés.` : null));
  };
  const ouvrir = (p: Proposition) => { banc.demanderZone(zoneDuLieu(p.lieu)); banc.aller('import'); };

  return (
    <Section titre="Où importer ensuite" compte={couvertes ? `${couvertes.length} zone(s)` : undefined}
      actions={<button type="button" disabled={!!etat && etat.startsWith('Couverture')} onClick={() => { void chercher(); }}><Icone nom="auto" taille={16} /> {couvertes ? 'Chercher de nouveau' : 'Chercher où importer'}</button>}>
      <p className="aide">Une heuristique simple, sans modèle : vingt-six communes (une grande ville et une petite par région), rangées par ce qui manque au jeu — la région d’abord, puis le type de bâtiment qu’on y trouve surtout (des immeubles au centre d’une grande ville, des maisons dans une petite) —, et gardées seulement si Panoramax y a des photos (une requête par commune, {SONDES_MAX} au plus). La zone proposée est un carré de {(COTE_PROPOSE_M / 1000).toString().replace('.', ',')} km autour du centre.</p>
      {etat && <p className="etat" role="status">{etat}</p>}
      {couvertes && (couvertes.length ? (
        <ul className="ou-importer">
          {couvertes.map((p) => (
            <li key={p.lieu.nom}>
              <div><strong>{p.lieu.nom}</strong> <small>{p.lieu.region} · surtout des {p.lieu.type === 'immeuble' ? 'immeubles' : 'maisons'}</small><br /><span className="raisons">{p.raisons.join(' ; ')}</span></div>
              <button type="button" className="principal" onClick={() => ouvrir(p)}><Icone nom="importer" taille={16} /> Importer cette zone en lot</button>
            </li>
          ))}
        </ul>
      ) : !etat && <p className="aide">Aucun des lieux sondés n’a de photo de Panoramax : la couverture est peut-être indisponible.</p>)}
      {saison && <p className="aide">{saison}</p>}
    </Section>
  );
}
