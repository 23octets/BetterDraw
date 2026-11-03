import paper from 'paper/dist/paper-core'
import type { Shape, Vec } from '../model/types'
import { segCount, segEnds, arcMidPoint } from './shapes'

let scope: paper.PaperScope | null = null

export function getPaper(): paper.PaperScope {
  if (!scope) {
    scope = new paper.PaperScope()
    scope.setup(new scope.Size(10, 10))
    scope.settings.insertItems = false
  }
  return scope
}

export function toPaperPath(s: Shape): paper.Path {
  const P = getPaper()
  const path = new P.Path({ insert: false })
  if (!s.pts.length) return path
  path.moveTo(new P.Point(s.pts[0].x, s.pts[0].y))
  const n = segCount(s)
  for (let i = 0; i < n; i++) {
    const [p0, p1] = segEnds(s, i)
    const g = s.segs[i]
    const isLast = s.closed && i === n - 1
    if (g.t === 'line' || (g.t === 'arc' && Math.abs(g.bulge) < 1e-9)) {
      if (!isLast) path.lineTo(new P.Point(p1.x, p1.y))
    } else if (g.t === 'arc') {
      const m = arcMidPoint(p0, p1, g.bulge)
      path.arcTo(new P.Point(m.x, m.y), new P.Point(p1.x, p1.y))
    } else {
      path.cubicCurveTo(new P.Point(g.c1.x, g.c1.y), new P.Point(g.c2.x, g.c2.y), new P.Point(p1.x, p1.y))
    }
  }
  if (s.closed) {
    // fusionne le dernier point s'il coïncide avec le premier
    if (path.segments.length > 1 && path.lastSegment.point.getDistance(path.firstSegment.point) < 1e-6) {
      path.firstSegment.handleIn = path.lastSegment.handleIn
      path.lastSegment.remove()
    }
    path.closed = true
  }
  return path
}

const cache = new WeakMap<Shape[], Vec[]>()

/** Toutes les intersections entre formes (et auto-intersections), mémoïsées par tableau de formes. */
export function shapeIntersections(shapes: Shape[]): Vec[] {
  const hit = cache.get(shapes)
  if (hit) return hit
  const paths = shapes.map(toPaperPath)
  const out: Vec[] = []
  for (let i = 0; i < paths.length; i++) {
    for (const loc of paths[i].getIntersections()) out.push({ x: loc.point.x, y: loc.point.y })
    for (let j = i + 1; j < paths.length; j++) {
      for (const loc of paths[i].getIntersections(paths[j])) out.push({ x: loc.point.x, y: loc.point.y })
    }
  }
  cache.set(shapes, out)
  return out
}

export function nearestOnShape(s: Shape, p: Vec): Vec {
  const P = getPaper()
  const path = toPaperPath(s)
  const q = path.getNearestPoint(new P.Point(p.x, p.y))
  return { x: q.x, y: q.y }
}
