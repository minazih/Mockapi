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
2. The Genesys data action import JSON, in exactly this shape:
   {name, integrationType:"custom-rest-actions", actionType:"custom",
    config:{request:{requestUrlTemplate, requestType, headers, requestTemplate},
            response:{translationMap, translationMapDefaults, successTemplate}},
    contract:{input:{inputSchema}, output:{successSchema}}, secure:false}

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
| 8 | What should the Netlify site be called? | It won't know yet — you name it in phase 3, then regenerate the data action JSON |

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

### Import the action

1. Back on the deployed site, download the data action JSON from the console page — it
   bakes in the real hostname, so nothing needs hand-editing.
2. **Admin → Integrations → Actions → Import**, choose the file, select the Web Services
   integration you just activated, **Import Action**.
3. Open the action → **Test** tab → `phoneNumber` = `+966501234001` → **Run Action**.
   You should see the caller's name come back.
4. **Save**, then **Publish**. An unpublished action is invisible to Architect — this is
   the single most common "why can't I find my action" moment in the room.

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
