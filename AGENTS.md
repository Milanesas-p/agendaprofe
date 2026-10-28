## Application architecture

- Mount the shared app shell and store in the root route so all three content pages share navigation and data.
- Persist students, lessons and court settings in the database with owner-scoped access; never use browser storage as the authoritative data store.
- Keep attendance credit accounting atomic, preventing double deductions and lost updates.
- Keep the reusable sheet outside leaf routes so other pages do not import route modules.
- Use the shared Radix-backed sheet for focus trapping, Escape dismissal and scroll locking.
- Return mutation success from the shared store and close editors only after successful persistence; edit student details without writing their credit balance.
- Keep date navigation and name matching in browser-safe helpers; initialize the current local date after hydration to avoid server/client timezone mismatches.
- Student creation returns its generated ID; combined student/booking editors retain that ID on booking failure so retrying cannot create duplicate students.
