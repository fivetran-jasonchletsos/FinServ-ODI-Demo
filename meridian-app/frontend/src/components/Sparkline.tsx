interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  stroke?: string;
  fill?: string;
  className?: string;
  strokeWidth?: number;
}

export default function Sparkline({
  values,
  width = 80,
  height = 24,
  stroke = 'currentColor',
  fill = 'none',
  className,
  strokeWidth = 1.5,
}: SparklineProps) {
  if (!values || values.length < 2) {
    return <svg width={width} height={height} className={className} aria-hidden />;
  }

  const padX = 1;
  const padY = 2;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = innerW / (values.length - 1);

  const points = values.map((v, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - (v - min) / span) * innerH;
    return [x, y] as const;
  });

  const polyline = points.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const baseY = padY + innerH;
  const areaPath = `${polyline} ${points[points.length - 1][0].toFixed(2)},${baseY.toFixed(2)} ${points[0][0].toFixed(2)},${baseY.toFixed(2)}`;
  const [lastX, lastY] = points[points.length - 1];

  const showFill = fill && fill !== 'none';

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      aria-hidden
      style={{ color: stroke }}
    >
      {showFill && (
        <polygon points={areaPath} fill={fill} opacity={0.15} />
      )}
      <polyline
        points={polyline}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={lastX} cy={lastY} r={strokeWidth + 0.5} fill={stroke} />
    </svg>
  );
}
