import type { CSSProperties } from "react";

/**
 * First paint before the session is known: a coach hits a padel ball with the
 * racket and it lands in a half-full basket. Vector + CSS only, no assets.
 */
// Just off the racket face at impact, so the ball is visible the moment it appears.
const IMPACT = { x: 84, y: 26 };
const TARGET = { x: 126, y: 67 };

const BASKET_BALLS = [
  { cx: 96, cy: 83 },
  { cx: 116, cy: 83 },
  { cx: 136, cy: 83 },
  { cx: 106, cy: 67 },
];

const flyingBallStyle = {
  fill: "var(--ball)",
  stroke: "var(--court)",
  "--dx": `${IMPACT.x - TARGET.x}px`,
  "--dy": `${IMPACT.y - TARGET.y}px`,
} as CSSProperties;

const ink = { fill: "var(--foreground)", stroke: "var(--foreground)" } as CSSProperties;

export function LoadingScreen() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 bg-background">
      <svg aria-hidden viewBox="0 0 180 112" className="h-32 w-auto">
        <ellipse cx="41" cy="97" rx="19" ry="3" style={{ ...ink, opacity: 0.1 }} />
        <ellipse cx="118" cy="97" rx="42" ry="3" style={{ ...ink, opacity: 0.08 }} />

        {BASKET_BALLS.map((ball) => (
          <circle
            key={`${ball.cx}-${ball.cy}`}
            cx={ball.cx}
            cy={ball.cy}
            r="8"
            strokeWidth="1.5"
            style={{ fill: "var(--ball)", stroke: "var(--court)" }}
          />
        ))}

        <circle
          className="flying-ball"
          cx={TARGET.x}
          cy={TARGET.y}
          r="8"
          strokeWidth="1.5"
          style={flyingBallStyle}
        />

        {/* The wire basket is drawn on top, so the balls read as being inside it. */}
        <g strokeWidth="1" opacity="0.32" style={{ stroke: "var(--court)" }}>
          <path d="M76.3 62H161.7" />
          <path d="M78.5 70H159.5" />
          <path d="M80.2 78H157.8" />
          <path d="M81.7 86H156.3" />
          <path d="M86.5 52L88.1 93" />
          <path d="M98.8 52L98.6 93" />
          <path d="M111.1 52L109.1 93" />
          <path d="M123.4 52L119.7 93" />
          <path d="M135.7 52L130.2 93" />
        </g>
        <path
          d="M74 52H164L154 89Q152 93 148 93H90Q86 93 84 89Z"
          fill="none"
          strokeWidth="3"
          strokeLinejoin="round"
          style={{ stroke: "var(--court)" }}
        />

        {/* The coach. Only the racket swings. */}
        <g strokeLinecap="round" strokeLinejoin="round">
          <path d="M36 72L34 82L34 88" stroke="#a9714d" strokeWidth="6.4" fill="none" />
          <path d="M44 72L46 82L46 88" stroke="#c98d63" strokeWidth="6.4" fill="none" />
          <path d="M34 88v4" stroke="#fbf8ef" strokeWidth="6.4" fill="none" />
          <path d="M46 88v4" stroke="#fbf8ef" strokeWidth="6.4" fill="none" />
          <path d="M30 91h6q4 0 4 2.6T36 96h-9q-1 0-1-1.6T30 91z" stroke="none" style={ink} />
          <path d="M42 91h6q4 0 4 2.6T48 96h-9q-1 0-1-1.6T42 91z" stroke="none" style={ink} />
          <path d="M31 62h18l1 10h-6l-1-4-2 4h-6l-1-4-1 4h-6z" stroke="none" style={ink} />
          <path
            d="M29 43q0-2 3-2h17q4 0 4 3l-1 18H31z"
            stroke="none"
            style={{ fill: "var(--court)" }}
          />
          <path d="M31 45h4v16" stroke="#286044" strokeWidth="2" fill="none" opacity="0.55" />
          <path d="M40 42l2 3-2 3-2-3z" stroke="none" style={{ fill: "var(--card)" }} />

          {/* Resting arm. */}
          <circle cx="31" cy="45" r="4.6" stroke="none" style={{ fill: "var(--court)" }} />
          <path d="M31 46l-5 8-2 8" stroke="#c98d63" strokeWidth="5.2" fill="none" />
          <circle cx="23.5" cy="63" r="2.9" stroke="none" fill="#c98d63" />

          {/* Head, cap and face. */}
          <path d="M39 35h4v8h-4z" stroke="none" fill="#c98d63" />
          <circle cx="41" cy="28" r="8.8" stroke="none" fill="#c98d63" />
          <circle cx="32.4" cy="28.5" r="1.8" stroke="none" fill="#a9714d" />
          <path d="M32.2 28a8.8 8.8 0 0 1 17.6 0z" stroke="none" style={ink} />
          <path d="M49.8 28h8.4q0 3.2-4.2 3.2h-4.2z" stroke="none" style={ink} />
          <path
            d="M43.6 28.4h3"
            style={{ stroke: "var(--foreground)" }}
            strokeWidth="1.2"
            opacity="0.75"
          />
          <circle cx="45.4" cy="30.2" r="1.15" stroke="none" style={ink} />

          {/* Hitting arm with the racket; the racket is the animated piece. */}
          <circle cx="51" cy="45" r="4.6" stroke="none" style={{ fill: "var(--court)" }} />
          <path d="M51 45l5 2.5 6-3.2" stroke="#c98d63" strokeWidth="5" fill="none" />
          <circle cx="62.5" cy="44" r="2.9" stroke="none" fill="#c98d63" />
          <g className="racket-swing">
            <path d="M62.5 44L66 36" strokeWidth="2.6" style={{ stroke: "var(--foreground)" }} />
            <ellipse
              cx="68"
              cy="30"
              rx="5.4"
              ry="7.4"
              strokeWidth="1.8"
              style={{ fill: "var(--card)", stroke: "var(--court)" }}
            />
            <path d="M66 37l3-2" strokeWidth="1.4" style={{ stroke: "var(--court)" }} />
            <g stroke="none" style={{ fill: "var(--court)" }}>
              <circle cx="67" cy="27" r="0.9" />
              <circle cx="69.5" cy="31" r="0.9" />
              <circle cx="65" cy="31.5" r="0.9" />
              <circle cx="67.5" cy="34" r="0.9" />
            </g>
          </g>
        </g>
      </svg>
      <p
        role="status"
        className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground"
      >
        Cargando…
      </p>
    </div>
  );
}
