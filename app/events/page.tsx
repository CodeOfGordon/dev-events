import type { Metadata } from 'next';
import Link from 'next/link';
import EventGrid from '@/components/EventGrid';
import EmptyState from '@/components/EmptyState';
import FilterBar from '@/components/FilterBar';
import SearchBox from '@/components/SearchBox';
import Pagination from '@/components/Pagination';
import CompanyDirectory from '@/components/CompanyDirectory';
import { distinctCities, queryEvents, upcomingCompanies } from '@/lib/events';
import { cn } from '@/lib/utils';

export const metadata: Metadata = {
    title: 'All events — DevEvents',
    description:
        'Filter and search official company dev events, hackathons and community tech events across Canada & the U.S.',
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

type Lane = 'all' | 'company' | 'hackathon' | 'local';

const LANE_TABS: { key: Lane; label: string; href: string }[] = [
    { key: 'all', label: 'All', href: '/events' },
    { key: 'company', label: 'Companies', href: '/events?source=company' },
    { key: 'hackathon', label: 'Hackathons', href: '/events?category=hackathon' },
    { key: 'local', label: 'Local', href: '/events?source=local' },
];

const LANE_META: Record<Lane, { title: string; subtitle: string }> = {
    all: { title: 'All events', subtitle: 'Everything we track across North America' },
    company: { title: 'Company events', subtitle: 'Official dev events from the companies we track' },
    hackathon: { title: 'Hackathons', subtitle: 'MLH, NVIDIA and community hackathons — in person or online' },
    local: { title: 'Local events', subtitle: 'Community meetups & events from Luma, Eventbrite and Meetup' },
};

function laneFrom(source?: string, category?: string): Lane {
    if (source === 'company') return 'company';
    if (category === 'hackathon' || source === 'mlh') return 'hackathon';
    if (source === 'local') return 'local';
    return 'all';
}

const EventsPage = async ({ searchParams }: { searchParams: Promise<SearchParams> }) => {
    const sp = await searchParams; // Next 16: searchParams is a Promise

    const source = first(sp.source);
    const category = first(sp.category);
    const region = first(sp.region);
    const organizer = first(sp.organizer);
    const lane = laneFrom(source, category);

    const [result, cities, companyRows] = await Promise.all([
        queryEvents({
            q: first(sp.q),
            city: first(sp.city),
            mode: first(sp.mode),
            category,
            source,
            organizer,
            region,
            price: first(sp.price),
            from: first(sp.from),
            to: first(sp.to),
            tag: first(sp.tag),
            page: Number(first(sp.page)) || 1,
        }),
        distinctCities(region),
        upcomingCompanies(),
    ]);

    const companies = companyRows.map((c) => c.name);
    const counts = Object.fromEntries(companyRows.map((c) => [c.name, c.count]));

    // Plain string map for Pagination links (preserves active filters)
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(sp)) {
        const val = first(v);
        if (val) flat[k] = val;
    }

    const meta = LANE_META[lane];

    return (
        <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                    <h1 className="text-4xl max-sm:text-3xl">{meta.title}</h1>
                    <p className="text-light-200 mt-2 text-sm">
                        {result.total} upcoming event{result.total === 1 ? '' : 's'}
                        {organizer ? ` from ${organizer}` : ''}
                        {first(sp.q) ? ` for “${first(sp.q)}”` : ` · ${meta.subtitle}`}
                    </p>
                </div>
                <SearchBox />
            </div>

            {/* Lane tabs — structure comes from which lane you're in, not the filters */}
            <nav className="flex flex-wrap gap-2">
                {LANE_TABS.map(({ key, label, href }) => (
                    <Link
                        key={key}
                        href={href}
                        className={cn(
                            'rounded-full border px-4 py-1.5 text-sm font-medium transition',
                            lane === key
                                ? 'border-primary bg-primary/10 text-primary'
                                : 'border-dark-200 text-light-200 hover:border-primary/50 hover:text-light-100',
                        )}
                    >
                        {label}
                    </Link>
                ))}
            </nav>

            {lane === 'company' && <CompanyDirectory counts={counts} active={organizer} />}

            <FilterBar cities={cities} companies={companies} />

            {result.items.length ? (
                <>
                    <EventGrid events={result.items} />
                    <Pagination page={result.page} total={result.total} limit={result.limit} searchParams={flat} />
                </>
            ) : (
                <EmptyState />
            )}
        </section>
    );
};

export default EventsPage;
