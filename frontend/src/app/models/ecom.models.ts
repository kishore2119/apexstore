export interface User {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export interface AuthResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
  user: User;
}

export interface Product {
  id: string;
  sellerId: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  price: number;
  currency: string;
  imageUrl: string;
  active: boolean;
  stockOnHand: number;
  reserved: number;
  availableStock: number;
  // UI helpers:
  originalPrice?: number;
  discountPercent?: number;
  rating?: number;
  ratingCount?: number;
}

export interface ProductPageResponse {
  content: Product[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface ProductCreatePayload {
  sku?: string;
  name: string;
  description: string;
  category: string;
  price: number;
  imageUrl: string;
  stockOnHand?: number;
}

export interface StockUpdatePayload {
  stockOnHand: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItemRequest {
  productId: string;
  quantity: number;
}

export interface OrderRequest {
  customerName: string;
  customerEmail: string;
  address: string;
  items: OrderItemRequest[];
  deliveryAddress?: DeliveryAddress;
  paymentMethod?: 'COD' | 'ONLINE_DEMO';
}

export interface DeliveryAddress {
  line1: string;
  line2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  phone: string;
}

export interface OrderItem {
  productId: string;
  sellerId?: string;
  name?: string;
  quantity: number;
  unitPrice?: number;
  subtotal?: number;
}

export type OrderStatus = 'CONFIRMED' | 'PENDING' | 'CANCELLED' | 'CANCEL_PENDING' | 'FAILED';

export interface Order {
  id: string;
  buyerId?: string;
  status: OrderStatus;
  customerName: string;
  customerEmail: string;
  address: string;
  currency: string;
  total: number;
  createdAt: string;
  invoiceRequested: boolean;
  deliveryAddress?: DeliveryAddress;
  paymentMethod?: 'COD' | 'ONLINE_DEMO';
  paymentStatus?: 'DEMO_NOT_COLLECTED';
  items: OrderItem[];
}

export interface OrderPageResponse {
  content: Order[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
}

export interface InvoiceItem {
  productId: string;
  sellerId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  orderId: string;
  customerName: string;
  customerEmail: string;
  address: string;
  currency: string;
  total: number;
  issuedAt: string;
  items: InvoiceItem[];
}

export interface ApiError {
  code?: string;
  message?: string;
  fields?: Record<string, string>;
  traceId?: string;
}
