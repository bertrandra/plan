// Les onglets du panneau lateral, en mode Plan (spec §6.4, ui/).
//
// Six onglets qui parlent du meme plan sous six angles — l'onglet Terrasse decrit la terrasse
// courante, un contexte du plan depuis l'etape 3 de la reconstruction de l'interface. Quatre d'entre eux ne se contentent pas
// d'apparaitre : ils **se reconstruisent a l'ouverture**, parce que leur contenu depend de ce qui
// s'est passe pendant qu'ils etaient caches — une cote posee, une parcelle importee, une terrasse
// renommee. Les remplir une fois pour toutes donnerait un panneau perime sans que rien ne le dise.

/** Les onglets, dans l'ordre, avec le panneau que chacun montre. */
const ONGLETS: [string, string, string][] = [
  ['edition', 'Édition', 'panelEdition'],
  ['terrasse', 'Terrasse', 'panelTerrasse'],
  ['affichage', 'Affichage', 'panelAffichage'],
  ['mesure', 'Mesure', 'panelMesure'],
  ['plu', 'PLU', 'panelPlu'],
  ['export', 'Export', 'panelExport']
];

/** Ce qu'il faut rafraichir a l'ouverture de chaque onglet. */
export interface ContexteOnglets {
  rebuildMeasurePanel: () => void;
  renderMeasureResults: () => void;
  renderPanneauPlu: () => void;
  /** Les panneaux de la terrasse courante : construction, chiffrage, coupe, implantation, chantier. */
  refreshTerrasseView: () => void;
}

/** Ce que les onglets lisent et ecrivent : quel onglet est actif. */
export interface EtatOnglets { panelTab: string }

/** Montre un onglet et rafraichit ce qu'il doit : ce que fait un clic, disponible par programme. */
export function activerOnglet(key: string, etat: EtatOnglets, ctx: ContexteOnglets): void {
  etat.panelTab = key;
  ONGLETS.forEach(([k, , panneau]) => {
    document.getElementById(panneau)!.style.display = (k === key) ? '' : 'none';
  });
  if (key === 'mesure') { ctx.rebuildMeasurePanel(); ctx.renderMeasureResults(); }
  if (key === 'plu') ctx.renderPanneauPlu();
  if (key === 'terrasse') ctx.refreshTerrasseView();
  // Se reconstruit pour se remettre en surbrillance : l'onglet actif est lu depuis `etat`.
  rebuildPanelTabs(etat, ctx);
}

export function rebuildPanelTabs(etat: EtatOnglets, ctx: ContexteOnglets): void {
  const div = document.getElementById('panelTabs')!;
  div.innerHTML = '';
  ONGLETS.forEach(([key, label]) => {
    const b = document.createElement('button');
    b.className = 'panelTabBtn' + (etat.panelTab === key ? ' active' : '');
    b.textContent = label;
    b.addEventListener('click', () => activerOnglet(key, etat, ctx));
    div.appendChild(b);
  });
}
