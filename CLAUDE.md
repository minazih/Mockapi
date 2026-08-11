# Mockapi — mock CRM API for Genesys Cloud data actions

Repo `minazih/Mockapi` (public). A static console page plus one Netlify Function that
fakes a CRM: look a caller up by phone number, get back `firstName`, `accountNumber`,
`billAmount`, `deviceType`. It exists so a Genesys Cloud web services data action has
something real to call in a demo or a partner enablement session.

**The repo is public.** Never put real customer data, real account numbers or a real
operator's branding in `data.mjs`.

## Layout

| Path | What |
|---|---|
| `index.html` | The control panel: dataset and field picker, record browser, try-it panel, and a generator that emits the Genesys data action **with the deployed hostname baked in** |
| `netlify/functions/api.mjs` | The whole API. One function, hand-rolled router |
| `netlify/functions/lib/data.mjs` | 12 shared people plus four industry payloads |
| `genesys/*.custom.json` | Reference data action exports, host left as `YOUR-SITE.netlify.app` |
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

## Adding a field or a dataset

Add the key to every record under the industry's `data` map in `data.mjs` and declare it
in that industry's `fields` with a type of `string`, `number`, `money` or `date`.
Companions and the output contract are derived, so there is nothing to change in
`api.mjs`. Then regenerate the data action from the console and re-import it.

Dates are stored as **day offsets from today**, not ISO strings. It looks odd in the
dataset and it is why the demo does not expire.

## Deploying

Drag-and-drop is the intended route, and the zip must have the site files at its
**root** with **forward-slash** paths inside — PowerShell's `Compress-Archive` writes
backslashes, Netlify's unzip mishandles them, and the function then 404s with no useful
error. Build it with `System.IO.Compression.ZipArchive` and `CreateEntry("netlify/functions/api.mjs")`
explicitly. `*.zip` is gitignored on purpose.

Netlify site name is set by whoever deployed it; the console page reads
`location.origin`, so the generated data action JSON is always correct for wherever it
is actually running.

## Testing

`node local-server.mjs`, then hit `/api/v1/lookup?phoneNumber=...`. Check at least:
a known number, a local-format number (`0501234003`), an unknown number, and
`/customers?phoneNumber=` with no match. The Netlify runtime is not involved locally,
but the handler is byte-identical.
