// Jobtavle - lille server der henter job fra Supabase-databasen og viser dem.
// Taler med databasen paa samme maade som n8n: direkte Postgres, indefra Pixa.
// Alle vaerdier undtagen password har et fornuftigt standardvalg, saa der kun
// SKAL saettes PGPASSWORD i Coolify.

const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

const pool = new Pool({
  host: process.env.PGHOST || "supabase-db-asmzli3ytzonaxou4fmfalee",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD, // SKAL saettes i Coolify
  database: process.env.PGDATABASE || "postgres",
  // ingen SSL - samme som n8n-credentialen (SSL Disable)
  ssl: false,
});

// Tilladte statusser. Siden maa kun saette en af disse.
const GYLDIGE_STATUS = [
  "ny",
  "interesseret",
  "ansøgt",
  "til samtale",
  "ingen interesse",
];

// ---------------------------------------------------------------------------
// Match-score. Et groft, gratis signal der SORTERER job - det skjuler aldrig
// noget. Byg paa Torbens dokumenterede profil (brutto-CV + maalbaner).
// Listerne er bevidst lette at redigere: tilfoej/fjern ord, flyt mellem loeft
// og saenk, eller ret vaegtene nedenfor.
// ---------------------------------------------------------------------------

const LOEFT_KERNE = [
  "leverandør", "leverandørstyring", "supplier", "vendor", "srm", "sourcing",
  "indkøb", "procurement", "kontrakt", "contract manager", "category",
];
const LOEFT_KOMPETENCE = [
  "forhandling", "sla", "kpi", "governance", "compliance", "kvalitetssikring",
  "stakeholder", "udbud", "performance management", "procesoptimering",
  "leverandøraftaler",
];
const LOEFT_MAAL = [
  "facility management", "facility", "fm", "drift", "servicekoordinator",
  "koordinator", "teamkoordinator", "administrativ koordinator", "operations",
  "hr", "rekruttering",
];
const LOEFT_BRANCHE = ["forsikring", "skade", "skadeservice", "taksator", "ejendom"];
const SAENK = [
  "kok", "køkkenleder", "ernæringsassistent", "smørrebrød", "slagter", "bager",
  "sygeplejerske", "sosu", "social- og sundhedsassistent", "jordemoder",
  "fysioterapeut", "ergoterapeut", "elektriker", "tømrer", "murer", "vvs",
  "mekaniker", "chauffør", "lærer", "pædagog", "softwareudvikler", "developer",
  "programmør",
];

const VAEGT = { kerne: 3, kompetence: 2, maal: 2, branche: 1, saenk: 2, titelBonus: 2 };

// Deler tekst op i ord (bogstaver/tal, aeoesaa inkluderet).
function tilTokens(tekst) {
  return (String(tekst || "").toLowerCase().match(/[\p{L}\p{N}]+/gu) || []);
}

// Finder hvilke ord fra en liste der er i teksten (returnerer dem, saa vi kan
// vise paa tavlen HVAD der blev scoret paa).
// Korte ord (<=3 tegn, fx fm/hr/sla) kraever et HELT ord-match, saa de ikke
// rammer tilfaeldige bogstaver inde i andre ord. Laengere ord maa gerne matche
// et ord der STARTER med dem (saa "indkøb" ogsaa fanger "indkøber"). Fraser
// (med mellemrum) matches med ord-graenser i hele teksten.
function findMatch(ordListe, heleTekst, tokenSet, tokenArr) {
  const fundne = [];
  for (const ord of ordListe) {
    let hit = false;
    if (ord.includes(" ")) {
      const esc = ord.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      hit = new RegExp("(^|[^\\p{L}])" + esc + "([^\\p{L}]|$)", "u").test(heleTekst);
    } else if (ord.length <= 3) {
      hit = tokenSet.has(ord);
    } else {
      hit = tokenArr.some((t) => t.startsWith(ord));
    }
    if (hit) fundne.push(ord);
  }
  return fundne;
}

// Returnerer { score, loeft: [...], saenk: [...] } - tallet OG hvad det bygger paa.
function beregnScore(job) {
  const titel = String(job.titel || "").toLowerCase();
  const heleTekst = titel + " \n " + String(job.raw_tekst || "").toLowerCase();

  const tTokens = tilTokens(titel);
  const tSet = new Set(tTokens);
  const aTokens = tilTokens(heleTekst);
  const aSet = new Set(aTokens);

  const kerne = findMatch(LOEFT_KERNE, heleTekst, aSet, aTokens);
  const komp = findMatch(LOEFT_KOMPETENCE, heleTekst, aSet, aTokens);
  const maal = findMatch(LOEFT_MAAL, heleTekst, aSet, aTokens);
  const branche = findMatch(LOEFT_BRANCHE, heleTekst, aSet, aTokens);
  const saenk = findMatch(SAENK, heleTekst, aSet, aTokens);

  let s =
    VAEGT.kerne * kerne.length +
    VAEGT.kompetence * komp.length +
    VAEGT.maal * maal.length +
    VAEGT.branche * branche.length -
    VAEGT.saenk * saenk.length;

  // Ord i selve titlen vejer ekstra - det er det staerkeste signal.
  const titelLoeft = findMatch([...LOEFT_KERNE, ...LOEFT_MAAL], titel, tSet, tTokens);
  const titelSaenk = findMatch(SAENK, titel, tSet, tTokens);
  s += VAEGT.titelBonus * titelLoeft.length - VAEGT.titelBonus * titelSaenk.length;

  const loeft = [...new Set([...kerne, ...komp, ...maal, ...branche])];
  return { score: s, loeft, saenk };
}

app.use(express.static(path.join(__dirname, "public")));

// Henter alle job, nyeste foerst. Hvert job faar en match-score med.
// Henter ogsaa 'bred' (markerer job fundet af den brede agent). Hvis kolonnen
// endnu ikke findes (foer ALTER TABLE er koert), falder vi tilbage uden den,
// saa tavlen ikke crasher i mellemtiden.
app.get("/api/jobs", async (req, res) => {
  try {
    let result;
    try {
      result = await pool.query(
        `SELECT id, bane, titel, virksomhed, url, oprettet, status, raw_tekst,
                COALESCE(bred, false) AS bred
           FROM job_opslag
          ORDER BY oprettet DESC`
      );
    } catch (e) {
      result = await pool.query(
        `SELECT id, bane, titel, virksomhed, url, oprettet, status, raw_tekst
           FROM job_opslag
          ORDER BY oprettet DESC`
      );
      result.rows.forEach((r) => { r.bred = false; });
    }
    const jobs = result.rows.map((j) => {
      const r = beregnScore(j);
      return { ...j, score: r.score, loeft: r.loeft, saenk: r.saenk };
    });
    res.json({ ok: true, jobs });
  } catch (err) {
    console.error("DB-fejl:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// Saetter status paa et job. Body: { status: "interesseret" }
// id er en UUID (tekst), ikke et heltal.
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

app.post("/api/jobs/:id/status", async (req, res) => {
  const id = String(req.params.id || "");
  const status = (req.body && req.body.status) || "";

  if (!UUID_RE.test(id)) {
    return res.status(400).json({ ok: false, error: "Ugyldigt job-id" });
  }
  if (!GYLDIGE_STATUS.includes(status)) {
    return res.status(400).json({ ok: false, error: "Ugyldig status" });
  }

  try {
    const result = await pool.query(
      `UPDATE job_opslag
          SET status = $1, status_aendret = now()
        WHERE id = $2
      RETURNING id, status`,
      [status, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, error: "Job ikke fundet" });
    }
    res.json({ ok: true, job: result.rows[0] });
  } catch (err) {
    console.error("DB-fejl (status):", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ---------------------------------------------------------------------------
// "Byg CV": hent det FULDE jobopslag.
// Databasen har kun RSS-uddraget. Det fulde opslag ligger paa virksomhedens
// ansoegningssystem, som Jobindex linker videre til. Vi henter Jobindex-siden,
// finder linket til ansoegningssystemet og henter opslagsteksten derfra.
// Pt. er kun hr-manager bekraeftet (bruges af bl.a. regioner). Andre systemer
// (JavaScript-tunge) falder automatisk tilbage til uddraget paa klienten.
// ---------------------------------------------------------------------------

const JOBINDEX_RE = /jobindex\.dk\/vis-job\//i;

// Afkoder de hyppigste HTML-entities. aeoesaa kommer typisk som ren UTF-8,
// men de navngivne tages med for en sikkerheds skyld. &amp; afkodes sidst.
function afkodEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 10)); } catch (e) { return " "; } })
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => { try { return String.fromCodePoint(parseInt(n, 16)); } catch (e) { return " "; } })
    .replace(/&nbsp;/gi, " ")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&oslash;/g, "ø").replace(/&Oslash;/g, "Ø")
    .replace(/&aelig;/g, "æ").replace(/&AElig;/g, "Æ")
    .replace(/&aring;/g, "å").replace(/&Aring;/g, "Å")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

// Goer en HTML-side til laesbar ren tekst.
function htmlTilTekst(html) {
  let h = html
    .replace(/<(script|style|head)[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  h = afkodEntities(h);
  return h
    .replace(/[ \t ]+/g, " ")
    .replace(/\[[A-Z][A-Za-z0-9]*\.[^\]]*\]/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/(?:\n[ \t]*){2,}/g, "\n\n")
    .trim();
}

// Klipper menu/boilerplate af toppen ved at bruge jobtitlen som anker.
function klipFraTitel(tekst, titel) {
  if (!titel) return tekst;
  const anker = String(titel).trim().split(/\s+/).slice(0, 5).join(" ");
  if (anker.length < 8) return tekst;
  const idx = tekst.toLowerCase().indexOf(anker.toLowerCase());
  return idx > 0 ? tekst.slice(idx).trim() : tekst;
}

// Henter en URL som tekst, med timeout. Returnerer null ved enhver fejl.
async function hentHtml(url, timeoutMs) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: ac.signal,
      redirect: "follow",
      headers: { "User-Agent": "Mozilla/5.0 (jobtavle)" },
    });
    if (!r.ok) return null;
    return await r.text();
  } catch (e) {
    return null;
  } finally {
    clearTimeout(t);
  }
}

app.get("/api/jobs/:id/opslag", async (req, res) => {
  const id = String(req.params.id || "");
  if (!UUID_RE.test(id)) {
    return res.status(400).json({ ok: false, grund: "ugyldigt id" });
  }
  try {
    // Kun jobbets egen url fra databasen bruges - aldrig en url fra klienten.
    const q = await pool.query(
      "SELECT url, titel FROM job_opslag WHERE id = $1",
      [id]
    );
    if (q.rowCount === 0) {
      return res.status(404).json({ ok: false, grund: "job ikke fundet" });
    }
    const { url, titel } = q.rows[0];
    if (!url || !JOBINDEX_RE.test(url)) {
      return res.json({ ok: false, grund: "ukendt kilde" });
    }

    // 1) Jobindex-siden (kun uddrag, men indeholder linket videre).
    const jiHtml = await hentHtml(url, 12000);
    if (!jiHtml) return res.json({ ok: false, grund: "kunne ikke hente jobindex" });

    // 2) Find link til ansoegningssystem. Pt. kun hr-manager bekraeftet.
    const m = jiHtml.match(/https?:\/\/[^\s"'<>]*hr-manager[^\s"'<>]*/i);
    if (!m) return res.json({ ok: false, grund: "intet kendt opslagslink" });
    const opslagUrl = m[0].replace(/&amp;/g, "&");

    // 3) Selve opslaget.
    const hmHtml = await hentHtml(opslagUrl, 12000);
    if (!hmHtml) return res.json({ ok: false, grund: "kunne ikke hente opslag" });

    // 4) Rens og klip.
    let tekst = klipFraTitel(htmlTilTekst(hmHtml), titel);
    if (!tekst || tekst.length < 400) {
      return res.json({ ok: false, grund: "opslag for kort / ikke fundet" });
    }
    if (tekst.length > 20000) tekst = tekst.slice(0, 20000) + "\n\n[...afkortet]";

    res.json({ ok: true, fuldtekst: tekst, kilde: opslagUrl });
  } catch (err) {
    console.error("Hent-fejl (opslag):", err.message);
    res.json({ ok: false, grund: err.message });
  }
});

app.listen(port, () => {
  console.log(`Jobtavle koerer paa port ${port}`);
});
