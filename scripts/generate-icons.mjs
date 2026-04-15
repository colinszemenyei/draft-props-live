// Generate PWA icons as PNG files using SVG → sharp conversion
// Run: node scripts/generate-icons.mjs

import { writeFileSync } from 'fs';

const svgIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="96" fill="#013369"/>
  <text x="256" y="200" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-weight="900" font-size="160" fill="#ffffff">DP</text>
  <text x="256" y="340" text-anchor="middle" font-family="system-ui,-apple-system,sans-serif" font-weight="800" font-size="100" fill="#d50a0a">LIVE</text>
  <circle cx="430" cy="90" r="40" fill="#d50a0a"/>
  <circle cx="430" cy="90" r="16" fill="#ffffff"/>
</svg>`;

// Write SVG files that can be used directly or converted
for (const size of [192, 512]) {
  writeFileSync(`public/icons/icon-${size}.svg`, svgIcon(size));
}

console.log('SVG icons generated. Converting to PNG...');

// Try sharp, fall back to keeping SVGs
try {
  const { default: sharp } = await import('sharp');
  for (const size of [192, 512]) {
    await sharp(Buffer.from(svgIcon(512)))
      .resize(size, size)
      .png()
      .toFile(`public/icons/icon-${size}.png`);
    console.log(`  ✓ icon-${size}.png`);
  }
  // Apple touch icon
  await sharp(Buffer.from(svgIcon(512)))
    .resize(180, 180)
    .png()
    .toFile('public/apple-touch-icon.png');
  console.log('  ✓ apple-touch-icon.png');
  // Favicon
  await sharp(Buffer.from(svgIcon(512)))
    .resize(32, 32)
    .png()
    .toFile('public/favicon.png');
  console.log('  ✓ favicon.png');
  console.log('Done!');
} catch {
  console.log('sharp not available — using SVG icons directly.');
  console.log('To generate PNGs: npm install -D sharp && node scripts/generate-icons.mjs');
  // Update manifest to use SVGs
  writeFileSync('public/icons/icon-192.png', '');
  writeFileSync('public/icons/icon-512.png', '');
}
