# Mock CRM API

A mockapi.io-style fake backend, hosted on Netlify, for Genesys Cloud **web services
data actions**. Look a caller up by phone number in an IVR or bot flow and get back
their name, account number, bill amount and device type.

**Live:** `https://YOUR-SITE.netlify.app` — the root page is a console: browse the
records, fire test calls, and download a ready-to-import Genesys data action with your
real hostname already baked in.

## The data

Twelve records, four fields each.

| Field | Type | Note |
|---|---|---|
| `id` | integer | Record id, mockapi.io convention |
| `phoneNumber` | string | Lookup key, E.164 |
| `firstName` | string | Greet the caller with this |
| `accountNumber` | string | Account reference |
| `billAmount` | number | Outstanding balance in SAR |
| `deviceType` | string | Handset or CPE model |

Test numbers run `+966501234001` … `+966501234012`. Anything else returns the
not-found shape.

## Endpoints

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/lookup?phoneNumber=+966501234001` | **One flat object.** Always HTTP 200, every field always present. **Use this from Genesys.** |
| GET | `/api/v1/customers?phoneNumber=+966501234001` | Array with 0 or 1 records — mockapi.io-compatible |
| GET | `/api/v1/customers` | All records (`?limit=` to trim) |
| GET | `/api/v1/customers/:id` | One record by id |
| GET | `/api/v1/health` | Liveness probe |

```json
// GET /api/v1/lookup?phoneNumber=+966501234001
{
  "found": true,
  "lookupStatus": "FOUND",
  "phoneNumber": "+966501234001",
  "firstName": "Ahmed",
  "accountNumber": "ACC-884101",
  "billAmount": 412.5,
  "billAmountText": "SAR 412.50",
  "currency": "SAR",
  "deviceType": "iPhone 16 Pro"
}
```

Two extras beyond the four fields, both there to make the Architect side easier:
`found` / `lookupStatus` give you something to branch on, and `billAmountText` is the
form TTS reads correctly — text-to-speech says "four hundred and twelve point five"
for `412.5`, but "SAR 412.50" comes out right.

### Three behaviours that exist because data actions break on them

1. **`/lookup` always returns HTTP 200 with every field present**, even for an unknown
   number. A field missing from the response fails the output contract at runtime;
   `found: false` is something a flow can branch on instead.
2. **Phone numbers match on the last 9 digits.** `+966501234001`, `00966501234001`,
   `0501234001` and `966 50 123 4001` all resolve to the same record. This matters
   because a `+` in a URL template arrives here as a *space* — normalising server-side
   means the Architect side never has to be clever about encoding.
3. **`/customers` returns `[]`, not a 404,** when a filter matches nothing — same as
   mockapi.io, so an existing action built against mockapi keeps working.

### Demo switches

| Query param | Effect |
|---|---|
| `?delay=1500` | Wait 1.5s before responding — proves out an Architect timeout |
| `?fail=500` | Return that status code — exercises the data action's failure path |

## Wiring it into Genesys Cloud

The console page generates the import JSON against a **Public site URL** field, separate
from wherever the page is being served. Deployed to Netlify the two match and it fills
itself in; previewing on localhost it defaults to a placeholder, because Genesys cannot
reach your laptop — type your Netlify hostname into that field and the JSON updates.


1. **Admin → Integrations → Integrations**, add **Web Services Data Actions**, activate it.
2. **Admin → Integrations → Actions → Import**, upload
   [`genesys/CRM_GetCustomerByPhoneNumber.custom.json`](genesys/CRM_GetCustomerByPhoneNumber.custom.json)
   and pick that integration.
   Replace `YOUR-SITE.netlify.app` in `requestUrlTemplate` first — or skip the edit and
   download the file from the live console page instead, which bakes the real host in.
3. **Test** the action with `phoneNumber = +966501234001`, then **Save** and **Publish**.
   An action must be published before a flow can see it.
4. In Architect, add a **Call Data Action** block, pass `Call.Ani` (or a Collect Input
   digit string) into `phoneNumber`, and bind the outputs.

`genesys/CRM_GetCustomerByPhoneNumber_Array.custom.json` is the same call in the array
shape, for parity with an existing mockapi.io-backed action.

## Running it locally

```bash
node local-server.mjs
```

Serves the console and the API on `http://localhost:8888`, running the exact function
Netlify runs. No Netlify CLI, no npm install.

## Deploying

**Manual (no Git):** zip the repo contents — `index.html`, `netlify.toml`, `netlify/`,
`package.json` — and drag the zip onto <https://app.netlify.com/drop>. The functions
directory is picked up from `netlify.toml`.

**Git:** connect this repo in Netlify. Build command empty, publish directory `.`,
functions directory `netlify/functions`.

## Adding fields

Add the key to every record in
[`netlify/functions/lib/data.mjs`](netlify/functions/lib/data.mjs) and name it in the
`FIELDS` list below the records. `/customers` picks it up with no other change.
`/lookup` needs the field adding to `flatten()` in
[`netlify/functions/api.mjs`](netlify/functions/api.mjs) — deliberately explicit, so the
Genesys output contract can't drift by accident. Then regenerate the data action JSON
from the console page and re-import it.
