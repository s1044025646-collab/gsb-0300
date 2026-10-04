import { assertNoVertexEqualsThreshold } from './grid';
import { RULE_VERSION, cellSegments, cellCorners, cellEdges, edgeIntersection } from './marching';
import { Segment, stitchSegments } from './stitch';
import { ExtractionResult, GridSpec, Point } from './types';

/** 执行等值线提取。原始矩阵与阈值各自保留，不修改输入。 */
export function extractContours(grid: GridSpec, threshold: number): ExtractionResult {
  assertNoVertexEqualsThreshold(grid, threshold);
  const segments: Segment[] = [];
  const pointCache = new Map<string, Point>();
  const pointOf = (edgeId: string): Point => {
    let p = pointCache.get(edgeId);
    if (!p) {
      p = edgeIntersection(grid, edgeId, threshold);
      pointCache.set(edgeId, p);
    }
    return p;
  };
  for (let row = 0; row < grid.rows - 1; row++) {
    for (let col = 0; col < grid.cols - 1; col++) {
      const corners = cellCorners(grid, col, row);
      const local = cellSegments(corners, threshold);
      if (local.length === 0) continue;
      const edges = cellEdges(col, row);
      for (const [ea, eb] of local) {
        segments.push({ a: edges[ea], b: edges[eb], cell: [col, row] });
      }
    }
  }
  const polylines = stitchSegments(segments, pointOf);
  const openCount = polylines.filter((p) => p.type === 'open').length;
  const totalLength = polylines.reduce((s, p) => s + p.length, 0);
  return {
    ruleVersion: RULE_VERSION,
    threshold,
    grid: { rows: grid.rows, cols: grid.cols, x0: grid.x0, y0: grid.y0, dx: grid.dx, dy: grid.dy },
    polylines,
    stats: {
      polylineCount: polylines.length,
      openCount,
      closedCount: polylines.length - openCount,
      segmentCount: segments.length,
      totalLength,
    },
  };
}
