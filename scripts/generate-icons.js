import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const publicDir = path.resolve('public');
const iconSvg = path.join(publicDir, 'icon.svg');
const maskableSvg = path.join(publicDir, 'icon-maskable.svg');

async function generate() {
  console.log('Generating PWA icons...');
  const iconSvgBuffer = fs.readFileSync(iconSvg);
  const maskableSvgBuffer = fs.readFileSync(maskableSvg);

  // Standard icons
  await sharp(iconSvgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-192.png'));
  await sharp(iconSvgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-512.png'));

  // Maskable icons (with safe margin)
  await sharp(maskableSvgBuffer).resize(192, 192).png().toFile(path.join(publicDir, 'icon-maskable-192.png'));
  await sharp(maskableSvgBuffer).resize(512, 512).png().toFile(path.join(publicDir, 'icon-maskable-512.png'));

  // iOS Apple touch icon (180x180)
  await sharp(iconSvgBuffer).resize(180, 180).png().toFile(path.join(publicDir, 'apple-touch-icon.png'));

  // Favicon 32x32 and 48x48
  await sharp(iconSvgBuffer).resize(32, 32).png().toFile(path.join(publicDir, 'favicon-32x32.png'));
  await sharp(iconSvgBuffer).resize(48, 48).png().toFile(path.join(publicDir, 'favicon-48x48.png'));

  console.log('All PWA PNG icons generated successfully!');
}

generate().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
