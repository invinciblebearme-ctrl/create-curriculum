import { Env } from '../../../types';
import { verifyAdminAuth } from '../../../middleware/auth';

// PUT: 도서 메타데이터 수정 또는 파일 교체
export const onRequestPut: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const bookId = params.id as string;

  const auth = await verifyAdminAuth(request, env);
  if (!auth.success) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status || 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.DB || !env.R2_BUCKET) {
    return new Response(JSON.stringify({ error: 'DB 또는 R2 바인딩 누락' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let existing = await env.DB.prepare(
      'SELECT id, pdf_key, cover_key FROM books WHERE id = ?'
    ).bind(bookId).first<{ id: string; pdf_key: string; cover_key: string }>();

    if (!existing) {
      // Auto-initialize seed book in D1 if not yet inserted
      existing = {
        id: bookId,
        pdf_key: `books/${bookId}/document.pdf`,
        cover_key: `covers/${bookId}/cover.jpg`,
      };
      try {
        await env.DB.prepare(
          `INSERT INTO books (id, title, description, category, pdf_key, cover_key, file_size, page_count, is_published, created_at, updated_at)
           VALUES (?, ?, '', '수업설계 길잡이', ?, ?, 0, 0, 1, datetime('now'), datetime('now'))`
        ).bind(bookId, bookId, existing.pdf_key, existing.cover_key).run();
      } catch {}
    }

    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const title = formData.get('title') as string | null;
      const description = formData.get('description') as string | null;
      const category = formData.get('category') as string | null;
      const emoji = formData.get('emoji') as string | null;
      const sortOrderRaw = formData.get('sort_order') as string | null;
      const pageCountRaw = formData.get('page_count') as string | null;
      const isPublishedRaw = formData.get('is_published');
      const isPublished = isPublishedRaw !== null ? (isPublishedRaw === 'true' || isPublishedRaw === '1' ? 1 : 0) : null;
      
      const newPdfFile = formData.get('pdf_file') as File | null;
      const newCoverFile = formData.get('cover_file') as File | null;

      // Handle PDF replacement if provided
      let newFileSize: number | null = null;
      let newPdfKey: string | null = null;
      if (newPdfFile && newPdfFile.size > 0) {
        const buffer = await newPdfFile.arrayBuffer();
        const targetPdfKey = existing.pdf_key && !existing.pdf_key.startsWith('/pdf/')
          ? existing.pdf_key
          : `books/${bookId}/doc_${Date.now()}.pdf`;
        await env.R2_BUCKET.put(targetPdfKey, buffer, {
          httpMetadata: { contentType: 'application/pdf' },
          customMetadata: { originalName: newPdfFile.name || 'document.pdf' },
        });
        newFileSize = newPdfFile.size;
        newPdfKey = targetPdfKey;
      }

      // Handle Cover replacement if provided
      let newCoverKey: string | null = null;
      if (newCoverFile && newCoverFile.size > 0) {
        const buffer = await newCoverFile.arrayBuffer();
        const targetCoverKey = existing.cover_key && !existing.cover_key.startsWith('/pdf/')
          ? existing.cover_key
          : `covers/${bookId}/cover_${Date.now()}.jpg`;
        await env.R2_BUCKET.put(targetCoverKey, buffer, {
          httpMetadata: { contentType: newCoverFile.type || 'image/jpeg' },
        });
        newCoverKey = targetCoverKey;
      }

      // Update D1
      const updateFields: string[] = ["updated_at = datetime('now')"];
      const updateParams: any[] = [];

      if (title !== null) {
        updateFields.push('title = ?');
        updateParams.push(title.trim());
      }
      if (description !== null) {
        updateFields.push('description = ?');
        updateParams.push(description.trim());
      }
      if (category !== null) {
        updateFields.push('category = ?');
        updateParams.push(category.trim());
      }
      if (emoji !== null) {
        try {
          updateFields.push('emoji = ?');
          updateParams.push(emoji.trim());
        } catch {}
      }
      if (sortOrderRaw !== null) {
        try {
          updateFields.push('sort_order = ?');
          updateParams.push(parseInt(sortOrderRaw, 10));
        } catch {}
      }
      if (pageCountRaw !== null) {
        try {
          updateFields.push('page_count = ?');
          updateParams.push(parseInt(pageCountRaw, 10));
        } catch {}
      }
      if (isPublished !== null) {
        updateFields.push('is_published = ?');
        updateParams.push(isPublished);
      }
      if (newFileSize !== null) {
        updateFields.push('file_size = ?');
        updateParams.push(newFileSize);
      }
      if (newPdfKey !== null) {
        updateFields.push('pdf_key = ?');
        updateParams.push(newPdfKey);
      }
      if (newCoverKey !== null) {
        updateFields.push('cover_key = ?');
        updateParams.push(newCoverKey);
      }

      updateParams.push(bookId);

      try {
        await env.DB.prepare(
          `UPDATE books SET ${updateFields.join(', ')} WHERE id = ?`
        ).bind(...updateParams).run();
      } catch (err: any) {
        // Fallback omitting optional emoji/sort_order columns if not yet migrated
        const basicFields = updateFields.filter((f) => !f.startsWith('emoji') && !f.startsWith('sort_order'));
        const basicParams = updateParams.filter((_, idx) => {
          const field = updateFields[idx];
          return !field.startsWith('emoji') && !field.startsWith('sort_order');
        });
        await env.DB.prepare(
          `UPDATE books SET ${basicFields.join(', ')} WHERE id = ?`
        ).bind(...basicParams).run();
      }

    } else {
      // JSON payload update (e.g. quick publish toggle or edit)
      const body = await request.json() as any;
      const updateFields: string[] = ["updated_at = datetime('now')"];
      const updateParams: any[] = [];

      if (body.title !== undefined) {
        updateFields.push('title = ?');
        updateParams.push(body.title.trim());
      }
      if (body.description !== undefined) {
        updateFields.push('description = ?');
        updateParams.push(body.description.trim());
      }
      if (body.category !== undefined) {
        updateFields.push('category = ?');
        updateParams.push(body.category.trim());
      }
      if (body.emoji !== undefined) {
        updateFields.push('emoji = ?');
        updateParams.push(body.emoji.trim());
      }
      if (body.sort_order !== undefined) {
        updateFields.push('sort_order = ?');
        updateParams.push(body.sort_order);
      }
      if (body.is_published !== undefined) {
        updateFields.push('is_published = ?');
        updateParams.push(body.is_published ? 1 : 0);
      }

      updateParams.push(bookId);

      try {
        await env.DB.prepare(
          `UPDATE books SET ${updateFields.join(', ')} WHERE id = ?`
        ).bind(...updateParams).run();
      } catch {
        const basicFields = updateFields.filter((f) => !f.startsWith('emoji') && !f.startsWith('sort_order'));
        const basicParams = updateParams.filter((_, idx) => {
          const field = updateFields[idx];
          return !field.startsWith('emoji') && !field.startsWith('sort_order');
        });
        await env.DB.prepare(
          `UPDATE books SET ${basicFields.join(', ')} WHERE id = ?`
        ).bind(...basicParams).run();
      }
    }

    const updated = await env.DB.prepare(
      'SELECT * FROM books WHERE id = ?'
    ).bind(bookId).first();

    return new Response(JSON.stringify({ success: true, book: updated }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: '수정 실패: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

// DELETE: 도서 삭제 (D1 메타데이터 및 R2 파일 삭제)
export const onRequestDelete: PagesFunction<Env> = async (context) => {
  const { request, params, env } = context;
  const bookId = params.id as string;

  const auth = await verifyAdminAuth(request, env);
  if (!auth.success) {
    return new Response(JSON.stringify({ error: auth.error }), {
      status: auth.status || 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!env.DB || !env.R2_BUCKET) {
    return new Response(JSON.stringify({ error: 'DB 또는 R2 바인딩 누락' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const book = await env.DB.prepare(
      'SELECT pdf_key, cover_key FROM books WHERE id = ?'
    ).bind(bookId).first<{ pdf_key: string; cover_key: string }>();

    if (!book) {
      return new Response(JSON.stringify({ error: '삭제할 도서를 찾을 수 없습니다.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 1. Delete R2 objects
    if (book.pdf_key) {
      await env.R2_BUCKET.delete(book.pdf_key);
    }
    if (book.cover_key) {
      await env.R2_BUCKET.delete(book.cover_key);
    }

    // 2. Delete D1 record
    await env.DB.prepare('DELETE FROM books WHERE id = ?').bind(bookId).run();

    return new Response(JSON.stringify({ success: true, deletedId: bookId }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    return new Response(JSON.stringify({ error: '도서 삭제 실패: ' + error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
