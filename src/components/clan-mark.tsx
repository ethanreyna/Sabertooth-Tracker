/**
 * The clan's mark: two war-axes crossed behind a pair of tusks. Drawn in
 * currentColor so it takes whatever ink it is set in — brown on the
 * noticeboard's parchment, the sidebar's foreground in the tracker.
 */
export function ClanMark({ className, size = 88 }: { className?: string; size?: number }) {
  return (
    <svg
      viewBox="0 0 80 64" width={size} height={size * 0.8} className={className} aria-hidden
      fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"
    >
      {/* hafts, crossed */}
      <path d="M18 58 L60 10" strokeWidth="2.6" />
      <path d="M62 58 L20 10" strokeWidth="2.6" />
      {/* bearded axe-heads, filled like hammered iron */}
      <path d="M55 5 C64 3 73 9 74 20 C69 16 63 17 59 21 L53 14 Z" fill="currentColor" fillOpacity="0.85" strokeWidth="1.4" />
      <path d="M25 5 C16 3 7 9 6 20 C11 16 17 17 21 21 L27 14 Z" fill="currentColor" fillOpacity="0.85" strokeWidth="1.4" />
      {/* grips */}
      <path d="M20 55.5 L24 51" strokeWidth="4.5" />
      <path d="M60 55.5 L56 51" strokeWidth="4.5" />
      {/* the tusks, over the crossing */}
      <path d="M31 50 C27 41 29 32 36 27" strokeWidth="3.4" />
      <path d="M49 50 C53 41 51 32 44 27" strokeWidth="3.4" />
    </svg>
  );
}
