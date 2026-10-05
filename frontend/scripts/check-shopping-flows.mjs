import '@angular/compiler';
import { DestroyRef, Injector, runInInjectionContext } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { of, throwError, firstValueFrom } from 'rxjs';
import { build } from 'esbuild';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, '.angular/cache/shopping-flows-check.mjs');
await build({ absWorkingDir: root, stdin: { contents: `
  export { CartService } from './src/app/services/cart.service';
  export { ProductService } from './src/app/services/product.service';
  export { AuthService } from './src/app/services/auth.service';
  export { OrderService } from './src/app/services/order.service';
  export { ToastService } from './src/app/services/toast.service';
  export { CheckoutAttemptService } from './src/app/services/checkout-attempt.service';
  export { CheckoutModalComponent } from './src/app/components/checkout-modal/checkout-modal.component';
  export { tokenExpiry } from './src/app/services/session';
`, resolveDir: root, loader: 'ts' }, outfile: output, bundle: true, packages: 'external', platform: 'node', format: 'esm', tsconfig: 'tsconfig.app.json' });
const { CartService, ProductService, AuthService, OrderService, ToastService, CheckoutAttemptService, CheckoutModalComponent, tokenExpiry } = await import(pathToFileURL(output).href);
const memoryStorage = () => {
  const entries = new Map();
  return { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, String(value)), removeItem: key => entries.delete(key) };
};
globalThis.localStorage = memoryStorage();
globalThis.sessionStorage = memoryStorage();
const toast = { success() {}, warning() {}, info() {}, error() {} };
let refreshed;
const cartInjector = Injector.create({ providers: [CartService, { provide: ToastService, useValue: toast }, { provide: ProductService, useValue: { getProduct: () => of(refreshed) } }] });
localStorage.setItem('ecom_cart', '{"unexpected":"shape"}');
const cart = cartInjector.get(CartService);
assert.deepEqual(cart.items(), []);
const product = { id: 'product-1', name: 'Test book', price: 10.10, active: true, availableStock: 5 };
assert.equal(cart.addToCart(product, 2), true);
cart.addToCart(product, 10);
assert.equal(cart.items()[0].quantity, 5);
assert.equal(cart.subtotal(), 50.50);
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
cart.clearCart(); cart.addToCart(product, 2);
console.log('PASS: malformed stored cart, quantity/stock limits, refreshed prices, unavailable products, and 50-item limit.');

const jwt = expiry => 'header.' + Buffer.from(JSON.stringify({ exp: expiry })).toString('base64url') + '.signature';
assert.equal(tokenExpiry('malformed'), 0);
localStorage.setItem('ecom_token', jwt(Math.floor(Date.now() / 1000) - 60));
localStorage.setItem('ecom_user', JSON.stringify({ id: 'buyer-1', name: 'Buyer', email: 'buyer@example.test', roles: ['CUSTOMER'] }));
const authInjector = Injector.create({ providers: [AuthService, { provide: HttpClient, useValue: {} }, { provide: ToastService, useValue: toast }] });
const realAuth = authInjector.get(AuthService);
assert.equal(realAuth.isAuthenticated(), false);
assert.equal(localStorage.getItem('ecom_token'), null);
realAuth.logout(false);
console.log('PASS: expired or malformed tokens do not create an authenticated session.');

const calls = [];
let failRequest = true;
const attempts = new CheckoutAttemptService();
const checkoutInjector = Injector.create({ providers: [
  { provide: CartService, useValue: cart }, { provide: ToastService, useValue: toast },
  { provide: CheckoutAttemptService, useValue: attempts },
  { provide: AuthService, useValue: { currentUser: () => ({ id: 'buyer-1', name: 'Buyer', email: 'buyer@example.test' }) } },
  { provide: DestroyRef, useValue: { destroyed: false, onDestroy: () => () => {} } },
  { provide: OrderService, useValue: { placeOrder(payload, key) {
    calls.push({ payload: structuredClone(payload), key });
    return failRequest ? throwError(() => ({ status: 0 })) : of({ status: 200, body: { id: 'order-1', status: 'CONFIRMED', total: 20.20 } });
  } } }
] });
const first = runInInjectionContext(checkoutInjector, () => new CheckoutModalComponent());
first.ngOnInit();
first.addressLine1 = '12 Demo Street'; first.city = 'Kakinada'; first.state = 'Andhra Pradesh'; first.pincode = '533001'; first.phone = '9000000000'; first.paymentMethod = 'ONLINE_DEMO';
first.submitOrder();
assert.equal(calls[0].payload.paymentMethod, 'ONLINE_DEMO');
assert.equal(calls[0].payload.deliveryAddress.line2, '');
assert.equal(calls[0].payload.deliveryAddress.pincode, '533001');
assert.match(calls[0].payload.address, /Kakinada/);
assert.ok(attempts.load('buyer-1'));
first.ngOnDestroy();
cart.updateQuantity(product.id, 1);
const second = runInInjectionContext(checkoutInjector, () => new CheckoutModalComponent());
second.ngOnInit(); second.addressLine1 = 'Changed after interrupted checkout'; second.paymentMethod = 'COD'; failRequest = false; second.submitOrder();
assert.equal(calls[0].key, calls[1].key);
assert.deepEqual(calls[0].payload, calls[1].payload);
assert.equal(second.placedOrder().status, 'CONFIRMED');
assert.equal(cart.items().length, 0);
assert.equal(attempts.load('another-buyer'), null);
second.finishOrder(); second.ngOnDestroy();
assert.equal(attempts.load('buyer-1'), null);
console.log('PASS: interrupted checkout survives modal recreation, retries the same payload/key, and clears the cart after confirmation.');
