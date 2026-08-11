# Teaching a partner to build a web data action

A live session script. The partner does the account and the clicking; Claude Code does
the API. Roughly 25 minutes end to end.

There are three phases: **you set up Netlify** (5 min), **Claude builds the API** (10 min),
**you wire up Genesys** (10 min). Only the middle one is a prompt.

---

## Phase 1 — Netlify account (the partner does this, before the prompt)

1. Go to <https://app.netlify.com/signup> and sign up — GitHub, Google or email. Free tier
   is enough; no card.
2. Stop there. Don't create a site yet — there's nothing to deploy until phase 2.

> Say this out loud to the room: we are deliberately **not** connecting a Git repo.
> Drag-and-drop deploys are faster to demo and they make the point that this is throwaway
> mock infrastructure, not something to maintain.

---

## Phase 2 — the prompt

Open a **new Claude Code session in an empty folder** and paste this:

```text
Build me a mock REST API that I can deploy to Netlify by hand and then call from
Genesys Cloud as a web services data action.

Before you write any code, ask me for my Netlify site URL. The endpoint and the data
action's requestUrlTemplate have to be built against my real hostname over HTTPS —
Genesys rejects plain HTTP and cannot reach localhost, and a placeholder gets imported
unnoticed and fails at runtime. If I have not created the site yet, use
https://your-site.netlify.app and end by reminding me to set the real one.

Constraints:
- A static index.html plus ONE Netlify Function. No framework, no build step, no npm
  install, no git repo, and do not push anything anywhere.
- Look records up by phone number. Match on the last 9 digits so +966501234001,
  00966501234001, 0501234001 and "966 50 123 4001" all resolve to the same record —
  a "+" in a Genesys URL template arrives at the server as a space, so normalise
  server-side rather than making the Architect side clever.
- The lookup endpoint must ALWAYS return HTTP 200 with EVERY field present, including
  for an unknown number, plus a "found" boolean to branch on. A field missing from the
  response fails the Genesys output contract at runtime.
- CORS open, no auth, nothing persisted.
- Add ?delay=1500 and ?fail=500 query switches so I can demo Architect timeout and
  failure paths.
- Build a root index.html console: list the records, let me fire test calls from the
  page, and let me download the Genesys data action JSON with the real hostname
  already baked in.
- Run it locally and prove every endpoint works before you tell me you're done.

Finish by giving me:
1. A single .zip whose ROOT contains index.html, netlify.toml and netlify/ — use
   forward slashes inside the zip, because Netlify's unzip mishandles backslashes
   and then never finds the function.
2. The Genesys data action import JSON, named CRM_GetCustomerByPhoneNumber, in
   exactly this shape:
   {name, integrationType:"custom-rest-actions", actionType:"custom",
    config:{request:{requestUrlTemplate, requestType, headers, requestTemplate},
            response:{translationMap, translationMapDefaults, successTemplate}},
    contract:{input:{inputSchema}, output:{successSchema}}, secure:false}
3. A field-by-field build sheet for creating that same action BY HAND in the
   Genesys UI, because I am teaching this and importing a file teaches nothing.
   One copy-paste block per field, each labelled with where it lives in the UI:
   action name, Input contract (bare JSON schema, draft-04, no wrapper), Output
   contract, Request URL Template, Request Type, Request Body Template, Headers,
   Translation Map, Translation Map Defaults, Success Template.
   Put the same build sheet in the console page with a copy button per field.

Ask me whatever you need before you start.
```

### The questions Claude will ask — have your answers ready

It should come back with most of these. Answers that work for a demo are in the right
column; give them fast and keep the room moving.

| # | Question | A good demo answer |
|---|---|---|
| 1 | What is the lookup key? | Phone number |
| 2 | Which fields should come back, and what type is each? | `firstName` (string), `accountNumber` (string), `billAmount` (number), `deviceType` (string) |
| 3 | How many sample records, and which scenarios? | 10–12. Include one with a zero balance, one with a large overdue balance, and one number that is deliberately **not** in the data |
| 4 | Which region — country code, currency, name style? | Saudi, `+9665…`, SAR |
| 5 | Single flat object, or an array like mockapi.io returns? | Flat object. Say why: an array forces Architect to check the collection count and index `[0]` before it can touch anything |
| 6 | Brand / naming for the data and the site? | Anything neutral and fictional. Never real customer data — this ends up on a public URL |
| 7 | Read-only, or writes too (create a case, take a payment)? | Read-only for the first pass |
| 8 | **What is your Netlify site URL?** (asked first, before any code) | `https://<your-site>.netlify.app`. On a live build you won't have it yet — say so, let it use the placeholder, then come back in phase 3 and regenerate the data action JSON. Worth narrating: this is the field that decides whether the action works at all |

**If it doesn't ask, prompt it to.** "What do you need to know before you start?" A model
that guesses the schema builds the wrong thing quickly.

**The teaching point in question 5** is the one worth slowing down for. Both shapes work.
The flat object is easier in Architect and the failure semantics are cleaner. That trade-off
is the actual lesson of the session.

---

## Phase 3 — deploy and wire up

### Deploy the zip

1. Sign in to Netlify. Go to **Sites**.
2. Drag the `.zip` onto the drop area (or use <https://app.netlify.com/drop>).
   Sign in *first* — an anonymous drop gives you a throwaway site you can't rename.
3. Wait for "Published". You get a random name like `celadon-marzipan-2f81a3`.
4. **Site configuration → Change site name** → something you can read out loud.
   You now have `https://<your-name>.netlify.app`.
5. Prove it in a browser tab before going near Genesys:

   ```
   https://<your-name>.netlify.app/api/v1/lookup?phoneNumber=+966501234001
   ```

   JSON on screen means the function deployed. A 404 means the zip had a folder wrapped
   around its contents, or backslash paths inside — rebuild it, don't debug Netlify.

### Create the integration (once per org)

**Admin → Integrations → Integrations → + Integration** → **Web Services Data Actions**
→ install → **Activate**. It needs no credentials for a public endpoint like this.

### Create the action — two routes

The console page on the deployed site generates both, with your real hostname already
substituted. **Import file** is 30 seconds. **Build by hand** is the one that teaches.
Do the second in the room; keep the first in your back pocket if you run short on time.

#### Route A — import the file (fast)

1. On the deployed site, **Genesys Cloud Web data action → Import file — flat object →
   Download JSON**.
2. **Admin → Integrations → Actions → Import**, choose the file, select the Web Services
   integration, **Import Action**.

#### Route B — build it by hand (the teaching route)

On the deployed site pick **Build by hand — field by field**. Every block below has its
own Copy button there, with your hostname already in it. Replace `<your-site>` if you
are working from this page instead.

**1. Create it** — **Admin → Integrations → Actions → Add Action**. Pick your Web
Services Data Actions integration and name it:

```text
CRM_GetCustomerByPhoneNumber
```

**2. Input contract** — **Setup → Contracts → Input**. Flip the editor from **Simple** to
**JSON** and paste. It is a bare JSON schema; there is no wrapper object.

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "type": "object",
  "properties": {
    "phoneNumber": { "type": "string" }
  },
  "required": ["phoneNumber"]
}
```

**3. Output contract** — **Setup → Contracts → Output**, same JSON toggle.

```json
{
  "$schema": "http://json-schema.org/draft-04/schema#",
  "title": "customer",
  "type": "object",
  "properties": {
    "found":          { "type": "boolean" },
    "phoneNumber":    { "type": "string" },
    "firstName":      { "type": "string" },
    "accountNumber":  { "type": "string" },
    "billAmount":     { "type": "number" },
    "billAmountText": { "type": "string" },
    "deviceType":     { "type": "string" }
  }
}
```

> **Stop here and make the point.** Every field in this contract must be present in the
> response at runtime or the action fails — and the error you get back does not name the
> missing field. That is the whole reason the API returns all seven even for a number it
> has never seen.

**4. Request URL Template** — **Configuration → Request**:

```text
https://<your-site>.netlify.app/api/v1/lookup?phoneNumber=${input.phoneNumber}
```

> Must be **HTTPS**. Genesys rejects plain HTTP outright, which is also why it can never
> call your laptop.

**5. Request Type** — dropdown, not a paste field:

```text
GET
```

**6. Request Body Template** — leave the default exactly as it is. GET requests do not
use a body template:

```text
${input.rawRequest}
```

**7. Headers** — add nothing. The endpoint is public and takes no auth.

**8. Translation Map** — **Configuration → Response**. JSONPath per field, pulling values
out of the raw response and naming them for the template below:

```json
{
  "foundValue":          "$.found",
  "phoneNumberValue":    "$.phoneNumber",
  "firstNameValue":      "$.firstName",
  "accountNumberValue":  "$.accountNumber",
  "billAmountValue":     "$.billAmount",
  "billAmountTextValue": "$.billAmountText",
  "deviceTypeValue":     "$.deviceType"
}
```

**9. Translation Map Defaults** — used when a JSONPath does not resolve. String defaults
need their quotes escaped, which is why they look doubled:

```json
{
  "foundValue":          "false",
  "phoneNumberValue":    "\"\"",
  "firstNameValue":      "\"\"",
  "accountNumberValue":  "\"\"",
  "billAmountValue":     "0",
  "billAmountTextValue": "\"\"",
  "deviceTypeValue":     "\"\""
}
```

**10. Success Template** — Velocity. Assembles the translation map values into the object
the output contract promised:

```text
{
  "found": ${foundValue},
  "phoneNumber": ${phoneNumberValue},
  "firstName": ${firstNameValue},
  "accountNumber": ${accountNumberValue},
  "billAmount": ${billAmountValue},
  "billAmountText": ${billAmountTextValue},
  "deviceType": ${deviceTypeValue}
}
```

### Test, save, publish — in that order

1. **Test** tab → `phoneNumber` = `+966501234001` → **Run Action**. Ahmed comes back.
2. Run it again with `+15550001111`. You get `found: false` and empty strings, **not** an
   error. Show the room this deliberately.
3. **Save**, then **Publish**. An unpublished action is invisible to Architect — the
   single most common "why can't I find my action" moment in any session.

### Use it in a flow

1. Architect → inbound call flow → **Call Data Action**.
2. Category = your integration, Action = the imported action.
3. Input `phoneNumber` ← `Call.Ani`.
4. Bind outputs to flow variables, then an Audio block:
   *"Hello {firstName}, your balance is {billAmountText}."*
5. Add a **Decision** on `found` for the unknown-caller path — and demo it, by calling
   from a number that isn't in the dataset. The branch nobody builds is the one that
   pages you at 2am.

---

## Things that will go wrong, and the answer

| Symptom | Cause |
|---|---|
| 404 from the deployed URL | The zip had a wrapper folder, or backslash paths inside it |
| Action tests fine, Architect can't see it | Not published |
| "Failed to parse response" | A field in `successSchema` was missing from the actual response — the reason the API always returns every field |
| Lookup misses on a real call | The `+` arrived as a space; last-9-digit matching is what fixes this |
| Works in Test, fails on a live call | `Call.Ani` can arrive as `tel:+966...` — strip the scheme, or let the server normalise it |
| Changed the dataset, flow still returns the old values | Netlify redeployed but the data action is cached against the old contract — re-run Test, re-publish |

---

## If you want to skip phase 2 entirely

This repo *is* the finished output. `mock-crm-api-deploy.zip` is built and ready to drag
onto Netlify, and `genesys/` holds both data action JSONs. Deploy it, then walk the room
through phase 3 and use the prompt above only to show how it was made.
