(function () {
  if ((window as any).__X_LOC_INJECTED__) return;
  (window as any).__X_LOC_INJECTED__ = true;

  let headersCaptured = false;
  let storedHeaders: Record<string, string> | null = null;

  function dispatchHeaders(headers: Record<string, string>) {
    if (headersCaptured) return;
    if (!headers['authorization']) return;
    headersCaptured = true;
    storedHeaders = headers;
    window.dispatchEvent(
      new CustomEvent('x-loc-headers-captured', { detail: { headers } })
    );
  }

  // content.tsx starts at document_idle and may miss the initial dispatch.
  // It sends this event on init to request a re-dispatch of stored headers.
  window.addEventListener('x-loc-request-headers', () => {
    if (storedHeaders) {
      window.dispatchEvent(
        new CustomEvent('x-loc-headers-captured', { detail: { headers: storedHeaders } })
      );
    }
  });

  // Wrap fetch
  const originalFetch = window.fetch.bind(window);
  (window as any).fetch = function (input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    if (url.includes('x.com/i/api/graphql') && !headersCaptured) {
      const headers: Record<string, string> = {};
      const rawHeaders =
        init?.headers ??
        (input instanceof Request ? input.headers : undefined);
      if (rawHeaders) {
        if (rawHeaders instanceof Headers) {
          rawHeaders.forEach((value: string, key: string) => {
            headers[key.toLowerCase()] = value;
          });
        } else if (Array.isArray(rawHeaders)) {
          for (const [k, v] of rawHeaders) {
            headers[(k as string).toLowerCase()] = v as string;
          }
        } else {
          for (const [k, v] of Object.entries(rawHeaders as Record<string, string>)) {
            headers[k.toLowerCase()] = v;
          }
        }
      }
      dispatchHeaders(headers);
    }
    return originalFetch(input, init);
  };

  // Wrap XMLHttpRequest
  const OriginalXHR = window.XMLHttpRequest;
  function PatchedXHR(this: XMLHttpRequest) {
    const xhr = new OriginalXHR();
    let _url = '';
    const _headers: Record<string, string> = {};

    const originalOpen = xhr.open.bind(xhr);
    (xhr as any).open = function (method: string, url: string, ...rest: any[]) {
      _url = url;
      return originalOpen(method, url, ...rest);
    };

    const originalSetRequestHeader = xhr.setRequestHeader.bind(xhr);
    (xhr as any).setRequestHeader = function (key: string, value: string) {
      _headers[key.toLowerCase()] = value;
      return originalSetRequestHeader(key, value);
    };

    const originalSend = xhr.send.bind(xhr);
    (xhr as any).send = function (...args: any[]) {
      if (_url.includes('x.com/i/api/graphql') && !headersCaptured) {
        dispatchHeaders(_headers);
      }
      return originalSend(...args);
    };

    return xhr;
  }
  PatchedXHR.prototype = OriginalXHR.prototype;
  (window as any).XMLHttpRequest = PatchedXHR;
})();
