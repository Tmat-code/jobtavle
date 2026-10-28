# Jobtavle - HANDOVER

Lille webside der viser Torbens job fra Supabase-databasen (`job_opslag` paa Pixa).
Del af jobagent-opsaetningen: jobagenten (n8n) samler job i Supabase; denne side
er overblikket. Erstatter den gamle Jobtavle-artifact.

## Adgang
- **http://192.168.1.18:8090** (paa hjemmenettet). Port mapping `8090:3000` i Coolify.
- Den offentlige sslip.io-adresse virker IKKE indefra (rammer routeren - NAT/hairpin).

## Status
- **Bid 1: vis job.** FAERDIG og live. Siden henter alle job fra databasen og
  viser dem grupperet efter bane (FM / Indkoeb / HR / Koordinator), nyeste
  foerst, klikbare.
- **Bid 2: status.** FAERDIG. Hvert jobkort har en statusvaelger (dropdown):
  Ny / Interesseret / Ansoegt / Til samtale / Ingen interesse. Valget gemmes
  straks i `status`-kolonnen (+ `status_aendret`). De positive statusser faar
  en farvemarkering (groen/blaa/lilla venstrekant + badge) = pipeline-overblik.
  "Ingen interesse" skjuler jobbet fra standardvisningen; en "Vis afviste"-knap
  oeverst henter dem frem igen. Titlen er linket til opslaget; vaelgeren ved siden
  trigger ikke linket.
- **Bid 3 (senere): "Byg CV"-knap** - kopierer jobbet i FASE 1-format + aabner
  CV-bygger-projektet, saa Torben kan paste og starte en jobsag. IKKE
  fuldautomatisk - mennesket bliver i loopet.

## Teknik
- Node + Express. `server.js` serverer `public/index.html` og to endpoints:
  - `GET /api/jobs` - laeser alle job fra Postgres (nu inkl. `id`).
  - `POST /api/jobs/:id/status` body `{status}` - saetter status (+ `status_aendret
    = now()`). Validerer baade id og status mod en hvidliste; ugyldigt = 400.
    Gyldige statusser: ny, interesseret, ansøgt, til samtale, ingen interesse.
- Taler med databasen som n8n: direkte Postgres, indefra Pixas docker-net.
  Ingen Kong/anon-noegle/ekstern adgang. Kun PGPASSWORD skal saettes; resten
  har standard i koden.

## Deploy (Coolify paa Pixa)
1. Ressource i Coolify ud fra GitHub-repo `Tmat-code/jobtavle` (branch `main`),
   kilde = eksisterende GitHub App. **Auto-deploy sker via n8n-poller**, IKKE
   Coolifys egen webhook (GitHub kan ikke naa Coolify paa Pixa - lukkede porte).
   Se "Auto-deploy" nedenfor.
2. **Build strategy = Dockerfile** (IKKE Railpack/Nixpacks - Pixas Docker mangler
   buildx/BuildKit, saa Railpack fejler). Node 20 alpine, port 3000.
3. Environment Variable: **PGPASSWORD** = POSTGRES_PASSWORD fra Coolifys
   Supabase-ressource.
4. Port mapping `8090:3000` (Edit Networking -> Port mappings).

## Docker-netvaerk - LOEST PERMANENT
App-containeren starter paa `coolify`-nettet og kan ikke naa `supabase-db-...`
(fejl `getaddrinfo EAI_AGAIN`). Loesning: en systemd-service paa Pixa-vaerten,
`jobtavle-netfix.service`, lytter paa docker-events og kobler containeren paa
Supabase-nettet (`asmzli3ytzonaxou4fmfalee`) i samme sekund den starter - ved
hvert deploy og hver genstart. Ingen manuel kommando laengere.
- Script: `/usr/local/bin/jobtavle-netfix.sh` (matcher container-navn der starter
  med `hogqj4ujuvdnfgvsvslv7mxc`).
- Unit: `/etc/systemd/system/jobtavle-netfix.service` (enabled, Restart=always).
- Tjek: `systemctl status jobtavle-netfix.service`. Manuel engangs-fallback:
  `docker network connect asmzli3ytzonaxou4fmfalee <container>`.
- Samme docker-net-faelde gaelder n8n; permanent loesning for n8n udestaar stadig.

## Auto-deploy (n8n-poller)
GitHub kan ikke naa Coolify paa Pixa (lukkede porte), saa Coolifys webhook-deploy
virker ikke. I stedet koerer et separat n8n-workflow, **"Jobtavle auto-deploy"**
(kopi af bugherrer-polleren, egen staticData-hukommelse):
Schedule (hvert 3. min) -> GitHub GET commits/main -> JS-node sammenligner sha mod
sidst sete (`$getWorkflowStaticData('global')`) -> ved nyt commit: POST
`http://192.168.1.18:8000/api/v1/deploy?uuid=hogqj4ujuvdnfgvsvslv7mxc&force=false`
(Bearer: Coolify API-token `n8n-deploy`). Push til `main` er live inden for ~3 min,
uden manuelt Redeploy-klik. Kraever at repoet er **public** (ellers 404 fra GitHub).

## Database (reference)
Tabel `job_opslag`. Relevante kolonner her: id (**UUID**, ikke heltal), bane,
titel, virksomhed, url, oprettet, status, status_aendret. bane-vaerdier: `fm`, `indkøb` (med oe!), `hr`,
`koordinator`. status-vaerdier siden bruger: ny (default), interesseret, ansøgt,
til samtale, ingen interesse.

## AEndringslog
- 2026-10-27: Foerste version (bid 1 - vis job). Oprettet af Claude.
- 2026-10-27: Tilfoejet Dockerfile. Pixas Docker mangler buildx/BuildKit, saa
  Railpack-build fejlede. Byg i stedet med build strategy = **Dockerfile**
  (klassisk docker build, ingen buildx noedvendig). Node 20 alpine, port 3000.
- 2026-10-27: Docker-netvaerk loest permanent med systemd-servicen
  `jobtavle-netfix.service` paa Pixa-vaerten. Adgang via port mapping
  `192.168.1.18:8090`. Bid 1 i drift.
- 2026-10-28: Auto-deploy via n8n-poller paa plads (repo gjort public). Pushes
  deployer nu selv inden for ~3 min. Se "Auto-deploy".
- 2026-10-28: Bid 2 - statusvaelger pr. job (ny/interesseret/ansøgt/til samtale/
  ingen interesse), gemt i `status` + `status_aendret`. Afviste skjules, "Vis
  afviste"-knap. Farvemarkering pr. status. Nyt endpoint POST /api/jobs/:id/status.
