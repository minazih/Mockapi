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
| `index.html` | The console: record browser, live try-it panel, and a generator that emits the Genesys data action JSON **with the deployed hostname baked in** |
| `netlify/functions/api.mjs` | The whole API. One function, hand-rolled router |
| `netlify/functions/lib/data.mjs` | The 12 records and the `FIELDS` list |
| `genesys/*.custom.json` | Reference data action exports, host left as `YOUR-SITE.netlify.app` |
| `local-server.mjs` | `node local-server.mjs` → localhost:8888, runs the real function |
| `TEACHING-PROMPT.md` | Session script for teaching a partner to build this from scratch |

## Three invariants — do not "simplify" these away

1. **`/lookup` always returns HTTP 200 with every field present**, unknown numbers
   included. A field missing from the response fails the Genesys output contract at
   runtime, and the flow error is nothing like clear enough to lead you back here.
   `found: false` is the branch point instead.
2. **Phone matching uses the last 9 digits.** A `+` in a Genesys `requestUrlTemplate`
   arrives here as a space. Normalising server-side is what keeps Architect simple.
3. **`/customers` returns `[]`, not 404**, for a filter with no hits — mockapi.io
   semantics, so an action originally built against mockapi.io still works.

## Adding a field

Add the key to every record in `data.mjs`, name it in `FIELDS`, and — for `/lookup`
only — add it to `flatten()` in `api.mjs`. That second step is deliberately manual so
the output contract can't drift without someone noticing. Then regenerate the data
action JSON from the console page and re-import it in Genesys.

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
