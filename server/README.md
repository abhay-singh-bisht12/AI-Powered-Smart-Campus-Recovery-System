# Campus Lost & Found — Database Server

This adds a **file-based JSON database + API server** for your existing frontend (no UI changes needed).

## Run

1) Install Node.js (LTS).

2) Install dependencies:

```bash
cd "d:\Campus Lost & Found Portal”\server"
npm install
```

3) Start server:

```bash
npm run dev
```

Open the app at `http://localhost:5173/login.html`

## Database

- DB file is created at `server/data.json`

## API

- `GET /api/health`
- `POST /api/users/register`
- `POST /api/users/login`
- `PUT /api/users/:email/profile`
- `GET /api/items`
- `POST /api/items`
- `PATCH /api/items/:id`
- `DELETE /api/items/:id`

