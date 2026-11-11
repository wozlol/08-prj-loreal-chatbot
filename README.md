# Project 8: L'Oréal Chatbot

Live site: https://wozlol.github.io/08-prj-loreal-chatbot/

A beauty advisor chatbot for L'Oréal products and routines. It only answers beauty questions, remembers the conversation, shows your latest question above the replies, and uses chat bubbles.

## Setup

1. Create a Cloudflare Worker and paste in `RESOURCE_cloudflare-worker.js`.
2. Add a secret named `OPENAI_API_KEY` under Variables and Secrets.
3. Deploy, then copy the Worker URL into `WORKER_URL` at the top of `script.js`.
4. Commit and push. GitHub Pages updates in about a minute.

The OpenAI key lives only in Cloudflare, never in this repo.
