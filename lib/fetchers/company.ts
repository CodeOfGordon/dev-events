/**
 * Company dev-event sources, provider-agnostic: the registry in config.ts maps each
 * company to a generic provider adapter below. Adapters return raw items tagged with
 * _provider/_company so the normalizer can map them; no relevance filter (curated).
 * To support a new events platform, add one adapter — every company on that platform
 * is then a config entry.
 */
import { getJSON } from './util';
import { COMPANY_SOURCES, type CompanySource } from './config';
import { fetchLumaEntries } from './luma';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Provider = (src: any) => Promise<any[]>;

const PROVIDERS: Record<CompanySource['provider'], Provider> = {
    /** Any company Luma calendar (slug or direct calendar_api_id). */
    luma: async (src) => {
        const entries = await fetchLumaEntries({ slug: src.slug, calendarApiId: src.calendarApiId });
        return entries.map((e: any) => ({ ...e, _provider: 'luma', _company: src.company }));
    },

    /** Any WordPress site running "The Events Calendar" — upcoming events by default. */
    tribe: async (src) => {
        const res = await getJSON<{ events: any[] }>(
            `${src.base}/wp-json/tribe/events/v1/events?per_page=50`,
        );
        return (res.events ?? [])
            .filter((ev) => ev?.title && ev.start_date)
            .map((ev) => ({ ...ev, _provider: 'tribe', _company: src.company, _city: src.city }));
    },
};

export async function fetchCompany(): Promise<unknown[]> {
    const results = await Promise.all(
        COMPANY_SOURCES.map(async (src) => {
            try {
                return await PROVIDERS[src.provider](src);
            } catch (e) {
                console.warn(`company: ${src.company} (${src.provider}) skipped — ${(e as Error).message}`);
                return [];
            }
        }),
    );
    return results.flat();
}
