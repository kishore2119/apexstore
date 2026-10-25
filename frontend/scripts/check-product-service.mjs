// Run with: node scripts/check-product-service.mjs
import '@angular/compiler';
import { Injector } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, of, throwError } from 'rxjs';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.angular/cache/product-service-check.mjs');
await build({
  absWorkingDir: root,
  entryPoints: ['src/app/services/product.service.ts'],
  outfile: output,
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  tsconfig: 'tsconfig.app.json',
});
const { ProductService } = await import(pathToFileURL(output).href);
let respond;
const requests = [];
const injector = Injector.create({
  providers: [
    ProductService,
    {
      provide: HttpClient,
      useValue: {
        get(url, options) {
          requests.push({ url, options });
          return respond(url, options);
        },
      },
    },
  ],
});
const service = injector.get(ProductService);
const products = [
  { id: 'first', name: 'Book', price: 99 },
  { id: 'second', name: 'Lamp', price: 299 },
];

for (const [method, endpoint] of [
  ['getSellerProducts', '/api/seller/products'],
  ['getAdminProducts', '/api/admin/products'],
]) {
  requests.length = 0;
  respond = (_, options) =>
    of({
      content: [products[options.params.page]],
      page: options.params.page,
      totalPages: 2,
      totalElements: 2,
    });
  assert.deepEqual(await firstValueFrom(service[method]()), products);
  assert.deepEqual(
    requests.map((r) => r.options.params.page),
    [0, 1],
  );
  assert.ok(requests.every((r) => r.url.endsWith(endpoint)));
}
respond = () => of({ content: [], page: 0, totalPages: 0, totalElements: 0 });
assert.deepEqual(await firstValueFrom(service.getSellerProducts()), []);
respond = (_, options) =>
  options.params.page === 0
    ? of({ content: [products[0]], page: 0, totalPages: 2, totalElements: 2 })
    : throwError(() => new Error('Page failed'));
await assert.rejects(firstValueFrom(service.getAdminProducts()), /Page failed/);
assert.deepEqual(service.enrichProduct(products[0]), products[0]);
console.log(
  'PASS: seller/admin pagination, empty results, failure propagation, and no fabricated product data.',
);

const legacyPhoto = {
  ...products[0],
  sku: 'ECOM-BOOKS-001',
  imageUrl: 'http://localhost:4200/images/catalog/ecom-books-001.svg',
};
const mapped = service.enrichProduct(legacyPhoto);
assert.equal(
  mapped.sourceImageUrl,
  legacyPhoto.imageUrl,
  'Editing must retain the backend image path instead of posting a display-only photo mapping.',
);
assert.equal(service.enrichProduct(mapped).sourceImageUrl, legacyPhoto.imageUrl);
const uploaded = service.enrichProduct({
  ...products[0],
  imageUrl: '/api/products/images/product.jpg',
});
assert.equal(uploaded.imageUrl, 'http://localhost:8080/api/products/images/product.jpg');
assert.equal(uploaded.sourceImageUrl, '/api/products/images/product.jpg');
console.log('PASS: display photo mapping retains canonical image values for product editing.');
