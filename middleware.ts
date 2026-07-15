import { NextRequest, NextResponse } from "next/server";
import {
  parseSegmentCookie,
  evaluateFlags,
} from "@/lib/personalization/bootstrapFlags";

/**
 * Edge middleware — Strategy 2 (bootstrapped flags).
 *
 * Runs on the edge before the page renders. Reads the `mtp_segment` cookie
 * (mirrored from localStorage by trackEvent's stampSegment), evaluates the
 * `personalized-hero` flag via a static rules map, and injects the result
 * as a cookie that PostHogProvider reads at init for zero-latency bootstrap.
 *
 * For production, swap the static rules map in `evaluateFlags` with the
 * PostHog Node SDK for server-side flag evaluation:
 *
 *   import { PostHog } from 'posthog-node';
 *   const ph = new PostHog(process.env.POSTHOG_API_KEY!);
 *   const flags = await ph.getAllFlags(distinctId);
 */
export function middleware(request: NextRequest) {
  // Read the segment from the cookie that stampSegment wrote.
  const segmentCookie = request.cookies.get("mtp_segment")?.value;
  const segment = parseSegmentCookie(segmentCookie);

  // Evaluate flags server-side.
  const flags = evaluateFlags(segment);

  // Inject bootstrapped flags into a response cookie.
  const response = NextResponse.next();
  response.cookies.set(
    "mtp_bootstrapped_flags",
    JSON.stringify(flags),
    {
      path: "/",
      httpOnly: false, // Client JS needs to read this.
      sameSite: "lax",
      maxAge: 60, // Short-lived; refreshed on every request.
    }
  );

  return response;
}

/**
 * Only run on pages that have personalised content.
 * Skip API routes, static assets, and Next.js internals.
 */
export const config = {
  matcher: [
    /*
     * Match all paths except:
     * - _next (static files, HMR)
     * - api (API routes)
     * - favicon/robots/sitemap
     */
    "/((?!_next|api|favicon\\.ico|robots\\.txt|sitemap\\.xml).*)",
  ],
};
