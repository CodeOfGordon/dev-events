import { NextResponse, type NextRequest } from 'next/server';
import connectDB from '@/database/mongodb';
import { runScrape } from '@/lib/scrape';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic'; // never cache a mutation endpoint
export const maxDuration = 300;         // scrapes are slow; raise the function ceiling

export async function POST(request: NextRequest) {
    // Auth — fail closed if the secret is unset
    const secret = process.env.CRON_SECRET;
    const auth = request.headers.get('authorization');
    if (!secret || auth !== `Bearer ${secret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Optional body scopes the run, e.g. { "sources": ["luma", "eventbrite"] }
    let sources: string[] | undefined;
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body?.sources)) sources = body.sources.map(String);

    await connectDB();
    const result = await runScrape({ sources });

    return NextResponse.json({
        ok: true,
        sources: result.sources,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
        errors: result.errors,
        ranAt: new Date().toISOString(),
    });
}
