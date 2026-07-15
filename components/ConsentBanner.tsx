"use client";

import { useEffect, useState } from "react";
import { getConsentState, setConsentState } from "@/lib/tracking/trackEvent";

/**
 * Minimal CMP stand-in. Day 1: stores consent and pushes consent_updated to
 * the dataLayer. Day 2: GTM triggers are gated on that consent state so no
 * vendor tags fire before "granted".
 */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(getConsentState() === "pending");
  }, []);

  if (!visible) return null;

  function choose(state: "granted" | "denied") {
    setConsentState(state);
    setVisible(false);
  }

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      data-testid="consent-banner"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-stone-200 bg-white p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-stone-700">
          We use analytics to improve this site. Choose whether to allow
          measurement cookies.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => choose("denied")}
            data-testid="consent-deny"
            className="rounded-full border border-stone-300 px-4 py-2 text-sm hover:bg-stone-100"
          >
            Decline
          </button>
          <button
            onClick={() => choose("granted")}
            data-testid="consent-grant"
            className="rounded-full bg-stone-900 px-4 py-2 text-sm text-white hover:bg-stone-700"
          >
            Allow
          </button>
        </div>
      </div>
    </div>
  );
}
