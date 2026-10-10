import { db, storage } from "hatchable";
import { requireActor, getApplication, writeAudit, withDocumentUrls } from "lib/trustcred.js";

export const access = "public";
export const methods = ["GET", "POST"];

const docTypes = new Set([
  "identity_proof", "address_proof", "income_proof", "bank_statement",
  "electricity_bill", "gas_bill", "other_utility_bill", "credit_bureau_report", "other_document"
]);
const allowed = new Map([
  ["pdf", "application/pdf"], ["png", "image/png"], ["jpg", "image/jpeg"],
  ["jpeg", "image/jpeg"], ["webp", "image/webp"], ["csv", "text/csv"]
]);

export default async function (req, res) {
  const actor = await requireActor(req, res, ["customer", "lender", "loanofficer"]);
  if (!actor) return;

  if (req.method === "GET") {
    const applicationId = String(req.query?.application_id || "").trim();
    if (!applicationId) return res.status(400).json({ error: "application_id is required." });
    const app = await getApplication(applicationId);
    if (!app) return res.status(404).json({ error: "Application not found." });
    if ((actor.role === "customer" && Number(app.customer_user_id) !== Number(actor.id)) || (actor.role === "lender" && Number(app.assigned_lender_user_id) !== Number(actor.id))) return res.status(404).json({ error: "Application not found." });
    const docs = await db.query("SELECT * FROM documents WHERE application_id=$1 ORDER BY uploaded_at DESC, id DESC", [applicationId]);
    return res.json({ documents: await withDocumentUrls(docs.rows) });
  }

  if (actor.role !== "customer") return res.status(403).json({ error: "Only the customer account that owns this application can upload documents." });
  const file = (req.files || []).find(f => f.field === "file");
  const applicationId = String(req.body?.application_id || "").trim().slice(0, 80);
  const docType = String(req.body?.doc_type || "").trim();
  if (!file || !file.buffer) return res.status(400).json({ error: "Choose a file to upload." });
  if (!applicationId) return res.status(400).json({ error: "Choose the application for this document." });
  if (!docTypes.has(docType)) return res.status(400).json({ error: "Choose a supported document category." });
  const app = await getApplication(applicationId);
  if (!app || Number(app.customer_user_id) !== Number(actor.id)) return res.status(404).json({ error: "Application not found in your account." });
  if (["approved", "rejected", "funded"].includes(app.status)) return res.status(409).json({ error: "Finalized applications cannot be changed." });
  if (!["draft", "documents_returned", "information_requested"].includes(app.status)) {
    return res.status(409).json({ error: "Documents can be added only to a draft, returned, or information-requested application." });
  }
  const extension = String(file.filename || "").split(".").pop().toLowerCase();
  if (!allowed.has(extension)) return res.status(415).json({ error: "Allowed file types: PDF, PNG, JPG, WEBP, or CSV." });
  if (!file.buffer.length || file.buffer.length > 8 * 1024 * 1024) return res.status(413).json({ error: "Files must be between 1 byte and 8 MB." });
  const expectedMime = allowed.get(extension);
  const receivedMime = String(file.contentType || "application/octet-stream").toLowerCase();
  if (receivedMime !== expectedMime && !(extension === "csv" && receivedMime === "application/vnd.ms-excel")) {
    return res.status(415).json({ error: "The file's detected type does not match its extension. Try exporting it as a PDF, PNG, JPG, WEBP, or CSV." });
  }

  const safeName = String(file.filename || "uploaded-document").replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const key = "customer-documents/" + actor.id + "/" + applicationId + "/" + crypto.randomUUID() + "." + extension;
  await storage.put(key, file.buffer, expectedMime);
  await db.query(
    "UPDATE documents SET status='superseded', review_reason='Replaced by a newer upload', reviewed_by=$1, reviewed_at=now() WHERE application_id=$2 AND doc_type=$3 AND status='invalid'",
    [actor.display_name, applicationId, docType]
  );
  const inserted = await db.query(
    "INSERT INTO documents (application_id, doc_type, filename, content_type, storage_key, byte_size, status, uploaded_by, sample_description) VALUES ($1,$2,$3,$4,$5,$6,'pending',$7,'Customer-uploaded supporting document.') RETURNING id, application_id, doc_type, filename, content_type, byte_size, status, uploaded_by, uploaded_at",
    [applicationId, docType, safeName, expectedMime, key, file.buffer.length, actor.display_name]
  );
  await db.query("UPDATE applications SET updated_at=now() WHERE id=$1", [applicationId]);
  await writeAudit(applicationId, actor.role, actor.display_name, "Uploaded " + docType.replaceAll("_", " "), "Document queued for lender verification.", actor.id);
  return res.status(201).json({ document: inserted.rows[0], message: "Document securely stored and queued for review." });
}