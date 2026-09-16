# REVO365 Backend - Knowledge Transfer Documentation

## Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture & Tech Stack](#architecture--tech-stack)
3. [Project Structure](#project-structure)
4. [Key Components](#key-components)
5. [Database & Storage](#database--storage)
6. [External Integrations](#external-integrations)
7. [API Endpoints Overview](#api-endpoints-overview)
8. [Authentication & Session Management](#authentication--session-management)
9. [Document Generation](#document-generation)
10. [Payment Processing - Detailed Step-by-Step Flows](#payment-processing---detailed-step-by-step-flows)
11. [Order Creation Flow - Detailed Steps](#order-creation-flow---detailed-steps)
12. [Document Generation Flow - Detailed Steps](#document-generation-flow---detailed-steps)
13. [Product Upload Flow - Detailed Steps](#product-upload-flow---detailed-steps)
14. [Stock Management Flow - Detailed Steps](#stock-management-flow---detailed-steps)
15. [Cart Management Flow - Detailed Steps](#cart-management-flow---detailed-steps)
16. [Ticket Management Flow - Detailed Steps](#ticket-management-flow---detailed-steps)
17. [Complete Detailed Flows for All Major Processes](#complete-detailed-flows-for-all-major-processes)
18. [Deployment](#deployment)
19. [Environment Variables](#environment-variables)
20. [Common Issues & Troubleshooting](#common-issues--troubleshooting)

---

## Project Overview

**REVO365 Backend** is a comprehensive inventory management and e-commerce backend system built with Node.js/TypeScript. It handles:

- **Product & Stock Management**: Complete inventory tracking with versioning (v1 and v2 APIs)
- **Order Management**: Order processing, tracking, and fulfillment
- **Purchase Orders & Requests**: Procurement workflow management
- **Invoice Generation**: Automated invoice creation (product and service invoices)
- **Payment Processing**: Integration with Razorpay and PhonePe
- **Ticket Management**: Support ticket system
- **User Management**: Multi-role user system (customers, inventory users)
- **Document Generation**: Automated PO, PR, Invoice, and Ticket document generation
- **Shipping Integration**: Shiprocket integration for shipping calculations
- **Push Notifications**: Firebase Cloud Messaging (FCM) integration

---

## Architecture & Tech Stack

### Core Technologies

- **Runtime**: Node.js 20
- **Language**: TypeScript (ES2020)
- **Framework**: Fastify 4.28.1
- **Database**: PostgreSQL (via `pg` library)
- **Cache/Session**: Redis
- **Build Tool**: TypeScript Compiler (tsc)

### Key Libraries

- **Database**: `@fastify/postgres`, `pg`
- **File Upload**: `fastify-multer`
- **Validation**: `ajv`, `ajv-errors`
- **Document Generation**: `docxtemplater`, `pizzip`
- **PDF Conversion**: LibreOffice (via Docker)
- **Image Processing**: `jimp`
- **Payment**: `razorpay`
- **Cloud Storage**: `@aws-sdk/client-s3`
- **Push Notifications**: `firebase-admin`
- **Email**: `nodemailer`
- **Scheduling**: `node-cron`
- **CSV Processing**: `csvtojson`, `csv-stringify`
- **Excel**: `xlsx`

### Architecture Pattern

- **MVC-like Structure**: Controllers → Services → Database
- **Schema Validation**: AJV-based request validation
- **Error Handling**: Centralized error handler for PostgreSQL errors
- **Session Management**: Redis-based session storage

---

## Project Structure

```
gcp_Revo365-backend/
├── src/                          # Source TypeScript files
│   ├── index.ts                 # Application entry point
│   ├── routes/
│   │   └── routes.ts            # All API route definitions
│   ├── controller/              # Request handlers (39 controllers)
│   ├── services/                # Business logic layer (43 services)
│   ├── schemas/                 # Request validation schemas (23 schemas)
│   ├── database/
│   │   ├── postgres.ts         # PostgreSQL connection pool
│   │   └── redis.session.ts    # Redis session management
│   ├── config/
│   │   └── config.ts           # Environment configuration
│   ├── errorHandler/
│   │   └── errorHandler.ts    # Centralized error handling
│   ├── aws/                    # AWS S3 integration
│   ├── firebase/               # Firebase push notifications
│   ├── Gmail/                  # Email service
│   ├── googletask/            # Google Cloud Tasks
│   ├── imageResize/           # Image processing
│   ├── multer/                # File upload configuration
│   ├── phonepe/               # PhonePe payment integration
│   ├── shiprocket/            # Shiprocket shipping
│   ├── utils/                 # Utility functions
│   └── schedule/              # Scheduled tasks
├── build/                      # Compiled JavaScript output
├── uploads/                    # Local file storage
├── Dockerfile                  # Docker configuration
├── cloudbuildprod.yaml        # GCP Cloud Build (Production)
├── cloudbuilduat.yaml         # GCP Cloud Build (UAT)
├── package.json               # Dependencies and scripts
└── tsconfig.json              # TypeScript configuration
```

---

## Key Components

### 1. Application Entry Point (`src/index.ts`)

**Key Features:**

- Fastify server initialization
- CORS configuration
- Static file serving for `/uploads` directory
- Database connection check on startup
- Redis session connection
- Request logging (CSV format - currently commented out)
- Port: 5600 (configurable via `PORT` env variable)

**Important Hooks:**

- `onRequest`: Tracks request start time
- `onReady`: Validates database and Redis connections

### 2. Routes (`src/routes/routes.ts`)

**Route Organization:**

- **Version 1 APIs**: Legacy endpoints (mostly commented out)
- **Version 2 APIs**: Current production endpoints (prefixed with `/v2/`)
- **Version 3 APIs**: GCP-optimized endpoints (prefixed with `/v3/`)

**Route Protection:**

- Most routes use `getSession` preHandler for authentication
- Some public endpoints (e.g., `/v2/product-ecommerce`, `/rating-ecom`)

### 3. Controllers (`src/controller/`)

Controllers handle HTTP requests and delegate business logic to services. Key controllers:

- `productrevo.controller.ts`: Product management (v2)
- `stockrevo.controller.ts`: Stock/inventory management (v2)
- `orders.controller.ts`: Order processing
- `transaction.controller.ts`: Payment processing
- `purchaseorder.controller.ts`: Purchase order management
- `revoinvoice.controller.ts`: Invoice generation
- `tickets.controller.ts`: Support ticket system
- `user.controller.ts`: User management
- `Inventoryuser.controller.ts`: Inventory user management
- `dashboard.controller.ts`: Analytics and reporting

### 4. Services (`src/services/`)

Services contain business logic and database operations. Key services:

- `product.service.ts`: Product CRUD operations
- `stockRevo.service.ts`: Stock management
- `orders.service.ts`: Order processing logic
- `transaction.service.ts`: Payment transaction handling
- `poGenerate.service.ts`: Purchase order document generation
- `prGenerate.service.ts`: Purchase request document generation
- `revoinvoice.service.ts`: Invoice generation service
- `shiprocket.service.ts`: Shipping cost calculation
- `session.service.ts`: Session management utilities

### 5. Schemas (`src/schemas/`)

AJV-based validation schemas for request validation:

- `ajv.schema.ts`: Validation middleware
- `productrevo.schema.ts`: Product validation
- `stockRevo.schema.ts`: Stock validation
- `orders.schema.ts`: Order validation
- `purchaseorder.schema.ts`: PO validation
- And 18+ more schemas for different entities

---

## Database & Storage

### PostgreSQL Database

**Connection Pool Configuration:**

```typescript
max: 500; // Maximum connections
idleTimeoutMillis: 200000; // 200 seconds
connectionTimeoutMillis: 30000; // 30 seconds
```

**Connection Details:**

- Host: `POSTGRES_HOST`
- Port: `POSTGRES_PORT`
- Database: `POSTGRES__DATABASE`
- User: `POSTGRES_USER`
- Password: `POSTGRES_PASSWORD`

**Query Function:**

- `query(stmt, options)`: Executes SQL queries with optional parameters
- Supports both parameterized and non-parameterized queries

**Error Handling:**

- Centralized error handler (`ErrorHandler`) maps PostgreSQL error codes to user-friendly messages
- Handles: duplicate keys, foreign key violations, null constraints, syntax errors, etc.

### Redis Session Storage

**Purpose:**

- Session management
- Email OTP storage
- Temporary data caching

**Configuration:**

- URL Format: `redis://:password@host:port`
- Session Expiry: `REDIS_SESSIONEXSEC` (seconds)
- Email OTP Expiry: `REDIS_EMAIL_OTPEXPSEC` (seconds)

**Key Functions:**

- `saveSession(sessionId, sessionData)`: Save session with expiry
- `getSession(req, reply)`: Middleware to validate session
- `getSessionData(req)`: Retrieve session data

### AWS S3 Storage

**Bucket:** `revo365`

**Usage:**

- Product images stored in: `product/{productId}/{size}/`
- Image sizes: Small, Medium, Large, Thumbnail
- Presigned URLs generated for secure access (1-hour expiry)

**Key Functions:**

- `gets3Dataurl`: Get presigned URLs for product images
- `gets3DataStream`: Stream images directly from S3

### Local File Storage

**Directory:** `/uploads`

**Stored Files:**

- Generated documents (PDFs, DOCX)
- Uploaded CSV files for data loading
- Temporary files

**File Naming:**

- Format: `{timestamp}-{originalname}`
- Example: `2024-12-06T10-11-03.358Z-ProductList.csv`

---

## External Integrations

### 1. Payment Gateways

#### Razorpay

- **Purpose**: Payment processing for orders and tickets
- **Endpoints:**
  - `/payment/razorpay`: Initialize payment
  - `/payment/razorpay/ticket`: Initialize ticket payment
  - `/payment/confirmation-razorpay`: Payment confirmation
  - `/payment/confirmation-razorpay/tickets`: Ticket payment confirmation

#### PhonePe

- **Purpose**: Alternative payment gateway
- **Endpoint:** `/payment`: Initialize PhonePe payment
- **Status:** `/payment/status`: Payment status callback

### 2. Shipping Integration

#### Shiprocket

- **Purpose**: Shipping cost calculation and courier selection
- **Endpoint:** `/calculate-shipping`
- **Features:**
  - Automatic courier selection (lowest cost)
  - Fallback rates if API fails
  - COD charge calculation
  - Weight-based pricing
- **Seller Pincode:** 600002 (hardcoded)

### 3. Firebase Cloud Messaging (FCM)

- **Purpose**: Push notifications to mobile apps
- **Endpoint:** `/fcmnotification` (test endpoint)
- **Service:** `firebasepushmessage.ts`
- **Configuration:** `firebase/service.json` (service account key)

### 4. Google Services

#### Google Cloud Tasks

- **Purpose**: Asynchronous task processing
- **Configuration:**
  - Project ID: `GCP_PROJECT_ID`
  - Queue: `GCP_PROJECT_QUEUE`
  - Location: `GCP_PROJECT_LOCATION`
  - Task URL: `GCP_TASK_URL`

#### Google Reviews API

- **Purpose**: Fetch Google Business reviews
- **Endpoint:** `/reviews`
- **Configuration:**
  - API Key: `ENV_GOOGLE_API_KEY`
  - Location ID: `ENV_GOOGLE_LOCATION_ID`

### 5. Email Service (Gmail/Nodemailer)

- **Purpose**: Send emails (notifications, OTPs, etc.)
- **Endpoint:** `/gmail`
- **Configuration:**
  - Service: `GMAIL_SERVICE`
  - Host: `GMAIL_HOST`
  - Port: `GMAIL_PORT`
  - Auth User: `GMAIL_AUTH_USER`
  - Auth Password: `GMAIL_AUTH_PASSWORD`

### 6. Cloudflare (Session Management)

- **Note:** Cloudflare session code exists but appears to be legacy
- **Current:** Redis-based session management is primary

---

## API Endpoints Overview

### Product Management (v2)

| Method | Endpoint                      | Description                 | Auth Required |
| ------ | ----------------------------- | --------------------------- | ------------- |
| GET    | `/v2/product`                 | Get products list           | Yes           |
| GET    | `/v2/product-ecommerce`       | Get products (public)       | No            |
| GET    | `/v2/product/:id`             | Get single product          | Yes           |
| GET    | `/v2/product-ecom/:id`        | Get single product (public) | No            |
| POST   | `/v2/product`                 | Create/Update product       | Yes           |
| DELETE | `/v2/product/:id`             | Delete product              | Yes           |
| POST   | `/v2/product-file/:productid` | Upload product images       | Yes           |
| POST   | `/v3/product-file`            | Upload images (GCP)         | No            |
| POST   | `/v2/product/lockqty`         | Lock product quantity       | Yes           |
| POST   | `/v2/product/bulk`            | Bulk insert products        | Yes           |

### Stock Management (v2)

| Method | Endpoint              | Description         | Auth Required |
| ------ | --------------------- | ------------------- | ------------- |
| GET    | `/v2/stock`           | Get stock list      | Yes           |
| GET    | `/v2/stock/:id`       | Get single stock    | Yes           |
| POST   | `/v2/stock`           | Create/Update stock | Yes           |
| DELETE | `/v2/stock/:id`       | Delete stock        | Yes           |
| GET    | `/v2/stock/Archieve`  | Get archived stocks | Yes           |
| GET    | `/v2/stock/e-waste`   | Get e-waste stocks  | No            |
| POST   | `/v2/stock/isdelete`  | Soft delete stock   | Yes           |
| POST   | `/v2/stock/isarchive` | Archive stock       | Yes           |

### Order Management

| Method | Endpoint                  | Description          | Auth Required |
| ------ | ------------------------- | -------------------- | ------------- |
| GET    | `/orders`                 | Get user orders      | Yes           |
| GET    | `/orders/overall`         | Get all orders       | Yes           |
| GET    | `/v2/orders`              | Get orders (v2)      | Yes           |
| POST   | `/orders`                 | Create order         | Yes           |
| POST   | `/v2/orders`              | Create order (v2)    | Yes           |
| DELETE | `/orders/:id`             | Delete order         | Yes           |
| GET    | `/orderline`              | Get order line items | Yes           |
| POST   | `/orderline`              | Update order line    | Yes           |
| POST   | `/order-rfid`             | Create RFID order    | Yes           |
| POST   | `/v2/orders/transactions` | Get invoice data     | Yes           |

### Payment & Transactions

| Method | Endpoint                         | Description                 | Auth Required |
| ------ | -------------------------------- | --------------------------- | ------------- |
| POST   | `/payment`                       | Initialize PhonePe payment  | Yes           |
| POST   | `/payment/razorpay`              | Initialize Razorpay payment | Yes           |
| POST   | `/payment/razorpay/ticket`       | Razorpay for tickets        | Yes           |
| POST   | `/payment/confirmation-razorpay` | Confirm Razorpay payment    | Yes           |
| POST   | `/payment/status`                | Payment status callback     | No            |
| GET    | `/transaction`                   | Get transactions            | Yes           |
| POST   | `/transaction`                   | Create transaction          | Yes           |

### Purchase Orders & Requests

| Method | Endpoint                      | Description           | Auth Required |
| ------ | ----------------------------- | --------------------- | ------------- |
| GET    | `/purchase-order`             | Get purchase orders   | Yes           |
| GET    | `/purchase-order/:id`         | Get single PO         | Yes           |
| POST   | `/purchase-order`             | Create/Update PO      | Yes           |
| POST   | `/generate/purchase-order`    | Generate PO document  | Yes           |
| POST   | `/purchase-Order/invoice/:id` | Upload PO invoice     | Yes           |
| DELETE | `/purchase-order/:id`         | Delete PO             | Yes           |
| GET    | `/purchase-request`           | Get purchase requests | Yes           |
| POST   | `/purchase-request`           | Create/Update PR      | Yes           |
| POST   | `/generate/purchase-request`  | Generate PR document  | Yes           |

### Invoice Management

| Method | Endpoint                         | Description               | Auth Required |
| ------ | -------------------------------- | ------------------------- | ------------- |
| GET    | `/revo-invoice`                  | Get invoices              | Yes           |
| POST   | `/revo-invoice`                  | Create/Update invoice     | Yes           |
| POST   | `/generate/invoice`              | Generate invoice document | Yes           |
| GET    | `/rental-invoice/:uniqueorderid` | Get rental invoice        | Yes           |
| POST   | `/rental-invoice`                | Update invoice data       | Yes           |

### User Management

| Method | Endpoint                                   | Description           | Auth Required |
| ------ | ------------------------------------------ | --------------------- | ------------- |
| GET    | `/users`                                   | Get users             | Yes           |
| GET    | `/users/:useremail/:userpassword`          | Login user            | No            |
| POST   | `/users`                                   | Create/Update user    | No            |
| POST   | `/users/fcmid`                             | Update FCM token      | No            |
| GET    | `/users/logout`                            | Logout user           | No            |
| POST   | `/user-forgot`                             | Forgot password       | No            |
| DELETE | `/users/:id`                               | Delete user           | No            |
| GET    | `/inventoryusers`                          | Get inventory users   | Yes           |
| POST   | `/inventoryusers`                          | Create inventory user | No            |
| GET    | `/inventoryusers/:useremail/:userpassword` | Login inventory user  | No            |

### Cart & Wishlist

| Method | Endpoint         | Description          | Auth Required |
| ------ | ---------------- | -------------------- | ------------- |
| GET    | `/cart`          | Get cart items       | Yes           |
| POST   | `/cart`          | Add to cart          | Yes           |
| DELETE | `/cart/:id`      | Remove from cart     | Yes           |
| POST   | `/cart/quantity` | Update cart quantity | Yes           |
| GET    | `/wishlist`      | Get wishlist         | Yes           |
| POST   | `/wishlist`      | Add to wishlist      | Yes           |
| DELETE | `/wishlist/:id`  | Remove from wishlist | Yes           |

### Tickets

| Method | Endpoint         | Description         | Auth Required |
| ------ | ---------------- | ------------------- | ------------- |
| GET    | `/tickets`       | Get tickets         | Yes           |
| GET    | `/tickets/queue` | Get queue tickets   | Yes           |
| POST   | `/tickets`       | Create ticket       | Yes           |
| POST   | `/v2/tickets`    | Create ticket (GCP) | No            |

### Dashboard & Analytics

| Method | Endpoint                        | Description      | Auth Required |
| ------ | ------------------------------- | ---------------- | ------------- |
| GET    | `/dashboard/totalsales`         | Total sales data | Yes           |
| GET    | `/dashboard/monthwise-sales`    | Monthly sales    | Yes           |
| GET    | `/dashboard/revenue`            | Revenue data     | Yes           |
| GET    | `/dashboard/ticket-count`       | Ticket counts    | Yes           |
| GET    | `/dashboard/product-count`      | Product counts   | Yes           |
| GET    | `/dashboard/available/quantity` | Available stock  | Yes           |

### Other Endpoints

| Method | Endpoint                | Description                      | Auth Required |
| ------ | ----------------------- | -------------------------------- | ------------- |
| GET    | `/global`               | Global search                    | No            |
| GET    | `/v2/global`            | Global product search            | No            |
| GET    | `/v3/global`            | Global stock/order/ticket search | Yes           |
| GET    | `/picklist/:objectName` | Get picklist values              | No            |
| GET    | `/count/:objectName`    | Get record count                 | Yes           |
| GET    | `/s3/:Pid/:size`        | Get S3 image URLs                | Yes           |
| GET    | `/session`              | Get session data                 | No            |
| POST   | `/calculate-shipping`   | Calculate shipping cost          | Yes           |
| GET    | `/banner`               | Get banners                      | No            |
| GET    | `/blogs`                | Get blogs                        | No            |
| GET    | `/reviews`              | Get Google reviews               | No            |

---

## Authentication & Session Management

### Session Flow

1. **User Login:**

   - Endpoint: `GET /users/:useremail/:userpassword` or `GET /inventoryusers/:useremail/:userpassword`
   - Service validates credentials
   - Creates session in Redis
   - Returns session ID

2. **Session Storage:**

   - **Key**: Session ID (returned to client)
   - **Value**: JSON stringified user data + created timestamp
   - **Expiry**: `REDIS_SESSIONEXSEC` seconds (default: configured in env)
   - **Storage**: Redis

3. **Session Validation:**

   - **Middleware**: `getSession` (from `session.service.ts`)
   - **Header**: `Authorization: {sessionId}`
   - **Process:**
     - Extracts session ID from `Authorization` header
     - Retrieves session from Redis
     - Refreshes expiry on access
     - Attaches session data to request

4. **Session Usage:**
   - Most protected routes use `{ preHandler: [getSession] }`
   - Session data available in controllers via `req.session` (after middleware)

### Session Data Structure

```typescript
{
  userId: number,
  email: string,
  role: string,
  // ... other user fields
  createddate: number  // Unix timestamp
}
```

### Logout

- **Endpoint**: `GET /users/logout` or `GET /inventoryusers/logout`
- **Process**: Deletes session from Redis

---

## Document Generation

### Overview

The system generates documents (DOCX and PDF) for:

- Purchase Orders (PO)
- Purchase Requests (PR)
- Invoices (Product and Service)
- Tickets

### Technology Stack

- **Template Engine**: `docxtemplater`
- **File Format**: DOCX templates with placeholders
- **PDF Conversion**: LibreOffice (via Docker)
- **Storage**: Local `/uploads` directory

### Document Generation Flow

1. **Template Selection:**

   - PO: `po/Revo-PO new 1.docx`
   - PR: `pr/Revo-PR.docx`
   - Invoice (Product): `invoice/revoinvoiceproduct.docx`
   - Invoice (Service): `invoice/revoinvoiceservice.docx`
   - Tickets: Template based on ticket type

2. **Data Processing:**

   - Service fetches data from database
   - Data formatted for template placeholders
   - Passed to `GenerateDocx` utility

3. **Document Creation:**

   - `GenerateDocx` reads template file
   - Renders template with data using `docxtemplater`
   - Generates DOCX file
   - Converts DOCX to PDF using LibreOffice
   - Saves both files to `/uploads`

4. **File Naming:**

   - Format: `{documentNumber}.docx` and `{documentNumber}.pdf`
   - Examples: `REVO-PO-00001.docx`, `REVO-Invoice-00005.pdf`

5. **Database Update:**
   - Document URL stored in database
   - URL format: `/uploads/{filename}.pdf`

### Key Files

- **Utility**: `src/utils/DocXGenerator/GenerateDocx.ts`
- **PO Service**: `src/services/poGenerate.service.ts`
- **PR Service**: `src/services/prGenerate.service.ts`
- **Invoice Service**: `src/services/revoinvoice.service.ts`

### GCP-Optimized Endpoints

Some endpoints (v2/v3) upload files directly to GCP Storage instead of local storage:

- `/v2/poinvoice`: GCP upload
- `/v2/tickets`: GCP upload
- `/v2/rating`: GCP upload
- `/v2/quote/file`: GCP upload
- `/v3/product-file`: GCP upload

---

## Payment Processing - Detailed Step-by-Step Flows

### Razorpay Integration - Complete Flow

#### Phase 1: Payment Initialization (`POST /payment/razorpay`)

**Detailed Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `transactionController.paymentInitializationRazorpay`
   - **Service:** `transactionService.paymentInitializationRazorpay`
   - **Request Body:**
     ```json
     {
       "transaction": {
         "merchanttransactionId": "TXN123",
         "name": "John Doe",
         "amount": 5000,
         "mobilenumber": "9876543210",
         "userid": 1,
         "productid": [1, 2],
         "transactionfor": "order"
       },
       "order": [
         {
           "productid": 1,
           "quantity": 2,
           "productamount": 2500,
           "cartId": 10,
           "userid": 1,
           "addressid": 5,
           "paymentmethod": "Online"
         }
       ]
     }
     ```

2. **Inventory Check & Lock:**

   - Store original order data in `dummyorderdata` (for rollback if needed)
   - Store order data in `productupdateorderqty` (for later quantity update)
   - **Lock Product Quantities:**
     - Call `productrevoService.bulkupsertProducttosetZero(orderdata, false)`
     - This sets `lock_qty` in `product_revo` table to reserve inventory
   - **Validate Availability:**
     ```sql
     SELECT id, overallavailableqty, orderedquantity, lock_qty
     FROM product_revo
     WHERE id IN (1, 2)
     ```
   - **Check:** `(overallavailableqty - lock_qty) >= 0` AND `(overallavailableqty - orderedquantity) >= 0`
   - **If validation fails:** Return 400 error and reset inventory

3. **Create Razorpay Order:**

   - Initialize Razorpay client:
     ```javascript
     const razorpay = new Razorpay({
       key_id: ENV_RAZORPAY_KEY_ID,
       key_secret: ENV_RAZORPAY_KEY_SECRET,
     });
     ```
   - Create order via Razorpay API:
     ```javascript
     const order = await razorpay.orders.create({
       amount: 5000 * 100, // Convert to paise (500000)
       currency: "INR",
       receipt: "TXN123",
       notes: {
         name: "John Doe",
         mobilenumber: "9876543210",
         userid: 1,
         transactionfor: "order",
       },
     });
     ```
   - **Response:** `{ id: "order_xyz", amount: 500000, currency: "INR", ... }`

4. **Prepare Order Data:**

   - Add `merchanttransactionid` to each order item
   - Collect `cartId` values into `cartIddata` array for later deletion
   - Store complete transaction dataset in `transactionDataset` variable

5. **Create Google Cloud Task:**

   - Call `createHttpTask(merchanttransactionId)`
   - Creates async task for order processing timeout handling
   - **If task creation fails:** Reset inventory and return 400 error

6. **Insert Order into Database:**

   - Call `ordersService.bulkInsertOrder(transactionData, orderData)`
   - **Inside `bulkInsertOrder` Service:**

     a. **Address Validation:**

     - If `addressid` is null → Query default address:
       ```sql
       SELECT id FROM address WHERE userid = $1 LIMIT 1
       ```
     - Set `addressid` for all order items

     b. **Extract Product & Cart IDs:**

     - Extract all `productid` values
     - Extract all `cartId` values
     - Remove `cartId` from order data

     c. **Check Available Quantities:**

     ```sql
     SELECT id AS productid, availablequantity
     FROM product_revo
     WHERE id = ANY($1)
     ```

     - Create map: `{ productid: availablequantity }`

     d. **Split Orders:**

     - **If `quantity <= availablequantity`:** Add to `ordersToInsert` (regular orders)
     - **If `quantity > availablequantity`:** Split:
       - Available quantity → `ordersToInsert`
       - Remaining quantity → `thirdPartyOrdersToInsert`

     e. **Insert into `orders` Table:**

     ```sql
     INSERT INTO orders (
       orderamount, userid, addressid, merchanttransactionid,
       quantity, productid, ordername, paymentmethod,
       totalrentalamount, sgst, cgst, storelocation
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING *
     ```

     - **Returns:** `{ id: 100, orderid: "TEQIT-000001", orderstatus: "order_processing", ... }`

     f. **Insert into `orderline` Table:**

     - Call `bulkInsertOrderlines(ordersToInsert)`
     - For each order item:
       ```sql
       INSERT INTO orderline (
         orderid, uniqueorderid, orderstatus, ordertype,
         productid, quantity, productamount, orderamount,
         userid, addressid, merchanttransactionid, ...
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, ...)
       RETURNING *
       ```
     - **Sets:** `ordertype = 'Orders'`, `orderstatus = 'order_processing'`

     g. **If Third-Party Orders Exist:**

     - Insert into `thirdpartyorders` table
     - Insert corresponding orderlines with `ordertype = 'Third Party Orders'`

   - Store inserted order data in `insersertdordderdatawithprocessing` variable

7. **Return Response to Client:**
   ```json
   {
     "status": 200,
     "data": {
       "orderId": "order_xyz",
       "amount": 500000,
       "currency": "INR",
       "key": "rzp_test_xxxxx",
       "redirectUrl": "https://checkout.razorpay.com/v1/checkout.js?key=..."
     }
   }
   ```

**Error Handling:**

- If any step fails → Call `productrevoService.bulkupsertProducttosetZero(dummyorderdata, true)` to reset inventory
- Return appropriate error status (400/500)

---

#### Phase 2: Payment Confirmation (`POST /payment/confirmation-razorpay`)

**Detailed Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `transactionController.paymentConfirmationRazorpay`
   - **Service:** `transactionService.paymentConfirmationRazorpay`
   - **Request Body:**
     ```json
     {
       "razorpay_payment_id": "pay_xyz123",
       "razorpay_order_id": "order_xyz",
       "razorpay_signature": "abc123...",
       "transactionData": { ... }
     }
     ```

2. **Validate Payment Signature:**

   - Extract `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`
   - **Generate signature:**
     ```javascript
     const generatedSignature = crypto
       .createHmac("sha256", RAZORPAY_KEY_SECRET)
       .update(`${razorpay_order_id}|${razorpay_payment_id}`)
       .digest("hex");
     ```
   - **Compare signatures:**
     - If `generatedSignature !== razorpay_signature` → Reset inventory and return 400 error
   - Store signature in `transactionDataset.transaction.razorpay_signature`

3. **Fetch Payment Details from Razorpay:**

   - Call `razorpay.payments.fetch(razorpay_payment_id)`
   - **Response:** `{ id: "pay_xyz123", status: "captured", amount: 500000, ... }`
   - **Verify:** `payment.status === "captured"`
   - If not captured → Reset inventory and return 400 error

4. **Verify Order Exists:**

   - Get `merchanttransactionid` from `transactionDataset`
   - **Check in `orders` table:**
     ```sql
     SELECT merchanttransactionid
     FROM orders
     WHERE merchanttransactionid = $1
     ```
   - **If not found, check `thirdpartyorders` table:**
     ```sql
     SELECT merchanttransactionid
     FROM thirdpartyorders
     WHERE merchanttransactionid = $1
     ```
   - If still not found → Reset inventory and return 400 error

5. **Create Shiprocket Order (Optional - for shipping):**

   - Authenticate with Shiprocket API
   - Fetch user data: `SELECT firstname, lastname, useremail, usermobilenumber FROM users WHERE id = $1`
   - Fetch address data: `SELECT address, city, state, pincode FROM address WHERE id = $1`
   - Create Shiprocket order via API
   - Update `orders`/`thirdpartyorders` with Shiprocket IDs:
     ```sql
     UPDATE orders
     SET shiprocket_order_id = $1,
         shiprocket_shipment_id = $2,
         shiprocket_status_code = $3,
         shiprocket_status = $4,
         shiprocket_channel_order_id = $5
     WHERE merchanttransactionid = $6
     ```
   - Assign courier and generate AWB

6. **Insert Transaction Record:**

   - Call `insertTransactionData(transactionDataset, insersertdordderdatawithprocessing)`
   - **Inside `insertTransactionData` Service:**
     ```sql
     INSERT INTO transaction (
       merchanttransactionid, name, amount, mobilenumber,
       productid, transactionfor, userid, transactiondata,
       razorpay_payment_id, razorpay_order_id, razorpay_signature
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING *
     ```
     - **transactiondata:** Full Razorpay payment object (JSON)
     - **Returns:** Inserted transaction record with `transactionid`

7. **Update Orders Table:**

   - Call `ordersService.updateOrder(orderdata, paymentfailed)`
   - **Inside `updateOrder` Service:**

     ```sql
     UPDATE orders
     SET transactionid = $1,
         orderstatus = 'ordered',
         ispaymentsucceed = TRUE
     WHERE id = $2
     RETURNING *
     ```

     - Updates all orders with matching IDs

   - **Update Orderline Table:**
     - Call `ordersService.updateOrderStatus(orderlinedata, emailid, paymentfailed)`
     ```sql
     UPDATE orderline
     SET orderstatus = 'ordered'
     WHERE orderid = $1
     RETURNING *
     ```
     - Sends order confirmation email to user

8. **Update Product Quantities:**

   - If `productupdateorderqty` has items:
     - Call `productrevoService.updateOrderedQuantityarray(updateproductorderquantiydata)`
     - **Updates `product_revo` table:**
       ```sql
       UPDATE product_revo
       SET orderedquantity = orderedquantity + $1
       WHERE id = $2
       ```

9. **Delete Cart Items:**

   - If `cartIddata` exists:
     - Call `cartservice.deleteCart(cartIddata)`
     - **Removes items from cart:**
       ```sql
       DELETE FROM cart WHERE id = ANY($1)
       ```

10. **Return Success Response:**
    ```json
    {
      "status": 200,
      "message": "Payment verified and processed successfully",
      "data": {
        "redirectUrl": "https://success-url.com"
      }
    }
    ```

**Error Handling:**

- If payment verification fails → Reset inventory using `dummyorderdata`
- If order update fails → Transaction still inserted, but order status may remain "order_processing"
- If any step fails → Return appropriate error and reset inventory

---

### PhonePe Integration - Complete Flow

#### Phase 1: Payment Initialization (`POST /payment`)

**Step-by-Step Process:**

1. **Request Received:** Same structure as Razorpay

2. **Inventory Check & Lock:** Same as Razorpay (Step 2)

3. **Create PhonePe Payment Request:**

   - Build payment payload:
     ```javascript
     {
       merchantId: "PGTESTPAYUAT86",
       merchantTransactionId: "TXN123",
       name: "John Doe",
       amount: 5000 * 100,  // Convert to paise
       redirectUrl: "https://your-domain.com/payment/status?id=TXN123&token=sessionId",
       redirectMode: "POST",
       mobileNumber: "9876543210",
       paymentInstrument: { type: "PAY_PAGE" }
     }
     ```
   - **Generate checksum:**
     ```javascript
     const payload = Buffer.from(JSON.stringify(data)).toString("base64");
     const string = payload + "/pg/v1/pay" + SALT_KEY;
     const checksum =
       crypto.createHash("sha256").update(string).digest("hex") + "###1";
     ```

4. **Call PhonePe API:**

   - POST to `https://api-preprod.phonepe.com/apis/pg-sandbox/pg/v1/pay`
   - Headers: `X-VERIFY: checksum`
   - **Response:** `{ data: { instrumentResponse: { redirectInfo: { url: "..." } } } }`

5. **Create Google Cloud Task:** Same as Razorpay

6. **Insert Order into Database:** Same as Razorpay (Step 6)

7. **Return Payment URL to Client:**
   - Return `response.data.data.instrumentResponse.redirectInfo.url`
   - Client redirects to PhonePe payment page

---

#### Phase 2: Payment Confirmation (`POST /payment/status`)

**Step-by-Step Process:**

1. **Request Received:**

   - Query Params: `id` (merchanttransactionId), `token` (session token)

2. **Verify Order Exists:**

   - Check if `merchanttransactionid` exists in `orders` table
   - If not found → Return "Payment timed out" message

3. **Check PhonePe Payment Status:**

   - Generate checksum:
     ```javascript
     const string =
       `/pg/v1/status/${merchantId}/${merchantTransactionId}` + SALT_KEY;
     const checksum =
       crypto.createHash("sha256").update(string).digest("hex") + "###1";
     ```
   - GET from PhonePe API:
     ```
     GET /pg/v1/status/{merchantId}/{merchantTransactionId}
     Headers: X-VERIFY: checksum, X-MERCHANT-ID: merchantId
     ```
   - **Response:** `{ code: "PAYMENT_SUCCESS", success: true, ... }`

4. **If Payment Successful:**

   - Call `insertTransactionData()` → Insert transaction record
   - Call `updateOrder()` → Update orders table with `orderstatus = 'ordered'`
   - Call `updateOrderStatus()` → Update orderline table
   - Update product quantities
   - Delete cart items
   - Send push notification
   - Redirect to `REDIRECT_URL_SUCCESS`

5. **If Payment Failed:**
   - Reset inventory quantities
   - Insert transaction with failure status
   - Update orders with `orderstatus = 'payment_failed'`
   - Send failure notification
   - Redirect to failure URL

---

### Cash Payment Flow

**For Cash Payments (`paymentmethod === "Cash"`):**

**Complete Flow (No Confirmation Needed):**

1. **Payment Initialization:**
   - Same inventory check and lock process
   - **Insert order immediately:**
     - Insert into `orders` table
     - Insert into `orderline` table
   - **Insert transaction:**
     ```sql
     INSERT INTO transaction (
       merchanttransactionid, name, amount, mobilenumber,
       productid, transactionfor, userid, transactiondata
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ```
     - `transactiondata`: `{ Amount: 5000, status: "Cash Paid" }`
   - **Update order status:**
     ```sql
     UPDATE orders
     SET orderstatus = 'ordered',
         merchanttransactionid = $1,
         transactionid = $2,
         ispaymentsucceed = true
     WHERE id = $3
     ```
   - **Update orderline status:**
     ```sql
     UPDATE orderline
     SET orderstatus = 'ordered',
         merchanttransactionid = $1
     WHERE uniqueorderid = $2
     ```
   - Update product quantities
   - Return success immediately (no confirmation endpoint needed)

---

### Transaction Management

**Transaction Table Structure:**

- `transactionid`: Auto-generated primary key
- `merchanttransactionid`: Unique transaction identifier
- `amount`: Payment amount
- `transactiondata`: Full payment gateway response (JSON)
- `razorpay_payment_id`, `razorpay_order_id`, `razorpay_signature`: Razorpay specific fields
- `userid`: User who made payment
- `productid`: Array of product IDs purchased
- `transactionfor`: Purpose of transaction (e.g., "order", "ticket")
- `name`: Customer name
- `mobilenumber`: Customer mobile number

**Endpoints:**

- `GET /transaction`: Retrieve transaction history with filtering
- `POST /transaction`: Manually insert transaction record

**Key Points:**

- All successful payments create transaction records
- Failed payments also create transaction records (with failure status)
- Transaction records are linked to orders via `merchanttransactionid`
- Orders are linked to transactions via `transactionid` field

---

## Order Creation Flow - Detailed Steps

### Direct Order Creation (`POST /orders`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `ordersController.upsertOrder`
   - **Service:** `ordersService.upsertOrder`
   - **Request Body:** Single order object

2. **Insert/Update Order:**

   - **If `id` exists:** Update existing order
     ```sql
     UPDATE orders
     SET orderamount = $1, userid = $2, addressid = $3, ...
     WHERE id = $4
     RETURNING *
     ```
   - **If `id` doesn't exist:** Insert new order
     ```sql
     INSERT INTO orders (orderamount, userid, addressid, ...)
     VALUES ($1, $2, $3, ...)
     RETURNING *
     ```

3. **Handle Order Cancellation:**

   - If `orderstatus === 'cancelled'`:
     - Get `productid` and `quantity` from order
     - Call `productrevoService.updateCancelledOrderedQuantity([productid], quantity)`
       - This decreases `orderedquantity` in `product_revo` table
     - Fetch user email
     - Send cancellation email to user

4. **Return Response:**
   - Success: `{ message: "Order Placed Successfully" }` or `{ message: "Data Updated successfully in orders" }`

---

### Bulk Order Creation (`POST /v2/orders`)

**Note:** This endpoint is currently commented out in the controller. The actual bulk order creation happens during payment initialization.

---

## Document Generation Flow - Detailed Steps

### Purchase Order (PO) Generation (`POST /generate/purchase-order`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `generatePurchaseOrderController.purchaseOrderData`
   - **Service:** `generatePurchaseOrderService.generatepurchaseOrderData`
   - **Request Body:** PO data with line items

2. **Select Template:**

   - Template path: `po/Revo-PO new 1.docx`
   - This is a Word document template with placeholders

3. **Generate Document:**

   - Call `GenerateDocx(request, podata, template)`
   - **Inside `GenerateDocx` utility:**

     a. **Read Template:**

     ```javascript
     const content = fs.readFileSync(
       path.resolve("po/Revo-PO new 1.docx"),
       "binary"
     );
     ```

     b. **Create Document:**

     ```javascript
     const zip = new PizZip(content);
     const doc = new Docxtemplater(zip, {
       paragraphLoop: true,
       linebreaks: true,
       nullGetter() {
         return "-";
       },
     });
     ```

     c. **Render Template:**

     ```javascript
     await doc.render(podata);
     ```

     - Replaces placeholders like `{ponumber}`, `{suppliername}`, etc. with actual data

     d. **Generate DOCX:**

     ```javascript
     const buf = doc.getZip().generate({
       type: "nodebuffer",
       compression: "DEFLATE",
     });
     ```

     e. **Save DOCX File:**

     ```javascript
     const docxFilePath = path.resolve(`uploads/${podata.ponumber}.docx`);
     fs.writeFileSync(docxFilePath, buf);
     ```

     f. **Convert to PDF:**

     ```javascript
     const pdfFilePath = path.resolve(`uploads/${podata.ponumber}.pdf`);
     await convertToPdf(docxFilePath, pdfFilePath, podata.id);
     ```

     - Uses LibreOffice command: `libreoffice --headless --convert-to pdf --outdir ...`

     g. **Return File URLs:**

     ```javascript
     return {
       id: podata.id,
       fileurl: `/uploads/${podata.ponumber}.pdf`,
     };
     ```

4. **Update Purchase Order in Database:**

   - Call `purchaseOrderService.upsertPurchaseOrder(result)`
   - Updates `purchaseorder` table with file URL

5. **Return Response:**
   - Success: Returns file URL to client
   - Failure: Returns error message

---

### Purchase Request (PR) Generation (`POST /generate/purchase-request`)

**Flow:** Similar to PO generation

- Template: `pr/Revo-PR.docx`
- Same document generation process
- Updates `purchaserequest` table

---

### Invoice Generation (`POST /generate/invoice`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `revoinvoicecontroller.getRevoInvoiceDataById`
   - **Service:** `revoinvoiceservice.generaterevoinvoice`

2. **Determine Invoice Type:**

   - Check `invoicefor` field: `'product'` or `'service'`
   - **Select Template:**
     - Product: `invoice/revoinvoiceproduct.docx`
     - Service: `invoice/revoinvoiceservice.docx`

3. **Generate Document:**

   - Same process as PO generation
   - Uses `GenerateDocx` utility
   - Creates both DOCX and PDF files

4. **Update Invoice in Database:**

   - Call `revoinvoiceservice.upsertRevoInvoice(data)`
   - Updates `revoinvoice` table with invoice URL

5. **Return Response:**
   - Success: Returns invoice URL
   - Failure: Returns error message

---

## Product Upload Flow - Detailed Steps

### Product Image Upload (`POST /v2/product-file/:productid`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `productrevoController.upsertProductwithfileRevo`
   - **Middleware:** `filesUpload` (Multer)
   - **Files:** Multiple image files uploaded via form-data

2. **File Processing:**

   - Files stored in `/uploads` directory
   - Filename format: `{timestamp}-{originalname}`
   - Example: `2024-12-06T10-11-03.358Z-product-image.jpg`

3. **Image Resizing:**

   - For each uploaded file:
     - Resize to Small, Medium, Large, Thumbnail sizes
     - Uses `jimp` library for image processing
     - Save resized images

4. **Upload to AWS S3:**

   - Upload original and resized images to S3
   - **S3 Path Structure:**
     ```
     product/{productId}/Small/small_{filename}
     product/{productId}/Medium/medium_{filename}
     product/{productId}/Large/large_{filename}
     product/{productId}/Thumbnail/thumbnail_{filename}
     ```

5. **Update Product in Database:**

   - Update `product_revo` table with S3 URLs
   - Store image paths in `small`, `medium`, `large` columns

6. **Return Response:**
   - Success: Returns updated product data with image URLs

---

### GCP Product Upload (`POST /v3/product-file`)

**Flow:** Similar to above, but uploads directly to GCP Storage instead of local storage and S3.

---

## Stock Management Flow - Detailed Steps

### Stock Creation/Update (`POST /v2/stock`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `stockRevoController.upsertStockRevoData`
   - **Service:** `stockRevoService.upsertStockRevoData`
   - **Schema Validation:** `stockrevoSchema`

2. **Validate Request:**

   - Check required fields: `productid`, `quantity`, `location`, etc.
   - Validate data types and constraints

3. **Insert/Update Stock:**

   - **If `id` exists:** Update existing stock
   - **If `id` doesn't exist:** Insert new stock
     ```sql
     INSERT INTO stock_revo (
       productid, quantity, location, stockstatus, ...
     ) VALUES ($1, $2, $3, ...)
     RETURNING *
     ```

4. **Update Product Quantity:**

   - If stock is "Available":
     - Update `product_revo.availablequantity`
     - Update `product_revo.overallavailableqty`

5. **Return Response:**
   - Success: Returns stock record
   - Failure: Returns validation/error message

---

### Stock RFID Assignment (`POST /order-rfid/line`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `ordersController.upsertOrderlinerfid`
   - **Service:** `ordersService.upsertOrderlinerfid`
   - **Request Body:** Array of `{ rfid, orderlinenumber, productid }`

2. **Validate RFIDs:**

   - Check for duplicate RFIDs in request
   - **Validate RFID exists and is available:**
     ```sql
     SELECT rfid, puc
     FROM stock_revo
     WHERE rfid = ANY($1)
     AND puc IN (SELECT puc FROM product_revo WHERE id = ANY($2))
     AND stockstatus = 'Available'
     ```
   - If validation fails → Return error

3. **Update Stock:**

   - Call `stockRevoService.upsertStockRevoDatarfid(orderData)`
   - Updates `stock_revo` table:
     - Sets `orderlinenumber`
     - Updates `stockstatus` to "Sold" or "Reserved"

4. **Update Product Quantity:**

   - Get unique `puc` values from updated stocks
   - Call `stockRevoService.updateQuantity(pucArray, rowCount, true)`
   - Decreases `availablequantity` in `product_revo`

5. **Update Orderline:**

   - Update `orderline` table:
     ```sql
     UPDATE orderline
     SET orderstatus = 'ready_to_dispatch',
         deliveryfrom = $1
     WHERE orderlinenumber = $2
     RETURNING *
     ```

6. **Return Response:**
   - Success: Returns updated orderline records

---

## Cart Management Flow - Detailed Steps

### Add to Cart (`POST /cart`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `cartController.upsertCart`
   - **Service:** `cartservice.upsertCart`
   - **Schema Validation:** `cartInsertSchema`

2. **Validate Request:**

   - Check required fields: `userid`, `productid`, `quantity`
   - Validate product exists and is available

3. **Check Existing Cart Item:**

   - Query if item already exists in cart:
     ```sql
     SELECT * FROM cart
     WHERE userid = $1 AND productid = $2
     ```

4. **Insert/Update Cart:**

   - **If exists:** Update quantity
   - **If not exists:** Insert new cart item
     ```sql
     INSERT INTO cart (userid, productid, quantity, ...)
     VALUES ($1, $2, $3, ...)
     RETURNING *
     ```

5. **Return Response:**
   - Success: Returns cart item

---

### Get Cart (`GET /cart`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `cartController.getCartData`
   - **Service:** `cartservice.getCartData`
   - **Session:** Validated via `getSession` middleware

2. **Fetch Cart Items:**

   - Get user ID from session
   - Query cart with product details:
     ```sql
     SELECT c.*, p.productname, p.price, p.small, p.medium, p.large
     FROM cart c
     JOIN product_revo p ON c.productid = p.id
     WHERE c.userid = $1
     ```

3. **Return Response:**
   - Returns array of cart items with product details

---

## Ticket Management Flow - Detailed Steps

### Create Ticket (`POST /tickets`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `ticketController.upsertTickets`
   - **Service:** `ticketService.upsertTickets`
   - **Files:** Optional file attachments via Multer

2. **Process File Attachments:**

   - If files uploaded:
     - Store in `/uploads` directory
     - Generate file URLs

3. **Insert Ticket:**

   ```sql
   INSERT INTO tickets (
     userid, tickettype, priority, subject, description,
     attachmenturls, ticketstatus, ...
   ) VALUES ($1, $2, $3, $4, $5, $6, $7, ...)
   RETURNING *
   ```

4. **Generate Ticket Document (Optional):**

   - If ticket type requires document:
     - Generate DOCX/PDF using template
     - Store in `/uploads`

5. **Send Notifications:**

   - Send email to support team
   - Send push notification to assigned user

6. **Return Response:**
   - Success: Returns ticket record with ticket number

---

## Deployment

### Docker Configuration

**Dockerfile:**

- Base Image: `node:20`
- Installs LibreOffice for PDF conversion
- Exposes port 5600
- Builds TypeScript to JavaScript
- Runs `node build/index.js`

### Google Cloud Platform (GCP)

**Deployment Environments:**

- **Production**: `revo-prod-445604`
- **UAT/SIT**: `revo-dev-and-test`

**Cloud Build Files:**

- `cloudbuildprod.yaml`: Production deployment
- `cloudbuilduat.yaml`: UAT deployment

**Deployment Process:**

1. Build Docker image
2. Tag image with GCR path
3. Push to Google Container Registry
4. Deploy to Cloud Run

**Cloud Run Configuration:**

- Platform: Managed
- Region: `us-central1`
- Port: 5600
- Service Account: Configured per environment
- Environment Variables: Set via Cloud Build substitutions

### Local Development

**Commands:**

```bash
npm run dev          # Run with tsx (development)
npm run build        # Compile TypeScript
npm run test         # Run tests (if configured)
```

**Environment Setup:**

1. Install dependencies: `npm install`
2. Create `.env` file with required variables
3. Ensure PostgreSQL and Redis are running
4. Run: `npm run dev`

### Build Scripts

```json
{
  "dev": "npx tsx src/index",
  "build": "tsc",
  "authgcp": "gcloud auth login",
  "set-project": "gcloud config set project revo-dev-and-test",
  "revo-backend-build": "docker build -t revo365-sit-backend .",
  "revo-backend-tag": "docker tag revo365-sit-backend gcr.io/revo-dev-and-test/revo365-sit-backend",
  "revo-backend-push": "docker push gcr.io/revo-dev-and-test/revo365-sit-backend",
  "revo-backend-deploy": "gcloud run deploy ...",
  "full-deploy": "npm run set-project && npm run revo-backend-build && ..."
}
```

---

## Environment Variables

### Required Environment Variables

#### Database

```env
POSTGRES_USER=your_postgres_user
POSTGRES_PASSWORD=your_postgres_password
POSTGRES_HOST=your_postgres_host
POSTGRES_PORT=5432
POSTGRES__DATABASE=your_database_name
POSTGRESS_QUERY_API=your_query_api_url  # Optional, for App Engine
```

#### Redis

```env
REDIS_HOST=your_redis_host
REDIS_PORT=your_redis_port
REDIS_PASSWORD=your_redis_password
REDIS_SESSIONEXSEC=86400  # Session expiry in seconds (24 hours)
REDIS_EMAIL_OTPEXPSEC=300  # OTP expiry in seconds (5 minutes)
```

#### AWS S3

```env
ACCESSKEYID=your_aws_access_key
SECRETACCESSKEY=your_aws_secret_key
REGION=your_aws_region
```

#### Payment Gateways

```env
ENV_RAZORPAY_KEY_ID=your_razorpay_key_id
ENV_RAZORPAY_KEY_SECRET=your_razorpay_secret
```

#### Email (Gmail)

```env
GMAIL_SERVICE=gmail
GMAIL_HOST=smtp.gmail.com
GMAIL_PORT=587
GMAIL_AUTH_USER=your_email@gmail.com
GMAIL_AUTH_PASSWORD=your_app_password
```

#### Google Cloud

```env
GCP_PROJECT_ID=your_gcp_project_id
GCP_PROJECT_QUEUE=your_task_queue_name
GCP_PROJECT_LOCATION=us-central1
GCP_TASK_URL=your_cloud_run_url
ENV_GOOGLE_API_KEY=your_google_api_key
ENV_GOOGLE_LOCATION_ID=your_location_id
```

#### Shiprocket

```env
SHIPROCKET_EMAIL=your_shiprocket_email
SHIPROCKET_PASSWORD=your_shiprocket_password
SHIPROCKET_BASE_URL=https://apiv2.shiprocket.in
```

#### Application

```env
PORT=5600
PROTOCOL=http  # or https
REDIRECT_URL_PAYMENT_STATUS=your_payment_callback_url
REDIRECT_URL_SUCCESS=your_success_url
REDIRECT_URL_FAILURE=your_failure_url
REDIRECT_INVENTORY_URL=your_inventory_redirect_url
```

### Environment-Specific Notes

- **Local Development**: Use `.env` file (not committed to git)
- **GCP Cloud Run**: Variables set via Cloud Build substitutions
- **Production**: Variables stored in GCP Secret Manager or Cloud Build

---

## Common Issues & Troubleshooting

### 1. Database Connection Issues

**Symptoms:**

- "Error connecting to the database"
- Connection timeout errors

**Solutions:**

- Verify PostgreSQL is running
- Check connection credentials in `.env`
- Verify network connectivity
- Check connection pool limits (max: 500)
- Review `connectionTimeoutMillis` setting

### 2. Redis Connection Issues

**Symptoms:**

- "Redis Client Error"
- Session validation failures
- 401 Unauthorized errors

**Solutions:**

- Verify Redis is running
- Check Redis URL format: `redis://:password@host:port`
- Verify password is correct
- Check network connectivity
- Review Redis connection string in `.env`

### 3. File Upload Issues

**Symptoms:**

- "File too large" errors
- Upload failures

**Solutions:**

- Check file size limit: 150MB (configured in `Multer.ts`)
- Verify `/uploads` directory exists and is writable
- Check disk space
- For GCP: Verify Cloud Storage permissions

### 4. Document Generation Failures

**Symptoms:**

- PDF generation errors
- Missing template files

**Solutions:**

- Verify template files exist in correct paths:
  - `po/Revo-PO new 1.docx`
  - `pr/Revo-PR.docx`
  - `invoice/revoinvoiceproduct.docx`
  - `invoice/revoinvoiceservice.docx`
- Ensure LibreOffice is installed (for Docker: included in Dockerfile)
- Check `/uploads` directory permissions
- Verify template placeholders match data structure

### 5. Payment Gateway Issues

**Symptoms:**

- Payment initialization failures
- Payment confirmation errors

**Solutions:**

- Verify Razorpay/PhonePe credentials
- Check callback URLs are accessible
- Verify webhook endpoints
- Review payment signature validation logic
- Check transaction table for error logs

### 6. S3 Image Access Issues

**Symptoms:**

- 403 Forbidden errors
- Missing images

**Solutions:**

- Verify AWS credentials
- Check S3 bucket permissions
- Verify presigned URL expiry (1 hour)
- Check image path structure: `product/{id}/{size}/`

### 7. Session Expiry Issues

**Symptoms:**

- Unexpected logouts
- Session not found errors

**Solutions:**

- Check `REDIS_SESSIONEXSEC` value
- Verify Redis TTL settings
- Review session refresh logic in `getSession` middleware
- Check for Redis memory issues

### 8. TypeScript Compilation Errors

**Symptoms:**

- Build failures
- Type errors

**Solutions:**

- Run `npm install` to ensure dependencies are installed
- Check `tsconfig.json` configuration
- Verify Node.js version (requires Node 20)
- Clear `build/` directory and rebuild

### 9. GCP Deployment Issues

**Symptoms:**

- Cloud Run deployment failures
- Environment variable issues

**Solutions:**

- Verify Cloud Build configuration
- Check service account permissions
- Verify all environment variables are set in Cloud Build
- Review Cloud Run logs in GCP Console
- Check Docker image build logs

### 10. API Version Confusion

**Symptoms:**

- Endpoints not working
- Version mismatch errors

**Solutions:**

- **v1 APIs**: Mostly deprecated (commented out)
- **v2 APIs**: Current production endpoints (use these)
- **v3 APIs**: GCP-optimized endpoints (for specific use cases)
- Check route definitions in `src/routes/routes.ts`
- Verify API version in frontend/client code

### Debugging Tips

1. **Enable Logging:**

   - Fastify logger is enabled by default
   - Check console output for errors
   - Review `server.log` file (if configured)

2. **Database Query Debugging:**

   - Add `console.log` in service files
   - Review PostgreSQL logs
   - Use database query tools (pgAdmin, etc.)

3. **Session Debugging:**

   - Check Redis keys: `redis-cli KEYS *`
   - Verify session data structure
   - Test session retrieval manually

4. **Error Handling:**
   - All errors go through `ErrorHandler.handleQueryError`
   - Check error response structure
   - Review `errorDetails` array for specific issues

---

## Complete Detailed Flows for All Major Processes

### User Management Flows

#### User Registration (`POST /users`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `userController.upsertUser`
   - **Service:** `userService.upsertUser`
   - **Request Body:**
     ```json
     {
       "firstname": "John",
       "lastname": "Doe",
       "useremail": "john@example.com",
       "userpassword": "password123",
       "usermobilenumber": "9876543210",
       "isbusinessuser": false,
       "gstnumber": null
     }
     ```

2. **Check if User Exists:**

   - **If `id` is not provided (New User):**
     - Query both `users` and `inventoryusers` tables:
       ```sql
       SELECT id, 'users' as table_name FROM users WHERE useremail = $1
       UNION ALL
       SELECT id, 'inventoryusers' as table_name FROM inventoryusers WHERE useremail = $1
       ```
     - **If email exists:** Return error: "Email already exists. Please try sign in with new E-Mail"

3. **Hash Password:**

   - Call `hashGenerate(userData.userpassword)`
   - Uses `bcryptjs` to hash password
   - Store hashed password

4. **Insert User:**

   ```sql
   INSERT INTO users (
     firstname, lastname, useremail, userpassword,
     usermobilenumber, isbusinessuser, gstnumber
   ) VALUES ($1, $2, $3, $4, $5, $6, $7)
   RETURNING *
   ```

5. **Return Response:**
   - Success: `{ message: "User signup done successfully", data: [userData] }`
   - Failure: Error message with details

---

#### User Login (`GET /users/:useremail/:userpassword`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `userController.getLoggedInUsersData`
   - **Service:** `userService.getLoggedInUsersData`
   - **URL Params:** `useremail`, `userpassword`

2. **Check in Users Table:**

   ```sql
   SELECT * FROM users WHERE LOWER(useremail) = LOWER($1)
   ```

3. **If User Found:**

   - **Validate Password:**
     - Call `hashValidator(userpassword, storedPassword)`
     - Uses `bcryptjs.compare()` to verify password
   - **If Password Valid:**
     - Generate session ID: `uuidv4()`
     - Create session data:
       ```javascript
       {
         useremail: useremail,
         userpassword: userpassword,
         createddate: timestamp
       }
       ```
     - **Save Session:**
       - Call `saveSession(sessionId, sessionData)`
       - Store in Redis with expiry: `REDIS_SESSIONEXSEC` seconds
     - **Return Response:**
       ```json
       {
         "sessionId": "uuid-here",
         "userdata": [userObject]
       }
       ```
   - **If Password Invalid:** Return "User Credentials are wrong. Please try again"

4. **If User Not Found in Users Table:**
   - **Check in Inventory Users Table:**
     ```sql
     SELECT * FROM inventoryusers WHERE useremail = $1
     ```
   - **If Found:**
     - Validate password
     - Create session with inventory user data
     - **Return Response with Redirect:**
       ```json
       {
         "sessionId": "uuid-here",
         "userdata": [inventoryUserObject],
         "redirect": true,
         "inventoryAppUrl": "https://inventory-app.com?sessionId=uuid"
       }
       ```
   - **If Not Found:** Return "No Users Found With this Email ID. Please Sign up"

---

#### Forgot Password (`POST /user-forgot`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `userController.forgotuser`
   - **Service:** `userService.forgotuser`
   - **Request Body:** `{ useremail: "john@example.com" }` or `{ useremail: "...", otp: "1234" }`

2. **If OTP Not Provided (Step 1 - Generate OTP):**

   - **Generate OTP:**
     ```javascript
     generatedotp = Math.floor(1000 + Math.random() * 9000); // 4-digit OTP
     ```
   - **Save OTP in Redis:**
     - Call `saveOtp(useremail, generatedotp)`
     - Store with expiry: `REDIS_EMAIL_OTPEXPSEC` seconds
   - **Verify User Exists:**
     - Call `getUsersData(request)` to check if email exists
   - **If User Exists:**
     - **Send Email:**
       - Call `sendMail(request, generatedotp)`
       - Email subject: "OTP Verification Code"
       - Email body: "Your otp code to Reset Password For Revo Site is {otp}"
     - **Return Response:**
       ```json
       {
         "status": "success",
         "Message": "OTP sent Successfully"
       }
       ```
   - **If User Not Found:**
     ```json
     {
       "status": "failure",
       "Message": "Entered User Email Is wrong.please Enter correct Email to Reset Password"
     }
     ```

3. **If OTP Provided (Step 2 - Verify OTP):**
   - **Verify User Exists:** Same as above
   - **Verify OTP:**
     - Call `getOtp(useremail, otp)`
     - Retrieves OTP from Redis and compares
   - **If OTP Valid:**
     ```json
     {
       "status": "success",
       "Message": "Entered otp is correct",
       "data": [userData]
     }
     ```
   - **If OTP Invalid/Expired:**
     ```json
     {
       "status": "failure",
       "Message": "Invalid or expired OTP. Please regenerate or enter the correct OTP."
     }
     ```

---

#### User Logout (`GET /users/logout`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `userController.userlogout`
   - **Service:** `userService.userlogout`

2. **Clear Session Cookie:**

   - Clear `sessionId` cookie from response
   - Set cookie options: `httpOnly: true, secure: true, sameSite: 'Strict'`

3. **Note:** Session is not explicitly deleted from Redis (relies on TTL expiry)

4. **Return Response:**
   ```json
   {
     "status": "Session deleted"
   }
   ```

---

### Product Management Flows

#### Product Creation/Update (`POST /v2/product`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `productrevoController.upsertProductrevo`
   - **Service:** `productrevoService.upsertProductrevo`
   - **Session:** Validated via `getSession` middleware
   - **Request Body:** Product data object

2. **Extract Fields:**

   - Separate `id` from other fields
   - Get field names and values

3. **If `id` Exists (Update):**

   ```sql
   UPDATE product_revo
   SET field1 = $1, field2 = $2, ...
   WHERE id = $N
   RETURNING *
   ```

4. **If `id` Doesn't Exist (Insert):**

   ```sql
   INSERT INTO product_revo (field1, field2, ...)
   VALUES ($1, $2, ...)
   RETURNING *
   ```

5. **Return Response:**
   - Success: Returns updated/inserted product data
   - Failure: Error message with details

---

#### Bulk Product Insert (`POST /v2/product/bulk`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `productrevoController.insertBulkProduct`
   - **Service:** `productrevoService.insertBulkProduct`
   - **Request Body:** Array of product objects

2. **Process Each Product:**

   - Loop through product array
   - For each product:
     - Filter out null/undefined fields
     - Build dynamic INSERT query
     - Execute insert

3. **Track Results:**

   - Collect successful inserts
   - Collect errors with index

4. **Return Response:**
   ```json
   {
     "success": true,
     "insertedCount": 10,
     "errors": [{ "index": 5, "error": "Duplicate key violation" }]
   }
   ```

---

#### Product Image Upload (`POST /v2/product-file/:productid`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `productrevoController.upsertProductwithfileRevo`
   - **Middleware:** `filesUpload` (Multer)
   - **Files:** Multiple image files
   - **Params:** `productid`

2. **File Processing:**

   - Files stored in `/uploads` directory
   - Filename: `{timestamp}-{originalname}`

3. **Image Resizing:**

   - For each uploaded file:
     - Resize to Small (e.g., 200x200)
     - Resize to Medium (e.g., 500x500)
     - Resize to Large (e.g., 1000x1000)
     - Resize to Thumbnail (e.g., 100x100)
     - Uses `jimp` library

4. **Upload to AWS S3:**

   - Upload original and all resized versions
   - **S3 Path Structure:**
     ```
     product/{productId}/Small/small_{filename}
     product/{productId}/Medium/medium_{filename}
     product/{productId}/Large/large_{filename}
     product/{productId}/Thumbnail/thumbnail_{filename}
     ```

5. **Update Product in Database:**

   ```sql
   UPDATE product_revo
   SET small = $1, medium = $2, large = $3, thumbnail = $4
   WHERE id = $5
   RETURNING *
   ```

6. **Return Response:**
   - Success: Returns updated product with image URLs

---

### Purchase Order Management Flow

#### Create/Update Purchase Order (`POST /purchase-order`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `purchaseOrderController.upsertPurchaseOrder`
   - **Service:** `purchaseOrderService.upsertPurchaseOrder`
   - **Schema Validation:** `purchaseorderInsertSchema`
   - **Request Body:** Purchase order data

2. **Process Product Field:**

   - If `product` field exists:
     - Convert to JSON string: `JSON.stringify(product)`
     - Store as string in database

3. **Insert/Update Purchase Order:**

   - **If `id` exists:**
     ```sql
     UPDATE purchaseorder
     SET field1 = $1, field2 = $2, product = $3, ...
     WHERE id = $N
     RETURNING *
     ```
   - **If `id` doesn't exist:**
     ```sql
     INSERT INTO purchaseorder (field1, field2, product, ...)
     VALUES ($1, $2, $3, ...)
     RETURNING *
     ```

4. **Get Purchase Order Details:**

   - Extract: `ponumber`, `id`, `prnumber`, `po_status`

5. **Check Related Purchase Request:**

   ```sql
   SELECT demandrequestid, isdemandrequest
   FROM purchaserequest
   WHERE prnumber = $1
   ```

6. **If Related to Demand Request:**

   - Update demand request status if needed
   - Link PO to demand request

7. **Return Response:**
   ```json
   {
     "message": "Data Inserted successfully into Purchaseorder",
     "Data": { purchaseOrderObject }
   }
   ```

---

#### Generate Purchase Order Document (`POST /generate/purchase-order`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `generatePurchaseOrderController.purchaseOrderData`
   - **Service:** `generatePurchaseOrderService.generatepurchaseOrderData`

2. **Fetch PO Data:**

   - Query purchase order with all related data
   - Format data for template

3. **Generate Document:**

   - Template: `po/Revo-PO new 1.docx`
   - Call `GenerateDocx(request, podata, template)`
   - Creates DOCX and PDF files

4. **Update Purchase Order:**

   - Call `purchaseOrderService.upsertPurchaseOrder(result)`
   - Updates PO with file URL

5. **Return Response:**
   - Success: Returns file URL
   - Failure: Error message

---

### Purchase Request Management Flow

#### Create/Update Purchase Request (`POST /purchase-request`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `purcahseRequestController.upsertPurchaseRequestData`
   - **Service:** `purchaseRequestService.upsertPurchaseRequestData`
   - **Schema Validation:** `prInsertSchema`

2. **Insert/Update Purchase Request:**

   - Similar to Purchase Order flow
   - Stores PR data in `purchaserequest` table

3. **Generate PR Number:**

   - Auto-generated PR number format
   - Links to demand request if applicable

4. **Return Response:**
   - Success: Returns PR data
   - Failure: Error message

---

#### Generate Purchase Request Document (`POST /generate/purchase-request`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `generatePRController.generatepr`
   - **Service:** `generatePrdataservice.generatepr`
   - **Schema Validation:** `generatePRSchema`

2. **Fetch PR Data:**

   - Query purchase request with line items
   - Format for template

3. **Generate Document:**

   - Template: `pr/Revo-PR.docx`
   - Call `GenerateDocx(request, prdata, template)`
   - Creates DOCX and PDF

4. **Update Purchase Request:**

   - Updates PR with document URL

5. **Return Response:**
   - Success: Returns document URL

---

### Data Loader Flow (CSV Import)

#### Product Data Loader (`POST /get-dataloader`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `dataLoaderController.getDataLoaderData`
   - **Service:** `dataLoaderService.getDataLoaderData`
   - **Middleware:** `filesUpload` (Multer)
   - **File:** CSV file uploaded

2. **Read CSV File:**

   - File stored in `/uploads` directory
   - Convert CSV to JSON using `csvtojson`:
     ```javascript
     const jsonresult = await csvtojson().fromFile(csvfilepath);
     ```

3. **Process Each Row:**

   - For each row in CSV:
     - **Data Type Conversion:**
       - **Number Fields:** Convert to number (if valid)
       - **Boolean Fields:** Convert "TRUE"/"FALSE" to boolean
       - **String Fields:** Keep as string
       - **Array Fields:** Parse JSON if string
       - **Null Values:** Set to null
     - **Validate Data:**
       - Call `validateDataLoader(productInsertSchema, row)`
       - Uses AJV schema validation
     - **If Validation Fails:**
       - Collect error details with row number
       - Add to `failuredata` array

4. **Return Response:**
   - **If Validation Errors:**
     ```json
     {
       "error": [
         {
           "rowNumber": 5,
           "productname": "required field",
           "price": "must be a number"
         }
       ],
       "data": [allRows]
     }
     ```
   - **If All Valid:**
     - Returns array of validated JSON objects

---

#### Insert Product Data (`POST /dataloader`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `dataLoaderController.insertDataLoaderData`
   - **Service:** `dataLoaderService.insertDataLoaderData`
   - **Request Body:** Array of validated product objects

2. **Bulk Insert Products:**

   - Loop through product array
   - For each product:
     ```sql
     INSERT INTO product_revo (field1, field2, ...)
     VALUES ($1, $2, ...)
     RETURNING *
     ```

3. **Track Results:**

   - Count successful inserts
   - Collect errors

4. **Return Response:**
   - Success: Returns inserted products
   - Failure: Returns error details

---

#### Stock Data Loader (`POST /get-dataloader/stock`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `dataLoaderController.getDataLoaderDataStock`
   - **Service:** `dataLoaderService.getDataLoaderDataStock`
   - **File:** CSV file with stock data

2. **Read CSV File:**

   - Convert CSV to JSON

3. **Get Location Data:**

   - Call `getStockLocationData()`
   - Fetches valid location picklist values

4. **Process Each Row:**

   - **Data Type Conversion:**
     - **Integer Fields:** Convert to number
     - **Boolean Fields:** Convert to boolean
     - **Text Fields:** Keep as string
     - **Array Fields:** Parse JSON
     - **Location Fields:** Convert to lowercase, replace spaces with underscores
   - **Special Handling:**
     - If `rfid` is null/empty → Set `ecompublish = false`
   - **Validate Data:**
     - Call `validateDataLoader(stockrevoSchema, row)`

5. **Return Response:**
   - Same format as product data loader

---

#### Insert Stock Data (`POST /dataloader/stock`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `dataLoaderController.insertBulkDataStock`
   - **Service:** `dataLoaderService.upsertBulkDataStock`
   - **Request Body:** Array of validated stock objects

2. **Bulk Insert Stock:**

   - Call `stockRevoService.upsertBulkStockRevoData(request.body)`
   - Inserts multiple stock records

3. **Update Product Quantities:**

   - After stock insertion, update `product_revo.availablequantity`

4. **Return Response:**
   - Success: Returns inserted stock records

---

### Wishlist Management Flow

#### Add to Wishlist (`POST /wishlist`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `wishListController.upsertToWishlist`
   - **Service:** `wishListService.upsertToWishlist`
   - **Session:** Validated via `getSession`

2. **Insert/Update Wishlist:**

   - **Note:** Wishlist uses `cart` table with `iscart = false` and `iswishlist = true`
   - **If `id` exists:**
     ```sql
     UPDATE cart
     SET productid = $1, userid = $2, iswishlist = true, iscart = false, ...
     WHERE id = $N
     RETURNING *
     ```
   - **If `id` doesn't exist:**
     ```sql
     INSERT INTO cart (productid, userid, iswishlist, iscart, quantity, ...)
     VALUES ($1, $2, true, false, $3, ...)
     RETURNING *
     ```

3. **Return Response:**
   - Success: Returns wishlist item

---

#### Get Wishlist (`GET /wishlist`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `wishListController.getWishlistData`
   - **Service:** `wishListService.getWishlistData`

2. **Fetch Wishlist with Product Details:**

   ```sql
   SELECT
     c.id, c.quantity, c.productid, c.userid, c.createddate,
     c.iscart, c.iswishlist,
     p.id AS products_id, p.productname, p.large, p.medium, p.small,
     p.price, p.colour, p.category, p.brand, p.model, ...
   FROM cart c
   INNER JOIN product_revo p ON p.id = c.productid
   WHERE iscart = false AND iswishlist = true
   AND c.userid = $1
   ORDER BY c.modifieddate DESC
   OFFSET $2 LIMIT $3
   ```

3. **Return Response:**
   - Returns array of wishlist items with product details

---

### Rating/Review Management Flow

#### Create/Update Rating (`POST /rating`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `ratingController.upsertRating`
   - **Service:** `ratingService.upsertRating`
   - **Middleware:** `filesUpload` (for rating images)
   - **Request Body:** Rating data

2. **Process Image Files:**

   - If files uploaded:
     - Store in `/uploads` directory
     - Generate URLs: `${PROTOCOL}://${host}/${filename}`
     - Add to `ratingData.url` array

3. **If Updating Existing Rating:**

   - **Fetch Existing URLs:**
     ```sql
     SELECT url FROM rating WHERE id = $1
     ```
   - **Merge URLs:**
     ```javascript
     const updatedUrls = existingUrls.concat(newUrls);
     ```

4. **Insert/Update Rating:**

   - **If `id` exists:**
     ```sql
     UPDATE rating
     SET starrating = $1, comments = $2, url = $3, ...
     WHERE id = $4
     RETURNING *
     ```
   - **If `id` doesn't exist:**
     ```sql
     INSERT INTO rating (starrating, comments, url, productid, orderlineid, ...)
     VALUES ($1, $2, $3, $4, $5, ...)
     RETURNING *
     ```

5. **Update Product Average Rating:**

   - Call `ratingService.updateAvgRating(productid)`
   - **Calculate Average:**
     ```sql
     SELECT SUM(starrating) AS totalRating,
            COUNT(starrating) AS ratingCount
     FROM rating
     WHERE productid = $1
     ```
   - **Update Product:**
     ```sql
     UPDATE product_revo
     SET averagerating = $1
     WHERE id = $2
     ```

6. **Return Response:**
   - Success: Returns rating record

---

### Address Management Flow

#### Create/Update Address (`POST /address`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `addressController.upsertAddress`
   - **Service:** `addressService.upsertAddress`
   - **Schema Validation:** `inventoryusersSchema` (note: schema name may be incorrect)

2. **Insert/Update Address:**

   - **If `id` exists:**
     ```sql
     UPDATE address
     SET name = $1, address = $2, city = $3, state = $4,
         pincode = $5, mobilenumber = $6, ...
     WHERE id = $N
     RETURNING *
     ```
   - **If `id` doesn't exist:**
     ```sql
     INSERT INTO address (userid, name, address, city, state, pincode, ...)
     VALUES ($1, $2, $3, $4, $5, $6, ...)
     RETURNING *
     ```

3. **Return Response:**
   - Success: Returns address record

---

#### Get User Addresses (`GET /address/:userId`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `addressController.getUserAddressData`
   - **Service:** `addressService.getUserAddressData`
   - **Params:** `userId`

2. **Fetch Addresses:**

   ```sql
   SELECT * FROM address
   WHERE userid = $1
   ORDER BY modifieddate DESC
   ```

3. **Return Response:**
   - Returns array of addresses for user

---

### Supplier Management Flow

#### Create/Update Supplier (`POST /supplier`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `supplierController.upsertSupplier`
   - **Service:** `supplierService.upsertSupplier`
   - **Session:** Validated via `getSession`

2. **Insert/Update Supplier:**

   - Similar to other CRUD operations
   - Stores supplier data in `supplier` table

3. **Return Response:**
   - Success: Returns supplier record

---

#### Get Supplier Products (`GET /supplier/:id`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `supplierController.getSupplierProductdata`
   - **Service:** `supplierService.getSupplierProductdata`
   - **Params:** `id` (supplier ID)

2. **Fetch Supplier Products:**

   - Query products linked to supplier
   - Join with product tables

3. **Return Response:**
   - Returns supplier with associated products

---

### Global Search Flow

#### Global Product Search (`GET /v2/global`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `globalSearchController.getAllProductData`
   - **Service:** `globalSearchService.getAllProductData`
   - **Query Params:** Search term, filters

2. **Build Search Query:**

   - Search across multiple product fields:
     - `productname`, `brand`, `model`, `category`, `subcategory`
   - Use `ILIKE` for case-insensitive search:
     ```sql
     WHERE productname ILIKE '%searchterm%'
        OR brand ILIKE '%searchterm%'
        OR model ILIKE '%searchterm%'
        ...
     ```

3. **Apply Filters:**

   - Price range
   - Category
   - Brand
   - Availability

4. **Return Response:**
   - Returns array of matching products

---

#### Global Stock/Order/Ticket Search (`GET /v3/global`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `globalSearchController.getGlobalStockOrderTicketData`
   - **Service:** `globalSearchService.getGlobalStockOrderTicketData`
   - **Session:** Validated via `getSession`

2. **Search Across Multiple Tables:**

   - Search in `stock_revo` table
   - Search in `orders` table
   - Search in `tickets` table

3. **Combine Results:**

   - Merge results from all tables
   - Add type indicator (stock/order/ticket)

4. **Return Response:**
   - Returns combined search results

---

### Dashboard/Analytics Flows

#### Get Total Sales (`GET /dashboard/totalsales`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `dashboardController.getPerMonthSalesData`
   - **Service:** `dashboardService.getPerMonthSalesData`
   - **Session:** Validated via `getSession`

2. **Query Sales Data:**

   ```sql
   SELECT
     DATE_TRUNC('month', createddate) AS month,
     SUM(orderamount) AS total_sales,
     COUNT(*) AS order_count
   FROM orders
   WHERE orderstatus = 'ordered'
     AND ispaymentsucceed = true
   GROUP BY DATE_TRUNC('month', createddate)
   ORDER BY month DESC
   ```

3. **Return Response:**
   - Returns monthly sales data

---

#### Get Revenue Data (`GET /dashboard/revenue`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `dashboardController.getRevenueQuarterData`
   - **Service:** `dashboardService.getRevenueQuarterData`

2. **Query Revenue by Quarter:**

   ```sql
   SELECT
     DATE_TRUNC('quarter', createddate) AS quarter,
     SUM(orderamount) AS revenue,
     COUNT(*) AS order_count
   FROM orders
   WHERE orderstatus = 'ordered'
   GROUP BY DATE_TRUNC('quarter', createddate)
   ORDER BY quarter DESC
   ```

3. **Return Response:**
   - Returns quarterly revenue data

---

#### Get Ticket Count (`GET /dashboard/ticket-count`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `dashboardController.getTicketCountData`
   - **Service:** `dashboardService.getTicketCountData`

2. **Query Ticket Counts:**

   ```sql
   SELECT
     ticketstatus,
     tickettype,
     priority,
     COUNT(*) AS count
   FROM tickets
   GROUP BY ticketstatus, tickettype, priority
   ```

3. **Return Response:**
   - Returns ticket counts by status/type/priority

---

### Recycle Bin Flow

#### Get Recycle Bin Data (`GET /v2/recyclebin/:pageNumber/:recordCount`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `recycleBinController.getRecycleBindataRevo`
   - **Service:** `recycleBinService.getRecycleBindataRevo`
   - **Session:** Validated via `getSession`

2. **Query Deleted Items:**

   ```sql
   SELECT * FROM product_revo
   WHERE isdeleted = true
     AND removefromrecyclebin = false
   ORDER BY modifieddate DESC
   OFFSET $1 LIMIT $2
   ```

3. **Return Response:**
   - Returns deleted products that haven't been permanently removed

---

#### Restore from Recycle Bin (`GET /v2/product/updaterecyclebin`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `productrevoController.updateRemovedFromRecyclebinRevo`
   - **Service:** `productrevoService.updateRemovedFromRecyclebinRevo`

2. **Restore Products:**

   ```sql
   UPDATE product_revo
   SET isdeleted = false,
       removefromrecyclebin = false
   WHERE isdeleted = true
     AND removefromrecyclebin = false
   ```

3. **Return Response:**
   - Success: Returns count of restored items

---

### Quote Management Flow

#### Create/Update Quote (`POST /quote`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `quoteController.upsertQuotes`
   - **Service:** `quoteService.upsertQuotes`
   - **Session:** Validated via `getSession`

2. **Insert/Update Quote:**

   - Stores quote data in `quote` table
   - Links to supplier and products

3. **Return Response:**
   - Success: Returns quote record

---

#### Attach Quote Files (`POST /quote/file`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `quoteController.attachQuotefiles`
   - **Middleware:** `filesUpload`
   - **Files:** Quote document files

2. **Process Files:**

   - Store files in `/uploads`
   - Generate file URLs

3. **Update Quote:**

   - Update quote with file URLs

4. **Return Response:**
   - Success: Returns updated quote with file URLs

---

### Notes Management Flow

#### Create/Update Note (`POST /note`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `notesController.upsertnotes`
   - **Service:** `notesService.upsertnotes`
   - **Schema Validation:** `notesSchema`
   - **Session:** Validated via `getSession`

2. **Insert/Update Note:**

   ```sql
   INSERT INTO notes (userid, notetitle, notedescription, relatedto, ...)
   VALUES ($1, $2, $3, $4, ...)
   RETURNING *
   ```

3. **Return Response:**
   - Success: Returns note record

---

### Demand Request Flow

#### Create/Update Demand Request (`POST /demandrequest`)

**Step-by-Step Process:**

1. **Request Received:**

   - **Controller:** `demandrequestController.upsertDemandRequest`
   - **Service:** `demandRequestService.upsertDemandRequest`
   - **Session:** Validated via `getSession`

2. **Insert/Update Demand Request:**

   - Stores demand request in `demandrequest` table
   - Links to purchase requests when converted

3. **Return Response:**
   - Success: Returns demand request record

---

## Additional Notes

### Code Organization Best Practices

1. **Controllers**: Should only handle HTTP requests/responses
2. **Services**: Contain all business logic
3. **Schemas**: Validate all user inputs
4. **Error Handling**: Always use `ErrorHandler` for database errors
5. **Session**: Always use `getSession` middleware for protected routes

### Security Considerations

1. **Authentication**: Session-based (Redis)
2. **Password**: Should be hashed (check `bcryptjs` usage)
3. **File Uploads**: Validate file types and sizes
4. **SQL Injection**: Use parameterized queries (already implemented)
5. **CORS**: Configured via `@fastify/cors`

### Performance Optimization

1. **Database**: Connection pooling (max 500 connections)
2. **Redis**: Used for session caching
3. **S3**: Presigned URLs reduce server load
4. **Image Processing**: `jimp` for resizing
5. **File Storage**: Consider migrating to GCP Storage for production

### Scheduled Tasks

**Recycle Bin Cleanup** (`src/schedule/removeFromRecycleBin.ts`):

- **Purpose**: Automatically removes items from recycle bin after 30 days
- **Schedule**:
  - Runs every minute: `* * * * *` (for testing/development)
  - Runs daily at 7 PM: `0 19 * * *` (production)
- **Service**: Calls `stockRevoService.updateRemoveFromRecyclebin()`
- **Note**: Ensure this file is imported in `index.ts` if scheduled tasks are needed

### Future Improvements

1. **API Documentation**: Consider adding Swagger/OpenAPI
2. **Testing**: Add unit and integration tests
3. **Logging**: Implement structured logging (Pino is available)
4. **Monitoring**: Add application monitoring (e.g., Cloud Monitoring)
5. **Caching**: Implement Redis caching for frequently accessed data
6. **Scheduled Tasks**: Ensure scheduled tasks are properly initialized in `index.ts`

---

## Contact & Support

For questions or issues:

1. Review this documentation
2. Check error logs
3. Review code comments
4. Consult with the development team

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-XX  
**Maintained By:** Development Team
