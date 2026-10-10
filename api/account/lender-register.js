import { db } from "hatchable";
import { normalizeEmail, validEmail, validatePassword, createPassword, hashCode, issueSession } from "lib/account-service.js";
import { randomHex } from "lib/security.js";

export const access = "public";
export const methods = ["POST"];

const institutionTypes = new Set([
  "bank", "nbfc", "microfinance", "cooperative",
  "registered_fintech", "ngo_mfi", "other_registered_lender"
]);

function clean(value, max = 300) {
  return String(value ?? "").trim().slice(0, max);
}
function phoneDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

export default async function (req, res) {
  const name = clean(req.body?.full_name, 100);
  const email = normalizeEmail(req.body?.email);
  const password = String(req.body?.password || "");
  const organizationName = clean(req.body?.organization_name, 180);
  const institutionType = clean(req.body?.institution_type, 60).toLowerCase();
  const registrationNumber = clean(req.body?.registration_number, 80).toUpperCase();
  const businessAddress = clean(req.body?.business_address, 500);
  const phone = clean(req.body?.business_phone, 40);
  const digits = phoneDigits(phone);
  const years = Number(req.body?.years_experience);
  const capacity = Number(req.body?.annual_lending_capacity);
  const certified = req.body?.certify_registration === true || req.body?.certify_registration === "on" || req.body?.certify_registration === "true";

  if (name.length < 2) return res.status(400).json({ error: "Enter your full name." });
  if (!validEmail(email)) return res.status(400).json({ error: "Enter a valid email address." });
  const passwordError = validatePassword(password);
  if (passwordError) return res.status(400).json({ error: passwordError });
  const recent = await db.query("SELECT COUNT(*)::int AS count FROM lender_eligibility_checks WHERE lower(email)=lower($1) AND created_at>now()-interval '1 hour'", [email]);
  if (Number(recent.rows[0]?.count || 0) >= 10) return res.status(429).json({ error: "Too many eligibility attempts for this email. Wait an hour before trying again." });
  const existing = await db.query("SELECT id,role FROM app_users WHERE lower(email)=lower($1)", [email]);
  if (existing.rows.length) return res.status(409).json({ error: "An account with this email already exists. Use lender sign-in if you already registered." });

  const recordedYears = Number.isInteger(years) && years >= 0 && years <= 100 ? years : 0;
  const recordedCapacity = Number.isFinite(capacity) && Math.abs(capacity) < 1000000000000 ? capacity : 0;
  const reasons = [];
  if (organizationName.length < 2) reasons.push("Enter the legal name of your lending organization.");
  if (!institutionTypes.has(institutionType)) reasons.push("Choose a recognized organization type from the list.");
  if (!/^[A-Z0-9][A-Z0-9\/-]{4,79}$/.test(registrationNumber)) reasons.push("Enter a registration or lending-license number of at least 5 letters/numbers (hyphens and slashes are allowed).");
  if (businessAddress.length < 10) reasons.push("Enter a complete registered business address (at least 10 characters).");
  if (digits.length < 10 || digits.length > 15) reasons.push("Enter a reachable business phone number with 10–15 digits.");
  if (!Number.isInteger(years) || years < 2 || years > 100) reasons.push("The organization must have at least 2 years of operating experience.");
  if (!Number.isFinite(capacity) || capacity < 500000 || capacity > 999999999999) reasons.push("Declared annual lending/disbursement capacity must be at least ₹5,00,000.");
  if (!certified) reasons.push("Confirm that the organization is legally registered and authorized to offer lending or financing.");

  if (reasons.length) {
    await db.query(
      "INSERT INTO lender_eligibility_checks(full_name,email,organization_name,institution_type,registration_number,business_address,business_phone,years_experience,annual_lending_capacity,eligible,result_reasons) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,false,$10::jsonb)",
      [name, email, organizationName, institutionType, registrationNumber, businessAddress, phone, recordedYears, recordedCapacity, JSON.stringify(reasons)]
    );
    return res.status(422).json({
      error: "Your registration did not pass Trustcred's initial eligibility screen. Review the requirements below and submit again.",
      reasons
    });
  }

  const passwordHash = await createPassword(password);
  let user;
  try {
    const inserted = await db.query(
      "INSERT INTO app_users(full_name,email,role,password_salt,password_hash,password_iterations,email_verified,status) VALUES($1,$2,'lender',$3,$4,$5,false,'active') RETURNING id,full_name,email,role",
      [name, email, passwordHash.salt, passwordHash.hash, passwordHash.iterations]
    );
    user = inserted.rows[0];

    const accessCode = "TC-" + randomHex(12).toUpperCase();
    const hashedCode = await hashCode(accessCode);
    const priorCode = await db.query("SELECT id FROM lender_access_codes WHERE lower(email)=lower($1)", [email]);
    if (priorCode.rows.length) {
      await db.query(
        "UPDATE lender_access_codes SET full_name=$1,code_salt=$2,code_hash=$3,active=true,issued_by=$4,updated_at=now() WHERE id=$5",
        [name, hashedCode.salt, hashedCode.hash, user.id, priorCode.rows[0].id]
      );
    } else {
      await db.query(
        "INSERT INTO lender_access_codes(email,full_name,code_salt,code_hash,active,issued_by) VALUES($1,$2,$3,$4,true,$5)",
        [email, name, hashedCode.salt, hashedCode.hash, user.id]
      );
    }

    const lender = await db.query("SELECT id FROM lenders WHERE lower(email)=lower($1)", [email]);
    const lenderValues = [name, email, phone, organizationName, institutionType, registrationNumber, businessAddress, years, capacity];
    if (lender.rows.length) {
      await db.query(
        "UPDATE lenders SET user_id=$1,full_name=$2,email=$3,phone=$4,organization_name=$5,institution_type=$6,registration_number=$7,business_address=$8,years_experience=$9,annual_lending_capacity=$10,status='Active',eligibility_status='preliminary_pass',eligibility_notes='Automated screening passed based on applicant-provided information; regulatory credentials not independently verified.' WHERE id=$11",
        [user.id, ...lenderValues, lender.rows[0].id]
      );
    } else {
      await db.query(
        "INSERT INTO lenders(user_id,full_name,email,phone,organization_name,institution_type,registration_number,business_address,years_experience,annual_lending_capacity,status,eligibility_status,eligibility_notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'Active','preliminary_pass','Automated screening passed based on applicant-provided information; regulatory credentials not independently verified.')",
        [user.id, ...lenderValues]
      );
    }

    await db.query(
      "INSERT INTO lender_eligibility_checks(full_name,email,organization_name,institution_type,registration_number,business_address,business_phone,years_experience,annual_lending_capacity,eligible,result_reasons,registered_user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,true,'[]'::jsonb,$10)",
      [name, email, organizationName, institutionType, registrationNumber, businessAddress, phone, years, capacity, user.id]
    );

    await issueSession(res, user);
    return res.status(201).json({
      user: { id: user.id, full_name: user.full_name, email: user.email, role: user.role },
      eligible: true,
      access_code: accessCode,
      message: "Eligibility screen passed. Your lender account is ready. Save this access code now; you need it for every lender sign-in."
    });
  } catch (error) {
    if (user?.id) {
      try { await db.query("DELETE FROM auth_sessions WHERE user_id=$1", [user.id]); } catch {}
      try { await db.query("UPDATE lender_access_codes SET active=false,updated_at=now() WHERE lower(email)=lower($1) AND issued_by=$2", [email, user.id]); } catch {}
      try { await db.query("DELETE FROM lenders WHERE user_id=$1", [user.id]); } catch {}
      try { await db.query("DELETE FROM app_users WHERE id=$1", [user.id]); } catch {}
    }
    return res.status(500).json({ error: "The lender account could not be completed. Your details were not activated; please retry or contact the LoanOfficer." });
  }
}