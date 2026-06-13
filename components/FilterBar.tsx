'use client';

import { useCallback } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import posthog from 'posthog-js';
import { CATEGORY_LABELS, DATE_PRESETS, MODE_LABELS, REGION_LABELS } from '@/lib/constants';

/** Resolve a date-preset key to a from/to range (Toronto-local today). */
function presetRange(preset: string): { from?: string; to?: string } {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(new Date());
    const plus = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
    if (preset === 'today') return { from: today, to: today };
    if (preset === 'week') return { from: today, to: plus(7) };
    if (preset === 'month') return { from: today, to: plus(31) };
    return {};
}

function currentPreset(sp: URLSearchParams): string {
    const from = sp.get('from');
    const to = sp.get('to');
    if (!from || !to) return '';
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
    if (days === 0) return 'today';
    if (days <= 7) return 'week';
    return 'month';
}

const SELECT_CLS =
    'bg-dark-100 border-dark-200 text-light-100 cursor-pointer rounded-lg border px-3 py-2 text-sm focus:border-primary focus:outline-none';

type Lane = 'all' | 'company' | 'hackathon' | 'local';

interface Props {
    /** Distinct cities for the current region scope (data-driven). */
    cities: string[];
    /** Company names that currently have upcoming events (company lane). */
    companies: string[];
}

/**
 * Contextual filter bar — only shows the filters that matter for the active lane,
 * so the page's structure comes from the lane you picked, not one giant filter set.
 */
const FilterBar = ({ cities, companies }: Props) => {
    const router = useRouter();
    const pathname = usePathname();
    const sp = useSearchParams();

    const apply = useCallback(
        (updates: Record<string, string>) => {
            const next = new URLSearchParams(sp.toString());
            for (const [key, value] of Object.entries(updates)) {
                if (value) next.set(key, value);
                else next.delete(key);
            }
            next.delete('page'); // any filter change restarts pagination
            posthog.capture('filter_applied', updates);
            router.push(`${pathname}?${next.toString()}`);
        },
        [router, pathname, sp],
    );

    const select = (
        name: string,
        label: string,
        options: [string, string][],
        value: string,
        onChange?: (v: string) => void,
    ) => (
        <label className="flex flex-col gap-1">
            <span className="text-light-200 text-xs font-semibold uppercase tracking-wider">{label}</span>
            <select
                className={SELECT_CLS}
                value={value}
                onChange={(e) => (onChange ? onChange(e.target.value) : apply({ [name]: e.target.value }))}
            >
                {options.map(([v, l]) => (
                    <option key={v || 'any'} value={v}>{l}</option>
                ))}
            </select>
        </label>
    );

    const lane: Lane =
        sp.get('source') === 'company'
            ? 'company'
            : sp.get('category') === 'hackathon' || sp.get('source') === 'mlh'
              ? 'hackathon'
              : sp.get('source') === 'local'
                ? 'local'
                : 'all';

    const cityOpts = cities.map((c): [string, string] => [c, c]);
    const companyOpts = companies.map((c): [string, string] => [c, c]);
    const hasFilters = ['region', 'category', 'city', 'mode', 'price', 'organizer', 'from', 'to', 'q'].some((k) =>
        sp.get(k),
    );

    return (
        <div className="bg-dark-100/40 border-dark-200 flex flex-wrap items-end gap-3 rounded-xl border p-4">
            {/* Region resets city — a Toronto pick is meaningless once you switch to the US. */}
            {select(
                'region',
                'Region',
                [['', 'All of N. America'], ...Object.entries(REGION_LABELS)],
                sp.get('region') ?? '',
                (value) => apply({ region: value, city: '' }),
            )}

            {lane === 'company' && companyOpts.length > 0 &&
                select('organizer', 'Company', [['', 'All companies'], ...companyOpts], sp.get('organizer') ?? '')}

            {lane !== 'company' && lane !== 'hackathon' && cityOpts.length > 0 &&
                select('city', 'City', [['', 'All cities'], ...cityOpts], sp.get('city') ?? '')}

            {(lane === 'all' || lane === 'local') &&
                select('category', 'Type', [['', 'All types'], ...Object.entries(CATEGORY_LABELS)], sp.get('category') ?? '')}

            {select('mode', 'Format', [['', 'Any format'], ...Object.entries(MODE_LABELS)], sp.get('mode') ?? '')}

            {(lane === 'all' || lane === 'local') &&
                select('price', 'Price', [['', 'Any price'], ['free', 'Free'], ['paid', 'Paid']], sp.get('price') ?? '')}

            {select(
                'date',
                'When',
                DATE_PRESETS.map((p): [string, string] => [p.value, p.label]),
                currentPreset(new URLSearchParams(sp.toString())),
                (preset) => {
                    const { from = '', to = '' } = presetRange(preset);
                    apply({ from, to });
                },
            )}

            {hasFilters && (
                <button
                    type="button"
                    onClick={() => {
                        posthog.capture('filter_applied', { cleared: true });
                        // Preserve the active lane when clearing field filters.
                        const lanePart = sp.get('source')
                            ? `?source=${sp.get('source')}`
                            : sp.get('category')
                              ? `?category=${sp.get('category')}`
                              : '';
                        router.push(`${pathname}${lanePart}`);
                    }}
                    className="text-light-200 hover:text-primary cursor-pointer px-2 py-2 text-sm underline-offset-4 hover:underline"
                >
                    Clear all
                </button>
            )}
        </div>
    );
};

export default FilterBar;
