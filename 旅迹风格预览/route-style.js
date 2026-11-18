function routeDisplaySegments(route, mode) {
  const segments = [];
  const push = (line, color, outline, dashed = false) => {
    if (typeof line !== 'string') return;
    const path = line.split(';').map(point => point.split(',').map(Number)).filter(point => point.length === 2 && point.every(Number.isFinite));
    if (path.length > 1) segments.push({ path, strokeColor: color, outlineColor: outline, strokeStyle: dashed ? 'dashed' : 'solid' });
  };
  if (mode === 'transit' && route.segments?.length) {
    for (const segment of route.segments) {
      for (const step of segment.walking?.steps || []) push(step.polyline, '#899393', '#ffffff', true);
      for (const line of segment.bus?.buslines || []) push(line.polyline, '#00a971', '#ffffff');
      push(segment.railway?.polyline, '#047ac7', '#ffffff');
      push(segment.taxi?.polyline, '#2e82ff', '#ffffff');
    }
  } else if (mode === 'driving' && route.steps?.length) {
    const colors = { '畅通': '#00a85d', '缓行': '#e7b02c', '拥堵': '#ca2a1f', '严重拥堵': '#871b13' };
    for (const step of route.steps) {
      const traffic = step.tmcs || step.tmcs_paths || [];
      if (traffic.length && traffic.every(part => typeof part.polyline === 'string' && part.polyline)) {
        for (const part of traffic) push(part.polyline, colors[part.status] || '#4983fb', '#ffffff');
      } else push(step.polyline, '#4983fb', '#ffffff');
    }
  }
  if (!segments.length) for (const line of route.polylines || []) push(line, mode === 'transit' ? '#00a971' : mode === 'driving' ? '#4983fb' : '#00a9d1', '#ffffff');
  return segments;
}
