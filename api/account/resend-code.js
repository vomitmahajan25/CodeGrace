import { db } from "hatchable";
import { normalizeEmail, startVerification } from "lib/account-service.js";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){
  const email=normalizeEmail(req.body?.email);
  const result=await db.query("SELECT id,full_name,email,role,email_verified,status FROM app_users WHERE lower(email)=lower($1) LIMIT 1",[email]);
  const user=result.rows[0];
  if(!user||user.status!=="active"||user.email_verified)return res.json({message:"If the account needs verification, a fresh code will be sent if allowed."});
  try{await startVerification(user,"verify_email");return res.json({message:"A new verification code was sent."});}
  catch(e){return res.status(e.status||503).json({error:String(e.message||"Could not send a new code.")});}
}