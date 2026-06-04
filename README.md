# n8n-nodes-polydoc

An [n8n](https://n8n.io) community node for [PolyDoc](https://polydoc.tech) - a REST API that converts HTML or URLs to **PDF**, captures **screenshots**, and generates EU-compliant **e-invoices** (Factur-X / ZUGFeRD hybrid PDF/A-3).

One node, three operations:

- **HTML/URL to PDF** - layout, margins, page format, page ranges, bookmarks, accessible/tagged PDFs.
- **Capture Screenshot** - PNG / JPEG / WebP, full page, viewport and device-pixel-ratio control.
- **Generate E-Invoice** - Factur-X or ZUGFeRD, profiles from `minimum` to `extended`.

Content can come from a **URL**, an inline **HTML** string, or a saved **template** (with Liquid `templateData`). The result is returned as binary data by default, or uploaded to your **cloud storage** (presigned URL) or delivered to a **webhook**.

## Installation

In n8n: **Settings → Community Nodes → Install**, then enter `n8n-nodes-polydoc`.

Self-hosted (manual):

```bash
npm install n8n-nodes-polydoc
```

## Credentials

Create a **PolyDoc API** credential with an API key from [dashboard.polydoc.tech](https://dashboard.polydoc.tech) (API Keys). Toggle **Sandbox** to test with sandbox quota (watermarked output). The key is sent as `Authorization: Bearer <key>`.

## Anything not in the UI?

Every operation has an **Additional Fields → Advanced (JSON)** escape hatch that is deep-merged into the request body, so any API capability not surfaced as a control (e.g. `pdf.watermark`, `pdf.pdfa`, `pdf.encryption`, `render.*`, `request.*`) is still reachable. See the full request schema at [docs.polydoc.tech](https://docs.polydoc.tech).

## Development

```bash
npm install
npm run build      # tsc + copy icons into dist/
npm run lint       # eslint-plugin-n8n-nodes-base
npm test           # unit tests (request body builder)
```

Live smoke test against the real API (uses sandbox quota):

```bash
POLYDOC_API_KEY=api_xxx POLYDOC_TEMPLATE_ID=jlE-whg npm run test:integration
```

## License

[MIT](./LICENSE)
