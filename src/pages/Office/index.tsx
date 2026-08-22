import { ARCHIVE_URL, VOLUNTEER_FORM_LINK } from '@/constants';
import { useEffect, useRef, useState } from 'preact/hooks';

import comfyImg from '@/assets/office/Comfy.png';
import nawniImg from '@/assets/office/Nawni.png';
import smileyImg from '@/assets/office/Smiley.png';

import css from './styles.module.scss';

/**
 * MARECON 2027 precon — Dept. of Mascot Operations, Floor 7.
 *
 * Isometric office floor (2:1 projection). Nawni and Smiley wander between
 * the desk rows with a squash-and-stretch hop instead of real walk frames;
 * Comfy is laying in the corner. On break. Unauthorized.
 *
 * The whole scene is one SVG: walls, posters, desks and the cooler are flat
 * corporate vector boxes, the three mascots are <image> sprites inside the
 * same coordinate space, depth-sorted by their iso x+y every frame.
 *
 * Tuning lives in the constants right below.
 */

// --- iso geometry -----------------------------------------------------------
const HX = 32; // half tile width (px)
const HY = 16; // half tile height (px)
const OX = 480; // svg-space origin of floor corner (0,0)
const OY = 216;
const ROOM_W = 14; // tiles along x (right-down)
const ROOM_D = 10; // tiles along y (left-down)
const WALL_H = 150;
const SCENE_W = 960;
const SCENE_H = 700;

const px = (x: number, y: number) => OX + (x - y) * HX;
const py = (x: number, y: number) => OY + (x + y) * HY;

// things nearer the viewer render a touch bigger
const depthScale = (x: number, y: number) =>
  0.9 + ((x + y) / (ROOM_W + ROOM_D)) * 0.22;

// --- layout -----------------------------------------------------------------
type Rect = [number, number, number, number]; // x, y, w, d (tiles)
const DESKS_ROW1: Rect[] = [
  [1.6, 2.2, 2.4, 1.2],
  [5.5, 2.2, 2.4, 1.2],
  [9.4, 2.2, 2.4, 1.2],
];
const DESKS_ROW2: Rect[] = [
  [1.5, 5.9, 2.0, 1.2],
  [4.2, 5.9, 2.0, 1.2],
  [8.8, 5.9, 2.0, 1.2],
  [11.5, 5.9, 2.0, 1.2],
];
const COOLER: Rect = [12.5, 8.5, 1.0, 1.0];
const COMFY_PAD: Rect = [0.9, 8.7, 2.2, 1.2]; // she is furniture now

const BLOCKED: Rect[] = [...DESKS_ROW1, ...DESKS_ROW2, COOLER, COMFY_PAD];

const MIN_X = 0.8,
  MAX_X = 13.4,
  MIN_Y = 3.7,
  MAX_Y = 9.9;

const DESK_H = 40;
const PART_H = 62;

// --- ponies -----------------------------------------------------------------
// facesRight: flip it if the art actually faces left — mirroring inverts too
interface Pony {
  name: string;
  img: string;
  w: number;
  h: number;
  facesRight: boolean;
  x: number;
  y: number;
  path: [number, number][];
  mode: 'idle' | 'walk';
  idleUntil: number;
  facing: 1 | -1;
  phase: number;
  speed: number; // tiles / s
  startleUntil: number;
  msgUntil: number;
  g: SVGGElement | null;
  inner: SVGGElement | null;
  tag: SVGTextElement | null;
}

const inRect = (x: number, y: number, r: Rect, m = 0.35) =>
  x > r[0] - m && x < r[0] + r[2] + m && y > r[1] - m && y < r[1] + r[3] + m;

const segsCross = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
) => {
  const d1 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d2 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  const d3 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d4 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  return d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0;
};

const segHitsRect = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
  r: Rect,
) => {
  if (inRect(ax, ay, r, 0) || inRect(bx, by, r, 0)) return true;
  const [x, y, w, d] = r;
  return (
    segsCross(ax, ay, bx, by, x, y, x + w, y) ||
    segsCross(ax, ay, bx, by, x + w, y, x + w, y + d) ||
    segsCross(ax, ay, bx, by, x + w, y + d, x, y + d) ||
    segsCross(ax, ay, bx, by, x, y + d, x, y)
  );
};

// waypoint plan: direct if clear, else one corner detour around the blocker
const plan = (
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number][] => {
  const blocker = BLOCKED.find((r) => segHitsRect(ax, ay, bx, by, r));
  if (!blocker) return [[bx, by]];
  const [x, y, w, d] = blocker;
  const m = 0.55;
  const corners: [number, number][] = (
    [
      [x - m, y - m],
      [x + w + m, y - m],
      [x + w + m, y + d + m],
      [x - m, y + d + m],
    ] as [number, number][]
  ).filter(
    ([cx, cyy]) =>
      cx > MIN_X &&
      cx < MAX_X &&
      cyy > MIN_Y &&
      cyy < MAX_Y &&
      !BLOCKED.some((r) => inRect(cx, cyy, r, 0.1)),
  );
  let best: [number, number] | null = null;
  let bestD = Infinity;
  for (const c of corners) {
    if (BLOCKED.some((r) => segHitsRect(ax, ay, c[0], c[1], r))) continue;
    const dd =
      Math.hypot(c[0] - ax, c[1] - ay) + Math.hypot(bx - c[0], by - c[1]);
    if (dd < bestD) {
      bestD = dd;
      best = c;
    }
  }
  if (!best) return [];
  const blocked2 = BLOCKED.some((r) =>
    segHitsRect(best[0], best[1], bx, by, r),
  );
  return blocked2 ? [best] : [best, [bx, by]];
};

const randomTarget = (): [number, number] => {
  for (let i = 0; i < 24; i++) {
    const x = MIN_X + Math.random() * (MAX_X - MIN_X);
    const y = MIN_Y + Math.random() * (MAX_Y - MIN_Y);
    if (!BLOCKED.some((r) => inRect(x, y, r))) return [x, y];
  }
  return [7.4, 8.4];
};

// --- svg helpers --------------------------------------------------------------
const Pt = (x: number, y: number, z = 0) => [px(x, y), py(x, y) - z] as const;
const poly = (pts: readonly (readonly number[])[]) =>
  pts.map((p) => p[0] + ',' + p[1]).join(' ');

interface BoxProps {
  r: Rect;
  h?: number;
  z?: number; // base elevation (monitors sit on desks)
  top: string;
  left: string;
  right: string;
}

const IsoBox = ({ r, h = 44, z = 0, top, left, right }: BoxProps) => {
  const [x, y, w, d] = r;
  // painter key: front corner x+y, biased slightly back so ponies at the same
  // depth plane draw in front of furniture rather than behind it
  const key = x + w + (y + d) - 0.49;
  const a = Pt(x, y),
    b = Pt(x + w, y),
    c = Pt(x + w, y + d),
    e = Pt(x, y + d);
  const at = Pt(x, y, z + h),
    bt = Pt(x + w, y, z + h),
    ct = Pt(x + w, y + d, z + h),
    et = Pt(x, y + d, z + h);
  return (
    <g data-key={key.toFixed(2)}>
      <polygon points={poly([et, ct, c, e])} fill={left} />
      <polygon points={poly([bt, ct, c, b])} fill={right} />
      <polygon points={poly([at, bt, ct, et])} fill={top} />
    </g>
  );
};

export const Office = () => {
  const sortRef = useRef<SVGGElement>(null);
  const nawniRef = useRef<SVGGElement>(null);
  const nawniInner = useRef<SVGGElement>(null);
  const nawniTag = useRef<SVGTextElement>(null);
  const smileyRef = useRef<SVGGElement>(null);
  const smileyInner = useRef<SVGGElement>(null);
  const smileyTag = useRef<SVGTextElement>(null);

  const [sweeping, setSweeping] = useState(false);

  // sim state lives outside react; handlers reach it through this ref
  const poniesRef = useRef<Pony[]>([]);

  // supervisor sweep: a light band crosses the floor every half minute-ish
  useEffect(() => {
    let offT = 0;
    let t = 0;
    const loop = () => {
      setSweeping(true);
      offT = window.setTimeout(() => {
        setSweeping(false);
        t = window.setTimeout(loop, 26000 + Math.random() * 16000);
      }, 2800);
    };
    t = window.setTimeout(loop, 14000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(offT);
    };
  }, []);

  // efficiency tag jitter (sweep pins everyone at 99.9, obviously)
  useEffect(() => {
    const set = () => {
      for (const p of poniesRef.current) {
        if (!p.tag) continue;
        if (p.msgUntil > performance.now()) continue;
        p.tag.textContent =
          p.name +
          ' · ' +
          (sweeping ? '99.9' : (94.5 + Math.random() * 4.8).toFixed(1)) +
          '%';
      }
    };
    set();
    const id = window.setInterval(set, 1400);
    return () => window.clearInterval(id);
  }, [sweeping]);

  // --- walker sim -------------------------------------------------------------
  useEffect(() => {
    const ponies: Pony[] = [
      {
        name: 'NAWNI',
        img: nawniImg,
        w: 144,
        h: 118,
        facesRight: true,
        x: 7.4,
        y: 8.6,
        path: [],
        mode: 'idle',
        idleUntil: 0,
        facing: 1,
        phase: 0,
        speed: 1.6,
        startleUntil: 0,
        msgUntil: 0,
        g: nawniRef.current,
        inner: nawniInner.current,
        tag: nawniTag.current,
      },
      {
        name: 'SMILEY',
        img: smileyImg,
        w: 132,
        h: 112,
        facesRight: true,
        x: 9.8,
        y: 8.9,
        path: [],
        mode: 'idle',
        idleUntil: 800,
        facing: -1,
        phase: 1.4,
        speed: 1.2,
        startleUntil: 0,
        msgUntil: 0,
        g: smileyRef.current,
        inner: smileyInner.current,
        tag: smileyTag.current,
      },
    ];
    poniesRef.current = ponies;

    const layer = sortRef.current;
    let raf = 0;
    let last = performance.now();

    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      for (const p of ponies) {
        if (!p.g || !p.inner) continue;
        let squash: number;
        let hop = 0;

        if (p.startleUntil > now) {
          // panic wiggle after an incident report
          squash = 1 + Math.sin(now * 0.055) * 0.13;
        } else if (sweeping) {
          // freeze where you are and look MAXIMALLY busy
          squash = 1 + Math.sin(now * 0.04 + p.phase) * 0.07;
        } else if (p.mode === 'idle') {
          squash = 1 + Math.sin(now * 0.003 + p.phase) * 0.02;
          if (now > p.idleUntil) {
            const [tx, ty] = randomTarget();
            p.path = plan(p.x, p.y, tx, ty);
            if (p.path.length) p.mode = 'walk';
            else p.idleUntil = now + 600;
          }
        } else {
          // squash-stretch hop: the entire walk animation
          p.phase += dt * 9 * p.speed;
          squash = 1 + Math.sin(p.phase * 2) * 0.065;
          hop = Math.abs(Math.sin(p.phase)) * 4;

          const tgt = p.path[0];
          if (!tgt) {
            p.mode = 'idle';
            p.idleUntil = now + 900 + Math.random() * 2200;
          } else {
            const dx = tgt[0] - p.x,
              dy = tgt[1] - p.y;
            const dist = Math.hypot(dx, dy);
            const step = p.speed * dt;
            if (Math.abs(dx) > 0.01) p.facing = dx > 0 ? 1 : -1;
            if (dist <= step) {
              p.x = tgt[0];
              p.y = tgt[1];
              p.path.shift();
              if (!p.path.length) {
                p.mode = 'idle';
                p.idleUntil = now + 900 + Math.random() * 2400;
              }
            } else {
              p.x += (dx / dist) * step;
              p.y += (dy / dist) * step;
            }
          }
        }

        const ds = depthScale(p.x, p.y);
        p.g.setAttribute(
          'transform',
          'translate(' +
            px(p.x, p.y).toFixed(1) +
            ',' +
            py(p.x, p.y).toFixed(1) +
            ')',
        );
        p.inner.setAttribute(
          'transform',
          'translate(0,' +
            (-hop).toFixed(1) +
            ') scale(' +
            (p.facing * (p.facesRight ? 1 : -1) * ds).toFixed(3) +
            ',' +
            (squash * ds).toFixed(3) +
            ')',
        );
        p.g.dataset.key = (p.x + p.y).toFixed(2);
      }

      // painter-order resort, only when the order actually changed
      if (layer) {
        const kids = Array.from(layer.children) as SVGGElement[];
        const sorted = kids
          .slice()
          .sort(
            (a, b) =>
              parseFloat(a.dataset.key || '0') -
              parseFloat(b.dataset.key || '0'),
          );
        for (let i = 0; i < kids.length; i++) {
          if (kids[i] !== sorted[i]) {
            sorted.forEach((k) => layer.appendChild(k));
            break;
          }
        }
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [sweeping]);

  const fileIncident = (which: string) => {
    const p = poniesRef.current.find((q) => q.name === which);
    if (!p || !p.tag) return;
    const now = performance.now();
    p.startleUntil = now + 900;
    p.msgUntil = now + 1800;
    p.tag.textContent = 'INCIDENT FILED // -0.3 MORALE';
    p.tag.classList.add(css.tagBad);
    window.setTimeout(() => p.tag && p.tag.classList.remove(css.tagBad), 1800);
  };

  return (
    <div class={css.stage + (sweeping ? ' ' + css.sweeping : '')}>
      <div class={css.scan} />

      <header class={css.topbar}>
        <div>
          MARECON 2027 // PRECON PORTAL — DEPT. OF MASCOT OPERATIONS · FLOOR 7
        </div>
        <div class={sweeping ? css.fineWarn : css.fine}>
          <span class={css.fineDot} />
          {sweeping
            ? 'SUPERVISOR SWEEP IN PROGRESS'
            : 'STATUS: EVERYTHING IS FINE'}
        </div>
      </header>

      <div class={css.scene}>
        <svg viewBox={'0 0 ' + SCENE_W + ' ' + SCENE_H} width="100%">
          <defs>
            <linearGradient id="sweepGrad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#7fe0a8" stopOpacity="0" />
              <stop offset="0.5" stopColor="#7fe0a8" stopOpacity="0.16" />
              <stop offset="1" stopColor="#7fe0a8" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* ---- floor ---- */}
          <polygon
            class={css.floor}
            points={poly([
              Pt(0, 0),
              Pt(ROOM_W, 0),
              Pt(ROOM_W, ROOM_D),
              Pt(0, ROOM_D),
            ])}
          />
          {Array.from({ length: ROOM_W + 1 }, (_, i) => (
            <line
              key={'gx' + i}
              class={css.gridline}
              x1={px(i, 0)}
              y1={py(i, 0)}
              x2={px(i, ROOM_D)}
              y2={py(i, ROOM_D)}
            />
          ))}
          {Array.from({ length: ROOM_D + 1 }, (_, j) => (
            <line
              key={'gy' + j}
              class={css.gridline}
              x1={px(0, j)}
              y1={py(0, j)}
              x2={px(ROOM_W, j)}
              y2={py(ROOM_W, j)}
            />
          ))}
          <polygon
            class={css.slabL}
            points={poly([
              Pt(0, ROOM_D),
              Pt(ROOM_W, ROOM_D),
              [px(ROOM_W, ROOM_D), py(ROOM_W, ROOM_D) + 18],
              [px(0, ROOM_D), py(0, ROOM_D) + 18],
            ])}
          />

          {/* taped queue zone by the cooler */}
          <polygon
            class={css.tape}
            points={poly([
              Pt(10.8, 8.6),
              Pt(12.3, 8.6),
              Pt(12.3, 9.8),
              Pt(10.8, 9.8),
            ])}
          />
          <text
            class={css.floorText}
            transform={
              'matrix(1,0.5,-1,0.5,' +
              px(11.15, 9.15) +
              ',' +
              py(11.15, 9.15) +
              ')'
            }
          >
            QUEUE HERE
          </text>

          {/* unauthorized break rug */}
          <polygon
            class={css.rug}
            points={poly([
              Pt(0.9, 8.7),
              Pt(3.1, 8.7),
              Pt(3.1, 9.9),
              Pt(0.9, 9.9),
            ])}
          />

          {/* ---- back walls ---- */}
          <polygon
            class={css.wallY}
            points={poly([
              [px(0, 0), py(0, 0) - WALL_H],
              [px(ROOM_W, 0), py(ROOM_W, 0) - WALL_H],
              Pt(ROOM_W, 0),
              Pt(0, 0),
            ])}
          />
          <polygon
            class={css.wallX}
            points={poly([
              [px(0, 0), py(0, 0) - WALL_H],
              Pt(0, 0),
              Pt(0, ROOM_D),
              [px(0, ROOM_D), py(0, ROOM_D) - WALL_H],
            ])}
          />

          {/* posters on the y=0 wall */}
          <polygon
            class={css.poster}
            points={poly([
              [px(3.0, 0), py(3.0, 0) - 108],
              [px(5.4, 0), py(5.4, 0) - 108],
              [px(5.4, 0), py(5.4, 0) - 34],
              [px(3.0, 0), py(3.0, 0) - 34],
            ])}
          />
          <text
            class={css.posterBig}
            transform={
              'matrix(1,0.5,0,1,' + px(3.35, 0) + ',' + (py(3.35, 0) - 76) + ')'
            }
          >
            SMILE!
          </text>
          <text
            class={css.posterSmall}
            transform={
              'matrix(1,0.5,0,1,' + px(3.2, 0) + ',' + (py(3.2, 0) - 44) + ')'
            }
          >
            MANDATORY FUN — DEPT. OF MORALE
          </text>
          <polygon
            class={css.posterWarm}
            points={poly([
              [px(7.4, 0), py(7.4, 0) - 112],
              [px(10.6, 0), py(10.6, 0) - 112],
              [px(10.6, 0), py(10.6, 0) - 30],
              [px(7.4, 0), py(7.4, 0) - 30],
            ])}
          />
          <text
            class={css.posterMid}
            transform={
              'matrix(1,0.5,0,1,' + px(7.75, 0) + ',' + (py(7.75, 0) - 78) + ')'
            }
          >
            EFFICIENCY
          </text>
          <text
            class={css.posterSmallDark}
            transform={
              'matrix(1,0.5,0,1,' + px(7.85, 0) + ',' + (py(7.85, 0) - 52) + ')'
            }
          >
            IS FRIENDSHIP™ · POSTER 14-B
          </text>

          {/* door on the x=0 wall */}
          <polygon
            class={css.door}
            points={poly([
              [px(0, 5.2), py(0, 5.2) - 92],
              [px(0, 7.0), py(0, 7.0) - 92],
              Pt(0, 7.0),
              Pt(0, 5.2),
            ])}
          />
          <text
            class={css.doorSign}
            transform={
              'matrix(1,-0.5,0,1,' +
              px(0, 6.15) +
              ',' +
              (py(0, 6.15) - 100) +
              ')'
            }
          >
            EXIT — FORM E-1 REQUIRED
          </text>
          <polyline
            class={css.tapeLine}
            points={poly([Pt(0.4, 6.1), Pt(3.4, 6.1)])}
          />

          {/* ---- sort layer: furniture + ponies ---- */}
          <g ref={sortRef}>
            {DESKS_ROW1.map((r, i) => (
              <IsoBox
                key={'d1' + i}
                r={r}
                h={DESK_H}
                top="#26312a"
                left="#161d18"
                right="#0e130f"
              />
            ))}
            {DESKS_ROW2.map((r, i) => (
              <IsoBox
                key={'d2' + i}
                r={r}
                h={DESK_H}
                top="#26312a"
                left="#161d18"
                right="#0e130f"
              />
            ))}
            {DESKS_ROW1.concat(DESKS_ROW2).map((r, i) => (
              <IsoBox
                key={'p' + i}
                r={[r[0], r[1] - 0.28, r[2], 0.28]}
                h={PART_H}
                top="#2c382f"
                left="#1b231d"
                right="#121813"
              />
            ))}
            {[DESKS_ROW1[0], DESKS_ROW1[2], DESKS_ROW2[1], DESKS_ROW2[3]].map(
              (r, i) => (
                <IsoBox
                  key={'m' + i}
                  r={[r[0] + 0.6, r[1] + 0.2, 0.9, 0.55]}
                  h={24}
                  z={DESK_H}
                  top="#0b100c"
                  left="#0d1512"
                  right="#080d0a"
                />
              ),
            )}
            <IsoBox
              r={COOLER}
              h={86}
              top="#233d46"
              left="#182c33"
              right="#101f24"
            />
            <IsoBox
              r={[COOLER[0] + 0.19, COOLER[1] + 0.19, 0.62, 0.62]}
              h={34}
              z={86}
              top="#9fdcff"
              left="#5aa8cf"
              right="#3f7ea1"
            />

            {/* Nawni */}
            <g
              ref={nawniRef}
              data-key="16"
              class={css.pony}
              transform={'translate(' + px(7.4, 8.6) + ',' + py(7.4, 8.6) + ')'}
              onPointerDown={() => fileIncident('NAWNI')}
            >
              <ellipse class={css.shadow} cx="0" cy="0" rx="34" ry="10" />
              <g ref={nawniInner}>
                <image
                  href={nawniImg}
                  x="-72"
                  y="-118"
                  width="144"
                  height="118"
                />
                <rect
                  x="-66"
                  y="-112"
                  width="132"
                  height="112"
                  fill="transparent"
                  pointerEvents="all"
                />
              </g>
              <text
                ref={nawniTag}
                class={css.tag}
                y="-132"
                textAnchor="middle"
                pointerEvents="none"
              />
            </g>

            {/* Smiley */}
            <g
              ref={smileyRef}
              data-key="18.7"
              class={css.pony}
              transform={'translate(' + px(9.8, 8.9) + ',' + py(9.8, 8.9) + ')'}
              onPointerDown={() => fileIncident('SMILEY')}
            >
              <ellipse class={css.shadow} cx="0" cy="0" rx="32" ry="9" />
              <g ref={smileyInner}>
                <image
                  href={smileyImg}
                  x="-66"
                  y="-112"
                  width="132"
                  height="112"
                />
                <rect
                  x="-60"
                  y="-106"
                  width="120"
                  height="106"
                  fill="transparent"
                  pointerEvents="all"
                />
              </g>
              <text
                ref={smileyTag}
                class={css.tag}
                y="-124"
                textAnchor="middle"
                pointerEvents="none"
              />
            </g>

            {/* Comfy: laying in the corner, breathing, dreaming of freedom */}
            <g
              data-key="11.1"
              class={css.pony}
              transform={
                'translate(' + px(1.95, 9.15) + ',' + py(1.95, 9.15) + ')'
              }
            >
              <ellipse class={css.shadow} cx="0" cy="0" rx="52" ry="12" />
              <g class={css.comfyBreathe}>
                <image
                  href={comfyImg}
                  x="-86"
                  y="-96"
                  width="172"
                  height="96"
                />
              </g>
              <text
                class={css.tag + ' ' + css.tagComfy}
                y="-104"
                textAnchor="middle"
                pointerEvents="none"
              >
                COMFY · ON BREAK (UNAUTHORIZED)
              </text>
              <text class={css.z + ' ' + css.z1} x="64" y="-80">
                z
              </text>
              <text class={css.z + ' ' + css.z2} x="72" y="-86">
                z
              </text>
              <text class={css.z + ' ' + css.z3} x="80" y="-92">
                Z
              </text>
            </g>
          </g>

          {/* supervisor sweep light band */}
          <g class={css.bandG} pointerEvents="none">
            <rect
              x="-90"
              y="-140"
              width="180"
              height="1000"
              fill="url(#sweepGrad)"
              transform="skewY(26.57)"
            />
          </g>
        </svg>
      </div>

      <nav class={css.actions}>
        <a class={css.keybtn} href={ARCHIVE_URL}>
          <span class={css.keyTitle}>ARCHIVE</span>
          <span class={css.keySub}>PRE-ACQUISITION MEMORIES ↗</span>
        </a>
        <a
          class={css.keybtn + ' ' + css.primary}
          href={VOLUNTEER_FORM_LINK}
          target="_blank"
          rel="noreferrer"
        >
          <span class={css.keyTitle}>VOLUNTEER</span>
          <span class={css.keySub}>SUBMIT FORM V-27B ↗</span>
        </a>
      </nav>

      <div class={css.hint}>
        TIP: CLICK A WALKING MASCOT TO FILE AN INCIDENT REPORT
      </div>
    </div>
  );
};
