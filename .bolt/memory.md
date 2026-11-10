# Project memory

## Product intent & audience

- Inventory/operations management app built on Vite + React (JSX, Tailwind CSS, React hooks, Lucide React icons).
- Core domain entities include "operations" with status (`ativa` / `cancelada`) and optional batch tracking (`lote`).
- Supports create, edit, and delete (cancel) of operations; deletion affects stock/devolution balances.
- End users interact with operations lists and inventory (estoque) state.

## Brand personality & voice

- Communication with the user is in Brazilian Portuguese; technical terms like "lote", "estoque", "devolução", "operação" are domain vocabulary, not to be translated in UI copy.

## Visual design & UX direction

- UI uses Tailwind CSS utility classes; icons via `lucide-react`.
- Operations list likely needs a visible "cancelada" status marker vs. removal from list (unresolved).
- Production-quality, distinctive UI is expected (not generic templates).

## Decisions, constraints & rationale

- **Hard constraint from user:** do not modify the database at this stage. App-side code must not be patched as a workaround that leaves inventory inconsistent.
- Current state: no code or DB changes applied in the last turn.
- Root cause of broken delete: the DB delete/cancel function conflates the status field with an identifiers field; create and edit paths are correct and must remain untouched.
- Proposed (pending approval) fix: single adjustment to the delete function to separate status from identifiers; non-destructive, no data deletion.

## Open questions & assumptions

- **Awaiting user approval:** is the one-time DB function adjustment approved? No DB change without explicit "sim".
- **UX decision pending:** should cancelled operations remain visible in the list marked "cancelada", or be hidden?
- Assumption: after the fix, tests will cover create + delete for operations both with and without `lote`.