// Shared helper: Google service-account OAuth access token via JWT assertion.
// Used by Edge Functions (Deno) to call Google APIs that require OAuth (e.g. Document AI).

function base64UrlEncode(input: string | Uint8Array) {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.slice(i, i + chunk));
  }
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "")
    .replace(/\s+/g, "");
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

async function importPrivateKeyFromServiceAccount(sa: any) {
  const pkPem = sa?.private_key;
  if (!pkPem) throw new Error("Missing private_key in service account JSON");
  const pkcs8 = pemToArrayBuffer(String(pkPem));
  return crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

export async function getGoogleAccessToken(params: {
  serviceAccountJson: string;
  scopes: string[];
}) {
  const sa = JSON.parse(params.serviceAccountJson);
  const clientEmail = sa?.client_email;
  if (!clientEmail) throw new Error("Missing client_email in service account JSON");

  const key = await importPrivateKeyFromServiceAccount(sa);
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: clientEmail,
    scope: params.scopes.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  const signingInput = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(JSON.stringify(claim))}`;
  const signature = new Uint8Array(
    await crypto.subtle.sign(
      { name: "RSASSA-PKCS1-v1_5" },
      key,
      new TextEncoder().encode(signingInput)
    )
  );

  const jwt = `${signingInput}.${base64UrlEncode(signature)}`;

  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: jwt,
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.access_token) {
    throw new Error(`OAuth token error: ${res.status}`);
  }

  return String(json.access_token);
}
