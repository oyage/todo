# TODO Application

This repository provides a simple web-based TODO manager. Tasks are stored in SQLite database.

## Web version (Node.js/Express)

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

By default the server runs on <http://localhost:3000>. To use a different port, set the `PORT` environment variable:

```bash
PORT=4000 npm start
```

## Authentication

The application uses Bearer Token authentication. Set the `BEARER_TOKEN` environment variable:

```bash
BEARER_TOKEN=your-secret-token npm start
```

If not set, the default token `your-secret-token` is used. The frontend is pre-configured with this token.

The app serves the HTML frontend from the `public/` directory. Use the page to add, edit, or delete tasks.

## Docker support

Run with Docker Compose:

```bash
docker-compose up
```

## Testing

Run tests:

```bash
npm test
```

## File overview

- `server.js` – Express server exposing a REST API.
- `database.js` – SQLite database operations.
- `public/index.html` – Frontend for the web version.
- `tasks.db` – SQLite database storing tasks.
- `test/server.test.js` – API endpoint tests.
- `CLAUDE.md` – Additional notes about the project.

あなたがこのリポジトリを利用する際にはAGENTS.mdに従ってください。AGENTS.mdが見つからない場合、次善策としてREADMEを参照しましょう。
