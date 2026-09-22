# Campus PAÏA

Base de connaissances personnelle construite avec Next.js, React, TypeScript et l’App Router.

## Démarrage

```bash
npm install
npm run dev
```

## Configuration du corpus

Copier `.env.example` vers `.env.local`. `OPENAI_API_KEY`, `OPENAI_VECTOR_STORE_ID` et `OPENAI_MODEL` restent exclusivement côté serveur. Sans cette configuration, `/api/search` répond explicitement « Corpus Campus PAÏA non connecté ».

Le catalogue maître reste l’onglet `07_CATALOGUE_CORPUS` du Projet 20. Le Google Apps Script transmet chaque position à `POST /api/admin/index-document`, avec le secret dans `x-campus-sync-secret` ou `Authorization: Bearer …`.

## Compatibilité Google Apps Script V2

Les anciennes routes Cloudflare sont reproduites côté serveur pour permettre une migration sans réécriture du parcours Drive :

- `GET /api/controller/ping` ;
- `POST /api/controller/setup-search` ;
- `GET /api/controller/corpus-stats` ;
- `POST /api/controller/index-document`.

Elles acceptent l’ancien header `X-Campus-Controller-Token`, ainsi que `x-campus-sync-secret` et `Authorization: Bearer`. Les trois formes sont comparées uniquement à `CAMPUS_SYNC_SECRET` côté serveur. L’ancienne indexation JSON `{ key, text }` ou `{ key, contentBase64 }` est acceptée ; une entrée portant la même `key` remplace son rattachement précédent dans le Vector Store afin de limiter les doublons.

## Actifs de marque officiels

Les quatre fichiers officiels restent inchangés dans `public/brand/` :

- `01_PAIA_Circulaire_Logo_Principal.png`
- `02_PAIA_Circulaire_Logo_Compact.png`
- `03_MMPA_Circulaire_Logo.png`
- `04_PAIA_Circulaire_Icone.png`

Ne jamais convertir, recadrer, recolorer ou renommer ces actifs.
