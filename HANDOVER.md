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
- **Bid 3: "Byg CV"-knap.** FAERDIG. Hvert jobkort har en "Byg CV"-knap. Klik
  bygger en FASE 1-tekst (stilling, virksomhed, bane, link til opslaget + RSS-
  uddrag), kopierer den, og aabner CV-projektet paa claude.ai i en ny fane. Saa
  paster Torben teksten ind og starter jobsagen. IKKE fuldautomatisk - mennesket
  bliver i loopet, API-vejen bevidst fravalgt.
  - **Fuldt opslag hentes automatisk (naar muligt).** Databasen har kun RSS-
    uddraget. Nyt endpoint `GET /api/jobs/:id/opslag` henter Jobindex-siden,
    finder linket videre til virksomhedens ansoegningssystem og henter det FULDE
    opslag derfra, renset til ren tekst. Knappen lægger saa hele opslaget i
    FASE 1-teksten. **Kun hr-manager er bekraeftet** (bruges af bl.a. regioner/
    kommuner - godt for FM-banen). Andre, JavaScript-tunge systemer kan ikke
    hentes server-side; dér falder knappen automatisk tilbage til RSS-uddraget +
    link. Toasten siger hvad der skete ("Fuldt opslag hentet" vs. "Uddrag
    kopieret"). Afhaenger af at jobtavle-containeren selv har udgaaende
    internetadgang (det har n8n-containeren, saa den har den sandsynligvis ogsaa).
  - **Clipboard-faelde:** siden koerer paa http (ikke secure context), saa
    `navigator.clipboard` virker ikke. Kopiering sker derfor med den aeldre
    `document.execCommand("copy")` (synkron, virker paa http). Gaar selv den galt,
    vises en manuel kopi-boks med teksten valgt. `window.open` kaldes i samme
    klik-tick som kopieringen, saa den ikke popup-blokeres.
  - **Projekt-URL** staar som konstanten `PROJEKT_URL` oeverst i `public/index.html`
    - ret den ene linje hvis projektet flyttes.
  - `raw_tekst` (RSS-uddraget) kommer med i `GET /api/jobs` som fallback.
  - **Tilfoej flere ansoegningssystemer:** i `server.js` leder endpointet efter
    `hr-manager` i Jobindex-HTML'en. Vil man dække fx Emply, skal man bekraefte at
    deres opslag staar i raa HTML (ikke JS), og saa udvide det ene regex.
- **Bid 4: match-score.** FAERDIG. Hvert job faar en grov match-score baseret paa
  noegleord fra Torbens profil (loeft-ord) og anti-ord for fag han ikke har
  (koek/kok/sosu/haandvaerker-fag osv.). Vist som en lille farvet prik pr. kort
  (groen=staerk, okker=middel, graa=svag; score i hover-title). En skifter oeverst
  vaelger visning: **"Nyeste foerst"** (som hidtil, grupperet pr. bane) eller
  **"Bedste match foerst"** (flad liste, hoejeste score oeverst, bane som maerkat).
  - **VIGTIGT princip:** scoren SORTERER kun - den skjuler ALDRIG noget. Alle job
    er altid synlige; de svage ligger bare nederst. (Kun den manuelle "ingen
    interesse" skjuler, og det kan hentes frem igen.)
  - **Noegleordslisterne staar oeverst i `server.js`** (LOEFT_KERNE, LOEFT_KOMPETENCE,
    LOEFT_MAAL, LOEFT_BRANCHE, SAENK) + vaegtene i `VAEGT`. Bevidst lette at rette.
    Score beregnes server-side ved hver load (ingen DB-aendring), paa titel +
    RSS-uddrag. Korte ord (fm/hr/sla) kraever helt-ord-match; laengere maa matche
    ord der starter med dem (saa "indkøb" ogsaa fanger "indkøber").
  - **Farvetaersklerne** (staerk >=8, middel >=1, svag <=0) staar i `scoreNiveau`
    i index.html.
  - **Gennemsigtighed:** hvert kort viser en signal-linje "Match <score>" + de
    loeft-ord (groen) og saenk-ord (roed) der udloeste den. GET /api/jobs
    returnerer `loeft` og `saenk` pr. job, saa Torben kan se HVAD scoren bygger
    paa og justere listerne derefter.
  - **Begraensning:** scoren bygger pt. KUN paa titel + RSS-uddrag, ikke hele
    opslaget. Oplagt opgradering: gem fuldteksten pr. job (ny kolonne, fyldt ved
    indsaettelse eller lazy) og score paa den - saa ser matchet hele
    kravsteksten, ikke kun overskriften.
  - Naeste mulige opgradering (hvis for upraecist): semantisk match med embeddings
    + pgvector paa Supabase - kan koere paa Pixas CPU, ingen GPU noedvendig.
    (Lagt paa hylden 28.10: den grove score + manuel vurdering i CV-projektet er
    nok; profilen er for bred til at et "top-5" er realistisk. Embedding-API ville
    koste faa kroner/aar - ikke samme regnestykke som generativ LLM - men ikke
    bygget.)
- **Bid 5: bred agent + "Øvrige"-side.** En femte, BRED jobagent paa Jobindex
  UDEN titelsoegning (kun geografi: 40 km fra Lejre, fuldtid, fast) fanger
  stillinger hvor Torbens kompetencer passer under en utraditionel titel. De
  vises paa en separat **"Øvrige"-side** paa tavlen - og dubletter med de fire
  skarpe baner undgaas.
  - **Dedup-model (vigtig):** den brede agents upsert saetter `bred=true` og
    **roerer ikke `bane`**. De fire skarpe feeds saetter bane som hidtil. Saa et
    job der KUN er bredt faar bane=NULL -> Øvrige; et job der OGSAA fanges skarpt
    faar sin bane -> den bane, ikke Øvrige. Rækkefoelge-uafhaengigt, fordi de to
    aldrig roerer hinandens felter.
  - **Tavlen:** "Mine baner / Øvrige"-skifter oeverst. Baner-siden =
    bane IN (fm,indkøb,hr,koordinator). Øvrige-siden = alt andet (bane NULL), vist
    som flad liste (ingen baner at gruppere). Match-score + sortering gaelder begge
    sider - "Bedste match først" er isaer nyttig paa Øvrige, som er stor/stoejende.
  - **Ny kolonne:** `job_opslag.bred boolean DEFAULT false`. SELECT i /api/jobs
    henter den defensivt (falder tilbage hvis kolonnen mangler).
  - **`bane` gjort NULLABLE:** den havde en NOT NULL-constraint, saa brede job
    (bane=NULL) fejlede foerst. Rettet med
    `ALTER TABLE job_opslag ALTER COLUMN bane DROP NOT NULL;`.
  - **Digest (Telegram):** den brede agents upsert skal IKKE forbindes til digest,
    og digest-SQL'en skal have `AND bane IS NOT NULL` i `nye`-CTE'en, saa de mange
    brede job ikke tælles i morgenbeskeden. (Se Digest-node-afsnittet.)
  - **RSS-loft:** Jobindex RSS giver max 20 opslag pr. feed, saa den brede agent
    henter kun de 20 nyeste pr. koersel - den akkumulerer over tid, men bliver
    aldrig "alle job i 40 km" (hverken muligt via RSS eller oenskeligt - for meget
    stoej).
- **Bid 6: repost-dedup.** Jobindex reposter job med NYT guid, saa guid-dedup
  fanger dem ikke. Loest i VISNINGEN (klient, ikke-destruktivt): job med samme
  normaliserede titel (`normTitel`: lowercase, fjern "Genopslag:"-forstavelse,
  kollaps mellemrum) vises som ét. En markeret dublet (status != ny) vinder - saa
  et afvist job ikke dukker op igen som nyt; ellers vises nyeste. Kortet viser
  "+N genopslag" naar der er skjulte. Gaelder begge sider. Intet slettes.
  - **Grænse:** kan i sjaeldne tilfaelde skjule et aegte nyt job med identisk
    titel (falsk positiv). Lav risiko, da titler oftest har firmanavnet i sig.

## Teknik
- Node + Express. `server.js` serverer `public/index.html` og to endpoints:
  - `GET /api/jobs` - laeser alle job fra Postgres (nu inkl. `id` og `raw_tekst`).
  - `POST /api/jobs/:id/status` body `{status}` - saetter status (+ `status_aendret
    = now()`). Validerer baade id og status mod en hvidliste; ugyldigt = 400.
    Gyldige statusser: ny, interesseret, ansøgt, til samtale, ingen interesse.
  - `GET /api/jobs/:id/opslag` - henter det fulde jobopslag (Jobindex ->
    ansoegningssystem -> renset tekst). Bruger KUN jobbets egen url fra databasen,
    aldrig en url fra klienten (ingen SSRF). Returnerer `{ok, fuldtekst, kilde}`
    eller `{ok:false, grund}`. Timeout 12s pr. fetch. Pt. kun hr-manager.
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
titel, virksomhed, url, oprettet, status, status_aendret, **bred** (boolean,
default false - sat af den brede agent). bane-vaerdier: `fm`, `indkøb` (med oe!),
`hr`, `koordinator`, samt **NULL** for rent brede job. status-vaerdier siden
bruger: ny (default), interesseret, ansøgt, til samtale, ingen interesse.

Tilfoej bred-kolonnen (engang):
```
docker exec -i supabase-db-asmzli3ytzonaxou4fmfalee psql -U postgres -d postgres \
  -c "ALTER TABLE job_opslag ADD COLUMN IF NOT EXISTS bred boolean DEFAULT false;"
```

## Bred agent (n8n) - reference
Femte RSS-feed UDEN titelsoegning (bredt sikkerhedsnet). URL:
`https://www.jobindex.dk/jobsoegning.rss?address=Degnejorden+83%2C+H%C3%B8jby%2C+4320+Lejre&employment_type=1&radius=40&workinghours_type=1`
Ny RSS Read-node + ny upsert-node ("Insert or Update", table job_opslag,
**Column to match on = jobindex_guid**). Mapping: jobindex_guid<-guid, titel<-title,
url<-link, raw_tekst<-contentSnippet, indrykket<-isoDate, **bred = true (fast)**.
VIGTIGT: map IKKE `bane` i denne node - saa bevarer faellesjob deres skarpe bane.
Haeng paa Schedule- og Manual-triggerne som de fire andre.

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
- 2026-10-28: Bid 3 - "Byg CV"-knap pr. jobkort. Kopierer en FASE 1-tekst og
  aabner CV-projektet i ny fane. Kopiering via execCommand (siden er paa http, saa
  navigator.clipboard virker ikke), med manuel kopi-boks som fallback. `raw_tekst`
  tilfoejet til GET /api/jobs. PROJEKT_URL-konstant oeverst i index.html.
- 2026-10-28: Bid 3 udvidet - knappen henter nu det FULDE opslag server-side.
  Bevist i drift: Jobindex har kun uddrag, men hr-manager har hele opslaget i raa
  HTML (ingen JS), og jobtavle-containeren KAN naa ud paa nettet. Nyt endpoint
  GET /api/jobs/:id/opslag: Jobindex -> hr-manager-link -> renset opslagstekst
  (klipper menu vha. jobtitlen som anker). Falder tilbage til RSS-uddrag for
  systemer der ikke kan hentes. Kun hr-manager bekraeftet.
- 2026-10-28: Renseren strammet - fjerner template-mergefields
  (`[Project.ContactPerson...]`) og kollapser tomme linjer. Den generiske
  arbejdsgiver-footer (fx Region H's "Det handler om liv") staar bevidst tilbage:
  dens markoer skifter pr. virksomhed, saa auto-klip ville risikere at skaere
  aegte opslag vaek paa andre job.
- 2026-10-28: Bid 4 - match-score pr. job (noegleord fra profil, loeft/saenk),
  vist som farvet prik. Skifter oeverst: "Nyeste foerst" / "Bedste match foerst".
  Scoren SORTERER kun, skjuler intet. Noegleordslister + vaegte oeverst i
  server.js; farvetaersklerne i index.html (scoreNiveau). GET /api/jobs
  returnerer nu ogsaa `score` pr. job. Salg ladt neutralt (ude af begge lister)
  som udgangspunkt - kan tilfoejes til SAENK hvis oensket.
- 2026-10-28: Bid 4 - gennemsigtighed: signal-linje pr. kort viser score + de
  loeft-/saenk-ord den bygger paa. GET /api/jobs returnerer `loeft`/`saenk`.
- 2026-10-28: Bid 5 - bred agent + "Øvrige"-side. Ny kolonne `bred`. Den brede
  agent saetter bred=true og roerer ikke bane, saa dubletter med de skarpe baner
  loeser sig selv (faellesjob beholder deres bane -> vises paa banen, ikke Øvrige).
  "Mine baner / Øvrige"-skifter paa tavlen. n8n-node bygget og i drift (RSS Bred
  + Upsert Bred, 20 items testet groen). bane gjort NULLABLE (havde NOT NULL).
  Digest-SQL faar `AND bane IS NOT NULL` saa Telegram ikke tæller brede job.
- 2026-10-28: Bid 6 - repost-dedup i visningen. Reposts (nyt guid, samme titel)
  samles paa normaliseret titel og vises som ét ("+N genopslag"). Markeret/afvist
  dublet vinder. Ikke-destruktivt.
