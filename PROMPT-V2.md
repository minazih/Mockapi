# The rebuild prompt, v2 — one question

v1 interviews you about fields before it writes any code, which is fine at a desk and
awkward in front of a room. v2 asks **one** question — your Netlify URL — builds
everything, and moves the field choice into the deployed site, where you can change it
live while people watch and regenerate the data action in a second.

Use v1 when you know the schema up front and want it baked in.
Use v2 when you are teaching, demoing, or do not yet know what fields you want.

Copy everything inside the block.

---

```text
Build me a mock REST API that I will deploy to Netlify by hand and then call from
Genesys Cloud as a Web Services Data Action. I am going to use it live in front of
people, so the deployed site itself has to be the control panel — I will choose the
returned fields there, not now.

## The only thing to ask me

What is my Netlify site URL — the https://<something>.netlify.app address the site will
live at? Ask this before writing any code, then build everything else from the spec
below without further questions.

The endpoint and the data action's requestUrlTemplate must be built against that real
hostname over HTTPS. Genesys rejects plain HTTP and cannot reach localhost, and a
placeholder gets imported without complaint and then fails at runtime with an error that
never mentions the URL.

If I say the site does not exist yet: use https://your-site.netlify.app, carry on, and
end your final answer by reminding me to set the real hostname on the deployed page.
Netlify assigns a random name on first deploy, so I may have to rename the site first.

## What to build

A static index.html plus ONE Netlify Function. No framework, no build step, no npm
install, no TypeScript. Do not create a git repo and do not push anything anywhere.

Files:
  index.html
  netlify.toml
  package.json
  netlify/functions/api.mjs
  netlify/functions/lib/data.mjs

netlify.toml: publish ".", functions "netlify/functions", and a forced 200 redirect from
/api/v1/* to /.netlify/functions/api/:splat. Netlify Functions v2 syntax —
export default async (req) => Response.

## The data — four built-in industries, one cast

Twelve invented people, shared across every dataset: id, phoneNumber (+966501234001 to
+966501234012) and firstName. The same numbers work in every industry, so my demo script
survives switching dataset.

Then four industry payloads over the top, currency SAR:

  telco      accountNumber, billAmount(money), deviceType
  banking    accountNumber, balance(money), cardType, cardStatus
  retail     loyaltyId, orderNumber, orderStatus, orderTotal(money), deliveryDate(date)
  insurance  policyNumber, policyType, premiumAmount(money), renewalDate(date), claimStatus

Field types drive generation:
  string  as-is
  number  as-is
  money   plus a "<name>Text" companion — "SAR 412.50", which TTS reads correctly
          where 412.5 does not
  date    stored in the dataset as a DAY OFFSET from today, emitted as ISO plus a
          "<name>Spoken" companion like "Monday, 17 August 2026". Offsets, not fixed
          dates, so the demo does not go stale a week after I record it.

Give each dataset some texture: zero balances, one large overdue, an overdrawn account,
a blocked card, a delayed order, a policy lapsing this week. Invented data only — this
lands on a public URL, so no real names, numbers or account references.

## Endpoints

  GET /api/v1/lookup?phoneNumber=&industry=      one flat object — what Genesys calls
  GET /api/v1/customers?phoneNumber=&industry=   array, 0 or 1 records, mockapi.io style
  GET /api/v1/customers?industry=                all records, ?limit= to trim
  GET /api/v1/customers/:id?industry=            one record
  GET /api/v1/industries                         every dataset, its fields, its contract
  GET /api/v1/health                             liveness probe

/api/v1/industries is what makes the page self-configuring — it must return, per
industry, the field list AND the expanded output-contract field list with the money and
date companions included, so the page never hardcodes a schema.

/lookup returns the industry fields plus: found (boolean), lookupStatus, industry,
phoneNumber, firstName, currency.

## Five rules that are not negotiable

1. /lookup ALWAYS returns HTTP 200 with EVERY field present, unknown numbers included —
   empty strings and zeros rather than omitted keys. A field missing from the response
   fails the Genesys output contract at runtime, and the error does not name the missing
   field, so it is brutal to debug. `found: false` is the branch point instead.

2. Match phone numbers on their LAST 9 DIGITS after stripping every non-digit, so
   +966501234001, 00966501234001, 0501234001 and "966 50 123 4001" all resolve to the
   same record. A "+" in a Genesys URL template arrives at the server as a space —
   normalise server-side rather than making the Architect side clever about encoding.

3. /customers returns [] rather than 404 when a filter matches nothing, because that is
   what mockapi.io does and actions get built against that behaviour.

4. `industry` defaults to telco, so an action that never sends the parameter keeps
   working. An UNKNOWN industry is a 400 listing the valid ones — never a silent
   fallback, because a typo in a URL template should be loud.

5. CORS open, no auth, Cache-Control no-store, handle OPTIONS, nothing persisted.

Add ?delay=1500 and ?fail=500 switches so I can demo an Architect timeout and the data
action's failure path.

## The console page — this is the important part

index.html at the root, self-contained: no CDN links, no external fonts, works in light
and dark. It is the control panel, so it must carry its own instructions — a short
numbered "what to do next" at the top, ending with Import, Test, Save, Publish, and the
warning that an unpublished action is invisible to Architect.

It needs, in this order:

1. DATASET AND FIELD PICKER. A dropdown of the four industries plus "Custom fields…".
   For a built-in industry, show a checkbox per field — every output-contract field
   including the Text and Spoken companions — with Select all / Clear. Ticking a field
   adds it to the generated contract, translation map and success template; unticking
   removes it, all three staying in step. `found` is locked on, since it is the
   unknown-caller branch point. Everything regenerates live with no redeploy, because
   the API already returns all the fields and the translation map just selects.

   "Custom fields…" gives me rows of name + type (string/number/money/date) that I can
   add and remove. Sanitise names to letters, numbers, hyphen and underscore, since
   Genesys property names must start with a letter and allow nothing else. It generates
   the data action correctly AND a paste-ready dataset snippet for data.mjs — and says
   plainly that custom fields need that paste plus a redeploy, because the API cannot
   invent data it does not have.

2. TRY IT. Dropdown of the test numbers plus a free-text box, buttons for /lookup and
   /customers, showing the response with status code and timing. Include one number
   deliberately NOT in the dataset.

3. RECORDS. A table of all twelve, fetched live and with columns derived from whichever
   dataset is selected — never hardcoded.

4. THE DATA ACTION. A "Public site URL" field, separate from where the page is served:
   the page's own test calls always use location.origin so they work anywhere, but the
   generated action targets this public URL. When deployed it is location.origin; on
   localhost it falls back to the Netlify URL I gave you, held in ONE named constant at
   the top of the script. Persist any edit to localStorage and accept a bare hostname by
   prepending https://.

   Three tabs, all regenerating when the dataset, the ticks or the URL change:
     a) Import file, flat object — with a Download JSON button
     b) Import file, array variant — mockapi.io-style raw pass-through
     c) Build by hand — every Genesys UI field as its own copy-paste block

## Deliverable 1 — the zip

A single .zip whose ROOT contains index.html, netlify.toml, package.json and netlify/.
No wrapper folder. Use FORWARD SLASHES for the paths inside the archive — several zip
tools write backslashes, Netlify's unzip mishandles them, and the deployed function then
404s with nothing useful in the log. List the entry paths back to me so I can check.

## Deliverable 2 — the data action, generated in the page

Named CRM_GetCustomerByPhoneNumber, suffixed with the industry when it is not telco, in
exactly this shape:

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
translationMap with JSONPath per ticked field and a translationMapDefaults entry for
every one of them, rather than a "${rawResult}" pass-through — the defaults are what
stop a changed response from breaking the contract. String defaults need their quotes
escaped; booleans and numbers do not.

## Deliverable 3 — the by-hand build sheet, inside the page

Tab (c): the same action built field by field, one copy-paste block each with its own
copy button, labelled with where it lives in the Genesys UI, in this order — action
name, Input contract, Output contract, Request URL Template, Request Type, Request Body
Template, Headers, Translation Map, Translation Map Defaults, Success Template, then
test/save/publish. Derive it from the same object the import file is built from so the
two routes cannot drift.

The contract editors take a BARE JSON schema — draft-04, no wrapper object — and there
is a Simple/JSON toggle to flip first. Say so in the sheet.

## Before you tell me you are done

Run it locally and prove it works — a known number, a local-format number with no
country code, an unknown number, /customers with no match, an invalid industry, and a
dataset switch. Show me the actual responses, not a description of them.
```

---

## What the flow looks like on the day

1. Paste the prompt. Answer the one question, or say you have not made the site yet.
2. Take the zip, sign in to Netlify, drag it onto **Sites**.
3. **Site configuration → Change site name** so the URL is readable.
4. Open the site. Set **Public site URL** if it is still a placeholder.
5. Everything else happens on the page — pick the dataset, tick the fields, download or
   read off the build sheet, then import into Genesys.

The whole point of v2 is that step 5 has no prompt in it. Once the site is up you are
clicking, not typing, which is a far better thing to be doing while people watch.
