// Z6, onglet Methode : ce que fait le calcul, et ce qu'il ne fait pas.
//
// Les tableaux sont generes avec le calage du projet — K, charge, coefficient de raideur —, de sorte
// qu'ils montrent ce que ce plan utilise, pas les valeurs d'usine.

import { dist, shoelace } from '../../geometry/basic.js';
import { ensureConstruction } from '../../engine/construction.js';
import { PLOT_ASSISE_MIN_CM2, PLOT_ENTRAXE_MAX_M, PLOT_HAUTEUR_DTU_CM, SOLIVE_SECTIONS, VIS_PRICE } from '../../engine/constantes.js';
import { coefRaideurLame, ENTRAXE_LAME_K, LAME_RAIDEUR, maxEntraxeLameCm, maxPorteeVisM, PORTEE_VIS_K, porteeVisM, porteeVisSpaM, SOLIVE_SECTION_DIMS } from '../../engine/portees.js';
import { buildVisGrid, computeStructure, structureVide } from '../../engine/structure.js';
import { aDesSommets, sommetsDe } from '../../model/formes.js';
import type { Resultats } from '../../app/resultats.js';
import type { ObjetPlan, PtBrut } from '../../model/types.js';

type Donnees = ReturnType<typeof donnees>;

/** Ce que les sections lisent du projet : le calage, la structure dessinee, ses vis. */
function donnees(obj: ObjetPlan, resultats: Resultats) {
  const c = ensureConstruction(obj);
  const objets = resultats.etat.objects;
  const span = porteeVisM(c);
  const ok = aDesSommets(obj) && obj.pts.length >= 3;
  const S = ok ? computeStructure(obj, objets) : structureVide();
  const vis = ok ? buildVisGrid(obj, S, objets) : [];
  const roles: Record<string, number> = { rive: 0, courant: 0, spa: 0 };
  vis.forEach(p => roles[p.role] = (roles[p.role] || 0) + 1);
  return { c, span, S, vis, roles, surf: shoelace(sommetsDe(obj)) || 1 };
}

const ml = (a: { a: PtBrut; b: PtBrut }[]) => a.reduce((s, l) => s + dist(l.a, l.b), 0);

/** §1 a §3 : charges, portee d'une piece, ecartement sous les lames. */
function Portees({ c, span }: Donnees) {
  const cal = (e: number) => ({ soliveSection: '', soliveEntraxe: e, kPortee: c.kPortee!, chargeNormale: c.chargeNormale! });
  return (
    <>
        <div className="hint" style={{ marginBottom: 14 }}><b>Ce que fait ce calcul, et ce qu'il ne fait pas.</b> Il s'agit d'un pré-dimensionnement
          destiné à chiffrer et à implanter, calé sur les usages du métier et sur le NF DTU 51.4. Ce n'est pas une note de calcul : pas de
          vérification Eurocode 5, pas de prise en compte du fluage réel en classe de service 3, ni du sol sous les vis (qui conditionne leur
          longueur et leur tenue). Pour une terrasse portée en hauteur, recevant du public, ou fondée sur un sol douteux, il faut une étude.</div>

        <div className="sectionTitle">1. Hypothèses de charge</div>
        <p>La charge d'exploitation visée est réglable dans l'onglet Construction. Elle vaut actuellement <b>{(c.chargeNormale || 250) + ' kg/m²'}</b> en
          zone courante et <b>{(c.chargeSpa || 500) + ' kg/m²'}</b> en zone d'équipement. La référence du métier pour une terrasse privative est
          250 kg/m² répartis (ou 200 kg ponctuels), et c'est sur cette valeur que le coefficient du §2 est calé : demander davantage raccourcit la
          portée admissible dans le rapport (250/charge)<sup>1/3</sup>, même exposant que le reste de la formule.</p>
        <p>Une <b>zone d'équipement</b> est l'emprise de tout objet du plan dont la fonction est « équipement », quelle que soit sa forme : spa
          rond, bain nordique, cuve, bac maçonné, barbecue. Ce n'est ni son nom ni sa géométrie qui la désigne, mais ce qu'elle porte. L'emprise
          réelle est élargie de la marge réglée dans Construction, puis chaque portion de pièce qui la traverse est redécoupée plus serré. Un spa
          rempli et occupé pèse 1,5 à 2 t sur 3 à 4 m², d'où l'ordre de grandeur de 500 kg/m² retenu par défaut. C'est ce rapport de charges qui
          resserre les appuis : {Math.round(span * 100) + ' cm'} en zone courante contre <b>{Math.round(porteeVisSpaM(c) * 100) + ' cm'}</b> sous l'équipement.</p>

        <div className="sectionTitle">2. Portée admissible d'une pièce entre deux appuis</div>
        <p>La flèche d'une poutre uniformément chargée varie comme <i>5wL⁴/384EI</i>. En plafonnant la flèche à une fraction de la portée, la
          portée admissible varie comme <i>(EI / charge)</i> puissance 1/3. Avec <i>I = b·h³/12</i> et une charge proportionnelle à l'entraxe (la
          largeur de terrasse que la pièce reprend), tout se simplifie en :</p>
        <p className="formuleMethode"><b>portée = K · h · (b / entraxe)<sup>1/3</sup> · (250 / charge)<sup>1/3</sup></b></p>
        <p>La forme est donc dérivée, mais le coefficient <b>{'K = ' + (c.kPortee || PORTEE_VIS_K)}</b> (longueurs en mm) est <i>calé</i> sur la
          pratique plutôt que calculé — ce qui évite d'avoir à modéliser le fluage, la classe de résistance réelle et les coefficients de sécurité
          un par un. Deux points de calage, indépendants l'un de l'autre, tombent tous deux sur K = {PORTEE_VIS_K} (la valeur par défaut,
          modifiable dans Construction) :</p>
        <ul>
          <li>un <b>45×70</b> à 70 cm d'entraxe doit donner les <b>70 cm</b> entre appuis que le NF DTU 51.4 fixe comme plafond pour les
            lambourdes → le calcul rend {Math.round(maxPorteeVisM({ soliveSection: '45x70', soliveEntraxe: 70 }) * 100) + ' cm'} ;</li>
          <li>un <b>45×145</b> à 70 cm doit donner les <b>1,50 m</b> retenus dans le métier pour une solive sur vis de fondation → le calcul rend 1,50 m.</li>
        </ul>
        <p>Portées obtenues pour les sections proposées :</p>
        <table className="attrTable"><tbody>
          <tr><th>Section</th><th>b × h (mm)</th><th>entraxe 40</th><th>entraxe 50</th><th>entraxe 70</th></tr>
          {SOLIVE_SECTIONS.map(s => {
            const d = SOLIVE_SECTION_DIMS[s]!;
            const p = (e: number) => Math.round(maxPorteeVisM({ ...cal(e), soliveSection: s }) * 100) + ' cm';
            return <tr key={s}><td>{s + ' mm'}</td><td>{d.b + ' × ' + d.h}</td><td>{p(40)}</td><td>{p(50)}</td><td>{p(70)}</td></tr>;
          })}
        </tbody></table>
        <p className="hint">Le résultat est borné à 2,50 m : au-delà, la pièce n'est plus une solive de terrasse courante et relève d'un calcul propre.</p>

        <div className="sectionTitle">3. Écartement maximal des appuis sous les lames</div>
        <p>Le NF DTU 51.4 donne cet écartement en fonction de l'épaisseur, de la largeur et de la classe de la lame. Sur la plage courante
          l'abaque se résume à un rapport quasi constant — 22 mm avec 40 cm, 24 mm avec 45 cm, 27 mm avec 50 cm — soit environ <b>{(c.kEntraxeLame || ENTRAXE_LAME_K) + ' × l\'épaisseur'}</b>,
          arrondi à 5 cm, multiplié par un coefficient de raideur propre à la lame. Le composite flue nettement plus ({LAME_RAIDEUR.composite!.toFixed(2)} par
          défaut), les bois exotiques denses un peu moins ({LAME_RAIDEUR.exotique!.toFixed(2)}). Ce coefficient est modifiable pour l'essence
          sélectionnée dans l'onglet Construction — il vaut actuellement <b>{coefRaideurLame(c).toFixed(2)}</b>, soit des appuis à {maxEntraxeLameCm(c) + ' cm'}.</p>
        <table className="attrTable"><tbody>
          <tr><th>Épaisseur lame</th><th>Bois résineux</th><th>Exotique</th><th>Composite</th></tr>
          {[19, 21, 22, 24, 25, 27, 28].map(ep => {
            const K = c.kEntraxeLame!;
            const e = (essenceBois: string) => maxEntraxeLameCm({ epaisseurLame: ep, essenceBois, kEntraxeLame: K }) + ' cm';
            return <tr key={ep}><td>{ep + ' mm'}</td><td>{e('pin-classe4')}</td><td>{e('exotique')}</td><td>{e('composite')}</td></tr>;
          })}
        </tbody></table>
        <p>C'est cette limite qui pilote l'optimisation : elle fixe l'entraxe de la couche qui porte les lames — les lambourdes s'il y en a,
          sinon les solives elles-mêmes.</p>

    </>
  );
}

/** §4 et §5 : les deux modes de fondation, les deux structures. */
function Fondations() {
  return (
    <>
        <div className="sectionTitle">4. Les deux modes de fondation</div>
        <p><b>Une vis est une fondation. Un plot n'en est pas une</b> : c'est un appui posé sur quelque chose qui, lui, doit faire fondation.
          Toute la différence entre les deux modes découle de cette phrase.</p>
        <table className="attrTable"><tbody>
          <tr><th></th><th>Vis de fondation</th><th>Plots réglables</th></tr>
          <tr><td>Nature</td><td>Fondation ponctuelle profonde</td><td>Appui posé, reporté sur une assise</td></tr>
          <tr><td>Ancrage</td><td>Compression <b>et</b> arrachement</td><td>Compression seule</td></tr>
          <tr><td>Hors gel</td><td>Par la profondeur</td><td>À assurer par l'assise</td></tr>
          <tr><td>Portée entre appuis</td><td>Déduite de la section, jusqu'à 2,50 m</td><td>Plafonnée à <b>{Math.round(PLOT_ENTRAXE_MAX_M * 100) + ' cm'}</b> quoi qu'en dise la section</td></tr>
          <tr><td>Densité</td><td>1,0 à 1,5 /m²</td><td>3 à 5 /m²</td></tr>
          <tr><td>Domaine</td><td>Large</td><td>{'≤ ' + PLOT_HAUTEUR_DTU_CM + ' cm de plot, ≤ 1 m de platelage'}</td></tr>
          <tr><td>Assise</td><td>Aucune — la vis se fonde seule</td><td>Dalle, ou décaissement + géotextile + concassé</td></tr>
        </tbody></table>
        <p><b>Deux topologies sur plots.</b> En <i>pose simple</i>, les lambourdes reposent directement sur les plots et il n'y a pas de solive ;
          le cadre devient une lambourde de rive. En <i>structure double</i>, les plots portent des solives et les lambourdes viennent au-dessus :
          plus de bois, moins de plots. L'optimiseur compare les deux.</p>
        <p><b>Poinçonnement.</b> Le NF DTU 51.4 demande une surface d'assise d'au moins {PLOT_ASSISE_MIN_CM2} cm² (⌀ 19,5 cm). La charge par plot —
          charge cible × surface reprise — et la pression correspondante sont affichées dans Construction. Anodin sur une dalle, à regarder de près
          sur du concassé.</p>
        <p className="hint"><b>Le spa sur plots.</b> Les appuis sont resserrés comme en mode vis, mais un plot n'est pas ancré et reporte sa charge
          sur une assise qui peut tasser de façon différentielle. La solution du métier est une dalle béton dédiée, fondée pour elle-même, le
          platelage étant construit autour. L'avertissement s'affiche dans Construction.</p>

        <div className="sectionTitle">5. Les deux structures, et pourquoi elles ne se vissent pas pareil</div>
        <p>Ce ne sont pas deux réglages d'un même ouvrage, mais <b>deux structures différentes</b>. Le programme calcule donc le réseau de pièces
          d'abord, et n'en déduit les vis qu'ensuite : une vis n'est jamais posée ailleurs que sous une pièce réellement dessinée.</p>
        <table className="attrTable"><tbody>
          <tr><th></th><th>Sans lambourdes</th><th>Avec lambourdes</th></tr>
          <tr><td>Rôle des solives</td><td>Elles portent les lames elles-mêmes</td><td>Poutres primaires, elles portent les lambourdes</td></tr>
          <tr><td>Direction</td><td>Perpendiculaires aux lames</td><td>Parallèles aux lames</td></tr>
          <tr><td>Entraxe</td><td>Imposé par l'épaisseur de lame (§3)</td><td>Libre, jusqu'à la portée d'une lambourde</td></tr>
          <tr><td>Second lit</td><td>—</td><td>Lambourdes ⟂ aux lames, entraxe du §3</td></tr>
          <tr><td>Renfort spa</td><td>Vis resserrées sur les solives en place</td><td>Solives supplémentaires ajoutées dans l'emprise</td></tr>
          <tr><td>Densité de vis</td><td>Élevée : beaucoup de solives à reprendre</td><td>Faible : peu de poutres, donc peu d'appuis</td></tr>
        </tbody></table>
        <p>Le renfort du spa est le point où les deux divergent vraiment. Quand les solives sont déjà espacées de 40 cm, la surcharge se reprend
          en <b>resserrant les vis le long de ces solives</b> : le bois est déjà là. Quand ce sont des poutres primaires à deux mètres l'une de
          l'autre, aucune vis semée entre elles ne sert à quoi que ce soit — la zone reçoit ses <b>propres solives</b>, menées de cadre à cadre
          comme toutes les autres.</p>

    </>
  );
}

/** §6 : le cadre, et ce que donne cette terrasse. */
function Cadre({ span, S, vis, roles, surf }: Donnees) {
  return (
    <>
        <div className="sectionTitle">6. Le cadre périmétrique</div>
        <p>Les deux ouvrages sont fermés par un <b>cadre</b> — une solive de rive qui suit le contour, axe rentré d'une demi-section pour que sa
          face extérieure affleure le bord. Sans lui, la pièce porteuse la plus extérieure tombe où l'entraxe la laisse tomber, et la rive de la
          terrasse repose sur rien : c'est elle qui reçoit la lame de rive et les extrémités de toutes les lames.</p>
        <p>Les solives intérieures sont alors réparties en <b>travées égales d'un bord à l'autre</b> (largeur divisée en travées entières ≤
          entraxe maximal), et non calées sur le centre de la terrasse. Chaque solive va donc de cadre à cadre.</p>
        <p><b>Conséquence sur les vis :</b> une solive appuyée à ses deux extrémités sur le cadre n'a besoin de vis intermédiaires que si elle
          est plus longue que sa portée. C'est ce qui fait chuter le nombre d'appuis par rapport à une trame posée a priori.</p>
        <ol>
          <li><b>Cadre.</b> Une vis sous chaque angle, où deux pièces de rive se rejoignent et où la charge se concentre, puis les tronçons
            subdivisés pour rester dans la portée du §2.</li>
          <li><b>Solives.</b> Extrémités portées par le cadre ; l'intérieur divisé en travées égales ne dépassant pas la portée.</li>
          <li><b>Zone d'équipement.</b> Chaque portion de solive traversant l'emprise est redécoupée à l'entraxe resserré saisi, en plus des
            solives ajoutées le cas échéant. Une emprise concave — un bac en L, un muret en U — peut être traversée plusieurs fois par la même
            pièce : chaque traversée est traitée séparément.</li>
          <li><b>Fusion.</b> Deux vis trop proches n'en font qu'une sur le chantier : la plus sollicitée est conservée (équipement, puis rive,
            puis courante).</li>
        </ol>
        <p><b>Cette terrasse :</b> {surf.toFixed(2) + ' m², portée ' + Math.round(span * 100) + ' cm → '}<b>{vis.length + ' vis'}</b>
          {' (' + roles.rive + ' sous cadre, ' + roles.courant + ' sous solives, ' + roles.spa + ' en zone d\'équipement), soit ' +
            (vis.length / surf).toFixed(2) + ' vis/m² au total et ' + ((vis.length - roles.spa!) / surf).toFixed(2) + ' vis/m² hors équipement. ' +
            'C\'est ce second chiffre qui se compare à l\'usage du métier, entre 1,0 et 1,5 vis/m². Bois porteur : ' + ml(S.cadre).toFixed(1) +
            ' ml de cadre, ' + ml(S.solives).toFixed(1) + ' ml de solives' +
            (S.solivesSpa.length ? ' (+ ' + ml(S.solivesSpa).toFixed(1) + ' ml de renfort sous équipement)' : '') +
            (S.lambourdes.length ? ', ' + ml(S.lambourdes).toFixed(1) + ' ml de lambourdes' : '') + '.'}</p>

    </>
  );
}

/** §7 a §10 : debit, optimisation, chantier, sources. */
function DebitEtSuite({ c }: Donnees) {
  return (
    <>
        <div className="sectionTitle">7. Débit et prix d'achat</div>
        <p>Rien n'est chiffré en surface majorée d'un pourcentage de chute : tout part du linéaire réellement tracé, découpé dans les longueurs
          du fournisseur. Deux débits séparés, parce que ce sont deux produits achetés séparément :</p>
        <ul>
          <li><b>Lames</b> — les lames du platelage et la bordure à plat, même produit acheté en même temps, donc un seul débit et une seule ligne au BOM.</li>
          <li><b>Bois porteur</b> — cadre et solives. Les lambourdes les rejoignent tant qu'elles partagent leur section : même pièce, même
            commande. Dès que la section diffère, elles deviennent un produit à part et prennent leur propre débit, leurs propres longueurs
            achetables et leurs propres prix — les mélanger reviendrait à les couper et les chiffrer sur la mauvaise pièce.</li>
        </ul>
        <p>Chaque débit a son jeu de longueurs achetables, réglable juste au-dessus de son tableau : un marchand ne tient pas les mêmes longueurs
          en lame et en bois de structure.</p>
        <p><b>Vis de fondation.</b> Achetées à la pièce, avec un conditionnement réglable : une boîte entamée se paie entière, donc la quantité
          est arrondie au conditionnement supérieur. Leur prix dépend surtout de leur longueur, donc du sol — de {VIS_PRICE.bas} à {VIS_PRICE.haut} €
          pièce hors pose pour du courant. La pose à la visseuse hydraulique, si elle est sous-traitée, se facture à part et n'est pas comptée.</p>
        <p>C'est ce qui rend l'arbitrage du §7 réellement économique : baisser le prix de la vis déplace l'optimum vers plus d'appuis et moins
          de bois, et inversement.</p>
        <p><b>Deux contraintes de pose.</b> Un about entre deux lames doit reposer sur une pièce : un tronçon qui ne finit pas sa travée est donc
          coupé à un multiple de l'entraxe des appuis, et une barre trop courte pour atteindre un appui ne peut pas servir en milieu de travée.
          Les chutes d'au moins {(c.chuteMinReutilisable || 50) + ' cm'} repartent au pot et resservent sur une autre travée — c'est de là que
          vient l'essentiel de l'économie.</p>
        <p><b>Calcul.</b> Chaque travée est résolue <i>exactement</i> par programmation dynamique : le jeu de barres le moins cher qui la couvre.
          Un choix glouton échoue ici, parce que couvrir le maximum tout de suite force régulièrement une barre entière pour le reliquat — dix
          travées de 2,50 m se paient dix barres de 2,50 m, pas neuf barres de 3 m. La mutualisation des chutes se fait ensuite, en second passage.</p>
        <p><b>Prix.</b> Les barres se chiffrent à la pièce, et le tarif au mètre n'est pas le même d'une longueur à l'autre — les courtes sont
          souvent plus chères au mètre, et une longueur de la gamme est fréquemment en promotion. Chaque longueur a donc son prix, saisissable dans
          son tableau de débit, <b>au choix à la barre ou au m²</b> : les deux colonnes se déduisent l'une de l'autre par la surface de la barre,
          on saisit celle que le marchand donne et l'autre suit. Afficher les deux rend d'ailleurs visible quelle longueur est la mieux placée au
          m². Tant qu'aucun prix n'est saisi, il est estimé (tarif au m² de l'essence × largeur × longueur pour les lames, tarif au ml × longueur
          pour le bois porteur). Les totaux remontent dans les lignes « Lames », « Bois porteur » et « Vis » du BOM, qui ne sont pas saisissables
          à la main : deux sources de vérité pour un même coût finissent par diverger.</p>
        <p className="hint">Le problème de découpe pris globalement est NP-difficile ; par travée il est petit et exactement soluble, et le passage
          de mutualisation récupère l'essentiel du reste. Il subsiste 1 à 2 % : une gamme de longueurs plus courte produit des chutes identiques
          donc plus réutilisables, et bat parfois une gamme large. Le tableau affiche le pourcentage de chute pour permettre la comparaison.</p>

        <div className="sectionTitle">8. Optimisation des paramètres</div>
        <p>Le bouton de l'onglet Construction balaie les configurations qui respectent <i>simultanément</i> les deux règles ci-dessus, et les
          classe par coût de structure.</p>
        <p><b>Espace exploré.</b> Sans lambourdes, les solives portent les lames directement : leur entraxe est imposé par le §3 et seule la
          section reste libre. Avec lambourdes, les lames reposent sur les lambourdes (entraxe imposé par le §3) et les solives peuvent s'écarter
          jusqu'à la portée d'une lambourde de cette section — même formule qu'au §2, appliquée un étage plus bas, l'entraxe repris étant cette
          fois celui des lambourdes.</p>
        <p><b>Coût comparé.</b> Nombre de vis × prix unitaire + mètres linéaires de bois porteur × tarif au ml — cadre, solives, renfort spa et
          lambourdes compris, puisque tout cela se paie. Le tarif au ml du bois est celui du débit courant, chute comprise, et non le prix
          catalogue : refaire un débit complet pour chacune des 63 configurations serait exact mais bien plus lent, et le classement ne s'y joue
          pas. Les lames sont exclues : leur métré ne dépend pas de la structure porteuse, elles ne feraient que décaler tous les totaux.</p>
        <p><b>Quantités.</b> Chaque configuration est mesurée avec les fonctions qui tracent le plan — même génération de lignes, même
          implantation de vis. Un chiffre annoncé par l'optimiseur est donc celui qu'on relèvera sur le dessin après application, et non une
          estimation parallèle susceptible de diverger.</p>
        <p className="hint">L'arbitrage récurrent : passer aux lambourdes ajoute du bois mais laisse les solives s'écarter, ce qui fait chuter le
          nombre de vis — souvent le poste le plus cher. Monter en section joue dans le même sens.</p>

        <div className="sectionTitle">9. Chantier — activités et durées</div>
        <p>L'onglet Chantier liste les activités réellement nécessaires à cette terrasse, dans l'ordre d'exécution, groupées en cinq phases :
          préparation, appuis, structure, platelage, finitions. Une activité n'apparaît que si sa quantité est non nulle — pas de décaissement
          sur dalle existante, pas de lame de rive si elle n'est pas activée.</p>
        <p><b>Les quantités viennent du projet</b>, jamais d'un forfait au m² : nombre d'appuis, mètres de cadre, de solives et de lambourdes,
          barres à débiter, m³ de concassé, m² de platelage. Chaque ligne porte sa cadence en heures par unité, réglable : une terrasse en fond
          de jardin sans accès engin n'a pas les cadences de la même terrasse devant un garage.</p>
        <p>Le total est converti en jours selon la taille d'équipe et les heures travaillées, tous deux réglables. Le poste le plus lourd est
          signalé — c'est celui qu'il faut attaquer pour raccourcir le chantier, et sur une terrasse sur vis c'est presque toujours le vissage.</p>
        <p className="hint">Main-d'œuvre de pose seule. Ni livraison, ni délai d'approvisionnement, ni séchage, ni intempéries, ni dépose d'un
          existant. Sur plots, la préparation de l'assise est comptée, mais l'évacuation des terres suppose une benne sur place.</p>

        <div className="sectionTitle">10. Sources</div>
        <ul>
          <li>NF DTU 51.4 « Platelages extérieurs en bois » — entraxes d'appuis (≤ 70 cm sur 3 appuis, ≤ 60 cm sur 2 appuis), débord des lames,
            retrait des plots en rive.</li>
          <li>Guide de conception et de réalisation des terrasses en bois — FCBA / France Bois Forêt / FNB / LCB / ATB.</li>
          <li>Abaques de portée et pratique courante des poseurs sur vis de fondation (≈ 1,2 à 1,5 vis/m², solives 45×145 tous les 1,50 m à 70 cm d'entraxe).</li>
        </ul>
    </>
  );
}

export function Methode({ obj, resultats }: { obj: ObjetPlan; resultats: Resultats }) {
  const d = donnees(obj, resultats);
  return (
    <>
      <div className="sectionTitle">Méthode de calcul</div>
      <div id="terrasseMethodeWrap"><div className="texteMethode">
        <Portees {...d} />
        <Fondations />
        <Cadre {...d} />
        <DebitEtSuite {...d} />
      </div></div>
    </>
  );
}
