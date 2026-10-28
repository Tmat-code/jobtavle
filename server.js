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

app.use(express.static(path.join(__dirname, "public")));

// Henter alle job, nyeste foerst.
app.get("/api/jobs", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, bane, titel, virksomhed, url, oprettet, status
         FROM job_opslag
        ORDER BY oprettet DESC`
    );
    res.json({ ok: true, jobs: result.rows });
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

app.listen(port, () => {
  console.log(`Jobtavle koerer paa port ${port}`);
});
