/**
 * Blix — which transport request belongs to which axios entry.
 *
 * axios's default adapter in a browser is `XMLHttpRequest`. With both
 * `attachHttpMonitor` and `attachXhrMonitor` installed, every axios request
 * would therefore be logged twice: once by the interceptor, with the plaintext
 * body and the config, and once by the XHR wrapper, with neither.
 *
 * The fetch adapter has a clean answer — axios passes `fetchOptions` through,
 * so the entry id rides along (`monitorStamp.ts`). XHR has nowhere to carry
 * one: a header would change the request and can trigger a preflight, and
 * axios constructs the object where nothing outside can reach it.
 *
 * So it is matched instead. The interceptor announces what it is about to
 * send; the XHR wrapper, at `send()`, asks whether somebody is expecting this
 * method and path, and steps aside if so. Path only, not the query string:
 * axios serializes `params` after the interceptors have run, in a format the
 * app can replace, so the interceptor does not know the final query.
 */

interface Expected {
  method: string;
  /** `origin + pathname`, resolved against the page. */
  target: string;
}

const expected = new Map<string, Expected>();

/** `origin + pathname` of `url` as the browser will resolve it, or `null`. */
export function transportTarget(url: string, baseURL?: string): string | null {
  try {
    const page = typeof location !== "undefined" ? location.href : "http://localhost/";
    // axios's rule: a relative url is appended to baseURL, an absolute one
    // ignores it.
    const absolute = /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url);
    const joined =
      baseURL && !absolute
        ? `${baseURL.replace(/\/+$/, "")}/${url.replace(/^\/+/, "")}`
        : url;
    const resolved = new URL(joined || baseURL || "", page);
    return resolved.origin + resolved.pathname;
  } catch {
    return null;
  }
}

/** Called by the axios interceptor when a request starts. */
export function expectAxiosTransport(
  id: string,
  method: string,
  url: string,
  baseURL?: string,
): void {
  const target = transportTarget(url, baseURL);
  if (target) expected.set(id, { method: method.toUpperCase(), target });
}

/** Called when the axios entry settles, whichever transport carried it. */
export function releaseAxiosTransport(id: string): void {
  expected.delete(id);
}

/**
 * The axios entry waiting for this transport request, if any — and it stops
 * waiting. Oldest first: two identical requests in flight are claimed in the
 * order they were announced, which is the order they are sent.
 */
export function claimAxiosTransport(method: string, absoluteUrl: string): string | undefined {
  if (expected.size === 0) return undefined;
  const target = transportTarget(absoluteUrl);
  if (!target) return undefined;
  const wanted = method.toUpperCase();
  for (const [id, entry] of expected) {
    if (entry.method === wanted && entry.target === target) {
      expected.delete(id);
      return id;
    }
  }
  return undefined;
}
