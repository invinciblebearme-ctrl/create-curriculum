import { Env } from '../../types';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const { params, env } = context;
    const bookId = params.id as string;

    if (!bookId) {
      return new Response(JSON.stringify({ error: '도서 ID가 필요합니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let book: any = null;
    if (env.DB) {
      try {
        const statement = env.DB.prepare(
          'SELECT * FROM books WHERE id = ?'
        ).bind(bookId);
        book = await statement.first();
      } catch (e) {
        console.warn('D1 query error:', e);
      }
    }

    // Fallback for seed book create-doc-1
    if (!book && bookId === 'create-doc-1') {
      book = {
        id: "create-doc-1",
        title: "CREATE 수업설계 모형 길잡이",
        description: "CREATE 수업설계 모형의 기본 개념과 설계 전략 가이드북입니다.",
        category: "수업설계 길잡이",
        emoji: "📖",
        sort_order: 1,
        pdf_key: "/pdf/CREATE%20%EC%88%98%EC%97%85%EC%84%A4%EA%B3%84%20%EB%AA%A8%ED%98%95%20%EA%B8%B8%EC%9E%A1%EC%9D%B4.pdf",
        cover_key: "covers/create-doc-1/cover.jpg",
        file_size: 4786542,
        page_count: 36,
        is_published: 1,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    }

    if (!book) {
      return new Response(JSON.stringify({ error: '요청한 도서를 찾을 수 없습니다.' }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }

    return new Response(JSON.stringify(book), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=120',
      },
    });
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: '도서 정보 조회 실패: ' + (error.message || 'Unknown error') }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
