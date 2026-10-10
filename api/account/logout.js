import { destroySession } from "lib/account-service.js";
export const access = "public";
export const methods = ["POST"];
export default async function(req,res){await destroySession(req,res);return res.json({ok:true,message:"You are signed out."});}