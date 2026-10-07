# Aravind_Ai_Note_maker

AI-powered syllabus-to-detailed-notes web app using the Google Gemini API.

## Features
- Upload syllabus files: PDF, TXT, MD, PNG, JPG, JPEG, WEBP and GIF.
- Paste syllabus text directly.
- Sends source material to Gemini through a secure Cloudflare Worker.
- Generates detailed notes covering every detected unit, topic, sub-topic and micro-topic.
- Live notes preview with Markdown rendering.
- Download polished A4 PDF with `Aravind_Ai_Note_maker` diagonal watermark on every page.
- No login/database required for the MVP.
- GitHub Pages-compatible static frontend.

## Architecture

`GitHub Pages frontend -> Cloudflare Worker -> Google Gemini API`

Never put `GEMINI_API_KEY` in frontend JavaScript or in your GitHub repository.

## 1. Configure the frontend

Edit `frontend/config.js`:

```js
window.APP_CONFIG = {
  API_URL: "https://YOUR-WORKER.YOUR-SUBDOMAIN.workers.dev"
};
```

## 2. Deploy the Worker

Requirements: Node.js and Wrangler.

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
npx wrangler deploy
```

When prompted, paste your Gemini API key.

Then copy the deployed Worker URL into `frontend/config.js`.

For local development, create `worker/.dev.vars` and do not commit it:

```env
GEMINI_API_KEY="your_gemini_api_key_here"
```

Run:

```bash
cd worker
npm run dev
```

## 3. Publish the frontend on GitHub Pages

Upload the contents of the `frontend/` folder to your GitHub Pages repository and enable GitHub Pages.

## Gemini model

The Worker uses:

```js
const MODEL = 'gemini-2.5-flash';
```

You can change the model in `worker/src/index.js` if you want to use another Gemini model supported by your API account.

## Supported input

The Gemini version accepts:

- PDF
- PNG / JPG / JPEG / WEBP / GIF
- TXT / MD
- Directly pasted text

DOC/DOCX are intentionally removed from the browser file picker because raw Office documents are not passed as native document inputs by this Worker. Convert them to PDF or TXT/MD before uploading.

## Security

The Gemini API key is stored as a Cloudflare Worker secret and is never exposed to the browser.

## Limits

The Worker keeps the original 12 MB per-file application limit. Gemini supports multimodal input including images and PDF documents; PDF input can also be processed with native document understanding.

API usage is subject to your Google Gemini API account's current pricing and limits.
