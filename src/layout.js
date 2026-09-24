export const ACTION_RADIUS = 2.05;
export const PUSH_RADIUS = 1.3;
export const WALK_STEP = 0.34;
export const START_POSITIONS = [
  { x: -3.4, z: 3.5 },
  { x: 3.4, z: 3.5 },
  { x: 3.4, z: -3.5 },
  { x: -3.4, z: -3.5 },
];

export function tilePosition(index, count) {
  return { x: 0, z: (index - (count - 1) / 2) * 0.94 };
}

export function walkingSpot(index, count) {
  const tile = tilePosition(index, count);
  return { x: 1.12, z: tile.z };
}

export function clampPlayerPosition(position) {
  return {
    x: Math.max(-4.5, Math.min(4.5, position.x)),
    z: Math.max(-4.5, Math.min(4.5, position.z)),
  };
}

export function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function nearestTikiIndex(position, active) {
  if (!position || !active?.length) return -1;
  let nearest = -1;
  let nearestDistance = ACTION_RADIUS;
  active.forEach((_, index) => {
    const distance = distance2D(position, tilePosition(index, active.length));
    if (distance <= nearestDistance) { nearest = index; nearestDistance = distance; }
  });
  return nearest;
}
