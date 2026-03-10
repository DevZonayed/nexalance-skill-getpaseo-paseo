import Svg, { Rect, Line } from "react-native-svg";

interface SourceControlPanelIconProps {
  size?: number;
  color?: string;
}

export function SourceControlPanelIcon({
  size = 16,
  color = "currentColor",
}: SourceControlPanelIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x={3}
        y={3}
        width={18}
        height={18}
        rx={2}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Plus */}
      <Line x1={9} y1={9.5} x2={15} y2={9.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Line x1={12} y1={6.5} x2={12} y2={12.5} stroke={color} strokeWidth={2} strokeLinecap="round" />
      {/* Minus */}
      <Line x1={9} y1={16} x2={15} y2={16} stroke={color} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
