// Mock CRM API — a mockapi.io-style fake backend for Genesys Cloud
// web services data actions.
//
// Netlify Functions v2. One function serves everything; netlify.toml maps
// /api/v1/* onto it.
//
// Three design rules, each of which exists because a data action broke on it:
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

import { CUSTOMERS, FIELDS, CURRENCY, BRAND } from "./lib/data.mjs";

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

const money = (n) => `${CURRENCY} ${Number(n || 0).toFixed(2)}`;

/* ------------------------------------------------------------------ phones -- */

// Keep the last 9 significant digits: long enough to stay unique, short enough
// to survive country codes, trunk zeros, spaces and a URL-decoded "+".
export function normalisePhone(raw) {
  const digits = String(raw ?? "").replace(/\D/g, "");
  return digits.length > 9 ? digits.slice(-9) : digits;
}

function findByPhone(raw) {
  const key = normalisePhone(raw);
  if (key.length < 6) return null; // too short to be a real match
  return CUSTOMERS.find((c) => normalisePhone(c.phoneNumber) === key) || null;
}

/* ------------------------------------------------------------------ shapes -- */

// The flat, contract-stable view. Every key is always present with a typed
// default, so the Genesys output contract never sees a missing field.
function flatten(c, requestedPhone) {
  return {
    found: !!c,
    lookupStatus: c ? "FOUND" : "NOT_FOUND",
    phoneNumber: c ? c.phoneNumber : String(requestedPhone || ""),
    firstName: c ? c.firstName : "",
    accountNumber: c ? c.accountNumber : "",
    billAmount: c ? c.billAmount : 0,
    // Spoken form: TTS reads "SAR 412.50" correctly, "412.5" it does not.
    billAmountText: c ? money(c.billAmount) : money(0),
    currency: CURRENCY,
    deviceType: c ? c.deviceType : "",
  };
}

const RESOURCES = [
  { method: "GET", path: "/api/v1/lookup?phoneNumber=", note: "Single flat object. Always 200, every field always present. Use this one from Genesys." },
  { method: "GET", path: "/api/v1/customers?phoneNumber=", note: "mockapi.io-compatible filter. Returns an array; [] when nothing matches." },
  { method: "GET", path: "/api/v1/customers", note: "All records. ?limit= to trim." },
  { method: "GET", path: "/api/v1/customers/:id", note: "One record by id." },
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
        recordCount: CUSTOMERS.length,
        fields: FIELDS,
        resources: RESOURCES,
        testNumbers: CUSTOMERS.map((c) => c.phoneNumber),
      });

    case "health":
      return ok({ status: "ok", brand: BRAND, records: CUSTOMERS.length, time: new Date().toISOString() });

    /* -------- the endpoint Genesys calls on every inbound interaction ------ */
    case "lookup": {
      const phone = phoneParam ?? seg[1];
      if (!phone) return ok(flatten(null, ""));
      return ok(flatten(findByPhone(decodeURIComponent(phone)), phone));
    }

    /* --------------------------- mockapi.io-compatible resource ------------ */
    case "customers": {
      if (seg[1]) {
        const id = decodeURIComponent(seg[1]);
        const c = CUSTOMERS.find((x) => String(x.id) === id) || findByPhone(id);
        if (!c) return err(404, `No record with id ${id}`);
        return ok(c);
      }
      if (phoneParam) {
        const c = findByPhone(decodeURIComponent(phoneParam));
        return ok(c ? [c] : []); // mockapi returns [] for a filter with no hits
      }
      const limit = parseInt(url.searchParams.get("limit") || "0", 10);
      return ok(limit > 0 ? CUSTOMERS.slice(0, limit) : CUSTOMERS);
    }

    default:
      return err(404, `Unknown resource "/${head}"`, {
        resources: RESOURCES.map((r) => `${r.method} ${r.path}`),
      });
  }
}
