
# PayLink v1 — M-Pesa Payment Link Generator

## Project Overview

PayLink is a full-stack M-Pesa payment application that enables businesses, freelancers, and service providers in Kenya to generate and share payment links with customers.

Customers can open a payment link, view the payment details, enter their M-Pesa phone number, and complete payments through Safaricom's Daraja STK Push API.

The application also provides a dashboard for managing payment links, tracking transactions, and monitoring payment collections.

This project was developed to demonstrate practical knowledge of payment integrations, REST APIs, database management, and full-stack application development.

## Project Objectives

The main objectives are to:

- Integrate Safaricom Daraja OAuth and STK Push APIs.
- Generate unique, shareable M-Pesa payment links.
- Build a secure REST API using Node.js and Express.
- Store payment links and transactions in PostgreSQL using Prisma ORM.
- Process M-Pesa callbacks and update payment records.
- Implement payment status polling for the frontend.
- Build a responsive React application.
- Display transaction history and payment statistics.
- Apply authentication, validation, and error handling.
- Deploy the frontend and backend to cloud platforms.

## Key Features

### Payment Link Generation
- Create payment links with an amount in KES and a description.
- Generate automatic or custom URL slugs.
- Validate payment information and prevent duplicate slugs.
- Copy and share generated payment links.

### M-Pesa STK Push Integration
- Generate and cache Daraja OAuth access tokens.
- Validate and format Kenyan phone numbers.
- Initiate STK Push requests.
- Receive and process payment callbacks.
- Record successful, pending, and failed transactions.

### Payment Status Tracking
- Poll payment status every 3 seconds.
- Stop polling after a final result or 40 attempts.
- Display processing, success, failure, or timeout messages.

### Merchant Dashboard
- View all created payment links.
- Display total links, completed payments, and total collections.
- Monitor payment activity.
- Activate or deactivate payment links.

### Transaction History
- View recorded transactions.
- Filter by payment status.
- Display transaction dates, amounts, masked phone numbers, and receipts.
- Sort transactions from newest to oldest.

### Additional Features
- Generate QR codes for payment links.
- Send optional payment confirmation emails.
- Download payment records in CSV format.
- Protect merchant endpoints using JWT authentication.

## Technology Stack

| Layer | Technologies |
|-------|--------------|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL / Supabase |
| ORM | Prisma v6 |
| Payment Gateway | Safaricom Daraja API |
| Authentication | JWT, bcrypt |
| QR Codes | qrcode.react |
| Email | Nodemailer |
| API Testing | Thunder Client |
| Callback Testing | ngrok |
| Deployment | Railway, Vercel |

## Project Structure

```text
paylink-mpesa/
│
├── server/
│   ├── prisma/
│   │   └── schema.prisma
│   ├── src/
│   │   ├── server.js
│   │   ├── mpesa.js
│   │   ├── prisma.js
│   │   ├── auth.js
│   │   └── email.js
│   ├── .env.example
│   └── package.json
│
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   └── UI.jsx
│   │   ├── pages/
│   │   │   ├── Create.jsx
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Pay.jsx
│   │   │   └── Payments.jsx
│   │   ├── api.js
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── .env.example
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── .gitignore
└── README.md
```

## Installation and Setup

### Prerequisites

Ensure you have installed:

- Node.js (version 20 or later)
- npm
- PostgreSQL or Supabase
- Git and VS Code
- Thunder Client or Postman
- ngrok
- Safaricom Daraja sandbox credentials

### Step 1: Clone the Repository

```bash
git clone https://github.com/Dominic-kores/paylink-mpesa

cd YOUR_REPOSITORY
```

Replace the placeholders with your GitHub username and repository name.

### Step 2: Set Up the Backend

```bash
cd server

npm install

cp .env.example .env
```

Configure the required variables in `server/.env`:

```env
PORT=5000

DATABASE_URL=your_postgresql_database_url

FRONTEND_URL=http://localhost:5173

JWT_SECRET=your_random_secret
ADMIN_PASSWORD_HASH=your_bcrypt_hash

DARAJA_BASE_URL=https://sandbox.safaricom.co.ke
DARAJA_CONSUMER_KEY=your_consumer_key
DARAJA_CONSUMER_SECRET=your_consumer_secret
DARAJA_SHORTCODE=174379
DARAJA_PASSKEY=your_passkey

BACKEND_PUBLIC_URL=https://your-ngrok-url.ngrok-free.app

MPESA_CALLBACK_TOKEN=your_random_callback_token
```

Use strong, randomly generated secrets and store a bcrypt hash of the administrator password.

### Step 3: Configure the Database

Run Prisma migrations:

```bash
npx prisma migrate dev --name init

npx prisma generate
```

Optional: Open Prisma Studio to inspect the database.

```bash
npx prisma studio
```

### Step 4: Start the Backend

```bash
npm run dev
```

The API runs at:

```text
http://localhost:5001
```

Health check:

```text
GET http://localhost:5001/api/health
```

### Step 5: Set Up the Frontend

Open a new terminal:

```bash
cd client

npm install

cp .env.example .env
```

Configure `client/.env`:

```env
VITE_API_BASE_URL=http://localhost:5001
```

Start the React application:

```bash
npm run dev
```

Open:

```text
http://localhost:5173
```

### Step 6: Configure ngrok

Start ngrok to expose the local backend:

```bash
ngrok http 5000
```

Copy the generated HTTPS URL into `BACKEND_PUBLIC_URL` in the backend `.env` file.

Restart the backend after updating environment variables.

**Note:** The backend must be publicly accessible for Safaricom to send payment callbacks.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/login` | Merchant authentication |
| POST | `/api/links` | Create payment link |
| GET | `/api/links` | Retrieve merchant links |
| GET | `/api/links/:slug` | Get payment link details |
| PATCH | `/api/links/:id/toggle` | Activate/deactivate a link |
| POST | `/api/mpesa/stkpush` | Initiate STK Push |
| POST | `/api/mpesa/callback` | Receive M-Pesa callback |
| GET | `/api/payments/:id/poll` | Check payment status |
| GET | `/api/payments` | Transaction history |
| GET | `/api/links/:id/payments.csv` | Export payment history |
| GET | `/api/health` | Health check |

Merchant management endpoints require a JWT Bearer token.

## Example API Requests

### Create a Payment Link

**POST** `/api/links`

```json
{
  "amount": 15000,
  "description": "Logo Design - Acme Corp",
  "slug": "logo-design"
}
```

This creates a shareable payment link:

```text
http://localhost:5173/pay/logo-design
```

### Initiate M-Pesa STK Push

**POST** `/api/mpesa/stkpush`

```json
{
  "linkSlug": "logo-design",
  "phoneNumber": "0712345678"
}
```

The backend retrieves the payment amount from the database and sends an STK Push request through Daraja.

### Check Payment Status

**GET** `/api/payments/:id/poll`

Possible payment statuses:

- `pending` — Awaiting confirmation
- `completed` — Payment confirmed
- `failed` — Payment unsuccessful

An accepted STK Push request does not automatically mean the payment succeeded.

## Payment Workflow

1. The merchant logs into the dashboard.
2. The merchant creates a payment link with an amount and description.
3. The application saves the payment link in PostgreSQL.
4. The merchant shares the generated URL or QR code.
5. The customer opens the payment page and enters their M-Pesa phone number.
6. The backend initiates a Daraja STK Push request.
7. The customer approves or cancels the payment on their phone.
8. Safaricom sends the transaction result to the callback endpoint.
9. The application updates the payment record.
10. The frontend displays the payment result, and the dashboard reflects confirmed collections.

## Testing

The application can be tested using Thunder Client and the Daraja sandbox.

Key test cases include:

- Successful administrator login
- Payment link creation
- Unique slug validation
- Retrieval of existing payment links
- Rejection of inactive payment links
- Kenyan phone number validation
- STK Push request initiation
- Callback processing
- Payment status polling
- Successful and failed payment scenarios
- Dashboard statistics
- Transaction filtering
- QR code generation
- CSV export
- Optional email notifications

##  Deployment

### Backend — Railway

1. Push the project to GitHub.
2. Create a Railway project.
3. Deploy the `server` directory.
4. Connect a PostgreSQL database.
5. Configure the backend environment variables.
6. Run `npx prisma migrate deploy`.
7. Set the start command to `npm start`.

### Frontend — Vercel

1. Import the GitHub repository into Vercel.
2. Set the root directory to `client`.
3. Select Vite as the framework.
4. Configure the frontend environment variable:

```env
VITE_API_BASE_URL=https://your-backend.up.railway.app
```

5. Build and deploy the application.

Update `FRONTEND_URL` and `BACKEND_PUBLIC_URL` on Railway to match the deployed frontend and backend URLs.

##  Live Application

**Frontend (Vercel):** Add your deployed frontend URL here.

**Backend (Railway):** Add your deployed backend URL here.

**GitHub Repository:** Add your repository URL here.

## Security Considerations

The application implements:

- Environment variables for sensitive credentials
- Password hashing with bcrypt
- JWT-protected merchant endpoints
- Input validation
- API rate limiting
- Callback token verification
- Masked phone numbers in transaction history
- Server-side payment amount validation
- Duplicate callback processing protection

For production use, stronger merchant authentication, persistent reconciliation, audit logging, database-backed idempotency, and comprehensive payment testing are recommended.

##  Challenges and Learning Outcomes

This project strengthened my understanding of:

- Integrating third-party payment gateways
- Managing OAuth access tokens
- Building RESTful APIs with Express
- Designing relational databases with Prisma
- Handling asynchronous payment callbacks
- Managing frontend payment states
- Connecting React to a backend API
- Implementing application security
- Preparing full-stack applications for deployment

The project demonstrates how individual backend and frontend concepts can be combined into a practical digital payment solution.



##  Author

**Dominic Kores Kisioya**

Full-Stack Software & AI Engineer

