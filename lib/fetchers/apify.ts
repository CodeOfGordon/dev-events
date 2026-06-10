/**
 * Minimal Apify REST client: start run → poll until terminal → fetch dataset items.
 * Token via Authorization header only (never ?token=, it leaks into logs).
 */

const BASE = 'https://api.apify.com/v2';
const TERMINAL = new Set(['SUCCEEDED', 'FAILED', 'ABORTED', 'TIMED-OUT']);

type ApifyRun = { id: string; status: string; statusMessage?: string; defaultDatasetId: string };

function headers(): Record<string, string> {
    const token = process.env.APIFY_TOKEN;
    if (!token) throw new Error('APIFY_TOKEN is not set');
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export async function runActor(actor: string, input: unknown, timeoutMs = 240_000): Promise<unknown[]> {
    const h = headers();
    const started = await fetch(`${BASE}/acts/${actor.replace('/', '~')}/runs?waitForFinish=60`, {
        method: 'POST',
        headers: h,
        body: JSON.stringify(input),
    });
    if (!started.ok) {
        throw new Error(`Apify start failed for ${actor}: ${started.status} ${await started.text()}`);
    }
    let run = ((await started.json()) as { data: ApifyRun }).data;

    const deadline = Date.now() + timeoutMs;
    while (!TERMINAL.has(run.status)) {
        if (Date.now() > deadline) throw new Error(`Apify run ${run.id} (${actor}) timed out after ${timeoutMs}ms`);
        const res = await fetch(`${BASE}/actor-runs/${run.id}?waitForFinish=60`, { headers: h });
        if (!res.ok) throw new Error(`Apify poll failed for run ${run.id}: ${res.status}`);
        run = ((await res.json()) as { data: ApifyRun }).data;
    }
    if (run.status !== 'SUCCEEDED') {
        throw new Error(`Apify run ${run.id} (${actor}) ended ${run.status}: ${run.statusMessage ?? ''}`);
    }

    const items = await fetch(`${BASE}/datasets/${run.defaultDatasetId}/items?clean=true&format=json`, {
        headers: h,
    });
    if (!items.ok) throw new Error(`Apify dataset fetch failed for run ${run.id}: ${items.status}`);
    return items.json() as Promise<unknown[]>;
}
