export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // [1] /curriculum2 -> create-curriculum-2.invinciblebearme.workers.dev
    if (url.pathname === '/curriculum2') {
      return Response.redirect(`${url.origin}/curriculum2/`, 301);
    }
    if (url.pathname.startsWith('/curriculum2/')) {
      const targetUrl = new URL(request.url);
      targetUrl.hostname = 'create-curriculum-2.invinciblebearme.workers.dev';

      let subPath = url.pathname.replace(/^\/curriculum2\/?/, '/');
      if (!subPath.startsWith('/')) {
        subPath = '/' + subPath;
      }
      targetUrl.pathname = subPath;

      const modifiedRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'follow',
      });

      const response = await fetch(modifiedRequest);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        let html = await response.text();
        if (!html.includes('<base href=')) {
          html = html.replace('<head>', '<head><base href="/curriculum2/">');
        }
        return new Response(html, {
          status: response.status,
          headers: response.headers,
        });
      }
      return response;
    }

    // [2] /curriculum -> future-curriculum.pages.dev (기존 1번 서재)
    if (url.pathname === '/curriculum') {
      return Response.redirect(`${url.origin}/curriculum/`, 301);
    }
    if (url.pathname.startsWith('/curriculum/')) {
      const targetUrl = new URL(request.url);
      targetUrl.hostname = 'future-curriculum.pages.dev';

      let subPath = url.pathname.replace(/^\/curriculum\/?/, '/');
      if (!subPath.startsWith('/')) {
        subPath = '/' + subPath;
      }
      targetUrl.pathname = subPath;

      const modifiedRequest = new Request(targetUrl.toString(), {
        method: request.method,
        headers: request.headers,
        body: request.body,
        redirect: 'follow',
      });

      const response = await fetch(modifiedRequest);
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        let html = await response.text();
        if (!html.includes('<base href=')) {
          html = html.replace('<head>', '<head><base href="/curriculum/">');
        }
        return new Response(html, {
          status: response.status,
          headers: response.headers,
        });
      }
      return response;
    }

    return fetch(request);
  }
};
