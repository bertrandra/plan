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
      aide={<><p>Les verticales et horizontales du mur deviennent droites : par les points de fuite de la photo (automatique), sinon par quatre coins d’un rectangle du mur posés à la main. Une photo redressée de nouveau perd son marquage (il est gardé à part sur le serveur).</p><p>Touchez des photos pour les choisir : « Déjà de face » les passe telles quelles au tri ; « Rejeter » les sort du jeu ; « Fusionner » assemble les photos d’un même mur, choisies de gauche à droite, en une seule (l’assemblage de Plan : la place où leurs parties communes se ressemblent le plus, puis un fondu).</p></>}
      actions={c.nouvelles.length > 0 && <button type="button" className="principal" disabled={occupe} onClick={() => { void c.auto(c.nouvelles); }}><Icone nom="auto" /> Redresser les {c.nouvelles.length} (auto)</button>}>
      <div className="barre-outils">
        <Segments label="Filtre" valeur={c.filtre} options={filtres} onChange={c.setFiltre} />
        {c.avance && <span className="avance"><Jauge valeur={c.avance.fait} cible={c.avance.total} /> {c.choix.length > 1 ? 'Fusion…' : `${c.avance.fait + 1} sur ${c.avance.total}…`}</span>}
      </div>
      {c.choix.length > 0 && (
        <div className="barre-choix" role="toolbar" aria-label="Photos choisies">
          <strong>{c.choix.length} choisie(s)</strong>
          <button type="button" disabled={occupe} onClick={() => { void c.garderLes(c.choisies); }} title="Elles sont déjà de face : au tri telles quelles"><Icone nom="face" /> Déjà de face</button>
          <button type="button" disabled={occupe} onClick={() => { void c.auto(c.choisies); }}><Icone nom="auto" /> Auto</button>
          <button type="button" className="principal" disabled={occupe || c.choix.length < 2} onClick={() => { void c.fusionner(); }}
            title="Plusieurs photos d’un même mur, choisies de gauche à droite, en une seule image"><Icone nom="mosaique" /> Fusionner ({c.choix.length})</button>
          <button type="button" className="danger" disabled={occupe} onClick={() => { void c.rejeter(c.choisies); }} title="Elles sortent du jeu (au tri, sous « Rejetées »)"><Icone nom="rejeter" /> Rejeter ({c.choix.length})</button>
          {c.choix.length > 1 && <label className="case"><input type="checkbox" checked={c.ecarter} onChange={(e) => c.setEcarter(e.target.checked)} /> Rejeter les photos d’origine</label>}
          <span className="espace" />
          <button type="button" className="discret" onClick={c.viderChoix}><Icone nom="fermer" /> Vider</button>
        </div>
      )}
      {c.choix.length === 1 && <p className="aide">Pour fusionner, choisissez les photos d’un même mur <b>de gauche à droite</b> : le numéro dit l’ordre.</p>}
      {c.liste.length ? (
        <ul className="grille-photos">
          {c.liste.map((m) => <Carte key={m.id} m={m} echec={c.echecs.has(m.id)} occupe={occupe} rang={c.choix.indexOf(m.id)} onBasculer={() => c.basculer(m.id)} onAuto={() => { void c.auto([m]); }} onMain={() => c.setMain(m)} onGarder={() => { void c.garder(m); }} onRejeter={() => { void c.rejeter([m]); }} />)}
        </ul>
      ) : (
        <Vide icone="redresser" titre={c.filtre === 'toutes' ? 'Aucune photo' : 'Tout est redressé'}
          texte={aValider ? `${aValider} photo(s) redressée(s) attendent le tri.` : 'Importez des photos : elles arrivent ici pour être mises de face.'}
          action={<button type="button" className="principal" onClick={() => banc.aller(aValider ? 'validation' : 'import')}>{aValider ? 'Aller au tri' : 'Importer des photos'}</button>} />
      )}
    </Page>
  );
}

function Carte({ m, echec, occupe, rang, onBasculer, onAuto, onMain, onGarder, onRejeter }: { m: MetaImage; echec: boolean; occupe: boolean; rang: number; onBasculer: () => void; onAuto: () => void; onMain: () => void; onGarder: () => void; onRejeter: () => void }) {
  const fait = m.statut !== 'importee';
  return (
    <li className={'tuile-photo' + (echec ? ' echec' : '') + (rang >= 0 ? ' choisie' : '')}>
      <button type="button" className="vignette-bouton" onClick={onBasculer} aria-pressed={rang >= 0} aria-label={`Choisir ${m.nom ?? m.id}`}>
        <img src={api.fichier(m.id, 'vignette', m.redressement?.le ?? '')} alt="" loading="lazy" />
      </button>
      <span className={'coche-photo' + (rang >= 0 ? ' active' : '')} aria-hidden="true">{rang >= 0 ? rang + 1 : ''}</span>
      {echec ? <span className="etiquette-photo attention droite">Auto échoué</span> : fait && <span className="etiquette-photo ok droite">{m.redressement?.methode ?? 'redressée'}</span>}
      <div className="legende-photo"><span className="nom">{m.nom ?? m.id}</span><small>{m.largeur && m.hauteur ? `${m.largeur}×${m.hauteur}` : ''}{m.focale35 ? ` · ${m.focale35} mm` : ''}</small></div>
      <div className="actions-carte">
        <button type="button" className="icone-seule" disabled={occupe} onClick={onAuto} title="Auto : par les points de fuite" aria-label="Redresser automatiquement"><Icone nom="auto" /></button>
        <button type="button" className={(echec ? 'principal ' : '') + 'icone-seule'} onClick={onMain} title="À la main : quatre coins d’un rectangle du mur" aria-label="Redresser à la main"><Icone nom="main" /></button>
        <button type="button" className="discret" onClick={onGarder} title="La photo est déjà de face : la garder telle quelle"><Icone nom="face" /> De face</button>
        <button type="button" className="discret danger icone-seule" onClick={onRejeter} title="Rejeter : elle sort du jeu (au tri, sous « Rejetées »)" aria-label="Rejeter"><Icone nom="rejeter" /></button>
      </div>
    </li>
  );
}
