import { describe, expect, it } from "vitest";
import {
  extractEmails,
  extractJsonLd,
  extractLinks,
  htmlToText,
  parseMoney,
} from "./html";
import { isPathAllowed, parseRobots } from "./robots";
import { parseSitemap } from "./sitemap";
import { contentHash } from "./store";
import { fetchText, FetchError, USER_AGENT } from "./fetch";

describe("robots", () => {
  const text = `
User-agent: Googlebot
Disallow: /

User-agent: *
Disallow: /admin/
Allow: /admin/public
Disallow: /*.pdf$
`;

  it("uses the * group when no group names us", () => {
    const rules = parseRobots(text, USER_AGENT);
    expect(isPathAllowed(rules, "/practice/x/")).toBe(true);
    expect(isPathAllowed(rules, "/admin/secret")).toBe(false);
    expect(isPathAllowed(rules, "/admin/public/page")).toBe(true);
    expect(isPathAllowed(rules, "/files/list.pdf")).toBe(false);
  });

  it("uses a group that names our bot", () => {
    const rules = parseRobots("User-agent: dealflowbot\nDisallow: /\n\nUser-agent: *\nDisallow:", USER_AGENT);
    expect(isPathAllowed(rules, "/anything")).toBe(false);
  });

  it("treats an empty Disallow as allow-all", () => {
    expect(isPathAllowed(parseRobots("User-agent: *\nDisallow:", USER_AGENT), "/x")).toBe(true);
  });
});

describe("html helpers", () => {
  it("turns markup into readable lines", () => {
    expect(htmlToText("<p>Hello&nbsp;<b>world</b></p><script>x()</script><div>Next</div>")).toBe(
      "Hello world\nNext",
    );
  });

  it("flattens JSON-LD graphs and skips broken blocks", () => {
    const html = `
<script type="application/ld+json">{"@graph":[{"@type":"Organization","name":"A"},{"@type":"WebSite"}]}</script>
<script type="application/ld+json">{not json</script>`;
    const nodes = extractJsonLd(html);
    expect(nodes.map((n) => n["@type"])).toContain("Organization");
    expect(nodes.find((n) => n["@type"] === "Organization")?.name).toBe("A");
  });

  it("resolves links against the page URL", () => {
    expect(extractLinks('<a href="/about-us">About <i>us</i></a>', "https://firm.com/")).toEqual([
      { href: "https://firm.com/about-us", text: "About us" },
    ]);
  });

  it("keeps real emails and drops junk", () => {
    expect(
      extractEmails('<a href="mailto:Jane@SmithCPA.com">x</a> info@example.com logo@2x.png noreply@firm.com office@smithcpa.com'),
    ).toEqual(["jane@smithcpa.com", "office@smithcpa.com"]);
  });

  it("parses money", () => {
    expect(parseMoney("$1,400,000")).toBe(1_400_000);
    expect(parseMoney("$361.90")).toBe(361.9);
    expect(parseMoney("$1.2M")).toBe(1_200_000);
    expect(parseMoney("Call for price")).toBeNull();
  });
});

describe("sitemap", () => {
  it("reads loc and lastmod", () => {
    const xml = `<urlset><url><loc>https://a.com/x?a=1&amp;b=2</loc><lastmod>2026-10-01</lastmod></url><url><loc>https://a.com/y</loc></url></urlset>`;
    expect(parseSitemap(xml)).toEqual([
      { url: "https://a.com/x?a=1&b=2", lastmod: "2026-10-01" },
      { url: "https://a.com/y", lastmod: null },
    ]);
  });
});

describe("contentHash", () => {
  it("ignores key order", () => {
    expect(contentHash({ a: 1, b: [1, { c: 2, d: 3 }] })).toBe(contentHash({ b: [1, { d: 3, c: 2 }], a: 1 }));
    expect(contentHash({ a: 1 })).not.toBe(contentHash({ a: 2 }));
  });
});

describe("fetchText", () => {
  const ok = (body: string, status = 200) => new Response(body, { status });

  it("refuses paths robots.txt disallows", async () => {
    const fetchImpl = (async (url: string) =>
      String(url).endsWith("/robots.txt") ? ok("User-agent: *\nDisallow: /private") : ok("page")) as typeof fetch;
    await expect(
      fetchText("https://robots-test.example/private/x", { fetchImpl, minGapMs: 0 }),
    ).rejects.toBeInstanceOf(FetchError);
    await expect(
      fetchText("https://robots-test.example/public", { fetchImpl, minGapMs: 0 }),
    ).resolves.toMatchObject({ body: "page" });
  });

  it("retries a 429 then succeeds", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls += 1;
      return calls === 1
        ? new Response("", { status: 429, headers: { "retry-after": "0.01" } })
        : ok("done");
    }) as unknown as typeof fetch;
    const page = await fetchText("https://retry.example/x", { fetchImpl, minGapMs: 0, skipRobots: true });
    expect(page.body).toBe("done");
    expect(calls).toBe(2);
  });
});
