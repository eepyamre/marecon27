import { ARCHIVE_URL, VOLUNTEER_FORM_LINK } from '@/constants';
import cn from 'classnames';
import { useEffect, useRef } from 'preact/hooks';

import comfyImg from '@/assets/office/Comfy.png';
import nawniImg from '@/assets/office/Nawni.png';
import smileyImg from '@/assets/office/Smiley.png';
import logo from '@/assets/office/non.png';
import placeholder from '@/assets/paceholder.png';

import css from './styles.module.scss';

// --- iso geometry -----------------------------------------------------------
const HX = 32; // half tile width (px)
const HY = 16; // half tile height (px)
const OX = 560; // svg-space origin of floor corner (0,0)
const OY = 240;
const ROOM_W = 16; // tiles along x (right-down)
const ROOM_D = 12; // tiles along y (left-down)
const WALL_H = 150;
const SCENE_W = 1160;
const SCENE_H = 780;

const px = (x: number, y: number) => OX + (x - y) * HX;
const py = (x: number, y: number) => OY + (x + y) * HY;

// things nearer the viewer render a touch bigger
const depthScale = (x: number, y: number) =>
  0.88 + ((x + y) / (ROOM_W + ROOM_D)) * 0.24;

// --- layout -----------------------------------------------------------------
type Rect = [number, number, number, number]; // x, y, w, d (tiles)
const DESKS_ROW1: Rect[] = [
  [2.0, 2.2, 2.4, 1.2],
  [6.3, 2.2, 2.4, 1.2],
  [10.6, 2.2, 2.4, 1.2],
];
const DESKS_ROW2: Rect[] = [
  [1.8, 6.4, 2.0, 1.2],
  [4.9, 6.4, 2.0, 1.2],
  [9.6, 6.4, 2.0, 1.2],
  [12.7, 6.4, 2.0, 1.2],
];
const COOLER: Rect = [14.3, 9.9, 1.0, 1.0];
const COMFY_PAD: Rect = [1.0, 9.8, 2.4, 1.3]; // she is furniture now

const BLOCKED: Rect[] = [...DESKS_ROW1, ...DESKS_ROW2, COOLER, COMFY_PAD];

const MIN_X = 0.8,
  MAX_X = 15.4,
  MIN_Y = 3.9,
  MAX_Y = 11.3;

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
  g: SVGGElement | null;
  inner: SVGGElement | null;
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
  className?: string;
}

const IsoBox = ({ r, h = 44, z = 0, top, left, right, ...props }: BoxProps) => {
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
    <g data-key={key.toFixed(2)} {...props}>
      <polygon points={poly([et, ct, c, e])} fill={left} />
      <polygon points={poly([bt, ct, c, b])} fill={right} />
      <polygon points={poly([at, bt, ct, et])} fill={top} />
    </g>
  );
};

const POSTER_A = { x1: 2.6, x2: 5.6, zTop: 122, zBot: 24 };
const POSTER_B = { x1: 7.6, x2: 11.2, zTop: 120, zBot: 20 };
const posterW = (p: { x1: number; x2: number }) => (p.x2 - p.x1) * HX;
const posterH = (p: { zTop: number; zBot: number }) => p.zTop - p.zBot;
const posterXf = (p: { x1: number; zTop: number }) =>
  'matrix(1,0.5,0,1,' + px(p.x1, 0) + ',' + (py(p.x1, 0) - p.zTop) + ')';
const posterFramePts = (p: typeof POSTER_A) =>
  poly([
    [px(p.x1 - 0.1, 0), py(p.x1 - 0.1, 0) - p.zTop - 6],
    [px(p.x2 + 0.1, 0), py(p.x2 + 0.1, 0) - p.zTop - 6],
    [px(p.x2 + 0.1, 0), py(p.x2 + 0.1, 0) - p.zBot + 6],
    [px(p.x1 - 0.1, 0), py(p.x1 - 0.1, 0) - p.zBot + 6],
  ]);

export const ZFlow = () => {
  return (
    <>
      <text class={cn(css.z, css.z1)} x="-64" y="-80">
        z
      </text>
      <text class={cn(css.z, css.z2)} x="-72" y="-86">
        z
      </text>
      <text class={cn(css.z, css.z3)} x="-80" y="-92">
        Z
      </text>
    </>
  );
};

export const Timer = () => {
  const target = 1803027600;

  const now = Math.floor(Date.now() / 1000);
  const secondsLeft = Math.max(target - now, 0);
  const daysLeft = Math.floor(secondsLeft / 86400);

  return <>{daysLeft} days</>;
};

export const Office = () => {
  const sortRef = useRef<SVGGElement>(null);
  const nawniRef = useRef<SVGGElement>(null);
  const nawniInner = useRef<SVGGElement>(null);
  const smileyRef = useRef<SVGGElement>(null);
  const smileyInner = useRef<SVGGElement>(null);

  const poniesRef = useRef<Pony[]>([]);

  // --- walker sim -------------------------------------------------------------
  useEffect(() => {
    const ponies: Pony[] = [
      {
        name: 'NAWNI',
        img: nawniImg,
        w: 144,
        h: 118,
        facesRight: true,
        x: 8.2,
        y: 9.8,
        path: [],
        mode: 'idle',
        idleUntil: 0,
        facing: 1,
        phase: 0,
        speed: 1.6,
        startleUntil: 0,
        g: nawniRef.current,
        inner: nawniInner.current,
      },
      {
        name: 'SMILEY',
        img: smileyImg,
        w: 132,
        h: 112,
        facesRight: true,
        x: 11.0,
        y: 10.1,
        path: [],
        mode: 'idle',
        idleUntil: 800,
        facing: -1,
        phase: 1.4,
        speed: 1.2,
        startleUntil: 0,
        g: smileyRef.current,
        inner: smileyInner.current,
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
          // pure startle-bounce: squish, hop, wiggle
          p.phase += dt * 18;
          squash = 1 + Math.sin(p.phase) * 0.16;
          hop = Math.abs(Math.sin(p.phase * 0.5)) * 10;
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
            (p.facing * (p.facesRight ? -1 : 1) * ds).toFixed(3) +
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
  }, []);

  const startle = (which: string) => {
    const p = poniesRef.current.find((q) => q.name === which);
    if (!p) return;
    p.startleUntil = performance.now() + 850;
  };

  return (
    <div class={css.stage}>
      <header class={css.topbar}>
        <div>
          MARECON<span class={css.tm}>™</span> 2027
        </div>
      </header>

      <div class={css.scene}>
        <svg viewBox={'0 0 ' + SCENE_W + ' ' + SCENE_H} width="100%">
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

          {/* the break rug */}
          <polygon
            class={css.rug}
            points={poly([
              Pt(0.9, 9.8),
              Pt(3.4, 9.8),
              Pt(3.4, 11.1),
              Pt(0.9, 11.1),
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

          {/* posters on the y=0 wall (kitten placeholders) */}
          <polygon class={css.posterFrame} points={posterFramePts(POSTER_A)} />
          <image
            href={placeholder}
            width={posterW(POSTER_A)}
            height={posterH(POSTER_A)}
            preserveAspectRatio="xMidYMid slice"
            transform={posterXf(POSTER_A)}
          />
          <polygon class={css.posterFrame} points={posterFramePts(POSTER_B)} />
          <image
            href={logo}
            width={posterW(POSTER_B)}
            height={posterH(POSTER_B)}
            preserveAspectRatio="xMidYMid slice"
            transform={posterXf(POSTER_B)}
          />

          {/* door on the x=0 wall */}
          <polygon
            class={css.door}
            points={poly([
              [px(0, 5.6), py(0, 5.6) - 92],
              [px(0, 7.6), py(0, 7.6) - 92],
              Pt(0, 7.6),
              Pt(0, 5.6),
            ])}
          />
          <text
            class={css.doorSign}
            transform={
              'matrix(1,-0.5,0,2,' + px(0, 7) + ',' + (py(0, 7) - 102) + ')'
            }
          >
            EXIT
          </text>

          {/* ---- sort layer: furniture + ponies ---- */}
          <g ref={sortRef}>
            {DESKS_ROW1.map((r, i) => (
              <IsoBox
                key={'d1' + i}
                r={r}
                h={DESK_H}
                top="#6e5c4c"
                left="#584a3d"
                right="#463a30"
              />
            ))}
            {DESKS_ROW2.map((r, i) => (
              <IsoBox
                key={'d2' + i}
                r={r}
                h={DESK_H}
                top="#6e5c4c"
                left="#584a3d"
                right="#463a30"
              />
            ))}
            {DESKS_ROW1.concat(DESKS_ROW2).map((r, i) => (
              <IsoBox
                key={'p' + i}
                r={[r[0], r[1] - 0.28, r[2], 0.28]}
                h={PART_H}
                top="#5d6670"
                left="#4a525b"
                right="#3c434b"
              />
            ))}

            <IsoBox
              r={COOLER}
              h={82}
              top="#6f93a6"
              left="#59788a"
              right="#476174"
            />
            <IsoBox
              className={css.coolerTop}
              r={[COOLER[0] + 0.19, COOLER[1] + 0.52, 0.7, 0.7]}
              h={24}
              z={10}
              top="#cfe8f7"
              left="#9cc4dd"
              right="#7aa6c2"
            />

            {/* Nawni */}
            <g
              ref={nawniRef}
              data-key="18"
              class={css.pony}
              transform={'translate(' + px(8.2, 9.8) + ',' + py(8.2, 9.8) + ')'}
              onPointerDown={() => startle('NAWNI')}
            >
              <ellipse class={css.shadow} cx="-8" cy="-4" rx="48" ry="10" />
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
                class={css.tag}
                y="-132"
                textAnchor="middle"
                pointerEvents="none"
              >
                NAWNI
              </text>
            </g>

            {/* Smiley */}
            <g
              ref={smileyRef}
              data-key="21.1"
              class={css.pony}
              transform={'translate(' + px(11, 10.1) + ',' + py(11, 10.1) + ')'}
              onPointerDown={() => startle('SMILEY')}
            >
              <ellipse class={css.shadow} cx="0" cy="-8" rx="48" ry="9" />
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
                class={css.tag}
                y="-124"
                textAnchor="middle"
                pointerEvents="none"
              >
                SMILEY
              </text>
            </g>

            {/* Comfy: laying in the corner, breathing, dreaming of freedom */}
            <g
              data-key="12.4"
              class={css.pony}
              transform={
                'translate(' + px(2.1, 10.3) + ',' + py(2.1, 11.3) + ')'
              }
            >
              <ellipse class={css.shadow} cx="0" cy="-16" rx="52" ry="12" />
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
                class={css.tag}
                y="-104"
                textAnchor="middle"
                pointerEvents="none"
              >
                COMFY
              </text>
              <ZFlow />
            </g>
          </g>

          {/* the warm band that makes everyone look busy */}
          <g class={css.bandG} pointerEvents="none">
            <rect
              x="-90"
              y="-160"
              width="200"
              height="1150"
              fill="url(#sweepGrad)"
              transform="skewY(26.57)"
            />
          </g>
        </svg>
      </div>

      <div class={css.timerWrapper}>
        Con starts in <Timer />
      </div>

      <nav class={css.actions}>
        <a class={css.keybtn} href={ARCHIVE_URL}>
          <span class={css.keyTitle}>ARCHIVE</span>
          <span class={css.keySub}>Check it out ↗</span>
        </a>
        <a
          class={cn(css.keybtn, css.primary)}
          href={VOLUNTEER_FORM_LINK}
          target="_blank"
          rel="noreferrer"
        >
          <span class={css.keyTitle}>VOLUNTEER</span>
          <span class={css.keySub}>please?</span>
        </a>
      </nav>
    </div>
  );
};
