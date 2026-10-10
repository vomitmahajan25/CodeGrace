const encoder = new TextEncoder();

function toHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
}
function fromHex(value) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(String(value || ""))) throw new Error("Invalid cryptographic value.");
  const bytes = new Uint8Array(value.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}
export function randomHex(bytes = 16) {
  const data = new Uint8Array(bytes);
  crypto.getRandomValues(data);
  return toHex(data);
}
export function constantTimeEqual(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}
export async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(String(value)));
  return toHex(new Uint8Array(digest));
}
export async function derivePassword(password, saltHex, iterations = 310000) {
  const salt = saltHex ? fromHex(saltHex) : fromHex(randomHex(16));
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), { name: "PBKDF2" }, false, ["deriveBits"]);
  const result = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations, hash: "SHA-256" }, key, 256);
  return { salt: toHex(salt), hash: toHex(new Uint8Array(result)), iterations };
}
export async function verifyPassword(password, saltHex, expectedHex, iterations) {
  const result = await derivePassword(password, saltHex, Number(iterations) || 310000);
  return constantTimeEqual(result.hash, expectedHex);
}
export function parseCookie(req, name) {
  const header = String(req.headers?.cookie || "");
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() === name) {
      try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return ""; }
    }
  }
  return "";
}
export function setSessionCookie(res, token, maxAge = 43200) {
  res.setHeader("Set-Cookie", "trustcred_session=" + encodeURIComponent(token) + "; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=" + maxAge);
}
export function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", "trustcred_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
}