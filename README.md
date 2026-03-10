# 🛒 Mart Backend API

A secure and scalable REST API for **E-Commerce + ERP + POS** built with Node.js, Express, and MySQL.

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment
Edit `.env` file:
```env
PORT=5000
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=mart_db
JWT_SECRET=mart_super_secret_jwt_key_2024
JWT_EXPIRES_IN=7d
NODE_ENV=development
```

### 3. Setup Database
Open **MySQL Workbench** and run `database.sql`

### 4. Start Server
```bash
# Development (with auto-restart)
npm run dev

# Production
npm start
```

---

## 🗂 Project Structure
```
mart-backend/
 ┣ config/          → Database connection
 ┣ controllers/     → Business logic
 ┣ middleware/       → Auth, Role, Error handlers
 ┣ models/          → (Reserved for ORM if needed)
 ┣ routes/          → Express route definitions
 ┣ utils/           → JWT helpers, Response helpers
 ┣ database.sql     → MySQL schema + seed data
 ┣ server.js        → App entry point
 ┗ .env             → Environment variables
```

---

## 🔐 Authentication

All protected routes require:
```
Authorization: Bearer <your_jwt_token>
```

### Default Admin Account
- Email: `admin@mart.com`
- Password: `Admin@123`

---

## 📡 API Reference

**Base URL:** `http://localhost:5000/api`

### Auth Routes
| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | `/auth/register` | Register user | ❌ |
| POST | `/auth/login` | Login | ❌ |
| POST | `/auth/reset-password` | Reset password | ❌ |
| GET | `/auth/me` | Get profile | ✅ |

### Category Routes
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/categories` | Get all categories | Public |
| POST | `/categories` | Add category | admin, subadmin |
| PUT | `/categories/:id` | Update category | admin, subadmin |
| DELETE | `/categories/:id` | Delete category | admin |
| GET | `/categories/:id/subcategories` | Get subcategories | Public |
| POST | `/categories/subcategory` | Add subcategory | admin, subadmin |

### Product Routes
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/products` | Get all products | Public |
| GET | `/products/search?q=name` | Search products | Public |
| GET | `/products/search?barcode=123` | Search by barcode | Public |
| GET | `/products/:id` | Get product by ID | Public |
| POST | `/products` | Add product | admin, subadmin |
| POST | `/products/:id/batch` | Add batch | admin, subadmin |
| PUT | `/products/:id` | Update product | admin, subadmin |
| DELETE | `/products/:id` | Soft delete | admin |

### Purchase Routes
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/purchases/suppliers` | Get suppliers | admin, subadmin |
| POST | `/purchases/suppliers` | Add supplier | admin, subadmin |
| GET | `/purchases/invoices` | Get invoices | admin, subadmin |
| POST | `/purchases/invoices` | Add invoice | admin, subadmin |
| POST | `/purchases/entry` | Add purchase items | admin, subadmin |

### Order Routes
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/orders` | Place order | Any auth user |
| GET | `/orders/my` | Get user orders | Any auth user |
| GET | `/orders/all` | Get all orders | admin, subadmin |
| GET | `/orders/:id` | Get order details | Any auth user |
| PUT | `/orders/:id/status` | Update status | admin, subadmin, delivery |
| PUT | `/orders/:id/assign-delivery` | Assign delivery | admin, subadmin |

### POS Routes
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| POST | `/pos/bill` | Create POS bill | admin, subadmin, salesman |
| GET | `/pos/invoice/:saleId` | Get invoice data | Any auth user |
| GET | `/pos/sales` | Get POS sales | admin, subadmin, salesman |

### Report Routes
| Method | Endpoint | Description | Roles |
|--------|----------|-------------|-------|
| GET | `/reports/daily-sales?date=2024-01-01` | Daily sales | admin, subadmin |
| GET | `/reports/monthly-sales?year=2024&month=1` | Monthly sales | admin, subadmin |
| GET | `/reports/profit?from=2024-01-01&to=2024-01-31` | Profit report | admin, subadmin |
| GET | `/reports/stock` | Stock report | admin, subadmin |

---

## 👥 Roles
| Role | Description |
|------|-------------|
| `admin` | Full access |
| `subadmin` | Most admin features, no user management |
| `salesman` | POS billing only |
| `delivery` | Update delivery status |
| `customer` | Place and view own orders |

---

## 🏭 Key Features

### FIFO Stock Management
POS billing uses **First In First Out** batch selection — oldest batches are consumed first automatically.

### Batch System
Each product purchase creates a batch with:
- Purchase price & selling price per batch
- Quantity tracking per batch
- Expiry date support
- Profit calculation per sale

### Response Format
All APIs return consistent JSON:
```json
{
  "success": true,
  "message": "...",
  "data": {},
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 🔧 CORS Origins
- `http://localhost:5173` — Customer Frontend
- `http://localhost:5174` — Admin Dashboard  
- `http://localhost:5175` — Delivery App
# mart-backend
# mart-backend
