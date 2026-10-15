// Les types de donnees.mjs, pour les tests (tests/unit/buildsg/) : le serveur reste en JavaScript
// pur, sans build, comme app.js.

export const FORMAT_MIGRATION_DONNEES: string;
export const NOTE_DEPLACEMENT: string;

export interface DossiersDonnees {
  disposition: 'data' | 'ancienne';
  racine: string;
  demos: string;
  admin: string;
  palette: string;
  controleurs: string;
  echecs: string;
  anciens: string[];
}

export interface MigrationDonnees {
  format: string;
  version: 1;
  le: string;
  depuis: string | null;
  deplaces: string[];
  laisses: string[];
}

export function dossiersDonnees(o: { dossierDonnees?: string | null; dossierDemos?: string | null; parent: string; anciens?: string[] }): DossiersDonnees;
export function migrerDonnees(d: DossiersDonnees, maintenant?: string): MigrationDonnees | null;
export function vueDonnees(d: DossiersDonnees): { disposition: 'data' | 'ancienne'; racine: string; migration: MigrationDonnees | null };
