import '@angular/compiler';
import { DestroyRef, Injector, runInInjectionContext, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, throwError, firstValueFrom, Subject, Subscription } from 'rxjs';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.angular/cache/shopping-flows-check.mjs');
await build({
  absWorkingDir: root,
  stdin: {
    contents: `
  export { CartService } from './src/app/services/cart.service';
  export { ProductService } from './src/app/services/product.service';
  export { AuthService } from './src/app/services/auth.service';
  export { OrderService } from './src/app/services/order.service';
  export { ToastService } from './src/app/services/toast.service';
  export { CheckoutAttemptService } from './src/app/services/checkout-attempt.service';
  export { CheckoutModalComponent } from './src/app/components/checkout-modal/checkout-modal.component';
  export { OrdersComponent } from './src/app/components/orders/orders.component';
  export { tokenExpiry } from './src/app/services/session';
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
const {
  CartService,
  ProductService,
  AuthService,
  OrderService,
  ToastService,
  CheckoutAttemptService,
  CheckoutModalComponent,
  OrdersComponent,
  tokenExpiry,
} = await import(pathToFileURL(output).href);
const memoryStorage = () => {
  const entries = new Map();
  return {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, String(value)),
    removeItem: (key) => entries.delete(key),
  };
};
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
const toast = { success() {}, warning() {}, info() {}, error() {} };
let refreshed;
let refreshResponse;
const cartInjector = Injector.create({
  providers: [
    CartService,
    { provide: ToastService, useValue: toast },
    { provide: ProductService, useValue: { getProduct: () => refreshResponse ?? of(refreshed) } },
  ],
});
localStorage.setItem('ecom_cart', '{"unexpected":"shape"}');
const cart = cartInjector.get(CartService);
assert.deepEqual(cart.items(), []);
const product = {
  id: 'product-1',
  name: 'Test book',
  price: 10.1,
  active: true,
  availableStock: 5,
};
assert.equal(cart.addToCart(product, 2), true);
cart.addToCart(product, 10);
assert.equal(cart.items()[0].quantity, 5);
assert.equal(cart.subtotal(), 50.5);
assert.equal(cart.addToCart({ ...product, availableStock: 0 }), false);
assert.equal(cart.items()[0].quantity, 5);
refreshed = { ...product, price: 12.25, availableStock: 3 };
await firstValueFrom(cart.refreshProducts());
assert.equal(cart.items()[0].quantity, 3);
assert.equal(cart.subtotal(), 36.75);
refreshed = { ...product, active: false, availableStock: 0 };
await firstValueFrom(cart.refreshProducts());
assert.equal(cart.canCheckout(), false);
cart.clearCart();
assert.equal(cart.addToCart(product, -1), false);
for (let index = 0; index < 50; index++) cart.addToCart({ ...product, id: 'id-' + index });
assert.equal(cart.addToCart({ ...product, id: 'too-many' }), false);
cart.clearCart();
cart.addToCart(product, 2);
console.log(
  'PASS: malformed stored cart, quantity/stock limits, refreshed prices, unavailable products, and 50-item limit.',
);

const jwt = (expiry, subject = 'buyer-1') =>
  'header.' +
  Buffer.from(JSON.stringify({ exp: expiry, sub: subject })).toString('base64url') +
  '.signature';
assert.equal(tokenExpiry('malformed'), 0);
localStorage.setItem('ecom_token', jwt(Math.floor(Date.now() / 1000) - 60));
localStorage.setItem(
  'ecom_user',
  JSON.stringify({
    id: 'buyer-1',
    name: 'Buyer',
    email: 'buyer@example.test',
    roles: ['CUSTOMER'],
  }),
);
const authInjector = Injector.create({
  providers: [
    AuthService,
    { provide: CartService, useValue: cart },
    { provide: HttpClient, useValue: {} },
    { provide: ToastService, useValue: toast },
  ],
});
const realAuth = authInjector.get(AuthService);
assert.equal(realAuth.isAuthenticated(), false);
assert.equal(localStorage.getItem('ecom_token'), null);
realAuth.logout(false);
console.log('PASS: expired or malformed tokens do not create an authenticated session.');

const calls = [];
let failRequest = true;
const attempts = new CheckoutAttemptService();
let checkoutBuyer = { id: 'buyer-1', name: 'Buyer', email: 'buyer@example.test' };
let orderResponse;
let restoredOrder;
const checkoutInjector = Injector.create({
  providers: [
    { provide: CartService, useValue: cart },
    { provide: ToastService, useValue: toast },
    { provide: CheckoutAttemptService, useValue: attempts },
    { provide: AuthService, useValue: { currentUser: () => checkoutBuyer } },
    { provide: DestroyRef, useValue: { destroyed: false, onDestroy: () => () => {} } },
    {
      provide: OrderService,
      useValue: {
        placeOrder(payload, key) {
          calls.push({ payload: structuredClone(payload), key });
          if (orderResponse) return orderResponse;
          return failRequest
            ? throwError(() => ({ status: 0 }))
            : of({ status: 200, body: { id: 'order-1', status: 'CONFIRMED', total: 20.2 } });
        },
        getOrder: () => of(restoredOrder),
      },
    },
  ],
});
const first = runInInjectionContext(checkoutInjector, () => new CheckoutModalComponent());
first.ngOnInit();
first.addressLine1 = '12 Demo Street';
first.city = 'Kakinada';
first.state = 'Andhra Pradesh';
first.pincode = '533001';
first.phone = '9000000000';
first.paymentMethod = 'ONLINE_DEMO';
first.submitOrder();
assert.equal(calls[0].payload.paymentMethod, 'ONLINE_DEMO');
assert.equal(calls[0].payload.deliveryAddress.line2, '');
assert.equal(calls[0].payload.deliveryAddress.pincode, '533001');
assert.match(calls[0].payload.address, /Kakinada/);
assert.ok(attempts.load('buyer-1'));
first.ngOnDestroy();
cart.updateQuantity(product.id, 1);
const second = runInInjectionContext(checkoutInjector, () => new CheckoutModalComponent());
second.ngOnInit();
second.addressLine1 = 'Changed after interrupted checkout';
second.paymentMethod = 'COD';
failRequest = false;
second.submitOrder();
assert.equal(calls[0].key, calls[1].key);
assert.deepEqual(calls[0].payload, calls[1].payload);
assert.equal(second.placedOrder().status, 'CONFIRMED');
assert.equal(cart.items().length, 0);
assert.equal(
  attempts.load('buyer-1'),
  null,
  'A confirmed checkout must stop blocking new purchases even if its dialog is closed without Done.',
);
assert.equal(attempts.load('another-buyer'), null);
second.finishOrder();
second.ngOnDestroy();
assert.equal(attempts.load('buyer-1'), null);
console.log(
  'PASS: interrupted checkout survives modal recreation, retries the same payload/key, and clears the cart after confirmation.',
);

// Exercise real login/logout hooks and ensure cart persistence stays within one account.
const sessionFor = (id) => ({
  accessToken: jwt(Math.floor(Date.now() / 1000) + 1800, id),
  user: { id, name: id, email: id + '@example.test', roles: ['CUSTOMER'] },
});
const userA = sessionFor('cart-buyer-a'),
  userB = sessionFor('cart-buyer-b');
assert.equal(cart.totalCount(), 0);
realAuth.setSession(userA);
cart.addToCart(product, 2);
realAuth.logout(false);
assert.equal(cart.totalCount(), 0, 'Logging out must hide the signed-in cart.');
realAuth.setSession(userB);
assert.equal(cart.totalCount(), 0, 'Another account must not inherit the first account’s cart.');
cart.addToCart({ ...product, price: 99 }, 1);
realAuth.logout(false);
realAuth.setSession(userA);
assert.equal(cart.totalCount(), 2);
assert.equal(cart.items()[0].product.price, 10.1);
// An inventory response started for A must not rewrite B's cart after an account switch.
const late = new Subject();
refreshResponse = late;
const refreshFinished = firstValueFrom(cart.refreshProducts());
realAuth.logout(false);
realAuth.setSession(userB);
late.next({ ...product, price: 1, availableStock: 1 });
late.complete();
await refreshFinished;
assert.equal(cart.items()[0].product.price, 99);
assert.equal(cart.totalCount(), 1);
refreshResponse = undefined;
realAuth.logout(false);
cart.addToCart({ ...product, id: 'guest-product' }, 1);
realAuth.setSession(userB);
assert.equal(
  cart.items().length,
  2,
  'Guest items should transfer on sign-in, preserving the account cart.',
);
realAuth.logout(false);
assert.equal(cart.totalCount(), 0, 'Transferred guest items must not reappear after logout.');
realAuth.setSession(userA);
const reloadedCart = Injector.create({
  providers: [
    CartService,
    { provide: ToastService, useValue: toast },
    { provide: ProductService, useValue: { getProduct: () => of(product) } },
  ],
}).get(CartService);
reloadedCart.activateUser(userA.user.id);
assert.equal(
  reloadedCart.totalCount(),
  2,
  'A browser reload must preserve the same account’s saved cart.',
);
realAuth.setSession({
  ...sessionFor('admin-cart'),
  user: { id: 'admin-cart', name: 'Admin', email: 'admin@example.test', roles: ['ADMIN'] },
});
assert.equal(cart.totalCount(), 0);
assert.equal(cart.addToCart(product), false);
realAuth.logout(false);
console.log(
  'PASS: account carts survive sign-in/reload, disappear on logout, never transfer between users, merge guest items once, and ignore stale inventory responses.',
);

// Account switches must never overwrite or clear another buyer's interrupted order.
const payload = {
  customerName: 'Buyer',
  customerEmail: 'buyer@example.test',
  address: '12 Test Street',
  items: [{ productId: product.id, quantity: 2 }],
};
const interruptedA = { buyerId: 'retry-a', key: 'key-a', payload };
const interruptedB = { buyerId: 'retry-b', key: 'key-b', payload };
attempts.save(interruptedA);
attempts.save(interruptedB);
const restoredAttempts = new CheckoutAttemptService();
assert.equal(restoredAttempts.load('retry-a').key, 'key-a');
assert.equal(restoredAttempts.load('retry-b').key, 'key-b');
restoredAttempts.clear('retry-b');
assert.equal(restoredAttempts.load('retry-a').key, 'key-a');
assert.equal(restoredAttempts.load('retry-b'), null);
sessionStorage.setItem(
  'ecom_checkout',
  JSON.stringify({ ...interruptedA, buyerId: 'legacy-buyer' }),
);
const migrated = new CheckoutAttemptService();
assert.equal(migrated.load('legacy-buyer').key, 'key-a');
migrated.clear('legacy-buyer');
assert.equal(new CheckoutAttemptService().load('legacy-buyer'), null);
const availableStorage = sessionStorage;
globalThis.sessionStorage = {
  getItem() {
    throw new Error('Storage blocked');
  },
  setItem() {
    throw new Error('Storage blocked');
  },
  removeItem() {
    throw new Error('Storage blocked');
  },
};
const memoryAttempts = new CheckoutAttemptService();
memoryAttempts.save(interruptedA);
assert.equal(memoryAttempts.load('retry-a').key, 'key-a');
memoryAttempts.clear('retry-a');
assert.equal(memoryAttempts.load('retry-a'), null);
globalThis.sessionStorage = availableStorage;
console.log(
  'PASS: checkout retries remain isolated per buyer, migrate prior attempts, and work in memory with blocked storage.',
);

const prepareCheckout = () => {
  const checkout = runInInjectionContext(checkoutInjector, () => new CheckoutModalComponent());
  checkout.ngOnInit();
  checkout.addressLine1 = '12 Test Street';
  checkout.city = 'Kakinada';
  checkout.state = 'Andhra Pradesh';
  checkout.pincode = '533001';
  checkout.phone = '9000000000';
  return checkout;
};
cart.addToCart(product, 2);
const confirmation = new Subject();
orderResponse = confirmation;
const asynchronous = prepareCheckout();
asynchronous.submitOrder();
cart.addToCart(product, 1);
cart.addToCart({ ...product, id: 'added-later' }, 1);
confirmation.next({ body: { id: 'later-confirmed', status: 'CONFIRMED', total: 20.2 } });
confirmation.complete();
assert.equal(cart.items().find((item) => item.product.id === product.id).quantity, 1);
assert.equal(cart.items().find((item) => item.product.id === 'added-later').quantity, 1);
asynchronous.acceptOrder({ id: 'later-confirmed', status: 'CONFIRMED', total: 20.2 });
assert.equal(cart.totalCount(), 2, 'Repeated confirmation must not consume cart items twice.');
assert.equal(attempts.load('buyer-1'), null);
asynchronous.ngOnDestroy();
const afterConfirmed = prepareCheckout();
assert.equal(afterConfirmed.attempt(), null);
afterConfirmed.ngOnDestroy();

const pendingResponse = new Subject();
orderResponse = pendingResponse;
const pendingCheckout = prepareCheckout();
pendingCheckout.submitOrder();
pendingResponse.next({ body: { id: 'pending-order', status: 'PENDING', total: 20.2 } });
pendingResponse.complete();
pendingCheckout.finishOrder();
pendingCheckout.ngOnDestroy();
assert.equal(
  attempts.load('buyer-1').orderId,
  'pending-order',
  'Leaving a pending checkout must retain its retry key.',
);
restoredOrder = { id: 'pending-order', status: 'PENDING', total: 20.2 };
const resumed = prepareCheckout();
resumed.polling.unsubscribe();
const requestCount = calls.length;
checkoutBuyer = { id: 'different-buyer', name: 'Different Buyer', email: 'different@example.test' };
resumed.submitOrder();
assert.equal(calls.length, requestCount);
assert.match(resumed.errorMessage(), /account that started/);
resumed.ngOnDestroy();
checkoutBuyer = { id: 'buyer-1', name: 'Buyer', email: 'buyer@example.test' };
attempts.clear('buyer-1');
orderResponse = undefined;
const invalidEmail = prepareCheckout();
invalidEmail.customerEmail = 'buyer@localhost';
invalidEmail.submitOrder();
assert.equal(calls.length, requestCount);
assert.match(invalidEmail.errorMessage(), /valid email/);
invalidEmail.ngOnDestroy();
console.log(
  'PASS: late confirmations retain newly added cart items, apply once, clear confirmed retry state, preserve pending retries, and reject another buyer or invalid email.',
);

// Simulate responses arriving between a session change and the next Angular render.
let currentBuyer = { id: 'invoice-buyer-a' };
const invoiceResponse = new Subject(),
  cancellationResponse = new Subject(),
  statusResponse = new Subject(),
  historyResponse = new Subject();
let historyLoads = 0;
const orderPage = Object.assign(Object.create(OrdersComponent.prototype), {
  auth: { currentUser: () => currentBuyer },
  orderService: {
    generateInvoice: () => invoiceResponse,
    cancelOrder: () => cancellationResponse,
    getOrder: () => statusResponse,
    getMyOrders() {
      historyLoads++;
      return historyResponse;
    },
  },
  toast,
  orders: signal([]),
  isLoading: signal(false),
  loadError: signal(false),
  currentPage: signal(0),
  totalPages: signal(0),
  totalElements: signal(0),
  activeTab: signal('ALL'),
  selectedInvoice: signal(null),
  isInvoiceLoading: signal(false),
  invoiceOrderId: signal(null),
  busyOrders: signal([]),
  actions: new Subscription(),
  destroyed: false,
});
globalThis.confirm = () => true;
orderPage.viewInvoice('invoice-order');
orderPage.cancelOrder({ id: 'cancel-order', status: 'CONFIRMED', invoiceRequested: false });
orderPage.pollPending('status-order');
orderPage.loadOrders();
assert.equal(historyLoads, 1);
currentBuyer = { id: 'invoice-buyer-b' };
invoiceResponse.next({ customerEmail: 'private-a@example.test' });
invoiceResponse.complete();
cancellationResponse.next({ status: 'CANCELLED' });
cancellationResponse.complete();
statusResponse.next({ status: 'CONFIRMED' });
statusResponse.complete();
historyResponse.next({ content: [{ id: 'private-order-a' }], totalElements: 1, totalPages: 1 });
historyResponse.complete();
assert.equal(orderPage.selectedInvoice(), null);
assert.deepEqual(orderPage.orders(), []);
assert.equal(historyLoads, 1);
orderPage.ngOnDestroy();
console.log(
  'PASS: delayed invoices, order history, cancellations, and refreshes never expose the previous buyer’s data or reload another account.',
);

const sellerResponse = new Subject();
const delayedAuth = Injector.create({
  providers: [
    AuthService,
    { provide: CartService, useValue: cart },
    { provide: ToastService, useValue: toast },
    { provide: HttpClient, useValue: { post: () => sellerResponse } },
  ],
}).get(AuthService);
delayedAuth.setSession(userA);
const upgrade = delayedAuth.becomeSeller().subscribe();
delayedAuth.logout(false);
delayedAuth.setSession(userB);
sellerResponse.next({ ...userA, user: { ...userA.user, roles: ['CUSTOMER', 'SELLER'] } });
sellerResponse.complete();
assert.equal(
  delayedAuth.currentUser().id,
  userB.user.id,
  'A delayed seller upgrade must never sign the previous buyer back in.',
);
upgrade.unsubscribe();
delayedAuth.logout(false);
const workingLocalStorage = localStorage;
globalThis.localStorage = {
  getItem() {
    throw new Error('Storage blocked');
  },
  setItem() {
    throw new Error('Storage blocked');
  },
  removeItem() {
    throw new Error('Storage blocked');
  },
};
const storageFreeAuth = Injector.create({
  providers: [
    AuthService,
    { provide: CartService, useValue: cart },
    { provide: ToastService, useValue: toast },
    { provide: HttpClient, useValue: {} },
  ],
}).get(AuthService);
storageFreeAuth.setSession(userA);
assert.equal(storageFreeAuth.isAuthenticated(), true);
storageFreeAuth.logout(false);
assert.equal(storageFreeAuth.isAuthenticated(), false);
globalThis.localStorage = workingLocalStorage;
console.log(
  'PASS: stale seller upgrades cannot restore a logged-out account, and unavailable browser storage does not break sign-in.',
);

realAuth.setSession(userA);
localStorage.setItem('ecom_token', userB.accessToken);
realAuth.storageListener({ key: 'ecom_token', newValue: userB.accessToken });
assert.equal(
  realAuth.currentUser().id,
  userA.user.id,
  'An incomplete token/user pair must not switch the visible account.',
);
localStorage.setItem('ecom_user', JSON.stringify(userB.user));
realAuth.storageListener({ key: 'ecom_user', newValue: JSON.stringify(userB.user) });
assert.equal(
  realAuth.currentUser().id,
  userB.user.id,
  'A sign-in from another browser tab must switch the current account.',
);
const renewedToken = jwt(Math.floor(Date.now() / 1000) + 3600, userB.user.id);
localStorage.setItem('ecom_token', renewedToken);
realAuth.storageListener({ key: 'ecom_token', newValue: renewedToken });
assert.equal(
  realAuth.token(),
  renewedToken,
  'Renewing the same account must update other tabs even when the stored user text is unchanged.',
);
localStorage.setItem('ecom_cart:user:' + userB.user.id, JSON.stringify([{ product, quantity: 4 }]));
cart.storageListener({ key: 'ecom_cart:user:' + userB.user.id });
assert.equal(
  cart.totalCount(),
  4,
  'Cart edits from another tab must update the same account’s cart.',
);
localStorage.removeItem('ecom_token');
localStorage.removeItem('ecom_user');
realAuth.storageListener({ key: 'ecom_token', newValue: null });
assert.equal(realAuth.isAuthenticated(), false);
assert.equal(cart.totalCount(), 0);
realAuth.ngOnDestroy();
delayedAuth.ngOnDestroy();
storageFreeAuth.ngOnDestroy();
console.log(
  'PASS: sign-in, logout, and account cart updates are synchronized across browser tabs.',
);
