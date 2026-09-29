import { useMemo, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "../lib/db";
import { buildRecipients } from "../lib/winnerList";
import { findPrize, REDEMPTIONS, type Recipient } from "../lib/winnerEmail";
import { csv } from "../lib/csv";
import { currency } from "../config";
interface Props {
  configured: boolean;
}
type Preview = { subject: string; text: string } | null;
async function call(body: Record<string, unknown>) {
  const device = await db.device.get("device");
  if (!device?.auth) throw new Error("Unlock this device first.");
  const response = await fetch("/api/winner-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${device.auth}`,
    },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Record<
    string,
    string
  >;
  if (!response.ok) throw new Error(data.error || "Unable to send this email.");
  return data;
}
export default function WinnerEmail({ configured }: Props) {
  const sent = useLiveQuery(() => db.winnerEmails.toArray()) ?? [];
  const [files, setFiles] = useState<string[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<Preview>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState("");
  const { recipients, issues } = useMemo(() => buildRecipients(files), [files]);
  const record = useMemo(() => new Map(sent.map((s) => [s.email, s])), [sent]);
  const selected = recipients.filter((r) => chosen.has(r.email));
  async function load(list: FileList | null) {
    if (!list?.length) return;
    const texts = await Promise.all([...list].map((f) => f.text()));
    setFiles(texts);
    setNames([...list].map((f) => f.name));
    setChosen(new Set());
    setPreview(null);
    setError("");
    setStatus("");
  }
  const toggle = (email: string) =>
    setChosen((prev) => {
      const next = new Set(prev);
      next.has(email) ? next.delete(email) : next.add(email);
      return next;
    });
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }
  const showPreview = (r: Recipient) =>
    run(async () => {
      const data = await call({ ...r, preview: true });
      setPreview({ subject: data.subject, text: data.text });
    });
  const sendTest = () =>
    run(async () => {
      const sample = selected[0] ?? recipients[0];
      if (!sample) throw new Error("Load a winner list first.");
      await call({ ...sample, email: test.trim(), name: "Reggie" });
      setStatus(
        `Test copy of the ${findPrize(sample.prizeId)?.displayName} email sent to ${test.trim()}.`,
      );
    });
  const sendSelected = () =>
    run(async () => {
      let ok = 0;
      let failed = 0;
      for (const [index, r] of selected.entries()) {
        setStatus(`Sending ${index + 1} of ${selected.length}…`);
        try {
          const data = await call({ ...r });
          await db.winnerEmails.put({
            ...r,
            status: "sent",
            sentAt: new Date().toISOString(),
            providerId: data.id,
          });
          ok++;
        } catch (e) {
          await db.winnerEmails.put({
            ...r,
            status: "failed",
            sentAt: new Date().toISOString(),
            error: e instanceof Error ? e.message : "failed",
          });
          failed++;
        }
        await new Promise((resolve) => setTimeout(resolve, 700));
      }
      setChosen(new Set());
      setStatus(`Finished. ${ok} sent${failed ? `, ${failed} failed` : ""}.`);
    });
  function download() {
    const rows = sent.map((s) => ({
      name: s.name,
      email: s.email,
      prize: findPrize(s.prizeId)?.displayName ?? s.prizeId,
      code: s.code,
      status: s.status,
      sentAt: s.sentAt,
      providerId: s.providerId ?? "",
      error: s.error ?? "",
    }));
    const url = URL.createObjectURL(
      new Blob(["﻿" + csv(rows)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `haven-winner-emails-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  return (
    <section>
      <h2>Winner emails</h2>
      <p>
        Load the joined winners export, or the Entries and Spins exports
        together. Every message is built on the server from the approved
        redemption template for that prize; nothing typed here becomes email
        content. Winners already emailed are marked and stay unselected unless
        you tick them again.
      </p>
      {!configured && (
        <p className="operator-warning">
          Sending is not configured on the server. Add RESEND_API_KEY and
          WINNER_EMAIL_FROM, then redeploy. Previews work without it.
        </p>
      )}
      <label>
        Winner CSV files
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={(e) => void load(e.target.files)}
        />
      </label>
      {!!names.length && <p className="muted">Loaded: {names.join(", ")}</p>}
      {!!issues.length && (
        <ul className="operator-warning">
          {issues.map((issue) => (
            <li key={issue}>{issue}</li>
          ))}
        </ul>
      )}
      {!!recipients.length && (
        <>
          <div className="button-row">
            <button
              onClick={() =>
                setChosen(
                  new Set(
                    recipients
                      .filter((r) => record.get(r.email)?.status !== "sent")
                      .map((r) => r.email),
                  ),
                )
              }
            >
              Select all not yet sent
            </button>
            <button onClick={() => setChosen(new Set())}>
              Clear selection
            </button>
          </div>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Send</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Prize</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Preview</th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => {
                  const prize = findPrize(r.prizeId);
                  const previous = record.get(r.email);
                  return (
                    <tr key={r.email}>
                      <td>
                        <input
                          type="checkbox"
                          aria-label={`Email ${r.name}`}
                          checked={chosen.has(r.email)}
                          onChange={() => toggle(r.email)}
                        />
                      </td>
                      <td>{r.name}</td>
                      <td className="mono">{r.email}</td>
                      <td>
                        {prize?.displayName}
                        <br />
                        <span className="muted">
                          {currency(prize?.value ?? 0)}
                        </span>
                      </td>
                      <td>{REDEMPTIONS[r.prizeId]?.route}</td>
                      <td>
                        {previous
                          ? `${previous.status} ${previous.sentAt.slice(0, 10)}`
                          : "not sent"}
                      </td>
                      <td>
                        <button
                          onClick={() => void showPreview(r)}
                          disabled={busy}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {preview && (
            <div className="operator-warning">
              <p>
                <strong>Subject:</strong> {preview.subject}
              </p>
              <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, margin: 0 }}>
                {preview.text}
              </pre>
              <button onClick={() => setPreview(null)}>Hide preview</button>
            </div>
          )}
          <label>
            Send one test copy to
            <input
              type="email"
              value={test}
              placeholder="you@havenworkspace.ca"
              onChange={(e) => setTest(e.target.value)}
            />
          </label>
          <div className="button-row">
            <button
              onClick={() => void sendTest()}
              disabled={busy || !configured || !test.includes("@")}
            >
              Send test copy
            </button>
            <button
              className="primary"
              onClick={() => void sendSelected()}
              disabled={busy || !configured || !selected.length}
            >
              Send to {selected.length} selected winner
              {selected.length === 1 ? "" : "s"}
            </button>
            <button onClick={download} disabled={!sent.length}>
              Export send log
            </button>
          </div>
        </>
      )}
      {status && <p className="muted">{status}</p>}
      {error && <p className="error">{error}</p>}
    </section>
  );
}
