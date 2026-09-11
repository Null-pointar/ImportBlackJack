import "./Card.css";

type CardProps = {
  /** null = 自分には見えないカード（裏向きで描画される） */
  value: number | null;
  /** 自分の札のうち、相手に見られているもの */
  seen?: boolean;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
};

export default function Card({
  value,
  seen,
  selectable,
  selected,
  onClick,
}: CardProps) {
  const faceDown = value === null;

  return (
    <button
      type="button"
      className="card"
      disabled={!onClick}
      aria-label={faceDown ? "Face-down card" : `Card of ${value}`}
      aria-pressed={onClick ? Boolean(selected) : undefined}
      data-selectable={selectable ? "true" : undefined}
      data-selected={selected ? "true" : undefined}
      onClick={onClick}
    >
      <span className="card-inner" data-face={faceDown ? "back" : "front"}>
        <span className="card-face card-front">
          <span className="card-corner">{value}</span>
          <span className="card-pip">{value}</span>
          {seen && <span className="card-seen" title="Your opponent has seen this card" />}
        </span>
        <span className="card-face card-back" />
      </span>
    </button>
  );
}
