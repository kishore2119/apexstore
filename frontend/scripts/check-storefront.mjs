import '@angular/compiler';
import { Injector } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.angular/cache/storefront-check.mjs');
await build({ absWorkingDir: root, stdin: { contents: `
  export { CatalogComponent } from './src/app/components/catalog/catalog.component';
  export { ProductService } from './src/app/services/product.service';
  export { CartService } from './src/app/services/cart.service';
  export { ToastService } from './src/app/services/toast.service';
  export { WelcomePrompt } from './src/app/services/welcome-prompt';
  export { catalogPhoto } from './src/app/config/product-image';
`, resolveDir: root, loader: 'ts' }, outfile: output, bundle: true, packages: 'external', platform: 'node', format: 'esm', tsconfig: 'tsconfig.app.json' });
const { CatalogComponent, ProductService, CartService, ToastService, WelcomePrompt, catalogPhoto } = await import(pathToFileURL(output).href);
const storage = new Map();
globalThis.sessionStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
const prompt = new WelcomePrompt();
assert.equal(prompt.shouldOpen('/', true), false, 'A restored authenticated session must not show login.');
assert.equal(prompt.shouldOpen('/admin', false), false, 'Admin has a separate login.');
assert.equal(prompt.shouldOpen('/', false), true);
assert.equal(prompt.shouldOpen('/product/1', false), false);
assert.equal(new WelcomePrompt().shouldOpen('/', false), false, 'Refreshing a dismissed welcome must not reopen it.');
globalThis.sessionStorage = { getItem() { throw new Error('Storage denied'); } };
const blockedStoragePrompt = new WelcomePrompt();
assert.equal(blockedStoragePrompt.shouldOpen('/', false), true);
assert.equal(blockedStoragePrompt.shouldOpen('/cart', false), false);
console.log('PASS: welcome shown once for guests, hidden for authenticated users/admin, and safe with blocked storage.');

const params = new BehaviorSubject({});
const requests = [], navigation = [];
const fixture = { id: 'real-backend-id', name: 'Real backend product', category: 'Electronics', price: 123 };
const component = Injector.create({ providers: [CatalogComponent,
  { provide: ActivatedRoute, useValue: { queryParams: params } },
  { provide: Router, useValue: { navigate: (...args) => navigation.push(args) } },
  { provide: CartService, useValue: {} },
  { provide: ToastService, useValue: {} },
  { provide: ProductService, useValue: { getProducts(query) {
    requests.push(query);
    return query.category === 'Books' ? throwError(() => new Error('Collection unavailable'))
      : of({ content: [fixture], totalElements: 15, totalPages: 2 });
  } } }
] }).get(CatalogComponent);
component.ngOnInit();
assert.equal(requests.length, 5);
assert.equal(component.collections().length, 5);
assert.equal(component.loadError(), false, 'One failed category must not hide the others.');
assert.deepEqual(component.collections().find(c => c.category === 'Books').products, []);
assert.equal(component.collections()[0].products[0].id, fixture.id);
params.next({ search: 'headphones', minPrice: '500', page: '1', sort: 'price,asc' });
assert.equal(component.isStorefront(), false);
assert.deepEqual(requests.at(-1), { page: 1, size: 12, sort: 'price,asc', search: 'headphones', category: undefined, minPrice: 500, maxPrice: undefined, inStock: false });
params.next({ view: 'all' });
assert.equal(component.isStorefront(), false);
component.onCategorySelect('All');
assert.equal(navigation.at(-1)[1].queryParams.view, 'all');
component.ngOnDestroy();
console.log('PASS: category rows use backend products, isolate failed collections, and retain server search/filter/pagination.');

const sources = JSON.parse(await readFile(resolve(root, '../scripts/data/photo-sources.json'), 'utf8'));
assert.equal(sources.length, 75);
for (const photo of sources) {
  assert.ok(!photo.error && photo.license && photo.source, photo.sku + ' must have source and license details');
  assert.ok((await stat(resolve(root, 'public' + photo.imagePath))).size > 1000);
  const oldImage = 'http://localhost:4200/images/catalog/' + photo.sku.toLowerCase() + '.svg';
  assert.equal(catalogPhoto(photo.sku, oldImage), photo.imagePath);
  assert.equal(catalogPhoto(photo.sku, '/api/products/images/seller-photo.jpg'), '/api/products/images/seller-photo.jpg');
  assert.equal(catalogPhoto(photo.sku, 'https://seller.example/photo.jpg'), 'https://seller.example/photo.jpg');
}
assert.equal(catalogPhoto('CUSTOM-SKU', '/custom-image.jpg'), '/custom-image.jpg');
console.log('PASS: all 75 local photos exist and have credits; seller images are never overwritten.');
