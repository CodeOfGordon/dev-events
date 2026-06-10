import { createHash } from 'crypto';

/**
 * Dedup key: sha256( lower(trim(title)) + '|' + date(YYYY-MM-DD) + '|' + lower(city) ).
 * `time` is intentionally excluded — sources disagree by minutes for the same event.
 * `date` must already be normalized to YYYY-MM-DD (see normalize.ts).
 */
export function buildFingerprint(e: { title: string; date: string; city: string }): string {
    return createHash('sha256')
        .update(`${e.title.trim().toLowerCase()}|${e.date}|${e.city.trim().toLowerCase()}`)
        .digest('hex');
}
