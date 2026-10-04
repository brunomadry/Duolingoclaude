/**
 * Writes the mascot source SVGs (5 poses + 8 avatars + app icon) to src/assets/mascot/
 * from the composable parts in src/mascot/parts.ts. Run after editing parts:
 *   npm run mascot
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  AVATAR_IDS,
  FULL_VIEWBOX,
  HEAD_VIEWBOX,
  POSES,
  composeAvatar,
  composePose,
  head,
  toSvgDocument,
} from '../src/mascot/parts.ts';

const outDir = new URL('../src/assets/mascot/', import.meta.url);
mkdirSync(outDir, { recursive: true });

let total = 0;
function write(name: string, svg: string): void {
  writeFileSync(new URL(name, outDir), svg);
  total += svg.length;
  console.log(`${name.padEnd(22)} ${svg.length} bytes`);
}

for (const pose of POSES) {
  write(`${pose}.svg`, toSvgDocument(composePose(pose), FULL_VIEWBOX, `Aka, pose: ${pose}`));
}
for (const id of AVATAR_IDS) {
  write(`avatar-${id}.svg`, toSvgDocument(composeAvatar(id), HEAD_VIEWBOX, `Avatar: ${id}`));
}

// App icon: sumi square, vermilion seal disc, the panda head on top.
const icon = [
  '<rect x="-100" y="-100" width="400" height="400" fill="#0f0d0e"/>',
  '<circle cx="100" cy="86" r="66" fill="#c23a20"/>',
  `<g transform="translate(100 90) scale(0.86) translate(-100 -82)">${head({ eyes: 'open', mouth: 'calm' })}</g>`,
].join('');
write('icon.svg', toSvgDocument(icon, '0 0 200 200', 'Aka Nihongo'));
writeFileSync(
  new URL('../public/icon.svg', import.meta.url),
  toSvgDocument(icon, '0 0 200 200', 'Aka Nihongo'),
);

console.log(`\nTotal ${total} bytes.`);
