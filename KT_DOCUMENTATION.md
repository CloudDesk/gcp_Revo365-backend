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
10. [Payment Processing](#payment-processing)
11. [Deployment](#deployment)
12. [Environment Variables](#environment-variables)
13. [Common Issues & Troubleshooting](#common-issues--troubleshooting)

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

## Payment Processing

### Razorpay Integration

**Flow:**

1. **Payment Initialization:**

   - Client calls `/payment/razorpay`
   - Backend creates Razorpay order
   - Returns order ID and key to client

2. **Payment Confirmation:**

   - Client completes payment on Razorpay
   - Razorpay redirects to callback URL
   - Backend verifies payment signature
   - Updates order status in database
   - Creates transaction record

3. **Webhook Handling:**
   - Razorpay sends webhook events
   - Backend processes payment status updates

**Configuration:**

- Key ID: `ENV_RAZORPAY_KEY_ID`
- Key Secret: `ENV_RAZORPAY_KEY_SECRET`

### PhonePe Integration

**Flow:**

1. **Payment Initialization:**

   - Client calls `/payment`
   - Backend creates PhonePe payment request
   - Returns payment URL to client

2. **Payment Status:**
   - PhonePe redirects to `/payment/status`
   - Backend verifies payment
   - Updates order status

### Transaction Management

- All payments create transaction records
- Transaction table tracks: amount, status, payment method, order ID
- Endpoint: `GET /transaction` to retrieve transaction history

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
