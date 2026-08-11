# The rebuild prompt

One self-contained prompt that reproduces this project from nothing. Works with Claude
Code, Claude.ai or ChatGPT. Copy everything inside the block.

If you want the model to interview you about the fields instead of using the ones below,
delete the **The data** section and add a line saying so — the questions it should ask are
listed after the prompt, with the answers that reproduce what is in this repo.

---

```text
Build me a mock REST API that I will deploy to Netlify by hand and then call from
Genesys Cloud as a Web Services Data Action. I am using it to demo an IVR that greets
a caller by name and reads their balance back to them.

## What to build

A static index.html plus ONE Netlify Function. No framework, no build step, no npm
install, no TypeScript. Do not create a git repo and do not push anything anywhere.

Files:
  index.html
  netlify.toml
  package.json
  netlify/functions/api.mjs
  netlify/functions/lib/data.mjs

netlify.toml: publish ".", functions "netlify/functions", and a forced 200 redirect
from /api/v1/* to /.netlify/functions/api/:splat. Use Netlify Functions v2 syntax —
export default async (req) => Response.

## The data

12 invented customer records, looked up by phone number. Saudi numbers in the range
+966501234001 to +966501234012, currency SAR. Fields:

  id             integer
  phoneNumber    string
  firstName      string
  accountNumber  string
  billAmount     number
  deviceType     string

Vary them so the demo has something to show: several with a zero balance, one with a
large overdue balance, a mix of handsets and one router. Invented data only — this
ends up on a public URL, so no real names, numbers or account references.

## Endpoints

  GET /api/v1/lookup?phoneNumber=...      one flat object — this is what Genesys calls
  GET /api/v1/customers?phoneNumber=...   array with 0 or 1 records, mockapi.io style
  GET /api/v1/customers                   all records, ?limit= to trim
  GET /api/v1/customers/:id               one record
  GET /api/v1/health                      liveness probe

/lookup returns the six fields above plus:
  found           boolean   so a flow can branch on the unknown-caller path
  billAmountText  string    "SAR 412.50" — TTS reads that correctly, 412.5 it does not
  currency        string

## Four rules that are not negotiable

1. /lookup ALWAYS returns HTTP 200 with EVERY field present, unknown numbers included —
   empty strings and zeros rather than omitted keys. A field missing from the response
   fails the Genesys output contract at runtime, and the flow error does not name the
   missing field, so it is brutal to debug. `found: false` is the branch point instead.

2. Match phone numbers on their LAST 9 DIGITS, after stripping every non-digit. So
   +966501234001, 00966501234001, 0501234001 and "966 50 123 4001" all resolve to the
   same record. This matters because a "+" in a Genesys URL template arrives at the
   server as a space — normalise server-side rather than making the Architect side
   clever about encoding.

3. /customers returns [] rather than 404 when a filter matches nothing, because that is
   what mockapi.io does and actions get built against that behaviour.

4. CORS open (Access-Control-Allow-Origin *), no auth, Cache-Control no-store, nothing
   persisted, and handle OPTIONS.

Also add ?delay=1500 and ?fail=500 query switches so I can demo an Architect timeout
and the data action's failure path.

## The console page

index.html, served at the root, self-contained — no CDN links, no external fonts. It
should work in light and dark mode. It needs:

- The base URL displayed mockapi.io-style, in segments.
- A table of all 12 records, fetched live from the API rather than hardcoded.
- A try-it panel: a dropdown of the test numbers plus a free-text box, buttons for
  /lookup and /customers, and the JSON response with its status code and timing.
  Include one number that is deliberately NOT in the dataset.
- A "Public site URL" field, separate from where the page is being served. The page's
  own test calls always use location.origin so they work anywhere, but the generated
  data action must target this public URL — Genesys cannot reach localhost, and
  requestUrlTemplate must be HTTPS. Default it to location.origin when deployed, and to
  a placeholder when the hostname is localhost. Persist it in localStorage.
- Three tabs for the data action, all regenerated when that URL changes:
    a) Import file, flat object — with a Download JSON button
    b) Import file, array variant
    c) Build by hand — every UI field as its own copy-paste block

## Deliverable 1 — the zip

A single .zip whose ROOT contains index.html, netlify.toml, package.json and netlify/.
No wrapper folder. Use FORWARD SLASHES for the paths inside the archive — several zip
tools write backslashes, Netlify's unzip mishandles them, and the deployed function
then 404s with nothing useful in the log. Tell me the entry paths so I can check.

## Deliverable 2 — the data action import JSON

Named CRM_GetCustomerByPhoneNumber, in exactly this shape:

{
  "name": "...",
  "integrationType": "custom-rest-actions",
  "actionType": "custom",
  "config": {
    "request": { "requestUrlTemplate", "requestType", "headers", "requestTemplate" },
    "response": { "translationMap", "translationMapDefaults", "successTemplate" }
  },
  "contract": {
    "input":  { "inputSchema":   { ...JSON schema... } },
    "output": { "successSchema": { ...JSON schema... } }
  },
  "secure": false
}

requestType GET, requestTemplate "${input.rawRequest}", headers empty. Use an explicit
translationMap with JSONPath per field and translationMapDefaults for every one of them,
rather than a "${rawResult}" pass-through — defaults are what stop a changed response
from breaking the contract. Remember that string defaults need their quotes escaped.

## Deliverable 3 — the by-hand build sheet

The same action, built field by field in the Genesys UI, because I am teaching this and
importing a file teaches nothing. One copy-paste block per field, each labelled with
where it lives in the UI, in this order: action name, Input contract, Output contract,
Request URL Template, Request Type, Request Body Template, Headers, Translation Map,
Translation Map Defaults, Success Template, then test/save/publish.

The contract editors take a BARE JSON schema — draft-04, no wrapper object — and there
is a Simple/JSON toggle you have to flip first. Say so in the sheet.

Put this same sheet in the console page as tab (c), with a copy button per field, and
derive it from the same object the import file is built from so the two cannot drift.

## Before you tell me you are done

Run it locally and prove every endpoint works — a known number, a local-format number
with no country code, an unknown number, /customers with no match, and the ?fail
switch. Show me the actual responses, not a description of them.

Ask me anything you need before you start.
```

---

## The questions it should ask, and the answers that reproduce this repo

If the model starts building without asking, stop it: *"What do you need to know before
you start?"* A model that guesses the schema builds the wrong thing quickly.

| Question | Answer |
|---|---|
| What is the lookup key? | Phone number |
| Which fields come back, and what type is each? | `firstName` string, `accountNumber` string, `billAmount` number, `deviceType` string — plus `id` and `phoneNumber` |
| How many records, and which scenarios? | 12. Several zero-balance, one large overdue, mixed handsets and one router, and one number deliberately absent |
| Region, number format, currency? | Saudi, `+9665012340NN`, SAR |
| Flat object or an array like mockapi.io? | Both — flat for Genesys, array for compatibility with actions already built against mockapi.io |
| Read-only, or writes too? | Read-only |
| What is the Netlify site called? | Unknown at build time — that is what the Public site URL field is for |
| Real or invented data? | Invented, always. It lands on a public URL |
