# Portfolio Website with Admin Inbox

A personal portfolio web app with a contact form backend, MongoDB persistence, and a Google OAuth-protected admin inbox.

## Overview

This project serves a static portfolio frontend and exposes backend APIs to:
- receive contact messages from visitors,
- store them in MongoDB,
- allow only an authorized Google account to view messages in the admin dashboard.

## Tech Stack

### Frontend
- HTML5
- CSS3 (custom styles, animations, responsive layout)
- Vanilla JavaScript
- Three.js (for visual effects on main page)

### Backend
- Node.js
- Express.js
- body-parser
- cors
- dotenv
- express-session
- passport
- passport-google-oauth20
- Rule-based chatbot engine (portfolio-specific)

### Database
- MongoDB Atlas (via Mongoose)

### Dev Tooling
- nodemon (development auto-reload)

## Project Structure

```text
portfolio/
  public/
    index.html        # Main portfolio page
    admin.html        # Admin dashboard (Google OAuth session)
    style.css         # Shared visual styling
    script.js         # Main frontend interactions
    images/
  server.js           # Express app, API routes, auth, DB
  package.json
  .env                # Local environment configuration (not committed)
```

## System Architecture

```text
Browser (Visitor) ---> public/index.html ---> POST /api/messages ---> MongoDB

Browser (Admin) ---> public/admin.html ---> /auth/google (OAuth)
                                    \--> session cookie (connect.sid)
                                    \--> GET /api/admin/me
                                    \--> GET /api/admin/messages ---> MongoDB
```

### Request Flow

1. Visitor submits contact form on main page.
2. Backend validates payload and saves message to MongoDB.
3. Admin opens admin page and signs in with Google.
4. Backend verifies Google account email equals configured `ADMIN_EMAIL`.
5. Authenticated session can fetch admin identity and message list.

## Database Schema

`Message` model in `server.js`:

- `name`: String, required, trimmed
- `email`: String, required, trimmed
- `phone`: String, required, trimmed
- `message`: String, required, trimmed
- `createdAt`: Date (auto from timestamps)
- `updatedAt`: Date (auto from timestamps)

Mongoose schema uses `timestamps: true`.

## API Endpoints

### Public

#### `POST /api/messages`
Creates a contact message.

Request body:

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "phone": "+1-555-0100",
  "message": "Hello, I want to connect."
}
```

Success response:

```json
{
  "message": "Message saved successfully.",
  "id": "<mongo_object_id>"
}
```

Possible errors:
- `400` invalid or missing fields
- `500` persistence error

#### `POST /api/chat`
Chatbot endpoint for portfolio Q&A.

Request body:

```json
{
  "message": "Tell me about your skills"
}
```

Response fields:
- `reply`: chatbot response text
- `topic`: response topic (`skills`, `projects`, etc.)
- `source`: `rule-based` or `guardrail`

Possible errors:
- `400` invalid/empty/too-long input
- `429` rate limit exceeded

### Auth

#### `GET /auth/google`
Starts Google OAuth flow.

#### `GET /auth/google/callback`
OAuth callback endpoint used by Google.

#### `POST /auth/logout`
Logs out and clears server session.

### Admin (Protected)

#### `GET /api/admin/me`
Returns signed-in admin profile from session.

#### `GET /api/admin/messages`
Returns latest 50 messages sorted by newest first.

Possible errors:
- `401` not authenticated
- `403` signed-in email not authorized
- `503` OAuth/admin config missing

## Environment Variables

Create a `.env` file in project root.

```env
MONGODB_URI=<your_mongodb_connection_string>
ADMIN_EMAIL=<your_authorized_google_email>
APP_BASE_URL=http://localhost:3000
GOOGLE_CLIENT_ID=<google_oauth_client_id>
GOOGLE_CLIENT_SECRET=<google_oauth_client_secret>
SESSION_SECRET=<long_random_secret>
CHAT_RATE_LIMIT_WINDOW_MS=60000
CHAT_RATE_LIMIT_MAX=10
CHAT_DAILY_LIMIT_GLOBAL=400
CHAT_DAILY_LIMIT_PER_IP=60
```

Notes:
- `ADMIN_EMAIL` must match the Google account used for admin login.
- `APP_BASE_URL` should match your running app URL exactly.
- `SESSION_SECRET` should be long and random.
- `ADMIN_TOKEN` may still exist in older local `.env` files, but is not required in current OAuth flow.
- `CHAT_DAILY_LIMIT_GLOBAL` sets total daily chatbot requests allowed across all users.
- `CHAT_DAILY_LIMIT_PER_IP` sets per-IP daily chatbot request cap.

## Google OAuth Setup

1. Open Google Cloud Console.
2. Create/select a project for this portfolio.
3. Configure OAuth consent screen (set app name to portfolio name).
4. Create OAuth Client ID (Web application).
5. Add:
   - Authorized JavaScript origins: `http://localhost:3000`
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`
6. Copy client ID/secret into `.env`.

## Installation

### Prerequisites
- Node.js 18+ recommended
- npm
- MongoDB Atlas cluster (or local MongoDB)

### Steps

1. Install dependencies:

```bash
npm install
```

2. Configure `.env` values.

3. Start development server:

```bash
npm run dev
```

Or production mode:

```bash
npm start
```

4. Open app:
- Main site: `http://localhost:3000/`
- Admin: `http://localhost:3000/admin.html`

## Admin Workflow

1. Open admin page.
2. Click **Sign in with Google**.
3. Authenticate with the same account as `ADMIN_EMAIL`.
4. After callback, dashboard fetches:
   - `/api/admin/me`
   - `/api/admin/messages`
5. Use refresh/logout controls as needed.

## Chatbot Workflow

1. User opens the chat widget on portfolio page.
2. Frontend sends `POST /api/chat`.
3. Backend applies per-IP rate limit.
4. Backend applies daily budget guardrails (global and per-IP).
5. Backend applies basic safety guardrails.
6. Backend returns portfolio-aware rule-based response.

### Example Chat Prompts

- `What are Mayukh's skills?`
- `Tell me about Mayukh's projects.`
- `What are Mayukh's hobbies?`
- `What kind of person is Mayukh?`
- `How can I contact Mayukh?`

## Validation Rules for Contact Form

Server-side validation ensures:
- all fields are present and non-empty,
- whitespace is trimmed,
- email format is valid.

Invalid payload returns `400` with an error message.

## Security Notes

- Never commit `.env` to git.
- Rotate credentials immediately if exposed.
- Use a strong `SESSION_SECRET`.
- In production, use HTTPS and set `NODE_ENV=production` for secure cookies.
- Restrict admin inbox by a single authorized `ADMIN_EMAIL`.

## Deployment Notes

For deployment, update:
- `APP_BASE_URL` to your live domain,
- Google OAuth authorized origins and redirect URI to live URLs,
- `NODE_ENV=production`.

## Troubleshooting

### 1) `Unauthorized. Please sign in with Google.`
You do not have a valid session. Sign in again from `/admin.html`.

### 2) `Forbidden. Admin email mismatch.`
Signed-in Google account does not match `ADMIN_EMAIL`.

### 3) `Google OAuth is not configured on this server.`
Missing one or more: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `SESSION_SECRET`.

### 4) OAuth screen shows wrong app name
You are using credentials from another Google Cloud project. Create/use the correct OAuth client.

## Available Scripts

- `npm start` - run server normally
- `npm run dev` - run with nodemon
- `npm test` - placeholder test script
