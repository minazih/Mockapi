/**
 * AWS Lambda adapter for the Mock CRM API.
 *
 * The whole API lives in api.mjs as a single Web-standard handler
 * (`export default async function handler(req: Request): Response`) — the exact
 * shape Netlify Functions v2 use, so the same file runs unchanged on Lambda.
 * This adapter only translates an API Gateway HTTP API event (payload format
 * 2.0) into the Web `Request`/`Response` objects api.mjs already speaks.
 *
 * THE IMPORTANT DIFFERENCE from the POC's adapter next door: that one hands the
 * handler a synthetic URL, because its backend reads nothing but the method and
 * the JSON body. This API is driven entirely by its PATH and QUERY STRING, so
 * the real ones have to be reconstructed here. Get this wrong and every lookup
 * quietly returns the not-found shape — a 200 with empty fields, which is
 * exactly the kind of failure nobody notices until it is on a call.
 *
 * `rawQueryString` is the query exactly as it arrived, still percent-encoded,
 * so a phone number sent as %2B966... survives intact.
 *
 * CORS is NOT configured on the API Gateway. api.mjs sets its own CORS headers
 * and answers OPTIONS itself; configuring both would emit duplicate
 * `access-control-allow-origin` headers and browsers reject that outright.
 *
 * Runtime: Node.js 20.x or newer, which provides global Request, Response and
 * Buffer — everything api.mjs and this adapter rely on.
 */
import webHandler from './api.mjs';

export const handler = async (event) => {
  const http = event?.requestContext?.http || {};
  const method = http.method || event?.httpMethod || 'GET';
  const rawPath = event?.rawPath || http.path || event?.path || '/';
  const query = event?.rawQueryString ? '?' + event.rawQueryString : '';

  // Host only has to make the URL parseable; api.mjs reads origin for the
  // self-describing index response, so using the real one keeps that honest.
  const host = event?.headers?.host || event?.headers?.Host || 'lambda.internal';
  const url = `https://${host}${rawPath}${query}`;

  const body = event?.isBase64Encoded
    ? Buffer.from(event.body || '', 'base64').toString('utf8')
    : event?.body || '';

  const req = new Request(url, {
    method,
    headers: event?.headers || {},
    body: method === 'GET' || method === 'HEAD' ? undefined : body,
  });

  let res;
  try {
    res = await webHandler(req);
  } catch (err) {
    // api.mjs returns a Response for its own errors; this only fires if the
    // adapter or the module load itself threw.
    return {
      statusCode: 500,
      headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: true, message: err?.message || String(err) }, null, 2),
    };
  }

  const headers = {};
  res.headers.forEach((value, key) => { headers[key] = value; });

  return { statusCode: res.status, headers, body: await res.text() };
};
