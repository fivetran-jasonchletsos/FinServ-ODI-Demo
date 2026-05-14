import { Link } from 'react-router-dom';

export default function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-24 sm:px-6 lg:px-8 text-center">
      <div className="font-serif text-[7rem] font-semibold leading-none text-[var(--ink-strong)] tabular">
        404
      </div>
      <div className="mt-1 h-[2px] mx-auto w-24" style={{ background: 'var(--gold)' }} />
      <h1 className="mt-6 font-serif text-2xl font-semibold text-[var(--ink-strong)]">
        Page not in this portfolio.
      </h1>
      <p className="mt-3 text-sm text-[var(--ink-muted)]">
        The view you requested isn't part of the Meridian research surface. It may have been moved or
        never published.
      </p>
      <div className="mt-8 flex items-center justify-center gap-3">
        <Link
          to="/"
          className="rounded-sm text-white text-sm font-semibold px-5 py-2.5"
          style={{ background: 'var(--navy-deep)' }}
        >
          Return home
        </Link>
        <Link
          to="/holdings"
          className="rounded-sm border border-[var(--hairline)] bg-white text-[var(--ink)] hover:bg-[var(--paper-deep)] text-sm font-medium px-4 py-2.5"
        >
          Browse holdings
        </Link>
      </div>
    </div>
  );
}
