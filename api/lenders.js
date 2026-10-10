import { db } from "hatchable";
import { requireActor, writeAudit } from "lib/trustcred.js";
import { normalizeEmail, validEmail, hashCode } from "lib/account-service.js";
import { randomHex } from "lib/security.js";
export const access="public";
export const methods=["GET","POST"];
export default async function(req,res){
  const actor=await requireActor(req,res,["lender","loanofficer"]);
  if(!actor)return;
  if(req.method==="GET"){
    if(actor.role==="loanofficer"){
      const result=await db.query("SELECT l.id,l.user_id,l.full_name,l.email,l.phone,l.status,l.created_at,l.organization_name,l.institution_type,l.registration_number,l.business_address,l.years_experience,l.annual_lending_capacity,l.eligibility_status,l.eligibility_notes,(SELECT COUNT(*)::int FROM applications a WHERE a.assigned_lender_user_id=l.user_id AND a.status IN ('under_assessment','loanofficer_review','approved','information_requested','rejected','funded')) AS reviewed,(SELECT COUNT(*)::int FROM applications a WHERE a.funding_lender_user_id=l.user_id AND a.funding_status='assigned') AS loans_to_fund,(SELECT COUNT(*)::int FROM applications a WHERE a.funding_lender_user_id=l.user_id AND a.funding_status='disbursed') AS loans_funded,(SELECT COUNT(DISTINCT a.customer_user_id)::int FROM applications a WHERE a.funding_lender_user_id=l.user_id AND a.funding_status='disbursed') AS customers_funded,(SELECT COALESCE(SUM(a.funded_amount),0)::numeric FROM applications a WHERE a.funding_lender_user_id=l.user_id AND a.funding_status='disbursed') AS total_funded,(SELECT COALESCE(SUM(a.approved_amount),0)::numeric FROM applications a WHERE a.funding_lender_user_id=l.user_id AND a.funding_status='assigned') AS committed_amount,(SELECT c.active FROM lender_access_codes c WHERE lower(c.email)=lower(l.email) LIMIT 1) AS access_code_active FROM lenders l ORDER BY l.created_at DESC");
      return res.json({lenders:result.rows});
    }
    const result=await db.query("SELECT id,full_name,email,phone,status,created_at FROM lenders WHERE user_id=$1",[actor.id]);
    return res.json({lenders:result.rows});
  }
  if(actor.role!=="loanofficer")return res.status(403).json({error:"Only the LoanOfficer can issue, rotate, or revoke lender access codes."});
  const action=String(req.body?.action||"issue"),email=normalizeEmail(req.body?.email);
  if(!validEmail(email))return res.status(400).json({error:"Enter a valid lender email."});
  if(action==="revoke"){
    const code=await db.query("UPDATE lender_access_codes SET active=false,updated_at=now() WHERE lower(email)=lower($1) RETURNING id",[email]);
    if(!code.rows.length)return res.status(404).json({error:"No lender access code was found for this email."});
    const lender=await db.query("SELECT id FROM app_users WHERE lower(email)=lower($1) AND role='lender'",[email]);
    if(lender.rows.length)await db.query("DELETE FROM auth_sessions WHERE user_id=$1",[lender.rows[0].id]);
    await db.query("UPDATE lenders SET status='Access revoked' WHERE lower(email)=lower($1)",[email]);
    await writeAudit(null,"loanofficer",actor.display_name,"Revoked lender access code","Revoked lender authorization for "+email,actor.id);
    return res.json({ok:true,message:"Lender access code revoked and existing sessions signed out."});
  }
  if(action!=="issue")return res.status(400).json({error:"Unknown lender access-code action."});
  const fullName=String(req.body?.full_name||"").trim().slice(0,100);
  if(fullName.length<2)return res.status(400).json({error:"Enter the lender's full name."});
  const acct=await db.query("SELECT id,role FROM app_users WHERE lower(email)=lower($1)",[email]);
  if(acct.rows.length&&acct.rows[0].role!=="lender")return res.status(409).json({error:"This email already belongs to a non-lender account. Use a separate email for the lender."});
  const code=randomHex(8).toUpperCase(),hashed=await hashCode(code);
  const existing=await db.query("SELECT id FROM lender_access_codes WHERE lower(email)=lower($1)",[email]);
  if(existing.rows.length)await db.query("UPDATE lender_access_codes SET full_name=$1,code_salt=$2,code_hash=$3,active=true,issued_by=$4,updated_at=now() WHERE id=$5",[fullName,hashed.salt,hashed.hash,actor.id,existing.rows[0].id]);
  else await db.query("INSERT INTO lender_access_codes(email,full_name,code_salt,code_hash,active,issued_by) VALUES($1,$2,$3,$4,true,$5)",[email,fullName,hashed.salt,hashed.hash,actor.id]);
  const existingLender=await db.query("SELECT id FROM lenders WHERE lower(email)=lower($1)",[email]);
  const lenderStatus=acct.rows.length?"Active":"Invited";
  if(existingLender.rows.length)await db.query("UPDATE lenders SET full_name=$1,status=$2 WHERE id=$3",[fullName,lenderStatus,existingLender.rows[0].id]);
  else await db.query("INSERT INTO lenders(full_name,email,phone,status) VALUES($1,$2,'',$3)",[fullName,email,lenderStatus]);
  if(acct.rows.length){await db.query("UPDATE app_users SET status='active' WHERE id=$1",[acct.rows[0].id]);await db.query("DELETE FROM auth_sessions WHERE user_id=$1",[acct.rows[0].id]);}
  await writeAudit(null,"loanofficer",actor.display_name,"Issued lender access code","Issued or rotated access for "+email,actor.id);
  return res.status(201).json({ok:true,email,access_code:code,message:"Lender access code issued. Share it privately; it is shown only once and required for registration and every sign-in."});
}