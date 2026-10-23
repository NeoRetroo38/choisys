import { useMemo } from 'react';
import { View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { toQR } from 'toqr';
import { color } from './theme';

/** Black modules on white, with the 4-module quiet zone scanners need. One path, so it stays light to render. */
export default function QrCode({ value, size }: { value: string; size: number }) {
  const { path, count } = useMemo(() => {
    const modules = toQR(value);
    const side = Math.sqrt(modules.length);
    let d = '';
    for (let i = 0; i < modules.length; i++) if (modules[i]) d += `M${(i % side) + 4} ${Math.floor(i / side) + 4}h1v1h-1z`;
    return { path: d, count: side + 8 };
  }, [value]);
  return <View accessible accessibilityRole="image" accessibilityLabel="Código QR del enlace">
    <Svg width={size} height={size} viewBox={`0 0 ${count} ${count}`}>
      <Rect width={count} height={count} fill={color.paper} />
      <Path d={path} fill={color.ink} />
    </Svg>
  </View>;
}
