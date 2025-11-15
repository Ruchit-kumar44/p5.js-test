import fs from 'fs';
import path from 'path';
import sharp from 'sharp';
import fetch from 'node-fetch';

const CONTRIBUTORS_FILE = path.resolve('contributors.md');
const OUTPUT_FILE = path.resolve('contributors.png');

// how many contributors to include
const LIMIT = 350;

// layout
const AVATAR_SIZE = 64;
const PER_ROW = 26;
const PADDING = 6;

// fallback placeholder
const FALLBACK_AVATAR = Buffer.from(
  fs.readFileSync(path.resolve('utils/allContributors-image/fallback.png'))
);

// ----------------------------
// Parse contributors.md
// ----------------------------
function extractAvatars(md) {
  const regex = /<img src="([^"]+)"[^>]*>/g;
  const avatars = [];
  let match;

  while ((match = regex.exec(md))) {
    let url = match[1];

    // ensure ?s=64 exists for sharp scaling
    if (!url.includes('?')) {
      url += '?s=64';
    }

    avatars.push(url);
  }

  return avatars;
}

// ----------------------------
// Download avatar safely
// ----------------------------
async function downloadAvatar(url) {
  try {
    const res = await fetch(url, { timeout: 8000 });

    if (!res.ok) throw new Error('Bad response: ' + res.status);

    const buffer = await res.buffer();

    // verify buffer is a real image
    await sharp(buffer).metadata();

    return buffer;
  } catch (err) {
    console.log(`⚠ Failed: ${url} → using fallback`);
    return FALLBACK_AVATAR;
  }
}

// ----------------------------
// Round avatar (circle mask)
// ----------------------------
async function processAvatar(buffer) {
  const circleMask = Buffer.from(
    `<svg width="${AVATAR_SIZE}" height="${AVATAR_SIZE}">
      <circle cx="${AVATAR_SIZE / 2}" cy="${AVATAR_SIZE / 2}" r="${AVATAR_SIZE / 2}" fill="white"/>
     </svg>`
  );

  return await sharp(buffer)
    .resize(AVATAR_SIZE, AVATAR_SIZE)
    .composite([{ input: circleMask, blend: 'dest-in' }])
    .png()
    .toBuffer();
}

// ----------------------------
// Generate the grid (26 per row)
// ----------------------------
async function generateGrid(avatars) {
  const rows = Math.ceil(avatars.length / PER_ROW);

  const width = PER_ROW * (AVATAR_SIZE + PADDING) + PADDING;
  const height = rows * (AVATAR_SIZE + PADDING) + PADDING;

  const canvas = sharp({
    create: {
      width,
      height,
      channels: 4,
      background: '#ffffff'
    }
  }).png();

  const composites = [];

  for (let i = 0; i < avatars.length; i++) {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;

    const x = PADDING + col * (AVATAR_SIZE + PADDING);
    const y = PADDING + row * (AVATAR_SIZE + PADDING);

    const rounded = await processAvatar(avatars[i]);

    composites.push({ input: rounded, left: x, top: y });
  }

  return canvas.composite(composites).toBuffer();
}

// ----------------------------
// MAIN
// ----------------------------
async function main() {
  console.log('📥 Reading contributors.md...');

  const md = fs.readFileSync(CONTRIBUTORS_FILE, 'utf8');

  console.log('📄 Extracting avatar URLs...');
  let avatars = extractAvatars(md);

  console.log(`✔ Found ${avatars.length} avatars total`);

  // Take the *most recent* (first in file)
  avatars = avatars.slice(0, LIMIT);
  console.log(`✨ Using only latest ${avatars.length} contributors`);

  console.log('⬇ Downloading avatars...');
  const downloaded = [];
  for (const url of avatars) {
    downloaded.push(await downloadAvatar(url));
  }

  console.log('🖼 Generating horizontal banner...');
  const output = await generateGrid(downloaded);

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, output);

  console.log(`🎉 DONE! Saved → ${OUTPUT_FILE}`);
}

main();
