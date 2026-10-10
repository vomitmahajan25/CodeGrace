import { db } from "hatchable";
import { normalizeEmail, validEmail, validatePassword, createPassword, issueSession } from "lib/account-service.js";

export const access = "public";
export const methods = ["POST"];

export default async function(req,res){
  const name=String(req.body?.full_name||"").trim().slice(0,100);
  const email=normalizeEmail(req.body?.email);
  const password=String(req.body?.password||"");
  if(name.length<2)return res.status(400).json({error:"Enter your full name."});
  if(!validEmail(email))return res.status(400).json({error:"Enter a valid email address."});
  const passwordError=validatePassword(password);
  if(passwordError)return res.status(400).json({error:passwordError});
  const existing=await db.query("SELECT id FROM app_users WHERE lower(email)=lower($1)",[email]);
  if(existing.rows.length)return res.status(409).json({error:"An account with this email already exists. Sign in or use password reset."});
  const hash=await createPassword(password);
  let inserted;
  try{
    inserted=await db.query("INSERT INTO app_users(full_name,email,role,password_salt,password_hash,password_iterations,email_verified,status) VALUES($1,$2,'customer',$3,$4,$5,false,'active') RETURNING id,full_name,email,role",[name,email,hash.salt,hash.hash,hash.iterations]);
  }catch(e){return res.status(409).json({error:"An account with this email already exists. Please sign in."});}
  const user=inserted.rows[0];
  await issueSession(res,user);
  return res.status(201).json({user:{id:user.id,full_name:user.full_name,email:user.email,role:user.role},message:"Account created successfully. You can start using Trustcred immediately; no email verification is required."});
}