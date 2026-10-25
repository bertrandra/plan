// Les types d'un debit (engine/debit.ts), a part : le prix d'un debit (engine/prix.ts::coutDebit) les lit sans importer le debit,
// qui importe le prix. Sans cela, le moteur tournait en rond par ses types (audit d'architecture, 25 octobre 2026).

/**
 * Ce que devient une barre d'une longueur donnee : quatre sorts, et deux totaux de chutes.
 *
 * Les distinguer n'est pas cosmetique — c'est ce qui separe une chute de 2 m qui repart dans le pot
 * d'un rebut de 6 cm. Les moyenner produirait un chiffre qui ne decrit ni l'un ni l'autre.
 */
export interface RolesLongueur {
  /** Posee telle quelle. */
  entiere: number;
  /** Recoupee, avec une chute trop courte pour resservir. */
  ajustee: number;
  /** Recoupee, avec une chute qui repart au pot. */
  recoupee: number;
  /** Troncon intermediaire d'une travee a joints. */
  troncon: number;
  rebutMl: number;
  potMl: number;
}

/** Un debit calcule : ce qu'on achete, ce qu'on pose, ce qu'on jette, ce qu'il reste. */
export interface Debit {
  /** Nombre de barres achetees, par longueur. */
  achats: Record<string, number>;
  roles: Record<string, RolesLongueur>;
  /** Metres reellement poses. */
  reelMl: number;
  achatMl: number;
  perdueMl: number;
  restantMl: number;
  /** Les chutes reutilisables restantes, de la plus longue a la plus courte. */
  pool: number[];
  chuteMl: number;
}
