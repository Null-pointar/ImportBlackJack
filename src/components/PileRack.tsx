import "./PileRack.css";

type PileRackProps = {
  /** 自分の山札に残っているカードの値（重複あり） */
  pile: number[];
  /** 21 までの残り。これを超える値は選べない */
  roomLeft: number;
  selected: number | null;
  onSelect: (value: number | null) => void;
};

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/**
 * 山札19枚を並べる代わりに、値ごとの残数を出す。
 * 重複を目で数える必要がなくなり、狭い画面にも収まる。
 */
export default function PileRack({
  pile,
  roomLeft,
  selected,
  onSelect,
}: PileRackProps) {
  const counts = new Map<number, number>();
  for (const value of pile) counts.set(value, (counts.get(value) ?? 0) + 1);

  return (
    <div className="rack">
      {VALUES.map((value) => {
        const left = counts.get(value) ?? 0;
        const disabled = left === 0 || value > roomLeft;
        const isSelected = selected === value;

        return (
          <button
            key={value}
            type="button"
            className="rack-chip"
            disabled={disabled}
            aria-pressed={isSelected}
            data-selected={isSelected ? "true" : undefined}
            onClick={() => onSelect(isSelected ? null : value)}
          >
            <span className="rack-value">{value}</span>
            <span className="rack-left">{left > 0 ? `×${left}` : "gone"}</span>
          </button>
        );
      })}
    </div>
  );
}
