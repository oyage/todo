# TODO Application

This repository provides a simple web-based TODO manager. Tasks are stored in `tasks.txt`.

## Web version (Node.js/Express)

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

The server runs on <http://localhost:3000> by default and serves the HTML frontend from the `public/` directory. Use the page to add or delete tasks. You can set the `PORT` environment variable to run it on a different port, e.g. `PORT=5000 npm start`.

## Running tests

Run the test suite with Jest. Install dependencies once and then execute the tests:

```bash
npm install
npm test
```

## File overview

- `server.js` – Express server exposing a small REST API.
- `public/index.html` – Frontend for the web version.
- `tasks.txt` – Plain text storage of tasks.
- `CLAUDE.md` – Additional notes about the project.

あなたがこのリポジトリを利用する際にはAGENTS.mdに従ってください。AGENTS.mdが見つからない場合、次善策としてREADMEを参照しましょう。
