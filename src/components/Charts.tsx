import { useEffect, useRef, useState } from "react";
import { fmtScore, formatDate } from "../hooks";

interface Point {
  date: string;
  score20: number;
  quizTitle: string;
}

/** Courbe d'évolution des notes /20 — série unique, survol avec repère vertical et infobulle. */
export function ScoreChart({ points, height = 220 }: { points: Point[]; height?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(240, e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);

  const pad = { top: 14, right: 14, bottom: 26, left: 30 };
  const w = width - pad.left - pad.right;
  const h = height - pad.top - pad.bottom;
  const x = (i: number) => pad.left + (points.length <= 1 ? w / 2 : (i / (points.length - 1)) * w);
  const y = (v: number) => pad.top + h - (v / 20) * h;
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.score20).toFixed(1)}`).join("");
  const area = points.length > 1 ? `${path}L${x(points.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : "";

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - rect.left;
    let best = 0;
    points.forEach((_, i) => {
      if (Math.abs(x(i) - px) < Math.abs(x(best) - px)) best = i;
    });
    setHover(best);
  };

  const hp = hover != null ? points[hover] : null;
  return (
    <div className="chart" ref={ref}>
      <svg
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Évolution des notes sur ${points.length} examens`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="score-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--primary)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 5, 10, 15, 20].map((v) => (
          <g key={v}>
            <line className={v === 10 ? "ref-line" : "grid-line"} x1={pad.left} x2={pad.left + w} y1={y(v)} y2={y(v)} />
            <text className="axis-label" x={pad.left - 8} y={y(v) + 4} textAnchor="end">
              {v}
            </text>
          </g>
        ))}
        {points.length > 0 && (
          <>
            <text className="axis-label" x={x(0)} y={height - 6} textAnchor={points.length > 1 ? "start" : "middle"}>
              {formatDate(points[0].date)}
            </text>
            {points.length > 1 && (
              <text className="axis-label" x={x(points.length - 1)} y={height - 6} textAnchor="end">
                {formatDate(points[points.length - 1].date)}
              </text>
            )}
          </>
        )}
        {area && <path d={area} fill="url(#score-fill)" />}
        <path d={path} fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={pad.top} y2={pad.top + h} stroke="var(--border-strong)" strokeWidth={1} />}
        {points.map((p, i) =>
          points.length <= 16 || i === hover || i === points.length - 1 ? (
            <circle key={i} cx={x(i)} cy={y(p.score20)} r={i === hover ? 5.5 : 4} fill="var(--primary)" stroke="var(--surface)" strokeWidth={2} />
          ) : null,
        )}
      </svg>
      {hp && hover != null && (
        <div className="tooltip" style={{ left: x(hover), top: y(hp.score20) }}>
          <b>{fmtScore(hp.score20)}</b>/20 · {formatDate(hp.date, true)}
          <div style={{ opacity: 0.7, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}>{hp.quizTitle}</div>
        </div>
      )}
    </div>
  );
}

/** Anneau de score. */
export function ScoreRing({ score20, size = 168 }: { score20: number; size?: number }) {
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(score20));
    return () => cancelAnimationFrame(t);
  }, [score20]);
  const color = score20 >= 14 ? "var(--good)" : score20 >= 10 ? "var(--warn)" : "var(--bad)";
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (shown / 20) * c}
          style={{ transition: "stroke-dashoffset 1s cubic-bezier(.2,.7,.2,1)" }}
        />
      </svg>
      <div className="ring-label">
        <div>
          <div className="ring-value">{fmtScore(score20)}</div>
          <div className="ring-sub">sur 20</div>
        </div>
      </div>
    </div>
  );
}
