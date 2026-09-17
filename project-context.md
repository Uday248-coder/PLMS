# Campus Parking Slot Management System - Architecture & Project Context

> **CRITICAL NOTICE:** This document is the definitive source of truth for the system architecture. Any previous concepts involving a "walk-in only" or "no driver accounts" MVP model are obsolete and should be entirely disregarded.

## Project Overview

The Campus Parking Slot Management System is a sophisticated, time-based reservation and fine-enforcement platform designed to strictly regulate parking on campus. The system hinges on a highly structured daily schedule with rigid shifts, real-time tracking of slot occupancy, and an uncompromising automated Fine Engine designed to penalize overstays and enforce campus policy.

The project operates against a **Virtual Clock**, allowing real-time demonstration of time-based policies, shift changes, overstay penalties, and instant fine calculations.

---

## Core Architecture

### Tech Stack

- **Backend:** Python 3.10+ + FastAPI (Async REST API & WebSockets)
- **Database:** PostgreSQL / SQLite (managed via SQLAlchemy ORM)
- **Frontend:** React 18 + Vite + Tailwind CSS + Zustand
- **Routing:** React Router v6 (`BrowserRouter`, `Routes`, `Route`, `Navigate`, Layout `Outlet`)
- **State Management:** Modularized Zustand stores (`authStore`, `clockStore`, `connectionStore`, `notificationStore`) with legacy compatibility fallback (`useStore`).
- **Real-Time Communication:** Native WebSockets with auto-reconnect backoff and event sub/pub.
- **Deployment Strategy:** Static Vite build (`frontend/dist`) communicating with the FastAPI backend at `/api`.

---

## System Structure & Directory Layout

### Backend (`backend/`)
- `app/main.py`: FastAPI entrypoint, router registrations, CORS, WebSocket `/ws/live` handler.
- `app/models.py`: SQLAlchemy models (`Student`, `Lot`, `ParkingSlot`, `Booking`, `Fine`, `SystemLog`, `GuardShift`).
- `app/schemas.py`: Pydantic request/response validation schemas.
- `app/fine_engine.py`: Core fine computation logic (overstay calculations, late fees, flagging).
- `app/database.py`: DB engine and session dependency.
- `app/routers/`: Endpoint domain controllers (`auth.py`, `student.py`, `guard.py`, `admin.py`, `websocket.py`).

### Frontend (`frontend/src/`)
- **`config.js`**: Environment configuration (`API_BASE_URL`, `WS_BASE_URL`).
- **`services/`**: Centralized infrastructure communication layer.
  - `api.js`: Standardized API client (`ApiError` handling, JWT header injection, auth, student, guard, admin endpoints).
  - `websocket.js`: Resilient WebSocket manager (reconnect backoff, ping/pong keepalive, topic routing).
- **`store/`**: Domain-driven state management stores.
  - `authStore.js`: JWT token persistence, auth status, user profile, role checking (`quickLogin`, `login`, `logout`).
  - `clockStore.js`: Server-synced virtual clock, offset tracking, tick loop, speed multiplier support.
  - `connectionStore.js`: Real-time WebSocket connectivity status tracking (`connected`, `disconnected`, `reconnecting`, `error`).
  - `notificationStore.js`: Toast notification system and historical notification feed.
  - `useStore.js`: Legacy monolithic store preserved for backward compatibility during transition.
- **`components/ui/`**: Industrial Tactile Design System primitives & status tokens.
  - `primitives.jsx`: 18 atomic UI components (`Button`, `Card`, `Badge`, `Modal`, `HazardBanner`, `Input`, `Select`, `MetricCard`, `Toggle`, `Tabs`, `Table`, `Drawer`, `Alert`, `Avatar`, `Tooltip`, `ClockDisplay`, `EmptyState`, `Skeleton`).
  - `statusTokens.js`: 8 canonical parking slot status visual tokens (`AVAILABLE`, `BOOKED`, `PARKED`, `OVERSTAY`, `CLOSED`, `LOCKED`, `UNPAID_FINE`, `MAINTENANCE`).
  - `index.js`: Clean barrel exports.
- **`components/`**: Application layouts & guards.
  - `AppShell.jsx`: Industrial Tactile App Shell header, nav, live clock widget, connection monitor, toast overlay, and page container outlet.
  - `RequireAuth.jsx`: Authentication guard and role-based access controller (`student`, `guard`, `admin`).
- **`hooks/`**:
  - `useWebSocket.js`: Custom hooks for subscribing components to WebSocket real-time events.
- **`pages/`**: View components.
  - `LoginPage.jsx`: Multi-mode login supporting quick-select test student/guard accounts and password authentication.
  - `PlaceholderPages.jsx`: Role-specific view placeholders (`StudentDashboard`, `MapPage`, `GuardPage`, `AdminPage`, `FinesPage`, `SettingsPage`).
- **`App.jsx`**: Root application router setup with protected and layout routes.
- **`index.css`**: CSS Design Tokens (Custom properties, 2px ink borders, offset hard shadows, hazard stripe patterns, accessibility focus rings, reduced motion overrides).

---

## Business Logic & The Virtual Clock

### 1. Shifts & Time Constraints
The system operates on strict daily time boundaries:
- **Shift 1:** 09:00 - 12:30
- **Grace Buffer:** 15 minutes (until 12:45) before overstay penalties trigger.
- **Midday Closure:** 12:30 - 14:00 (Lot closed; no new bookings or entry allowed).
- **Shift 2:** 14:00 - 17:30
- **Grace Buffer:** 15 minutes (until 17:45).

### 2. The Fine Engine
The backend Fine Engine (`backend/app/fine_engine.py`) continuously evaluates bookings against virtual time:
- **Overstay Penalty:** Any vehicle remaining parked past the 15-minute grace period incurs **₹200 per hour** of overstay.
- **Late Payment Penalty:** Unpaid fines past 7 days accumulate **₹20 per day**.
- **Authority Flagging (`is_flagged`):** Unpaid fine totals reaching or exceeding **₹1000** trigger automatic system flagging of the student account.

### 3. The Hard Block Rule
The system strictly enforces financial and compliance blocking. The backend `/api/student/reserve` endpoint and client-side UI throw a **403 Forbidden** error if:
1. The student has *any* unpaid fines (`unpaid_fine_total > 0`).
2. The student's account is flagged (`is_flagged == True`).

No new slot reservations can be created until all outstanding fines are paid.

---

## Frontend Architecture: "Industrial Tactile" Design System

The frontend design philosophy is explicitly non-corporate, utilitarian, and physical. It implements an **Industrial Tactile** aesthetic.

### Visual & Component Guidelines
- **Color Palette & Textures:** Concrete light grey (`#EBEAE5`) background, off-white card canvas (`#F7F6F2`), ink borders (`#111111`), signal amber (`#D97706`), overstay crimson (`#DC2626`), and success olive (`#15803D`).
- **Borders & Hard Shadows:** Solid 2px ink borders with sharp `5px 5px 0px #111111` offset hard drop-shadows on interactive cards, buttons, modals, and input fields.
- **Typography:** Inter sans-serif for UI labels, combined with high-density monospace (`JetBrains Mono` / `Courier`) for slot IDs, timestamps, plates, prices, and virtual clock displays.
- **Urgency & Anomalies:** Overstays and fine alerts use dynamic hazard stripe backgrounds (`bg-hazard-stripes`), red pulsing borders (`animate-pulse-subtle`), and live minute counters.

### The "Additive State" Rule
When a slot is locked, booked, or unavailable, **never hide, blur, or ghost the element**. State representation MUST be additive:
- Instead of reducing opacity or removing slots, layer physical markers (e.g., hazard stripe background overlay, "SHIFT ENDED" physical badge, or lock icon overlay) directly over the slot cell to clearly signal state changes.

### Real-Time Client-Side Math & WebSockets
The frontend uses `clockStore` and client-side timestamp delta math to calculate overstay states dynamically in real-time. WebSocket events (`SLOT_UPDATED`, `FINE_ISSUED`, `CLOCK_TICK`) immediately sync local stores and trigger UI status token updates without full-page reloads.

---

## Data Model (Source of Truth)

- **Student:** Represents a campus driver. Attributes: `id`, `name`, `roll_number`, `email`, `unpaid_fine_total`, `is_flagged`, `role`.
- **Lot & ParkingSlot:** Represents physical campus parking lots (3 lots: Lot A, Lot B, Lot C) and slot bays (20 bays per lot).
- **Booking:** Represents a slot reservation. Tracks `shift`, `status` (`booked`, `parked`, `overstay`, `left`), timestamps (`booked_at`, `parked_at`, `left_at`), `vehicle_plate`, and `fine_amount`.
- **Fine:** A financial penalty record linked to a Booking and Student, tracking `amount`, `status` (`unpaid`, `paid`), and days overdue.
- **SystemLog:** Auditing log for system actions, virtual clock shifts, guard overrides, and fine creations.
