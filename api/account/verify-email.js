import { db } from "hatchable";
import { normalizeEmail, consumeVerification, issueSession } from "lib/account-service.js";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const email=normalizeEmail(req.body?.email),code=String(req.body?.code||"").trim();
  const result=await db.query("SELECT id,full_name,email,role,status,email_verified FROM app_users WHERE lower(email)=lower($1) LIMIT 1",[email]);
  const user=result.rows[0];
  if(!user||user.status!=="active")return res.status(400).json({error:"The email or verification code is incorrect or expired."});
  if(user.email_verified)return res.json({message:"Email already verified."});
  if(!/^\d{6}$/.test(code))return res.status(400).json({error:"Enter the six-digit code."});
  if(!await consumeVerification(user,"verify_email",code))return res.status(400).json({error:"The verification code is incorrect or expired. Request a new code after one minute."});
  await db.query("UPDATE app_users SET email_verified=true WHERE id=$1",[user.id]);
  if(user.role==="lender")await db.query("UPDATE lenders SET status='Active' WHERE lower(email)=lower($1)",[email]);
  await issueSession(res,user);
  return res.json({user:{id:user.id,email:user.email,full_name:user.full_name,role:user.role},message:"Email verified. Your Trustcred account is active."});
}