import { lookup as dnsLookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import https from "node:https";
import { Readable } from "node:stream";

const blocked = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15],
  ["198.51.100.0", 24], ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]
]) blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["2001::", 23], ["2001:db8::", 32], ["2002::", 16], ["3fff::", 20]]) blocked.addSubnet(address, prefix, "ipv6");
const globalIpv6 = new BlockList();
globalIpv6.addSubnet("2000::", 3, "ipv6");

function isSafeAddress(address) {
  const family = isIP(address);
  return family === 4 ? !blocked.check(address, "ipv4")
    : family === 6 && globalIpv6.check(address, "ipv6") && !blocked.check(address, "ipv6");
}

function assertNotAborted(signal) {
  if (signal?.aborted) throw new Error("Upstream request aborted");
}

async function lookupWithSignal(hostname, lookup, signal) {
  let onAbort;
  try {
    return await new Promise((resolve, reject) => {
      onAbort = () => reject(new Error("Upstream request aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      // The native DNS operation is not cancellable. Stop waiting on abort and
      // retain both handlers so a late DNS rejection cannot become unhandled.
      Promise.resolve().then(() => {
        assertNotAborted(signal);
        return lookup(hostname, { all: true, verbatim: true });
      }).then(resolve, reject);
    });
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

async function resolveDestination(input, lookup, signal) {
  assertNotAborted(signal);
  let url;
  try { url = new URL(input); } catch { throw new Error("Invalid upstream URL"); }
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Upstream URL requires HTTPS without credentials");
  const hostname = url.hostname.replace(/^\[|\]$/g, "").replace(/\.$/, "").toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local")) throw new Error("Private upstream destination is forbidden");
  let addresses;
  try {
    addresses = isIP(hostname) ? [{ address: hostname, family: isIP(hostname) }] : await lookupWithSignal(hostname, lookup, signal);
  } catch {
    assertNotAborted(signal);
    throw new Error("Unable to resolve upstream destination");
  }
  assertNotAborted(signal);
  if (!Array.isArray(addresses) || !addresses.length || addresses.some((entry) => !isSafeAddress(entry.address))) throw new Error("Private or unsafe upstream destination is forbidden");
  return { url, addresses: addresses.map(({ address }) => ({ address, family: isIP(address) })) };
}

export async function assertSafeUpstreamUrl(url, { lookup = dnsLookup, signal } = {}) {
  return (await resolveDestination(url, lookup, signal)).url;
}

// Use the validated addresses for the actual connection; a second DNS lookup
// would allow rebinding between validation and fetch. Keep the URL hostname for TLS.
function pinnedFetch(url, options, addresses) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: options.method,
      headers: Object.fromEntries(new Headers(options.headers)),
      signal: options.signal,
      agent: false,
      lookup(hostname, settings, callback) {
        if (settings.all) callback(null, addresses);
        else callback(null, addresses[0].address, addresses[0].family);
      }
    }, (upstream) => {
      try {
        const headers = new Headers();
        for (const [key, value] of Object.entries(upstream.headers)) {
          if (Array.isArray(value)) value.forEach((item) => headers.append(key, item));
          else if (value !== undefined) headers.set(key, value);
        }
        const noBody = options.method === "HEAD" || [204, 205, 304].includes(upstream.statusCode);
        const response = new Response(noBody ? null : Readable.toWeb(upstream), { status: upstream.statusCode, headers });
        if (noBody) upstream.resume();
        resolve(response);
      } catch {
        upstream.destroy();
        reject(new Error("Upstream request failed"));
      }
    });
    request.on("error", reject);
    request.end(options.body);
  });
}

export async function safeFetch(input, options = {}) {
  const { lookup = dnsLookup, fetchImpl, ...requestOptions } = options;
  let destination = await resolveDestination(input, lookup, requestOptions.signal);
  let method = (requestOptions.method || "GET").toUpperCase();
  let body = requestOptions.body;
  let headers;
  try { headers = new Headers(requestOptions.headers); } catch { throw new Error("Invalid upstream request headers"); }
  // Let HTTPS derive the authority from the validated URL.
  headers.delete("host");
  for (let redirects = 0; ; redirects++) {
    assertNotAborted(requestOptions.signal);
    let response;
    try {
      const init = { ...requestOptions, method, body, headers, redirect: "manual" };
      response = fetchImpl ? await fetchImpl(destination.url.toString(), init) : await pinnedFetch(destination.url, init, destination.addresses);
    } catch {
      throw new Error(requestOptions.signal?.aborted ? "Upstream request aborted" : "Upstream request failed");
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location) return response;
    await response.body?.cancel();
    if (redirects >= 3) throw new Error("Too many upstream redirects");
    let next;
    try { next = new URL(location, destination.url); } catch { throw new Error("Invalid upstream redirect"); }
    if (next.origin !== destination.url.origin && (body != null || [...headers.keys()].some((key) => /authorization|cookie|api[-_]?key/i.test(key)))) {
      throw new Error("Cross-origin upstream redirect with credentials or body is forbidden");
    }
    destination = await resolveDestination(next, lookup, requestOptions.signal);
    if ((response.status === 303 && method !== "HEAD") || ([301, 302].includes(response.status) && method === "POST")) {
      method = "GET";
      body = undefined;
      headers.delete("content-type");
      headers.delete("content-length");
    }
  }
}
