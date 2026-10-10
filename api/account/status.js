import { db } from "hatchable";
import { getActor } from "lib/trustcred.js";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  const result=await db.query("SELECT 1 FROM app_users WHERE role='loanofficer' AND status='active' LIMIT 1");
  const user=await getActor(req);
  const exists=result.rows.length>0;
  return res.json({loanofficer_exists:exists,admin_exists:exists,user:user?{id:user.id,email:user.email,full_name:user.full_name,role:user.role,email_verified:user.email_verified}:null});
}