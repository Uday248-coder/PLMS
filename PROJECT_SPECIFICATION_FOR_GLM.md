# Campus Parking Slot Management System (PLMS)
## Master Blueprint & AI Prompting Guide for GLM 5.3

> **Instructions for the User:**
> This document contains everything needed to prompt **GLM 5.3** (or any state-of-the-art LLM) to build this entire project from scratch in two clean phases:
> 1. **Phase 1: Complete Frontend** (React + Vite + Tailwind CSS + Zustand + Tactile UI)
> 2. **Phase 2: Complete Backend** (FastAPI + SQLAlchemy + SQLite/Postgres + WebSockets + Fine Engine)
> 
> Below you will find the complete system specification, followed by copy-pasteable master prompts for each phase.

---

# Table of Contents
1. [Executive Summary & Core Concept](#1-executive-summary--core-concept)
2. [Business Rules & The Fine Engine](#2-business-rules--the-fine-engine)
3. [Design System: Industrial Tactile](#3-design-system-industrial-tactile)
4. [Data Architecture & Schemas](#4-data-architecture--schemas)
5. [PROMPT 1: Build the Complete Frontend (Copy-Paste for GLM)](#5-prompt-1-build-the-complete-frontend)
6. [PROMPT 2: Build the Complete Backend (Copy-Paste for GLM)](#6-prompt-2-build-the-complete-backend)
7. [Step-by-Step Execution & Verification Guide](#7-step-by-step-execution--verification-guide)

---

# 1. Executive Summary & Core Concept

The **Campus Parking Slot Management System (PLMS)** is a high-stakes, time-based slot reservation, occupancy tracking, and fine-enforcement platform designed for university campuses.

### Key Pillars:
1. **Time-Constrained Shifts & Virtual Clock:** The campus parking lots operate strictly around academic shifts. A controllable **Virtual Clock** drives all system events, allowing demonstration of shift transitions, overstay penalties, and instant fine calculations.
2. **Automated Fine Engine:** Vehicles remaining parked past the grace period incur automated hourly fines (₹200/hr) and late payment penalties (₹20/day).
3. **The Hard Block Rule:** Students with outstanding unpaid fines or flagged profiles are strictly blocked (`403 Forbidden`) from booking any slots.
4. **Three Distinct Role Dashboards:**
   - **Student / Driver:** Interactive slot grid, booking modal, active pass with live overstay countdown, fine settlement.
   - **Parking Guard:** Fast plate lookup, QR/tap check-in, check-out confirmation, overstay dispute logging.
   - **Administrator:** Campus-wide multi-lot metrics, virtual clock speed control (1x, 5x, 60x, custom time jumps), fine engine logs, lot manager.
5. **Real-Time Synchronization:** WebSockets deliver instantaneous updates across all active clients for slot status changes, clock ticks, and fine alerts.

---

# 2. Business Rules & The Fine Engine

### 2.1 Daily Shift Schedule & Grace Periods
- **Shift 1 (Morning):** `09:00` to `12:30`
  - *Grace Period:* 15 minutes (until `12:45`).
- **Midday Closure:** `12:30` to `14:00` (Lot closed; no entry, no new bookings).
- **Shift 2 (Afternoon):** `14:00` to `17:30`
  - *Grace Period:* 15 minutes (until `17:45`).

### 2.2 Fine Calculation Formula
- **Overstay Penalty:** When a parked vehicle stays past `Shift End + Grace Buffer (15 mins)`:
  $$\text{Fine} = \lceil \text{Overstay Duration (hours)} \rceil \times ₹200$$
- **Late Payment Penalty:** Unpaid fines after 7 days accumulate **₹20 per day overdue**.
- **Authority Flagging:** If a student's total unpaid fine reaches or exceeds **₹1,000**, `is_flagged` is set to `True`, triggering administrative review alerts.

### 2.3 The "Hard Block" Policy
- If `unpaid_fine_total > 0` OR `is_flagged == True`:
  - The student CANNOT reserve any parking bay.
  - The UI highlights the slot with a warning badge and disables the reservation action with a direct prompt to the Fines tab.
  - The backend returns `HTTP 403 Forbidden` with a detailed error message and fine breakdown.

### 2.4 The Additive State Rule (Visual Rule)
- Slots that are booked, locked, or closed are **never hidden, blurred, or faded out**.
- State changes are **additive**: physical badge overlays, hazard stripes, or lock icons are layered directly onto the slot tile while keeping slot numbers and metadata readable.

---

# 3. Design System: Industrial Tactile

The UI follows an **Industrial Tactile** aesthetic: physical, utilitarian, and concrete.

### Design Tokens:
- **Background Canvas:** Concrete Light Grey (`#EBEAE5`)
- **Card Background:** Off-White Canvas (`#F7F6F2`)
- **Ink Borders:** Solid 2px Black (`#111111`)
- **Hard Drop Shadows:** Sharp `5px 5px 0px #111111` offset box-shadows on cards, buttons, inputs, modals.
- **Accents:**
  - Available / Active: Olive Green (`#15803D`)
  - Warning / Booked: Signal Amber (`#D97706`)
  - Overstay / Danger / Fine: Overstay Crimson (`#DC2626`)
  - Closed / Locked: Slate Ink (`#334155`)
- **Hazard Stripe Pattern:** Repeating 45° diagonal warning stripes for overstaying vehicles and hard block alerts.
- **Typography:** Modern Sans-Serif (`Inter` / system-ui) for labels + High-density Monospace (`JetBrains Mono`, `Courier`) for Slot IDs, Timestamps, License Plates, Fines, and the Clock.

---

# 4. Data Architecture & Schemas

### Models:
1. **Student / User:**
   - `id`, `name`, `roll_number`, `email`, `vehicle_plate`, `phone_number`, `unpaid_fine_total`, `is_flagged`, `role` (`student`, `guard`, `admin`), `password_hash`.
2. **Lot:**
   - `id`, `name` (e.g. "Lot A - North Wing"), `location`, `total_slots`, `is_active`.
3. **ParkingSlot:**
   - `id`, `lot_id`, `slot_number` (e.g. "A-01", "A-02"), `slot_type` (`car`, `bike`, `ev`, `handicap`), `status` (`AVAILABLE`, `BOOKED`, `PARKED`, `OVERSTAY`, `CLOSED`, `MAINTENANCE`), `current_booking_id`.
4. **Booking:**
   - `id`, `student_id`, `slot_id`, `shift` (`SHIFT_1`, `SHIFT_2`), `status` (`booked`, `parked`, `completed`, `cancelled`, `overstay`), `vehicle_plate`, `booked_at`, `parked_at`, `left_at`, `expected_exit_at`, `fine_amount`.
5. **Fine:**
   - `id`, `booking_id`, `student_id`, `amount`, `reason` (`OVERSTAY`, `LATE_FEE`, `UNAUTHORIZED_PARKING`), `status` (`unpaid`, `paid`), `issued_at`, `paid_at`, `days_overdue`.
6. **SystemLog / AuditLog:**
   - `id`, `timestamp`, `actor_id`, `actor_role`, `action`, `details_json`.

---

# 5. PROMPT 1: Build the Complete Frontend

```markdown
You are an expert Senior Full-Stack React Engineer and UI/UX Designer.
Please build the complete, production-ready FRONTEND for the "Campus Parking Slot Management System (PLMS)".

### Tech Stack:
- React 18 (Vite)
- Tailwind CSS with custom Industrial Tactile styling
- Zustand for modular state management
- Lucide React for icons
- React Router v6 for navigation
- Native WebSocket client with auto-reconnect

---

### UI/UX Design System: "Industrial Tactile"
1. Theme: Utilitarian, concrete campus physical aesthetic.
   - Background: #EBEAE5
   - Card/Surface: #F7F6F2
   - Ink Borders: 2px solid #111111
   - Hard Shadows: 5px 5px 0px #111111 (on interactive cards, buttons, modals, badges)
   - Accent colors:
     - Available: #15803D (Olive Green)
     - Booked/Pending: #D97706 (Amber)
     - Overstay/Fine/Danger: #DC2626 (Crimson)
     - Monospace font for Slot IDs, License Plates, Clock, and Currency (₹).
2. Additive State Rule: Never reduce opacity or hide unavailable slots. Always overlay physical badges, hazard stripes, or lock stamps onto the slot tile.
3. Live Hazard Animation: Pulsing border and diagonal hazard stripes for overstaying slots.

---

### Required File & Directory Structure:
```
frontend/
├── package.json
├── vite.config.js
├── tailwind.config.js
├── index.html
├── src/
│   ├── main.jsx
│   ├── App.jsx
│   ├── index.css
│   ├── config.js
│   ├── components/
│   │   ├── ui/
│   │   │   ├── primitives.jsx (Button, Card, Badge, Modal, Input, Select, HazardBanner, MetricCard, ClockDisplay, etc.)
│   │   │   ├── statusTokens.js (Status definitions & badge configs)
│   │   │   └── index.js
│   │   ├── AppShell.jsx (Header, Virtual Clock Bar, Navigation, Live Connection Indicator, Toast container)
│   │   └── RequireAuth.jsx (Route guard with role-based checks)
│   ├── store/
│   │   ├── authStore.js (JWT, current user, role, quick-login switch)
│   │   ├── clockStore.js (Virtual clock state, server sync offset, tick loop, speed multiplier)
│   │   ├── connectionStore.js (WebSocket connection status)
│   │   └── notificationStore.js (Toast alerts & system messages)
│   ├── services/
│   │   ├── api.js (Axios or fetch wrapper with JWT interceptor and mock fallbacks)
│   │   └── websocket.js (WebSocket subscription manager)
│   ├── hooks/
│   │   └── useWebSocket.js
│   └── pages/
│       ├── LoginPage.jsx (Multi-mode login + Quick Select demo role switchers)
│       ├── StudentDashboard.jsx (Interactive Lot Grid, Slot Filter, Reservation Modal, Active Pass, Fine Notification)
│       ├── GuardDashboard.jsx (Plate Scanner/Input, Quick Check-in/Check-out, Overstay Warning List)
│       ├── AdminDashboard.jsx (Campus Overview, Virtual Clock Controls, Shift Manager, System Audit Logs)
│       └── FinesPage.jsx (Outstanding fines list, ₹20/day overdue calculator, Pay Now simulation)
```

---

### Detailed Page & Feature Requirements:

#### 1. AppShell & Virtual Clock Header
- Displays the **Live Virtual Clock** prominently in Monospace format (`HH:MM:SS | Shift 1 / Shift 2 / Midday Closure`).
- Shows WebSocket connection status pill (`CONNECTED`, `RECONNECTING`, `OFFLINE`).
- Shows current logged-in user profile, role badge, and instant Logout.
- In Admin mode, reveals Clock Speed multipliers (1x, 5x, 60x, or Step +30m).

#### 2. Login Page (`LoginPage.jsx`)
- Professional Industrial login form (Roll No / Email + Password).
- **Quick Demo Switcher Buttons**: One-click login as:
  - "Demo Student (Good Standing)"
  - "Demo Student (Has Unpaid Fines - Hard Blocked)"
  - "Demo Guard (Lot A Gate)"
  - "Demo Campus Admin"

#### 3. Student Dashboard (`StudentDashboard.jsx`)
- **Lot & Slot Map Grid**:
  - Filter by Lot (Lot A, Lot B, Lot C) and Slot Type (Car, Bike, EV).
  - Slot Tiles display Slot Number, Type icon, Status Token, and live time remaining.
  - Clicking an AVAILABLE slot opens the **Reservation Modal**.
  - If the student has unpaid fines (`unpaid_fine_total > 0`), clicking ANY slot triggers the **Hard Block Modal** stating: *"Reservation Blocked: You have ₹X in unpaid fines. Clear dues to unlock."*
- **Active Booking Pass Widget**:
  - Displays currently booked/parked slot, vehicle plate, shift time, and dynamic overstay countdown.
  - If overstaying, shows crimson hazard stripes and live accumulated fine counter.

#### 4. Guard Dashboard (`GuardDashboard.jsx`)
- **Fast Vehicle Processing Bar**: Enter/Scan vehicle plate number to quickly check in or check out.
- **Lot Bay Grid**: Guard-focused interactive grid with direct "Mark Parked" and "Mark Departed" actions.
- **Active Overstay Alerts Queue**: List of vehicles past their 15-minute grace period with direct "Report/Fine" button.

#### 5. Admin Dashboard (`AdminDashboard.jsx`)
- **Metric Cards**: Total Slots, Occupied Bays, Overstay Anomalies, Total Fines Collected, Flagged Students.
- **Virtual Time Controller**: Fast-forward time, set specific hour, toggle automatic shift transitions.
- **Live System Audit Log**: Real-time stream of booking, check-in, overstay, and fine events.

#### 6. Fines & Compliance Page (`FinesPage.jsx`)
- Shows itemized fine ledger with overstay duration, hourly breakdown (₹200/hr), and late fee penalties (₹20/day past 7 days).
- Interactive "Pay Fine (Demo Simulation)" button that immediately clears dues and removes the Hard Block.

---

### Standalone Capabilities:
- Provide rich mock data and local state fallbacks inside `services/api.js` and `services/websocket.js` so the frontend is 100% interactive and functional even before the backend is booted!
- Output clean, complete code for every file. Do not use placeholders or omit functions.
```

---

# 6. PROMPT 2: Build the Complete Backend

```markdown
You are an expert Senior Python & FastAPI Backend Architect.
Please build the complete, production-ready BACKEND for the "Campus Parking Slot Management System (PLMS)".

### Tech Stack:
- Python 3.10+
- FastAPI (Async REST API & WebSockets)
- SQLAlchemy (Async / Sync ORM with SQLite or PostgreSQL)
- Pydantic v2 for data validation
- PyJWT & Passlib (Bcrypt) for JWT Authentication
- Uvicorn for ASGI server

---

### Required Directory Structure:
```
backend/
├── requirements.txt
├── .env.example
├── app/
│   ├── __init__.py
│   ├── main.py (FastAPI application, CORS, WebSocket endpoint, router aggregation)
│   ├── config.py (Pydantic Settings, JWT secret, fine rates, shift timings)
│   ├── database.py (SQLAlchemy engine, session factory, get_db dependency)
│   ├── models.py (SQLAlchemy ORM models: User, Lot, ParkingSlot, Booking, Fine, SystemLog)
│   ├── schemas.py (Pydantic request & response models)
│   ├── auth.py (Password hashing, JWT token creation, get_current_user dependency)
│   ├── clock.py (Virtual Clock state engine, shift resolver, time multiplier)
│   ├── fine_engine.py (Overstay math, late fee calculation, flagging logic, auto-fine generator)
│   ├── realtime.py (WebSocket ConnectionManager, broadcast channel for slot/clock/fine updates)
│   ├── background.py (Periodic tick worker for clock sync, overstay sweeps, auto-fine commits)
│   ├── seed.py (Database seeder populating test students, guards, admins, 3 lots, 60 slots)
│   └── routers/
│       ├── __init__.py
│       ├── auth.py (Login, register, /me, quick demo login endpoints)
│       ├── student.py (Browse slots, reserve slot [with Hard Block enforcement], view active pass, pay fine)
│       ├── guard.py (Lookup plate, mark parked, mark departed, report overstay)
│       ├── admin.py (Campus metrics, lot management, audit log, flagged users list)
│       └── clock.py (Get virtual time, advance time, set speed multiplier, reset clock)
```

---

### Key Business Logic & Implementation Details:

#### 1. Virtual Clock Engine (`app/clock.py` & `app/background.py`)
- Maintains a global `virtual_now` timestamp in memory/database.
- Supports speed multipliers (1x, 5x, 60x) and direct time jump endpoints (`POST /api/clock/jump`).
- Categorizes current time into:
  - `SHIFT_1` (09:00 - 12:30, grace until 12:45)
  - `MIDDAY_CLOSED` (12:30 - 14:00)
  - `SHIFT_2` (14:00 - 17:30, grace until 17:45)
  - `OFF_HOURS` (17:30 - 09:00 next day)
- Background task sweeps active bookings every few seconds:
  - If current virtual time > `shift_end + 15 mins` and vehicle is still `parked`, marks booking as `overstay` and computes the Fine.
  - Broadcasts `SLOT_UPDATED` and `FINE_ISSUED` via WebSocket.

#### 2. Fine Engine (`app/fine_engine.py`)
- **Overstay Fine:** `ceil(overstay_seconds / 3600) * 200` (₹200/hr).
- **Late Payment Penalty:** If fine created > 7 virtual days ago and status == `unpaid`, adds `days_overdue * 20` (₹20/day).
- **Flagging Rule:** If student's total unpaid fine >= ₹1,000, updates `student.is_flagged = True`.
- **Payment Settlement:** `POST /api/student/fines/{fine_id}/pay` marks fine as `paid`, updates student's `unpaid_fine_total`, and clears `is_flagged` if balance is zero.

#### 3. Hard Block Enforcement (`app/routers/student.py`)
- When `POST /api/student/reserve` is called:
  1. Check if `student.unpaid_fine_total > 0` or `student.is_flagged == True`.
  2. If true, abort immediately with `HTTP 403 Forbidden`:
     `{"detail": "HARD_BLOCK: Outstanding unpaid fines of ₹X must be cleared before booking."}`
  3. Check if slot is `AVAILABLE` and current time is within an active shift.
  4. Create `Booking` in `booked` status, update `slot.status = 'BOOKED'`, and broadcast WebSocket update.

#### 4. Real-Time WebSockets (`app/realtime.py` & `app/main.py`)
- Endpoint: `/ws/live`
- Broadcasts JSON payloads:
  - `{"type": "SLOT_UPDATED", "slot_id": 5, "status": "PARKED", "booking_id": 12}`
  - `{"type": "CLOCK_TICK", "virtual_time": "2026-09-17T10:15:00", "shift": "SHIFT_1", "speed": 1}`
  - `{"type": "FINE_ISSUED", "student_id": 2, "amount": 400, "reason": "OVERSTAY"}`

#### 5. Database Seeder (`app/seed.py`)
- Pre-seeds:
  - **Lots:** Lot A (Main Academic, 20 slots), Lot B (Engineering, 20 slots), Lot C (Sports Complex, 20 slots).
  - **Slots:** Mix of `car`, `bike`, and `ev` slots.
  - **Users:**
    - `admin@campus.edu` (Role: `admin`)
    - `guard.lota@campus.edu` (Role: `guard`)
    - `student.good@campus.edu` (Role: `student`, 0 fines)
    - `student.fined@campus.edu` (Role: `student`, ₹400 unpaid fine for demonstration)
    - `student.flagged@campus.edu` (Role: `student`, ₹1,200 fine, `is_flagged = True`)

---

### Output Requirements:
- Write clean, complete, fully working code for all backend files.
- Ensure all imports, CORS settings, database session lifecycles, and error handlers are production grade.
```

---

# 7. Step-by-Step Execution & Verification Guide

### How to use these prompts in GLM 5.3:

1. **Step 1 (Frontend):**
   - Copy the entire markdown block under **[PROMPT 1: Build the Complete Frontend](#5-prompt-1-build-the-complete-frontend)**.
   - Paste it into GLM 5.3.
   - Review and save the generated files into the `frontend/` directory.
   - Run `npm install` and `npm run dev` to verify the UI.

2. **Step 2 (Backend):**
   - Copy the entire markdown block under **[PROMPT 2: Build the Complete Backend](#6-prompt-2-build-the-complete-backend)**.
   - Paste it into GLM 5.3.
   - Review and save the generated files into the `backend/` directory.
   - Run:
     ```bash
     cd backend
     python -m venv venv
     source venv/bin/activate  # or venv\Scripts\activate on Windows
     pip install -r requirements.txt
     python -m app.seed
     uvicorn app.main:app --reload --port 8000
     ```

3. **Step 3 (End-to-End Verification):**
   - Log in as **Demo Student (Good Standing)** $\rightarrow$ Book a slot $\rightarrow$ Verify slot turns `BOOKED` instantly.
   - Advance the Virtual Clock past `12:45` in the Admin Dashboard $\rightarrow$ Verify the Fine Engine triggers an overstay fine.
   - Log in as **Demo Student (Has Unpaid Fines)** $\rightarrow$ Verify Hard Block modal triggers when attempting to book.
   - Pay the fine $\rightarrow$ Verify the hard block lifts immediately.
