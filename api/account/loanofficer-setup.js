import { db, config } from "hatchable";
import { normalizeEmail, validEmail, validatePassword, createPassword, issueSession } from "lib/account-service.js";
import { constantTimeEqual } from "lib/security.js";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const exists=await db.query("SELECT id FROM app_users WHERE role='loanofficer' LIMIT 1");
  if(exists.rows.length)return res.status(409).json({error:"The LoanOfficer account has already been initialized. Only one LoanOfficer account is allowed."});
  const configuredEmail=normalizeEmail(await config.get("TRUSTCRED_LOANOFFICER_EMAIL"));
  const setupCode=String(await config.get("TRUSTCRED_LOANOFFICER_BOOTSTRAP_CODE")||"");
  const email=normalizeEmail(req.body?.email);
  const code=String(req.body?.bootstrap_code||"");
  const name=String(req.body?.full_name||"").trim().slice(0,100);
  const password=String(req.body?.password||"");
  if(!configuredEmail||!setupCode)return res.status(503).json({error:"LoanOfficer setup secrets are missing. Ask the site owner to configure them first."});
  if(setupCode.length<32)return res.status(503).json({error:"TRUSTCRED_LOANOFFICER_BOOTSTRAP_CODE must be at least 32 characters long."});
  if(!validEmail(email)||email!==configuredEmail)return res.status(403).json({error:"Only the email configured by the site owner can initialize the single LoanOfficer account."});
  if(!constantTimeEqual(code,setupCode))return res.status(403).json({error:"The one-time LoanOfficer setup code is incorrect."});
  if(name.length<2)return res.status(400).json({error:"Enter the LoanOfficer's full name."});
  const error=validatePassword(password);if(error)return res.status(400).json({error});
  const again=await db.query("SELECT id FROM app_users WHERE role='loanofficer' LIMIT 1");
  if(again.rows.length)return res.status(409).json({error:"The LoanOfficer account has already been initialized."});
  const hash=await createPassword(password);
  let user;
  const prior=await db.query("SELECT id,role FROM app_users WHERE lower(email)=lower($1) LIMIT 1",[email]);
  try{
    if(prior.rows.length){
      user=(await db.query("UPDATE app_users SET full_name=$1,role='loanofficer',password_salt=$2,password_hash=$3,password_iterations=$4,email_verified=true,status='active' WHERE id=$5 RETURNING id,full_name,email,role",[name,hash.salt,hash.hash,hash.iterations,prior.rows[0].id])).rows[0];
      await db.query("DELETE FROM auth_sessions WHERE user_id=$1",[user.id]);
      await db.query("UPDATE lenders SET status='Access revoked' WHERE lower(email)=lower($1)",[email]);
      await db.query("UPDATE lender_access_codes SET active=false,updated_at=now() WHERE lower(email)=lower($1)",[email]);
    }else{
      user=(await db.query("INSERT INTO app_users(full_name,email,role,password_salt,password_hash,password_iterations,email_verified,status) VALUES($1,$2,'loanofficer',$3,$4,$5,true,'active') RETURNING id,full_name,email,role",[name,email,hash.salt,hash.hash,hash.iterations])).rows[0];
    }
  }catch(e){return res.status(409).json({error:"A LoanOfficer already exists or the configured email could not be initialized."});}
  await db.query("INSERT INTO audit_events(application_id,actor_role,actor_name,action,reason,actor_user_id) VALUES(NULL,'loanofficer',$1,'Initialized LoanOfficer account','Initial single-LoanOfficer setup.',$2)",[name,user.id]);
  await issueSession(res,user);
  return res.status(201).json({user:{id:user.id,email:user.email,full_name:user.full_name,role:user.role},message:"The single LoanOfficer account is initialized. Keep the bootstrap code private; it cannot create another account."});
}