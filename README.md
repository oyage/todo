# TODO Application

This repository provides two implementations of a simple TODO manager. Tasks are stored in `tasks.txt` and shared by both the web-based and CLI versions.

## Web version (Node.js/Express)

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm start
```

The server runs on <http://localhost:3000> and serves the HTML frontend from the `public/` directory. Use the page to add or delete tasks.

## CLI version (Python)

Run the CLI program directly:

```bash
python todo.py
```

Follow the prompts to add, list, or delete tasks via the terminal.

## File overview

- `server.js` – Express server exposing a small REST API.
- `public/index.html` – Frontend for the web version.
- `todo.py` – Menu-driven CLI application.
- `tasks.txt` – Plain text storage of tasks.
- `CLAUDE.md` – Additional notes about the project.

あなたがこのリポジトリを利用する際にはAGENTS.mdに従ってください。AGENTS.mdが見つからない場合、次善策としてREADMEを参照しましょう。
