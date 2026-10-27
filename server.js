// Jobtavle - lille server der henter job fra Supabase-databasen og viser dem.
// Taler med databasen paa samme maade som n8n: direkte Postgres, indefra Pixa.
// Alle vaerdier undtagen password har et fornuftigt standardvalg, saa der kun
// SKAL saettes PGPASSWORD i Coolify.

const express = require("express");
const { Pool } = require("pg");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.PGHOST || "supabase-db-asmzli3ytzonaxou4fmfalee",
  port: Number(process.env.PGPORT || 5432),
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD, // SKAL saettes i Coolify
  database: process.env.PGDATABASE || "postgres",
  // ingen SSL - samme som n8n-credentialen (SSL Disable)
  ssl: false,
});

app.use(express.static(path.join(__dirname, "public")));

// Henter alle job, nyeste foerst.
app.get("/api/jobs", async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT bane, titel, virksomhed, url, oprettet, status
         FROM job_opslag
        ORDER BY oprettet DESC`
    );
    res.json({ ok: true, jobs: result.rows });
  } catch (err) {
    console.error("DB-fejl:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(port, () => {
  console.log(`Jobtavle koerer paa port ${port}`);
});
