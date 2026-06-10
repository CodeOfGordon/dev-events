import { NextResponse, type NextRequest } from 'next/server';
import { isValidObjectId } from 'mongoose';
import connectDB from '@/database/mongodb';
import { Booking } from '@/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    await connectDB();

    let body: { eventId?: string; email?: string };
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { eventId, email } = body;
    if (!eventId || !isValidObjectId(eventId)) {
        return NextResponse.json({ error: 'A valid eventId is required' }, { status: 400 });
    }
    if (!email || typeof email !== 'string') {
        return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    try {
        // .create() runs the pre-save hook, which verifies the event exists
        const booking = await Booking.create({ eventId, email });
        return NextResponse.json({ booking }, { status: 201 });
    } catch (e: unknown) {
        const err = e as { code?: number; name?: string; message?: string };
        if (err.code === 11000) {
            return NextResponse.json(
                { error: 'This email has already booked this event' },
                { status: 409 },
            );
        }
        if (err.name === 'ValidationError') {
            return NextResponse.json({ error: err.message }, { status: 400 });
        }
        throw e;
    }
}
