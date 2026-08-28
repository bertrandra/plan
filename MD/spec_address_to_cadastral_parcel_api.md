# Specification — Address → Cadastral Parcel API

## 1. Objective

Build a backend service that converts a French postal address into the corresponding cadastral parcel(s), retrieves the official cadastral geometry, and returns a normalized parcel object suitable for:

- cadastral map display;
- automatic plan de masse generation;
- parcel geometry editing;
- PLU/GPU intersection;
- SPR / heritage constraint analysis;
- 2D SVG generation;
- 3D Three.js generation.

The service uses the **IGN API Carto — module Cadastre** as the cadastral geometry source.

API base:

`https://apicarto.ign.fr/api/cadastre`

The API returns GeoJSON in WGS84 / EPSG:4326.

---

## 2. High-level architecture

```text
USER
  |
  v
Address input
  |
  v
Address Geocoder — Géoplateforme
  |
  v
latitude / longitude
  |
  v
API Carto Cadastre
  |
  v
parcel candidates
  |
  v
candidate resolver / scoring
  |
  v
selected parcel
  |
  v
geometry normalization / projection
  |
  +----> Map
  +----> PLU/GPU
  +----> Plan de masse
  +----> SVG
  +----> Three.js
```

---

## 3. External APIs

### 3.1 Address geocoding

Use the Géoplateforme geocoding API:

`https://data.geopf.fr/geocodage`

The service converts an address into geographic coordinates.

For autocomplete, use the Géoplateforme autocompletion service.

### 3.2 API Carto Cadastre

Base URL:

`https://apicarto.ign.fr/api/cadastre`

Principal operations:

```text
GET /commune
GET /division
GET /feuille
GET /parcelle
GET /localisant
```

The `/parcelle` operation is the main operation for the application.

---

## 4. Address → parcel strategy

Do not attempt:

```text
address → parcel number
```

directly.

Use:

```text
address
  ↓
geocoding
  ↓
longitude / latitude
  ↓
parcel spatial search
  ↓
parcel candidates
  ↓
candidate resolution
  ↓
selected parcel
```

This is more robust because a postal address does not inherently contain the cadastral section and parcel number.

---

## 5. Step 1 — Geocode address

### Input

```json
{
  "address": "12 avenue Exemple",
  "postcode": "78110",
  "city": "Le Vésinet"
}
```

### Normalized query

```text
12 avenue Exemple 78110 Le Vésinet
```

### Expected output

```json
{
  "label": "12 Avenue Exemple, 78110 Le Vésinet",
  "latitude": 48.89,
  "longitude": 2.13,
  "postcode": "78110",
  "city": "Le Vésinet",
  "citycode": "78650",
  "score": 0.98
}
```

Retain the geocoder result as evidence for parcel resolution.

---

## 6. Step 2 — Find candidate parcels

The API Carto Cadastre supports spatial parcel queries using GeoJSON geometry.

Create a small search geometry around the geocoded point.

Recommended search sequence:

```text
10 m
  ↓ if no result
25 m
  ↓ if no result
50 m
  ↓ if no result
100 m maximum automatic search
```

The backend records the radius that produced the result.

Conceptual request:

```text
GET /parcelle
?geom=<GeoJSON>
&_limit=40
&source_ign=PCI
```

Coordinates are sent in WGS84 longitude/latitude order.

---

## 7. Candidate resolution

Do not blindly select the first returned parcel.

Each candidate receives a confidence score.

### Suggested scoring

| Criterion | Weight |
|---|---:|
| Geocoded point inside parcel | +60 |
| Address point within 5 m | +20 |
| Address point within 10 m | +10 |
| Exact commune match | +10 |
| Valid parcel geometry | +5 |
| PCI source | +5 |

Example:

```text
Candidate A
point inside parcel   +60
commune match         +10
PCI                   +5
geometry valid        +5
--------------------------
score                  80
```

The highest scoring candidate is selected.

---

## 8. Ambiguity handling

Return:

```json
{
  "status": "ambiguous",
  "candidates": []
}
```

when:

```text
topScore - secondScore < 15
```

The UI must then ask the user to select the parcel on the map.

This is important for:

- corner properties;
- apartment buildings;
- large plots;
- multiple cadastral parcels for one address;
- roads bordering several parcels.

---

## 9. Direct parcel lookup

Once the cadastral identifier is known:

```text
GET /parcelle
    ?code_insee={INSEE}
    &section={SECTION}
    &numero={NUMERO}
    &source_ign=PCI
```

Example:

```text
https://apicarto.ign.fr/api/cadastre/parcelle?code_insee=44109&section=DV&numero=0326&source_ign=PCI
```

---

## 10. Internal parcel model

Normalize the external API response into a stable internal schema.

```json
{
  "id": "78650-AE-0101",

  "source": {
    "provider": "IGN",
    "service": "API_CARTO_CADASTRE",
    "dataset": "PCI",
    "retrievedAt": "2026-08-26T14:30:00Z"
  },

  "administrative": {
    "codeInsee": "78650",
    "commune": "Le Vésinet",
    "department": "78"
  },

  "cadastral": {
    "section": "AE",
    "number": "0101"
  },

  "geometry": {
    "type": "Polygon",
    "coordinates": []
  },

  "geometryCrs": "EPSG:4326",

  "area": {
    "value": 716.0,
    "unit": "m2",
    "calculated": true
  },

  "geocoding": {
    "address": "12 avenue Exemple",
    "longitude": 2.13,
    "latitude": 48.89,
    "confidence": 0.98
  }
}
```

---

## 11. Geometry processing

The API returns WGS84 GeoJSON.

Do not use latitude/longitude directly for metric construction calculations.

Pipeline:

```text
EPSG:4326
    ↓
local metric projection
    ↓
geometry calculations
    ↓
SVG / CAD / 3D coordinates
```

Maintain two representations:

```text
sourceGeometry
    EPSG:4326
    authoritative source

workingGeometry
    metric projection
    measurements / offsets / construction
```

---

## 12. Geometry validation

Every returned parcel must pass:

```text
✓ GeoJSON valid
✓ Polygon / MultiPolygon supported
✓ Ring closed
✓ Coordinates finite
✓ Geometry not empty
✓ Geometry can be projected
✓ Area > 0
```

If the geometry needs repair, preserve both:

```text
originalGeometry
repairedWorkingGeometry
```

Never silently replace the official source geometry.

---

## 13. Area calculation

Do not depend on a supplied area for construction calculations.

Calculate area from the geometry using a robust spatial library.

Recommended:

### Backend

```text
PostGIS / GEOS
```

or:

```text
Turf.js
```

### Browser

```text
Turf.js
```

For production, PostGIS is preferred.

---

## 14. SaaS API endpoint

The frontend must not call API Carto directly.

Expose:

```text
GET /api/v1/parcels/by-address
```

Parameters:

```text
address
postcode
city
```

Example:

```text
GET /api/v1/parcels/by-address
    ?address=12%20avenue%20Exemple
    &postcode=78110
    &city=Le%20Vésinet
```

---

## 15. API response

Successful response:

```json
{
  "status": "success",

  "query": {
    "address": "12 avenue Exemple",
    "postcode": "78110",
    "city": "Le Vésinet"
  },

  "geocoding": {
    "label": "12 Avenue Exemple, 78110 Le Vésinet",
    "longitude": 2.13,
    "latitude": 48.89,
    "score": 0.98
  },

  "parcel": {
    "id": "78650-AE-0101",
    "codeInsee": "78650",
    "section": "AE",
    "number": "0101",

    "geometry": {
      "type": "Polygon",
      "coordinates": []
    },

    "areaM2": 716.0
  },

  "confidence": {
    "score": 95,
    "level": "high"
  },

  "source": {
    "provider": "IGN",
    "service": "API Carto Cadastre",
    "dataset": "PCI"
  }
}
```

---

## 16. Error model

Standardize errors:

```json
{
  "status": "error",
  "code": "PARCEL_NOT_FOUND",
  "message": "No cadastral parcel could be identified."
}
```

Supported codes:

```text
INVALID_ADDRESS
GEOCODING_FAILED
GEOCODING_LOW_CONFIDENCE
PARCEL_NOT_FOUND
PARCEL_AMBIGUOUS
CADASTRE_API_ERROR
CADASTRE_API_TIMEOUT
INVALID_GEOMETRY
GEOMETRY_PROCESSING_ERROR
RATE_LIMITED
```

HTTP mapping:

```text
400 INVALID_ADDRESS
404 PARCEL_NOT_FOUND
409 PARCEL_AMBIGUOUS
429 RATE_LIMITED
502 CADASTRE_API_ERROR
504 CADASTRE_API_TIMEOUT
```

---

## 17. Caching

Cadastral geometry changes less frequently than user requests.

Recommended cache key:

```text
parcel:{codeInsee}:{section}:{numero}:PCI
```

Recommended TTL:

```text
30 days
```

Prefer dataset-update-driven invalidation when available.

Address geocoding:

```text
exact address: 24 hours
autocomplete: 5 minutes
```

---

## 18. Rate limiting and resilience

Architecture:

```text
Frontend
   ↓
Your API
   ↓
Redis rate limiter
   ↓
IGN APIs
```

External request policy:

```text
timeout: 5 seconds
retries: 2
exponential backoff
```

Retry only transient errors:

```text
408
429
502
503
504
```

Do not retry validation errors.

---

## 19. Fallback strategy

```text
1. API Carto parcel spatial query
        ↓
2. API Carto exact parcel lookup
        ↓
3. Géoplateforme cadastral geocoding
        ↓
4. Manual parcel selection
```

Manual selection is mandatory as the final fallback.

---

## 20. Frontend behavior

### Address input

```text
┌─────────────────────────────────────────┐
│ 12 avenue ...                           │
└─────────────────────────────────────────┘

12 avenue ..., 78110 Le Vésinet
12 avenue ..., 78110 ...
```

After selection:

```text
Searching parcel...
```

Then:

```text
Parcel: AE 101
Area: 716 m²
Confidence: High

[Use this parcel]
```

The selected parcel is highlighted on the map.

---

## 21. Manual parcel selection

When several candidates exist:

```text
Candidate 1
AE 101
716 m²

Candidate 2
AE 102
483 m²
```

The user selects directly on the map.

Store:

```text
selectionMethod = USER
```

versus:

```text
selectionMethod = AUTOMATIC
```

This distinction is important for traceability.

---

## 22. Plan-masse integration

Once selected:

```text
Parcel
  |
  +-- boundary
  +-- area
  +-- section
  +-- number
  +-- commune
       |
       v
PLU/GPU query
       |
       +-- zoning
       +-- prescriptions
       +-- SUP
       +-- constraints
       |
       v
Plan de masse
```

The parcel geometry becomes the base geometry for all subsequent project calculations.

---

## 23. Data lineage

Every parcel object must retain:

```json
{
  "source": "IGN",
  "service": "API Carto Cadastre",
  "dataset": "PCI",
  "retrievedAt": "...",
  "query": "...",
  "selectionMethod": "AUTOMATIC",
  "confidenceScore": 95
}
```

The product must state that cadastral geometry is a reference dataset and is not a property-boundary survey.

---

## 24. Security

The frontend communicates only with:

```text
/api/v1/*
```

The backend communicates with:

```text
apicarto.ign.fr
data.geopf.fr
```

Validate:

```text
address length
postcode format
city length
GeoJSON size
coordinates
```

Reject excessively large geometry requests.

---

## 25. Observability

Log:

```text
requestId
userId
addressHash
geocodingDuration
cadastreDuration
candidateCount
selectedParcel
confidence
API status
totalDuration
```

Avoid storing the complete address unnecessarily.

Example:

```json
{
  "requestId": "req_82fd",
  "geocodingMs": 214,
  "cadastreMs": 381,
  "candidates": 2,
  "selected": "78650-AE-0101",
  "confidence": 95,
  "durationMs": 621
}
```

---

## 26. Database model

```sql
CREATE TABLE cadastral_parcels (
    id UUID PRIMARY KEY,

    code_insee VARCHAR(5) NOT NULL,
    section VARCHAR(10) NOT NULL,
    parcel_number VARCHAR(10) NOT NULL,

    commune_name TEXT,
    department_code VARCHAR(3),

    source VARCHAR(30) NOT NULL,
    source_dataset VARCHAR(30) NOT NULL,

    geometry geometry(MultiPolygon, 4326),

    area_m2 NUMERIC,

    retrieved_at TIMESTAMPTZ NOT NULL,
    geometry_hash VARCHAR(128),

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),

    UNIQUE (
        code_insee,
        section,
        parcel_number,
        source_dataset
    )
);

CREATE INDEX cadastral_parcels_geom_idx
ON cadastral_parcels
USING GIST (geometry);
```

---

## 27. Business object architecture

Do not make the parcel ID the primary business object.

Use:

```text
Project
  |
  +-- Site
        |
        +-- CadastralParcelReference
```

A project may contain multiple parcels:

```text
AE101
AE102
AE103
```

or a future merged-site representation.

---

## 28. Recommended technology stack

### Frontend

```text
React / Next.js
MapLibre GL
Turf.js
Three.js
SVG
```

### Backend

```text
Node.js
TypeScript
Fastify or NestJS
```

### Spatial

```text
PostgreSQL
PostGIS
GEOS
```

### Cache

```text
Redis
```

### External services

```text
IGN Géoplateforme Geocoding
IGN API Carto Cadastre
IGN API Carto GPU
IGN WFS
```

---

## 29. MVP scope

Implement:

```text
[1] Address autocomplete
        ↓
[2] Address geocoding
        ↓
[3] Parcel spatial search
        ↓
[4] Candidate scoring
        ↓
[5] Parcel selection
        ↓
[6] GeoJSON normalization
        ↓
[7] Parcel display
        ↓
[8] Save parcel to project
```

Do not implement ownership information.

---

## 30. Version 2

Add:

```text
PLU/GPU
SPR
SUP
Buildings
Orthophoto
Topography
Road network
Address points
```

---

## 31. Version 3 — Automatic plan de masse

```text
ADDRESS
   |
   v
GEOCODING
   |
   v
CADASTRAL PARCEL
   |
   +----------------+
   |                |
   v                v
BUILDINGS        ORTHOPHOTO
   |                |
   +-------+--------+
           |
           v
        PLU/GPU
           |
           v
        SPR/SUP
           |
           v
     SITE ANALYSIS
           |
           v
     PLAN DE MASSE
           |
      +----+----+
      |         |
      v         v
     SVG      THREE.JS
      |         |
      +----+----+
           |
           v
        PDF / 3D
```

---

## 32. Key architectural principle

**IGN remains the source of cadastral reference geometry; the application owns the project geometry and all derived design geometry.**

This separation makes the system easier to maintain when adding:

- terraces;
- buildings;
- setbacks;
- PLU constraints;
- SPR constraints;
- 3D generation;
- automatic plan de masse;
- PDF generation.
