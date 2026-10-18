import { Env } from '../../../types';
import { verifyAdminAuth } from '../../../middleware/auth';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { request, params, env } = context;
    const bookId = params.id as string;

    if (!bookId) {
      return new Response('도서 ID가 누락되었습니다.', { status: 400 });
    }

    if (!env.DB || !env.R2_BUCKET) {
      return new Response('D1 또는 R2 스토리지 바인딩이 누락되었습니다.', { status: 503 });
    }

    // 1. Check book publication status in D1
    let book = await env.DB.prepare(
      'SELECT pdf_key, is_published FROM books WHERE id = ?'
    ).bind(bookId).first<{ pdf_key: string; is_published: number }>();

    // Fallback for seed book create-doc-1
    if (!book && bookId === 'create-doc-1') {
      book = {
        pdf_key: '/pdf/CREATE%20%EC%88%98%EC%97%85%EC%84%A4%EA%B3%84%20%EB%AA%A8%ED%98%95%20%EA%B8%B8%EC%9E%A1%EC%9D%B4.pdf',
        is_published: 1,
      };
    }

    if (!book) {
      return new Response('도서를 찾을 수 없습니다.', { 
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // NOTE: Direct link access is allowed even if is_published === 0 (unlisted mode).
    // The library catalog (/api/books) will NOT show unlisted books, but direct viewers work.

    // If it's a seed PDF in static files:
    if (book.pdf_key.startsWith('/pdf/')) {
      const reqUrl = new URL(request.url);
      const isCurriculum2 = reqUrl.pathname.includes('/curriculum2');
      const isCurriculum = reqUrl.pathname.includes('/curriculum') && !isCurriculum2;
      const basePath = isCurriculum2 ? '/curriculum2' : (isCurriculum ? '/curriculum' : '');

      // Try ASSETS fetcher if available in Pages
      if ((env as any).ASSETS) {
        try {
          const assetUrl = new URL(book.pdf_key, request.url);
          const assetRes = await (env as any).ASSETS.fetch(new Request(assetUrl.toString(), request));
          if (assetRes.ok) {
            const headers = new Headers(assetRes.headers);
            headers.set('Access-Control-Allow-Origin', '*');
            headers.set('Content-Type', 'application/pdf');
            headers.set('Content-Disposition', 'inline');
            return new Response(assetRes.body, {
              status: assetRes.status,
              headers,
            });
          }
        } catch { }
      }

      // Fallback redirect with correct subpath
      const redirectUrl = `${reqUrl.origin}${basePath}${book.pdf_key}`;
      return Response.redirect(redirectUrl, 302);
    }

    // 2. Fetch object from R2 with HTTP Range support
    const rangeHeader = request.headers.get('Range');
    const r2Options: R2GetOptions = rangeHeader ? { range: request.headers } : {};

    const object = await env.R2_BUCKET.get(book.pdf_key, r2Options);

    if (!object) {
      return new Response('PDF 파일을 스토리지에서 찾을 수 없습니다.', { 
        status: 404,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Content-Type', 'application/pdf');
    headers.set('Content-Disposition', 'inline');
    headers.set('Accept-Ranges', 'bytes');
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Cache-Control', 'public, max-age=3600');

    // Partial response if range was requested
    if (object.range) {
      const status = 'offset' in object.range ? 206 : 200;
      return new Response(object.body, {
        status,
        headers,
      });
    }

    return new Response(object.body, {
      status: 200,
      headers,
    });
  } catch (error: any) {
    return new Response('PDF 스트리밍 중 오류 발생: ' + (error.message || 'Error'), {
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }
};
