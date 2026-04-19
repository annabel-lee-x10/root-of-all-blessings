# Known Bugs

Track confirmed bugs here before they are fixed. Format:
`**[ID]** Short description — discovered date, affected file`

---

**BUG-001** `PATCH /api/transactions/[id]` and `DELETE /api/transactions/[id]` do not call `verifySession()`, meaning authenticated endpoints are missing auth checks — discovered 2026-04-19, `app/api/transactions/[id]/route.ts`
