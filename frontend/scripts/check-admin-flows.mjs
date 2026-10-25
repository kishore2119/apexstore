import '@angular/compiler';
import { signal, computed } from '@angular/core';
import { of, throwError, Subject, Subscription } from 'rxjs';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.angular/cache/admin-flows-check.mjs');
await build({
  absWorkingDir: root,
  stdin: {
    contents: `
  export { AdminPageComponent } from './src/app/components/admin-page/admin-page.component';
  export { SellerAdminComponent } from './src/app/components/seller-admin/seller-admin.component';
`,
    resolveDir: root,
    loader: 'ts',
  },
  outfile: output,
  bundle: true,
  packages: 'external',
  platform: 'node',
  format: 'esm',
  tsconfig: 'tsconfig.app.json',
});
const { AdminPageComponent, SellerAdminComponent } = await import(pathToFileURL(output).href);

// Invoke actual handlers with controlled HTTP streams, independently of Angular rendering.
const admin = Object.assign(Object.create(AdminPageComponent.prototype), {
  auth: { isAdmin: () => true },
  users: signal([]),
  usersLoading: signal(false),
  userError: signal(''),
  userStatsError: signal(''),
  userPage: signal(0),
  userPages: signal(0),
  userTotal: signal(0),
  userSearch: '',
  orders: signal([]),
  ordersLoading: signal(false),
  orderError: signal(''),
  orderSearch: '',
  orderStatus: '',
  orderPage: signal(0),
  orderPages: signal(0),
  orderTotal: signal(0),
  selectedCustomer: signal(null),
  expandedOrder: signal(null),
  products: signal([]),
  productsLoading: signal(false),
  productError: signal(''),
  productPage: signal(0),
  productPages: signal(0),
  productTotal: signal(0),
  productSearch: '',
  productCategory: '',
  tab: signal('overview'),
  overviewRequests: new Subscription(),
  statusBusy: signal(null),
});
const customer = {
  id: 'buyer-1',
  name: 'Customer',
  email: 'buyer@example.test',
  roles: ['CUSTOMER'],
  enabled: true,
};
const page = (content) => ({ content, page: 0, totalPages: 1, totalElements: content.length });
let reply = () => of(page([customer]));
const requests = [];
admin.http = {
  get(url, options) {
    requests.push({ url, options });
    return reply(url, options);
  },
  post: () => throwError(() => new Error('Order service unavailable')),
};
admin.loadUsers();
assert.equal(admin.users().length, 1, 'Order reporting failure must not hide customer accounts.');
assert.equal(
  admin.users()[0].orderCount,
  null,
  'Unavailable order statistics must not be presented as zero.',
);
assert.match(admin.userStatsError(), /statistics are unavailable/);

const oldResponse = new Subject();
reply = () => oldResponse;
admin.orders.set([{ id: 'stale-order' }]);
admin.loadOrders();
assert.deepEqual(
  admin.orders(),
  [],
  'A new search must clear stale order rows before it can be exported.',
);
reply = () => of(page([{ id: 'current-order' }]));
admin.loadOrders();
oldResponse.next(page([{ id: 'wrong-order' }]));
assert.equal(
  admin.orders()[0].id,
  'current-order',
  'A superseded search cannot overwrite the current result.',
);
requests.length = 0;
admin.openOrder({ id: 'full-order-id' });
assert.equal(requests.length, 1, 'Opening a recent order must issue one filtered request.');
assert.equal(requests[0].options.params.get('search'), 'full-order-id');

const afterDestroy = new Subject();
reply = () => afterDestroy;
admin.loadOrders();
admin.ngOnDestroy();
afterDestroy.next(page([{ id: 'late-order' }]));
assert.deepEqual(admin.orders(), [], 'Destroyed admin views must not accept delayed results.');
console.log(
  'PASS: admin customer availability, honest missing statistics, stale search cancellation, recent-order lookup and request cleanup.',
);

const product = {
  id: 'seed-1',
  sku: 'ELEC-001',
  name: 'Keyboard',
  description: 'Test keyboard',
  category: 'Electronics',
  price: 999,
  active: true,
  stockOnHand: 5,
  reserved: 0,
  availableStock: 5,
  imageUrl: '/images/products/keyboard.jpg',
  sourceImageUrl: 'http://localhost:4200/images/catalog/elec-001.svg',
};
const notices = [];
const seller = Object.assign(Object.create(SellerAdminComponent.prototype), {
  auth: { isAdmin: () => false },
  toast: { error: (value) => notices.push(value), success() {} },
  products: signal([product]),
  inventoryPage: signal(0),
  isLoading: signal(false),
  loadError: signal(false),
  editModalProduct: signal({ ...product }),
  isSaving: signal(false),
  editImageFile: null,
  editImagePreview: '',
  mutations: new Subscription(),
  statusBusy: signal(null),
  editingProduct: signal(null),
  isUpdatingStock: signal(false),
  inventorySearch: signal(''),
  inventoryCategory: signal(''),
  inventoryStatus: signal(''),
});
seller.matchingProducts = computed(() => seller.products());
seller.inventoryPages = computed(() => Math.ceil(seller.products().length / 10));
const mutations = [];
seller.productService = {
  updateSellerProduct(id, payload) {
    mutations.push({ id, payload });
    return of({ ...product, ...payload });
  },
  updateSellerProductStatus(id, active) {
    mutations.push({ id, active });
    return of({ ...product, active });
  },
  getSellerProducts: () => of([product]),
};
seller.saveProductDetails();
assert.equal(notices.length, 0);
assert.equal(
  mutations[0].payload.imageUrl,
  product.sourceImageUrl,
  'Editing a sample listing must retain the original API image path, not its display-only replacement.',
);
// A successful photo upload survives a failed listing update, so retry does not upload again.
let uploads = 0,
  updates = 0;
seller.editModalProduct.set({ ...product });
seller.editImageFile = { name: 'photo.png' };
seller.productService.uploadImage = () => {
  uploads++;
  return of({ imageUrl: '/api/products/images/new-photo.png' });
};
const savedUpdate = seller.productService.updateSellerProduct;
seller.productService.updateSellerProduct = (id, payload) => {
  updates++;
  assert.equal(payload.imageUrl, '/api/products/images/new-photo.png');
  return updates === 1 ? throwError(() => ({ status: 503 })) : of({ ...product, ...payload });
};
seller.saveProductDetails();
assert.equal(seller.editImageFile, null);
seller.saveProductDetails();
assert.equal(uploads, 1, 'Retrying a product update must reuse the already uploaded image.');
assert.equal(updates, 2);
seller.productService.updateSellerProduct = savedUpdate;
seller.setProductStatus({ ...product, active: false }, true);
assert.deepEqual(mutations[1], { id: product.id, active: true });
assert.equal(seller.statusBusy(), null);

const stockReply = new Subject();
seller.productService.updateSellerStock = () => stockReply;
seller.editingProduct.set(product);
seller.stockToUpdate = 8;
seller.saveStock();
seller.ngOnDestroy();
stockReply.next({ ...product, stockOnHand: 8 });
assert.notEqual(
  seller.editingProduct(),
  null,
  'Disposed inventory editors must ignore late mutation responses.',
);
console.log(
  'PASS: seed-photo product editing, image upload retry, inactive listing restoration and mutation request cleanup.',
);
