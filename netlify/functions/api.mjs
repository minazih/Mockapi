// Mock CRM API — a mockapi.io-style fake backend for Genesys Cloud
// web services data actions.
//
// Netlify Functions v2. One function serves everything; netlify.toml maps
// /api/v1/* onto it.
//
// Four design rules, each of which exists because a data action broke on it:
//
//  1. /lookup ALWAYS returns HTTP 200 with EVERY field present, even for an
//     unknown number. A field missing from the response fails the data
//     action's output contract; `found: false` is something a flow can branch
//     on instead.
//  2. Phone numbers match on their last 9 digits, so +966501234001,
//     00966501234001, 0501234001 and "966 50 123 4001" all hit the same
//     record. A "+" in a URL template arrives here as a space — normalising
//     server-side means the Architect side never has to be clever about it.
//  3. /customers returns an ARRAY, exactly as mockapi.io does, and an empty
//     array (not a 404) when the filter matches nothing.
//  4. `industry` defaults to telco. An existing data action that never sends
//     the parameter keeps working untouched.

import {
  PEOPLE, INDUSTRIES, INDUSTRY_KEYS, DEFAULT_INDUSTRY, COMMON_FIELDS, fieldsFor, BRAND,
} from "./lib/data.mjs";

const HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Api-Key",
  "Cache-Control": "no-store",
};

const ok = (body, status = 200) =>
  new Response(JSON.stringify(body, null, 2), { status, headers: HEADERS });
const err = (status, message, extra = {}) => ok({ error: true, status, message, ...extra }, status);

/* ------------------------------------------------------------------- dates -- */

const DAY = 86400000;
const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
  "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const today = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
const iso = (d) => d.toISOString().slice(0, 10);
// TTS reads "Monday, 17 August 2026" correctly; it makes a mess of "2026-08-17".
const spoken = (d) => `${DAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
const money = (n, cur) => `${cur} ${Number(n || 0).toFixed(2)}`;

/* ------------------------------------------------------------------ phones -- */

// Keep the last 9 significant digits: long enough to stay unique, short enough
// to survive country codes, trunk zeros, spaces and a URL-decoded "+".
export function normalisePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length > 9 ? digits.slice(-9) : digits;
}

function personByPhone(raw) {
  const key = normalisePhone(raw);
  if (key.length < 6) return null; // too short to be a real match
  return PEOPLE.find((p) => normalisePhone(p.phoneNumber) === key) || null;
}

/* ------------------------------------------------------- custom field spec -- */

// Custom fields arrive in the URL as ?fields=policyNumber:string,premium:money
// and are SYNTHESISED on the fly. That is what makes them work without a
// redeploy: the dataset is a pure function of (person, field name), so nothing
// has to be stored, and the API stays stateless.

const TYPES = new Set(["string", "number", "money", "date"]);
const MAX_CUSTOM_FIELDS = 20; // keeps URLs sane and caps the work per request

export function parseFieldSpec(raw) {
  if (!raw) return null;
  const out = [];
  for (const part of String(raw).split(",")) {
    const [n, t] = part.split(":");
    // Genesys property names must start with a letter and hold only letters,
    // numbers, hyphens or underscores.
    const name = String(n || "").trim().replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
    if (!name || !/^[A-Za-z]/.test(name)) continue;
    const type = TYPES.has(String(t || "").trim()) ? String(t).trim() : "string";
    if (!out.some((f) => f.name === name)) out.push({ name, type });
    if (out.length >= MAX_CUSTOM_FIELDS) break;
  }
  return out.length ? out : null;
}

// FNV-1a. Deterministic on purpose: the same caller must get the same answer
// every time, because a demo where the balance changes between two calls is
// worse than no demo at all.
function hash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const STATUSES = ["active", "pending", "suspended", "closed", "in-progress"];
const CITIES = ["Riyadh", "Jeddah", "Dammam", "Mecca", "Medina", "Khobar"];

// Type drives the shape; a few name heuristics stop every string field reading
// like FIELDNAME-1234, which makes a live demo look much less synthetic.
function synth(person, f) {
  const h = hash(`${person.id}:${f.name}`);
  const n = h % 10000;
  switch (f.type) {
    case "number": return n % 1000;
    case "money": return Math.round(h % 500000) / 100;      // 0.00 - 4999.99
    case "date": return (h % 120) - 30;                     // day offset, -30..+89
    default: {
      const low = f.name.toLowerCase();
      if (low.includes("status")) return STATUSES[h % STATUSES.length];
      if (low.includes("city") || low.includes("branch")) return CITIES[h % CITIES.length];
      if (low.includes("email")) return `${person.firstName.toLowerCase()}${person.id}@example.com`;
      if (low.includes("name")) return person.firstName;
      return `${f.name.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 12)}-${1000 + (n % 9000)}`;
    }
  }
}

// The field list and the stored/synthesised values for a request, whether it
// named a built-in industry or supplied its own spec.
const fieldsOf = (key, spec) => spec || INDUSTRIES[key].fields;
const currencyOf = (key) => (INDUSTRIES[key] ? INDUSTRIES[key].currency : "SAR");
function payloadOf(person, key, spec) {
  if (!person) return {};
  if (spec) return Object.fromEntries(spec.map((f) => [f.name, synth(person, f)]));
  return INDUSTRIES[key].data[person.id] || {};
}

/* ------------------------------------------------------------------ shapes -- */

// One record in the mockapi.io-compatible shape: raw stored values, no
// companions, no found flag.
function record(person, key, spec) {
  const payload = payloadOf(person, key, spec);
  const out = { ...person };
  for (const f of fieldsOf(key, spec)) {
    let v = payload[f.name];
    // Dates live in the dataset as day offsets; resolve them to real dates.
    if (f.type === "date" && typeof v === "number") v = iso(new Date(today().getTime() + v * DAY));
    out[f.name] = v === undefined ? null : v;
  }
  return out;
}

// The flat, contract-stable view. Every key is always present with a typed
// default, so the Genesys output contract never sees a missing field.
function flatten(person, key, requestedPhone, spec) {
  const payload = payloadOf(person, key, spec);
  const out = {
    found: !!person,
    lookupStatus: person ? "FOUND" : "NOT_FOUND",
    industry: key,
    phoneNumber: person ? person.phoneNumber : String(requestedPhone || ""),
    firstName: person ? person.firstName : "",
    currency: currencyOf(key),
  };
  for (const f of fieldsOf(key, spec)) {
    const raw = payload[f.name];
    switch (f.type) {
      case "money": {
        const n = person && raw != null ? Number(raw) : 0;
        out[f.name] = n;
        out[f.name + "Text"] = money(n, currencyOf(key));
        break;
      }
      case "date": {
        if (person && typeof raw === "number") {
          const d = new Date(today().getTime() + raw * DAY);
          out[f.name] = iso(d);
          out[f.name + "Spoken"] = spoken(d);
        } else {
          out[f.name] = "";
          out[f.name + "Spoken"] = "";
        }
        break;
      }
      case "number":
        out[f.name] = person && raw != null ? Number(raw) : 0;
        break;
      default:
        out[f.name] = person && raw != null ? String(raw) : "";
    }
  }
  return out;
}

// The output-contract field list for a dataset, companions included. The
// console reads this to generate the data action, so the contract and the
// response can never disagree.
function outputFields(key, spec) {
  const out = [
    { name: "found", type: "boolean" },
    { name: "lookupStatus", type: "string" },
    { name: "industry", type: "string" },
    { name: "phoneNumber", type: "string" },
    { name: "firstName", type: "string" },
    { name: "currency", type: "string" },
  ];
  for (const f of fieldsOf(key, spec)) {
    if (f.type === "money") {
      out.push({ name: f.name, type: "number" }, { name: f.name + "Text", type: "string" });
    } else if (f.type === "date") {
      out.push({ name: f.name, type: "string" }, { name: f.name + "Spoken", type: "string" });
    } else {
      out.push({ name: f.name, type: f.type === "number" ? "number" : "string" });
    }
  }
  return out;
}

const RESOURCES = [
  { method: "GET", path: "/api/v1/lookup?phoneNumber=&industry=", note: "Single flat object. Always 200, every field always present. Use this one from Genesys." },
  { method: "GET", path: "/api/v1/customers?phoneNumber=&industry=", note: "mockapi.io-compatible filter. Returns an array; [] when nothing matches." },
  { method: "GET", path: "/api/v1/customers?industry=", note: "All records. ?limit= to trim." },
  { method: "GET", path: "/api/v1/customers/:id?industry=", note: "One record by id." },
  { method: "GET", path: "/api/v1/industries", note: "Available datasets, their fields and their output contracts." },
  { method: "GET", path: "/api/v1/health", note: "Liveness probe." },
];

/* ------------------------------------------------------------------ router -- */

export default async function handler(req) {
  const url = new URL(req.url);

  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: HEADERS });

  // Demo switches: ?delay=1500 to prove out an Architect timeout,
  // ?fail=500 to exercise the data action's failure path.
  const delay = Math.min(parseInt(url.searchParams.get("delay") || "0", 10) || 0, 10000);
  if (delay) await new Promise((r) => setTimeout(r, delay));
  const fail = parseInt(url.searchParams.get("fail") || "0", 10);
  if (fail >= 400 && fail <= 599) return err(fail, `Simulated failure requested via ?fail=${fail}`);

  // Custom fields travel in the URL and are synthesised per request, so they
  // need no redeploy and nothing is stored.
  const spec = parseFieldSpec(url.searchParams.get("fields"));

  // Unknown industry is a 400 rather than a silent fallback — a typo in a URL
  // template should be loud, not quietly return telco data. "custom" is only
  // valid alongside a field spec, otherwise there is nothing to return.
  const wanted = (url.searchParams.get("industry") || url.searchParams.get("dataset") || "").toLowerCase();
  if (wanted && !INDUSTRIES[wanted] && !(wanted === "custom" && spec)) {
    return err(400, wanted === "custom"
      ? 'industry=custom needs a field spec, e.g. &fields=policyNumber:string,premium:money'
      : `Unknown industry "${wanted}"`, { available: [...INDUSTRY_KEYS, "custom (with &fields=)"] });
  }
  const industry = spec ? "custom" : (wanted || DEFAULT_INDUSTRY);

  // The redirect means the function can see either path form.
  const path = url.pathname
    .replace(/^\/\.netlify\/functions\/api/, "")
    .replace(/^\/api\/v1/, "")
    .replace(/\/+$/, "");
  const seg = path.split("/").filter(Boolean);
  const head = (seg[0] || "").toLowerCase();

  // Accept every spelling a flow might send, plus a trailing path segment.
  const phoneParam = ["phoneNumber", "phone", "ani", "msisdn", "number"]
    .map((k) => url.searchParams.get(k))
    .find((v) => v !== null && v !== "");

  switch (head) {
    case "":
      return ok({
        api: `${BRAND} API`,
        version: "v1",
        description:
          "Fake CRM records for Genesys Cloud IVR and bot demos. No auth, CORS open, nothing persisted.",
        baseUrl: `${url.origin}/api/v1`,
        defaultIndustry: DEFAULT_INDUSTRY,
        industries: INDUSTRY_KEYS,
        recordCount: PEOPLE.length,
        resources: RESOURCES,
        testNumbers: PEOPLE.map((p) => p.phoneNumber),
      });

    case "health":
      return ok({ status: "ok", brand: BRAND, records: PEOPLE.length, industries: INDUSTRY_KEYS, time: new Date().toISOString() });

    /* ------------- the datasets, and everything the console needs to know -- */
    case "industries": {
      if (seg[1]) {
        const k = seg[1].toLowerCase();
        if (!INDUSTRIES[k]) return err(404, `Unknown industry "${k}"`, { available: INDUSTRY_KEYS });
        return ok({ key: k, ...INDUSTRIES[k], data: undefined, fields: fieldsFor(k), outputFields: outputFields(k) });
      }
      return ok({
        default: DEFAULT_INDUSTRY,
        count: INDUSTRY_KEYS.length,
        commonFields: COMMON_FIELDS,
        industries: INDUSTRY_KEYS.map((k) => ({
          key: k,
          label: INDUSTRIES[k].label,
          currency: INDUSTRIES[k].currency,
          blurb: INDUSTRIES[k].blurb,
          fields: fieldsFor(k),
          outputFields: outputFields(k),
        })),
      });
    }

    /* -------- the endpoint Genesys calls on every inbound interaction ------ */
    case "lookup": {
      const phone = phoneParam ?? seg[1];
      if (!phone) return ok(flatten(null, industry, "", spec));
      return ok(flatten(personByPhone(decodeURIComponent(phone)), industry, phone, spec));
    }

    /* --------------------------- mockapi.io-compatible resource ------------ */
    case "customers": {
      if (seg[1]) {
        const id = decodeURIComponent(seg[1]);
        const p = PEOPLE.find((x) => String(x.id) === id) || personByPhone(id);
        if (!p) return err(404, `No record with id ${id}`);
        return ok(record(p, industry, spec));
      }
      if (phoneParam) {
        const p = personByPhone(decodeURIComponent(phoneParam));
        return ok(p ? [record(p, industry, spec)] : []); // mockapi returns [] for a filter with no hits
      }
      const limit = parseInt(url.searchParams.get("limit") || "0", 10);
      const all = PEOPLE.map((p) => record(p, industry, spec));
      return ok(limit > 0 ? all.slice(0, limit) : all);
    }

    default:
      return err(404, `Unknown resource "/${head}"`, {
        resources: RESOURCES.map((r) => `${r.method} ${r.path}`),
      });
  }
}
