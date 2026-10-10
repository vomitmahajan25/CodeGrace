import { db } from "hatchable";
import { requireActor, writeAudit, getApplication, getDocumentRows } from "lib/trustcred.js";
export const access = "public";
export const methods = ["GET","POST"];
const requiredDocs=["identity_proof","address_proof","income_proof","bank_statement"];
const num=value=>Number(value);
const int=value=>Number.isInteger(Number(value));
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function buildModel(input){
  const billScore=input.utility_bills_reviewed>=3?Math.round(input.utility_bills_on_time/input.utility_bills_reviewed*100):null;
  const features=[];
  if(billScore!==null)features.push({key:"utility_payment_history",label:"Utility payment history",value:billScore/100,baseline:0.5,weight:0.40,observed:billScore+"% of reviewed bills paid on time"});
  const incomeStability=clamp(1-Math.min(1,input.income_variation_percent/100),0,1);
  const netRatio=input.verified_monthly_income>0?clamp((input.verified_monthly_income-input.monthly_obligations)/input.verified_monthly_income,0,1):0;
  const affordability=clamp(netRatio/0.5,0,1);
  const workContinuity=clamp(input.verified_work_months/36,0,1);
  features.push({key:"income_stability",label:"Income stability",value:incomeStability,baseline:0.5,weight:0.25,observed:input.income_variation_percent+"% income variation"});
  features.push({key:"affordability",label:"Net income after obligations",value:affordability,baseline:0.5,weight:0.20,observed:"Net income ratio "+Math.round(netRatio*100)+"%"});
  features.push({key:"verified_work_continuity",label:"Verified work continuity",value:workContinuity,baseline:0.5,weight:0.15,observed:input.verified_work_months+" verified months"});
  const totalWeight=features.reduce((sum,f)=>sum+f.weight,0);
  const normalized=features.map(f=>({...f,normalizedWeight:f.weight/totalWeight}));
  const scoreForMask=mask=>{
    let weighted=0;
    normalized.forEach((f,i)=>{const bit=1<<i;weighted+=f.normalizedWeight*((mask&bit)?f.value:f.baseline);});
    return clamp(300+550*weighted,300,850);
  };
  const n=normalized.length,factorial=n=>{let out=1;for(let k=2;k<=n;k++)out*=k;return out;};
  const shap=normalized.map((f,i)=>{
    let value=0;
    const others=((1<<n)-1)^(1<<i);
    for(let subset=0;subset<(1<<n);subset++){
      if(subset&~others)continue;
      const size=subset.toString(2).replace(/0/g,"").length;
      const weight=factorial(size)*factorial(n-size-1)/factorial(n);
      value+=weight*(scoreForMask(subset|(1<<i))-scoreForMask(subset));
    }
    return {...f,shap_value:Math.round(value*100)/100};
  });
  const baseValue=scoreForMask(0),rawOutput=scoreForMask((1<<n)-1);
  const trustcredScore=Math.max(300,Math.min(850,Math.round(rawOutput)));
  const netMonthlyIncome=Math.max(0,input.verified_monthly_income-input.monthly_obligations);
  const eligibleAmount=Math.max(0,Math.min(300000,Math.round(netMonthlyIncome*0.30*input.tenure_months/1000)*1000));
  const explanation={
    method:"Exact Shapley attribution over all feature coalitions for the additive evidence-linear-v2 score function",
    model_version:"evidence-linear-v2",
    base_value:Math.round(baseValue*100)/100,
    model_output:Math.round(rawOutput*100)/100,
    predicted_score:trustcredScore,
    unit:"score points relative to the model baseline",
    baseline_definition:"Each available feature is set to a neutral baseline of 0.50; utility history is included only when at least three utility bills were reviewed.",
    contributions:shap.map(f=>({feature:f.label,key:f.key,value:Math.round(f.value*1000)/1000,baseline_value:f.baseline,weight:Math.round(f.normalizedWeight*1000)/1000,shap_value:f.shap_value,observed:f.observed,direction:f.shap_value>0.005?"increases score":f.shap_value< -0.005?"decreases score":"near baseline"})),
    limitations:"This is exact SHAP-style Shapley attribution for Trustcred's disclosed, hand-specified additive scoring function, not a trained or externally validated credit-risk model. Baseline choices affect attribution. It must support human review, not automatically determine creditworthiness.",
    bill_history_available:billScore!==null
  };
  return {trustcredScore,billScore,eligibleAmount,incomeStability,affordability,workContinuity,explanation};
}
export default async function(req,res){
  const actor=await requireActor(req,res,["lender","loanofficer"]);
  if(!actor)return;
  if(req.method==="GET"){
    const applicationId=String(req.query?.application_id||"").trim().slice(0,100);
    if(!applicationId)return res.status(400).json({error:"An application ID is required."});
    const app=await getApplication(applicationId);
    if(!app)return res.status(404).json({error:"Application not found."});
    if(actor.role==="lender"&&Number(app.assigned_lender_user_id)!==Number(actor.id))return res.status(404).json({error:"This application is not assigned to your reviewing lender account."});
    const result=await db.query("SELECT e.application_id,e.prepared_by_user_id,u.full_name AS prepared_by,e.verified_monthly_income,e.income_variation_percent,e.bank_statement_months,e.utility_bills_reviewed,e.utility_bills_on_time,e.utility_bills_late,e.utility_bills_missed,e.verified_work_months,e.monthly_obligations,e.evidence_notes,e.score_version,e.model_version,e.shap_explanation,e.trustcred_score,e.bill_payment_score,e.estimated_eligible_amount,e.created_at,e.updated_at FROM evidence_assessments e JOIN app_users u ON u.id=e.prepared_by_user_id WHERE e.application_id=$1 ORDER BY e.created_at DESC LIMIT 1",[applicationId]);
    return res.json({assessment:result.rows[0]||null});
  }
  if(actor.role!=="lender")return res.status(403).json({error:"Only the assigned reviewing lender can enter source measurements. The LoanOfficer reviews SHAP and records the final decision."});
  const applicationId=String(req.body?.application_id||"").trim().slice(0,100);
  if(!applicationId)return res.status(400).json({error:"An application ID is required."});
  const app=await getApplication(applicationId);
  if(!app||Number(app.assigned_lender_user_id)!==Number(actor.id))return res.status(404).json({error:"This application is not assigned to your reviewing lender account."});
  if(app.status!=="under_assessment")return res.status(409).json({error:"Complete document verification before preparing the evidence assessment."});
  if(app.lender_recommendation||app.admin_decision)return res.status(409).json({error:"The assessment is locked after a recommendation or final decision."});
  const docs=await getDocumentRows(applicationId),currentDocs=docs.filter(d=>d.status!=="superseded");
  const missing=requiredDocs.filter(type=>!currentDocs.some(d=>d.doc_type===type&&d.status==="verified")),pending=currentDocs.filter(d=>d.status!=="verified");
  if(missing.length||pending.length)return res.status(409).json({error:"Assessment is locked until all required documents are verified. "+(missing.length?"Missing: "+missing.map(h=>h.replaceAll("_"," ")).join(", ")+". ":"")+(pending.length?pending.length+" document(s) still need review.":"")});
  const body=req.body||{};
  const input={verified_monthly_income:num(body.verified_monthly_income),income_variation_percent:num(body.income_variation_percent),bank_statement_months:num(body.bank_statement_months),utility_bills_reviewed:num(body.utility_bills_reviewed??0),utility_bills_on_time:num(body.utility_bills_on_time??0),utility_bills_late:num(body.utility_bills_late??0),utility_bills_missed:num(body.utility_bills_missed??0),verified_work_months:num(body.verified_work_months),monthly_obligations:num(body.monthly_obligations??0),evidence_notes:String(body.evidence_notes||"").trim().slice(0,1200),tenure_months:Number(app.tenure_months)};
  if(!Number.isFinite(input.verified_monthly_income)||input.verified_monthly_income<=0||input.verified_monthly_income>10000000)return res.status(400).json({error:"Enter the monthly income verified against source documents."});
  if(!Number.isFinite(input.monthly_obligations)||input.monthly_obligations<0||input.monthly_obligations>10000000)return res.status(400).json({error:"Enter valid monthly debt and recurring obligations."});
  if(!Number.isFinite(input.income_variation_percent)||input.income_variation_percent<0||input.income_variation_percent>200)return res.status(400).json({error:"Income variation must be between 0% and 200%."});
  if(!int(input.bank_statement_months)||input.bank_statement_months<1||input.bank_statement_months>36)return res.status(400).json({error:"Bank statement review period must be 1–36 months."});
  if(![input.utility_bills_reviewed,input.utility_bills_on_time,input.utility_bills_late,input.utility_bills_missed].every(int)||input.utility_bills_reviewed<0||input.utility_bills_reviewed>60||input.utility_bills_on_time<0||input.utility_bills_late<0||input.utility_bills_missed<0||input.utility_bills_on_time+input.utility_bills_late+input.utility_bills_missed>input.utility_bills_reviewed)return res.status(400).json({error:"Bill-payment counts must be non-negative and the known on-time, late, and missed counts cannot exceed bills reviewed."});
  if(!int(input.verified_work_months)||input.verified_work_months<0||input.verified_work_months>600)return res.status(400).json({error:"Verified work history must be between 0 and 600 months."});
  if(input.evidence_notes.length<15)return res.status(400).json({error:"Add at least 15 characters explaining which documents and periods support the figures."});
  const result=buildModel(input);
  await db.query("INSERT INTO evidence_assessments(application_id,prepared_by_user_id,verified_monthly_income,income_variation_percent,bank_statement_months,utility_bills_reviewed,utility_bills_on_time,utility_bills_late,utility_bills_missed,verified_work_months,monthly_obligations,evidence_notes,score_version,model_version,shap_explanation,trustcred_score,bill_payment_score,estimated_eligible_amount) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'evidence-linear-v2','evidence-linear-v2',$13::jsonb,$14,$15,$16)",[applicationId,actor.id,input.verified_monthly_income,input.income_variation_percent,input.bank_statement_months,input.utility_bills_reviewed,input.utility_bills_on_time,input.utility_bills_late,input.utility_bills_missed,input.verified_work_months,input.monthly_obligations,input.evidence_notes,JSON.stringify(result.explanation),result.trustcredScore,result.billScore,result.eligibleAmount]);
  await db.query("UPDATE applications SET trustcred_score=$1,bill_payment_score=$2,eligible_amount=$3,status='loanofficer_review',updated_at=now() WHERE id=$4",[result.trustcredScore,result.billScore,result.eligibleAmount,applicationId]);
  await writeAudit(applicationId,actor.role,actor.display_name,"Prepared evidence-linear-v2 assessment with SHAP attribution","Score "+result.trustcredScore+"/850; estimated amount "+result.eligibleAmount+"; SHAP base "+result.explanation.base_value+"; feature attributions: "+result.explanation.contributions.map(x=>x.feature+" "+x.shap_value).join(", ")+". Source notes: "+input.evidence_notes,actor.id);
  return res.json({ok:true,assessment:{trustcred_score:result.trustcredScore,bill_payment_score:result.billScore,estimated_eligible_amount:result.eligibleAmount,score_version:"evidence-linear-v2",model_version:"evidence-linear-v2",income_stability:result.incomeStability,affordability:result.affordability,work_continuity:result.workContinuity,shap_explanation:result.explanation},message:"Assessment and exact Shapley attribution saved. The application is now in the LoanOfficer decision queue. The evidence model is transparent but has not been validated against real repayment outcomes."});
}