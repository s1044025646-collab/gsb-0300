import { ApiError } from "./errors";
import { LIMITS } from "./validate";
import { Point, Polyline, Segment } from "./types";

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

interface BuiltLine {
  closed: boolean;
  edgeIds: string[]; // 与 points 一一对应（闭环时末点与首点同边，不重复记录）
  points: Point[];
  cells: string[];
}

/**
 * 按共享网格边标识拼接线段。内部边被两个单元共享 -> 度为 2；
 * 边界边只属于一个单元 -> 度为 1，是开链端点。
 */
export function stitchSegments(segments: Segment[]): Polyline[] {
  // edgeId -> 挂接的线段编号
  const nodeToSegs = new Map<string, number[]>();
  segments.forEach((seg, i) => {
    for (const key of [seg.aEdge, seg.bEdge]) {
      const list = nodeToSegs.get(key);
      if (list) list.push(i);
      else nodeToSegs.set(key, [i]);
    }
  });

  const visited = new Array<boolean>(segments.length).fill(false);
  const lines: BuiltLine[] = [];

  const walk = (startSeg: number, startNode: string): BuiltLine => {
    const edgeIds: string[] = [startNode];
    const points: Point[] = [];
    const cells: string[] = [];
    let segIdx = startSeg;
    let node = startNode;
    let closed = false;
    const pushPoint = (p: Point) => {
      const last = points[points.length - 1];
      if (!last || last.x !== p.x || last.y !== p.y) points.push(p);
    };
    for (;;) {
      visited[segIdx] = true;
      const seg = segments[segIdx];
      cells.push(seg.cellKey);
      if (seg.aEdge === node) {
        pushPoint(seg.a);
        pushPoint(seg.b);
        node = seg.bEdge;
      } else {
        pushPoint(seg.b);
        pushPoint(seg.a);
        node = seg.aEdge;
      }
      edgeIds.push(node);
      const next = (nodeToSegs.get(node) ?? []).filter((i) => !visited[i]);
      if (next.length === 0) {
        // 回到起点所在边 => 闭环；否则开链结束
        if (node === edgeIds[0]) {
          closed = true;
          points.pop();
          edgeIds.pop();
        }
        break;
      }
      if (next.length > 1) {
        throw new ApiError("E_INTERNAL", `边 ${node} 挂接了超过 2 条未访问线段，拼接失败`);
      }
      segIdx = next[0];
    }
    return { closed, edgeIds, points, cells };
  };

  // 先开链：从度为 1 的边界边出发
  const boundaryNodes = [...nodeToSegs.entries()]
    .filter(([, list]) => list.length === 1)
    .map(([key]) => key)
    .sort();
  for (const node of boundaryNodes) {
    const segIdx = nodeToSegs.get(node)![0];
    if (!visited[segIdx]) lines.push(walk(segIdx, node));
  }
  // 再闭环：任意未访问线段出发
  for (let i = 0; i < segments.length; i++) {
    if (!visited[i]) lines.push(walk(i, segments[i].aEdge));
  }

  if (lines.length > LIMITS.maxPolylines) {
    throw new ApiError("E_LIMIT_EXCEEDED", `折线数量超过上限 ${LIMITS.maxPolylines}`);
  }

  const polylines = lines.map((line) => normalize(line));
  polylines.sort(comparePolylines);
  polylines.forEach((p, i) => {
    p.id = `${p.closed ? "ring" : "line"}-${i}`;
  });
  return polylines;
}

function normalize(line: BuiltLine): Polyline {
  let { edgeIds, points } = line;
  if (line.closed) {
    // 固定起点：最小边标识；方向：使第二个节点边标识小于最末节点边标识
    let start = 0;
    for (let i = 1; i < edgeIds.length; i++) {
      if (edgeIds[i] < edgeIds[start]) start = i;
    }
    edgeIds = rotate(edgeIds, start);
    points = rotate(points, start);
    if (edgeIds.length > 1 && edgeIds[1] > edgeIds[edgeIds.length - 1]) {
      edgeIds = [edgeIds[0], ...edgeIds.slice(1).reverse()];
      points = [points[0], ...points.slice(1).reverse()];
    }
  } else {
    // 开链：使首端边标识小于末端边标识
    if (edgeIds[0] > edgeIds[edgeIds.length - 1]) {
      edgeIdsReverse(edgeIds);
      edgeIdsReverse(points);
    }
  }
  let length = 0;
  for (let i = 1; i < points.length; i++) length += dist(points[i - 1], points[i]);
  if (line.closed && points.length > 2) length += dist(points[points.length - 1], points[0]);
  const cells = [...new Set(line.cells)].sort();
  return {
    id: "",
    closed: line.closed,
    points,
    edgeIds,
    cells,
    vertexCount: points.length,
    length,
  };
}

function edgeIdsReverse<T>(arr: T[]): void {
  arr.reverse();
}

function rotate<T>(arr: T[], start: number): T[] {
  return arr.slice(start).concat(arr.slice(0, start));
}

function comparePolylines(a: Polyline, b: Polyline): number {
  const ka = a.edgeIds[0];
  const kb = b.edgeIds[0];
  if (ka !== kb) return ka < kb ? -1 : 1;
  return a.vertexCount - b.vertexCount;
}
