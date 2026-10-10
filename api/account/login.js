import { db, config } from "hatchable";
import { normalizeEmail, validEmail, verifyPasswordRecord, verifyCodeHash, issueSession } from "lib/account-service.js";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const email=normalizeEmail(req.body?.email);
  const password=String(req.body?.password||"");
  const role=String(req.body?.role||"").trim().toLowerCase();
  const lenderCode=String(req.body?.admin_code||"").trim().toUpperCase();
  if(!validEmail(email)||!password||!["customer","lender","loanofficer"].includes(role))return res.status(400).json({error:"Enter your email, password, and account type."});
  if(role==="lender"&&lenderCode.length<12)return res.status(400).json({error:"Your lender access code is required for every sign-in. Use the code shown after you pass the eligibility screen, or one later rotated by the LoanOfficer."});
  const attempts=await db.query("SELECT COUNT(*)::int AS count FROM login_attempts WHERE lower(email)=lower($1) AND succeeded=false AND attempted_at>now()-interval '15 minutes'",[email]);
  if(Number(attempts.rows[0]?.count||0)>=8)return res.status(429).json({error:"Too many failed attempts. Wait 15 minutes before trying again."});
  const result=await db.query("SELECT id,full_name,email,role,password_salt,password_hash,password_iterations,email_verified,status FROM app_users WHERE lower(email)=lower($1) LIMIT 1",[email]);
  const user=result.rows[0];
  let valid=!!user&&user.status==="active"&&user.role===role&&await verifyPasswordRecord(password,user);
  if(valid&&role==="loanofficer"){
    const configured=String(await config.get("TRUSTCRED_LOANOFFICER_EMAIL")||"").trim().toLowerCase();
    valid=!!configured&&email===configured;
  }
  if(valid&&role==="lender"){
    const codeResult=await db.query("SELECT code_salt,code_hash,active FROM lender_access_codes WHERE lower(email)=lower($1)",[email]);
    const code=codeResult.rows[0];
    valid=!!code&&code.active&&await verifyCodeHash(lenderCode,code.code_salt,code.code_hash);
  }
  if(!valid){
    await db.query("INSERT INTO login_attempts(email,succeeded) VALUES($1,false)",[email]);
    return res.status(401).json({error:"Email, password, account type, or lender access code is incorrect."});
  }
  if(role==="loanofficer"&&!user.email_verified)return res.status(403).json({error:"The LoanOfficer account must be initialized by the configured site owner."});
  await db.query("DELETE FROM login_attempts WHERE lower(email)=lower($1)",[email]);
  await db.query("INSERT INTO login_attempts(email,succeeded) VALUES($1,true)",[email]);
  await issueSession(res,user);
  return res.json({user:{id:user.id,email:user.email,full_name:user.full_name,role:user.role}});
}