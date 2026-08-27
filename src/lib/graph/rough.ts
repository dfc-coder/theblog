export interface RoughPoint {
  readonly x: number;
  readonly y: number;
}

interface RoughPair {
  readonly primary: string;
  readonly secondary: string;
}

export interface RoughStroke extends RoughPair {
  readonly points: readonly RoughPoint[];
}

const format = (value: number): string => Number(value.toFixed(2)).toString();

const hashSeed = (value: string): number => {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
};

const createRng = (seed: number): (() => number) => {
  let state = seed || 1;

  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967295;
  };
};

const jitter = (rng: () => number, amount: number): number => (rng() - 0.5) * 2 * amount;

const distance = (a: RoughPoint, b: RoughPoint): number => Math.hypot(a.x - b.x, a.y - b.y);

const toward = (from: RoughPoint, to: RoughPoint, amount: number): RoughPoint => {
  const length = distance(from, to);
  if (length === 0) {
    return from;
  }

  const ratio = Math.min(amount / length, 1);
  return {
    x: from.x + (to.x - from.x) * ratio,
    y: from.y + (to.y - from.y) * ratio
  };
};

const jitterPoints = (
  points: readonly RoughPoint[],
  seed: string,
  roughness: number
): RoughPoint[] => {
  const rng = createRng(hashSeed(seed));

  return points.map((point, index) => {
    const endpointScale = index === 0 || index === points.length - 1 ? 0.38 : 1;
    return {
      x: point.x + jitter(rng, roughness * endpointScale),
      y: point.y + jitter(rng, roughness * endpointScale)
    };
  });
};

const curvedPolyline = (
  points: readonly RoughPoint[],
  seed: string,
  roughness: number,
  cornerRadius: number
): string => {
  const jittered = jitterPoints(points, seed, roughness);
  const first = jittered[0];
  if (!first) {
    return '';
  }

  if (jittered.length === 1) {
    return `M ${format(first.x)} ${format(first.y)}`;
  }

  if (jittered.length === 2) {
    const last = jittered[1];
    if (!last) {
      return '';
    }

    const rng = createRng(hashSeed(`${seed}:curve`));
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const length = Math.max(Math.hypot(dx, dy), 1);
    const normalX = -dy / length;
    const normalY = dx / length;
    const bend = jitter(rng, Math.min(4.5, length * 0.045));
    const c1 = {
      x: first.x + dx * 0.36 + normalX * bend,
      y: first.y + dy * 0.36 + normalY * bend
    };
    const c2 = {
      x: first.x + dx * 0.72 - normalX * bend * 0.45,
      y: first.y + dy * 0.72 - normalY * bend * 0.45
    };

    return `M ${format(first.x)} ${format(first.y)} C ${format(c1.x)} ${format(c1.y)} ${format(c2.x)} ${format(c2.y)} ${format(last.x)} ${format(last.y)}`;
  }

  let path = `M ${format(first.x)} ${format(first.y)}`;

  for (let index = 1; index < jittered.length - 1; index += 1) {
    const previous = jittered[index - 1];
    const current = jittered[index];
    const next = jittered[index + 1];
    if (!previous || !current || !next) {
      continue;
    }

    const radius = Math.min(
      cornerRadius,
      distance(previous, current) * 0.28,
      distance(current, next) * 0.28
    );
    const before = toward(current, previous, radius);
    const after = toward(current, next, radius);

    path += ` L ${format(before.x)} ${format(before.y)}`;
    path += ` Q ${format(current.x)} ${format(current.y)} ${format(after.x)} ${format(after.y)}`;
  }

  const last = jittered[jittered.length - 1];
  if (last) {
    path += ` L ${format(last.x)} ${format(last.y)}`;
  }

  return path;
};

export const parseOrthogonalPath = (path: string): RoughPoint[] => {
  const tokens = path.match(/[MHV]|-?\d+(?:\.\d+)?/g) ?? [];
  const points: RoughPoint[] = [];
  let cursor: RoughPoint = { x: 0, y: 0 };
  let index = 0;

  while (index < tokens.length) {
    const command = tokens[index];
    index += 1;

    if (command === 'M') {
      const x = Number(tokens[index]);
      const y = Number(tokens[index + 1]);
      index += 2;
      cursor = { x, y };
      points.push(cursor);
      continue;
    }

    if (command === 'H') {
      const x = Number(tokens[index]);
      index += 1;
      cursor = { x, y: cursor.y };
      points.push(cursor);
      continue;
    }

    if (command === 'V') {
      const y = Number(tokens[index]);
      index += 1;
      cursor = { x: cursor.x, y };
      points.push(cursor);
    }
  }

  return points;
};

export const roughOrthogonalStroke = (path: string, seed: string): RoughStroke => {
  const points = parseOrthogonalPath(path);

  return {
    points,
    primary: curvedPolyline(points, `${seed}:primary`, 1.35, 7),
    secondary: curvedPolyline(points, `${seed}:secondary`, 2.15, 9)
  };
};

const roughBoxPath = (
  x: number,
  y: number,
  width: number,
  height: number,
  seed: string,
  roughness: number
): string => {
  const rng = createRng(hashSeed(seed));
  const radius = 9;
  const left = x + jitter(rng, roughness);
  const right = x + width + jitter(rng, roughness);
  const top = y + jitter(rng, roughness);
  const bottom = y + height + jitter(rng, roughness);
  const topLeft = radius + jitter(rng, 1.2);
  const topRight = radius + jitter(rng, 1.2);
  const bottomRight = radius + jitter(rng, 1.2);
  const bottomLeft = radius + jitter(rng, 1.2);

  return [
    `M ${format(left + topLeft)} ${format(top)}`,
    `C ${format(left + width * 0.36)} ${format(top + jitter(rng, 1.5))} ${format(left + width * 0.68)} ${format(top + jitter(rng, 1.5))} ${format(right - topRight)} ${format(top)}`,
    `Q ${format(right + jitter(rng, 1.1))} ${format(top)} ${format(right)} ${format(top + topRight)}`,
    `C ${format(right + jitter(rng, 1.4))} ${format(y + height * 0.34)} ${format(right + jitter(rng, 1.4))} ${format(y + height * 0.68)} ${format(right)} ${format(bottom - bottomRight)}`,
    `Q ${format(right)} ${format(bottom + jitter(rng, 1.1))} ${format(right - bottomRight)} ${format(bottom)}`,
    `C ${format(x + width * 0.68)} ${format(bottom + jitter(rng, 1.5))} ${format(x + width * 0.34)} ${format(bottom + jitter(rng, 1.5))} ${format(left + bottomLeft)} ${format(bottom)}`,
    `Q ${format(left + jitter(rng, 1.1))} ${format(bottom)} ${format(left)} ${format(bottom - bottomLeft)}`,
    `C ${format(left + jitter(rng, 1.4))} ${format(y + height * 0.68)} ${format(left + jitter(rng, 1.4))} ${format(y + height * 0.34)} ${format(left)} ${format(top + topLeft)}`,
    `Q ${format(left)} ${format(top + jitter(rng, 1.1))} ${format(left + topLeft)} ${format(top)}`,
    'Z'
  ].join(' ');
};

export const roughNodeBox = (
  x: number,
  y: number,
  width: number,
  height: number,
  seed: string
): RoughPair => ({
  primary: roughBoxPath(x, y, width, height, `${seed}:primary`, 1.45),
  secondary: roughBoxPath(x, y, width, height, `${seed}:secondary`, 2.35)
});

export const roughArrowHead = (points: readonly RoughPoint[], seed: string): RoughPair => {
  const tip = points[points.length - 1];
  const previous = points[points.length - 2];
  if (!tip || !previous) {
    return { primary: '', secondary: '' };
  }

  const dx = tip.x - previous.x;
  const dy = tip.y - previous.y;
  const length = Math.max(Math.hypot(dx, dy), 1);
  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;

  const draw = (pass: string, roughness: number): string => {
    const rng = createRng(hashSeed(`${seed}:${pass}`));
    const arrowLength = 10 + jitter(rng, 1.2);
    const halfWidth = 5 + jitter(rng, 0.8);
    const localTip = {
      x: tip.x + jitter(rng, roughness * 0.3),
      y: tip.y + jitter(rng, roughness * 0.3)
    };
    const baseX = localTip.x - ux * arrowLength;
    const baseY = localTip.y - uy * arrowLength;
    const left = {
      x: baseX + px * halfWidth + jitter(rng, roughness),
      y: baseY + py * halfWidth + jitter(rng, roughness)
    };
    const right = {
      x: baseX - px * halfWidth + jitter(rng, roughness),
      y: baseY - py * halfWidth + jitter(rng, roughness)
    };

    return `M ${format(left.x)} ${format(left.y)} Q ${format(localTip.x + jitter(rng, 0.7))} ${format(localTip.y + jitter(rng, 0.7))} ${format(localTip.x)} ${format(localTip.y)} Q ${format(localTip.x + jitter(rng, 0.7))} ${format(localTip.y + jitter(rng, 0.7))} ${format(right.x)} ${format(right.y)}`;
  };

  return {
    primary: draw('primary', 0.9),
    secondary: draw('secondary', 1.5)
  };
};

export const roughHatching = (
  x: number,
  y: number,
  width: number,
  height: number,
  seed: string
): readonly string[] => {
  const rng = createRng(hashSeed(seed));
  const side = hashSeed(`${seed}:side`) % 2 === 0 ? 'right' : 'left';
  const anchorX = side === 'right' ? x + width - 18 : x + 8;
  const anchorY = y + 8;
  const count = 2 + (hashSeed(`${seed}:count`) % 2);

  return Array.from({ length: count }, (_, index) => {
    const lineX = anchorX + index * 4 + jitter(rng, 1);
    const lineY = anchorY + index * 2 + jitter(rng, 1);
    const direction = side === 'right' ? -1 : 1;
    const x2 = lineX + direction * (7 + jitter(rng, 1.2));
    const y2 = lineY + 7 + jitter(rng, 1.2);
    return `M ${format(lineX)} ${format(lineY)} Q ${format((lineX + x2) / 2 + jitter(rng, 0.8))} ${format((lineY + y2) / 2 + jitter(rng, 0.8))} ${format(x2)} ${format(y2)}`;
  });
};
