import { ContourError } from './errors';
import { LIMITS } from './grid';
import { Point, Polyline } from './types';

export interface Segment {
  a: string; // 边标识
  b: string;
  cell: [number, number];
}

function keySeqCanonical(keys: string[], closed: boolean): string[] {
  if (!closed) {
    const fwd = keys;
    const rev = [...keys].reverse();
    return lexCompare(fwd, rev) <= 0 ? fwd : rev;
  }
  // 闭环：旋转到最小边标识为首，再取两种方向中字典序较小者
  let best: string[] | null = null;
  for (let start = 0; start < keys.length; start++) {
    const rotated = keys.slice(start).concat(keys.slice(0, start));
    if (best === null || lexCompare(rotated, best) < 0) best = rotated;
  }
  const fwd = best!;
  const rev = [fwd[0], ...fwd.slice(1).reverse()];
  return lexCompare(fwd, rev) <= 0 ? fwd : rev;
}

function lexCompare(a: string[], b: string[]): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return a.length - b.length;
}

/**
 * 将局部线段按共享网格边标识拼接为折线。
 * 交点身份完全由边标识决定，不依赖浮点坐标字符串。
 */
export function stitchSegments(
  segments: Segment[],
  pointOf: (edgeId: string) => Point,
): Polyline[] {
  const adjacency = new Map<string, number[]>();
  segments.forEach((seg, i) => {
    for (const key of [seg.a, seg.b]) {
      const list = adjacency.get(key);
      if (list) list.push(i);
      else adjacency.set(key, [i]);
    }
  });

  const visited = new Array<boolean>(segments.length).fill(false);
  const polylines: Polyline[] = [];

  const trace = (startSeg: number): { keys: string[]; cells: Array<[number, number]>; closed: boolean } => {
    const keys: string[] = [];
    const cells: Array<[number, number]> = [];
    let segIdx = startSeg;
    // 进入线段时的入口点；首条线段任选一端
    let entry: string = segments[startSeg].a;
    let closed = false;
    for (;;) {
      visited[segIdx] = true;
      const seg = segments[segIdx];
      cells.push(seg.cell);
      const exit = seg.a === entry ? seg.b : seg.a;
      if (keys.length === 0) keys.push(entry);
      keys.push(exit);
      if (exit === keys[0]) {
        closed = true;
        keys.pop(); // 闭环首尾不重复
        break;
      }
      const next = (adjacency.get(exit) ?? []).find((i) => !visited[i]);
      if (next === undefined) break;
      segIdx = next;
      entry = exit;
    }
    return { keys, cells, closed };
  };

  // 先处理开链（从度为 1 的端点出发），再处理闭环，保证确定性
  const endpointSegs = segments
    .map((seg, i) => ({ seg, i }))
    .filter(({ seg }) => (adjacency.get(seg.a)?.length ?? 0) === 1 || (adjacency.get(seg.b)?.length ?? 0) === 1)
    .map(({ i }) => i)
    .sort((x, y) => {
      const ka = segments[x].a < segments[x].b ? segments[x].a : segments[x].b;
      const kb = segments[y].a < segments[y].b ? segments[y].a : segments[y].b;
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

  for (const i of endpointSegs) {
    if (visited[i]) continue;
    const seg = segments[i];
    // 从度为 1 的端点进入
    const startKey = (adjacency.get(seg.a)?.length ?? 0) === 1 ? seg.a : seg.b;
    const saved = segments[i];
    segments[i] = { ...saved, a: startKey, b: saved.a === startKey ? saved.b : saved.a };
    const { keys, cells, closed } = trace(i);
    polylines.push(buildPolyline(keys, cells, closed, pointOf));
  }
  for (let i = 0; i < segments.length; i++) {
    if (visited[i]) continue;
    const { keys, cells, closed } = trace(i);
    polylines.push(buildPolyline(keys, cells, closed, pointOf));
  }

  // 规范化：每条折线内部规范化，再整体稳定排序
  for (const pl of polylines) {
    const canon = keySeqCanonical(pl.edgeIds, pl.type === 'closed');
    pl.edgeIds = canon;
    pl.points = canon.map(pointOf);
  }
  polylines.sort((p, q) => {
    if (p.type !== q.type) return p.type === 'closed' ? -1 : 1;
    return lexCompare(p.edgeIds, q.edgeIds);
  });
  for (const pl of polylines) {
    pl.length = polylineLength(pl.points, pl.type === 'closed');
    pl.vertexCount = pl.points.length;
  }
  if (polylines.length > LIMITS.maxPolylines) {
    throw new ContourError('LIMIT_EXCEEDED', `折线数量 ${polylines.length} 超过上限 ${LIMITS.maxPolylines}`);
  }
  return polylines;
}

function buildPolyline(
  keys: string[],
  cells: Array<[number, number]>,
  closed: boolean,
  pointOf: (edgeId: string) => Point,
): Polyline {
  const uniqueCells = Array.from(new Set(cells.map(([c, r]) => `${c},${r}`)))
    .map((s) => s.split(',').map(Number) as [number, number])
    .sort((a, b) => (a[1] - b[1]) || (a[0] - b[0]));
  return {
    type: closed ? 'closed' : 'open',
    points: keys.map(pointOf),
    edgeIds: keys,
    cells: uniqueCells,
    vertexCount: keys.length,
    length: 0,
  };
}

function polylineLength(points: Point[], closed: boolean): number {
  let len = 0;
  for (let i = 0; i + 1 < points.length; i++) {
    len += Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
  }
  if (closed && points.length > 1) {
    len += Math.hypot(points[0].x - points[points.length - 1].x, points[0].y - points[points.length - 1].y);
  }
  return len;
}
