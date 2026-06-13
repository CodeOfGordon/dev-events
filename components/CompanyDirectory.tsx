import Link from 'next/link';
import { COMPANY_DIRECTORY, INDUSTRY_ORDER } from '@/lib/fetchers/config';
import { cn } from '@/lib/utils';

interface Props {
    /** organizer name -> upcoming event count. */
    counts: Record<string, number>;
    /** currently-filtered organizer, if any. */
    active?: string;
}

/**
 * The companies we track, grouped by industry — doubles as the company filter.
 * Companies with no current events stay listed (dimmed) so it's clear what the
 * feed covers, not just what happens to be live today.
 */
const CompanyDirectory = ({ counts, active }: Props) => (
    <div className="bg-dark-100/40 border-dark-200 flex flex-col gap-4 rounded-xl border p-5">
        <div className="flex items-center justify-between gap-3">
            <p className="text-light-100 text-sm font-semibold">
                {COMPANY_DIRECTORY.length} companies tracked
            </p>
            {active && (
                <Link href="/events?source=company" className="text-primary text-xs font-semibold hover:underline">
                    Clear company filter
                </Link>
            )}
        </div>

        {INDUSTRY_ORDER.map((industry) => {
            const companies = COMPANY_DIRECTORY.filter((c) => c.industry === industry);
            if (!companies.length) return null;
            return (
                <div key={industry} className="flex flex-col gap-2">
                    <h3 className="text-light-200 text-[11px] font-semibold uppercase tracking-wider">{industry}</h3>
                    <div className="flex flex-wrap gap-2">
                        {companies.map(({ name }) => {
                            const count = counts[name] ?? 0;
                            const isActive = active === name;
                            return (
                                <Link
                                    key={name}
                                    href={`/events?source=company&organizer=${encodeURIComponent(name)}`}
                                    className={cn(
                                        'pill transition',
                                        isActive
                                            ? 'border-primary text-primary'
                                            : count
                                              ? 'hover:border-primary/60 hover:text-primary'
                                              : 'opacity-40',
                                    )}
                                >
                                    {name}
                                    {count > 0 && <span className="text-light-200"> · {count}</span>}
                                </Link>
                            );
                        })}
                    </div>
                </div>
            );
        })}
    </div>
);

export default CompanyDirectory;
