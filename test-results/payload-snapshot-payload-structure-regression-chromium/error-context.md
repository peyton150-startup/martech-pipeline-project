# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: payload-snapshot.spec.ts >> payload structure regression
- Location: tests\payload-snapshot.spec.ts:3:5

# Error details

```
Error: A snapshot doesn't exist at C:\Users\nicol\Marriott Project\tests\payload-snapshot.spec.ts-snapshots\event-shapes-chromium-win32.json, writing actual.
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - main [ref=e2]:
    - link "← All destinations" [ref=e3] [cursor=pointer]:
      - /url: /
    - img "Maui Shores" [ref=e5]
    - generic [ref=e6]:
      - generic [ref=e7]:
        - paragraph [ref=e8]: Hawaii, USA · beach
        - heading "Maui Shores" [level=1] [ref=e9]
        - paragraph [ref=e10]: Black-sand coves, warm trade winds, and reef snorkeling steps from your room.
      - generic [ref=e11]:
        - paragraph [ref=e12]: from
        - paragraph [ref=e13]: $289
        - paragraph [ref=e14]: per night
    - button "Check availability" [ref=e16]
  - button "Open Next.js Dev Tools" [ref=e22] [cursor=pointer]:
    - img [ref=e23]
  - alert [ref=e26]
  - dialog "Cookie consent" [ref=e27]:
    - generic [ref=e28]:
      - paragraph [ref=e29]: We use analytics to improve this site. Choose whether to allow measurement cookies.
      - generic [ref=e30]:
        - button "Decline" [ref=e31]
        - button "Allow" [ref=e32]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | test("payload structure regression", async ({ page }) => {
  4  |   await page.goto("/destinations/maui-shores");
  5  | 
  6  |   const dataLayer = await page.evaluate(() => window.dataLayer);
  7  |   // Filter out any initial GTM pushes, keep only our structured events
  8  |   // eslint-disable-next-line @typescript-eslint/no-explicit-any
  9  |   const events = dataLayer.filter((e: any) => e.event_id);
  10 | 
  11 |   // We map the actual events to just their shape (keys)
  12 |   // eslint-disable-next-line @typescript-eslint/no-explicit-any
  13 |   const getShape = (obj: any): any => {
  14 |     if (typeof obj !== "object" || obj === null) return typeof obj;
  15 |     if (Array.isArray(obj)) return obj.map(getShape);
  16 |     const shape: Record<string, string> = {};
  17 |     for (const key in obj) {
  18 |       shape[key] = typeof obj[key];
  19 |       if (typeof obj[key] === "object" && obj[key] !== null) {
  20 |         shape[key] = getShape(obj[key]);
  21 |       }
  22 |     }
  23 |     return shape;
  24 |   };
  25 | 
  26 |   const shapes = events.map(getShape);
  27 | 
  28 |   // Take a snapshot of the shapes. 
  29 |   // Playwright will create the snapshot file on the first run.
> 30 |   expect(JSON.stringify(shapes, null, 2)).toMatchSnapshot("event-shapes.json");
     |                                           ^ Error: A snapshot doesn't exist at C:\Users\nicol\Marriott Project\tests\payload-snapshot.spec.ts-snapshots\event-shapes-chromium-win32.json, writing actual.
  31 | });
  32 | 
```