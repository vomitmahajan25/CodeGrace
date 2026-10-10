import { db } from "hatchable";
import { requireActor, writeAudit } from "lib/trustcred.js";

export const access = "public";
export const methods = ["GET", "POST"];

function cleanText(value, max = 240) {
  return String(value || "").trim().slice(0, max);
}

export default async function (req, res) {
  const actor = await requireActor(req, res, ["customer", "lender", "loanofficer"]);
  if (!actor) return;

  if (req.method === "GET") {
    const customerOnly = actor.role === "customer";
    const query = customerOnly
      ? "SELECT a.id, a.customer_name, a.customer_email, a.city, a.work_type, a.business_name, a.monthly_income, a.vintage_months, a.requested_amount, a.tenure_months, a.purpose, a.status, a.trustcred_score, a.bill_payment_score, a.eligible_amount, a.lender_recommendation, a.recommendation_reason, a.recommended_amount, a.recommended_by, a.admin_decision, a.admin_reason, a.approved_amount, a.created_at, a.updated_at, (SELECT COUNT(*)::int FROM documents d WHERE d.application_id=a.id) AS document_count FROM applications a WHERE a.customer_user_id=$1 ORDER BY a.updated_at DESC"
      : "SELECT a.id, a.customer_name, a.customer_email, a.city, a.work_type, a.business_name, a.monthly_income, a.vintage_months, a.requested_amount, a.tenure_months, a.purpose, a.status, a.trustcred_score, a.bill_payment_score, a.eligible_amount, a.lender_recommendation, a.recommendation_reason, a.recommended_amount, a.recommended_by, a.admin_decision, a.admin_reason, a.approved_amount, a.created_at, a.updated_at, (SELECT COUNT(*)::int FROM documents d WHERE d.application_id=a.id) AS document_count FROM applications a ORDER BY a.updated_at DESC LIMIT 100";
    const visibleQuery = actor.role === "lender" ? query.replace("FROM applications a ORDER BY", "FROM applications a WHERE a.assigned_lender_user_id=$1 ORDER BY") : query;
    const result = await db.query(visibleQuery, customerOnly || actor.role === "lender" ? [actor.id] : []);
    return res.json({ applications: result.rows });
  }

  if (actor.role !== "customer") return res.status(403).json({ error: "Only customer accounts can create applications." });
  const body = req.body || {};
  const name = String(actor.full_name || "").trim().slice(0, 100);
  const email = String(actor.email || "").trim().toLowerCase();
  const phone = cleanText(body.phone, 30);
  const city = cleanText(body.city, 80);
  const workType = cleanText(body.work_type, 60);
  const businessName = cleanText(body.business_name, 120);
  const purpose = cleanText(body.purpose, 400);
  const income = Number(body.monthly_income);
  const vintage = Number(body.vintage_months);
  const amount = Number(body.requested_amount);
  const tenure = Number(body.tenure_months);
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Your account profile must contain a valid name and email." });
  }
  if (!Number.isFinite(income) || income < 1 || income > 10000000 || !Number.isFinite(amount) || amount < 1000 || amount > 10000000) {
    return res.status(400).json({ error: "Enter a valid monthly income and loan amount." });
  }
  if (!Number.isInteger(tenure) || tenure < 1 || tenure > 60 || !Number.isInteger(vintage) || vintage < 0 || vintage > 600) {
    return res.status(400).json({ error: "Tenure must be 1–60 months and business/activity history must be 0–600 months." });
  }
  if (!["Gig worker", "Microenterprise", "Self-employed", "Home business", "Platform worker"].includes(workType)) {
    return res.status(400).json({ error: "Choose a valid work type." });
  }
  if (body.consent_alt_data !== true) return res.status(400).json({ error: "Confirm the alternative-data consent checkbox before continuing." });
  if (purpose.length < 5) return res.status(400).json({ error: "Add a short loan purpose." });

  const id = "TC-" + Date.now().toString().slice(-6) + "-" + crypto.randomUUID().slice(0, 4).toUpperCase();
  const result = await db.query(
    "INSERT INTO applications (id, customer_name, customer_email, customer_user_id, consent_alt_data, consented_at, consent_version, phone, city, work_type, business_name, monthly_income, vintage_months, requested_amount, tenure_months, purpose, status) VALUES ($1,$2,$3,$4,true,now(),'trustcred-consent-v1',$5,$6,$7,$8,$9,$10,$11,$12,$13,'draft') RETURNING id, customer_name, customer_email, status, created_at",
    [id, name, email, actor.id, phone, city, workType, businessName, income, vintage, amount, tenure, purpose]
  );
  await writeAudit(id, actor.role, actor.display_name, "Created application", "Consent version recorded: trustcred-consent-v1.", actor.id);
  return res.status(201).json({ application: result.rows[0], message: "Application created. Add supporting documents, then submit for review." });
}