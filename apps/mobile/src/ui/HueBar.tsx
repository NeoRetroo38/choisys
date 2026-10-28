import { useState } from 'react';
import { PanResponder, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { hueToHex } from '../cube/cubePrefs';

const stops = [0, 60, 120, 180, 240, 300, 360];
const height = 36;

/** Drag (or tap) along the bar to pick any accent hue. */
export default function HueBar({ hue, onChange }: { hue: number | null; onChange: (hue: number) => void }) {
  const [width, setWidth] = useState(0);
  const [bar] = useState(() => ({ width: 0, onChange }));
  bar.onChange = onChange;
  const pick = (x: number) => { if (bar.width > 0) bar.onChange(Math.round(Math.max(0, Math.min(1, x / bar.width)) * 360)); };
  const [pan] = useState(() => PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: event => pick(event.nativeEvent.locationX),
    onPanResponderMove: event => pick(event.nativeEvent.locationX),
  }));
  const layout = (event: LayoutChangeEvent) => { bar.width = event.nativeEvent.layout.width; setWidth(bar.width); };
  const thumb = hue === null ? null : (hue / 360) * width;
  return (
    <View onLayout={layout} {...pan.panHandlers} accessible accessibilityRole="adjustable" accessibilityLabel="Color del cubo"
      accessibilityValue={{ min: 0, max: 360, now: hue ?? 0 }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={event => onChange(((hue ?? 110) + (event.nativeEvent.actionName === 'increment' ? 20 : -20) + 360) % 360)}
      style={{ height, borderRadius: height / 2, overflow: 'hidden' }}>
      {width > 0 && <Svg width={width} height={height} pointerEvents="none">
        <Defs><LinearGradient id="hue" x1="0" y1="0" x2="1" y2="0">
          {stops.map(stop => <Stop key={stop} offset={stop / 360} stopColor={hueToHex(stop)} />)}
        </LinearGradient></Defs>
        <Rect x={0} y={0} width={width} height={height} fill="url(#hue)" />
      </Svg>}
      {thumb !== null && <View pointerEvents="none" style={{ position: 'absolute', left: Math.max(2, Math.min(width - 30, thumb - 14)), top: 3, width: 30, height: 30,
        borderRadius: 15, borderWidth: 3, borderColor: '#ffffff', backgroundColor: hueToHex(hue ?? 0), shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 3 }} />}
    </View>
  );
}
