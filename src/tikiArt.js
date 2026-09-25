// The floor tiles and secret cards use this exact SVG, so every head is identifiable.
const eye = (x, y, closed, rolled, angry) => closed
  ? `<path d="M${x-9} ${y} Q${x} ${y+6} ${x+9} ${y}" fill="none" stroke="#393640" stroke-width="4" stroke-linecap="round"/>`
  : `<ellipse cx="${x}" cy="${y}" rx="10" ry="${angry?6:8}" fill="#fff8ee"/><circle cx="${x}" cy="${y+(rolled?-4:0)}" r="4.3" fill="#2f2d33"/><circle cx="${x-1.4}" cy="${y-2+(rolled?-4:0)}" r="1.25" fill="#fff"/>`;

export function tikiSvg(tiki) {
  const color = tiki?.color || '#96c86c';
  const face = tiki?.expression || 'neutral';
  const leftClosed = face === 'sleepy' || face === 'wink' || face === 'smirk';
  const rightClosed = face === 'sleepy';
  const brows = face === 'angry'
    ? 'M22 31 Q34 22 45 34 M55 34 Q67 22 78 31'
    : face === 'smirk' ? 'M22 32 Q34 26 45 31 M55 31 Q67 34 78 29'
    : 'M22 31 Q34 27 45 31 M55 31 Q67 27 78 31';
  const mouth = face === 'surprised'
    ? '<ellipse cx="50" cy="73" rx="6" ry="8" fill="#3b353d"/>'
    : face === 'smile'
      ? '<path d="M35 69 Q50 86 65 69Z" fill="#3b353d"/><path d="M40 70 Q50 77 60 70" fill="none" stroke="#fff4dc" stroke-width="3"/>'
      : face === 'smirk'
        ? '<path d="M38 73 Q51 75 63 66" fill="none" stroke="#3b353d" stroke-width="4" stroke-linecap="round"/>'
        : face === 'angry'
          ? '<path d="M38 76 Q50 67 62 76" fill="none" stroke="#3b353d" stroke-width="4" stroke-linecap="round"/>'
          : '<path d="M38 72 Q50 76 62 72" fill="none" stroke="#3b353d" stroke-width="4" stroke-linecap="round"/>';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="256" height="256">
    <path d="M22 77 Q15 84 20 95 L80 95 Q85 84 78 77Z" fill="#45404a"/>
    <path d="M19 39 Q11 35 9 48 Q9 60 21 61 M81 39 Q89 35 91 48 Q91 60 79 61" fill="${color}" stroke="#42403e" stroke-width="2"/>
    <path d="M19 27 Q22 9 50 8 Q78 9 81 27 L84 60 Q82 81 67 85 L33 85 Q18 81 16 60Z" fill="${color}" stroke="#41443b" stroke-width="2.5"/>
    <path d="M22 54 Q29 65 38 66 M78 54 Q71 65 62 66" fill="none" stroke="#ffffff" stroke-opacity=".12" stroke-width="3"/>
    ${eye(34,46,leftClosed,face==='roll',face==='angry')}${eye(66,46,rightClosed,face==='roll',face==='angry')}
    <path d="${brows}" fill="none" stroke="#393640" stroke-width="5.2" stroke-linecap="round"/>
    <ellipse cx="50" cy="58" rx="13" ry="11" fill="${color}" stroke="#41443b" stroke-opacity=".27" stroke-width="1"/>
    <ellipse cx="50" cy="61" rx="5" ry="2.3" fill="#547045" opacity=".4"/>
    ${mouth}
    ${face==='sweat'?'<path d="M76 39 Q86 54 77 59 Q68 56 76 39Z" fill="#76ddf2" stroke="#fff" stroke-width="1.5"/>':''}
    <path d="M18 83 Q50 91 82 83 L79 95 Q50 99 21 95Z" fill="#5b565e" stroke="#36333a" stroke-width="2"/>
  </svg>`;
}

export function tikiImageUrl(tiki) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(tikiSvg(tiki))}`;
}
