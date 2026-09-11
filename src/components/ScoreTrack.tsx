import "./ScoreTrack.css";
import { TARGET } from "../game/engine";
import type { HandRange } from "../game/range";

type ScoreTrackProps = {
  range: HandRange;
  tone: "you" | "opponent";
};

const pct = (n: number) => `${Math.min(100, Math.max(0, (n / TARGET) * 100))}%`;

/**
 * 0→21 のトラック。相手の合計は確定値が送られてこないので、
 * 「確実に届いている下限」と「ありうる幅」を塗り分けて見せる。
 */
export default function ScoreTrack({ range, tone }: ScoreTrackProps) {
  const bust = range.exact && range.known > TARGET;

  return (
    <div className="track" data-tone={tone} data-bust={bust ? "true" : undefined}>
      <div className="track-bar">
        <div className="track-floor" style={{ width: pct(range.min) }} />
        <div className="track-known" style={{ width: pct(range.known) }} />
        {!range.exact && (
          <div
            className="track-band"
            style={{ left: pct(range.min), width: pct(range.max - range.min) }}
          />
        )}
      </div>

      <div className="track-readout">
        <span className="track-number">
          {range.exact ? range.known : `${range.min}–${range.max}`}
        </span>
        <span className="track-note">
          {bust
            ? "over 21"
            : range.exact
              ? null
              : `${range.hidden} hidden`}
        </span>
      </div>
    </div>
  );
}
