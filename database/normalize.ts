import type { Document } from 'mongoose';
import type { IEvent } from '@/database';

type Source = 'luma' | 'eventbrite' | 'meetup' | 'mlh' | 'company';

const DEFAULT_TZ = 'America/Toronto';
const DEFAULT_COUNTRY = 'Canada';
const DEFAULT_CITY = 'Toronto';

/** YYYY-MM-DD. Accepts ISO strings, Date-parseable strings, or already-normalized dates. */
export function normalizeDate(input: string | Date): string {
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const d = input instanceof Date ? input : new Date(input);
    if (isNaN(d.getTime())) throw new Error(`Invalid date: ${String(input)}`);
    return d.toISOString().split('T')[0];
}

/** HH:MM 24h. Accepts "14:30", "2:30 PM", or an ISO timestamp. */
export function normalizeTime(input: string | Date): string {
    if (input instanceof Date) {
        return `${String(input.getUTCHours()).padStart(2, '0')}:${String(input.getUTCMinutes()).padStart(2, '0')}`;
    }
    const m = input.trim().match(/^(\d{1,2}):(\d{2})(\s*(AM|PM))?$/i);
    if (m) {
        let h = parseInt(m[1], 10);
        const min = m[2];
        const period = m[4]?.toUpperCase();
        if (period === 'PM' && h !== 12) h += 12;
        if (period === 'AM' && h === 12) h = 0;
        return `${String(h).padStart(2, '0')}:${min}`;
    }
    const d = new Date(input); // ISO timestamp fallback
    if (isNaN(d.getTime())) throw new Error(`Invalid time: ${input}`);
    return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

function inferMode(venue?: string, isOnline?: boolean): IEvent['mode'] {
    if (isOnline) return 'online';
    return venue && venue.trim() ? 'offline' : 'online';
}

/** Canonical payload — everything except slug + fingerprint (added at upsert time). */
export type CanonicalEvent = Omit<
    IEvent,
    keyof Document | 'slug' | 'fingerprint' | 'createdAt' | 'updatedAt'
>;

/**
 * Map a source-specific raw object to the canonical Event shape.
 * `raw` is the source's native item; one switch arm per source.
 * Does NOT compute slug/fingerprint — those are derived at upsert time,
 * because bulkWrite/updateOne skip the pre-save hooks.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeRawEvent(raw: any, source: Source): CanonicalEvent {
    switch (source) {
        case 'luma': {
            // luma actor item: { name, date, timeUTC, timeLocal, city, url, text, slug }
            return {
                title: raw.name,
                description: (raw.text ?? '').slice(0, 1000),
                image: raw.coverUrl ?? '',
                venue: raw.geoAddressInfo?.fullAddress ?? '',
                country: raw.country ?? DEFAULT_COUNTRY,
                city: raw.city ?? DEFAULT_CITY,
                date: normalizeDate(raw.date ?? raw.timeUTC),
                time: normalizeTime(raw.timeLocal ?? raw.timeUTC),
                timezone: raw.timezone ?? DEFAULT_TZ,
                mode: inferMode(raw.geoAddressInfo?.fullAddress),
                organizer: raw.hosts?.[0]?.name ?? 'Luma',
                tags: ['tech'],
                url: raw.url,
                source,
                sourceId: raw.slug,
                isFree: raw.isFree,
            };
        }

        case 'eventbrite': {
            // eventbrite actor item: { title, startDate, endDate, venueName, address, isOnline, priceRange, organizerName, tags, eventUrl, imageUrl }
            return {
                title: raw.title,
                description: (raw.description ?? '').slice(0, 1000),
                image: raw.imageUrl ?? '',
                venue: raw.venueName ?? raw.address ?? '',
                country: raw.country ?? DEFAULT_COUNTRY,
                city: raw.city ?? DEFAULT_CITY,
                date: normalizeDate(raw.startDate),
                time: normalizeTime(raw.startDate),
                endDate: raw.endDate ? normalizeDate(raw.endDate) : undefined,
                endTime: raw.endDate ? normalizeTime(raw.endDate) : undefined,
                timezone: raw.timezone ?? DEFAULT_TZ,
                mode: inferMode(raw.venueName, raw.isOnline),
                organizer: raw.organizerName ?? 'Eventbrite',
                tags: raw.tags?.length ? raw.tags : ['tech'],
                url: raw.eventUrl,
                source,
                sourceId: raw.id,
                isFree: raw.priceRange ? /free/i.test(raw.priceRange) : undefined,
                price: raw.priceRange,
                category: mapCategory(raw.format),
            };
        }

        case 'meetup': {
            // meetup actor item: { title, eventUrl, type, description, dateTime, venue, group, feeSettings, featuredEventPhoto }
            return {
                title: raw.title,
                description: (raw.description ?? '').slice(0, 1000),
                image: raw.featuredEventPhoto?.source ?? '',
                venue: raw.venue?.name ?? '',
                country: raw.venue?.country ?? DEFAULT_COUNTRY,
                city: raw.venue?.city ?? raw.group?.city ?? DEFAULT_CITY,
                date: normalizeDate(raw.dateTime),
                time: normalizeTime(raw.dateTime),
                timezone: raw.group?.timezone ?? DEFAULT_TZ,
                mode: raw.type === 'ONLINE' ? 'online' : 'offline',
                organizer: raw.group?.name ?? 'Meetup',
                tags: ['tech'],
                url: raw.eventUrl,
                source,
                sourceId: raw.id,
                isFree: raw.feeSettings == null,
            };
        }

        case 'mlh':
        case 'company': {
            // Playwright/fetch-scraped pages: the scraper provides a pre-shaped object
            return {
                title: raw.title,
                description: (raw.description ?? '').slice(0, 1000),
                image: raw.image ?? '',
                venue: raw.venue ?? '',
                country: raw.country ?? DEFAULT_COUNTRY,
                city: raw.city ?? DEFAULT_CITY,
                date: normalizeDate(raw.date),
                time: raw.time ? normalizeTime(raw.time) : '09:00',
                endDate: raw.endDate ? normalizeDate(raw.endDate) : undefined,
                timezone: raw.timezone ?? DEFAULT_TZ,
                mode: inferMode(raw.venue, raw.isOnline),
                organizer: raw.organizer ?? (source === 'mlh' ? 'MLH' : 'Company'),
                tags: raw.tags?.length ? raw.tags : ['tech'],
                url: raw.url,
                source,
                category: source === 'mlh' ? 'hackathon' : mapCategory(raw.category),
            };
        }
    }
}

function mapCategory(v?: string): CanonicalEvent['category'] {
    const s = (v ?? '').toLowerCase();
    if (/hack/.test(s)) return 'hackathon';
    if (/meet/.test(s)) return 'meetup';
    if (/conf|summit|expo/.test(s)) return 'conference';
    if (/network|social|mixer/.test(s)) return 'networking';
    return undefined;
}
