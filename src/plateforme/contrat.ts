// ENGENDRE PAR scripts/generer-client.mjs — NE PAS MODIFIER A LA MAIN.
//
// Source : contrat/backprod.openapi.json, extrait de la plateforme au commit
// ce0642c4537743f7129a5ad7d5c1a87f4b907502.
// Regenerer : node scripts/generer-client.mjs — verifier : npm run gate:client
//
// 13 operations, 7 schemas. Ce fichier ne contient aucun appel : il dit ce que la
// plateforme promet. Qui appelle, et comment, est le travail de l'etape 1
// (MD/spec-connexion-plateforme.md §16).

export type Entitlement = {
  feature: string;
  name: string;
  kind: 'BOOLEAN' | 'QUOTA';
  unit: string | null;
  /** Null means two different things, so `unlimited` says which. */
  limit: number | null;
  unlimited: boolean;
  /** What produced it — a subscription grant, or an override negotiated outside one. `GRANT`: given by the platform */
  source: 'SUBSCRIPTION' | 'OVERRIDE' | 'GRANT';
  valid_until: string | null;
};

/** The §10.4 envelope. Every failure has this shape, whatever produced it. */
export type Error = {
  error: {
    /** Stable and machine-readable. Branch on this, never on the message. */
    code: string;
    /** For a person. Wording may change without notice. */
    message: string;
    /** What the code could not say alone — the field at fault, the limit exceeded. Empty rather than absent. */
    details: Record<string, unknown>;
    /** Quote this when reporting a problem; the server log is keyed by it. */
    request_id: string;
  };
};

export type Project = ProjectSummary & {
  document: ProjectDocument;
};

/** The JSONB document. Key order is preserved and insignificant whitespace is gone — what is stored is what comes back, which is the guarantee snapshot and restore rest on. Large assets are refused here and belong in storag */
export type ProjectDocument = Record<string, unknown>;

export type ProjectSummary = {
  id: string;
  name: string;
  description: string | null;
  /** Which document shape this is. Enforced on write (non-negotiable #10): an unknown version is refused rather tha */
  schema_version: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  /** When somebody deleted it, or null while it is live. A deleted project keeps its versions, its assets and every */
  deleted_at: string | null;
};

export type ProjectVersionSummary = {
  id: string;
  version_number: number;
  label: string | null;
  name: string;
  description: string | null;
  schema_version: number;
  created_by: string | null;
  created_at: string;
};

/** The refresh token is deliberately absent: it leaves in an `HttpOnly` cookie that no script can read, and putting it here as well would throw away the reason the cookie exists. */
export type Session = {
  /** Present it as `Authorization: Bearer <token>`. Hold it in memory; it is short-lived by design. */
  access_token: string;
  token_type: string;
  /** Seconds from now. A duration rather than an instant, so a browser with a skewed clock still schedules its rene */
  expires_in: number;
};

/** Create a project */
export type ReponseCreateProject = Project;

export type CorpsCreateProject = {
    name: string;
    description?: string | null;
    schema_version: number;
    document: ProjectDocument;
  };

/** Delete a project */
export type ReponseDeleteProject = void;

/** Copy a project */
export type ReponseDuplicateProject = Project;

/** The tenant's projects */
export type ReponseListProjects = {
    projects: ProjectSummary[];
    total: number;
    limit: number;
    offset: number;
  };

/** A project's saved versions */
export type ReponseListProjectVersions = {
    versions: ProjectVersionSummary[];
  };

/** Exchange the refresh cookie for a new session */
export type ReponseRefreshSession = Session;

/** Restore a saved version over the project */
export type ReponseRestoreProject = Project;

export type CorpsRestoreProject = {
    version_id: string;
  };

/** Who is asking and what they hold, in one answer */
export type ReponseShowMyContext = {
    user: {
      id: string;
      email: string | null;
      display_name: string | null;
      locale: 'en' | 'fr' | 'es' | 'de' | 'it';
    };
    tenant: {
      id: string;
      slug: string | null;
      name: string | null;
    };
    product: {
      id: string;
      code: string | null;
      name: string | null;
      app_url: string | null;
    };
    roles: string[];
    permissions: string[];
    /** Resolved for this person: a seat they hold counts, a colleague’s does not (§13.1). */
    capabilities: string[];
    /** What the tenant holds on this product, with limits — the same rows `listEntitlements` shows. */
    entitlements: Entitlement[];
    /** One row per quota, with what has been counted against it — the same rows `showTenantUsage` shows. */
    usage: {
      feature: string;
      name: string;
      unit: string | null;
      limit: number | null;
      unlimited: boolean;
      metered: boolean;
      used: number | null;
      remaining: number | null;
    }[];
    /** When the bearer this was answered for stops being accepted — cache no longer than this. Null when the token ca */
    token_expires_at: string | null;
  };

/** One project, with its document */
export type ReponseShowProject = Project;

/** Exchange an email and password for a session */
export type ReponseSignIn = Session;

export type CorpsSignIn = {
    email: string;
    /** Not trimmed: a password may legitimately begin or end with a space. The 72-byte ceiling is bcrypt's — it ignor */
    password: string;
  };

/** End this session */
export type ReponseSignOut = void;

/** Put a deleted project back */
export type ReponseUndeleteProject = Project;

/** Change a project */
export type ReponseUpdateProject = Project;

export type CorpsUpdateProject = {
    name?: string;
    description?: string | null;
    schema_version?: number;
    document?: ProjectDocument;
  };

/**
 * Ou vivent les operations, pour que personne n'ecrive une URL a la main.
 *
 * `chemin` porte ses trous `{nom}` tels que le contrat les ecrit ; `cheminParams` les nomme, dans
 * l'ordre ou ils apparaissent. `succes` est le seul statut 2xx que le contrat declare — un autre
 * est une surprise, pas un succes.
 */
export const OPERATIONS = {
  createProject: {
    methode: 'POST',
    chemin: '/api/v1/projects',
    succes: 201,
    cheminParams: [],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  },
  deleteProject: {
    methode: 'DELETE',
    chemin: '/api/v1/projects/{projectId}',
    succes: 204,
    cheminParams: ['projectId'],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  },
  duplicateProject: {
    methode: 'POST',
    chemin: '/api/v1/projects/{projectId}/duplicate',
    succes: 201,
    cheminParams: ['projectId'],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  },
  listProjects: {
    methode: 'GET',
    chemin: '/api/v1/projects',
    succes: 200,
    cheminParams: [],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: ['limit', 'offset', 'deleted']
  },
  listProjectVersions: {
    methode: 'GET',
    chemin: '/api/v1/projects/{projectId}/versions',
    succes: 200,
    cheminParams: ['projectId'],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  },
  refreshSession: {
    methode: 'POST',
    chemin: '/api/v1/auth/refresh',
    succes: 200,
    cheminParams: [],
    entetes: [],
    requete: []
  },
  restoreProject: {
    methode: 'POST',
    chemin: '/api/v1/projects/{projectId}/restore',
    succes: 200,
    cheminParams: ['projectId'],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  },
  showMyContext: {
    methode: 'GET',
    chemin: '/api/v1/me/context',
    succes: 200,
    cheminParams: [],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  },
  showProject: {
    methode: 'GET',
    chemin: '/api/v1/projects/{projectId}',
    succes: 200,
    cheminParams: ['projectId'],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  },
  signIn: {
    methode: 'POST',
    chemin: '/api/v1/auth/token',
    succes: 200,
    cheminParams: [],
    entetes: [],
    requete: []
  },
  signOut: {
    methode: 'POST',
    chemin: '/api/v1/auth/sign-out',
    succes: 204,
    cheminParams: [],
    entetes: [],
    requete: []
  },
  undeleteProject: {
    methode: 'POST',
    chemin: '/api/v1/projects/{projectId}/undelete',
    succes: 200,
    cheminParams: ['projectId'],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  },
  updateProject: {
    methode: 'PATCH',
    chemin: '/api/v1/projects/{projectId}',
    succes: 200,
    cheminParams: ['projectId'],
    entetes: [{ nom: 'X-Product', requis: true }, { nom: 'X-Tenant', requis: false }],
    requete: []
  }
} as const;

export type IdOperation = keyof typeof OPERATIONS;
