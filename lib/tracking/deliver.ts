"use client";

/**
 * Reliable event delivery — the other half of the race condition.
 *
 * The personalization layer engineers the *decision* arriving before render;
 * this module engineers the *event* surviving the navigation. Events fired
 * right before a page unloads are normally lost because the network call
 * never completes. Here they are queued and flushed with transports that
 * outlive the page:
 *
 * - `visibilitychange → hidden` / `pagehide` (the reliable last-chance
 *   signals; `unload` is not) flush via `navigator.sendBeacon`, which the
 *   browser delivers even after the document is gone.
 * - Foreground flushes use `fetch(..., { keepalive: true })` on a short
 *   debounce so data also arrives when the user simply parks on the page.
 * - The queue is mirrored to localStorage: if a flush is rejected or the
 *   page dies before one happens, the events replay on the next page load.
 *   Combined with event_id-deduplication in /api/collect this gives
 *   at-least-once delivery with idempotency.
 *
 * Consent-aware: the queue holds while consent is pending, flushes only
 * after "granted", and is discarded on "denied".
 */

import { recordDeliveryFlush } from "@/lib/debug/debugBus";
import { getConsentState } from "./trackEvent";
import type { TrackedEvent } from "./types";

const ENDPOINT = "/api/collect";
const QUEUE_KEY = "mtp_delivery_queue";
// Cap keeps the sendBeacon payload comfortably under its ~64KB budget.
const MAX_QUEUE = 50;
const DEBOUNCE_MS = 1500;

let queue: TrackedEvent[] = [];
let initialized = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function persistQueue() {
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Storage unavailable — delivery still works, minus crash recovery.
  }
}

function ensureInit() {
  if (initialized) return;
  initialized = true;

  // Replay anything a previous page failed to deliver.
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    const leftover = raw ? (JSON.parse(raw) as TrackedEvent[]) : [];
    if (leftover.length > 0) {
      queue = [...leftover, ...queue].slice(-MAX_QUEUE);
      flush("replay");
    }
  } catch {
    // Corrupt queue — drop it rather than wedge delivery.
    window.localStorage.removeItem(QUEUE_KEY);
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush("hidden");
  });
  window.addEventListener("pagehide", () => flush("pagehide"));
}

function requeue(batch: TrackedEvent[]) {
  queue = [...batch, ...queue].slice(-MAX_QUEUE);
  persistQueue();
}

export function flush(reason: string): void {
  if (typeof window === "undefined" || queue.length === 0) return;

  const consent = getConsentState();
  if (consent === "denied") {
    // Respect the opt-out: never deliver, and drop what's held.
    queue = [];
    persistQueue();
    return;
  }
  if (consent !== "granted") return; // pending — hold the queue

  const batch = queue;
  queue = [];
  persistQueue();
  const payload = JSON.stringify(batch);

  // On the unload path sendBeacon is the transport built to outlive the
  // page; in the foreground, keepalive fetch reports failures so we can
  // requeue.
  const unloading = reason === "hidden" || reason === "pagehide";
  if (unloading && typeof navigator.sendBeacon === "function") {
    const accepted = navigator.sendBeacon(
      ENDPOINT,
      new Blob([payload], { type: "application/json" })
    );
    if (!accepted) {
      requeue(batch); // over beacon budget — persisted for next-page replay
      return;
    }
    recordDeliveryFlush(batch.length, "beacon", reason);
  } else {
    fetch(ENDPOINT, {
      method: "POST",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: payload,
    })
      .then((res) => {
        if (!res.ok) requeue(batch);
      })
      .catch(() => requeue(batch));
    recordDeliveryFlush(batch.length, "fetch+keepalive", reason);
  }
}

/** Called by trackEvent for every validated event. */
export function enqueueDelivery(evt: TrackedEvent): void {
  if (typeof window === "undefined") return;
  ensureInit();

  queue = [...queue, evt].slice(-MAX_QUEUE);
  persistQueue();

  if (queue.length >= MAX_QUEUE) {
    flush("batch-full");
    return;
  }
  // Foreground debounce so events also arrive without a navigation.
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => flush("debounce"), DEBOUNCE_MS);
}
