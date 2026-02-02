// Shared encryption helpers for Edge Functions (server-side only)
// Tokens/secrets MUST be encrypted before storing.

function b64encode(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.slice(i, i + chunkSize));
  }
  return btoa(binary);
}

function b64decode(s: string) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function keyFromSecret(secret: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", hash, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptText(plaintext: string) {
  const secret = Deno.env.get("APP_TOKEN_ENCRYPTION_KEY") ?? "";
  if (!secret) throw new Error("Missing APP_TOKEN_ENCRYPTION_KEY secret");

  const key = await keyFromSecret(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const pt = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, pt));

  const packed = new Uint8Array(iv.length + ct.length);
  packed.set(iv, 0);
  packed.set(ct, iv.length);

  return `v1:${b64encode(packed)}`;
}

export async function decryptText(ciphertext: string) {
  const secret = Deno.env.get("APP_TOKEN_ENCRYPTION_KEY") ?? "";
  if (!secret) throw new Error("Missing APP_TOKEN_ENCRYPTION_KEY secret");

  const raw = String(ciphertext ?? "");
  const [, payload] = raw.split("v1:");
  if (!payload) throw new Error("Invalid ciphertext");

  const bytes = b64decode(payload);
  if (bytes.length < 13) throw new Error("Invalid ciphertext");

  const key = await keyFromSecret(secret);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct));
  return new TextDecoder().decode(pt);
}
