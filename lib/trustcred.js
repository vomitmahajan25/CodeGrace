import { db, storage } from "hatchable";
import { parseCookie, sha256 } from "lib/security.js";

export async function getActor(req) {
  const token = parseCookie(req, "trustcred_session");
  if (!token) return null;
  const tokenHash = await sha256(token);
  const result = await db.query(
    "SELECT u.id, u.full_name AS display_name, u.full_name, u.email, u.role, u.status, u.email_verified, s.expires_at FROM auth_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.status='active'",
    [tokenHash]
  );
  return result.rows[0] || null;
}

export async function requireActor(req, res, allowedRoles = null) {
  const actor = await getActor(req);
  if (!actor) {
    res.status(401).json({ error: "Please sign in to continue." });
    return null;
  }
  if (actor.role === "loanofficer" && actor.email_verified === false) {
    res.status(403).json({ error: "The LoanOfficer account must be initialized by the configured site owner." });
    return null;
  }
  if (allowedRoles && !allowedRoles.includes(actor.role)) {
    res.status(403).json({ error: "Your account does not have permission to perform this action." });
    return null;
  }
  return actor;
}

export async function writeAudit(applicationId, role, actorName, action, reason = "", actorUserId = null) {
  await db.query(
    "INSERT INTO audit_events (application_id, actor_role, actor_name, action, reason, actor_user_id) VALUES ($1, $2, $3, $4, $5, $6)",
    [applicationId || null, role, actorName || "Account", action, String(reason || "").slice(0, 1200), actorUserId || null]
  );
}

export async function getApplication(id) {
  const result = await db.query("SELECT * FROM applications WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function getDocumentRows(applicationId) {
  return (await db.query(
    "SELECT * FROM documents WHERE application_id = $1 ORDER BY uploaded_at DESC, id DESC",
    [applicationId]
  )).rows;
}

// Trustcred scores are calculated by api/assessments.js from lender-entered metrics extracted from verified evidence.
// Do not generate a score from document counts or the customer's unverified self-reported income alone.

export async function withDocumentUrls(rows) {
  return Promise.all(rows.map(async row => {
    let url = null;
    if (row.storage_key) {
      try { url = await storage.url(row.storage_key, { ttl: 300 }); } catch {}
    }
    const { storage_key, ...publicRow } = row;
    return { ...publicRow, url };
  }));
}