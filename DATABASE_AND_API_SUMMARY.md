# Armoraa Clinic - Database Connection & API Summary

---

## 1. DATABASE CONNECTION

### Connection Type
**Supabase (PostgreSQL-based Backend-as-a-Service)**

### Configuration
- **Client Library**: `@supabase/supabase-js` (v2.110.0)
- **Configuration File**: [src/config/supabase.js](src/config/supabase.js)
- **Environment Variables Required**:
  - `VITE_SUPABASE_URL` - Supabase project URL
  - `VITE_SUPABASE_ANON_KEY` - Anonymous/Public key for API access

### Local Development Setup
- **Supabase CLI Config**: [supabase/config.toml](supabase/config.toml)
- **API Port**: 54321
- **Database Port**: 54322
- **Studio Port**: 54323
- **Database Version**: PostgreSQL 17

### Connection Code
```javascript
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(supabaseUrl, supabaseKey);
```

---

## 2. DATABASE SCHEMA

### Core Tables (13+ tables)

#### User Management
1. **users** - Application users with roles (Manager, Case Manager, Pharmacist, MIS)
2. **profiles** - Linked to Supabase Auth, stores email and full_name
3. **user_sessions** - Session tracking with IP, device, token, and activity status
4. **branches** - Clinic branches/locations

#### Master Data (Organizational)
5. **master_doctors** - Doctor information per branch
6. **master_staff** - Staff members per branch
7. **master_services** - Medical services offered per branch
8. **master_machinery** - Equipment/machinery per service and branch

#### Consumables Management
9. **master_billable_consumables** - Products charged to patients
10. **master_non_billable_consumables** - Internal/operational supplies
11. **master_consumables** - Legacy consumable master list
12. **service_consumables** - Mapping between services and required consumables

#### Stock Management
13. **stock_inventory** - Current stock levels, movements (Inward/Outward/Adjustment/Transfer)

### Key Features
- **Multi-branch support** - Each data record tied to `branch_id`
- **Soft deletes** - `deleted_at` and `deleted_by` fields for audit trails
- **Timestamps** - All tables have `created_at` and `updated_at`
- **Status tracking** - Active/Inactive status for most entities
- **Audit fields** - `created_by` and `deleted_by` for accountability

---

## 3. API ARCHITECTURE

### HTTP Client Layer
**File**: [src/services/httpClient.js](src/services/httpClient.js)

#### Features:
- **Axios-based** HTTP client with automatic retry logic
- **503 Error Handling**: Exponential backoff retry (up to 3 attempts)
- **Retry-After Header Support**: Honors server-provided retry delays
- **Fallback Mechanism**: Falls back to mock data when server is unavailable

#### Configuration:
```javascript
const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 1000; // 1 second
// Exponential backoff: 1s, 2s, 4s, 8s...
```

### API Services

#### 1. Consumables API
**File**: [src/services/consumablesApi.js](src/services/consumablesApi.js)

**Endpoints**:
- `GET /billable-consumables` - Fetch all billable consumables
- `GET /billable-consumables/:id` - Fetch single consumable
- `POST /billable-consumables` - Create consumable
- `PUT /billable-consumables/:id` - Update consumable
- `DELETE /billable-consumables/:id` - Delete consumable

**Mock Data Fallback**: Includes predefined mock consumables for development/offline mode

#### 2. Stock API
**File**: [src/services/stockApi.js](src/services/stockApi.js)

**Endpoints**:
- `getStock(productType, consumableId, branchId)` - Get current stock for a product
- `getBranchStock(branchId)` - Get all stock for a branch
- Update stock operations (Inward/Outward/Adjustment/Transfer)

**Data Source**: Queries `stock_inventory` table from Supabase

#### 3. Session API
**File**: [src/services/sessionApi.js](src/services/sessionApi.js)

**Operations**:
- `getCurrentSession()` - Get active session from localStorage + DB
- `checkActiveSession(userId)` - Detect concurrent logins
- `createSession(userId, ipAddress, deviceInfo)` - Start new session
- Session tokens: `sess_${timestamp}_${random}`

**Data Source**: `user_sessions` table in Supabase

#### 4. Authentication
**File**: [src/hooks/useAuth.js](src/hooks/useAuth.js)

**Features**:
- Multi-branch support (user can switch branches)
- Profile lookup by email or user_id
- Session-based authentication
- Branch context management

---

## 4. DATA TRANSFER & FLOW

### Request-Response Cycle

```
User Action (React Component)
    ↓
Hook (useConsumables, useAuth, etc.)
    ↓
API Service (consumablesApi.js, stockApi.js, etc.)
    ↓
HTTP Client (Retry Logic)
    ↓
Supabase Client (JS SDK)
    ↓
PostgreSQL Database (Remote or Local)
    ↓
Response (JSON) → Mock Fallback if error
    ↓
React State Update
    ↓
UI Re-render
```

### Data Transfer Patterns

#### 1. **Billable Consumables Flow**
```
BillableConsumables.jsx
  ├─ useConsumables Hook
  │  ├─ getConsumables() → /billable-consumables
  │  ├─ createConsumable(payload) → POST /billable-consumables
  │  ├─ updateConsumable(id, payload) → PUT /billable-consumables/:id
  │  └─ deleteConsumable(id) → DELETE /billable-consumables/:id
  └─ State: [consumables, selectedConsumable, filters, pagination]
```

#### 2. **Stock Management Flow**
```
StockManagement.jsx
  ├─ Supabase Query (Real-time if enabled)
  │  ├─ getStock() → Fetch from stock_inventory
  │  ├─ getBranchStock(branchId) → Fetch all for branch
  │  └─ updateStock() → Inward/Outward/Transfer operations
  └─ Retry logic on network failures
```

#### 3. **Authentication Flow**
```
Login
  ├─ useAuth Hook
  │  ├─ Login with branch + credentials
  │  ├─ Query profiles table
  │  ├─ Validate in user_sessions
  │  ├─ Create session token
  │  └─ Store in localStorage
  └─ Check active session on app load
```

#### 4. **Session Tracking**
```
User Activity
  ├─ IP Address captured
  ├─ Device Info captured (User-Agent)
  ├─ Session Token stored
  ├─ Login/Logout times recorded
  └─ Concurrent session detection
```

---

## 5. WHY THIS DATA TRANSFER ARCHITECTURE?

### 1. **Supabase as Backend**
- **Reason**: Reduces backend development overhead
- **Benefits**:
  - Built-in PostgreSQL database
  - Real-time subscriptions (Realtime API)
  - Authentication/Authorization (Auth module)
  - Row-level security (RLS) for multi-tenancy
  - RESTful API auto-generated from schema

### 2. **Retry Logic with Exponential Backoff**
- **Reason**: Handle transient network failures gracefully
- **Benefits**:
  - Auto-recovery from temporary service disruptions
  - Prevents cascading failures
  - Respects server load via Retry-After header

### 3. **Mock Data Fallback**
- **Reason**: Enable offline functionality and development
- **Benefits**:
  - App remains functional without server
  - Faster development/testing cycles
  - Demo-ready without production data
  - Graceful degradation for users

### 4. **Multi-Branch Architecture**
- **Reason**: Support multiple clinic locations
- **Benefits**:
  - Data isolation per branch
  - Branch-specific reporting
  - Easy scalability to multiple clinics
  - Branch switching for multi-location staff

### 5. **Session Tracking**
- **Reason**: Audit, security, and concurrent login detection
- **Benefits**:
  - Compliance tracking (who logged in when)
  - Security: Detect unauthorized access
  - Device/IP logging for forensics
  - Prevent concurrent logins (single session per user)

### 6. **Separation of Concerns**
- **API Services Layer** - Handles specific domain logic
- **HTTP Client Layer** - Handles retry, error recovery, resilience
- **Hooks Layer** - Handles state management and React integration
- **UI Components** - Pure presentation logic
- **Benefits**:
  - Maintainability
  - Testability
  - Reusability
  - Easy API endpoint changes

---

## 6. DATA MODELS

### Consumable Object
```javascript
{
  id: string,
  name: string,
  category: string,
  type: string,
  description: string,
  unitPrice: number,
  stock: number,
  service: string,
  status: 'active' | 'out_of_stock',
  createdBy: string,
  createdAt: ISO8601 timestamp,
  updatedAt: ISO8601 timestamp
}
```

### Stock Inventory Object
```javascript
{
  id: number,
  product_type: 'Billable' | 'Non-Billable',
  consumable_id: number,
  branch_id: number,
  quantity: number,
  movement_type: 'Inward' | 'Outward' | 'Adjustment' | 'Transfer',
  updated_at: timestamp
}
```

### User Session Object
```javascript
{
  id: number,
  user_id: number,
  session_token: string,
  login_time: timestamp,
  logout_time: timestamp,
  ip_address: string,
  device_info: string,
  is_active: boolean
}
```

---

## 7. DEPENDENCIES

### Core
- `@supabase/supabase-js` ^2.110.0 - Database & Auth
- `axios` ^1.4.0 - HTTP Client
- `react` ^19.2.7 - UI Framework

### Supporting
- `react-router-dom` ^7.18.1 - Routing
- `date-fns` ^4.4.0 - Date utilities
- `apexcharts`, `react-apexcharts` - Charting
- `xlsx`, `papaparse` - Data export/import
- `jspdf` - PDF generation
- `framer-motion` - Animations

---

## 8. ENVIRONMENT SETUP

### .env file required:
```
VITE_SUPABASE_URL=https://[project-id].supabase.co
VITE_SUPABASE_ANON_KEY=[your-anon-key]
```

### Run locally:
```bash
npm install
npm run dev           # Starts React dev server (Vite)
supabase start       # Starts local Supabase
```

### Build for production:
```bash
npm run build
npm run preview
```

---

## 9. KEY INSIGHTS

| Aspect | Implementation | Reason |
|--------|-----------------|--------|
| **Database** | Supabase (PostgreSQL) | Managed backend, built-in APIs, auth |
| **API Pattern** | Service Layer + Hooks | Clean separation, reusable, testable |
| **Error Handling** | Retry + Fallback | Resilient, offline-capable |
| **Multi-tenancy** | Branch-based isolation | Scalable to multiple locations |
| **State Management** | React Hooks | Lightweight, built-in to React 19 |
| **HTTP Client** | Axios with interceptors | Robust, retry logic, standardized |
| **Authentication** | Session tokens + profiles | Flexible, audit-trail capable |
| **Data Validation** | DB constraints + app-level | Defense in depth |

---

## Summary

This is a **multi-branch clinic management system** built with:
- **Frontend**: React 19 + Vite + TailwindCSS
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Data Flow**: Service → Hook → Component → UI
- **Resilience**: Automatic retry, mock fallback, session management
- **Scale**: Multi-branch support with branch-specific data isolation

The architecture prioritizes **reliability** (retry logic), **usability** (offline support), **security** (session tracking), and **maintainability** (layered architecture).
