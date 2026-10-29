// Z6, onglet PLU : le zonage d'urbanisme de la parcelle, tel que le Geoportail de l'urbanisme l'a
// renvoye et tel qu'il est enregistre sur la parcelle.
//
// C'est une information de reperage, pas une autorisation. L'interrogation est une commande
// (`plu.interroger`, capacite `plu`) ; le service dit si elle est en cours, pour griser le bouton
// pendant l'appel.
//
// Sous le zonage, le reglement de la zone (lot L4) : « Lire le règlement de la zone avec Claude » (`plu.lireReglement`) range sur
// la parcelle des regles PROPOSEES, chacune avec son article et sa citation ; une case (`plu.validerFait`) la retient une fois
// comparee au texte. Puis « Conformité PLU » : le projet controle contre les regles retenues, en avertissements, jamais un blocage
// (engine/regles/plu/conformite.ts, lu par le service des resultats). L'onglet ne calcule rien lui-meme.

import { lienGeoportailUrbanisme, lienTerritoireUrbanisme } from '../../geo/apiIgn.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import { useCommandes } from '../composants/abonnement.js';
import { GRANDEURS_PLU, valeurLisible, type FaitPlu, type ReglementPlu } from '../../regles/plu/faits.js';
import type { VerdictPlu } from '../../engine/regles/plu/conformite.js';
import type { Resultats } from '../../app/resultats.js';
import type { RegistreCommandes } from '../../app/commandes.js';

type Ligne = [string, React.ReactNode];

const lienExterne = (href: string, texte: string) => <a href={href} target="_blank" rel="noopener">{texte}</a>;
const discret = (texte: string) => <><br /><span className="discret">{texte}</span></>;

function Contenu({ resultats }: { resultats: Resultats }) {
  const parcelle = resultats.parcelle();
  if (!parcelle) {
    return <div className="hint">Aucune parcelle dans ce plan : le PLU s'interroge au centre de la parcelle. Importe une parcelle depuis une adresse, ou regle "Fonction" sur "terrain" pour l'objet concerne.</div>;
  }
  const lieu = resultats.lieu();
  const point = <div className="hint">{'Point interroge : ' + lieu.latitude.toFixed(6).replace('.', ',') + '° N, ' +
    lieu.longitude.toFixed(6).replace('.', ',') + '° E (centre de « ' + parcelle.name + ' »).'}</div>;
  const plu = parcelle.plu;
  if (!plu) return <>{point}<div className="hint">Aucun zonage enregistre pour cette parcelle. Clique sur « Interroger le Geoportail de l'urbanisme ».</div></>;

  const lignes: Ligne[] = [];
  if (plu.commune) lignes.push(['Commune', plu.commune.nom + ' (INSEE ' + plu.commune.insee + ')' + (plu.commune.rnu ? ' — au RNU' : '')]);
  if (!plu.zones.length) {
    lignes.push(['Zonage', plu.commune && plu.commune.rnu
      ? 'Commune au RNU : pas de document d\'urbanisme local, ce sont les regles nationales qui s\'appliquent.'
      : 'Aucune zone renvoyee pour ce point (document non verse au Geoportail, ou parcelle hors zonage).']);
  }
  plu.zones.forEach((z, i) => {
    lignes.push([plu.zones.length > 1 ? 'Zone ' + (i + 1) : 'Zone', <><b>{z.libelle}</b>{z.typezone ? ' — type ' + z.typezone : ''}</>]);
    if (z.libelong) lignes.push(['Libellé', z.libelong]);
    if (z.datappro) lignes.push(['Approbation', z.datappro]);
    if (z.urlfic) lignes.push(['Règlement', lienExterne(z.urlfic, (z.nomfic || 'document PDF') + ' ↗')]);
    if (z.partition) lignes.push(['Document', z.partition]);
  });
  (plu.prescriptions || []).forEach((p, i) => {
    lignes.push(['Prescription ' + (i + 1), <>{(p.libelle || '') + (p.typepsc ? ' (' + p.typepsc + ')' : '')}{p.urlfic ? <> {lienExterne(p.urlfic, '↗')}</> : null}</>]);
  });
  (plu.informations || []).forEach((info, i) => {
    lignes.push(['Information ' + (i + 1), <>{info.libelle || ''}{info.urlfic ? <> {lienExterne(info.urlfic, (info.nomfic || 'notice') + ' ↗')}</> : null}</>]);
  });
  // Servitudes d'utilite publique : le SPR (AC4) est mis en avant separement - c'est celle qui change
  // le plus concretement ce qu'on a le droit de construire et l'aspect impose.
  (plu.spr || []).forEach(s => {
    lignes.push(['SPR', <><b>{s.nom}</b>{s.assiette ? ' — ' + s.assiette : ''}
      {s.source ? discret('Précision de la limite : ' + s.source) : null}
      {s.fichier ? discret('Acte : ' + s.fichier) : null}
      {discret('Site patrimonial remarquable : tous les travaux visibles depuis l\'espace public sont soumis à l\'avis de l\'Architecte des Bâtiments de France.')}</>]);
  });
  // Comparaison par contenu et non par identite d'objet : apres un aller-retour JSON (projet
  // enregistre puis rouvert), `spr` et `servitudes` sont deux copies distinctes.
  const cleSup = (s: { type?: string; nom?: string; fichier?: string }) => (s.type || '') + '|' + (s.nom || '') + '|' + (s.fichier || '');
  const clesSpr = new Set((plu.spr || []).map(cleSup));
  (plu.servitudes || []).filter(s => !clesSpr.has(cleSup(s))).forEach((s, i) => {
    lignes.push(['Servitude ' + (i + 1) + (s.type ? ' (' + s.type + ')' : ''), <><b>{s.nom}</b>
      {(s.generateur ? ' — ' + s.generateur : '') + (s.nature ? ' ' + s.nature : '')}
      {s.assiette ? discret('Assiette : ' + s.assiette + ' (' + s.forme + ')') : null}
      {s.fichier ? discret('Acte : ' + s.fichier) : null}</>]);
  });
  if (!(plu.servitudes || []).length) lignes.push(['Servitudes', 'Aucune servitude d\'utilité publique renvoyée pour ce point.']);
  if (plu.document) lignes.push(['Document d\'urbanisme', plu.document.nom + (plu.document.type ? ' (' + plu.document.type + ')' : '')]);
  // Les actes des servitudes et les annexes n'ont pas d'URL directe dans l'API : la page territoire
  // de la commune est le seul endroit qui les rassemble tous.
  if (plu.commune && plu.commune.insee) {
    lignes.push(['Tous les documents', lienExterne(lienTerritoireUrbanisme(plu.commune.insee), 'Page territoire ' + plu.commune.insee + ' — règlement, annexes, actes des servitudes ↗')]);
  }
  if (plu.interrogeLe) lignes.push(['Interrogé le', new Date(plu.interrogeLe).toLocaleString('fr-FR')]);

  return (
    <>
      {point}
      <table className="attrTable"><tbody>
        {lignes.map(([cle, valeur], i) => <tr key={i}><td className="cleTableau">{cle}</td><td>{valeur}</td></tr>)}
      </tbody></table>
    </>
  );
}

const fr = (v: number, d: number) => v.toFixed(d).replace('.', ',');
const lienPage = (r: ReglementPlu, page: number | null) => r.source.url + (page ? '#page=' + page : '');

/** L'en-tete d'une lecture : la source, la date, le modele, les versions, le cout ; « synthétique » pour une lecture de simulation. */
function SourceLecture({ r }: { r: ReglementPlu }) {
  const l = r.lecture, s = r.source;
  return (
    <div className="hint" id="pluSourceLecture">
      {'Zone ' + r.zone + (r.zoneLue && r.zoneLue !== r.zone ? ' (chapitre lu : ' + r.zoneLue + ')' : '') + ' — '}
      {lienExterne(lienPage(r, s.pages[0]), 'règlement, pages ' + s.pages[0] + ' à ' + s.pages[1] + ' sur ' + s.pagesDocument + ' ↗')}
      {discret('Lu le ' + new Date(l.demandeeLe).toLocaleString('fr-FR') + ' par ' + (l.synthetique ? 'une réponse synthétique (pas Claude)' : l.modele)
        + ', prompt v' + l.prompt + ', schéma v' + l.schema + (l.cout !== null ? ', ' + fr(l.cout, 4) + ' $' : '')
        + ' ; extrait ' + s.empreinte.slice(0, 12) + '…, ' + Math.round(s.octets / 1024) + ' Ko.')}
    </div>
  );
}

/** Une regle lue : la case qui la retient, ce qu'elle fixe, son article et sa citation mot pour mot. */
function LigneFait({ f, r, commandes }: { f: FaitPlu; r: ReglementPlu; commandes: RegistreCommandes }) {
  const etat = commandes.etat('plu.validerFait');
  if (commandes.effacee('plu.validerFait')) return null;
  const titre = GRANDEURS_PLU[f.grandeur].libelle;
  return (
    <tr className={'pluFait pluFait-' + f.statut} data-fait={f.id}>
      <td>
        <label className="pluCase">
          <input type="checkbox" checked={f.statut === 'valide'} disabled={!etat.utilisable} data-commande="plu.validerFait"
            title={'message' in etat ? etat.message : undefined} aria-label={'Retenir : ' + titre + ' ' + valeurLisible(f)}
            onChange={(e) => { commandes.executer('plu.validerFait', e.currentTarget, { valeur: f.id }); }} />
          <span>{f.statut === 'valide' ? 'Vérifiée' + (f.valideLe ? ' le ' + f.valideLe : '') : 'À vérifier'}</span>
        </label>
      </td>
      <td>
        <b>{titre}</b>{' : ' + valeurLisible(f)}
        {f.condition ? discret('Si : ' + f.condition) : null}
        <blockquote className="pluCitation">« {f.citation} »</blockquote>
        <span className="discret">{f.article}{f.page ? <> — {lienExterne(lienPage(r, f.page), 'page ' + f.page + ' ↗')}</> : null}{' — confiance ' + f.confiance}</span>
      </td>
    </tr>
  );
}

const MOT_ETAT: Record<VerdictPlu['etat'], string> = { ecart: 'Écart', 'a-verifier': 'À vérifier', conforme: 'Conforme' };

/** La conformite du projet aux regles retenues : avertissements, jamais un blocage. */
function Conformite({ resultats, r }: { resultats: Resultats; r: ReglementPlu }) {
  const c = resultats.conformitePlu();
  const retenues = r.faits.filter((f) => f.statut === 'valide').length;
  const ordre: VerdictPlu['etat'][] = ['ecart', 'a-verifier', 'conforme'];
  const verdicts = [...c.verdicts].sort((a, b) => ordre.indexOf(a.etat) - ordre.indexOf(b.etat));
  return (
    <div id="pluConformite">
      <div className="sectionTitle">Conformité PLU</div>
      {c.zoneChangee && <div className="hint pluAlerte">Le zonage enregistré ne nomme plus la zone {r.zone} : relisez le règlement de la zone actuelle.</div>}
      {!retenues
        ? <div className="hint">Aucune règle retenue : cochez celles que vous avez vérifiées dans le texte pour contrôler le projet.</div>
        : <div className="hint" id="pluBilan">{c.ecarts + ' écart(s), ' + c.aVerifier + ' point(s) à vérifier, ' + c.conformes + ' conforme(s), sur ' + retenues + ' règle(s) retenue(s).'}</div>}
      {verdicts.length > 0 && <ul className="pluVerdicts">
        {verdicts.map((v, i) => <li key={i} className={'pluVerdict pluVerdict-' + v.etat} data-etat={v.etat}><b>{MOT_ETAT[v.etat]}</b> — {v.message}</li>)}
      </ul>}
      {retenues > 0 && !verdicts.length && <div className="hint">Aucun ouvrage du projet n’est concerné par les règles retenues.</div>}
      <div className="hint">Ces avertissements ne bloquent rien : seul le service urbanisme de la commune dit si un projet est conforme.</div>
    </div>
  );
}

/** Le reglement de la zone : le bouton de lecture (et sa raison quand il est grise), la source, les regles, la conformite. */
function Reglement({ resultats, commandes }: { resultats: Resultats; commandes: RegistreCommandes }) {
  useCommandes(commandes, 'plu.lireReglement', 'plu.validerFait');
  if (commandes.effacee('plu.lireReglement')) return null;
  const r = resultats.parcelle()?.reglementPlu ?? null;
  const etat = commandes.etat('plu.lireReglement');
  const raison = !etat.utilisable && 'message' in etat ? etat.message : null;
  return (
    <div id="pluReglement">
      <div className="sectionTitle">Règlement de la zone</div>
      <div className="controls" role="group" aria-label="Règlement de la zone">
        <BoutonCommande commandes={commandes} id="plu.lireReglement" className="secondary" enCours={resultats.lecturePluEnCours() && 'Lecture du règlement…'}>
          {r ? 'Relire le règlement avec Claude' : 'Lire le règlement de la zone avec Claude'}
        </BoutonCommande>
      </div>
      {raison && <div className="hint">{raison}</div>}
      {!r && <div className="hint">Claude lit les pages du règlement de la zone et en relève les hauteurs, les reculs, l’emprise, les espaces verts, les toitures et les clôtures, chacune avec son article et sa citation. Rien ne sert avant que vous ne l’ayez vérifiée.</div>}
      {r && <>
        <SourceLecture r={r} />
        {r.remarques && <div className="hint">{r.remarques}</div>}
        {r.faits.length
          ? <table className="attrTable pluFaits"><tbody>{r.faits.map((f) => <LigneFait key={f.id} f={f} r={r} commandes={commandes} />)}</tbody></table>
          : <div className="hint">Aucune règle relevée dans l’extrait.</div>}
        <Conformite resultats={resultats} r={r} />
      </>}
    </div>
  );
}

export function Plu({ resultats, commandes }: { resultats: Resultats; commandes: RegistreCommandes }) {
  const parcelle = resultats.parcelle();
  const lieu = parcelle ? resultats.lieu() : null;
  return (
    <>
      <div className="sectionTitle">PLU — règles d'urbanisme de la parcelle</div>
      <div className="controls">
        <BoutonCommande commandes={commandes} id="plu.interroger" className="secondary" enCours={resultats.pluEnCours() && 'Interrogation…'}>
          Interroger le Géoportail de l'urbanisme
        </BoutonCommande>
        {lieu && <a id="pluGeoportailLien" href={lienGeoportailUrbanisme(lieu.longitude, lieu.latitude)} target="_blank" rel="noopener" className="hint">
          Ouvrir la parcelle sur le Géoportail de l'urbanisme ↗</a>}
      </div>
      <div id="pluContenu"><Contenu resultats={resultats} /></div>
      {parcelle && <Reglement resultats={resultats} commandes={commandes} />}
      <div className="hint">Le zonage vient du Géoportail de l'urbanisme (données versées par la commune) et reste attaché à la parcelle : il se sauvegarde avec le projet. C'est une information de repérage, pas une autorisation : seul le règlement complet, et le service urbanisme de la commune, font foi.</div>
    </>
  );
}
