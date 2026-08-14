# Mockapi — mock CRM API for Genesys Cloud data actions

Repo `minazih/Mockapi` (public). A static console page plus one function that fakes a
CRM: look a caller up by phone number, get back whichever fields you tick. It exists so
a Genesys Cloud web services data action has something real to call in a demo or a
partner enablement session.

**Two deploy targets from the one tree**, and they must never fork: Netlify (drag a zip
on) and AWS (S3 + Lambda + API Gateway, `aws/deploy.ps1`). The function paths stay under
`netlify/functions/` on both — `aws/` is purely additive glue around the same
`api.mjs`.

**The repo is public.** Never put real customer data, real account numbers or a real
operator's branding in `data.mjs`.

## Layout

| Path | What |
|---|---|
| `index.html` | The control panel: dataset and field picker, record browser, try-it panel, and a generator that emits the Genesys data action **with the deployed hostname baked in** |
| `netlify/functions/api.mjs` | The whole API. One function, hand-rolled router |
| `netlify/functions/lib/data.mjs` | 12 shared people plus four industry payloads |
| `genesys/*.custom.json` | Reference data action exports |
| `aws/deploy.ps1` | AWS deploy: package, role, Lambda, HTTP API, bucket, upload, smoke test. Idempotent |
| `aws/lambda/handler.mjs` | Lambda adapter — API Gateway v2 event → Web `Request` |
| `local-server.mjs` | `node local-server.mjs` → localhost:8888, runs the real function |
| `PROMPT.md` | Rebuild prompt v1 — interviews you about fields up front |
| `PROMPT-V2.md` | Rebuild prompt v2 — asks only for the Netlify URL; fields are chosen in the deployed page |
| `TEACHING-PROMPT.md` | Session script for teaching a partner to build this from scratch |

## Four invariants — do not "simplify" these away

1. **`/lookup` always returns HTTP 200 with every field present**, unknown numbers
   included. A field missing from the response fails the Genesys output contract at
   runtime, and the flow error is nothing like clear enough to lead you back here.
   `found: false` is the branch point instead.
2. **Phone matching uses the last 9 digits.** A `+` in a Genesys `requestUrlTemplate`
   arrives here as a space. Normalising server-side is what keeps Architect simple.
3. **`/customers` returns `[]`, not 404**, for a filter with no hits — mockapi.io
   semantics, so an action originally built against mockapi.io still works.
4. **`industry` defaults to telco; an unknown one is a 400**, never a silent fallback.
   A typo in a `requestUrlTemplate` must fail loudly rather than quietly serve the wrong
   dataset — that is the kind of bug you only find on stage.

## How the field picker works

`/lookup` always returns every field its dataset holds. The checkboxes change the **data
action**, not the API: a tick adds the field to the output contract, the translation map
and the success template together. So field selection needs no redeploy, and the three
pieces cannot fall out of step because they are all generated from one `chosen()` list.

`/api/v1/industries` returns, per dataset, both the stored fields and the *expanded*
output-contract fields — money fields carry a `Text` companion, dates a `Spoken` one.
The page renders entirely from that, so it never hardcodes a schema. Adding an industry
to `data.mjs` makes it appear in the dropdown with no page change.

## Custom fields are synthesised, not stored

`?fields=claimRef:string,excessAmount:money` makes the API generate values on the fly, so
custom fields need **no redeploy and no storage**. Values come from an FNV-1a hash of
`(person.id, field name)`, which matters more than it looks: they must be
**deterministic**, because a demo where a balance changes between two calls of the same
number is worse than no demo. Types are `string`, `number`, `money`, `date`; capped at 20
fields, names sanitised to what Genesys accepts as a property.

`industry=custom` without a spec is a 400 — there would be nothing to return, and failing
loudly beats an empty record.

A few name heuristics (`status`, `city`, `email`, `name`) produce plausible values instead
of `FIELDNAME-1234` everywhere, which is the difference between a demo that looks real and
one that obviously isn't.

## Adding a field or a dataset

Add the key to every record under the industry's `data` map in `data.mjs` and declare it
in that industry's `fields` with a type of `string`, `number`, `money` or `date`.
Companions and the output contract are derived, so there is nothing to change in
`api.mjs`. Then regenerate the data action from the console and re-import it.

Dates are stored as **day offsets from today**, not ISO strings. It looks odd in the
dataset and it is why the demo does not expire.

## Deploying to Netlify

Drag-and-drop is the intended route, and the zip must have the site files at its
**root** with **forward-slash** paths inside — PowerShell's `Compress-Archive` writes
backslashes, Netlify's unzip mishandles them, and the function then 404s with no useful
error. Build it with `System.IO.Compression.ZipArchive` and `CreateEntry("netlify/functions/api.mjs")`
explicitly. `*.zip` is gitignored on purpose.

Netlify site name is set by whoever deployed it; the page and the function share an
origin there, so `API_ORIGIN` stays `""` and everything resolves to `location.origin`.

Live: `rk-mockapi.netlify.app`.

## Deploying to AWS

```
powershell -ExecutionPolicy Bypass -File aws/deploy.ps1 -BucketName <bucket> -Region eu-west-1 -KeyPrefix <prefix>
```

Idempotent — re-run to ship a change. Smoke-tests the deployed lookup at the end rather
than trusting that a successful upload means a working API. It prints the console and
API URLs when it finishes.

Resource names, if you need to find them: Lambda `crm-mockapi-run`, role
`crm-mockapi-lambda-role`, HTTP API `crm-mockapi-api`, region eu-west-1.

**This repo is public, so live URLs and the account ID are deliberately not recorded
here.** Get them from the deploy output, or:

```
aws apigatewayv2 get-apis --region eu-west-1 --query "Items[?Name=='crm-mockapi-api'].ApiEndpoint"
```

### Rate limiting

The API is public and unauthenticated, so the `$default` stage is throttled to **20
req/sec, 40 burst**. Without it the stage inherits the account default of ~10,000
req/sec, and since Lambda and API Gateway both bill per request, a scraper finding the
URL is an unbounded cost. Re-apply after any stage recreation:

```
aws apigatewayv2 update-stage --api-id <id> --stage-name '$default' --region eu-west-1 --default-route-settings ThrottlingRateLimit=20,ThrottlingBurstLimit=40
```

### Four AWS traps, all already paid for

1. **Do not swap API Gateway for a Lambda Function URL.** `AuthType NONE` returns **403**
   in this org — an Organizations guardrail denies anonymous `lambda:InvokeFunctionUrl`,
   even though public S3 and IAM invoke both work. Same finding as `GenesysCloudPOC-AWS`.
2. **The Lambda zip needs forward-slash entry paths too.** Otherwise Lambda unpacks a
   file literally named `lib\data.mjs` and `import './lib/data.mjs'` fails at cold start
   with an error that never mentions zip encoding.
3. **The adapter must rebuild the real URL** from `rawPath` + `rawQueryString`. The POC's
   adapter next door uses a synthetic URL because its backend reads only method and body;
   this API is driven by path and query. Copy that one verbatim and every lookup returns
   `found: false` — a 200 with empty fields, invisible until it is on a live call.
4. **No CORS on the API Gateway.** `api.mjs` sets its own and answers OPTIONS; doing both
   emits duplicate `access-control-allow-origin` headers and browsers reject that.

### How the page finds the API

On Netlify the two share an origin. On AWS they do not, so `deploy.ps1` rewrites
`const API_ORIGIN = "";` to the API Gateway endpoint before upload. That constant also
drives the **data action generator** — Genesys must call API Gateway, never the S3 bucket
serving the page. The deploy throws if it cannot find the needle, rather than shipping a
page that quietly points at the bucket.

## Testing

`node local-server.mjs`, then hit `/api/v1/lookup?phoneNumber=...`. Check at least:
a known number, a local-format number (`0501234003`), an unknown number, and
`/customers?phoneNumber=` with no match. The Netlify runtime is not involved locally,
but the handler is byte-identical.
