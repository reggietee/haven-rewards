# Winner redemption emails

Booth controls → **Winner emails** sends one redemption message per winner through
Resend. Message bodies are rendered on the server from the approved template in
`src/lib/winnerEmail.ts`; the browser supplies only a name, address, prize id and
prize code, so no operator can type message content into a winner's inbox.

## 1. Verify the sending domain

1. In Resend, add `cloud.havenworkspace.ca` as a sending domain and publish the
   SPF, DKIM and DMARC records it lists on that subdomain. Keep it separate from
   the root domain so contest mail cannot affect normal Haven mail reputation.
2. Create an API key restricted to sending.

## 2. Configure the server

Set these in Vercel (Production) and redeploy. They are server-only; never prefix
them with `VITE_`.

| Variable                | Value                                             |
| ----------------------- | ------------------------------------------------- |
| `RESEND_API_KEY`        | Resend sending key                                |
| `WINNER_EMAIL_FROM`     | `Haven Workspace <hello@cloud.havenworkspace.ca>` |
| `WINNER_EMAIL_REPLY_TO` | `reggie@havenworkspace.ca` (default if unset)     |

Booth controls → Readiness shows whether the server reports the key as present.
Previews render without any of this configured.

## 3. Send

1. Unlock booth controls with the operator PIN. If `KIOSK_DEVICE_ID` is set, only
   that paired device can unlock, so either work on the event iPad or clear that
   variable first.
2. Load either the joined winners CSV, or the raw **Entries** and **Spins**
   exports together. Rows missing an address, a code or a catalogue prize are
   listed and skipped rather than sent.
3. Use **View** to read the exact message a winner will receive, then send one
   test copy to yourself.
4. **Select all not yet sent**, then send. Messages go one at a time with a short
   gap. Each result is written to this device's `winnerEmails` table, so a winner
   already emailed stays unselected on the next pass.
5. **Export send log** produces a CSV of who was emailed, when, and any failures.

## Scope

The app sends this one redemption message per winner and nothing else. It does not
track opens, deliver reminders, issue discount codes or record redemptions; those
remain manual. This message is prize fulfillment, not marketing, so it is sent to
every winner regardless of their Haven.fm waitlist choice.
