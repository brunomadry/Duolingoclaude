/**
 * Original red panda mascot, built from composable flat SVG parts.
 *
 * Every pose and every avatar is assembled from the same shapes below, so the
 * character stays consistent and the payload stays tiny. All functions return
 * SVG markup strings (trusted, static, generated here) so the same code can
 * render inside Preact and write standalone .svg files from a Node script.
 *
 * Coordinate space: full body uses viewBox "0 0 200 200"; the head is centred
 * near (100, 80). Avatars crop the same drawing to the head and shoulders.
 */

import type { AvatarId } from '../shared/avatars.ts';

export const MASCOT_COLORS = {
  fur: '#c65a2e',
  furLight: '#dc7c46',
  furShade: '#a5461f',
  cream: '#f3e6d3',
  creamShade: '#e3d2bb',
  dark: '#2b1c19',
  earInner: '#5a2a1a',
  stripe: '#9a3e1c',
  nose: '#1f1414',
  eye: '#1c1214',
  shine: '#ffffff',
  blush: '#e88a6c',
  tailLight: '#e0915a',
  tailRing: '#8e3a1b',
  vermilion: '#c23a20',
  gold: '#c9a35b',
  matcha: '#7bae7f',
  matchaDark: '#4f7d53',
  sakura: '#f4b6c2',
  sakuraCore: '#d9667f',
  straw: '#d8b26e',
  strawShade: '#b38c4a',
  white: '#fbf6ee',
} as const;

const C = MASCOT_COLORS;

export type Pose = 'idle' | 'happy' | 'thinking' | 'celebrating' | 'sleepy';
export type EyeStyle = 'open' | 'happy' | 'closed' | 'look-up';
export type MouthStyle = 'calm' | 'smile' | 'open' | 'small';
export type Accessory =
  'none' | 'scarf' | 'hat' | 'glasses' | 'leaf' | 'headband' | 'sakura' | 'nightcap';

export const POSES: readonly Pose[] = ['idle', 'happy', 'thinking', 'celebrating', 'sleepy'];

/* ------------------------------------------------------------------ tail */

/** Centre line of the tail; drawn twice (fur, then dashed rings) for the ringed look. */
const TAIL_PATH = 'M 128 184 C 164 190, 180 168, 176 138 C 174 120, 166 108, 156 100';

export function tail(): string {
  return `<g class="m-tail">
    <path d="${TAIL_PATH}" fill="none" stroke="${C.tailLight}" stroke-width="30" stroke-linecap="round"/>
    <path d="${TAIL_PATH}" fill="none" stroke="${C.tailRing}" stroke-width="30" stroke-dasharray="10 13" stroke-dashoffset="6"/>
    <circle cx="156" cy="100" r="15" fill="${C.tailRing}"/>
  </g>`;
}

/* ------------------------------------------------------------------ body */

export function body(): string {
  return `<g class="m-body">
    <path d="M 62 114 C 46 136, 42 166, 52 184 C 64 198, 136 198, 148 184 C 158 166, 154 136, 138 114 Z" fill="${C.fur}"/>
    <path d="M 78 132 C 70 150, 70 172, 78 186 C 90 192, 110 192, 122 186 C 130 172, 130 150, 122 132 C 110 126, 90 126, 78 132 Z" fill="${C.dark}" opacity="0.85"/>
    <ellipse cx="76" cy="190" rx="18" ry="9" fill="${C.dark}"/>
    <ellipse cx="124" cy="190" rx="18" ry="9" fill="${C.dark}"/>
  </g>`;
}

/* ------------------------------------------------------------------ arms */

interface Arm {
  from: [number, number];
  to: [number, number];
}

const ARMS: Record<Pose, Arm[]> = {
  idle: [
    { from: [72, 134], to: [84, 168] },
    { from: [128, 134], to: [116, 168] },
  ],
  happy: [
    { from: [72, 134], to: [84, 168] },
    { from: [132, 130], to: [168, 82] },
  ],
  thinking: [
    { from: [72, 134], to: [84, 168] },
    { from: [130, 134], to: [114, 122] },
  ],
  celebrating: [
    { from: [68, 130], to: [32, 82] },
    { from: [132, 130], to: [168, 82] },
  ],
  sleepy: [
    { from: [72, 136], to: [93, 162] },
    { from: [128, 136], to: [107, 162] },
  ],
};

export function arms(pose: Pose): string {
  return `<g class="m-arms" fill="none" stroke="${C.dark}" stroke-width="17" stroke-linecap="round">${ARMS[
    pose
  ]
    .map((a) => `<path d="M ${a.from[0]} ${a.from[1]} L ${a.to[0]} ${a.to[1]}"/>`)
    .join('')}</g>`;
}

/* ------------------------------------------------------------------ head */

export function ears(): string {
  const ear = (flip: boolean): string => {
    const t = flip ? ' transform="translate(200 0) scale(-1 1)"' : '';
    return `<g${t}>
      <path d="M 50 70 C 42 48, 46 26, 62 18 C 76 22, 88 36, 88 50 Z" fill="${C.cream}"/>
      <path d="M 57 62 C 53 47, 56 33, 64 27 C 73 31, 80 40, 80 50 Z" fill="${C.earInner}"/>
    </g>`;
  };
  return `<g class="m-ears">${ear(false)}${ear(true)}</g>`;
}

export function headBase(): string {
  return `<path class="m-head" d="M 44 84 C 44 52, 70 36, 100 36 C 130 36, 156 52, 156 84 C 156 92, 160 98, 164 103 C 156 105, 151 109, 146 113 C 134 123, 118 127, 100 127 C 82 127, 66 123, 54 113 C 49 109, 44 105, 36 103 C 40 98, 44 92, 44 84 Z" fill="${C.fur}"/>`;
}

export function faceMarkings(): string {
  const side = (flip: boolean): string => {
    const t = flip ? ' transform="translate(200 0) scale(-1 1)"' : '';
    return `<g${t}>
      <path d="M 46 100 C 52 90, 64 88, 74 92 C 80 102, 82 112, 78 120 C 66 120, 54 114, 46 100 Z" fill="${C.cream}"/>
      <ellipse cx="78" cy="63" rx="9" ry="5.5" fill="${C.cream}" transform="rotate(-12 78 63)"/>
      <path d="M 79 89 C 80 98, 82 106, 86 113" fill="none" stroke="${C.stripe}" stroke-width="5" stroke-linecap="round"/>
    </g>`;
  };
  return `<g class="m-face">
    ${side(false)}${side(true)}
    <path d="M 82 104 C 82 94, 92 90, 100 90 C 108 90, 118 94, 118 104 C 118 114, 110 120, 100 120 C 90 120, 82 114, 82 104 Z" fill="${C.cream}"/>
  </g>`;
}

export function eyes(style: EyeStyle): string {
  const pos: [number, number][] = [
    [80, 80],
    [120, 80],
  ];
  const stroke = `fill="none" stroke="${C.eye}" stroke-width="3.6" stroke-linecap="round"`;
  switch (style) {
    case 'open':
      return `<g class="m-eyes">${pos
        .map(
          ([x, y]) => `<g class="m-eye">
            <ellipse cx="${x}" cy="${y}" rx="7" ry="8" fill="${C.eye}"/>
            <circle cx="${x - 2.4}" cy="${y - 3}" r="2.6" fill="${C.shine}"/>
            <circle cx="${x + 2.4}" cy="${y + 3}" r="1.1" fill="${C.shine}" opacity="0.7"/>
          </g>`,
        )
        .join('')}</g>`;
    case 'look-up':
      return `<g class="m-eyes">${pos
        .map(
          ([x, y]) => `<g class="m-eye">
            <ellipse cx="${x}" cy="${y}" rx="7" ry="8" fill="${C.eye}"/>
            <circle cx="${x + 2}" cy="${y - 4}" r="2.6" fill="${C.shine}"/>
          </g>`,
        )
        .join('')}</g>`;
    case 'happy':
      return `<g class="m-eyes">${pos
        .map(
          ([x, y]) => `<path d="M ${x - 7} ${y + 2} Q ${x} ${y - 7} ${x + 7} ${y + 2}" ${stroke}/>`,
        )
        .join('')}</g>`;
    case 'closed':
      return `<g class="m-eyes">${pos
        .map(([x, y]) => `<path d="M ${x - 7} ${y} Q ${x} ${y + 6} ${x + 7} ${y}" ${stroke}/>`)
        .join('')}</g>`;
  }
}

export function noseAndMouth(mouth: MouthStyle): string {
  const nose = `<path d="M 93 97 C 93 94, 107 94, 107 97 C 107 101, 102 104, 100 104 C 98 104, 93 101, 93 97 Z" fill="${C.nose}"/>`;
  const line = `fill="none" stroke="${C.nose}" stroke-width="2.4" stroke-linecap="round"`;
  let m: string;
  switch (mouth) {
    case 'calm':
      m = `<path d="M 100 104 L 100 107 M 93 108 Q 96.5 111 100 107 Q 103.5 111 107 108" ${line}/>`;
      break;
    case 'smile':
      m = `<path d="M 100 104 L 100 107 M 91 107 Q 95.5 113 100 107 Q 104.5 113 109 107" ${line}/>`;
      break;
    case 'open':
      m = `<path d="M 100 104 L 100 106" ${line}/><path d="M 92 107 Q 100 106 108 107 Q 106 117 100 117 Q 94 117 92 107 Z" fill="${C.nose}"/><path d="M 96 113 Q 100 110.5 104 113 Q 102 116 100 116 Q 98 116 96 113 Z" fill="${C.blush}"/>`;
      break;
    case 'small':
      m = `<path d="M 100 104 L 100 107 M 96 109 Q 100 111 104 109" ${line}/>`;
      break;
  }
  return `<g class="m-mouth">${nose}${m}</g>`;
}

export function blush(): string {
  return `<g class="m-blush" fill="${C.blush}" opacity="0.45">
    <ellipse cx="66" cy="99" rx="6" ry="3.5"/><ellipse cx="134" cy="99" rx="6" ry="3.5"/>
  </g>`;
}

/* ------------------------------------------------------------- extras */

function sparkle(x: number, y: number, s: number, color: string): string {
  return `<path d="M ${x} ${y - s} Q ${x + s * 0.18} ${y - s * 0.18} ${x + s} ${y} Q ${x + s * 0.18} ${y + s * 0.18} ${x} ${y + s} Q ${x - s * 0.18} ${y + s * 0.18} ${x - s} ${y} Q ${x - s * 0.18} ${y - s * 0.18} ${x} ${y - s} Z" fill="${color}"/>`;
}

export function poseExtras(pose: Pose): string {
  switch (pose) {
    case 'celebrating':
      return `<g class="m-sparkles">${sparkle(30, 70, 7, C.gold)}${sparkle(172, 60, 6, C.gold)}${sparkle(24, 118, 4, C.gold)}</g>`;
    case 'thinking':
      return `<g class="m-thought" fill="${C.cream}" opacity="0.85">
        <circle cx="158" cy="44" r="3"/><circle cx="168" cy="32" r="4.5"/><circle cx="181" cy="18" r="6.5"/>
      </g>`;
    case 'sleepy':
      return `<g class="m-zzz" fill="none" stroke="${C.cream}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" opacity="0.85">
        <path d="M 150 40 L 160 40 L 150 50 L 160 50"/><path d="M 166 24 L 173 24 L 166 31 L 173 31"/>
      </g>`;
    default:
      return '';
  }
}

/* --------------------------------------------------------- accessories */

/** Accessories that sit behind the ears (none yet) vs on top of the head. */
export function accessory(kind: Accessory): string {
  switch (kind) {
    case 'none':
      return '';
    case 'scarf':
      return `<g class="m-acc-scarf">
        <path d="M 58 116 C 76 130, 124 130, 142 116 L 145 128 C 124 142, 76 142, 55 128 Z" fill="${C.vermilion}"/>
        <path d="M 66 128 C 62 142, 60 156, 64 166 L 78 162 C 76 152, 78 142, 82 133 Z" fill="${C.vermilion}"/>
        <path d="M 57 122 C 78 135, 122 135, 143 122" fill="none" stroke="${C.gold}" stroke-width="2"/>
      </g>`;
    case 'hat':
      return `<g class="m-acc-hat" transform="rotate(-6 100 40)">
        <path d="M 34 52 L 100 10 L 166 52 C 140 60, 60 60, 34 52 Z" fill="${C.straw}"/>
        <path d="M 100 10 L 70 56 M 100 10 L 130 56 M 100 10 L 100 58" stroke="${C.strawShade}" stroke-width="1.6" fill="none"/>
        <path d="M 46 50 C 76 57, 124 57, 154 50" stroke="${C.vermilion}" stroke-width="4" fill="none"/>
      </g>`;
    case 'glasses':
      return `<g class="m-acc-glasses" fill="none" stroke="${C.gold}" stroke-width="2.6">
        <circle cx="80" cy="80" r="13"/><circle cx="120" cy="80" r="13"/>
        <path d="M 93 79 Q 100 74 107 79 M 67 78 L 52 72 M 133 78 L 148 72"/>
      </g>`;
    case 'leaf':
      return `<g class="m-acc-leaf" transform="rotate(18 100 34)">
        <path d="M 100 46 C 84 36, 86 16, 104 8 C 118 20, 116 40, 100 46 Z" fill="${C.matcha}"/>
        <path d="M 100 46 C 101 34, 102 22, 104 10" stroke="${C.matchaDark}" stroke-width="2" fill="none"/>
      </g>`;
    case 'headband':
      return `<g class="m-acc-headband">
        <path d="M 46 62 C 72 50, 128 50, 154 62 L 152 72 C 126 61, 74 61, 48 72 Z" fill="${C.white}"/>
        <circle cx="100" cy="59" r="5.5" fill="${C.vermilion}"/>
        <path d="M 151 66 C 159 64, 165 69, 169 77 L 162 79 C 159 74, 155 71, 151 71 Z M 151 68 C 160 72, 163 81, 163 91 L 157 89 C 157 82, 155 76, 150 72 Z" fill="${C.white}"/>
      </g>`;
    case 'sakura': {
      const petals = [0, 72, 144, 216, 288]
        .map(
          (a) =>
            `<ellipse cx="0" cy="-7" rx="5" ry="7.5" fill="${C.sakura}" transform="rotate(${a})"/>`,
        )
        .join('');
      return `<g class="m-acc-sakura" transform="translate(62 42) rotate(10)">${petals}<circle r="3.2" fill="${C.sakuraCore}"/></g>`;
    }
    case 'nightcap':
      return `<g class="m-acc-nightcap">
        <path d="M 52 54 C 64 26, 104 14, 136 22 C 154 28, 168 44, 172 62 C 160 52, 148 44, 136 42 C 124 40, 140 48, 148 54 C 120 44, 80 44, 52 54 Z" fill="#3f4f78"/>
        <path d="M 50 54 C 80 42, 120 42, 150 54 L 148 63 C 118 52, 82 52, 52 63 Z" fill="${C.white}"/>
        <circle cx="173" cy="64" r="7" fill="${C.white}"/>
      </g>`;
  }
}

/* ------------------------------------------------------------ assembly */

interface PoseFace {
  eyes: EyeStyle;
  mouth: MouthStyle;
  blush: boolean;
}

const POSE_FACE: Record<Pose, PoseFace> = {
  idle: { eyes: 'open', mouth: 'calm', blush: false },
  happy: { eyes: 'happy', mouth: 'smile', blush: true },
  thinking: { eyes: 'look-up', mouth: 'small', blush: false },
  celebrating: { eyes: 'happy', mouth: 'open', blush: true },
  sleepy: { eyes: 'closed', mouth: 'small', blush: false },
};

export interface HeadOptions {
  eyes: EyeStyle;
  mouth: MouthStyle;
  blush?: boolean;
  accessory?: Accessory;
}

/** Ears, head, face and the accessory. Shared by full poses and avatars. */
export function head(opts: HeadOptions): string {
  const acc = opts.accessory ?? 'none';
  return `<g class="m-headgroup">
    ${acc === 'hat' ? '' : ears()}
    ${headBase()}
    ${faceMarkings()}
    ${opts.blush ? blush() : ''}
    ${eyes(opts.eyes)}
    ${noseAndMouth(opts.mouth)}
    ${accessory(acc)}
  </g>`;
}

export const FULL_VIEWBOX = '0 0 200 200';
export const HEAD_VIEWBOX = '28 6 144 144';

/** Full-body mascot in the given pose. */
export function composePose(pose: Pose, acc: Accessory = 'none'): string {
  const face = POSE_FACE[pose];
  const thinkingArm = pose === 'thinking';
  return [
    tail(),
    body(),
    thinkingArm ? '' : arms(pose),
    head({ ...face, accessory: acc }),
    // In the thinking pose the paw rests on the chin, so it draws above the head.
    thinkingArm ? arms(pose) : '',
    poseExtras(pose),
  ].join('');
}

/* -------------------------------------------------------------- avatars */

export { AVATAR_IDS, isAvatarId, type AvatarId } from '../shared/avatars.ts';

interface AvatarSpec {
  label: string;
  accessory: Accessory;
  eyes: EyeStyle;
  mouth: MouthStyle;
  /** Backdrop tint behind the head, drawn as a circle in the avatar. */
  backdrop: string;
}

/** Polish labels are UI strings; ids are stable keys stored on the server. */
export const AVATARS: Record<AvatarId, AvatarSpec> = {
  plain: {
    label: 'Klasyczna',
    accessory: 'none',
    eyes: 'open',
    mouth: 'calm',
    backdrop: '#3a2a2a',
  },
  scarf: { label: 'Szalik', accessory: 'scarf', eyes: 'open', mouth: 'smile', backdrop: '#2f3440' },
  hat: { label: 'Kapelusz', accessory: 'hat', eyes: 'open', mouth: 'calm', backdrop: '#33402f' },
  glasses: {
    label: 'Okulary',
    accessory: 'glasses',
    eyes: 'open',
    mouth: 'small',
    backdrop: '#40332a',
  },
  leaf: { label: 'Listek', accessory: 'leaf', eyes: 'happy', mouth: 'smile', backdrop: '#2a3a36' },
  headband: {
    label: 'Opaska',
    accessory: 'headband',
    eyes: 'open',
    mouth: 'smile',
    backdrop: '#3d2b33',
  },
  sakura: {
    label: 'Sakura',
    accessory: 'sakura',
    eyes: 'happy',
    mouth: 'calm',
    backdrop: '#40303a',
  },
  sleepy: {
    label: 'Śpioch',
    accessory: 'nightcap',
    eyes: 'closed',
    mouth: 'small',
    backdrop: '#262d40',
  },
};

/** Head-and-shoulders avatar, cropped with HEAD_VIEWBOX. */
export function composeAvatar(id: AvatarId): string {
  const spec = AVATARS[id];
  return [
    `<circle cx="100" cy="78" r="72" fill="${spec.backdrop}"/>`,
    `<path d="M 60 120 C 52 132, 50 146, 52 160 L 148 160 C 150 146, 148 132, 140 120 Z" fill="${C.fur}"/>`,
    head({
      eyes: spec.eyes,
      mouth: spec.mouth,
      accessory: spec.accessory,
      blush: spec.eyes === 'happy',
    }),
  ].join('');
}

/** Wraps inner markup into a standalone SVG document (used by the build script). */
export function toSvgDocument(inner: string, viewBox: string, title: string): string {
  const clean = inner.replace(/\n\s*/g, '');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${title}"><title>${title}</title>${clean}</svg>\n`;
}
