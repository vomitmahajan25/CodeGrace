import { db } from "hatchable";
import { normalizeEmail, validEmail, validatePassword, createPassword, startVerification, consumeVerification } from "lib/account-service.js";
import { sha256 } from "lib/security.js";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const action=String(req.body?.action||"request"),email=normalizeEmail(req.body?.email);
  if(!validEmail(email))return res.status(400).json({error:"Enter a valid email address."});
  const found=await db.query("SELECT id,full_name,email,role,email_verified,status FROM app_users WHERE lower(email)=lower($1) LIMIT 1",[email]);
  const user=found.rows[0];
  if(action==="request"){
    if(user&&user.status==="active"){
      try{await startVerification(user,"password_reset");}
      catch(e){if(e.status===429)return res.status(429).json({error:e.message});}
    }
    return res.json({message:"If an active verified account exists, a password reset code has been sent."});
  }
  if(action!=="complete")return res.status(400).json({error:"Unknown password reset action."});
  if(!user||user.status!=="active")return res.status(400).json({error:"The code is incorrect or expired."});
  const code=String(req.body?.code||"").trim();
  if(!/^\d{6}$/.test(code)||!await consumeVerification(user,"password_reset",code))return res.status(400).json({error:"The code is incorrect or expired."});
  const password=String(req.body?.new_password||"");
  const error=validatePassword(password);if(error)return res.status(400).json({error});
  const hash=await createPassword(password);
  await db.query("UPDATE app_users SET password_salt=$1,password_hash=$2,password_iterations=$3 WHERE id=$4",[hash.salt,hash.hash,hash.iterations,user.id]);
  await db.query("DELETE FROM auth_sessions WHERE user_id=$1",[user.id]);
  return res.json({message:"Password changed. Please sign in again."});
}