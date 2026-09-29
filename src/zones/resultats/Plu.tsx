// Z6, onglet PLU : le zonage d'urbanisme de la parcelle, tel que le Geoportail de l'urbanisme l'a
// renvoye et tel qu'il est enregistre sur la parcelle.
//
// C'est une information de reperage, pas une autorisation. L'interrogation est une commande
// (`plu.interroger`, capacite `plu`) ; le service dit si elle est en cours, pour griser le bouton
// pendant l'appel.

import { lienGeoportailUrbanisme, lienTerritoireUrbanisme } from '../../geo/apiIgn.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
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
      <div className="hint">Le zonage vient du Géoportail de l'urbanisme (données versées par la commune) et reste attaché à la parcelle : il se sauvegarde avec le projet. C'est une information de repérage, pas une autorisation : seul le règlement complet, et le service urbanisme de la commune, font foi.</div>
    </>
  );
}
