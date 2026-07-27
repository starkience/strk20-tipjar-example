/**
 * Server-side proxy for AVNU's paymaster.
 *
 * Private swaps are gas-sponsored by AVNU's paymaster, which authenticates with
 * an API key. Anything the browser bundle holds is publicly readable, so
 * shipping that key to the client would let anyone spend the sponsorship
 * budget. Instead the app points the SDK's `paymasterBaseUrl` at this route and
 * the key is attached here, server-side — it never reaches the browser.
 *
 * The paymaster is a single JSON-RPC endpoint: the SDK POSTs to the base URL
 * itself and never appends a path (`paymasterRpcCall` in @avnu/avnu-sdk), so
 * this forwards one POST and needs no routing of its own.
 *
 * Requires AVNU_PAYMASTER_API_KEY in the deployment environment. The missing
 * VITE_ prefix is deliberate: that prefix is exactly what would inline the
 * value into the client bundle.
 */
export const config = { runtime: "edge" };

const PAYMASTER = "https://starknet.paymaster.avnu.fi";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "POST required" }, 405);
  }

  const key = process.env.AVNU_PAYMASTER_API_KEY;
  if (!key) {
    return json({ error: "paymaster proxy is not configured" }, 503);
  }

  const upstream = await fetch(PAYMASTER, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "x-paymaster-api-key": key,
    },
    body: await req.text(),
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
      "cache-control": "no-store",
    },
  });
}
