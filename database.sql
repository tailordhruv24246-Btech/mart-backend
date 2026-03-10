-- ============================================================
-- MART DATABASE SCHEMA
-- Compatible with MySQL Workbench
-- ============================================================

CREATE DATABASE IF NOT EXISTS mart_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE mart_db;

SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- USERS TABLE (Role-based)
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) NOT NULL UNIQUE,
  phone VARCHAR(20) DEFAULT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin','subadmin','delivery','customer','salesman') NOT NULL DEFAULT 'customer',
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  profile_image VARCHAR(255) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_email (email),
  INDEX idx_role (role)
) ENGINE=InnoDB;

-- ============================================================
-- CUSTOMERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT DEFAULT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  state VARCHAR(100) DEFAULT NULL,
  pincode VARCHAR(10) DEFAULT NULL,
  loyalty_points INT DEFAULT 0,
  total_purchases DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_phone (phone),
  INDEX idx_email (email)
) ENGINE=InnoDB;

-- ============================================================
-- SUPPLIERS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS suppliers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(150) DEFAULT NULL,
  phone VARCHAR(20) DEFAULT NULL,
  address TEXT DEFAULT NULL,
  city VARCHAR(100) DEFAULT NULL,
  state VARCHAR(100) DEFAULT NULL,
  pincode VARCHAR(10) DEFAULT NULL,
  gst_number VARCHAR(20) DEFAULT NULL,
  bank_name VARCHAR(100) DEFAULT NULL,
  account_number VARCHAR(30) DEFAULT NULL,
  ifsc_code VARCHAR(20) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_name (name)
) ENGINE=InnoDB;

-- ============================================================
-- CATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(120) DEFAULT NULL UNIQUE,
  description TEXT DEFAULT NULL,
  image VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_slug (slug)
) ENGINE=InnoDB;

-- ============================================================
-- SUBCATEGORIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS subcategories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(120) DEFAULT NULL,
  description TEXT DEFAULT NULL,
  image VARCHAR(255) DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
  INDEX idx_category (category_id)
) ENGINE=InnoDB;

-- ============================================================
-- PRODUCTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(100) DEFAULT NULL UNIQUE,
  barcode VARCHAR(100) DEFAULT NULL UNIQUE,
  category_id INT DEFAULT NULL,
  subcategory_id INT DEFAULT NULL,
  description TEXT DEFAULT NULL,
  unit VARCHAR(20) DEFAULT 'pcs',
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  hsn_code VARCHAR(20) DEFAULT NULL,
  reorder_level INT DEFAULT 0,
  images JSON DEFAULT NULL,
  is_active TINYINT(1) DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
  FOREIGN KEY (subcategory_id) REFERENCES subcategories(id) ON DELETE SET NULL,
  INDEX idx_sku (sku),
  INDEX idx_barcode (barcode),
  INDEX idx_category (category_id),
  FULLTEXT INDEX ft_name (name)
) ENGINE=InnoDB;

-- ============================================================
-- PRODUCT BATCHES TABLE (FIFO Stock Management)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_batches (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  batch_number VARCHAR(100) DEFAULT NULL,
  purchase_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  mrp DECIMAL(15,2) DEFAULT NULL,
  quantity_purchased INT NOT NULL DEFAULT 0,
  quantity_remaining INT NOT NULL DEFAULT 0,
  expiry_date DATE DEFAULT NULL,
  manufacturing_date DATE DEFAULT NULL,
  supplier_id INT DEFAULT NULL,
  purchase_invoice_id INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL,
  INDEX idx_product (product_id),
  INDEX idx_batch (batch_number)
) ENGINE=InnoDB;

-- ============================================================
-- PRODUCT ATTRIBUTES TABLE (Dynamic Attribute Model)
-- ============================================================
CREATE TABLE IF NOT EXISTS product_attributes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  product_id INT NOT NULL,
  attribute_key VARCHAR(120) NOT NULL,
  attribute_value TEXT DEFAULT NULL,
  value_type ENUM('text','number','boolean','date','json') DEFAULT 'text',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY uk_product_attribute (product_id, attribute_key),
  INDEX idx_product_attr_key (attribute_key)
) ENGINE=InnoDB;

-- ============================================================
-- APP SETTINGS TABLE (Global Branding + Platform Config)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(120) NOT NULL UNIQUE,
  setting_value TEXT DEFAULT NULL,
  updated_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_setting_key (setting_key)
) ENGINE=InnoDB;

-- ============================================================
-- SUPPLIER INVOICES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS supplier_invoices (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_number VARCHAR(100) NOT NULL,
  supplier_id INT NOT NULL,
  invoice_date DATE NOT NULL,
  due_date DATE DEFAULT NULL,
  subtotal DECIMAL(15,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  discount_amount DECIMAL(15,2) DEFAULT 0.00,
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  paid_amount DECIMAL(15,2) DEFAULT 0.00,
  payment_status ENUM('unpaid','partial','paid') DEFAULT 'unpaid',
  notes TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_invoice_number (invoice_number),
  INDEX idx_supplier (supplier_id)
) ENGINE=InnoDB;

-- ============================================================
-- PURCHASE DETAILS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS purchase_details (
  id INT AUTO_INCREMENT PRIMARY KEY,
  invoice_id INT NOT NULL,
  product_id INT NOT NULL,
  batch_id INT DEFAULT NULL,
  quantity INT NOT NULL DEFAULT 0,
  purchase_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  selling_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  mrp DECIMAL(15,2) DEFAULT NULL,
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  expiry_date DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL,
  INDEX idx_invoice (invoice_id),
  INDEX idx_product (product_id)
) ENGINE=InnoDB;

-- ============================================================
-- ORDERS TABLE (Online Orders)
-- ============================================================
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(50) NOT NULL UNIQUE,
  customer_id INT DEFAULT NULL,
  user_id INT DEFAULT NULL,
  order_type ENUM('online','pos') DEFAULT 'online',
  status ENUM('pending','confirmed','processing','packed','shipped','delivered','cancelled','returned') DEFAULT 'pending',
  payment_status ENUM('pending','paid','partial','refunded','failed') DEFAULT 'pending',
  payment_method ENUM('cash','card','upi','netbanking','wallet','cod') DEFAULT 'cod',
  shipping_address TEXT DEFAULT NULL,
  billing_address TEXT DEFAULT NULL,
  subtotal DECIMAL(15,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  discount_amount DECIMAL(15,2) DEFAULT 0.00,
  shipping_charge DECIMAL(15,2) DEFAULT 0.00,
  total_amount DECIMAL(15,2) DEFAULT 0.00,
  notes TEXT DEFAULT NULL,
  delivery_boy_id INT DEFAULT NULL,
  estimated_delivery DATE DEFAULT NULL,
  delivered_at TIMESTAMP NULL DEFAULT NULL,
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  cancelled_by_user_id INT DEFAULT NULL,
  cancelled_by_role VARCHAR(30) DEFAULT NULL,
  cancel_elapsed_minutes INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (delivery_boy_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_order_number (order_number),
  INDEX idx_customer (customer_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB;

-- ============================================================
-- ORDER ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS order_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  batch_id INT DEFAULT NULL,
  product_name VARCHAR(200) DEFAULT NULL,
  quantity INT NOT NULL DEFAULT 1,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5,2) DEFAULT 0.00,
  discount_amount DECIMAL(15,2) DEFAULT 0.00,
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL,
  INDEX idx_order (order_id),
  INDEX idx_product (product_id)
) ENGINE=InnoDB;

-- ============================================================
-- SALES TABLE (POS + Online)
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_number VARCHAR(50) NOT NULL UNIQUE,
  order_id INT DEFAULT NULL,
  customer_id INT DEFAULT NULL,
  sale_type ENUM('pos','online') DEFAULT 'pos',
  salesman_id INT DEFAULT NULL,
  subtotal DECIMAL(15,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  discount_amount DECIMAL(15,2) DEFAULT 0.00,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(15,2) DEFAULT 0.00,
  change_amount DECIMAL(15,2) DEFAULT 0.00,
  payment_method ENUM('cash','card','upi','mixed') DEFAULT 'cash',
  payment_status ENUM('paid','unpaid','partial') DEFAULT 'paid',
  notes TEXT DEFAULT NULL,
  sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (salesman_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_sale_number (sale_number),
  INDEX idx_sale_date (sale_date),
  INDEX idx_sale_type (sale_type)
) ENGINE=InnoDB;

-- ============================================================
-- SALES ITEMS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS sales_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  sale_id INT NOT NULL,
  product_id INT NOT NULL,
  batch_id INT DEFAULT NULL,
  product_name VARCHAR(200) DEFAULT NULL,
  quantity INT NOT NULL DEFAULT 1,
  purchase_price DECIMAL(15,2) DEFAULT 0.00,
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  discount_percent DECIMAL(5,2) DEFAULT 0.00,
  discount_amount DECIMAL(15,2) DEFAULT 0.00,
  tax_rate DECIMAL(5,2) DEFAULT 0.00,
  tax_amount DECIMAL(15,2) DEFAULT 0.00,
  total_amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  profit_amount DECIMAL(15,2) DEFAULT 0.00,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT,
  FOREIGN KEY (batch_id) REFERENCES product_batches(id) ON DELETE SET NULL,
  INDEX idx_sale (sale_id),
  INDEX idx_product (product_id)
) ENGINE=InnoDB;

-- ============================================================
-- RETURNS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS returns (
  id INT AUTO_INCREMENT PRIMARY KEY,
  return_number VARCHAR(50) NOT NULL UNIQUE,
  sale_id INT DEFAULT NULL,
  order_id INT DEFAULT NULL,
  customer_id INT DEFAULT NULL,
  return_type ENUM('sales_return','purchase_return') DEFAULT 'sales_return',
  reason TEXT DEFAULT NULL,
  status ENUM('pending','approved','rejected','completed') DEFAULT 'pending',
  refund_method ENUM('cash','card','wallet','store_credit') DEFAULT 'cash',
  refund_amount DECIMAL(15,2) DEFAULT 0.00,
  processed_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE SET NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
  FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_return_number (return_number),
  INDEX idx_sale (sale_id)
) ENGINE=InnoDB;

-- ============================================================
-- PAYMENTS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  payment_number VARCHAR(50) NOT NULL UNIQUE,
  reference_type ENUM('order','sale','supplier_invoice','return') NOT NULL,
  reference_id INT NOT NULL,
  amount DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  payment_method ENUM('cash','card','upi','netbanking','wallet','cheque') DEFAULT 'cash',
  transaction_id VARCHAR(100) DEFAULT NULL,
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status ENUM('pending','completed','failed','reversed') DEFAULT 'completed',
  notes TEXT DEFAULT NULL,
  created_by INT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_payment_number (payment_number),
  INDEX idx_reference (reference_type, reference_id),
  INDEX idx_payment_date (payment_date)
) ENGINE=InnoDB;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- DEFAULT ADMIN USER (password: Admin@123)
-- ============================================================
INSERT INTO users (name, email, phone, password, role) VALUES
('Super Admin', 'admin@mart.com', '9999999999', '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj2NkpWfm7Aq', 'admin')
ON DUPLICATE KEY UPDATE id=id;

-- ============================================================
-- DEFAULT APP SETTINGS
-- ============================================================
INSERT INTO app_settings (setting_key, setting_value, updated_by) VALUES
('brandName', 'Mart', NULL),
('adminPanelName', 'Mart Admin', NULL),
('deliveryPanelName', 'Mart Delivery', NULL),
('websiteName', 'Mart', NULL),
('websiteTagline', 'Your one-stop shop for daily essentials', NULL),
('supportEmail', 'support@mart.com', NULL),
('supportPhone', '+91 98765 43210', NULL),
('storeAddress', '123 Main St, Mumbai, Maharashtra 400001', NULL),
('currency', 'INR', NULL),
('currencySymbol', '₹', NULL),
('defaultGST', '18', NULL),
('invoicePrefix', 'INV', NULL),
('orderPrefix', 'ORD', NULL),
('lowStockAlert', '10', NULL),
('enableSMS', 'false', NULL),
('enableEmail', 'true', NULL),
('timezone', 'Asia/Kolkata', NULL),
('logoUrl', '', NULL)
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- ============================================================
-- SAMPLE CATEGORIES
-- ============================================================
INSERT INTO categories (name, slug, is_active) VALUES
('Electronics', 'electronics', 1),
('Groceries', 'groceries', 1),
('Clothing', 'clothing', 1),
('Home & Kitchen', 'home-kitchen', 1),
('Medicines', 'medicines', 1)
ON DUPLICATE KEY UPDATE id=id;

-- ============================================================
-- CUSTOMER CART TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS cart_items (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL DEFAULT 1,
  unit_price DECIMAL(15,2) NOT NULL DEFAULT 0.00,
  selected_attributes JSON DEFAULT NULL,
  selected_key VARCHAR(64) NOT NULL DEFAULT 'default',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY uk_cart_user_product_variant (user_id, product_id, selected_key),
  INDEX idx_cart_user (user_id),
  INDEX idx_cart_product (product_id)
) ENGINE=InnoDB;

-- ============================================================
-- CUSTOMER SAVED ADDRESSES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS user_addresses (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  label VARCHAR(60) DEFAULT NULL,
  recipient_name VARCHAR(120) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  address_line TEXT NOT NULL,
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100) NOT NULL,
  pincode VARCHAR(15) NOT NULL,
  landmark VARCHAR(200) DEFAULT NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_addresses_user (user_id)
) ENGINE=InnoDB;

-- ============================================================
-- CUSTOMER WISHLIST TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS wishlists (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  product_id INT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  UNIQUE KEY uk_wishlist_user_product (user_id, product_id),
  INDEX idx_wishlist_user (user_id)
) ENGINE=InnoDB;
