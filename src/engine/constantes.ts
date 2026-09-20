// Constantes et regles du moteur terrasse (spec §3.2, engine/).
//
// Deplacees depuis legacy.ts sans retouche. Ces valeurs sortent dans le BOM, donc dans un devis :
// les modifier change des nombres qu'un utilisateur a peut-etre deja envoyes a un fournisseur.
// Toute evolution est un changement MAJEUR au sens de MD/RELEASE.md §2.1.


/** Une essence au catalogue : son libelle et sa fourchette de prix au m². */
export interface Essence { label: string; bas: number; haut: number }

// Indexe par une chaine venue d'un projet enregistre : elle n'est pas garantie d'etre au catalogue,
// et chaque lecture porte donc son repli. Record<string, …> dit cela ; figer les cinq clefs
// obligerait a valider la saisie en amont, ce qui n'est pas le contrat d'aujourd'hui.
export const ESSENCE_PRICES: Record<string, Essence> = {
  'pin-classe4': { label:'Pin classe 4 (autoclave)', bas:25, haut:40 },
  'douglas':     { label:'Douglas',                   bas:35, haut:55 },
  'composite':   { label:'Composite',                 bas:50, haut:90 },
  'exotique':    { label:'Exotique (cumaru, ipe...)',  bas:60, haut:120 },
  'autre':       { label:'Autre (prix libre)',         bas:0,  haut:0 }
};
export const SOLIVE_SECTIONS = ['45x70','45x95','63x175'];
export const VIS_PRICE = { bas:25, haut:45 };
// Une vis de fondation se termine par une tete reglable (platine ou U) qui sort du sol pour
// rattraper un devers ou monter au niveau d'un seuil. La course usuelle des tetes du commerce va
// jusqu'a une quinzaine de centimetres ; au-dela on est sur un poteau, avec un moment en pied que
// la seule vis ne reprend pas sans contreventement.
export const VIS_DEPASSEMENT_USUEL_CM = 15;
export const VIS_DEPASSEMENT_MAX_CM = 30;
// ---- pose sur plots (SPEC-PLOTS-01) ----------------------------------------------------
// Gammes courantes de plots polymere reglables, hauteurs en cm. Le NF DTU 51.4 couvre le plot
// reglable jusqu'a 30 cm, et le platelage jusqu'a 1 m au-dessus du support continu.
export const PLOT_MODELES = [
  { cle:'fixe',     label:'Plot fixe / cale',    min:1.0, max:3.0,  prix:2.5 },
  { cle:'r25-40',   label:'Reglable 25-40 mm',   min:2.5, max:4.0,  prix:3.2 },
  { cle:'r40-70',   label:'Reglable 40-70 mm',   min:4.0, max:7.0,  prix:4.2 },
  { cle:'r60-100',  label:'Reglable 60-100 mm',  min:6.0, max:10.0, prix:5.5 },
  { cle:'r100-170', label:'Reglable 100-170 mm', min:10.0,max:17.0, prix:7.5 },
  { cle:'r170-300', label:'Reglable 170-300 mm', min:17.0,max:30.0, prix:11.0 }
];
export const PLOT_ENTRAXE_MAX_M = 0.70;   // NF DTU 51.4, appuis sous lambourdes, pose sur 3 appuis ou +
export const PLOT_HAUTEUR_DTU_CM = 30;    // au-dela, le plot reglable sort du domaine du DTU
export const PLOT_HAUTEUR_MAX_CM = 100;   // au-dela, le platelage entier sort du domaine
export const PLOT_ASSISE_MIN_CM2 = 300;   // surface d'assise minimale, NF DTU 51.4 / 43.1
/** Un type de support et ce qu'il implique en preparation de sol. */
export interface TypeSupport { label: string; decaissement: boolean; geotextile: boolean; concasse: boolean; dalles: boolean }
export const SUPPORT_TYPES: Record<string, TypeSupport> = {
  'dalle':       { label:'Dalle ou chape existante',        decaissement:false, geotextile:false, concasse:false, dalles:false },
  'concasse':    { label:'Decaissement + concasse compacte', decaissement:true,  geotextile:true,  concasse:true,  dalles:false },
  'plots-beton': { label:'Dalles stabilisatrices sous plots',decaissement:true,  geotextile:true,  concasse:true,  dalles:true  }
};
export const GEOTEXTILE_PRICE = { bas:1,  haut:3  };   // €/m²
export const CONCASSE_PRICE   = { bas:35, haut:60 };   // €/m³
export const DALLE_STAB_PRICE = { bas:3,  haut:7  };   // €/u
export function estPlots(c: { typePose?: string }): boolean { return c.typePose === 'plots'; }
export function plotModele(c: { hauteurPlot?: number; plotModele?: string }): { cle: string; label: string; min: number; max: number; prix: number } {
  const h = c.hauteurPlot || 10;
  if(c.plotModele && c.plotModele !== 'auto'){
    const m = PLOT_MODELES.find(x=>x.cle===c.plotModele);
    if(m) return m;
  }
  // Support suppose plan : une seule hauteur, donc le modele le moins cher qui la couvre.
  return PLOT_MODELES.find(m=>h >= m.min-1e-9 && h <= m.max+1e-9)
      || PLOT_MODELES[PLOT_MODELES.length-1];
}
export const SOLIVE_PRICE = { bas:4, haut:7 };
export const VISSERIE_PRICE = { bas:4, haut:6 };
export const LAME_RIVE_PRICE = { bas:10, haut:20 };
export const LAME_RIVE_EPAISSEUR_M = 0.022; // 22mm, planche de rive standard
