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
  foerst, klikbare. Ingen knapper endnu.
- **Bid 2 (naeste): status-knapper** - markere "interesseret" / "ingen interesse",
  skrives tilbage i `status`-kolonnen i databasen.
- **Bid 3 (senere): "Byg CV"-knap** - kopierer jobbet i FASE 1-format + aabner
  CV-bygger-projektet, saa Torben kan paste og starte en jobsag. IKKE
  fuldautomatisk - mennesket bliver i loopet.

## Teknik
- Node + Express. `server.js` serverer `public/index.html` og et endpoint
  `/api/jobs` der laeser fra Postgres.
- Taler med databasen som n8n: direkte Postgres, indefra Pixas docker-net.
  Ingen Kong/anon-noegle/ekstern adgang. Kun PGPASSWORD skal saettes; resten
  har standard i koden.

## Deploy (Coolify paa Pixa)
1. Ressource i Coolify ud fra GitHub-repo `Tmat-code/jobtavle` (branch `main`),
   kilde = eksisterende GitHub App. Auto deploy = "Deploy on push (webhooks)",
   saa hvert push bygger automatisk om.
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

## Database (reference)
Tabel `job_opslag`. Relevante kolonner her: bane, titel, virksomhed, url,
oprettet, status. bane-vaerdier: `fm`, `indkøb` (med oe!), `hr`, `koordinator`.

## AEndringslog
- 2026-10-27: Foerste version (bid 1 - vis job). Oprettet af Claude.
- 2026-10-27: Tilfoejet Dockerfile. Pixas Docker mangler buildx/BuildKit, saa
  Railpack-build fejlede. Byg i stedet med build strategy = **Dockerfile**
  (klassisk docker build, ingen buildx noedvendig). Node 20 alpine, port 3000.
- 2026-10-27: Docker-netvaerk loest permanent med systemd-servicen
  `jobtavle-netfix.service` paa Pixa-vaerten. Adgang via port mapping
  `192.168.1.18:8090`. Bid 1 i drift.
