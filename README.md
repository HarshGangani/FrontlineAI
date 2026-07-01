This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

# Frontline AI

AI-powered customer support triage. Paste a customer message (or upload a dataset) and it returns the **category**, **priority**, a **summary**, a **suggested action**, whether it **needs a human**, and a **confidence** score.

Built with Next.js, Google Gemini 2.5 Flash, and Zod.

## Setup

```bash
npm install
echo "GEMINI_API_KEY=your_key_here" > .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Usage

- **Single Message** — paste one message and click Analyze.
- **Dataset Upload** — upload a `.json` or `.csv` file with a `message` field/column.
- **Run Evaluation Suite** — scores the built-in test set in `data/evaluation.json`.

## API

`POST /api/triage`

```json
// request
{ "message": "I was charged twice this month" }

// response
{
  "category": "billing",
  "priority": "P1",
  "summary": "...",
  "suggested_action": "...",
  "needs_human": true,
  "confidence": 0.92
}
```

Categories: `billing`, `technical`, `shipping`, `refund`, `account`, `complaint`, `feature_request`, `other`
Priorities: `P0` (critical) → `P3` (low)

## Project Structure
app/page.tsx          UI
app/api/triage/       Triage endpoint
lib/prompts.ts        System prompt
lib/gemini.ts         Gemini client
lib/schema.ts         Zod output schema
data/evaluation.json  Test cases
scripts/evaluate.ts   Evaluation runner

