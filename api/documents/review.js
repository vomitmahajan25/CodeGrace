import { db } from "hatchable";
import { requireActor, writeAudit, getApplication } from "lib/trustcred.js";

export const access = "public";
export const methods = ["POST"];

export default async function (req, res) {
  const actor = await requireActor(req, res, ["lender"]);
  if (!actor) return;
  const id = Number(req.body?.document_id);
  const status = String(req.body?.status || "");
  const reason = String(req.body?.reason || "").trim().slice(0, 1000);
  if (!Number.isInteger(id) || id < 1) return res.status(400).json({ error: "Choose a document to review." });
  if (!["verified", "invalid"].includes(status)) return res.status(400).json({ error: "Choose Verified or Return for correction." });
  if (status === "invalid" && reason.length < 4) return res.status(400).json({ error: "Add a clear reason so the customer knows what to correct." });
  const lookup = await db.query("SELECT id, application_id, doc_type, filename, status AS prior_status FROM documents WHERE id=$1", [id]);
  const doc = lookup.rows[0];
  if (!doc) return res.status(404).json({ error: "Document not found." });
  if (doc.prior_status !== "pending") return res.status(409).json({ error: "Only pending documents can be reviewed." });
  const app = await getApplication(doc.application_id);
  if (!app || Number(app.assigned_lender_user_id) !== Number(actor.id)) return res.status(404).json({ error: "This application is not assigned to your lender account." });
  if (["approved", "rejected", "funded"].includes(app.status)) return res.status(409).json({ error: "This application is finalized." });

  await db.query(
    "UPDATE documents SET status=$1, review_reason=$2, reviewed_by=$3, reviewed_at=now() WHERE id=$4",
    [status, status === "invalid" ? reason : "", actor.display_name, id]
  );
  if (status === "invalid") {
    await db.query("UPDATE applications SET status='documents_returned', updated_at=now() WHERE id=$1", [app.id]);
  } else if (app.status === "documents_returned") {
    const stillInvalid = await db.query("SELECT 1 FROM documents WHERE application_id=$1 AND status='invalid' LIMIT 1", [app.id]);
    await db.query("UPDATE applications SET status=$1, updated_at=now() WHERE id=$2", [stillInvalid.rows.length ? "documents_returned" : "document_review", app.id]);
  } else {
    await db.query("UPDATE applications SET updated_at=now() WHERE id=$1", [app.id]);
  }
  await writeAudit(app.id, actor.role, actor.display_name, status === "verified" ? "Verified document: " + doc.doc_type : "Returned document: " + doc.doc_type, reason, actor.id);
  return res.json({ ok: true, message: status === "verified" ? "Document marked verified." : "Document returned. The customer will see the correction reason." });
}