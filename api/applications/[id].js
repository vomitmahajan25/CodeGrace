import { db, storage } from "hatchable";
import { requireActor, getApplication, getDocumentRows } from "lib/trustcred.js";
export const access = "public";
export const methods = ["GET"];
export default async function(req,res){
  const actor=await requireActor(req,res,["customer","lender","loanofficer"]);
  if(!actor)return;
  const id=String(req.params?.id||"").trim().slice(0,80);
  if(!id)return res.status(400).json({error:"An application ID is required."});
  const app=await getApplication(id);
  if(!app)return res.status(404).json({error:"Application not found."});
  const isOwner=actor.role==="customer"&&Number(app.customer_user_id)===Number(actor.id);
  const isReviewLender=actor.role==="lender"&&Number(app.assigned_lender_user_id)===Number(actor.id);
  const isFundingLender=actor.role==="lender"&&Number(app.funding_lender_user_id)===Number(actor.id);
  if(actor.role==="customer"&&!isOwner||actor.role==="lender"&&!isReviewLender&&!isFundingLender)return res.status(404).json({error:"That application is not accessible to your account."});
  let documents=[];
  if(actor.role==="loanofficer"||isOwner||isReviewLender){
    const rows=await getDocumentRows(id);
    documents=await Promise.all(rows.map(async row=>{
      let url=null;if(row.storage_key){try{url=await storage.url(row.storage_key,{ttl:300});}catch{}}
      const {storage_key,...doc}=row;return {...doc,url};
    }));
  }else{
    const rows=await db.query("SELECT id,application_id,doc_type,filename,content_type,byte_size,status,review_reason,uploaded_at,reviewed_at FROM documents WHERE application_id=$1 ORDER BY uploaded_at DESC,id DESC",[id]);
    documents=rows.rows;
  }
  const {customer_user_id,assigned_lender_user_id,funding_lender_user_id,recommended_by_user_id,decided_by_user_id,...application}=app;
  const names=await db.query("SELECT (SELECT full_name FROM app_users WHERE id=$1) AS reviewing_lender_name,(SELECT full_name FROM app_users WHERE id=$2) AS funding_lender_name",[app.assigned_lender_user_id||null,app.funding_lender_user_id||null]);
  application.reviewing_lender_name=names.rows[0]?.reviewing_lender_name||null;
  application.funding_lender_name=names.rows[0]?.funding_lender_name||null;
  application.is_review_lender=isReviewLender;
  application.is_funding_lender=isFundingLender;
  let assessment=null;
  if(actor.role==="loanofficer"||isReviewLender){
    const result=await db.query("SELECT e.application_id,e.prepared_by_user_id,u.full_name AS prepared_by,e.verified_monthly_income,e.income_variation_percent,e.bank_statement_months,e.utility_bills_reviewed,e.utility_bills_on_time,e.utility_bills_late,e.utility_bills_missed,e.verified_work_months,e.monthly_obligations,e.evidence_notes,e.score_version,e.model_version,e.shap_explanation,e.trustcred_score,e.bill_payment_score,e.estimated_eligible_amount,e.created_at,e.updated_at FROM evidence_assessments e JOIN app_users u ON u.id=e.prepared_by_user_id WHERE e.application_id=$1 ORDER BY e.created_at DESC LIMIT 1",[id]);
    assessment=result.rows[0]||null;
  }
  return res.json({application,documents,assessment});
}