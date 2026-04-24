// app/utils/bubblePhysics.ts


export type BubbleObstacle = {
  x: number;
  y: number;
  width: number;
  height: number;
};


export type PhysicsBubble = {
  id: string;
  size: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
};


export type PhysicsBounds = {
  width: number;
  top: number;
  bottom: number;
  wallPadding?: number;
};


export type StepBubblesArgs<T extends PhysicsBubble> = {
  bubbles: T[];
  dt: number;
  bounds: PhysicsBounds;
  obstacles?: BubbleObstacle[];
};


export function randomIn(min: number, max: number) {
  return min + Math.random() * (max - min);
}


export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}


export function length(x: number, y: number) {
  return Math.sqrt(x * x + y * y);
}


export function reflectVelocity(vx: number, vy: number, nx: number, ny: number) {
  const dot = vx * nx + vy * ny;
  return {
    vx: vx - 2 * dot * nx,
    vy: vy - 2 * dot * ny,
  };
}


export function separateFromWalls<T extends PhysicsBubble>(bubble: T, bounds: PhysicsBounds) {
  const wallPadding = bounds.wallPadding ?? 0;


  const minX = wallPadding;
  const maxX = bounds.width - bubble.size - wallPadding;
  const minY = bounds.top + wallPadding;
  const maxY = bounds.bottom - bubble.size - wallPadding;


  if (bubble.x < minX) {
    bubble.x = minX;
    bubble.vx = Math.abs(bubble.vx);
  } else if (bubble.x > maxX) {
    bubble.x = maxX;
    bubble.vx = -Math.abs(bubble.vx);
  }


  if (bubble.y < minY) {
    bubble.y = minY;
    bubble.vy = Math.abs(bubble.vy);
  } else if (bubble.y > maxY) {
    bubble.y = maxY;
    bubble.vy = -Math.abs(bubble.vy);
  }
}


export function separateBubbleFromObstacle<T extends PhysicsBubble>(
  bubble: T,
  obstacle: BubbleObstacle,
  bounceDamping = 0.95
) {
  const cx = bubble.x + bubble.size / 2;
  const cy = bubble.y + bubble.size / 2;


  const nearestX = Math.max(obstacle.x, Math.min(cx, obstacle.x + obstacle.width));
  const nearestY = Math.max(obstacle.y, Math.min(cy, obstacle.y + obstacle.height));


  let dx = cx - nearestX;
  let dy = cy - nearestY;
  let dist = Math.sqrt(dx * dx + dy * dy);


  const radius = bubble.size / 2;


  if (!dist) {
    dx = 0;
    dy = -1;
    dist = 1;
  }


  if (dist >= radius) return false;


  const overlap = radius - dist;
  const nx = dx / dist;
  const ny = dy / dist;


  bubble.x += nx * overlap;
  bubble.y += ny * overlap;


  const reflected = reflectVelocity(bubble.vx, bubble.vy, nx, ny);
  bubble.vx = reflected.vx * bounceDamping;
  bubble.vy = reflected.vy * bounceDamping;


  return true;
}


export function resolveBubbleCollision<T extends PhysicsBubble>(
  a: T,
  b: T,
  bounceDamping = 0.98
) {
  const ax = a.x + a.size / 2;
  const ay = a.y + a.size / 2;
  const bx = b.x + b.size / 2;
  const by = b.y + b.size / 2;


  let dx = bx - ax;
  let dy = by - ay;
  let dist = Math.sqrt(dx * dx + dy * dy);


  const minDist = (a.size + b.size) / 2;


  if (!dist) {
    dx = Math.random() - 0.5;
    dy = Math.random() - 0.5;
    dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;
  }


  if (dist >= minDist) return false;


  const overlap = minDist - dist;
  const nx = dx / dist;
  const ny = dy / dist;


  a.x -= (nx * overlap) / 2;
  a.y -= (ny * overlap) / 2;
  b.x += (nx * overlap) / 2;
  b.y += (ny * overlap) / 2;


  const aReflected = reflectVelocity(a.vx, a.vy, nx, ny);
  const bReflected = reflectVelocity(b.vx, b.vy, -nx, -ny);


  a.vx = aReflected.vx * bounceDamping;
  a.vy = aReflected.vy * bounceDamping;
  b.vx = bReflected.vx * bounceDamping;
  b.vy = bReflected.vy * bounceDamping;


  return true;
}

export function stepBubbles<T extends PhysicsBubble>({
  bubbles,
  dt,
  bounds,
  obstacles = [],
}: StepBubblesArgs<T>): T[] {
  const next = bubbles.map((b) => ({ ...b }));


  for (const b of next) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    separateFromWalls(b, bounds);
  }


  for (let i = 0; i < next.length; i++) {
    for (let j = i + 1; j < next.length; j++) {
      resolveBubbleCollision(next[i], next[j]);
    }
  }


  for (const b of next) {
    for (const obstacle of obstacles) {
      separateBubbleFromObstacle(b, obstacle);
    }
  }

  for (const b of next) {
    separateFromWalls(b, bounds);
  }


  return next;
}


export function circleIntersectsObstacle(
  x: number,
  y: number,
  size: number,
  obstacle: BubbleObstacle
) {
  const cx = x + size / 2;
  const cy = y + size / 2;
  const radius = size / 2;


  const nearestX = Math.max(obstacle.x, Math.min(cx, obstacle.x + obstacle.width));
  const nearestY = Math.max(obstacle.y, Math.min(cy, obstacle.y + obstacle.height));


  const dx = cx - nearestX;
  const dy = cy - nearestY;


  return Math.sqrt(dx * dx + dy * dy) < radius;
}


export function overlapsAnyBubble<T extends PhysicsBubble>(
  candidate: Pick<PhysicsBubble, "x" | "y" | "size">,
  others: T[]
) {
  const cx = candidate.x + candidate.size / 2;
  const cy = candidate.y + candidate.size / 2;


  return others.some((b) => {
    const dx = cx - (b.x + b.size / 2);
    const dy = cy - (b.y + b.size / 2);
    return length(dx, dy) < (candidate.size + b.size) / 2;
  });
}


export function findSpawnPosition<T extends PhysicsBubble>(args: {
  size: number;
  bounds: PhysicsBounds;
  existingBubbles?: T[];
  obstacles?: BubbleObstacle[];
  maxTries?: number;
}) {
  const {
    size,
    bounds,
    existingBubbles = [],
    obstacles = [],
    maxTries = 30,
  } = args;


  const wallPadding = bounds.wallPadding ?? 0;
  const minX = wallPadding;
  const maxX = Math.max(minX, bounds.width - size - wallPadding);
  const minY = bounds.top + wallPadding;
  const maxY = Math.max(minY, bounds.bottom - size - wallPadding);


  let best = { x: minX, y: minY };


  for (let tries = 0; tries < maxTries; tries++) {
    const candidate = {
      x: randomIn(minX, maxX),
      y: randomIn(minY, maxY),
      size,
    };


    const hitsBubble = overlapsAnyBubble(candidate, existingBubbles);
    const hitsObstacle = obstacles.some((ob) =>
      circleIntersectsObstacle(candidate.x, candidate.y, candidate.size, ob)
    );


    if (!hitsBubble && !hitsObstacle) {
      return { x: candidate.x, y: candidate.y };
    }


    best = { x: candidate.x, y: candidate.y };
  }


  return best;
}


