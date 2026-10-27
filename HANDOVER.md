# Jobtavle - HANDOVER

Lille webside der viser Torbens job fra Supabase-databasen (`job_opslag` paa Pixa).
Del af jobagent-opsaetningen: jobagenten (n8n) samler job i Supabase; denne side
er overblikket. Erstatter den gamle Jobtavle-artifact.

## Status
- **Bid 1 (nu): vis job.** Siden henter alle job fra databasen og viser dem
  grupperet efter bane (FM / Indkoeb / HR / Koordinator), nyeste foerst, med
  klikbare links. Ingen knapper endnu.
- **Bid 2 (naeste): status-knapper** - markere "interesseret" / "ingen interesse",
  skrives tilbage i `status`-kolonnen i databasen.
- **Bid 3 (senere): "Byg CV"-knap** - kopierer jobbet i FASE 1-format + aabner
  CV-bygger-projektet, saa Torben kan paste og starte en jobsag.

## Teknik
- Node + Express. `server.js` serverer `public/index.html` og et endpoint
  `/api/jobs` der laeser fra Postgres.
- Taler med databasen som n8n: direkte Postgres, indefra Pixas docker-net.
  Ingen Kong/anon-noegle/ekstern adgang.

## Deploy (Coolify paa Pixa)
1. Ny ressource i Coolify ud fra GitHub-repo `Tmat-code/jobtavle` (branch `main`).
   Build pack: Nixpacks (auto-detekterer Node via package.json).
2. Saet Environment Variable: **PGPASSWORD** = POSTGRES_PASSWORD fra Coolifys
   Supabase-ressource. (De oevrige PG-vaerdier har standard i koden.)
3. **VIGTIGT - docker-netvaerk:** app-containeren skal paa samme docker-net som
   Supabase for at kunne naa `supabase-db-...`. Samme problem som n8n havde.
   Efter foerste deploy, kobl containeren paa:
   `docker network connect asmzli3ytzonaxou4fmfalee <jobtavle-container>`
   (falder evt. af hvis Coolify genskaber containeren -> koer igen).
4. Deploy, aabn URL'en, se jobbene.

## Database (reference)
Tabel `job_opslag`. Relevante kolonner her: bane, titel, virksomhed, url,
oprettet, status. bane-vaerdier: `fm`, `indkøb` (med oe!), `hr`, `koordinator`.

## AEndringslog
- 2026-10-27: Foerste version (bid 1 - vis job). Oprettet af Claude.
