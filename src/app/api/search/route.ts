import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || 'london united kingdom';
    const perPage = Math.min(Number(searchParams.get('per_page') || 12), 50);
    const page = Math.max(Number(searchParams.get('page') || 1), 1);
    const source = (searchParams.get('source') || 'pixabay').toLowerCase();

    if (source === 'unsplash') {
      type UnsplashPhoto = {
        id: string;
        alt_description?: string;
        description?: string;
        urls?: {
          thumb?: string;
          small?: string;
          regular?: string;
          full?: string;
        };
        width?: number;
        height?: number;
      };
      type UnsplashApiResponse = { total?: number; results?: UnsplashPhoto[] };
      const accessKey = process.env.UNSPLASH_ACCESS_KEY;
      const fallbackAccessKey = undefined; // Avoid embedding secrets in code
      const keyToUse = accessKey || fallbackAccessKey;
      if (!keyToUse) {
        return NextResponse.json(
          { error: 'Unsplash access key not configured' },
          { status: 500 }
        );
      }
      const apiUrl = new URL('https://api.unsplash.com/search/photos');
      apiUrl.searchParams.set('query', `destination+${q}`);
      apiUrl.searchParams.set('page', String(page));
      apiUrl.searchParams.set('per_page', String(perPage));
      apiUrl.searchParams.set('orientation', 'landscape');
      apiUrl.searchParams.set('content_filter', 'high');

      const res = await fetch(apiUrl.toString(), {
        headers: {
          Authorization: `Client-ID ${keyToUse}`,
          'Accept-Version': 'v1',
        },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch from Unsplash' },
          { status: 502 }
        );
      }
      const data: UnsplashApiResponse = await res.json();
      const results: UnsplashPhoto[] = Array.isArray(data?.results)
        ? data.results!
        : [];
      const hits = results.map((r) => ({
        id: String(r.id),
        tags: r.alt_description || r.description || 'photo',
        previewURL: r.urls?.thumb,
        webformatURL: r.urls?.small,
        largeImageURL: r.urls?.regular || r.urls?.full,
        imageWidth: r.width,
        imageHeight: r.height,
      }));
      return NextResponse.json({
        total: data?.total ?? 0,
        totalHits: data?.total ?? 0,
        hits,
      });
    }

    if (source === 'pexels') {
      type PexelsPhoto = {
        id: number;
        width?: number;
        height?: number;
        alt?: string;
        src?: {
          tiny?: string;
          small?: string;
          medium?: string;
          large?: string;
          large2x?: string;
          original?: string;
        };
      };
      type PexelsApiResponse = {
        total_results?: number;
        photos?: PexelsPhoto[];
      };
      const apiUrl = new URL('https://api.pexels.com/v1/search');
      apiUrl.searchParams.set('query', `${q}`);
      apiUrl.searchParams.set('per_page', String(perPage));
      apiUrl.searchParams.set('page', String(page));

      const auth = process.env.PEXELS_API_KEY;
      if (!auth) {
        return NextResponse.json(
          { error: 'Pexels API key not configured' },
          { status: 500 }
        );
      }

      const res = await fetch(apiUrl.toString(), {
        headers: { Authorization: auth },
        next: { revalidate: 0 },
      });
      if (!res.ok) {
        return NextResponse.json(
          { error: 'Failed to fetch from Pexels' },
          { status: 502 }
        );
      }
      const data: PexelsApiResponse = await res.json();
      const photos = Array.isArray(data?.photos) ? data.photos! : [];
      const hits = photos.map((p) => ({
        id: String(p.id),
        tags: p.alt || 'photo',
        previewURL: p.src?.tiny || p.src?.small || '',
        webformatURL: p.src?.medium || p.src?.large || '',
        largeImageURL: p.src?.large2x || p.src?.original || p.src?.large || '',
        imageWidth: p.width,
        imageHeight: p.height,
      }));
      return NextResponse.json({
        total: data?.total_results ?? 0,
        totalHits: data?.total_results ?? 0,
        hits,
      });
    }

    // Pixabay as default
    type PixabayHit = {
      id: number;
      tags: string;
      previewURL: string;
      webformatURL: string;
      largeImageURL: string;
      imageWidth?: number;
      imageHeight?: number;
    };
    type PixabayApiResponse = {
      total?: number;
      totalHits?: number;
      hits?: PixabayHit[];
    };
    const pixabayKey =
      process.env.PIXABAY_KEY || '52178983-3a234cae41feb4b22280b11e3';
    const apiUrl = new URL('https://pixabay.com/api/');
    apiUrl.searchParams.set('key', pixabayKey);
    apiUrl.searchParams.set('q', `destination+${q}`);
    // apiUrl.searchParams.set('image_type', 'photo');
    // apiUrl.searchParams.set('orientation', 'horizontal');
    // apiUrl.searchParams.set('safesearch', 'true');
    apiUrl.searchParams.set('per_page', String(perPage));
    apiUrl.searchParams.set('page', String(page));

    const res = await fetch(apiUrl.toString(), { next: { revalidate: 0 } });
    if (!res.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch from Pixabay' },
        { status: 502 }
      );
    }
    const data: PixabayApiResponse = await res.json();
    const hits = Array.isArray(data?.hits)
      ? data.hits!.map((h) => ({
          id: String(h.id),
          tags: h.tags,
          previewURL: h.previewURL,
          webformatURL: h.webformatURL,
          largeImageURL: h.largeImageURL,
          imageWidth: h.imageWidth,
          imageHeight: h.imageHeight,
        }))
      : [];
    return NextResponse.json({
      total: data?.total ?? 0,
      totalHits: data?.totalHits ?? 0,
      hits,
    });
  } catch {
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
