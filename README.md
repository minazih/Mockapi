# Mock CRM API

A mockapi.io-style fake backend, hosted on Netlify, for Genesys Cloud **web services
data actions**. Look a caller up by phone number in an IVR or bot flow and get back
their name and whichever account fields you pick.

**Live:** `https://YOUR-SITE.netlify.app` — the root page is the control panel. Choose a
dataset, tick the fields you want returned, fire test calls, and download a
ready-to-import Genesys data action with your hostname already baked in.

## The data

One cast of twelve people — `id`, `phoneNumber`, `firstName` — with four industry
payloads over the top. **The phone numbers are the same in every industry**, so a demo
script survives switching dataset; only the returned fields change.

| Dataset | Fields on top of the common three |
|---|---|
| `telco` (default) | `accountNumber`, `billAmount` (money), `deviceType` |
| `banking` | `accountNumber`, `balance` (money), `cardType`, `cardStatus` |
| `retail` | `loyaltyId`, `orderNumber`, `orderStatus`, `orderTotal` (money), `deliveryDate` (date) |
| `insurance` | `policyNumber`, `policyType`, `premiumAmount` (money), `renewalDate` (date), `claimStatus` |

Field types drive what the API generates. A **money** field gains a `<name>Text`
companion — `"SAR 412.50"`, which TTS reads correctly where `412.5` does not. A **date**
field is stored as a *day offset* and emitted as ISO plus a `<name>Spoken` companion like
`"Monday, 17 August 2026"`. Offsets rather than fixed dates, so the demo does not go
stale the week after you record it.

Test numbers run `+966501234001` … `+966501234012`. Anything else returns the not-found
shape.

## Endpoints

`industry` defaults to `telco`, so an action that never sends it keeps working. An
*unknown* industry is a 400 listing the valid ones — never a silent fallback, because a
typo in a URL template should be loud.

| Method | Path | Returns |
|---|---|---|
| GET | `/api/v1/lookup?phoneNumber=+966501234001&industry=` | **One flat object.** Always HTTP 200, every field always present. **Use this from Genesys.** |
| GET | `/api/v1/customers?phoneNumber=+966501234001&industry=` | Array with 0 or 1 records — mockapi.io-compatible |
| GET | `/api/v1/customers?industry=` | All records (`?limit=` to trim) |
| GET | `/api/v1/customers/:id?industry=` | One record by id |
| GET | `/api/v1/industries` | Every dataset, its fields and its output contract — this is what makes the console self-configuring |
| GET | `/api/v1/health` | Liveness probe |

```json
// GET /api/v1/lookup?phoneNumber=+966501234001
{
  "found": true,
  "lookupStatus": "FOUND",
  "industry": "telco",
  "phoneNumber": "+966501234001",
  "firstName": "Ahmed",
  "currency": "SAR",
  "accountNumber": "ACC-884101",
  "billAmount": 412.5,
  "billAmountText": "SAR 412.50",
  "deviceType": "iPhone 16 Pro"
}
```

`found` / `lookupStatus` exist to give a flow something to branch on for the
unknown-caller path.

## Choosing fields without a redeploy

`/lookup` always returns every field its dataset has. The console's field checkboxes
change the **data action**, not the API — ticking a field adds it to the output contract,
the translation map and the success template together, unticking removes it from all
three. So you can reshape what Genesys receives live, mid-demo, and re-import in seconds.

Defining genuinely new field *names* is the one thing that does need a redeploy — the API
cannot invent data it does not hold. The **Custom fields…** option generates both the
data action and a paste-ready dataset snippet for `data.mjs`.

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

The console page offers three routes, all generated against a **Public site URL** field
that is separate from wherever the page is being served: **Import file — flat object**,
**Import file — array**, and **Build by hand — field by field**, which lists every value
you paste into the Genesys UI with a copy button each. Deployed to Netlify the site URL
fills itself in; previewing on localhost it falls back to a placeholder, because Genesys
cannot reach your laptop — and `requestUrlTemplate` must be HTTPS regardless.


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
