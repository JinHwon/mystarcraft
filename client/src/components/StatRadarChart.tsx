import { STAT_KEYS, STAT_LABELS, type StatKey } from "@shared/gameConstants";

interface StatRadarChartProps {
  stats: Record<StatKey, number>;
  grade: string;
  gradeColor?: string;
  size?: number;
  /** 능력치 최대값 (커리어 모드는 1000) */
  maxValue?: number;
}

export function StatRadarChart({
  stats,
  grade,
  gradeColor = "#4A9EFF",
  size = 240,
  maxValue = 1000,
}: StatRadarChartProps) {
  const statColors: Record<StatKey, string> = {
    sense: "#4A9EFF",
    control: "#34D399",
    attack: "#F87171",
    harass: "#FBBF24",
    strategy: "#A78BFA",
    supply: "#FB923C",
    defense: "#60A5FA",
    scout: "#F472B6",
  };

  // SVG 중심 - 라벨 공간을 포함한 전체 크기
  const padding = 60; // 라벨을 위한 여백
  const svgSize = size + padding * 2;
  const center = svgSize / 2;
  const radius = size / 2 - 10;

  // 8각형 포인트 계산
  const angleSlice = (Math.PI * 2) / STAT_KEYS.length;
  const points = STAT_KEYS.map((_, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const x = center + radius * Math.cos(angle);
    const y = center + radius * Math.sin(angle);
    return { x, y, angle };
  });

  // 능력치 값을 좌표로 변환
  const statPoints = STAT_KEYS.map((key, i) => {
    const value = stats[key];
    const ratio = Math.min(value / maxValue, 1);
    const angle = angleSlice * i - Math.PI / 2;
    const r = radius * ratio;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  });

  // 배경 그리드 (5단계)
  const gridLevels = 5;
  const gridPoints = Array.from({ length: gridLevels }).map((_, level) => {
    const ratio = (level + 1) / gridLevels;
    const r = radius * ratio;
    return STAT_KEYS.map((_, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const x = center + r * Math.cos(angle);
      const y = center + r * Math.sin(angle);
      return `${x},${y}`;
    }).join(" ");
  });

  // 라벨 위치 (바깥쪽)
  const labelPoints = STAT_KEYS.map((_, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const labelRadius = radius + 35;
    const x = center + labelRadius * Math.cos(angle);
    const y = center + labelRadius * Math.sin(angle);
    return { x, y };
  });

  return (
    <div className="flex flex-col items-center gap-4">
      <svg width={svgSize} height={svgSize} viewBox={`0 0 ${svgSize} ${svgSize}`} className="drop-shadow-lg">
        {/* 배경 그리드 */}
        {gridPoints.map((points, i) => (
          <polygon
            key={`grid-${i}`}
            points={points}
            fill="none"
            stroke="oklch(0.25 0.02 240 / 0.4)"
            strokeWidth="1"
          />
        ))}

        {/* 축선 */}
        {points.map((point, i) => (
          <line
            key={`axis-${i}`}
            x1={center}
            y1={center}
            x2={point.x}
            y2={point.y}
            stroke="oklch(0.25 0.02 240 / 0.3)"
            strokeWidth="1"
          />
        ))}

        {/* 능력치 다각형 (배경) */}
        <polygon
          points={statPoints.map((p) => `${p.x},${p.y}`).join(" ")}
          fill={`${gradeColor}15`}
          stroke={gradeColor}
          strokeWidth="2"
          opacity="0.8"
        />

        {/* 능력치 포인트 */}
        {statPoints.map((point, i) => (
          <circle
            key={`stat-point-${i}`}
            cx={point.x}
            cy={point.y}
            r="4"
            fill={gradeColor}
            stroke="white"
            strokeWidth="1.5"
          />
        ))}

        {/* 중앙 원 */}
        <circle cx={center} cy={center} r="20" fill={`${gradeColor}20`} stroke={gradeColor} strokeWidth="1.5" />

        {/* 등급 텍스트 (중앙) */}
        <text
          x={center}
          y={center + 3}
          textAnchor="middle"
          fontSize="16"
          fontWeight="bold"
          fill={gradeColor}
          fontFamily="system-ui, -apple-system"
        >
          {grade}
        </text>

        {/* 능력치 라벨 */}
        {STAT_KEYS.map((key, i) => {
          const label = STAT_LABELS[key];
          const value = stats[key];
          const labelPoint = labelPoints[i];
          const color = statColors[key];

          return (
            <g key={`label-${i}`}>
              {/* 라벨 배경 */}
              <rect
                x={labelPoint.x - 24}
                y={labelPoint.y - 16}
                width="48"
                height="28"
                rx="4"
                fill="oklch(0.12 0.02 240 / 0.8)"
                stroke={color}
                strokeWidth="1"
              />
              {/* 라벨 텍스트 */}
              <text
                x={labelPoint.x}
                y={labelPoint.y - 3}
                textAnchor="middle"
                fontSize="10"
                fontWeight="700"
                fill={color}
                fontFamily="system-ui, -apple-system"
              >
                {label}
              </text>
              {/* 값 텍스트 */}
              <text
                x={labelPoint.x}
                y={labelPoint.y + 9}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="oklch(0.8 0.05 240)"
                fontFamily="system-ui, -apple-system"
              >
                {value}
              </text>
            </g>
          );
        })}
      </svg>

      {/* 범례 */}
      <div className="text-xs text-muted-foreground text-center">
        <p>최대 능력치: {maxValue}</p>
      </div>
    </div>
  );
}
