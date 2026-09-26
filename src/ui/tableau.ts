// Les tableaux des resultats, lisibles au doigt (spec-ihm-mobile §7.2).
//
// Les tableaux du tiroir ont cinq a huit colonnes : sur un telephone, ils debordent de l'ecran ou
// s'ecrasent. Sur telephone, chaque ligne devient une carte — la premiere colonne en titre, chaque
// autre cellule precedee du nom de sa colonne. C'est la feuille de style qui fait la carte ; ce
// module ne fait que poser, sur chaque cellule, le nom de sa colonne (`data-label`), lu dans la
// ligne d'en-tete.
//
// Il ne touche ni aux calculs ni aux ecouteurs des panneaux (tables.ts, terrassePanels.ts,
// mesurePanel.ts) : les cellules editables le restent, dans la carte comme dans le tableau. Il
// passe apres eux, a chaque fois qu'ils redessinent un tableau.

/** Pose le nom de colonne sur chaque cellule des tableaux du conteneur. */
export function etiqueterTableaux(racine: ParentNode): void {
  racine.querySelectorAll('table').forEach((table) => {
    const lignes = [...table.querySelectorAll('tr')];
    const entete = lignes.find((tr) => tr.querySelector(':scope > th'));
    if (!entete) return;
    const noms: string[] = [];
    [...entete.children].forEach((cellule) => {
      const n = (cellule as HTMLTableCellElement).colSpan || 1;
      for (let i = 0; i < n; i++) noms.push((cellule.textContent || '').trim());
    });
    table.classList.add('tableauCartes');
    entete.classList.add('enteteTableau');
    for (const tr of lignes) {
      if (tr === entete) continue;
      let colonne = 0;
      [...tr.children].forEach((cellule) => {
        const nom = noms[colonne] || '';
        if (cellule.getAttribute('data-label') !== nom) cellule.setAttribute('data-label', nom);
        colonne += (cellule as HTMLTableCellElement).colSpan || 1;
      });
      // Une ligne d'une seule cellule qui couvre tout le tableau est un titre de section.
      if (tr.children.length === 1 && ((tr.children[0] as HTMLTableCellElement).colSpan || 1) > 1) tr.classList.add('ligneTitre');
    }
  });
}

/**
 * Les libelles du moteur sont ecrits sans accents, et ils partent tels quels dans les exports (le
 * projet JSON garde `bom`) : on ne les change pas a la source. A l'ecran seulement, on remet les
 * accents des mots qui reviennent dans la nomenclature et le debit.
 */
const ACCENTS: [RegExp, string][] = [
  [/\bachetees\b/g, 'achetées'], [/\bachetee\b/g, 'achetée'], [/\bcalcule\b/g, 'calculé'], [/\bdebit\b/g, 'débit'],
  [/\bGeotextile\b/g, 'Géotextile'], [/\bConcasse\b/g, 'Concassé'], [/\bcompacte\b/g, 'compacté'],
  [/\breellement\b/g, 'réellement'], [/\breutilisables\b/g, 'réutilisables'], [/\brapporte\b/g, 'rapporté']
];

/**
 * Ecrit les decimales a la francaise dans ce que les panneaux affichent (« 92.50 ml » → « 92,50 ml »),
 * et remet les accents des libelles du moteur (ACCENTS).
 * Les calculs et les exports ecrivent le point ; seul le texte a l'ecran change, apres coup. Le
 * resume, fait pour etre copie tel quel, n'est pas touche, ni les champs de saisie.
 */
export function franciserDecimales(racine: ParentNode): void {
  const parcours = document.createTreeWalker(racine as Node, NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => n.parentElement?.closest('textarea, script, style, #panelResume') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
  });
  for (let n = parcours.nextNode(); n; n = parcours.nextNode()) {
    const v = n.nodeValue ?? '';
    let w = v.replace(/(\d)\.(\d)/g, '$1,$2');
    for (const [motif, accentue] of ACCENTS) w = w.replace(motif, accentue);
    if (w !== v) n.nodeValue = w;
  }
}

/**
 * Etiquette les tableaux du conteneur, puis a chaque fois qu'ils changent. Rend la fonction qui
 * arrete l'observation.
 */
export function suivreTableaux(racine: HTMLElement): () => void {
  let prevu = false;
  const passer = () => { prevu = false; etiqueterTableaux(racine); franciserDecimales(racine); };
  const observateur = new MutationObserver((mutations) => {
    // Nos propres `data-label` ne relancent rien : seules les lignes ajoutees comptent.
    if (prevu || !mutations.some((m) => m.type === 'childList')) return;
    prevu = true;
    requestAnimationFrame(passer);
  });
  observateur.observe(racine, { childList: true, subtree: true });
  etiqueterTableaux(racine);
  franciserDecimales(racine);
  return () => observateur.disconnect();
}
