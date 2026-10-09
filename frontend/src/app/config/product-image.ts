import { CATALOG_PHOTOS } from './catalog-photos';

// Replace only the original generated seed artwork. A seller's own photo always wins.
export function catalogPhoto(sku: string, imageUrl: string): string {
  if (!sku || !imageUrl || !CATALOG_PHOTOS[sku]) return imageUrl;
  const seedPath = '/images/catalog/' + sku.toLowerCase() + '.svg';
  const originalSeed = imageUrl === seedPath || imageUrl === 'http://localhost:4200' + seedPath || imageUrl === 'http://127.0.0.1:4200' + seedPath;
  return originalSeed ? CATALOG_PHOTOS[sku] : imageUrl;
}
