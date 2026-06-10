import { NextResponse, type NextRequest } from 'next/server';
import connectDB from '@/database/mongodb';
import { Event } from '@/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
    _request: NextRequest,
    { params }: { params: Promise<{ slug: string }> },
) {
    await connectDB();
    const { slug } = await params; // params is a Promise in Next 16

    if (!slug || typeof slug !== 'string') {
        return NextResponse.json({ error: 'Invalid slug' }, { status: 400 });
    }

    const event = await Event.findOne({ slug: slug.toLowerCase() }).lean();
    if (!event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    return NextResponse.json({ event });
}
