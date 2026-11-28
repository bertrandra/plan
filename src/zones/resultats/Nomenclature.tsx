// Z6, onglet Nomenclature : le metre et les prix de la terrasse, puis les deux debits (lames, bois
// porteur) et les appuis — ce qu'on commande chez le fournisseur.
//
// Rien n'est calcule ici : le BOM est ecrit par `app/resultats.ts` a chaque rafraichissement (il part
// dans le projet enregistre), les debits viennent de `engine/debit.ts`. Chaque saisie passe par
// `resultats.saisir` : elle s'annule et marque le projet modifie.

import { coutDebit, prixBarre, prixM2De, prixPersonnalise, setPrixBarre, setPrixM2, achatPlots, achatVis, prixPlotUnite, prixVisUnite, type ProduitBarre } from '../../engine/prix.js';
import { solDuProjet } from '../../engine/sol.js';
import { computeTerrasseLayers, type CouchesTerrasse } from '../../engine/layers.js';
import { computeDebitLames, computeDebitsBois, type Debit } from '../../engine/debit.js';
import { computeBOM } from '../../engine/bom.js';
import { ESSENCE_PRICES, PLOT_MODELES, SOLIVE_PRICE, VIS_PRICE, estPlots, plotModele } from '../../engine/constantes.js';
import { ensureConstruction } from '../../engine/construction.js';
import { porteeVisM } from '../../engine/bois/portees.js';
import { valeurEnregistree } from '../../model/dictionnaire.js';
import { SaisieNombre, SaisieTexte } from '../composants/Saisie.js';
import type { Resultats } from '../../app/resultats.js';
import type { RegistreCommandes } from '../../app/commandes.js';
import { BoutonCommande } from '../composants/BoutonCommande.js';
import type { Construction, LigneBom, ObjetPlan } from '../../model/types.js';
import { totauxBom, euros, eurosCentimes, origineDuRetenu } from '../../ui/chiffrage.js';

type ChampLongueurs = 'longueursLames' | 'longueursBois' | 'longueursLambourde';

interface PropsTerrasse { obj: ObjetPlan; resultats: Resultats }

const lireNombre = (t: string) => parseFloat(t);

/** Les longueurs que le fournisseur tient, en metres, separees par des virgules. */
function Longueurs({ c, champ, resultats }: { c: Construction; champ: ChampLongueurs; resultats: Resultats }) {
  return (
    <div className="controls">
      <label style={{ fontSize: '0.85rem', marginRight: 6 }}>Longueurs achetables (m) : </label>
      <SaisieTexte controle="nomenclature.longueurs" valeur={c[champ] || ''} titre="Longueurs disponibles chez votre fournisseur, en mètres, séparées par des virgules"
        onValider={(t) => resultats.saisir(() => { c[champ] = t; })} />
    </div>
  );
}

/**
 * Une table de debit : ce qu'on achete, longueur par longueur, et a quoi chaque barre sert. Les deux
 * prix d'une meme barre — a la piece et au m² — se deduisent l'un de l'autre : on saisit celui que
 * le marchand donne, l'autre suit.
 */
function TableDebit({ c, d, cle, resultats }: { c: Construction; d: Debit; cle: ProduitBarre; resultats: Resultats }) {
  const longueurs = Object.keys(d.achats).map(parseFloat).sort((a, b) => b - a);
  return (
    <table className="attrTable">
      <tbody>
        <tr><th>Longueur</th><th>Qté</th><th>Métré</th><th>Prix / barre</th><th>Prix / m²</th><th>Total</th><th>Usage</th></tr>
        {longueurs.map(L => {
          const n = d.achats[L] ?? 0, r = d.roles[L] || { entiere: 0, ajustee: 0, recoupee: 0, troncon: 0, rebutMl: 0, potMl: 0 };
          const parts: string[] = [];
          if (r.entiere) parts.push(r.entiere + ' posée entière (tombe juste)');
          if (r.ajustee) parts.push(r.ajustee + ' arasée, chute ' + Math.round(100 * r.rebutMl / r.ajustee) + ' cm au rebut');
          if (r.recoupee) parts.push(r.recoupee + ' recoupee, ' + Math.round(100 * r.potMl / r.recoupee) + ' cm au pot');
          if (r.troncon) parts.push(r.troncon + ' en tronçon courant, about sur appui');
          const estime = !prixPersonnalise(c, cle, L);
          return (
            <tr key={L}>
              <td>{L.toFixed(2).replace(/\.?0+$/, '') + ' m'}</td>
              <td>{n}</td>
              <td>{(n * L).toFixed(2) + ' ml'}</td>
              <td><SaisieNombre controle="nomenclature.prix" valeur={prixBarre(c, cle, L).toFixed(2)} titre={'Prix d\'une barre de ' + L + ' m'} estime={estime}
                onValider={(t) => { const v = lireNombre(t); resultats.saisir(() => setPrixBarre(c, cle, L, isNaN(v) ? null : v)); }} /></td>
              <td><SaisieNombre controle="nomenclature.prix" valeur={prixM2De(c, cle, L).toFixed(2)} titre="Prix au m² pour cette longueur : il recalcule le prix de la barre" estime={estime}
                onValider={(t) => { const v = lireNombre(t); if (!isNaN(v)) resultats.saisir(() => setPrixM2(c, cle, L, v)); }} /></td>
              <td className="nombre">{eurosCentimes(n * prixBarre(c, cle, L))}</td>
              <td className="noteLigne">{parts.join(' · ') || '—'}</td>
            </tr>
          );
        })}
        <tr style={{ fontWeight: 600 }}>
          <td>Total</td><td>{longueurs.reduce((s, L) => s + (d.achats[L] ?? 0), 0) + ' barres'}</td><td>{d.achatMl.toFixed(2) + ' ml'}</td>
          <td></td><td></td><td>{eurosCentimes(coutDebit(c, d, cle))}</td><td></td>
        </tr>
      </tbody>
    </table>
  );
}

/** Ce qui est reellement pose, ce qui est achete, et ce qui reste en chutes. */
function Bilan({ c, d }: { c: Construction; d: Debit }) {
  const perte = d.achatMl > 0 ? 100 * d.chuteMl / d.achatMl : 0;
  return (
    <div className="hint">
      <b>Bilan.</b>{' Linéaire réellement posé : ' + d.reelMl.toFixed(2) + ' ml. Acheté : ' + d.achatMl.toFixed(2) + ' ml, soit ' +
        perte.toFixed(1) + ' % de chute — dont ' + d.restantMl.toFixed(2) + ' ml en chutes réutilisables restantes (≥ ' +
        (c.chuteMinReutilisable || 50) + ' cm, a garder) et ' + d.perdueMl.toFixed(2) + ' ml de rebut.' +
        (d.pool.length ? ' Chutes en fin de chantier : ' + d.pool.slice(0, 10).map(x => x.toFixed(2) + ' m').join(', ') + (d.pool.length > 10 ? ' …' : '') + '.' : '')}
    </div>
  );
}

/** La table du BOM : estimations, et prix reels saisis ligne par ligne. */
function TableBom({ obj, layers, resultats }: PropsTerrasse & { layers: CouchesTerrasse }) {
  const c = ensureConstruction(obj);
  // Le BOM est ecrit par le service au rafraichissement ; avant le premier, on le lit sans l'ecrire.
  const lignes: LigneBom[] = c.bom ?? computeBOM(obj, layers, solDuProjet(resultats.etat.objects));
  // Le total vient de la meme somme que le resume du chiffrage (ui/chiffrage.ts) : la zone n'additionne rien.
  const total = totauxBom(lignes);
  const saisirReel = (poste: string, t: string) => {
    const v = parseFloat(t);
    resultats.saisir(() => {
      const ligne = (c.bom || []).find(x => x.poste === poste);
      if (ligne) ligne.prixReel = isNaN(v) ? null : v;
    });
  };
  return (
    <>
      <table className="attrTable" id="terrasseBomTable">
        <tbody>
          <tr><th>Poste</th><th>Qté</th><th>Prix bas</th><th>Prix haut</th><th>Prix de la ligne</th></tr>
          {lignes.map(l => {
            const saisi = !l.calcule && l.prixReel !== null && l.prixReel !== undefined;
            return (
              <tr key={l.poste} className={l.calcule ? 'lignePrixCalcule' : saisi ? 'lignePrixSaisi' : undefined}>
                <td>{l.label}</td>
                <td>{l.qte.toFixed(l.unite === 'u' ? 0 : 2).replace('.', ',') + ' ' + l.unite}</td>
                <td>{l.prixBas ? (eurosCentimes(l.prixBas) + '/' + l.unite) : '—'}</td>
                <td>{l.prixHaut ? (eurosCentimes(l.prixHaut) + '/' + l.unite) : '—'}</td>
                {l.calcule
                  // Chiffre depuis le debit, longueur par longueur : le saisir ici aussi ferait deux
                  // sources de verite qui peuvent diverger. Ecrit en italique, « calcule » : rien n'y a ete tape.
                  ? <td className="nombre prixCalcule">{eurosCentimes(l.prixReel ?? 0)}<div className="noteLigne">{typeof l.calcule === 'string' ? l.calcule : 'calcule'}</div></td>
                  : <td className={saisi ? 'prixSaisi' : undefined}>
                      <SaisieNombre controle="nomenclature.prix" valeur={l.prixReel !== null && l.prixReel !== undefined ? String(l.prixReel) : ''} placeholder="non saisi"
                        libelle={'Prix réel : ' + l.label} largeur={110} onValider={(t) => saisirReel(l.poste, t)} />
                      {saisi && <div className="noteLigne marquePrixSaisi">saisi</div>}
                    </td>}
              </tr>
            );
          })}
          {/* Le total, en pied de table (audit UX de la 5.45.0, constat 5) : un seul nombre, le total retenu — chaque ligne a son prix
              saisi, sinon calcule, sinon le milieu de sa fourchette —, et la fourchette en second. A l'ecran seulement : ni le resume
              ni les PDF ne le lisent. */}
          <tr id="terrasseBomTotals" className="ligneTotalBom">
            <td>Total retenu HT</td>
            <td></td>
            <td className="nombre fourchetteBom">{euros(total.bas)}</td>
            <td className="nombre fourchetteBom">{euros(total.haut)}</td>
            <td className="nombre totalRetenu">{euros(total.retenu)}<div className="noteLigne">{origineDuRetenu(total)}</div></td>
          </tr>
        </tbody>
      </table>
    </>
  );
}

function DebitLames({ obj, layers, resultats }: PropsTerrasse & { layers: CouchesTerrasse }) {
  const c = ensureConstruction(obj);
  const d = computeDebitLames(obj, layers);
  const longueurs = Object.keys(d.achats).map(parseFloat);
  if (!longueurs.length) return <div id="terrasseDebitBox"><div className="hint">Aucune lame à débiter.</div></div>;
  const entraxeAppui = c.avecLambourde ? (c.lambourdeEntraxe || 40) : (c.soliveEntraxe || 40);
  const cout = coutDebit(c, d, 'lames');
  const perso = longueurs.filter(L => prixPersonnalise(c, 'lames', L)).length;
  return (
    <div id="terrasseDebitBox">
      <div className="hint">
        {'Métré au linéaire réel des lames tracées (bordure à plat comprise), débitées dans les longueurs du fournisseur. Les chutes d\'au moins ' +
          (c.chuteMinReutilisable || 50) + ' cm sont remises au pot et resservent sur une autre travée' +
          (c.jointsSurAppui !== false
            ? ' ; chaque about tombe sur un appui, donc un tronçon de milieu de travée est coupé à un multiple de ' + entraxeAppui + ' cm.'
            : ' ; les abouts ne sont pas contraints de tomber sur un appui.')}
      </div>
      <Longueurs c={c} champ="longueursLames" resultats={resultats} />
      <TableDebit c={c} d={d} cle="lames" resultats={resultats} />
      <div className="hint">
        {'Prix par barre : ' + (perso ? perso + ' sur ' + longueurs.length + ' saisis, les autres estimés' : 'tous estimés') +
          ' à partir du tarif au m² de l\'essence (' + (ESSENCE_PRICES[c.essenceBois ?? ''] ?? ESSENCE_PRICES.autre)?.label +
          ') pour une lame de ' + (c.largeurLame || 140) + ' mm — soit ' + (cout / (d.achatMl || 1)).toFixed(2) + ' €/ml en moyenne, ou ' +
          (cout / (d.reelMl || 1)).toFixed(2) + ' €/ml rapporté au linéaire réellement posé. ' +
          'Saisissez le tarif du fournisseur pour chaque longueur : le total alimente la ligne « Lames » de la nomenclature au-dessus, qui n\'est donc pas saisissable à la main.'}
      </div>
      <Bilan c={c} d={d} />
      <div className="hint">
        Méthode : chaque travée est résolue exactement (le jeu de barres le moins cher qui la couvre), puis les chutes sont mutualisées entre
        travées. La mutualisation venant après, il reste 1 à 2 % à gagner sur la table — d'où un effet à connaître : une gamme plus courte fait
        parfois mieux qu'une gamme large, parce que des barres toutes pareilles produisent des chutes toutes pareilles, donc réutilisables.
        Essaie de retirer des longueurs de la liste et compare le pourcentage de chute.
      </div>
    </div>
  );
}

/** Les appuis : la vis et le plot ne se stockent ni ne se vendent pareil, chaque mode a ses champs. */
function Appuis({ obj, layers, resultats }: PropsTerrasse & { layers: CouchesTerrasse }) {
  const c = ensureConstruction(obj);
  const n = layers.vis.length;
  const ligne = (libelle: string, qte: string | number, valeur: React.ReactNode, total: string) => (
    <tr key={libelle}><td>{libelle}</td><td>{String(qte)}</td><td>{valeur}</td><td className="nombre">{total}</td></tr>
  );
  const prix = (valeur: number, titre: string, ecrire: (v: number | undefined) => void) => (
    <SaisieNombre controle="nomenclature.prix" valeur={valeur.toFixed(2)} pas="0.5" largeur={90} titre={titre}
      onValider={(t) => { const v = parseFloat(t); resultats.saisir(() => ecrire((isNaN(v) || v < 0) ? undefined : v)); }} />
  );
  if (estPlots(c)) {
    const m = plotModele(c);
    const ap = achatPlots(c, n);
    const saisi = valeurEnregistree(c.prixPlots, m.cle);
    const prixSaisi = saisi !== undefined && saisi !== null && isFinite(saisi) && saisi >= 0;
    return (
      <>
        <div className="sectionTitle" style={{ marginTop: 16 }}>Plots</div>
        <table className="attrTable"><tbody>
          <tr><th>Poste</th><th>Qté</th><th>Valeur</th><th>Total</th></tr>
          {ligne('Modèle retenu', m.label, m.min + ' a ' + m.max + ' cm', '')}
          {ligne('Prix unitaire', n + ' plots posés', prix(prixPlotUnite(c), 'Prix d\'un plot ' + m.label + ' chez votre fournisseur', v => {
            // `prixPlots` accepte les deux formes historiques (objet ou tableau, voir
            // model/dictionnaire.ts) : ecriture indexee, comme la lecture.
            if (!c.prixPlots) c.prixPlots = {};
            const carnet = c.prixPlots as Record<string, number | undefined>;
            if (v === undefined) delete carnet[m.cle]; else carnet[m.cle] = v;
          }), '')}
          {ligne('À acheter', ap.unites + ' plots', prixSaisi ? 'prix saisi' : 'prix estimé', eurosCentimes(ap.cout))}
        </tbody></table>
        <div className="hint">
          {'Le prix d\'un plot dépend surtout de sa hauteur de réglage : compter ' + (PLOT_MODELES[0]?.prix ?? 0).toFixed(2) + ' à ' +
            (PLOT_MODELES[PLOT_MODELES.length - 1]?.prix ?? 0).toFixed(2) + ' € pièce selon la gamme. Le prix est mémorisé par modèle : changer de hauteur change de ' +
            'modèle, et donc de prix. L\'assise est chiffrée séparément dans la nomenclature ci-dessus.'}
        </div>
      </>
    );
  }
  const a = achatVis(c, n);
  return (
    <>
      <div className="sectionTitle" style={{ marginTop: 16 }}>Vis de fondation</div>
      <table className="attrTable"><tbody>
        <tr><th>Poste</th><th>Qté</th><th>Valeur</th><th>Total</th></tr>
        {ligne('Prix unitaire', n + ' vis posées', prix(prixVisUnite(c), 'Prix d\'une vis de fondation, hors pose', v => { c.prixVisUnite = v; }), '')}
        {ligne('Conditionnement', a.parBoite > 1 ? a.boites + ' boite(s)' : 'à l\'unité',
          <SaisieNombre controle="nomenclature.conditionnement" valeur={String(Math.max(1, Math.round(c.visParBoite || 1)))} pas="1" min="1" largeur={90} titre="Conditionnement. 1 = vendues à l'unité."
            onValider={(t) => { const v = parseInt(t, 10); resultats.saisir(() => { c.visParBoite = (isNaN(v) || v < 1) ? 1 : v; }); }} />, '')}
        {ligne('À acheter', a.unites + ' vis', a.parBoite > 1
          ? a.boites + ' × ' + a.parBoite + (a.unites > n ? ' (soit ' + (a.unites - n) + ' d\'avance)' : '')
          : 'à l\'unité', eurosCentimes(a.cout))}
      </tbody></table>
      <div className="hint">
        {'Le prix d\'une vis de fondation dépend surtout de sa longueur, donc du sol : compter ' + VIS_PRICE.bas + ' à ' + VIS_PRICE.haut +
          ' € pièce hors pose pour du courant. La pose à la visseuse hydraulique, si vous la sous-traitez, se facture à part et n\'est pas comptée ici.'}
      </div>
    </>
  );
}

function DebitBois({ obj, layers, resultats }: PropsTerrasse & { layers: CouchesTerrasse }) {
  const c = ensureConstruction(obj);
  const groupes = computeDebitsBois(obj, layers);
  const regleAbout = c.jointsBoisSurAppui !== false
    ? ' Une abouture de poutre doit reposer sur une vis, donc un tronçon courant est coupé à un multiple de la portée (' + Math.round(porteeVisM(c) * 100) + ' cm).'
    : ' Les aboutures ne sont pas contraintes de tomber sur une vis.';
  return (
    <div id="terrasseDebitBoisBox">
      {groupes.map((g, i) => {
        const d = g.debit;
        const longueurs = Object.keys(d.achats).map(parseFloat);
        const detail = Object.entries(g.parts).map(([k, ml]) => k + ' ' + ml.toFixed(2) + ' ml').join(', ');
        const cout = coutDebit(c, d, g.cle);
        const perso = longueurs.filter(L => prixPersonnalise(c, g.cle, L)).length;
        return (
          <div key={g.cle}>
            {groupes.length > 1 && <div className="sectionTitle" style={i ? { marginTop: 16 } : undefined}>{g.titre}</div>}
            <div className="hint">{(groupes.length > 1 ? '' : 'Débités ensemble : même section, même commande. ') + 'Métré par rôle — ' + detail + '.' + (i ? '' : regleAbout)}</div>
            <Longueurs c={c} champ={g.champLongueurs as ChampLongueurs} resultats={resultats} />
            {!longueurs.length
              ? <div className="hint">Aucune pièce à débiter pour ce poste.</div>
              : <>
                  <TableDebit c={c} d={d} cle={g.cle} resultats={resultats} />
                  <div className="hint">
                    {'Prix par barre : ' + (perso ? perso + ' sur ' + longueurs.length + ' saisis, les autres estimés' : 'tous estimés') +
                      ' au tarif indicatif du bois porteur (' + SOLIVE_PRICE.bas + ' a ' + SOLIVE_PRICE.haut + ' €/ml) — soit ' +
                      (cout / (d.achatMl || 1)).toFixed(2) + ' €/ml en moyenne, ou ' + (cout / (d.reelMl || 1)).toFixed(2) + ' €/ml rapporté au linéaire réellement posé.'}
                  </div>
                  <Bilan c={c} d={d} />
                </>}
          </div>
        );
      })}
      <Appuis obj={obj} layers={layers} resultats={resultats} />
    </div>
  );
}

export function Nomenclature({ obj, resultats, commandes }: PropsTerrasse & { commandes?: RegistreCommandes }) {
  const layers = computeTerrasseLayers(obj, resultats.etat.objects);
  return (
    <>
      {/* La liste d'achat d'abord : ce qu'on emporte au magasin, tire de la table qui suit (terrasses cochees pour le dossier). */}
      {commandes && (
        <div className="controls listeAchat" role="group" aria-label="Liste d’achat">
          <span className="libelleListeAchat">Liste d’achat</span>
          <BoutonCommande commandes={commandes} id="export.listeAchatPdf" className="secondary small">PDF à imprimer</BoutonCommande>
          <BoutonCommande commandes={commandes} id="export.listeAchatCsv" className="secondary small">CSV (tableur)</BoutonCommande>
        </div>
      )}
      <div className="sectionTitle">Nomenclature</div>
      <TableBom obj={obj} layers={layers} resultats={resultats} />
      <div className="hint">Les fourchettes de prix sont des points de départ (marché français, ordre de grandeur) — pas un devis. Saisissez le prix réel dès que vous l’avez pour affiner le total.</div>
      <div className="sectionTitle" style={{ marginTop: 18 }}>Débit des lames</div>
      <DebitLames obj={obj} layers={layers} resultats={resultats} />
      <div className="sectionTitle" style={{ marginTop: 18 }}>Débit du bois porteur et appuis</div>
      <DebitBois obj={obj} layers={layers} resultats={resultats} />
    </>
  );
}
