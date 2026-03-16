export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-requested-with, prefer",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

export function withCors(resp: Response) {
  const headers = new Headers(resp.headers);
  for (const [k, v] of Object.entries(corsHeaders)) headers.set(k, v);
  return new Response(resp.body, { ...resp, headers });
}
