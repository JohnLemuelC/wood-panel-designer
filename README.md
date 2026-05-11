# Wood Panel Wall Designer

Web app for designing wood-panel wall layouts and producing **1:1 tiled hanging templates** that customers print at 100% and drill through.

**Live URL:** _(deployed on Vercel - see below)_

## What it does

1. Customer signs up, creates a job (wall width x height in mm).
2. Customer uploads photos (presigned PUT direct to Supabase Storage, never through the server).
3. Customer arranges photos as panels on a virtual wall (drag, rotate, swap size, swap photo, undo/redo, auto-save).
4. Customer submits for review.
5. Operator refines layout (same editor) and sends a proof back.
6. Customer approves -> operator marks PRINTED -> SHIPPED.
7. Customer downloads two PDFs: a **1:1 tiled hanging template** (multi-page A4) and a **scaled reference sheet**.
8. Operator downloads a **print master ZIP** (300 dpi per-panel PNGs + MANIFEST.txt).

## Stack

- **Next.js 16** (App Router) + **React 19** + **Tailwind v4**
- **Supabase** for Postgres + Auth + Storage (presigned uploads)
- **Konva / react-konva** for the wall editor canvas
- **pdf-lib** for both PDFs (all positioning done in mm via `mmToPt`)
- **sharp** for 300 dpi print master image processing
- **jszip** for the print master archive
- **Vitest** for the geometry + PDF tests
- Deployed to **Vercel**

## Project structure

```
src/
  app/
    page.tsx                 # marketing landing
    login/, signup/          # auth UI
    customer/                # customer dashboard + job editor
    operator/                # operator pipeline + catalog + per-job
    api/
      photos/                # presigned upload, signed-view, delete
      jobs/[id]/
        status/              # status transition with role guards
        pdf/template/        # 1:1 tiled hanging template PDF
        pdf/reference/       # scaled reference sheet PDF
        print-master/        # operator-only 300 dpi zip
  components/
    AppHeader.tsx
    editor/
      WallEditor.tsx         # Konva canvas + history + auto-save
      EditorClient.tsx       # SSR boundary + photo upload UI
      useHistory.ts          # 50-step undo/redo
  lib/
    supabase/                # browser / server / admin clients
    geometry/                # mm-based math + transforms (THE safety-critical layer)
    pdf/                     # template + reference PDF builders
    layout.ts                # Zod schema for the layout JSONB
  proxy.ts                   # auth proxy (Next.js 16's renamed middleware)

tests/
  geometry.test.ts           # 20+ unit tests for hole -> wall -> PDF transforms
  pdf-smoke.test.ts          # PDF builds, page count, A4 dimensions

scripts/
  gen-sample-pdf.ts          # generates sample-template.pdf for paper testing

supabase/
  schema.sql                 # full schema, RLS policies, storage bucket
```

## Setup

```bash
git clone <this repo>
cd wood-panel-designer
npm install
cp .env.example .env.local
# fill in Supabase URL + keys
```

In Supabase:

1. Create a project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Disable "Confirm email" under Auth > Providers > Email (for testing).
4. (Optional) Seed initial canvas sizes / holes via the operator catalog UI, or with the SQL editor.

To promote your account to operator after signing up:
```sql
update public.profiles set role = 'operator' where email = 'you@example.com';
```

## Run locally

```bash
npm run dev       # next.js dev server on http://localhost:3000
npx vitest run    # all tests
npx tsx scripts/gen-sample-pdf.ts   # write sample-template.pdf
```

## The safety-critical math

The whole project hinges on the 1:1 template PDF being dimensionally accurate after the customer prints it. The brief specifies **+/- 2 mm across a 2 m span**.

The math lives in `src/lib/geometry/index.ts`. Two transforms must be perfect:

1. **Panel-local hole position -> wall coords**: `holeToWallCoord(panel, hole)` translates a hole at `(x_mm, y_mm)` relative to the panel's top-left into a wall coordinate, applying the panel's rotation around its center.
2. **Wall coord -> PDF page coord**: `wallToTile()` figures out which page a wall position falls on, and `wallToPage()` (inline in `pdf/template.ts`) converts mm-within-tile to PDF points using the constant `MM_TO_PT = 72/25.4`.

Both transforms have unit tests in `tests/geometry.test.ts` covering: rotation around origin, rotation around non-origin, 0/90/180/45 degrees, end-to-end 2m span check, fallback hole behaviour, and more.

## Print instructions (built into the PDF footer)

The 1:1 template PDF has these instructions baked in:

- Page 1 has a **100 mm x 100 mm calibration square**. Print page 1, measure the square with a ruler. If it is not 100 mm (+/- 2 mm), the print settings are wrong:
  - **Adobe Reader**: Print > "Actual size" (NOT "Fit" or "Shrink oversized pages").
  - **Chrome**: Print > More settings > Scale: "Default" or 100. NOT "Fit to printable area".
  - **Preview (macOS)**: Print > "Scale: 100%". NOT "Scale to Fit".
  - **Windows print dialog**: "Actual size" or "100%". NOT "Shrink to fit".
- Every page footer reminds the customer in red bold: "PRINT AT 100% / ACTUAL SIZE."
- Crop marks at each corner of every tile so customers can tape pages together accurately.
- Each drill mark is an X with a small label so customers know what they are drilling.

## Assumptions and simplifications

- **Geometry y-axis direction**: rotation is "clockwise on screen" using the screen y-down convention. Tested with 90 deg case (1,0) -> (0,1).
- **Hole fallback**: if a panel size has no holes configured, the template falls back to a single centered hole 50 mm from the top edge. Operator UI flags this with a "needs hole config" warning.
- **Calibration square**: 100 mm x 100 mm, drawn on page 1 only, in the top portion of the printable area.
- **PDF page size**: A4 default. Letter supported via `?page=Letter` query param on the template route.
- **Margins**: 10 mm on all sides. Tile size = 190 x 277 mm on A4. Crop marks at the printable corners.
- **Print master**: 300 dpi PNG per panel. Photos are fit-cover into the panel dimensions. No image rotation is baked into the print master itself (the panel rotation is for hanging, not for the image content).
- **Auth**: customer role on signup. Operators promoted manually via SQL.
- **Storage**: photos bucket with RLS based on `{user_id}/{job_id}/...` path prefix.
- **Status pipeline**: DRAFT -> UPLOADED -> ARRANGING -> PROOFING -> APPROVED -> PRINTED -> SHIPPED. Customers can submit/approve/request-changes; operators can do all transitions.

## Tape-measure verification

The acceptance bar is +/- 2 mm across 2 m on real paper. To verify yourself:

1. Run `npx tsx scripts/gen-sample-pdf.ts` to write `sample-template.pdf`.
2. Print it on A4 at 100% (NOT "fit to page").
3. Measure the 100 mm calibration square on page 1. Should be 100 mm +/- 2 mm.
4. Tape tiles together. Measure across the row to confirm 2 m total. Measure across drill marks vs configured hole positions.

## Known not-shipped-in-MVP

- Email verification flow (disabled for the test).
- Polishing the proof email step (status transitions are wired; customer-facing email itself is out of scope).
- Image rotation inside print master output (panels rotate for hanging; the PNG export keeps photos unrotated).

Tests: `npx vitest run` should report **24 passed** (20 geometry, 4 PDF smoke).
