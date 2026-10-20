# Dealflow agent notes

CLI + Firestore publisher for off-market deal books. Product UI is ReturnState Team → Deals.

- Books live in `src/books/`; pinned scope in `src/publish/scope.ts`.
- Publish with `npm run publish:deals` (requires `FIRESTORE_CREDENTIALS` file path).
- Do not reintroduce a Next.js desk UI in this repo.
