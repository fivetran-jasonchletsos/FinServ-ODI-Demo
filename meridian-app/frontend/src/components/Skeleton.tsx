// Animated placeholder bars/blocks shown while data is downloading.

export function SkeletonBlock({
  className = '',
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return <div className={`animate-pulse rounded bg-slate-200 ${className}`} style={style} />;
}

export function LoadingBanner({ label, detail }: { label: string; detail?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 flex items-center gap-3">
      <div className="h-2 w-2 rounded-full bg-brand-500 animate-pulse" />
      <div className="flex-1">
        <div className="text-sm font-medium text-slate-700">{label}</div>
        {detail && <div className="text-xs text-slate-500">{detail}</div>}
      </div>
    </div>
  );
}

export function PanelSkeleton({ title, height = 200 }: { title?: string; height?: number }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-5">
      {title && (
        <div className="mb-3">
          <div className="text-sm font-semibold text-slate-300">{title}</div>
          <SkeletonBlock className="h-3 w-1/3 mt-1" />
        </div>
      )}
      <SkeletonBlock className="w-full" style={{ height }} />
    </section>
  );
}

export function KPISkeleton({ primary }: { primary?: boolean }) {
  return (
    <div className={`rounded-lg p-4 border ${primary ? 'bg-brand-100 border-brand-200' : 'bg-white border-slate-200'}`}>
      <SkeletonBlock className="h-2 w-16" />
      <SkeletonBlock className="h-6 w-24 mt-2" />
      <SkeletonBlock className="h-2 w-20 mt-1.5" />
    </div>
  );
}
