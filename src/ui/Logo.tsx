/** The layered fin: a fin built up from printed layers, standing on the bed. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="SideFin logo">
      <path d="M8 50 L56 50" stroke="var(--fg)" strokeWidth="4" strokeLinecap="round" />
      <path d="M14 46 C22 40 30 22 44 10 C42 24 44 36 52 46 Z" fill="var(--accent)" />
      <path d="M20 40 L46 40 M25 33 L44 33 M31 26 L44 26 M37 19 L44 19" stroke="var(--surface)" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}
