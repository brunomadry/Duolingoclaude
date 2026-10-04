import {
  createAppleSplashScreens,
  defineConfig,
  minimal2023Preset,
} from '@vite-pwa/assets-generator/config';

// One-off generator for PNG icons and iOS splash screens from public/icon.svg.
// Run `npm run icons` after changing the icon, then commit the PNGs in public/.
const SUMI = '#0f0d0e';

export default defineConfig({
  headLinkOptions: { preset: '2023' },
  preset: {
    ...minimal2023Preset,
    transparent: { ...minimal2023Preset.transparent, padding: 0 },
    maskable: { sizes: [512], padding: 0, resizeOptions: { background: SUMI } },
    apple: { sizes: [180], padding: 0, resizeOptions: { background: SUMI } },
    appleSplashScreens: createAppleSplashScreens(
      {
        padding: 0.55,
        resizeOptions: { background: SUMI, fit: 'contain' },
        linkMediaOptions: { log: true, addMediaScreen: true, xhtml: false },
        png: { compressionLevel: 9, quality: 70 },
      },
      [
        'iPhone 17 Pro Max',
        'iPhone 17 Pro',
        'iPhone Air',
        'iPhone 17',
        'iPhone 16 Pro Max',
        'iPhone 16 Pro',
        'iPhone 16 Plus',
        'iPhone 16',
        'iPhone 16e',
        'iPhone 15 Pro Max',
        'iPhone 15 Pro',
        'iPhone 15',
        'iPhone 14 Plus',
        'iPhone 13 mini',
        'iPhone 11',
        'iPhone SE 4.7"',
      ],
    ),
  },
  images: ['public/icon.svg'],
});
