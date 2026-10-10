import { db } from "hatchable";
import { requireActor, writeAudit, getApplication, getDocumentRows } from "lib/trustcred.js";
export const access = "public";
export const methods = ["POST"];
const requiredDocs=["identity_proof","address_proof","income_proof","bank_statement"];
export default async function(req,res){
  const actor=await requireActor(req,res,["customer","lender","loanofficer"]);
  if(!actor)return;
  const body=req.body||{},action=String(body.action||""),id=String(body.application_id||"").trim().slice(0,80);
  if(!id)return res.status(400).json({error:"Choose an application."});
  const app=await getApplication(id);
  if(!app)return res.status(404).json({error:"Application not found."});
  const owns=actor.role==="customer"&&Number(app.customer_user_id)===Number(actor.id);
  const reviewing=actor.role==="lender"&&Number(app.assigned_lender_user_id)===Number(actor.id);
  const funding=actor.role==="lender"&&Number(app.funding_lender_user_id)===Number(actor.id);
  if(actor.role==="customer"&&!owns||actor.role==="lender"&&!reviewing&&!funding)return res.status(404).json({error:"Application not found in your authorized queue."});
  if(["rejected","funded"].includes(app.status))return res.status(409).json({error:"This application is finalized and cannot be changed."});
  if(app.status==="approved"&&!((action==="mark_funded"||action==="decline_funding")&&funding)&&!(action==="assign_funder"&&actor.role==="loanofficer"))return res.status(409).json({error:"This approved application can only be funded by its assigned lender or reassigned by the LoanOfficer."});

  if(action==="submit"){
    if(actor.role!=="customer")return res.status(403).json({error:"Only customers can submit applications."});
    if(!["draft","documents_returned","information_requested"].includes(app.status))return res.status(409).json({error:"This application is already in review. Wait for a document correction or information request."});
    let assignedLenderId=app.assigned_lender_user_id||null;
    if(assignedLenderId){
      const current=await db.query("SELECT u.id FROM app_users u JOIN lenders l ON l.user_id=u.id JOIN lender_access_codes c ON lower(c.email)=lower(u.email) WHERE u.id=$1 AND u.role='lender' AND u.status='active' AND l.status='Active' AND c.active=true",[assignedLenderId]);
      if(!current.rows.length)assignedLenderId=null;
    }
    if(!assignedLenderId){
      const assigned=await db.query("SELECT u.id FROM app_users u JOIN lenders l ON l.user_id=u.id JOIN lender_access_codes c ON lower(c.email)=lower(u.email) WHERE u.role='lender' AND u.status='active' AND l.status='Active' AND c.active=true ORDER BY (SELECT COUNT(*) FROM applications a WHERE a.assigned_lender_user_id=u.id AND a.status NOT IN ('approved','rejected','funded')) ASC,u.id ASC LIMIT 1");
      assignedLenderId=assigned.rows[0]?.id||null;
    }
    if(!assignedLenderId)return res.status(409).json({error:"No active eligible lender is registered yet. A lender must pass the registration eligibility screen and have an active access code first."});
    const resubmission=["documents_returned","information_requested"].includes(app.status);
    if(resubmission){
      await db.query("UPDATE applications SET status='document_review',assigned_lender_user_id=$1,trustcred_score=NULL,bill_payment_score=NULL,eligible_amount=NULL,lender_recommendation=NULL,recommendation_reason=NULL,recommended_amount=NULL,recommended_by=NULL,recommended_by_user_id=NULL,recommended_at=NULL,admin_decision=NULL,admin_reason=NULL,approved_amount=NULL,decided_by=NULL,decided_by_user_id=NULL,decided_at=NULL,funding_lender_user_id=NULL,funding_status='not_assigned',funded_amount=NULL,funded_at=NULL,funding_reference=NULL,funding_reason='',updated_at=now() WHERE id=$2",[assignedLenderId,id]);
    }else{
      await db.query("UPDATE applications SET status='document_review',assigned_lender_user_id=$1,updated_at=now() WHERE id=$2",[assignedLenderId,id]);
    }
    await writeAudit(id,actor.role,actor.display_name,resubmission?"Resubmitted application after requested changes":"Submitted application","Application assigned to an active eligible lender for document verification.",actor.id);
    return res.json({ok:true,message:"Application submitted and assigned to an active eligible lender for document review."});
  }
  if(action==="request_missing_documents"){
    if(!reviewing)return res.status(403).json({error:"Only the assigned reviewing lender can request documents."});
    const docs=await getDocumentRows(id);
    const missing=requiredDocs.filter(type=>{const current=docs.filter(d=>d.doc_type===type&&d.status!=="superseded");return !current.length||current.every(d=>d.status==="invalid");});
    if(!missing.length)return res.status(409).json({error:"All required document categories are present. Verify each file or return an invalid document with a reason."});
    const reason="Missing or returned required documents: "+missing.map(x=>x.replaceAll("_"," ")).join(", ");
    await db.query("UPDATE applications SET status='documents_returned',updated_at=now() WHERE id=$1",[id]);
    await writeAudit(id,actor.role,actor.display_name,"Requested missing documents",reason,actor.id);
    return res.json({ok:true,missing,message:reason+". The customer can upload the missing files and resubmit."});
  }
  if(action==="complete_document_review"){
    if(!reviewing)return res.status(403).json({error:"Only the assigned reviewing lender can complete document review."});
    const docs=await getDocumentRows(id),invalid=docs.filter(d=>d.status==="invalid");
    if(invalid.length){await db.query("UPDATE applications SET status='documents_returned',updated_at=now() WHERE id=$1",[id]);return res.status(409).json({error:"At least one document was returned for correction. The customer must replace it before assessment."});}
    const missing=requiredDocs.filter(type=>!docs.some(d=>d.doc_type===type&&d.status!=="superseded"&&d.status!=="invalid"));
    const pending=docs.filter(d=>d.status!=="verified"&&d.status!=="superseded");
    if(missing.length||pending.length)return res.status(409).json({error:"Assessment is locked until all required documents are present and verified. "+(missing.length?"Missing: "+missing.map(x=>x.replaceAll("_"," ")).join(", ")+". ":"")+(pending.length?pending.length+" document(s) still need verification.":"")});
    await db.query("UPDATE applications SET trustcred_score=NULL,bill_payment_score=NULL,eligible_amount=NULL,status='under_assessment',updated_at=now() WHERE id=$1",[id]);
    await writeAudit(id,actor.role,actor.display_name,"Completed document verification","Required documents were verified. A structured assessment and its SHAP explanation must be saved before the LoanOfficer decision.",actor.id);
    return res.json({ok:true,message:"Required documents verified. Record the figures observed in the source documents to create the model score and SHAP explanation."});
  }
  if(action==="final_decision"){
    if(actor.role!=="loanofficer")return res.status(403).json({error:"Only the LoanOfficer can approve, reject, or request more information."});
    if(app.status!=="loanofficer_review")return res.status(409).json({error:"The application must have completed document verification and assessment before a LoanOfficer decision."});
    const assessment=await db.query("SELECT shap_explanation,estimated_eligible_amount FROM evidence_assessments WHERE application_id=$1 ORDER BY created_at DESC LIMIT 1",[id]);
    if(!assessment.rows[0]?.shap_explanation)return res.status(409).json({error:"A saved SHAP explanation is required before a decision."});
    const decision=String(body.decision||""),reason=String(body.reason||"").trim().slice(0,1200),amount=Number(body.amount||0);
    if(!["approve","reject","request_information"].includes(decision))return res.status(400).json({error:"Choose approve, reject, or request more information."});
    if(body.confirmed_customer_verification!==true&&body.confirmed_customer_verification!=="on")return res.status(400).json({error:"Confirm that you reviewed the customer verification, lender document checks, source metrics, and SHAP explanation before deciding."});
    if(reason.length<10)return res.status(400).json({error:"Record at least 10 characters explaining how the evidence and SHAP explanation informed the decision."});
    let funderId=null,finalStatus=decision==="approve"?"approved":decision==="reject"?"rejected":"information_requested";
    if(decision==="approve"){
      const maxAmount=Math.min(Number(assessment.rows[0].estimated_eligible_amount||0),Number(app.requested_amount||0));
      if(!Number.isFinite(amount)||amount<1000||amount>maxAmount)return res.status(400).json({error:"Approved amount must be at least ₹1,000 and cannot exceed the lower of the requested amount and the evidence-based estimate."});
      funderId=Number(body.funding_lender_user_id);
      if(!Number.isInteger(funderId)||funderId<1)return res.status(400).json({error:"Choose an active registered lender to fund an approved application."});
      const lender=await db.query("SELECT u.id,u.full_name FROM app_users u JOIN lenders l ON l.user_id=u.id JOIN lender_access_codes c ON lower(c.email)=lower(u.email) WHERE u.id=$1 AND u.role='lender' AND u.status='active' AND l.status='Active' AND c.active=true LIMIT 1",[funderId]);
      if(!lender.rows.length)return res.status(400).json({error:"The selected lender is not active, registered, and authorized with a valid access code. Select another lender."});
    }
    await db.query("UPDATE applications SET admin_decision=$1,admin_reason=$2,approved_amount=$3,decided_by=$4,decided_by_user_id=$5,decided_at=now(),status=$6,funding_lender_user_id=$7,funding_status=$8,funded_amount=NULL,funded_at=NULL,funding_reference=NULL,funding_reason='',updated_at=now() WHERE id=$9",[decision,reason,decision==="approve"?amount:null,actor.display_name,actor.id,finalStatus,funderId,decision==="approve"?"assigned":"not_assigned",id]);
    const selected=funderId?(await db.query("SELECT full_name,email FROM app_users WHERE id=$1",[funderId])).rows[0]:null;
    await writeAudit(id,actor.role,actor.display_name,"Confirmed customer verification","LoanOfficer confirmed review of customer identity, required documents, source metrics, and the saved SHAP explanation before the final decision.",actor.id);
    await writeAudit(id,actor.role,actor.display_name,"LoanOfficer decision: "+decision.replaceAll("_"," "),reason+(selected?"; selected funding lender: "+selected.full_name+" ("+selected.email+"); approved amount: "+amount:""),actor.id);
    return res.json({ok:true,message:decision==="approve"?"Application approved and assigned to "+selected.full_name+" to disburse the loan.":decision==="reject"?"Application rejected. The rationale is recorded in the audit trail.":"More information requested. The customer can update the application and resubmit."});
  }
  if(action==="assign_funder"){
    if(actor.role!=="loanofficer")return res.status(403).json({error:"Only the LoanOfficer can assign a funding lender."});
    if(app.status!=="approved"||!["assigned","declined"].includes(app.funding_status))return res.status(409).json({error:"Only an approved, not-yet-disbursed loan can be assigned or reassigned."});
    const funderId=Number(body.funding_lender_user_id);
    const lender=Number.isInteger(funderId)?await db.query("SELECT u.id,u.full_name FROM app_users u JOIN lenders l ON l.user_id=u.id JOIN lender_access_codes c ON lower(c.email)=lower(u.email) WHERE u.id=$1 AND u.role='lender' AND u.status='active' AND l.status='Active' AND c.active=true LIMIT 1",[funderId]):{rows:[]};
    if(!lender.rows.length)return res.status(400).json({error:"Choose an active registered lender with a valid access code."});
    await db.query("UPDATE applications SET funding_lender_user_id=$1,funding_status='assigned',funding_reason='',updated_at=now() WHERE id=$2",[funderId,id]);
    await writeAudit(id,actor.role,actor.display_name,"Assigned funding lender","Funding responsibility assigned to "+lender.rows[0].full_name+".",actor.id);
    return res.json({ok:true,message:"Funding lender assigned: "+lender.rows[0].full_name+"."});
  }
  if(action==="mark_funded"){
    if(actor.role!=="lender"||!funding)return res.status(403).json({error:"Only the assigned funding lender can record a disbursement."});
    if(app.status!=="approved"||app.funding_status!=="assigned")return res.status(409).json({error:"This loan is not awaiting disbursement by your account."});
    const amount=Number(body.funded_amount),reference=String(body.funding_reference||"").trim().slice(0,120);
    if(!Number.isFinite(amount)||amount<1||amount>Number(app.approved_amount||0))return res.status(400).json({error:"Enter the actual amount disbursed. It must be greater than zero and no more than the approved amount."});
    if(reference.length<4)return res.status(400).json({error:"Enter a real bank transfer or disbursement reference (at least 4 characters)."});
    await db.query("UPDATE applications SET status='funded',funding_status='disbursed',funded_amount=$1,funded_at=now(),funding_reference=$2,funding_reason='',updated_at=now() WHERE id=$3",[amount,reference,id]);
    await writeAudit(id,actor.role,actor.display_name,"Recorded loan disbursement","Actual amount: "+amount+"; transaction reference: "+reference,actor.id);
    return res.json({ok:true,message:"Disbursement recorded. The LoanOfficer dashboard now includes this loan in funded totals."});
  }
  if(action==="decline_funding"){
    if(actor.role!=="lender"||!funding)return res.status(403).json({error:"Only the assigned funding lender can decline this funding assignment."});
    if(app.status!=="approved"||app.funding_status!=="assigned")return res.status(409).json({error:"This loan is not awaiting disbursement by your account."});
    const reason=String(body.reason||"").trim().slice(0,1200);
    if(reason.length<10)return res.status(400).json({error:"Explain why you cannot fund this approved loan."});
    await db.query("UPDATE applications SET funding_status='declined',funding_reason=$1,updated_at=now() WHERE id=$2",[reason,id]);
    await writeAudit(id,actor.role,actor.display_name,"Declined funding assignment",reason,actor.id);
    return res.json({ok:true,message:"Funding declined with a reason. The LoanOfficer can assign another active lender."});
  }
  return res.status(400).json({error:"Unsupported workflow action."});
}