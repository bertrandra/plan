// Les hypotheses de calcul (Eurocodes : neige, vent, terrain) et le declarant d'une declaration prealable. A part de
// model/types.ts, qui les re-exporte (audit d'architecture, 25 octobre 2026).

/** Region de neige de l'annexe nationale francaise de NF EN 1991-1-3. */
export type ZoneNeige = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'D' | 'E';
/** Categorie de terrain de l'annexe nationale francaise de NF EN 1991-1-4. */
export type CategorieTerrain = '0' | 'II' | 'IIIa' | 'IIIb' | 'IV';

/**
 * Ce que la note de calcul d'un abri demande en plus de sa geometrie. Les zones n'ont pas de valeur
 * par defaut : une note calculee sur une zone devinee serait fausse sans le dire.
 */
export interface HypothesesCalcul {
  zoneNeige?: ZoneNeige;
  /** Region de vent, 1 a 4. */
  zoneVent?: number;
  /** Altitude du terrain, en metres. */
  altitude?: number;
  terrain?: CategorieTerrain;
  classeBois?: 'C24' | 'GL24h';
  /** Classe de service (NF EN 1995-1-1 §2.3.1.3) : 2 sous abri, 3 a l'exterieur. */
  classeService?: number;
  /** Epaisseur des parois des profiles aluminium, en mm. */
  epaisseurAlu?: number;
  /** Poids de la couverture, en kg/m² de rampant. */
  poidsCouverture?: number;
  /** Obstruction sous le toit (NF EN 1991-1-4 §7.3, φ), de 0 a 1. */
  obstruction?: number;
}

/**
 * Le declarant et son projet, pour le cerfa 13703 (declaration prealable, maison individuelle et
 * ses annexes). Tout est facultatif : ce qui manque reste vide dans le formulaire, a completer a la main.
 */
export interface DeclarationPrealable {
  nom?: string;
  prenom?: string;
  /** Date de naissance, AAAA-MM-JJ. */
  naissance?: string;
  communeNaissance?: string;
  departementNaissance?: string;
  paysNaissance?: string;
  numero?: string;
  voie?: string;
  lieuDit?: string;
  localite?: string;
  codePostal?: string;
  telephone?: string;
  email?: string;
  /** Recevoir les reponses de l'administration a cette adresse electronique. */
  accepteEmail?: boolean;
  /** L'adresse du terrain, quand elle differe de celle lue au cadastre. */
  terrainNumero?: string;
  terrainVoie?: string;
  terrainLocalite?: string;
  terrainCodePostal?: string;
  residence?: 'principale' | 'secondaire';
}
