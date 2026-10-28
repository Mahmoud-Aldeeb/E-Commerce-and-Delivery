export interface Address {
  id: string;
  label: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  isDefault: boolean;
  lat: number;
  lng: number;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  avatar: string | null;
  role: "USER" | "ADMIN";
  isAdmin: boolean; // derived from role by the API
  hasPassword: boolean; // false for a Google account that has no password yet
  hasGoogle: boolean; // true when a Google account is linked
  addresses?: Address[]; // only returned by the login response
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  originalPrice: number | null;
  image: string;
  category: string;
  stock: number | null;
  rating: number | null;
  reviewCount: number | null;
  discount: number; // percentage, calculated by the API
  createdAt: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface OrderItem {
  product: string; // product id
  name: string;
  image: string;
  price: number;
  quantity: number;
  unit: string | null;
}

export interface DeliveryPartner {
  id: string;
  name: string;
  email: string;
  phone: string;
  avatar: string | null;
  vehicleType: "bike" | "scooter" | "car";
  isActive: boolean | null;
  createdAt: string;
}

// The partner fields that come embedded inside an order
export interface OrderPartner {
  name: string;
  phone: string;
  email?: string;
  avatar?: string | null;
  vehicleType?: string | null;
}

// The customer fields that come embedded inside an order (admin and delivery views)
export interface OrderCustomer {
  name: string;
  email: string;
  phone?: string | null;
}

export interface Order {
  id: string;
  userId: string;
  user?: OrderCustomer;
  items: OrderItem[];
  shippingAddress: Omit<Address, "id" | "isDefault">;
  paymentMethod: string;
  subtotal: number;
  deliveryFee: number | null;
  tax: number | null;
  total: number;
  status: string;
  statusHistory: { status: string; timestamp: string; note: string }[];
  deliveryPartner?: OrderPartner | null;
  deliveryOtp?: string | null; // customers only: the API never sends it to delivery partners
  liveLocation?: { lat: number; lng: number; updatedAt?: string } | null;
  isPaid: boolean | null;
  refundStatus?: "refunded" | "pending" | "failed" | null; // card orders: what happened to the money
  createdAt: string;
  updatedAt: string;
}

// A category as the API returns it (GET /categories).
// Its name is also what every product stores in `category`
export interface StoreCategory {
  id: string;
  name: string;
  sortOrder: number;
  productCount: number;
  createdAt: string;
  updatedAt: string;
}
