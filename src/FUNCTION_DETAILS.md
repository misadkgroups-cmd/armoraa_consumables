# Armoraa Clinic Function Details

## Purpose

This document is the implementation map for the Armoraa Clinic application. Any developer or AI agent modifying the project should read this file before changing code. It describes the application structure, ownership of behavior, end-to-end workflows, database contracts, and known risks.

This is a React 19 + Vite single-page application using Supabase directly from the browser.

## Application Entry Flow

```text
index.html
  -> src/main.jsx
  -> src/App.jsx
  -> BranchProvider
  -> AppContent
      -> Welcome when unauthenticated
      -> Dashboard when authenticated
          -> active page component
```

### Startup Files

- `src/main.jsx`: React root, StrictMode, global stylesheet import.
- `src/App.jsx`: authentication gate, page state, manual URL synchronization, browser history handling, logout, session validation.
- `src/context/BranchContext.jsx`: branch, MIS mode, user identity, localStorage persistence, session validation, heartbeat.
- `src/pages/Dashboard.jsx`: shell layout, sidebar navigation, notification bell, page switch dispatch.
- `src/config/supabase.js`: Supabase client created from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

## Manual Navigation

Navigation is controlled by `currentPage` in `src/App.jsx`; `react-router-dom` is installed but is not currently used.

| Page ID | URL | Component |
|---|---|---|
| `overview` | `/` | `Overview.jsx` |
| `billing-log` | `/billing-log` | `BillingLog.jsx` |
| `all-bills` | `/billing-log/all-bills` | `AllBills.jsx` |
| `billable` | `/billable-consumables` | `BillableConsumables.jsx` |
| `non-billable` | `/non-billable-consumables` | `NonBillableConsumables.jsx` |
| `stock-management` | `/stock-management` | `StockManagement.jsx` |
| `reports` | `/reports` | `Reports.jsx` |
| `customization` | `/customization` | `Customization.jsx` |
| `doctors-master` | `/masters/doctors` | `DoctorsMaster.jsx` |
| `staff-master` | `/masters/staff` | `StaffMaster.jsx` |

### Navigation Contract

- Child pages call `onNavigate(page, state)`.
- `App.jsx` stores state in `urlState` and writes query parameters with `history.pushState`.
- `BillableConsumables.jsx` listens for both `popstate` and the custom `pushstate` event.
- Billing pages use query parameters such as `bill_no`, `billing_log_id`, `bill_service_id`, `service_id`, and `service_name`.

### Navigation Risk

The initial browser pathname is not used to initialize `currentPage`. Directly opening a non-root route can initially render Overview and may be rewritten to `/`. Any routing change must preserve billing query-state behavior.

## Authentication and Session Flow

### Branch Login

Implemented primarily in `src/pages/Welcome.jsx`:

1. Fetch active user by username from `users`.
2. Compare entered password with `users.password_hash` in the browser.
3. Check `user_sessions` for an active session.
4. If another session exists, show the concurrent-login confirmation modal.
5. Create a new session through `sessionApi.createSession`.
6. Store user, role, branch, and session values in `localStorage`.
7. Call `onBranchSelect`, which updates `BranchContext`.

### MIS Login

1. Open the MIS password modal.
2. Load `system_settings.mis_password` if available.
3. Fall back to `VITE_MASTER_PASSWORD`, then a hardcoded fallback.
4. Store `misMode=true` and a `mis_direct_*` session token.
5. Reload the page.
6. MIS can access the customization page and switch branches.

### Session Services

`src/services/sessionApi.js` owns:

- `createSession`
- `validateSession`
- `getCurrentSession`
- `checkActiveSession`
- `endSession`
- `logoutConcurrentUser`
- `startHeartbeat`
- `updateHeartbeat`
- `clearHeartbeat`

### Session Storage Keys

- `branchAuthenticated`
- `branchId`
- `branchName`
- `misMode`
- `userId`
- `username`
- `userRole`
- `sessionToken`
- `sessionLoginTime`
- `selectedBranch`

### Authentication Risks

- Password verification is client-side.
- `password_hash` is queried into the browser.
- Browser localStorage values are user-editable and must not be treated as authorization.
- MIS credentials may be exposed through frontend configuration.
- Session and authorization logic is duplicated between `App.jsx`, `BranchContext.jsx`, and `Welcome.jsx`.
- Database RLS must enforce security independently of the UI.

## Shared Components

### `BranchSwitcher.jsx`

Visible only in MIS mode. Loads all branches and calls `updateBranch` without leaving MIS mode.

### `NotificationBell.jsx`

- Polls incoming stock transfers every 30 seconds.
- Displays pending transfer notifications.
- Allows branch users to confirm receipt.
- Checks concurrent-session invalidation.
- Calls stock transfer functions from `stockApi.js`.

### `SearchableDropdown.jsx`

Reusable searchable keyboard-accessible dropdown. Supports:

- Filtering
- Arrow navigation
- Enter selection
- Escape close
- Clear button
- Disabled and required states

### Audit Components

- `AuditTimelineModal.jsx`: displays per-bill lifecycle history.
- `BillDetailsModal.jsx`: displays bill/service/consumable details.

## Page Responsibilities

### `Overview.jsx`

Dashboard metrics and charts.

Reads:

- `billable_report`
- `billing_log`
- `bill_services`
- `master_services`
- `master_machinery`
- `master_billable_consumables`
- `non_billable_consumable_registry`

Provides:

- Date range filters
- KPI counters
- Service and machinery charts
- Billable and non-billable usage summaries
- Completion statistics

Some fallback and sparkline values are simulated when data is missing. Inventory health is currently calculated from usage data rather than authoritative stock values.

### `BillingLog.jsx`

Creates and edits the bill header and service rows.

Create flow:

1. Validate bill number, patient name, date, and services.
2. Insert one `billing_log` row.
3. Insert one `bill_services` row per selected service.
4. Write `activity_logs`, `bill_history`, and `audit_logs` entries.
5. Refresh the bill list.

Edit flow:

1. Update the `billing_log` row.
2. Delete existing `bill_services` rows.
3. Recreate service rows as pending.
4. Write audit records.

Bill status is derived from `bill_services.consumable_completed`, not trusted exclusively from `billing_log.bill_status`.

### `AllBills.jsx`

Detailed bill list and bill lifecycle actions.

Provides:

- Date and status filtering
- View bill details
- View audit history
- Edit bill headers
- Navigate to service consumables
- Delete bills

The consumables navigation passes:

- `bill_no`
- `uid`
- `service_date`
- `billing_log_id`
- `bill_service_id`
- `service_id`
- `service_name`

### `BillableConsumables.jsx`

Records consumables for one bill service.

Workflow:

1. Load service context from URL query parameters.
2. Load active billable products.
3. Load active non-billable registry batches.
4. Load available billable stock.
5. Allow billable quantities and non-billable batch selection.
6. Build the wide report payload with `prepareSavePayload`.
7. Insert or update `billable_report`.
8. Synchronize `bill_service_consumables` for the selected service.
9. Synchronize `billable_report_consumables`.
10. Mark `bill_services` complete.
11. Recalculate `billing_log.bill_status`.
12. Write audit/history records.
13. Deduct or reconcile billable stock.
14. Set `forceRefreshBills` and navigate back to the detailed log.

Important data rule:

- Billable items use `consumable_X_id` and numeric units.
- Non-billable items use `non_billable_registry_id_X`, batch ID, `is_non_billable_X=true`, and units represented as `1` in database report rows or `USED` in UI state.
- Maximum report slots: 14.

### `NonBillableConsumables.jsx`

Manages non-billable registry batches.

Provides:

- Register batch
- Edit batch
- Mark batch complete
- Reopen batch
- Delete unused batch
- Show usage counts

Register flow:

1. Select an active non-billable master product.
2. Enter a unique batch ID.
3. Insert `non_billable_consumable_registry`.
4. Database trigger deducts one unit from `non_billable_stock`.
5. Client writes an Outward `stock_transactions` row.

### `StockManagement.jsx`

Manages:

- Branch billable stock
- Branch non-billable stock
- Corporate warehouse stock
- Inward stock
- Manual adjustment
- Corporate transfer requests
- Transfer history
- Consumed/usage history

Uses `stockApi.js` for branch stock, transfers, history, and corporate operations.

### `Reports.jsx`

Generates:

- Billable bill-wise reports
- Billable service-wise reports
- Non-billable detailed reports
- Non-billable summary reports

Supports:

- Date filters
- Branch filters
- Service filters
- Machinery filters
- CSV export
- Excel export

Billable report hydration resolves branch, service, machinery, doctor, staff, and consumable labels through follow-up queries.

### `Customization.jsx`

Manages:

- General settings UI
- Billable consumable masters
- Non-billable consumable masters
- Services
- Machinery
- Service/machinery mappings

Most changes are direct Supabase CRUD operations. Some billable changes write audit records.

### `DoctorsMaster.jsx` and `StaffMaster.jsx`

Branch-specific master CRUD pages with:

- Search
- Branch filter
- Add
- Edit
- Activate/deactivate
- Delete

## Database Model

Primary schema file: `supabase/schema.sql`.

Important tables:

### Identity

- `branches`
- `users`
- `user_sessions`
- `profiles`
- `system_settings`

### Masters

- `master_doctors`
- `master_staff`
- `master_services`
- `master_machinery`
- `master_billable_consumables`
- `master_non_billable_consumables`
- `service_consumables`

### Billing

- `billing_log`: bill header
- `bill_services`: one row per bill service
- `bill_service_consumables`: normalized service-level usage
- `billable_report`: legacy wide report with 14 consumable slots
- `billable_report_consumables`: normalized report-level usage

### Non-billable inventory

- `non_billable_consumable_registry`
- `non_billable_stock`

### Stock

- `billable_stock`
- `stock_inventory`: legacy stock table
- `stock_transactions`
- `corporate_stock`
- `corporate_stock_transactions`
- `stock_transfers`
- `stock_transfer_notifications`

### Audit

- `audit_logs`: record-level old/new JSON data
- `activity_logs`: page-level activity
- `bill_history`: per-bill lifecycle history
- `report_audit_log`

## Stock Source of Truth

Current source-of-truth tables are:

- `billable_stock`
- `non_billable_stock`

`stock_inventory` is legacy and should not be used for new code.

### Database Triggers

`billable_report` insert trigger:

- Loops through 14 report slots.
- Deducts billable units from `billable_stock`.
- Ignores non-billable slots.

`non_billable_consumable_registry` insert trigger:

- Creates a stock row if needed.
- Deducts one unit from `non_billable_stock`.

### Stock Integrity Risks

- Read-then-write updates are not atomic under concurrent users.
- Stock is clamped to zero instead of rejecting an overdraw.
- Report deletion does not automatically restore stock.
- Report updates depend on client-side delta reconciliation.
- Corporate transfer operations are multi-step client operations without a database transaction.
- Stock can be changed by triggers and client writes through different paths.

## Corporate Transfer Workflow

Defined by `supabase/migrations/20260806_add_stock_transfer_workflow.sql`.

1. MIS creates a pending transfer.
2. Corporate stock decreases.
3. `stock_transfers` row is created.
4. `stock_transfer_notifications` row is created.
5. Destination branch sees the notification.
6. Branch confirms receipt.
7. Branch stock increases.
8. Transfer status becomes `Received`.

A failed step can leave partial state because the client performs the operations separately.

## Audit Workflow

### Bill Creation

Writes to:

- `activity_logs`
- `bill_history` with `CREATE`
- `audit_logs` with `CREATE`

### Consumable Update

Writes to:

- `bill_history` with `UPDATE` or consumables field marker
- `audit_logs`
- `stock_transactions`

### Completion

When all bill services are complete:

- `billing_log.bill_status` becomes `Complete`.
- `billing_log.updated_at` is updated.
- `bill_history` receives `STATUS_CHANGE`.
- `activity_logs` receives `status_changed`.

### Audit Deletion Risk

The bill deletion code in `AllBills.jsx` currently deletes all `activity_logs` rows where `page_name='billing_log'`, which can remove unrelated bill activity. Any future deletion change must filter only the selected bill or use a bill-specific audit relationship.

## Migrations

Important migrations include:

- `20250101000001_create_corporate_stock.sql`
- `20260101000000_create_audit_tables.sql`
- `20260107_fix_consumable_completed_validation.sql`
- `20260722_normalize_billable_report.sql`
- `20260723_add_cascade_delete_fks.sql`
- `20260801_create_stock_tables.sql`
- `20260806_add_corporate_stock_location_columns.sql`
- `20260806_add_stock_transfer_workflow.sql`
- `20260807_add_user_sessions_rls_policies.sql`
- `20260818_backfill_bill_audit_logs.sql`

Do not assume `schema.sql` alone contains every object required by the application. Verify migration order before provisioning a new database.

## API and Utility Services

### `src/services/stockApi.js`

Owns stock reads, updates, history, transfers, corporate stock, and transfer notifications.

### `src/services/auditApi.js`

Owns audit/activity reads and writes and bill timeline synthesis.

### `src/services/sessionApi.js`

Owns custom session creation, validation, heartbeat, logout, and concurrent-login handling.

### `src/services/nonBillableReports.js`

Builds detailed and summary non-billable report data.

### `src/utils/billableReportPayload.js`

Converts UI consumable rows into the legacy 14-slot report payload and normalized child-table items.

### `src/utils/supabaseRetry.js`

Retries Supabase 503 errors with exponential backoff: 1s, 2s, and 4s by default.

## Security Rules for Future Changes

- Never trust `localStorage` for authorization.
- Never expose password hashes or master passwords to the browser.
- Enforce branch and role access with Supabase RLS or server-side functions.
- Do not add unrestricted anonymous policies to business tables.
- Use database RPC functions for multi-step billing and stock mutations.
- Validate stock and permissions on the server.
- Avoid permanent deletes for auditable business records unless explicitly required.

## Known Quality Issues

`npm run lint` currently completes with warnings, including:

- Unused imports and variables
- Missing React hook dependencies
- Duplicate JSX props in `Welcome.jsx`
- Unused handlers and stale refresh code
- Fast-refresh warning in `BranchContext.jsx`

`npm run build` succeeds but reports a large JavaScript bundle over 2 MB minified. Page-level lazy loading should be considered.

There are currently no comprehensive unit or end-to-end tests covering the critical billing and stock workflows.

## Required Validation Commands

```powershell
npm run build
npm run lint
```

For database changes, also verify:

1. Migration order on a clean database.
2. RLS behavior as anonymous, authenticated, branch, and MIS users.
3. Billing creation and editing.
4. Consumable save and re-save.
5. Bill completion and reopening.
6. Stock deduction, adjustment, deletion, and rollback.
7. Corporate transfer request and branch receipt.
8. Audit timeline ordering and deletion behavior.

## Recommended Change Priority

1. Replace custom browser-side password authentication with Supabase Auth or a secure backend.
2. Add authoritative RLS policies for every business table.
3. Move billing and stock mutations into transactional database functions.
4. Fix direct URL route initialization.
5. Fix audit deletion scope.
6. Make one consumable data model authoritative.
7. Prevent silent stock underflow.
8. Add automated workflow tests.
9. Split page bundles with lazy loading.
10. Clean lint warnings and consolidate duplicated UI helpers.
