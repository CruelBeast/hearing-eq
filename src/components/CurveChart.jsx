// CurveChart.jsx — SVG correction curve chart

export function CurveChart({ leftData, rightData, labels }) {
  const W = 720, H = 220, PL = 46, PR = 12, PT = 24, PB = 28;
  const iW = W - PL - PR;
  const iH = H - PT - PB;
  const N = labels.length;
  const yMax = 12;

  const xOf = (i)  => PL + (i / (N - 1)) * iW;
  const yOf = (db) => PT + iH * (1 - (db + yMax) / (2 * yMax));

  const linePath = (arr) =>
    arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ');

  const areaPath = (arr) => {
    const top = arr.map((v, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${yOf(v).toFixed(1)}`).join(' ');
    return `${top} L ${xOf(N - 1).toFixed(1)} ${yOf(0).toFixed(1)} L ${xOf(0).toFixed(1)} ${yOf(0).toFixed(1)} Z`;
  };

  const ticks = [-12, -8, -4, 0, 4, 8, 12];

  return (
    <div className="curve-wrap">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="curve-svg"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="lGr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(122,240,167,0.28)" />
            <stop offset="100%" stopColor="rgba(122,240,167,0)" />
          </linearGradient>
          <linearGradient id="rGr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="rgba(245,144,100,0.28)" />
            <stop offset="100%" stopColor="rgba(245,144,100,0)" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {ticks.map((v) => (
          <g key={v}>
            <line
              x1={PL} x2={W - PR} y1={yOf(v)} y2={yOf(v)}
              stroke={v === 0 ? 'var(--chart-grid-strong)' : 'var(--chart-grid)'}
              strokeWidth={v === 0 ? 1 : 0.5}
              strokeDasharray={v === 0 ? '' : '2 4'}
            />
            <text
              x={PL - 5} y={yOf(v) + 3.5}
              textAnchor="end"
              fill="var(--chart-label)"
              fontSize="9"
              fontFamily="JetBrains Mono, monospace"
            >
              {v > 0 ? `+${v}` : v}
            </text>
          </g>
        ))}

        {/* Frequency labels */}
        {labels.map((lb, i) => (
          <text
            key={i}
            x={xOf(i)} y={H - 8}
            textAnchor="middle"
            fill="var(--chart-label)"
            fontSize="9"
            fontFamily="JetBrains Mono, monospace"
          >
            {lb}
          </text>
        ))}

        {/* Area fills */}
        <path d={areaPath(leftData)}  fill="url(#lGr)" />
        <path d={areaPath(rightData)} fill="url(#rGr)" />

        {/* Lines */}
        <path d={linePath(leftData)}  fill="none" stroke="oklch(0.84 0.18 145)" strokeWidth="1.8" />
        <path d={linePath(rightData)} fill="none" stroke="oklch(0.78 0.13 45)"  strokeWidth="1.8" />

        {/* Dots */}
        {leftData.map((v, i) => (
          <circle key={`l${i}`} cx={xOf(i)} cy={yOf(v)} r="3.5" fill="oklch(0.84 0.18 145)" />
        ))}
        {rightData.map((v, i) => (
          <circle key={`r${i}`} cx={xOf(i)} cy={yOf(v)} r="3.5" fill="oklch(0.78 0.13 45)" />
        ))}

        <text
          x={PL - 6} y="11"
          textAnchor="end"
          fill="var(--chart-label)"
          fontSize="9"
          fontFamily="JetBrains Mono, monospace"
        >
          dB gain
        </text>
      </svg>
    </div>
  );
}
