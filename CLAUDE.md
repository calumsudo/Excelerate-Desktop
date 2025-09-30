# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Excelerate is a desktop application built with Tauri (Rust backend) and React + TypeScript (frontend). It uses HeroUI component library for the UI, Tailwind CSS for styling, and Vite as the build tool.

## Development Commands

### Frontend (React/TypeScript)
- `npm run dev` - Start development server (port 1420)
- `npm run build` - Build for production (TypeScript check + Vite build)
- `npm run preview` - Preview production build

### Tauri Application
- `npm run tauri dev` - Run Tauri app in development mode
- `npm run tauri build` - Build production desktop app

## Architecture

### Frontend Structure
- **Framework**: React 18 with TypeScript
- **UI Library**: @heroui/react component library
- **Styling**: Tailwind CSS
- **Build Tool**: Vite
- **Path Aliases**: Configured for `@/`, `@components/`, `@features/`, `@services/`, `@utils/`, `@pages/`, `@assets/`

### Backend Structure
- **Framework**: Tauri v2 (Rust)
- **Main Binary**: `src-tauri/src/main.rs`
- **Library**: `src-tauri/src/lib.rs` (exported as `excelerate_lib`)
- **Plugins**: tauri-plugin-opener

### Key Configuration Files
- `tsconfig.json` - TypeScript config with strict mode and path aliases
- `vite.config.ts` - Vite config with path resolution and Tauri-specific settings
- `src-tauri/tauri.conf.json` - Tauri app configuration
- `src-tauri/Cargo.toml` - Rust dependencies and build configuration

### Frontend Organization
The React app uses a feature-based structure:
- `/src/features/` - Feature modules (e.g., sidebar)
- `/src/components/` - Shared components
- `/src/services/` - API and service layer
- Entry point: `src/main.tsx` → `src/app.tsx`

### Development Notes
- Frontend dev server runs on port 1420 with HMR
- Tauri expects fixed port 1420 for development
- The app currently displays a sidebar UI with placeholder content
- Uses TypeScript strict mode with all linting rules enabled
- The edit-xlsx library examples can be found at /edit-xlsx-main/examples