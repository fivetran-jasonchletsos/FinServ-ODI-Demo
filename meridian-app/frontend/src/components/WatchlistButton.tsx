import { useEffect, useState } from 'react';
import * as watchlist from '../watchlist';

export default function WatchlistButton({ cik }: { cik: string }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => watchlist.subscribe((ids) => setSaved(ids.includes(cik))), [cik]);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        watchlist.toggle(cik);
      }}
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-xs font-semibold uppercase tracking-wider transition-colors border ${
        saved
          ? 'bg-[var(--gold)] text-[var(--navy-deep)] border-[var(--gold)] hover:bg-[var(--gold-bright)]'
          : 'bg-white/10 hover:bg-white/20 text-white border-white/20'
      }`}
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
        <path d="M12 17.27 18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
      </svg>
      {saved ? 'Watching' : 'Add to watchlist'}
    </button>
  );
}
