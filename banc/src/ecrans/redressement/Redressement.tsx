// Etape 2 : redresser chaque photo importee (vue de face). En lot par les points de fuite ; celles qui echouent, par quatre coins
// poses a la main ; une photo deja de face se garde telle quelle.

import type { Banc } from '../../App.js';
import { api } from '../../api.js';
import type { MetaImage } from '../../types.js';
import { Icone } from '../../ui/Icones.js';
import { Jauge, Page, Segments, Vide } from '../../ui/Page.js';
import { CoinsALaMain } from './CoinsALaMain.js';
import { useRedressement, type FiltreRedressement } from './useRedressement.js';

export function EcranRedressement({ banc }: { banc: Banc }) {
  const c = useRedressement(banc);
  if (c.main) return <CoinsALaMain m={c.main} banc={banc} onFin={c.finMain} />;
  const occupe = !!c.avance;
  const filtres: { valeur: FiltreRedressement; libelle: string }[] = [
    { valeur: 'a-redresser', libelle: `À redresser · ${c.nouvelles.length}` },
    ...(c.echecs.size ? [{ valeur: 'echecs' as const, libelle: `Échecs de l’auto · ${c.echecs.size}` }] : []),
    { valeur: 'toutes', libelle: 'Toutes' },
  ];
  const aValider = banc.images.filter((m) => m.statut === 'redressee').length;
  return (
    <Page icone="redresser" numero="2" titre="Redressement" large
      aide={<p>Les verticales et horizontales du mur deviennent droites : par les points de fuite de la photo (automatique), sinon par quatre coins d’un rectangle du mur posés à la main. Une photo redressée de nouveau perd son marquage (il est gardé à part sur le serveur).</p>}
      actions={c.nouvelles.length > 0 && <button type="button" className="principal" disabled={occupe} onClick={() => { void c.auto(c.nouvelles); }}><Icone nom="auto" /> Redresser les {c.nouvelles.length} (auto)</button>}>
      <div className="barre-outils">
        <Segments label="Filtre" valeur={c.filtre} options={filtres} onChange={c.setFiltre} />
        {c.avance && <span className="avance"><Jauge valeur={c.avance.fait} cible={c.avance.total} /> Redressement {c.avance.fait + 1} sur {c.avance.total}…</span>}
      </div>
      {c.liste.length ? (
        <ul className="grille-photos">
          {c.liste.map((m) => <Carte key={m.id} m={m} echec={c.echecs.has(m.id)} occupe={occupe} onAuto={() => { void c.auto([m]); }} onMain={() => c.setMain(m)} onGarder={() => { void c.garder(m); }} />)}
        </ul>
      ) : (
        <Vide icone="redresser" titre={c.filtre === 'toutes' ? 'Aucune photo' : 'Tout est redressé'}
          texte={aValider ? `${aValider} photo(s) redressée(s) attendent un coup d’œil dans la mosaïque.` : 'Importez des photos : elles arrivent ici pour être mises de face.'}
          action={<button type="button" className="principal" onClick={() => banc.aller(aValider ? 'validation' : 'import')}>{aValider ? 'Aller à la mosaïque' : 'Importer des photos'}</button>} />
      )}
    </Page>
  );
}

function Carte({ m, echec, occupe, onAuto, onMain, onGarder }: { m: MetaImage; echec: boolean; occupe: boolean; onAuto: () => void; onMain: () => void; onGarder: () => void }) {
  const fait = m.statut !== 'importee';
  return (
    <li className={'tuile-photo' + (echec ? ' echec' : '')}>
      <img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt={m.nom ?? m.id} loading="lazy" onClick={onMain} />
      {echec ? <span className="etiquette-photo attention">Auto échoué</span> : fait && <span className="etiquette-photo ok">{m.redressement?.methode ?? 'redressée'}</span>}
      <div className="legende-photo"><span className="nom">{m.nom ?? m.id}</span><small>{m.largeur && m.hauteur ? `${m.largeur}×${m.hauteur}` : ''}{m.focale35 ? ` · ${m.focale35} mm` : ''}</small></div>
      <div className="actions-carte">
        <button type="button" disabled={occupe} onClick={onAuto} title="Par les points de fuite"><Icone nom="auto" /> Auto</button>
        <button type="button" className={echec ? 'principal' : ''} onClick={onMain} title="Quatre coins d’un rectangle du mur"><Icone nom="main" /> À la main</button>
        <button type="button" className="discret" onClick={onGarder} title="La photo est déjà de face : la garder telle quelle"><Icone nom="face" /> De face</button>
      </div>
    </li>
  );
}
