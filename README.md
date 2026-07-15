<div align="center">

# 📊 Excelerate

### A desktop app for aggregating MCA funder files into a unified portfolio workbook

[![React](https://img.shields.io/badge/React_18-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](https://reactjs.org/) [![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Tauri](https://img.shields.io/badge/Tauri_2-24C8DB?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app/) [![Vite](https://img.shields.io/badge/Vite_6-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)

[![Rust](https://img.shields.io/badge/Rust-000000?style=for-the-badge&logo=rust&logoColor=white)](https://www.rust-lang.org/) [![Supabase](https://img.shields.io/badge/Supabase-3ECF8E?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/) [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)](https://tailwindcss.com/) [![HeroUI](https://img.shields.io/badge/HeroUI-000000?style=for-the-badge&logo=nextui&logoColor=white)](https://heroui.com/)

![Version](https://img.shields.io/badge/version-1.2.0-blue?style=flat-square) ![Platform](https://img.shields.io/badge/platform-macOS_%7C_Windows-lightgrey?style=flat-square) ![License](https://img.shields.io/badge/license-Proprietary-red?style=flat-square)

</div>

---

## 📖 Overview

**Excelerate** processes **MCA (Merchant Cash Advance)** funder files and aggregates them into a single portfolio workbook. Upload the monthly file from each funder, and Excelerate parses, normalizes, and rolls every deal up into pivot tables and portfolio analytics — all backed by Supabase in the cloud.

It's built as a native desktop application with a [Tauri](https://tauri.app/) (Rust) backend and a [React](https://reactjs.org/) + [TypeScript](https://www.typescriptlang.org/) frontend.

## ✨ Features

- 🏦 **Multi-funder parsers** — dedicated parsers for BHB, BIG, Boom, ClearView, eFin, InAdvance, Kings, and Receivabull file formats
- 📈 **Portfolio analytics** — dashboard, deal lookup, and per-funder portfolio views (Alder, White Rabbit)
- 🔄 **Pivot tables** — browse, review, and export committed funder pivots
- 🤖 **AI Chat** — query your portfolio data conversationally
- ☁️ **Cloud-native** — all data lives in Supabase; raw funder files are stored in object storage
- 📤 **Excel export** — values-only `.xlsx` export that round-trips through the importer

## 🛠️ Tech Stack

| Layer        | Technology                                           |
| ------------ | ---------------------------------------------------- |
| **Frontend** | React 18 · TypeScript · Vite · HeroUI · Tailwind CSS |
| **Backend**  | Tauri 2 · Rust (edition 2021)                        |
| **Data**     | Supabase (Postgres · Storage · Auth)                 |

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) & npm
- [Rust](https://www.rust-lang.org/tools/install) toolchain
- [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your platform

### Installation

```bash
# Clone the repository
git clone <repo-url>
cd Excelerate-Desktop

# Install dependencies
npm install
```

### Development

```bash
# Run the desktop app (against production Supabase via .env)
npm run tauri dev

# Run against the local Supabase stack in Docker
npm run dev:local

# Frontend-only dev server (port 1420)
npm run dev
```

> See [`docs/local-dev.md`](docs/local-dev.md) for the local Supabase setup.

### Build

```bash
# Build the production desktop app
npm run tauri build
```

## 📜 Scripts

| Command                  | Description                                     |
| ------------------------ | ----------------------------------------------- |
| `npm run dev`            | Start the Vite dev server (port 1420)           |
| `npm run tauri dev`      | Run the Tauri app against production Supabase    |
| `npm run dev:local`      | Run against the local Supabase stack in Docker  |
| `npm run build`          | TypeScript check + Vite production build         |
| `npm run tauri build`    | Build the production desktop app                |
| `npm run lint`           | ESLint (max 17 warnings)                         |
| `npm run format:check`   | Prettier check (CI gate)                        |
| `npm run db:reset:local` | Wipe local DB, re-apply migrations + seed       |

## 📁 Project Structure

```
Excelerate-Desktop/
├── src/                  # React + TypeScript frontend
│   ├── pages/            # App pages (dashboard, deal-lookup, ai-chat, …)
│   ├── components/       # Shared UI components
│   ├── features/         # Feature modules
│   └── services/         # Tauri invoke() wrappers + Supabase client
├── src-tauri/            # Tauri (Rust) backend
│   └── src/
│       ├── parsers/      # Per-funder file parsers (BaseParser trait)
│       ├── lib.rs        # Command registration
│       └── main.rs       # Entry point
├── supabase/             # Migrations + seed data
└── docs/                 # Detailed documentation
```

## 📚 Documentation

| Doc                                                | Description                                          |
| -------------------------------------------------- | --------------------------------------------------- |
| [`docs/parsers.md`](docs/parsers.md)               | Column mappings per funder, source & output formats |
| [`docs/database.md`](docs/database.md)             | Supabase schema, views, RPCs, RLS, monthly flow     |
| [`docs/tauri-commands.md`](docs/tauri-commands.md) | Every Tauri command and its TS service wrapper      |
| [`docs/local-dev.md`](docs/local-dev.md)           | Running against the local Supabase stack            |
| [`CLAUDE.md`](CLAUDE.md)                            | Architecture & conventions guide                    |

## 🤝 Contributing

This project uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by commitlint + husky.

```
type(scope): message
```

**Types:** `feat` · `fix` · `chore` · `refactor` · `docs` · `test` · `ci`

Before pushing, run the CI gates:

```bash
npm run lint && npm run format:check && npm run build
cd src-tauri && cargo fmt --check && cargo clippy --all-targets -- -D warnings
```

---

<div align="center">

**Built with ⚡ Tauri, ⚛️ React, and 🦀 Rust**

</div>
