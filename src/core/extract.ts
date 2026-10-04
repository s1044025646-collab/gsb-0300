import { assertNoVertexOnThreshold } from "./validate";
import { cellSegments } from "./marchingSquares";
import { stitchSegments } from "./stitch";
import { ExtractionResult, GridSpec, RULE_VERSION, Segment } from "./types";

export function extractContours(grid: GridSpec, threshold: number): ExtractionResult {
  assertNoVertexOnThreshold(grid, threshold);
  const segments: Segment[] = [];
  for (let r = 0; r < grid.rows - 1; r++) {
    for (let c = 0; c < grid.cols - 1; c++) {
      segments.push(...cellSegments(grid, r, c, threshold));
    }
  }
  const polylines = stitchSegments(segments);
  const openCount = polylines.filter((p) => !p.closed).length;
  const closedCount = polylines.length - openCount;
  const totalLength = polylines.reduce((s, p) => s + p.length, 0);
  const totalVertices = polylines.reduce((s, p) => s + p.vertexCount, 0);
  return {
    ruleVersion: RULE_VERSION,
    threshold,
    polylines,
    summary: {
      polylineCount: polylines.length,
      openCount,
      closedCount,
      totalLength,
      totalVertices,
    },
  };
}
