# Headstart

A Media.net product-case prototype for handing off work across time zones. The seeded workspace opens as Shashank and contains two sample working weeks. The workspace clock uses the current time.

## Run locally

Use Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open http://localhost:3000. Run `npm run build` to compile the production app.

## Walk through the demo

1. As **Shashank**, start from **Question predictions**. The home screen defaults to the last seven days and shows prediction, follow-up, and nominee counts alongside dated handoffs. Open **Assign new task**. Choose a teammate and use **Use sample task** or **Record audio** with demo dictation enabled.
2. Choose **Predict questions** to open the task draft and watch the questions appear in sequence. Verify the predicted output and priority answers or enter your own. Predicted answers only go into the handoff after verification. Select one or more nominees per question. Each can reply independently. On the CTR question, you can add a preliminary answer and nominate Saurabh in the same edit. Use **Finish later** to leave the draft in **Open items**, or **Send handoff** to open the sent task detail. Use **Predict more questions** to add another batch without replacing your edits. **Questions with existing answers** shows the original answer and author. Confirm answers individually or in bulk before sending. Before sending, accept an answer, nominate teammates, or use **Remove from question set** for each open question. The **Guide** button walks through the review.
3. Delivery follows the recipient’s working hours and the live clock. Switch to **Devarshi** and open a delivered task from notifications or **My tasks**.
4. Mark the output answer **Helped**. Mark the priority answer **Didn’t help**, add what was missing, and ask “Should I exclude the app release week?”.
5. Switch to **Saurabh**. Open **Questions for me** and answer the CTR question or add a follow-up to the original answer.
6. Switch to **Shashank** and use **Pending team questions** to reply to questions from your team. Review, edit, or use a system-suggested answer.
7. As Devarshi, request acceptance. As Shashank, open **Awaiting acceptance**, review the task details, and accept or send back the work from the same page.
8. Open **Metrics** for the seeded switchback comparison or **Settings** to reset the demo or view the API reference. Predictions are required for new handoffs. Historical tasks may show later predictions separately.

## Deployment and data

This is a standard Next.js App Router project. A Vercel project can use automatic Next.js detection and the default build command. No environment variables are necessary for the demo.

Browser storage carries a local state snapshot into each mutation. It also preserves unfinished task text and unsaved question edits in Open items. The server uses an ephemeral session cache for its read endpoints. Public users get separate local demos. Profile comparisons use synthetic data, and delivery is evaluated against the live clock when the workspace is open. Notifications are simulated in the app.

Optional server-side configuration:

| Variable | Purpose |
| --- | --- |
| `OPENAI_API_KEY` or `ANTHROPIC_API_KEY` | Optional task classification, question phrasing, and transcript cleanup. |
| `OPENAI_MODEL` or `ANTHROPIC_MODEL` | Optional model override. |
| `STT_API_KEY` | Optional OpenAI-compatible audio transcription for multipart requests. Typed and browser-dictated inputs work without it. |
| `STT_MODEL` | Optional audio transcription model override. |
