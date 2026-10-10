import { db, email } from "hatchable";
import { derivePassword, randomHex, sha256, constantTimeEqual, parseCookie, setSessionCookie, clearSessionCookie } from "lib/security.js";

export const PASSWORD_ITERATIONS = 310000;
const CODE_ITERATIONS = 120000;

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase().slice(0, 254);
}
export function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 12) return "Use a password with at least 12 characters.";
  if (password.length > 128) return "Password must be 128 characters or fewer.";
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    return "Password must include at least one lowercase letter, one uppercase letter, and one number.";
  }
  return "";
}
export function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}
export async function createPassword(value) {
  return derivePassword(value, randomHex(16), PASSWORD_ITERATIONS);
}
export async function verifyPasswordRecord(password, user) {
  const check = await derivePassword(password, user.password_salt, Number(user.password_iterations) || PASSWORD_ITERATIONS);
  return constantTimeEqual(check.hash, user.password_hash);
}
export async function hashCode(code, salt) {
  const result = await derivePassword(String(code), salt || randomHex(16), CODE_ITERATIONS);
  return { salt: result.salt, hash: result.hash, iterations: result.iterations };
}
export async function verifyCodeHash(code, salt, expected) {
  const result = await derivePassword(String(code), salt, CODE_ITERATIONS);
  return constantTimeEqual(result.hash, expected);
}
export async function issueSession(res, user) {
  const token = crypto.randomUUID() + "." + crypto.randomUUID();
  const tokenHash = await sha256(token);
  await db.query(
    "INSERT INTO auth_sessions (token_hash,user_id,expires_at) VALUES ($1,$2,now()+interval '12 hours')",
    [tokenHash, user.id]
  );
  setSessionCookie(res, token, 43200);
  await db.query("UPDATE app_users SET last_login_at=now() WHERE id=$1", [user.id]);
}
export async function destroySession(req, res) {
  const token = parseCookie(req, "trustcred_session");
  if (token) await db.query("DELETE FROM auth_sessions WHERE token_hash=$1", [await sha256(token)]);
  clearSessionCookie(res);
}
export async function startVerification(user, purpose) {
  const recent = await db.query(
    "SELECT COUNT(*)::int AS count FROM verification_codes WHERE user_id=$1 AND purpose=$2 AND created_at>now()-interval '60 seconds'",
    [user.id, purpose]
  );
  if (Number(recent.rows[0]?.count || 0) >= 1) {
    const err = new Error("Please wait one minute before requesting another email code.");
    err.status = 429;
    throw err;
  }
  await db.query("UPDATE verification_codes SET consumed_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL", [user.id, purpose]);
  const code = String(crypto.getRandomValues(new Uint32Array(1))[0] % 1000000).padStart(6, "0");
  const hashed = await hashCode(code);
  await db.query(
    "INSERT INTO verification_codes (user_id,purpose,code_hash,code_salt,expires_at) VALUES ($1,$2,$3,$4,now()+interval '10 minutes')",
    [user.id, purpose, hashed.hash, hashed.salt]
  );
  const safeName = String(user.full_name || "there").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const subject = purpose === "verify_email" ? "Verify your Trustcred email" : "Reset your Trustcred password";
  const text = purpose === "verify_email"
    ? "Hi " + user.full_name + ", your Trustcred verification code is " + code + ". It expires in 10 minutes. If you did not request it, ignore this email."
    : "Hi " + user.full_name + ", your Trustcred password reset code is " + code + ". It expires in 10 minutes. If you did not request it, ignore this email.";
  const html = "<p>Hi " + safeName + ",</p><p>Your Trustcred code is:</p><p style=\"font-size:28px;font-weight:700;letter-spacing:6px\">" + code + "</p><p>This code expires in 10 minutes. Never share it with anyone.</p><p>If you did not request this code, ignore this email.</p>";
  await email.send({ to: user.email, subject, text, html });
}
export async function consumeVerification(user, purpose, code) {
  const result = await db.query(
    "SELECT id,code_hash,code_salt,attempts FROM verification_codes WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND expires_at>now() ORDER BY created_at DESC LIMIT 1",
    [user.id,purpose]
  );
  const item=result.rows[0];
  if (!item || Number(item.attempts)>=5) return false;
  const matches=await verifyCodeHash(String(code||""),item.code_salt,item.code_hash);
  if (!matches) {
    await db.query("UPDATE verification_codes SET attempts=attempts+1 WHERE id=$1",[item.id]);
    return false;
  }
  await db.query("UPDATE verification_codes SET consumed_at=now() WHERE id=$1",[item.id]);
  return true;
}