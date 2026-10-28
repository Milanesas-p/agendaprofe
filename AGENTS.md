<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Application architecture
- Mount the shared app shell and store in the root route so all three content pages share navigation and data.
- Persist students, lessons and court settings in Cloud with owner-scoped RLS; never use browser storage as the authoritative data store.
- Keep attendance credit accounting in the database trigger and manual balance adjustments atomic, preventing double deductions and lost updates.
- Keep the reusable sheet outside leaf routes so other pages do not import route modules.
- Use the shared Radix-backed sheet for focus trapping, Escape dismissal and scroll locking.
- Return mutation success from the shared store and close editors only after successful persistence; edit student details without writing their credit balance.
- Keep date navigation and name matching in browser-safe helpers; initialize the current local date after hydration to avoid server/client timezone mismatches.
