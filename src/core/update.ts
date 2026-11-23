// Tells an open page that a newer SideFin is online. GitHub Pages serves
// version.json next to the app; the page checks it on start and every hour.

/** True when version a is newer than b. Pre-release tags such as -dev.3 count up too. */
export function isNewer(a: string, b: string): boolean {
  const parse = (v: string) => {
    const [main, pre = ''] = v.split('-');
    return { nums: main.split('.').map(Number), pre };
  };
  const x = parse(a);
  const y = parse(b);
  for (let i = 0; i < 3; i++) if ((x.nums[i] ?? 0) !== (y.nums[i] ?? 0)) return (x.nums[i] ?? 0) > (y.nums[i] ?? 0);
  if (x.pre === y.pre) return false;
  if (!x.pre) return true; // 0.2.0 is newer than 0.2.0-dev.4
  if (!y.pre) return false;
  const nx = Number(x.pre.split('.').pop());
  const ny = Number(y.pre.split('.').pop());
  return !isNaN(nx) && !isNaN(ny) ? nx > ny : x.pre > y.pre;
}

export async function onlineVersion(base: string): Promise<string | undefined> {
  try {
    const r = await fetch(`${base}version.json`, { cache: 'no-store' });
    if (!r.ok) return undefined;
    return (await r.json()).version;
  } catch {
    return undefined;
  }
}
