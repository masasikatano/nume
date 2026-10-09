import sharp from 'sharp';

const OG_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#eceffa"/>
      <stop offset="100%" stop-color="#c9d4ef"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#g)"/>
  <circle cx="600" cy="220" r="95" fill="#3d5a99" opacity="0.14"/>
  <text x="600" y="350" text-anchor="middle" font-size="112" fill="#2b3f6e" font-family="YuGothic, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif" font-weight="bold">nume</text>
  <text x="600" y="425" text-anchor="middle" font-size="40" fill="#3d5a99" font-family="YuGothic, 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', sans-serif">数秘術ライフパスナンバー占い</text>
</svg>`;

function iconSvg(size) {
  const fontSize = Math.round(size * 0.62);
  const radius = Math.round(size * 0.2);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    <rect width="${size}" height="${size}" rx="${radius}" fill="#3d5a99"/>
    <text x="${size / 2}" y="${Math.round(size * 0.74)}" text-anchor="middle" font-size="${fontSize}" fill="#ffffff" font-family="Georgia, serif" font-weight="bold">N</text>
  </svg>`;
}

async function main() {
  await sharp(Buffer.from(OG_SVG))
    .png({ compressionLevel: 9 })
    .toFile('public/ogp-default.png');
  console.log('Generated public/ogp-default.png');

  for (const { size, name } of [
    { size: 180, name: 'apple-touch-icon.png' },
    { size: 192, name: 'icon-192.png' },
    { size: 512, name: 'icon-512.png' },
  ]) {
    await sharp(Buffer.from(iconSvg(size)))
      .png({ compressionLevel: 9 })
      .toFile(`public/${name}`);
    console.log(`Generated public/${name}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
