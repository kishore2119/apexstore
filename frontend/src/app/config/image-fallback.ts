export function productImageFallback(event: Event): void {
  const image = event.target as HTMLImageElement;
  if (!image.src.endsWith('/product-placeholder.svg')) image.src = '/product-placeholder.svg';
}
