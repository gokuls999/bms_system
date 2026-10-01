# Mini Business Management System (BMS)

A full-stack web app for managing **customers**, **products**, and **orders**. It has JWT authentication, Admin/Staff roles, a dashboard, and order creation that stays correct when several users buy the same stock at once.

**Live demo (AWS EC2):** https://bms.52-62-250-109.sslip.io. Log in as `admin` / `Admin@12345` or `staff` / `Staff@12345`. Deployment details are in [section 11](#11-deployment-aws).

**Interactive API docs (Swagger):** https://bms.52-62-250-109.sslip.io/api/docs/

---

## 1. Project overview

| Module | Features |
|---|---|
| **Authentication** | Registration, login, logout (refresh token revoked), JWT access tokens refreshed automatically, protected endpoints, **Admin** and **Staff** roles |
| **Customers** | Create, edit, view (with order history), delete or deactivate/activate, search (name, email, phone), status filter, pagination |
| **Products** | CRUD, categories, search (name, SKU, category), category, status and low-stock filters, pagination, stock validation, **unique SKU** (case-insensitive) |
| **Orders** | Pick a customer, add several products with quantities, subtotal, flat or % discount, final amount. Stock decreases automatically, overselling is blocked, and each order item keeps the unit price at the time of purchase |
| **Dashboard** | Total customers, products, low-stock products, orders, total sales, recent orders, 14-day sales trend |
| **Users** (Admin only) | List, create, edit role, deactivate, delete users |

### Role matrix

| Action | Admin | Staff |
|---|:-:|:-:|
| View dashboard, customers, products, orders | ✅ | ✅ |
| Create / edit / view / deactivate customers | ✅ | ✅ |
| Create orders | ✅ | ✅ |
| Create / edit products and categories | ✅ | ✅ |
| **Delete** customers, products and categories | ✅ | ❌ (unless an Admin grants **Can delete**) |
| Manage users (incl. **delete users**) | ✅ | ❌ (never) |

Self-registration always creates a **Staff** account. Only an Admin can grant the Admin role.

**Delete permission.** Staff manage records but cannot delete them by default. An Admin can tick **"Can delete customers, products and categories"** for an individual Staff member on the Users page (the `can_delete` field). This never allows deleting users; that stays Admin-only.

---

## 2. Tech stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12+, **Django 6**, **Django REST Framework**, `djangorestframework-simplejwt` (with token blacklist), `django-filter`, `django-cors-headers`, `drf-spectacular` (OpenAPI + Swagger UI) |
| Database | **PostgreSQL** (tested with 16), via `psycopg` 3 |
| Frontend | **React 19**, **Vite 8**, React Router 7, Axios, plain CSS (responsive, no UI framework) |
| Testing | Django test runner / DRF `APITestCase`, plus multi-threaded concurrency tests against PostgreSQL |
| Deployment | **AWS EC2**, Docker Compose, Caddy (automatic HTTPS), Gunicorn, **GitHub Actions** (test, then auto-deploy) |

---

## 3. Installation

**Prerequisites:** Python 3.12+, Node.js 20.19+ (or 22+), PostgreSQL 14+.

```bash
git clone https://github.com/gokuls999/bms_system.git
cd bms_system
```

### Backend

```bash
cd backend
python -m venv .venv
# Windows:  .venv\Scripts\activate
# macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # then edit DB credentials (see below)
```

### Frontend

```bash
cd frontend
npm install
cp .env.example .env          # optional - defaults to http://localhost:8000/api
```

---

## 4. Environment variables

### `backend/.env`

| Variable | Default | Description |
|---|---|---|
| `DJANGO_SECRET_KEY` | dev key | **Set a long random value in production** |
| `DJANGO_DEBUG` | `True` | Debug mode |
| `DJANGO_ALLOWED_HOSTS` | `localhost,127.0.0.1` | Comma-separated hosts |
| `DB_ENGINE` | `postgres` | `postgres`, or `sqlite` for a zero-setup fallback (concurrency test is skipped on SQLite) |
| `DB_NAME` | `bms` | PostgreSQL database name |
| `DB_USER` | `postgres` | PostgreSQL user |
| `DB_PASSWORD` | *(empty)* | PostgreSQL password |
| `DB_HOST` / `DB_PORT` | `localhost` / `5432` | PostgreSQL host and port |
| `JWT_ACCESS_MINUTES` | `30` | Access token lifetime |
| `JWT_REFRESH_DAYS` | `1` | Refresh token lifetime |
| `CORS_ALLOWED_ORIGINS` | `http://localhost:5173,...` | Frontend origins allowed to call the API |
| `LOW_STOCK_THRESHOLD` | `10` | Stock level at or below which a product counts as "low stock" |
| `TIME_ZONE` | `Asia/Kolkata` | Used for dates and the daily sales trend |

### `frontend/.env`

| Variable | Default | Description |
|---|---|---|
| `VITE_API_URL` | `http://localhost:8000/api` | Base URL of the backend API |

---

## 5. Database setup

Create the database (once):

```bash
psql -U postgres -c "CREATE DATABASE bms;"
```

Then, from `backend/` with the virtualenv active:

```bash
python manage.py migrate          # create tables and constraints
python manage.py seed_demo        # demo users + sample categories, products, customers, orders
# python manage.py seed_demo --reset   # wipe business data and reseed
```

### Schema

```
User (role: admin | staff)
Customer ──< Order ──< OrderItem >── Product >── Category
                │
                └── created_by → User
```

| Table | Key columns / constraints |
|---|---|
| `accounts_user` | `username` (unique), `email` (unique), `role` |
| `customers_customer` | `name`, `email` (unique), `phone`, `address`, `status` (indexed), `created_at` |
| `products_category` | `name` (unique) |
| `products_product` | `name`, `sku` (**unique**, stored upper-case), `category_id` (PROTECT), `price` (`CHECK > 0`), `stock_quantity` (**`CHECK >= 0`**), `status`, `created_at` |
| `orders_order` | `customer_id` (PROTECT), `created_by_id`, `subtotal`, `discount_type`, `discount_value`, `discount_amount`, `total_amount` (`CHECK >= 0`), `notes`, `created_at` |
| `orders_orderitem` | `order_id`, `product_id` (PROTECT), snapshot columns `product_name`, `sku`, **`unit_price`**, `quantity` (`CHECK > 0`), `line_total` |

---

## 6. API documentation

**Interactive docs:** open **`/api/docs/`** (Swagger UI, generated with drf-spectacular), e.g. https://bms.52-62-250-109.sslip.io/api/docs/ or http://localhost:8000/api/docs/ locally. To try protected endpoints there, call `POST /api/auth/login`, click **Authorize** and paste the `access` token. The raw OpenAPI 3 schema is at `/api/schema/`.

Base URL: `http://localhost:8000/api`. Every endpoint except register, login and refresh needs this header:

```
Authorization: Bearer <access token>
```

Trailing slashes on the auth and dashboard URLs are optional.

### Auth

| Method | Endpoint | Body | Response |
|---|---|---|---|
| POST | `/auth/register` | `{username, email, password, first_name?, last_name?}` | `201` user (role = staff) |
| POST | `/auth/login` | `{username, password}` | `200 {access, refresh, user}` |
| POST | `/auth/refresh` | `{refresh}` | `200 {access, refresh}` (rotated) |
| POST | `/auth/logout` | `{refresh}` | `205`; the refresh token is blacklisted |
| GET | `/auth/me` | — | current user |

### Customers (Admin, Staff; delete needs delete permission)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/customers/` | `?search=&status=active\|inactive&page=&page_size=&ordering=name\|-created_at` |
| POST | `/customers/` | `{name, email, phone, address?, status?}` |
| GET | `/customers/{id}/` | includes `order_count` |
| PUT / PATCH | `/customers/{id}/` | |
| DELETE | `/customers/{id}/` | `204`; `403` for Staff without delete permission; **`409 protected`** if the customer has orders (deactivate instead) |
| POST | `/customers/{id}/deactivate/` · `/activate/` | soft status change |

### Categories & products (read, create, edit: Admin and Staff; delete needs delete permission)

| Method | Endpoint | Notes |
|---|---|---|
| GET / POST | `/categories/` | unpaginated list, `{name}` |
| PUT / PATCH / DELETE | `/categories/{id}/` | delete returns `409` if products use the category |
| GET | `/products/` | `?search=&category=<id>&status=&low_stock=true&min_price=&max_price=&page=&ordering=price\|-stock_quantity…` |
| POST | `/products/` | `{name, sku, category, price, stock_quantity, status?}` |
| GET / PUT / PATCH / DELETE | `/products/{id}/` | delete returns `409` if the product appears in orders |

### Orders (Admin, Staff)

| Method | Endpoint | Notes |
|---|---|---|
| GET | `/orders/` | `?search=<customer/product/SKU>&customer=<id>&date_from=YYYY-MM-DD&date_to=&page=` |
| POST | `/orders/` | see below; `201` full order |
| GET | `/orders/{id}/` | order with items |
| POST | `/orders/preview/` | same body without `customer`; returns the server-computed totals and checks stock, **without saving** |

Orders cannot be changed once created: there is no PUT or DELETE, which returns `405`.

**Create order request**

```json
POST /api/orders/
{
  "customer": 1,
  "items": [
    {"product": 3, "quantity": 2},
    {"product": 7, "quantity": 1}
  ],
  "discount_type": "amount",      // "amount" (₹) or "percent"
  "discount_value": "100",
  "notes": "optional"
}
```

**Response `201`**

```json
{
  "id": 29, "order_number": "#1029",
  "customer": 1, "customer_name": "Arun Kumar",
  "subtotal": "1300.00", "discount_amount": "100.00", "total_amount": "1200.00",
  "discount_type": "amount", "discount_value": "100.00",
  "items": [
    {"product": 3, "product_name": "Product A", "sku": "ELE-1001", "unit_price": "500.00", "quantity": 2, "line_total": "1000.00"},
    {"product": 7, "product_name": "Product B", "sku": "STA-2001", "unit_price": "300.00", "quantity": 1, "line_total": "300.00"}
  ],
  "created_by_username": "staff", "created_at": "2026-09-30T18:02:01+05:30"
}
```

Duplicate product lines are merged. A flat discount cannot exceed the subtotal, and a percentage cannot exceed 100. Orders cannot be placed for an inactive customer or with an inactive product.

### Dashboard

`GET /dashboard/` returns `total_customers`, `active_customers`, `total_products`, `low_stock_count`, `low_stock_products[]`, `total_orders`, `total_sales`, `recent_orders[]` (5) and `sales_trend[]` (14 days).

### Users (Admin only)

`GET/POST /users/`, `GET/PUT/PATCH/DELETE /users/{id}/`. Staff get `403`. An admin cannot delete their own account. Set `"can_delete": true` on a Staff user to let them delete customers, products and categories.

### Errors

Every error has the same JSON shape:

```json
{ "detail": "Human readable message", "code": "machine_code", "errors": { "field": ["..."] } }
```

| Situation | Status | `code` |
|---|---|---|
| Validation error (bad fields, **duplicate SKU**, duplicate email, bad discount) | `400` | `validation_error` (per-field messages in `errors`) |
| Missing / invalid / expired token, wrong password | `401` | `not_authenticated` / `token_not_valid` / `no_active_account` |
| Role not allowed | `403` | `permission_denied` |
| Unknown record or route | `404` | `not_found` |
| Method not allowed (e.g. editing an order) | `405` | `method_not_allowed` |
| **Insufficient stock** | `409` | `insufficient_stock` (+ `items: [{product_id, product_name, requested, available}]`) |
| Deleting a record that orders still reference | `409` | `protected` |

Example of a duplicate SKU:

```json
400 {"detail": "sku: A product with this SKU already exists.", "code": "validation_error",
     "errors": {"sku": ["A product with this SKU already exists."]}}
```

---

## 7. How to run the frontend

```bash
cd frontend
npm run dev          # http://localhost:5173
npm run build        # production build in dist/
```

The frontend only talks to the backend through the REST API (Axios, `src/api/client.js`). It never accesses the database.

**Pages:** Login, Register, Dashboard, Customers, Products, New Order, Order History, Order Detail, and Users (Admin only). The layout is responsive: on tablets and phones the sidebar collapses into a hamburger menu and tables hide less important columns.

## 8. How to run the backend

```bash
cd backend
# activate the virtualenv first
python manage.py runserver        # http://localhost:8000
python manage.py test             # run the test suite
```

On PostgreSQL the test suite includes the concurrency tests described in section 10. On SQLite they are skipped. The Django admin site is available at `/admin/` (log in as `admin`).

---

## 9. Demo credentials

Created by `python manage.py seed_demo`:

| Role | Username | Password |
|---|---|---|
| Admin | `admin` | `Admin@12345` |
| Staff | `staff` | `Staff@12345` |

The login page has one-click buttons that fill in these credentials.

---

## 10. Design and architecture decisions

### Preventing overselling (assignment section 9)

Order creation (`backend/apps/orders/services.py → create_order`) runs inside **one database transaction**:

1. **Row-level locks.** `Product.objects.select_for_update().filter(pk__in=...).order_by("pk")` issues `SELECT … FOR UPDATE`. A second transaction that wants any of those products **blocks** until the first commits or rolls back.
2. **Check after locking.** Stock is read only once the lock is held, so the value cannot change between the check and the update. If any line exceeds the available stock, the whole order is rejected with `409 insufficient_stock` and nothing is written.
3. **Atomic decrement.** `UPDATE … SET stock_quantity = stock_quantity - n` (a Django `F()` expression) runs in the same transaction as the order and its items. Either all of it commits or none of it does.
4. **No deadlocks.** Locks are always taken in primary-key order, so two orders with overlapping products cannot wait on each other.
5. **Database safety net.** A `CHECK (stock_quantity >= 0)` constraint means PostgreSQL itself rejects negative inventory, even if some future code path forgot to lock.

With stock = 5, **User A orders 4** and **User B orders 3** at the same moment. Whichever transaction gets the lock first succeeds. The other waits, then reads stock = 1 and receives `409`. Two tests in `apps/orders/tests/test_concurrency.py` prove this with real threads and separate PostgreSQL connections:
- the exact 5 / 4 / 3 scenario: exactly one order succeeds;
- 25 concurrent single-unit orders against stock 10: exactly 10 succeed and the final stock is 0.

For orders I chose pessimistic locking over optimistic versioning because an order is a short transaction that often touches several rows, and blocking briefly is simpler and fairer than retry loops. Two alternatives were considered: a single conditional `UPDATE … WHERE stock >= n` works for one product but makes multi-product orders awkward to report and roll back, and `SERIALIZABLE` isolation would need retry handling for every request.

### Edits racing with orders (optimistic locking)

Row locks protect order-versus-order races. A different race is an admin editing a product while an order reduces its stock: the edit form still holds the old stock value and would write it back on save (a "lost update"), so stock would show units that no longer exist.

Product edits are therefore **optimistically locked**. The edit form sends back the product's `updated_at` (as `expected_updated_at`). The server locks the row, and if `updated_at` changed since the form was opened (orders bump it when they reduce stock), it returns **`409 stale_product`** instead of overwriting. The UI then reloads the current stock, keeps the user's other edits and asks them to review and save again. The test `test_stale_edit_after_order_is_rejected` reproduces the exact scenario.

### Other decisions

- **Server-authoritative pricing.** The client sends only product IDs and quantities. Prices, subtotal, discount and total are always computed on the server with `Decimal` and `ROUND_HALF_UP`. The React page shows a live preview using the same formula, and `/orders/preview/` exposes the server calculation.
- **Price snapshots.** `OrderItem` stores `unit_price`, `product_name` and `sku` at the time of purchase, so later product edits never change past orders.
- **Orders are immutable.** They carry stock movements and price snapshots, so the API exposes only list, retrieve and create.
- **Deleting records with history.** Customers, products and categories that orders reference use `on_delete=PROTECT`. Deleting one returns a clear `409`, and the UI suggests deactivating instead.
- **Case-insensitive unique SKU.** SKUs are trimmed and stored upper-case, validated in the serializer for a friendly message, and backed by a unique index. If two requests create the same SKU at the same moment, the resulting `IntegrityError` is converted into the same `400 duplicate SKU` response.
- **JWT.** Access tokens are short-lived. Refresh tokens rotate and are blacklisted on logout. The Axios client refreshes transparently on a `401`, sharing a single refresh call when several requests fail at once, and returns the user to the login page if the refresh fails.
- **Consistent errors.** A custom DRF exception handler (`apps/core/exceptions.py`) maps DRF, Django and database errors (`Http404`, `ProtectedError`, `IntegrityError`) to one JSON shape with a stable `code`.
- **Project layout.** There is one Django app per domain (`accounts`, `customers`, `products`, `orders`, `dashboard`) plus `core` for shared permissions, pagination, errors and the seed command. Business logic lives in `orders/services.py`, not in views or serializers, so it is easy to test and reuse (the seed command uses it too).
- **Query efficiency.** List endpoints use `select_related` and annotated counts to avoid N+1 queries. Status and name columns are indexed.

### Project structure

```
bms_system/
├── backend/
│   ├── config/               settings, urls
│   └── apps/
│       ├── core/             permissions, pagination, exception handler, seed_demo
│       ├── accounts/         User + role, register/login/logout/me, user management
│       ├── customers/
│       ├── products/         Category, Product, filters
│       ├── orders/           Order, OrderItem, services.py (locking), preview
│       └── dashboard/
└── frontend/
    └── src/
        ├── api/client.js     Axios + JWT refresh
        ├── auth/             AuthContext
        ├── components/       Layout, modals, pagination, toasts
        ├── hooks/            useList, usePage, useDebounce
        └── pages/            Dashboard, Customers, Products, NewOrder, Orders, OrderDetail, Users, Login, Register
```

---

## 11. Deployment (AWS)

The live demo runs on a single **AWS EC2** instance. Docker Compose runs three containers on it:

```
Browser ──HTTPS──> Elastic IP 52.62.250.109  (EC2 t3.micro, Ubuntu 24.04, 20 GB gp3)
                     │  Security group: 80/443 open, 22 for SSH
                     └─ web      Caddy 2: automatic Let's Encrypt HTTPS
                          ├─ /                  → React build (static files)
                          └─ /api, /admin, /static → backend
                        backend  Django + Gunicorn (migrates and seeds on start)
                        db       PostgreSQL 16 (data on a named Docker volume)
```

| AWS service | Purpose |
|---|---|
| EC2 (t3.micro) | Runs the whole stack with Docker Compose |
| Elastic IP | Fixed public address, so the hostname never changes |
| Security group | Firewall: HTTP and HTTPS open to the internet, SSH for administration |
| EBS gp3 (20 GB) | Instance disk, including the Postgres volume |
| AWS Budgets | Zero-spend alert, so any real charge sends an email |

**Hostname.** `bms.52-62-250-109.sslip.io` is a free wildcard DNS name that resolves to the Elastic IP. Caddy obtains a Let's Encrypt certificate for it automatically. To switch to a custom domain, see below.

**Files** (all in [`deploy/`](deploy/)):
- `docker-compose.yml`: the db, backend and web services, with a healthcheck and persistent volumes;
- `web.Dockerfile`: a multi-stage build (Node builds the React app, then Caddy serves it);
- `Caddyfile`: HTTPS, the API reverse proxy and the single-page-app fallback;
- `setup-ec2.sh`: one-time server setup (swap, Docker, clone, generated secrets, `docker compose up`);
- `../backend/Dockerfile` and `docker-entrypoint.sh`: Gunicorn plus whitenoise, running `migrate` and `seed_demo` on start.

### Deploy from scratch

1. Launch an Ubuntu 24.04 EC2 instance (t3.micro, 20 GB), open ports 80 and 443 in its security group, and associate an Elastic IP.
2. Connect with EC2 Instance Connect and run:
   ```bash
   curl -fsSL https://raw.githubusercontent.com/gokuls999/bms_system/main/deploy/setup-ec2.sh | bash
   ```
3. The script prints the site address. Secrets (Django key, database password) are generated into `deploy/.env` on the server and never committed.

### Continuous deployment (GitHub Actions)

Every push to `main` runs [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml):

1. **test**: the full backend test suite on a **PostgreSQL 16** service container (including the concurrency tests), and a production build of the frontend;
2. **deploy**: only if tests pass, it connects to EC2 over SSH, resets the checkout to `origin/main` and runs `docker compose up -d --build`.

A failing test never reaches the live site. Two repository secrets are required: `EC2_HOST` (the Elastic IP) and `EC2_SSH_KEY` (the instance's private key). To redeploy manually instead:

```bash
cd ~/bms_system && git pull && cd deploy && sudo docker compose up -d --build
```

### Run the test suite on the server (PostgreSQL)

```bash
cd ~/bms_system/deploy && sudo docker compose exec backend python manage.py test
```

On PostgreSQL every test runs, including the two concurrency tests that SQLite skips.

### Use a custom domain

1. At your DNS provider, add an **A record** pointing the domain (e.g. `bms.example.com`) to the Elastic IP.
2. On the server, edit `deploy/.env`: change `SITE_ADDRESS`, `DJANGO_ALLOWED_HOSTS` and `CSRF_TRUSTED_ORIGINS` to the new domain.
3. Run `sudo docker compose up -d`. Caddy issues the new certificate automatically.
