(() => {
  "use strict";
  const API = (window.__HATCHABLE__ && window.__HATCHABLE__.api) || "/api";
  const $ = function (s) { return document.querySelector(s); };
  const s = {role:null, user:null, loanofficerExists:false, data:null, view:"overview", id:null, detail:null, lastLenderCode:null, selectedCustomerEmail:null};
  const labels = {customer:"Customer", lender:"Lender", loanofficer:"LoanOfficer"};
  const menus = {
    customer:[["overview","⌂","Overview"],["applications","▤","My applications"],["new","＋","New application"]],
    lender:[["overview","⌂","Overview"],["queue","▤","Document queue"],["assessment","◌","Score & eligibility"],["lenders","◎","Lender directory"]],
    loanofficer:[["overview","⌂","Overview"],["applications","▤","All applications"],["decisions","✓","Decision queue"],["customers","♙","Customers"],["lenders","◎","Lenders & performance"],["audit","≡","Audit trail"]]
  };
  function el(tag, cls, text, parent) {
    const n=document.createElement(tag);
    if(cls)n.className=cls;
    if(text!==undefined&&text!==null)n.textContent=String(text);
    if(parent)parent.appendChild(n);
    return n;
  }
  function btn(label, cls, attrs, parent) {
    const b=el("button","btn "+(cls||"btn-light"),label,parent);
    b.type="button";
    Object.keys(attrs||{}).forEach(k=>b.setAttribute(k,attrs[k]));
    return b;
  }
  function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c];});}
  function cash(v){return v==null||v===""?"—":"₹"+Math.round(Number(v)||0).toLocaleString("en-IN");}
  function date(v){if(!v)return "—";const d=new Date(v);return isNaN(d.getTime())?"—":d.toLocaleDateString("en-IN",{day:"2-digit",month:"short",year:"numeric"});}
  function human(v){return String(v||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());}
  function status(v){return ({draft:"Draft",submitted:"Submitted",document_review:"Document review",documents_returned:"Documents returned",under_assessment:"Under assessment",loanofficer_review:"LoanOfficer decision pending",approved:"Approved",funded:"Loan funded",rejected:"Rejected",information_requested:"More information requested",pending:"Pending review",verified:"Verified",invalid:"Needs correction"}[v]||human(v));}
  function pill(v,parent){el("span","status-pill "+(v||"pending"),status(v),parent);}
  function toast(msg,bad){const n=el("div","toast "+(bad?"error":"success"),msg,$("#toast-root"));setTimeout(()=>n.remove(),4200);}
  async function api(path,opts,withoutToken){
    opts=opts||{};const headers=Object.assign({},opts.headers||{});
    if(opts.body&&!(opts.body instanceof FormData)&&typeof opts.body!=="string"){headers["Content-Type"]="application/json";opts.body=JSON.stringify(opts.body);}
    const r=await fetch(API+path,Object.assign({},opts,{headers:headers,credentials:"same-origin"}));
    const t=await r.text();let j={};try{j=t?JSON.parse(t):{};}catch(e){j={error:t||"Unexpected server response"};}
    if(!r.ok){const err=new Error(j.error||j.detail||("Request failed "+r.status));err.details=j;throw err;}
    return j;
  }
  async function signOut(){
    try { await api("/account/logout",{method:"POST"}); } catch {}
    s.role=null;s.user=null;s.data=null;s.detail=null;s.id=null;
    $("#app").classList.remove("hidden");$("#workspace").classList.add("hidden");$("#modal-root").innerHTML="";
  }
  async function login(role){ authModal(role,"login"); }
  async function startSession(user){
    s.role=user.role;s.user=user;s.view="overview";s.id=null;s.detail=null;
    $("#modal-root").innerHTML="";$("#app").classList.add("hidden");$("#workspace").classList.remove("hidden");
    await refresh();
  }
  function authModal(role,mode,values){
    values=values||{};mode=mode||"login";
    const label=({customer:"Customer",lender:"Lender",loanofficer:"LoanOfficer"})[role]||"Customer";
    if(role==="loanofficer"&&mode==="setup"&&s.adminExists)mode="login";
    let title=mode==="login"?label+" sign in":mode==="register"?(role==="lender"?"Lender eligibility & registration":"Create customer account"):mode==="lender_eligible"?"Lender access code issued":mode==="ineligible"?"Eligibility requirements not met":mode==="verify"?"Verify your email":mode==="setup"?"Initialize the LoanOfficer account":mode==="reset_request"?"Reset your password":"Choose a new password";
    let subtitle=role==="lender"?(mode==="login"?"Use your email, password, and the access code shown after you pass lender eligibility screening.":mode==="lender_eligible"?"Save this one-time code now. You will need it on every future lender sign-in.":mode==="ineligible"?"Your application was screened against the criteria shown below. Update your details and try again.":"Complete the organization details. Qualifying applicants receive a lender access code immediately, without email verification."):role==="loanofficer"?"Only the single LoanOfficer email configured by the site owner can access this account.":"Create an account to save and track your loan applications.";
    let fields="";
    const field=(label,name,type,required,placeholder,autocomplete)=>'<div class="form-field"><label for="auth-'+name+'">'+label+'</label><input class="field" id="auth-'+name+'" name="'+name+'" type="'+(type||"text")+'" '+(required?"required":"")+(placeholder?' placeholder="'+esc(placeholder)+'"':"")+(autocomplete?' autocomplete="'+autocomplete+'"':"")+'></div>';
    if(mode==="login"){
      fields=field("Email address","email","email",true,"you@example.com","email")+
        field("Password","password","password",true,"At least 12 characters","current-password")+
        (role==="lender"?field("Lender access code *","admin_code","text",true,"Code shown after registration or rotated by LoanOfficer","off"):"")+
        '<div class="field-hint">Use the email and password registered for this account.</div>';
    }else if(mode==="register"){
      if(role==="lender"){
        fields=field("Full name","full_name","text",true,"Your full legal name","name")+
          field("Email address","email","email",true,"you@example.com","email")+
          field("Password","password","password",true,"12+ chars, upper/lowercase and a number","new-password")+
          field("Confirm password","confirm_password","password",true,"Re-enter your password","new-password")+
          field("Legal organization name","organization_name","text",true,"Registered institution/company name","organization")+
          '<div class="form-field"><label for="auth-institution_type">Organization type</label><select class="field" id="auth-institution_type" name="institution_type" required><option value="">Select organization type</option><option value="bank">Bank</option><option value="nbfc">NBFC / regulated finance company</option><option value="microfinance">Microfinance institution</option><option value="cooperative">Cooperative credit institution</option><option value="registered_fintech">Registered fintech lender</option><option value="ngo_mfi">NGO / microfinance lender</option><option value="other_registered_lender">Other registered lender</option></select></div>'+
          field("Registration / lending-license number","registration_number","text",true,"Use the official registration ID","off")+
          '<div class="form-field"><label for="auth-business_address">Registered business address</label><textarea class="field" id="auth-business_address" name="business_address" rows="3" required placeholder="Complete registered address"></textarea></div>'+
          field("Business phone","business_phone","tel",true,"10–15 digits, country code allowed","tel")+
          field("Years the organization has operated","years_experience","number",true,"Minimum 2 years","off")+
          field("Annual lending / disbursement capacity (₹)","annual_lending_capacity","number",true,"Minimum 500000","off")+
          '<div class="form-field"><label class="check-row"><input type="checkbox" name="certify_registration" required> I confirm this organization is legally registered and authorized to provide lending or financing.</label></div>'+
          '<div class="field-hint">Initial screen: 2+ years operating, registration/license ID, complete business contact details, and declared annual capacity of at least ₹5,00,000. This screen does not independently verify regulatory registration.</div>';
      }else{
        fields=field("Full name","full_name","text",true,"Your name","name")+
          field("Email address","email","email",true,"you@example.com","email")+
          field("Password","password","password",true,"12+ chars, upper/lowercase and a number","new-password")+
          field("Confirm password","confirm_password","password",true,"Re-enter your password","new-password")+
          '<div class="field-hint">Your password is stored as a secure PBKDF2 hash. You can sign in immediately; no email verification is required.</div>';
      }
    }else if(mode==="lender_eligible"){
      fields='<div class="inline-alert alert-success"><b>Initial eligibility screen passed.</b><p>Your lender account is ready. Save this access code now; it is shown only once on this screen.</p><code style="font-size:18px;letter-spacing:2px;background:white;padding:8px 10px;border-radius:6px;display:inline-block;margin:6px 0">'+esc(values.access_code||"")+'</code> <button type="button" class="btn btn-light btn-small" data-copy-code="1">Copy access code</button><p class="field-hint">You must enter this code at every lender sign-in. The LoanOfficer can later revoke or rotate it. Your submitted registration details have not been independently checked against a regulator.</p></div>';
    }else if(mode==="ineligible"){
      fields='<div class="inline-alert alert-warning"><b>Your registration did not pass the initial screen.</b><p>Correct these items and submit again:</p><ul>'+((values.reasons||[]).map(function(reason){return "<li>"+esc(reason)+"</li>";}).join(""))+'</ul></div>';
    }else if(mode==="verify"){
      fields=(values.email?'<input type="hidden" name="email" value="'+esc(values.email)+'">':field("Email address","email","email",true,"you@example.com","email"))+
        field("6-digit code","code","text",true,"123456","one-time-code")+
        '<div class="field-hint">'+(values.email_sent===false?'Your account was created, but the email service did not confirm delivery. Check email delivery settings, then use Resend verification code.':'The code expires in 10 minutes. Check your inbox and spam folder.')+'</div>';
    }else if(mode==="setup"){
      fields=field("LoanOfficer full name","full_name","text",true,"LoanOfficer name","name")+
        field("Configured LoanOfficer email","email","email",true,"Must match site owner configuration","email")+
        field("LoanOfficer password","password","password",true,"12+ chars, upper/lowercase and a number","new-password")+
        field("One-time setup code","bootstrap_code","password",true,"Provided privately by site owner","off")+
        '<div class="inline-alert alert-warning">Before first setup, the site owner must configure <code>TRUSTCRED_LOANOFFICER_EMAIL</code> and <code>TRUSTCRED_LOANOFFICER_BOOTSTRAP_CODE</code> in the hosting project’s Setup settings. This form can create only one LoanOfficer account.</div>';
    }else if(mode==="reset_request"){
      fields=field("Account email","email","email",true,"you@example.com","email")+
        '<div class="field-hint">If an account exists for this email, password-reset instructions will be provided.</div>';
    }else if(mode==="reset_complete"){
      fields='<input type="hidden" name="email" value="'+esc(values.email||"")+'">'+field("6-digit reset code","code","text",true,"123456","one-time-code")+
        field("New password","new_password","password",true,"12+ chars, upper/lowercase and a number","new-password")+
        '<div class="field-hint">This resets your password and signs out all existing sessions.</div>';
    }
    let primary=mode==="login"?"Sign in":mode==="register"?"Submit eligibility check":mode==="lender_eligible"?"Continue to lender dashboard":mode==="ineligible"?"Edit registration details":mode==="verify"?"Verify and continue":mode==="setup"?"Create the single LoanOfficer account":mode==="reset_request"?"Send reset code":"Change password";
    let links="";
    if(mode==="login"){
      if(role==="customer")links+='<button type="button" class="panel-action" data-auth-mode="register" data-role="customer">Create customer account</button>';
      if(role==="lender")links+='<button type="button" class="panel-action" data-auth-mode="register" data-role="lender">Register / check lender eligibility</button>';
      links+='<button type="button" class="panel-action" data-auth-mode="reset_request" data-role="'+role+'">Forgot password?</button>';
      if(role==="loanofficer"&&!s.adminExists)links+='<button type="button" class="panel-action" data-auth-mode="setup" data-role="loanofficer">First-time LoanOfficer setup</button>';
    }else if(mode==="register"){
      links+='<button type="button" class="panel-action" data-auth-mode="login" data-role="'+role+'">Already have an account? Sign in</button>';
    }else if(mode==="lender_eligible"){
    }else if(mode==="ineligible"){
    }else if(mode==="verify"){
      links+='<button type="button" class="panel-action" data-auth-mode="resend" data-role="'+role+'" data-email="'+esc(values.email||"")+'">Resend verification code</button>';
    }else if(mode==="setup"){
      links+='<button type="button" class="panel-action" data-auth-mode="login" data-role="loanofficer">Back to LoanOfficer sign in</button>';
    }else if(mode==="reset_request"){
      links+='<button type="button" class="panel-action" data-auth-mode="login" data-role="'+role+'">Back to sign in</button>';
    }else if(mode==="reset_complete"){
      links+='<button type="button" class="panel-action" data-auth-mode="login" data-role="'+role+'">Back to sign in</button>';
    }
    const html='<form id="account-form" data-role="'+role+'" data-mode="'+mode+'" '+(values.email?'data-email="'+esc(values.email)+'"':"")+'><div class="form-grid" style="grid-template-columns:1fr">'+fields+'</div><div class="form-actions"><button class="btn btn-primary" type="submit">'+primary+' →</button></div><div class="form-actions" style="justify-content:space-between;flex-wrap:wrap">'+links+'</div></form>';
    $("#modal-root").innerHTML='<div class="modal-backdrop" data-dismiss><div class="modal" role="dialog" aria-modal="true" aria-label="'+esc(title)+'"><div class="modal-header"><div><h2>'+esc(title)+'</h2><p>'+esc(subtitle)+'</p></div><button class="modal-close" type="button" data-dismiss aria-label="Close">×</button></div><div class="modal-content">'+html+'<div class="sidebar-disclaimer" style="color:#7d8b85;margin-top:12px">Never share passwords or lender access codes. Use a unique password for Trustcred.<br><a href="/privacy.html" target="_blank" rel="noopener">Privacy Notice</a> · <a href="/terms.html" target="_blank" rel="noopener">Terms of Use</a></div></div></div></div>';
  }
  async function authSubmit(form){
    const data=Object.fromEntries(new FormData(form).entries());
    const role=form.dataset.role,mode=form.dataset.mode;
    try{
      if(mode==="login"){
        const result=await api("/account/login",{method:"POST",body:{role:role,email:data.email,password:data.password,admin_code:data.admin_code||""}});
        s.adminExists=true;
        const statusResult=await api("/account/status");
        s.adminExists=!!statusResult.loanofficer_exists;
        return startSession(result.user);
      }
      if(mode==="register"){
        if(data.password!==data.confirm_password)throw new Error("The passwords do not match.");
        const path=role==="lender"?"/account/lender-register":"/account/register";
        const body={full_name:data.full_name,email:data.email,password:data.password};
        if(role==="lender"){
          Object.assign(body,{
            organization_name:data.organization_name,
            institution_type:data.institution_type,
            registration_number:data.registration_number,
            business_address:data.business_address,
            business_phone:data.business_phone,
            years_experience:data.years_experience,
            annual_lending_capacity:data.annual_lending_capacity,
            certify_registration:data.certify_registration||""
          });
        }
        const result=await api(path,{method:"POST",body});
        if(role==="lender"){
          s.justRegisteredLender=result.user;
          s.lastLenderCode={email:data.email,full_name:data.full_name,access_code:result.access_code};
          return authModal("lender","lender_eligible",{email:data.email,access_code:result.access_code});
        }
        toast(result.message||"Account created.");
        return startSession(result.user);
      }
      if(mode==="lender_eligible"){
        const user=s.justRegisteredLender;
        s.justRegisteredLender=null;
        if(user)return startSession(user);
        return authModal("lender","login");
      }
      if(mode==="ineligible"){
        return authModal("lender","register");
      }
      if(mode==="verify"){
        const result=await api("/account/verify-email",{method:"POST",body:{email:data.email,code:data.code}});
        if(result.user)return startSession(result.user);
        toast(result.message||"Email verified. Please sign in.");
        return authModal(role,"login");
      }
      if(mode==="setup"){
        const result=await api("/account/loanofficer-setup",{method:"POST",body:{full_name:data.full_name,email:data.email,password:data.password,bootstrap_code:data.bootstrap_code}});
        s.adminExists=true;toast(result.message||"LoanOfficer initialized.");return startSession(result.user);
      }
      if(mode==="reset_request"){
        const result=await api("/account/password-reset",{method:"POST",body:{action:"request",email:data.email}});
        toast(result.message||"If the account exists, a code has been sent.");
        return authModal(role,"reset_complete",{email:data.email});
      }
      if(mode==="reset_complete"){
        const result=await api("/account/password-reset",{method:"POST",body:{action:"complete",email:data.email,code:data.code,new_password:data.new_password}});
        toast(result.message||"Password changed. Please sign in.");return authModal(role,"login");
      }
    }catch(err){
      if(role==="lender"&&mode==="register"&&Array.isArray(err.details?.reasons))return authModal("lender","ineligible",{reasons:err.details.reasons});
      toast(err.message,true);
    }
  }
  async function refresh(){s.data=await api("/dashboard");render();}
  async function openApp(id){
    s.id=id;s.view="detail";renderHeader();$("#workspace-content").innerHTML='<div class="loading">Loading application…</div>';
    try{s.detail=await api("/applications/"+encodeURIComponent(id));render();}
    catch(e){toast(e.message,true);}
  }
  function renderHeader(){
    $("#side-nav").innerHTML="";
    (menus[s.role]||[]).forEach(n=>{
      const b=el("button","nav-item "+(s.view===n[0]?"active":""),null,$("#side-nav"));
      b.dataset.view=n[0];el("span","nav-icon",n[1],b);el("span","",n[2],b);
    });
    $("#role-badge").textContent=labels[s.role]||"Demo";
    const titles={overview:"Overview",applications:s.role==="customer"?"My applications":"All applications",new:"New application",queue:"Document queue",assessment:"Score & eligibility",decisions:"LoanOfficer decision queue",customers:"Customers",lenders:"Lenders & performance",audit:"Audit trail",detail:"Application details"};
    $("#page-title").textContent=titles[s.view]||"Overview";
    $("#breadcrumb").textContent="Workspace / "+labels[s.role]+" / "+$("#page-title").textContent;
  }
  function panel(title,sub,parent){
    const p=el("section","panel",null,parent);
    const h=el("div","panel-head",null,p);
    const wrap=el("div","",null,h);
    el("div","panel-title",title,wrap);
    if(sub)el("div","panel-subtitle",sub,wrap);
    const body=el("div","panel-body",null,p);
    return body;
  }
  function intro(title,desc,action,target,parent){
    const d=el("div","page-intro",null,parent);const left=el("div","",null,d);
    el("h2","",title,left);el("p","",desc,left);
    if(action)btn(action,"btn-primary btn-small",{"data-view":target},d);
  }
  function metricGrid(items,parent){
    const g=el("div","metric-grid",null,parent);
    items.forEach(it=>{
      const c=el("div","metric-card",null,g),t=el("div","metric-top",null,c);
      el("span","",it[0],t);el("span","metric-icon",it[3],t);
      el("div","metric-value",it[1],c);el("div","metric-caption",it[2],c);
    });
  }
  function appTable(apps,title,parent){
    const p=el("section","panel",null,parent),head=el("div","panel-head",null,p);
    const ht=el("div","",null,head);el("div","panel-title",title,ht);
    el("div","panel-subtitle","Select an application to open its details",ht);
    if(!apps.length){el("div","empty-state","No applications in this queue.",p);return;}
    const wrap=el("div","table-wrap",null,p),table=el("table","",null,wrap);
    table.innerHTML="<thead><tr><th>APPLICANT</th><th>REQUEST</th><th>SCORE</th><th>STATUS</th><th>UPDATED</th><th></th></tr></thead>";
    const body=el("tbody","",null,table);
    apps.forEach(a=>{
      const tr=el("tr","",null,body),td=el("td","",null,tr);
      const who=el("button","person-cell",null,td);who.style.cssText="border:0;background:transparent;padding:0;text-align:left";who.dataset.open=a.id;
      el("span","person-avatar",String(a.customer_name||"D").split(/\s+/).map(x=>x[0]||"").slice(0,2).join("").toUpperCase(),who);
      const name=el("span","",null,who);el("span","person-name",a.customer_name,name);el("span","person-meta",a.id+" · "+(a.city||"—"),name);
      el("td","",cash(a.requested_amount),tr);el("td","",a.trustcred_score||"—",tr);const st=el("td","",null,tr);pill(a.status,st);el("td","",date(a.updated_at||a.created_at),tr);
      const action=el("td","",null,tr);const open=el("button","tiny-btn","Open ↗",action);open.dataset.open=a.id;
    });
  }
  function overview(root){
    const d=s.data||{},m=d.metrics||{},apps=d.applications||[];
    if(s.role==="customer"){
      intro("Welcome to Trustcred","Create an application, upload real supporting records, and track lender verification, the LoanOfficer decision, and disbursement.","New application","new",root);
      metricGrid([["Applications",m.applications||0,"Private to your account","▤"],["In review",m.inReview||0,"Awaiting human review","◷"],["Approved",m.approved||0,"LoanOfficer decisions","✓"],["Funded",m.funded||0,"Disbursement recorded","₹"]],root);
      appTable(apps,"Your applications",root);return;
    }
    if(s.role==="lender"){
      intro("Lender overview","Verify only assigned evidence, record source-backed measurements, and disburse an approved loan only when it is assigned to you.",null,null,root);
      metricGrid([["Reviewed applications",m.reviewedApplications||0,"Document verification queue","▤"],["Document review",m.documentReview||0,"Evidence checks","◷"],["Assessments",m.assessments||0,"SHAP sent to LoanOfficer","◌"],["Loans to fund",m.loansToFund||0,"Approved and assigned to you","↗"],["Loans funded",m.loansFunded||0,m.totalFunded?cash(m.totalFunded)+" disbursed":"No disbursement recorded","₹"]],root);
      appTable(apps,"Applications assigned to your lender account",root);return;
    }
    intro("LoanOfficer overview","Verify the complete customer record, review the SHAP explanation, decide with a written rationale, and monitor each lender's real disbursements.","Review decision queue","decisions",root);
    metricGrid([["Applications",m.applications||0,"All customer applications","▤"],["Registered customers",m.customerAccounts||0,"All customer accounts","♙"],["Pending decisions",m.pendingDecision||0,"Ready for LoanOfficer review","◷"],["Approved",m.approved||0,"Approval is not disbursement","✓"],["Loans funded",m.funded||0,cash(m.totalFunded||0)+" total disbursed","₹"]],root);
    appTable(apps.filter(a=>a.status==="loanofficer_review"),"Awaiting LoanOfficer decision",root);
  }
  function formField(form,label,name,type,required,placeholder){
    const wrap=el("div","form-field",null,form);el("label","",label,wrap);
    let input;
    if(type==="textarea"){input=el("textarea","textarea-field",null,wrap);}
    else{input=el("input","field",null,wrap);input.type=type||"text";}
    input.name=name;input.required=!!required;if(placeholder)input.placeholder=placeholder;
    return input;
  }
  function newApplication(root){
    intro("New loan application","Your name and email come from your registered account. Provide accurate application details and read the consent notice before submitting.",null,null,root);
    const formBody=panel("Applicant and loan details","Your account identity is used for this application",root);
    const form=el("form","",null,formBody);form.id="application-form";
    const grid=el("div","form-grid",null,form);
    const accountName=formField(grid,"Account name","customer_name","text",true,"");accountName.value=s.user?.full_name||"";accountName.readOnly=true;
    const accountEmail=formField(grid,"Account email","customer_email","email",true,"");accountEmail.value=s.user?.email||"";accountEmail.readOnly=true;
    formField(grid,"Customer phone number","phone","tel",false,"Optional contact number");
    formField(grid,"City / district","city","text",false,"Enter city or district");
    const work=el("div","form-field",null,grid);el("label","", "Work profile *",work);const sel=el("select","select-field",null,work);sel.name="work_type";
    ["Gig worker","Microenterprise","Self-employed","Home business","Platform worker"].forEach(v=>el("option","",v,sel));
    formField(grid,"Business / platform","business_name","text",false,"Delivery partner, home bakery…");
    const income=formField(grid,"Monthly income (₹) *","monthly_income","number",true,"35000");income.min="1";
    const vintage=formField(grid,"Activity history (months) *","vintage_months","number",true,"12");vintage.min="0";vintage.value="12";
    const amount=formField(grid,"Requested amount (₹) *","requested_amount","number",true,"60000");amount.min="1000";
    const tenure=el("div","form-field",null,grid);el("label","","Repayment tenure",tenure);const ts=el("select","select-field",null,tenure);ts.name="tenure_months";
    [6,12,18,24,36,60].forEach(v=>{const op=el("option","",v+" months",ts);op.value=v;if(v===12)op.selected=true;});
    formField(grid,"Purpose of loan *","purpose","textarea",true,"Business stock, equipment, repairs…");
    const consent=el("div","form-field wide",null,grid),lab=el("label","checkbox-row",null,consent),cb=el("input","",null,lab);cb.type="checkbox";cb.name="consent_alt_data";cb.required=true;
    const consentText=el("span","",null,lab);
    consentText.append(document.createTextNode("I confirm the information is accurate and consent to Trustcred processing my application details and uploaded financial evidence for assessment. I have read "));
    const privacyLink=el("a","text-link","Privacy Notice",consentText);privacyLink.href="/privacy.html";privacyLink.target="_blank";privacyLink.rel="noopener";
    consentText.append(document.createTextNode(" and "));
    const termsLink=el("a","text-link","Terms of Use",consentText);termsLink.href="/terms.html";termsLink.target="_blank";termsLink.rel="noopener";
    consentText.append(document.createTextNode(". I understand the evidence index is not a validated credit-risk model."));
    const actions=el("div","form-actions",null,form);btn("Cancel","btn-light",{"data-view":"overview"},actions);const submit=btn("Create application →","btn-primary",{},actions);submit.type="submit";
  }
  function scoreCard(a,parent){
    const b=panel("Trustcred evidence index","Calculated from metrics extracted from verified source documents",parent);
    if(!a.trustcred_score){el("p","score-warning","The lender must verify the required documents, then enter the observed income, bill-payment, obligation and work-history metrics. A score is not generated from document counts alone.",b);return;}
    el("div","big-score",a.trustcred_score+" / 850",b);
    const bar=el("div","score-bar",null,b),sp=el("span","",null,bar);sp.style.width=Math.min(100,(Number(a.trustcred_score)-300)/5.5)+"%";
    const row=el("div","factor",null,b);el("span","","Verified bill-payment record",row);el("strong","",a.bill_payment_score===null||a.bill_payment_score===undefined?"Not enough verified bills":a.bill_payment_score+" / 100",row);
    const row2=el("div","factor",null,b);el("span","","Repayment-capacity estimate",row2);el("strong","",cash(a.eligible_amount),row2);
    el("p","score-warning","Model v2: disclosed evidence features with exact Shapley feature contributions displayed for authorized reviewers. This is not trained or validated against real repayment outcomes or a credit-bureau score and must not be the sole basis for lending.",b);
  }
  function evidenceAssessmentForm(a,parent){
    const formBody=panel("Structured evidence assessment","Enter observations from the verified source documents, not estimates or assumptions.",parent);
    const form=el("form","panel-body",null,formBody);form.id="evidence-assessment-form";form.dataset.app=a.id;
    el("p","inline-alert alert-warning","Use the verified income proof and bank statement to record income and existing obligations. Count bill payment history only where the dates and payments can be matched to the documents.",form);
    const grid=el("div","form-grid",null,form);
    const income=formField(grid,"Verified monthly income (₹) *","verified_monthly_income","number",true,"Monthly income confirmed from evidence");income.min="1";income.max="10000000";income.step="0.01";
    const variation=formField(grid,"Income variation over review period (%) *","income_variation_percent","number",true,"e.g. 24");variation.min="0";variation.max="200";variation.step="0.1";
    const statement=formField(grid,"Bank statement period reviewed (months) *","bank_statement_months","number",true,"e.g. 6");statement.min="1";statement.max="36";
    const work=formField(grid,"Verified work/business history (months) *","verified_work_months","number",true,"Only evidence-supported months");work.min="0";work.max="600";
    const obligations=formField(grid,"Existing monthly debt/obligations (₹) *","monthly_obligations","number",true,"Use source evidence where available");obligations.min="0";obligations.max="10000000";obligations.step="0.01";
    const bills=formField(grid,"Utility bills reviewed","utility_bills_reviewed","number",true,"0 if none can be verified");bills.min="0";bills.max="60";bills.value="0";
    const ontime=formField(grid,"Bills paid on time","utility_bills_on_time","number",true,"Verified count");ontime.min="0";ontime.max="60";ontime.value="0";
    const late=formField(grid,"Bills paid late","utility_bills_late","number",true,"Verified count");late.min="0";late.max="60";late.value="0";
    const missed=formField(grid,"Bills missed / unpaid","utility_bills_missed","number",true,"Verified count");missed.min="0";missed.max="60";missed.value="0";
    const notes=formField(grid,"Evidence notes *","evidence_notes","textarea",true,"List which documents/periods support the entered figures and any limitations.");notes.minLength=15;notes.maxLength=1200;notes.placeholder="Example: Reviewed six months of bank statements; income variation computed from monthly credits. Matched eight utility bills to payment records.";
    const actions=el("div","form-actions",null,form);const save=btn("Save evidence assessment →","btn-primary",{},actions);save.type="submit";
    el("p","field-hint","Trustcred Evidence Index v1 uses a disclosed formula. It is not validated against actual repayment outcomes and must not be the sole basis for a lending decision.",form);
  }
  function evidenceAssessmentSummary(assessment,parent){
    const body=panel("Recorded evidence inputs","Prepared by "+assessment.prepared_by+" · "+date(assessment.updated_at),parent);
    const grid=el("div","key-value-grid",null,body);
    [["Verified monthly income",cash(assessment.verified_monthly_income)],["Income variation",assessment.income_variation_percent+"%"],["Bank statement period",assessment.bank_statement_months+" months"],["Verified work history",assessment.verified_work_months+" months"],["Existing monthly obligations",cash(assessment.monthly_obligations)],["Utility bills reviewed",assessment.utility_bills_reviewed],["Paid on time",assessment.utility_bills_on_time],["Paid late",assessment.utility_bills_late],["Missed / unpaid",assessment.utility_bills_missed],["Formula version",assessment.score_version]].forEach(pair=>{
      const k=el("div","",null,grid);el("div","kv-label",pair[0],k);el("div","kv-value",pair[1],k);
    });
    el("div","kv-label","Evidence rationale",body);
    el("p","activity-text",assessment.evidence_notes,body);
    let explanation=assessment.shap_explanation;
    if(typeof explanation==="string"){try{explanation=JSON.parse(explanation);}catch{explanation=null;}}
    if(explanation&&Array.isArray(explanation.contributions)){
      const shap=panel("SHAP feature contributions","Exact Shapley attribution for "+(assessment.model_version||explanation.model_version||"evidence model"),parent);
      const headline=el("div","key-value-grid",null,shap);
      [["Baseline score",explanation.base_value],["Model output",explanation.model_output],["Displayed score",explanation.predicted_score]].forEach(pair=>{const k=el("div","",null,headline);el("div","kv-label",pair[0],k);el("div","kv-value",pair[1],k);});
      explanation.contributions.forEach(c=>{
        const row=el("div","factor",null,shap),v=Number(c.shap_value)||0;
        el("span","",c.feature+" · "+(c.observed||""),row);
        el("strong","",(v>0?"+":"")+v.toFixed(2)+" points",row);
        const bar=el("div","score-bar",null,shap),fill=el("span","",null,bar);
        fill.style.width=Math.min(100,Math.abs(v)/2.75*100)+"%";
        fill.style.background=v>0?"#247a58":v<0?"#b54848":"#88958e";
        bar.style.marginBottom="10px";
      });
      el("p","score-warning",explanation.limitations||"SHAP explains feature contributions for the current model; the LoanOfficer must independently assess the evidence.",shap);
    }
  }

  function details(root){
    if(!s.detail){el("div","loading","Loading application…",root);return;}
    const a=s.detail.application,docs=s.detail.documents||[],assessment=s.detail.assessment||null;
    const top=el("div","detail-heading",null,root),wrap=el("div","",null,top),back=el("button","back-link","← Back",wrap);back.dataset.view=s.role==="customer"?"applications":s.role==="lender"?(a.trustcred_score?"assessment":"queue"):"decisions";
    el("h2","",a.id+" · "+a.customer_name,wrap);el("div","detail-meta",a.city||"—",wrap);pill(a.status,top);
    const layout=el("div","detail-grid",null,root),left=el("div","",null,layout),right=el("div","",null,layout);
    const info=panel("Application summary","Submitted request",left),grid=el("div","key-value-grid",null,info);
    [["Customer email",a.customer_email],["Phone",a.phone||"—"],["Requested amount",cash(a.requested_amount)],["Tenure",a.tenure_months+" months"],["Self-reported monthly income",cash(a.monthly_income)],["Activity history",a.vintage_months+" months"],["Work profile",a.work_type],["Business",a.business_name||"—"],["Purpose",a.purpose]].forEach(x=>{const k=el("div","",null,grid);el("div","kv-label",x[0],k);el("div","kv-value",x[1],k);});
    const docbody=panel("Supporting documents","Sample files and review statuses",left);
    docs.forEach(d=>{
      const item=el("div","doc-item",null,docbody);el("div","doc-icon","▤",item);
      const mid=el("div","",null,item);el("div","doc-name",d.filename,mid);el("div","doc-meta",human(d.doc_type)+" · "+(d.sample_description||""),mid);
      if(d.review_reason)el("div","doc-meta",d.review_reason,mid);
      const acts=el("div","doc-actions",null,item);if(d.url){const link=el("a","tiny-btn","Preview ↗",acts);link.href=d.url;link.target="_blank";}pill(d.status,acts);
      if(s.role==="lender"&&d.status==="pending"){
        const reason=el("input","field",null,mid);reason.id="reason-"+d.id;reason.placeholder="Reason if returning this document";
        const yes=el("button","tiny-btn good","Verify",acts);yes.dataset.review=d.id;yes.dataset.status="verified";
        const no=el("button","tiny-btn bad","Return",acts);no.dataset.review=d.id;no.dataset.status="invalid";
      }
    });
    if(s.role==="customer"&&["draft","documents_returned","information_requested"].includes(a.status)){
      const f=el("form","",null,docbody);f.id="upload-form";const hid=el("input","",null,f);hid.type="hidden";hid.name="application_id";hid.value=a.id;
      const cat=el("select","select-field",null,f);cat.name="doc_type";
      [["identity_proof","Identity proof"],["address_proof","Address proof"],["income_proof","Income/business proof"],["bank_statement","Bank statement"],["electricity_bill","Electricity bill"],["gas_bill","Gas bill"],["other_utility_bill","Other utility bill"],["other_document","Other document"]].forEach(x=>{const o=el("option","",x[1],cat);o.value=x[0];});
      const file=el("input","field",null,f);file.type="file";file.name="file";file.required=true;file.accept=".pdf,.png,.jpg,.jpeg,.webp,.csv";
      const up=btn("Upload document ↑","btn-primary",{},f);up.type="submit";
      btn("Submit for lender review →","btn-primary",{"data-workflow":"submit","data-app":a.id},docbody);
    }
    scoreCard(a,right);
    if(s.role!=="customer"&&assessment)evidenceAssessmentSummary(assessment,right);
    if(s.role==="lender"&&["draft","submitted","document_review","documents_returned"].includes(a.status)){
      btn("Complete document verification","btn-primary",{"data-workflow":"complete_document_review","data-app":a.id},right);
      btn("Request missing / corrected documents","btn-light",{"data-workflow":"request_missing_documents","data-app":a.id},right);
    }
    if(s.role==="lender"&&a.status==="under_assessment"&&!a.trustcred_score){
      evidenceAssessmentForm(a,right);
    }
    if(s.role==="loanofficer"&&a.status==="loanofficer_review"){
      const f=el("form","panel-body",null,panel("LoanOfficer decision","Review the recorded SHAP contributions above. The model explains its score; you make and justify the lending decision.",right));f.id="decision-form";f.dataset.app=a.id;
      const selectWrap=el("div","form-field",null,f);el("label","","Decision",selectWrap);const decision=el("select","select-field",null,selectWrap);decision.name="decision";
      [["approve","Approve and assign lender"],["reject","Reject application"],["request_information","Request more information"]].forEach(x=>{const o=el("option","",x[1],decision);o.value=x[0];});
      const funderWrap=el("div","form-field",null,f);el("label","","Funding lender (required for approval)",funderWrap);const funder=el("select","select-field",null,funderWrap);funder.name="funding_lender_user_id";const first=el("option","", "Choose an active registered lender",funder);first.value="";
      (s.data?.lenders||[]).filter(l=>l.is_fundable&&l.user_id).forEach(l=>{const o=el("option","",l.full_name+" · "+l.email+" · funded "+(l.loans_funded||0)+" loans",funder);o.value=l.user_id;});
      if(funder.options.length===1)el("p","inline-alert alert-warning","No active lender is currently eligible for funding. Ask the lender to complete registration and pass the initial eligibility screen, or have the LoanOfficer issue or rotate an access code.",f);
      const amt=formField(f,"Approved amount (₹)","amount","number",false);amt.value=Math.min(Number(a.requested_amount)||1000,Number(a.eligible_amount)||1000);amt.min="1000";amt.max=Math.min(Number(a.requested_amount)||0,Number(a.eligible_amount)||0);
      formField(f,"LoanOfficer rationale *","reason","textarea",true,"Explain the source evidence, SHAP contributions, uncertainties, and why this decision is appropriate…");
      const confirmWrap=el("div","form-field wide",null,f),confirmLabel=el("label","checkbox-row",null,confirmWrap),confirm=el("input","",null,confirmLabel);confirm.type="checkbox";confirm.name="confirmed_customer_verification";confirm.required=true;
      el("span","","I reviewed the customer identity, supporting documents, lender verification, entered source metrics, and SHAP explanation before making this decision.",confirmLabel);
      const sub=btn("Record LoanOfficer decision →","btn-primary",{},f);sub.type="submit";
    }
    if(s.role==="loanofficer"&&a.status==="approved"&&["assigned","declined"].includes(a.funding_status)){
      const f=el("form","panel-body",null,panel("Funding assignment","Approved amount: "+cash(a.approved_amount)+" · Current lender: "+(a.funding_lender_name||"—"),right));f.id="assign-funder-form";f.dataset.app=a.id;
      const funderWrap=el("div","form-field",null,f);el("label","","Assign / reassign funding lender",funderWrap);const sel=el("select","select-field",null,funderWrap);sel.name="funding_lender_user_id";const blank=el("option","", "Choose a lender",sel);blank.value="";
      (s.data?.lenders||[]).filter(l=>l.is_fundable&&l.user_id).forEach(l=>{const o=el("option","",l.full_name+" · "+l.email,sel);o.value=l.user_id;});
      const submit=btn("Save funding assignment →","btn-primary",{},f);submit.type="submit";
      if(a.funding_reason)el("p","inline-alert alert-warning","Previous lender note: "+a.funding_reason,f);
    }
    if(s.role==="lender"&&a.is_funding_lender&&a.status==="approved"&&a.funding_status==="assigned"){
      const f=el("form","panel-body",null,panel("Record loan disbursement","You are the selected funding lender. Record only a transaction that actually occurred.",right));f.id="funding-form";f.dataset.app=a.id;
      const amount=formField(f,"Actual amount disbursed (₹) *","funded_amount","number",true,"No more than "+cash(a.approved_amount));amount.value=Number(a.approved_amount)||"";amount.min="1";amount.max=Number(a.approved_amount)||"";
      formField(f,"Bank / transfer reference *","funding_reference","text",true,"Real transaction reference");
      const sub=btn("Record actual disbursement →","btn-primary",{},f);sub.type="submit";
      const decline=el("form","panel-body",null,panel("Unable to fund this loan?","Explain the reason so the LoanOfficer can reassign it.",right));decline.id="funding-decline-form";decline.dataset.app=a.id;
      formField(decline,"Reason *","reason","textarea",true,"Explain why you cannot disburse this approved loan…");
      const declineBtn=btn("Decline funding assignment","btn-light",{},decline);declineBtn.type="submit";
    }
    if(s.role==="loanofficer"&&a.admin_decision)el("p","inline-alert alert-success","LoanOfficer decision: "+a.admin_decision+" · "+(a.admin_reason||""),right);
    if(a.funding_lender_name)el("p","inline-alert alert-success","Funding lender: "+a.funding_lender_name+" · Funding status: "+human(a.funding_status)+" · Actual disbursement: "+cash(a.funded_amount)+(a.funding_reference?" · Reference: "+a.funding_reference:""),right);
    if(a.funding_reason)el("p","inline-alert alert-warning","Funding note: "+a.funding_reason,right);
  }
  function lenderDirectory(root){
    intro(s.role==="loanofficer"?"Lender access and performance":"Your lender profile",s.role==="loanofficer"?"Issue, rotate, or revoke a lender's code and monitor assigned reviews, approved loans, customer counts, and actual disbursements.":"Your lender code and funding activity are managed by the LoanOfficer.",null,null,root);
    if(s.role==="loanofficer"){
      const formBody=panel("Issue or rotate a lender access code","Eligible lenders receive a code after registration screening. The LoanOfficer can also issue, rotate, or revoke a code; lenders need it for every sign-in.",root);
      const form=el("form","",null,formBody);form.id="lender-code-form";
      const grid=el("div","form-grid",null,form);
      formField(grid,"Lender full name *","full_name","text",true,"Full legal name");
      formField(grid,"Lender email *","email","email",true,"lender@company.com");
      const actions=el("div","form-actions",null,form);const submit=btn("Issue / rotate code →","btn-primary",{},actions);submit.type="submit";
      if(s.lastLenderCode){
        const box=el("div","inline-alert alert-success",null,root);
        el("b","","New lender access code — share it privately",box);
        el("p","","Email: "+s.lastLenderCode.email,box);
        const code=el("code","",s.lastLenderCode.access_code,box);code.style.cssText="font-size:18px;letter-spacing:2px;background:white;padding:8px 10px;border-radius:6px;display:inline-block;margin:6px 0";
        const copy=btn("Copy code","btn-light btn-small",{"data-copy-code":"1"},box);copy.style.marginLeft="8px";
        el("p","field-hint","The code is stored only as a hash. It will not be shown again after leaving this page; issue a new one if lost.",box);
      }
      const listBody=panel("Registered lender performance","Counts reflect real applications, LoanOfficer assignments, and disbursements recorded with a transaction reference.",root);
      const list=s.data?.lenders||[];
      if(!list.length)el("div","empty-state","No lender profiles yet. Lenders can register, pass the initial eligibility screen, and receive a code immediately.",listBody);
      list.forEach(l=>{
        const row=el("div","doc-item",null,listBody);
        el("div","lender-avatar",String(l.full_name||"L").split(/\s+/).map(v=>v[0]||"").slice(0,2).join("").toUpperCase(),row);
        const info=el("div","",null,row);
        el("div","doc-name",l.full_name,info);el("div","doc-meta",l.email+" · "+l.status,info);
        el("div","doc-meta",(l.organization_name||"Organization not provided")+" · "+human(l.institution_type||"type not provided")+" · Registration/license: "+(l.registration_number||"not provided"),info);
        el("div","doc-meta","Initial screen: "+human(l.eligibility_status||"unassessed")+" · "+(l.years_experience||0)+" years · Declared capacity: "+cash(l.annual_lending_capacity||0),info);
        if(l.eligibility_notes)el("div","field-hint",l.eligibility_notes,info);
        el("div","doc-meta","Reviewed: "+(l.reviewed||0)+" · Approved loans to fund: "+(l.loans_to_fund||0)+" · Customers funded: "+(l.customers_funded||0)+" · Loans funded: "+(l.loans_funded||0),info);
        el("div","doc-meta","Actual disbursed: "+cash(l.total_funded||0)+" · Approved commitments awaiting funding: "+cash(l.committed_amount||0),info);
        const actions=el("div","doc-actions",null,row);
        el("span","status-pill "+(l.is_fundable?"verified":"invalid"),l.is_fundable?"Eligible for assignment":(l.access_code_active?"Not yet eligible":"No active code"),actions);
        const rotate=el("button","tiny-btn","Rotate code",actions);rotate.dataset.rotateEmail=l.email;rotate.dataset.rotateName=l.full_name;
        if(l.access_code_active){const revoke=el("button","tiny-btn bad","Revoke",actions);revoke.dataset.revokeEmail=l.email;}
      });
    }else{
      const own=(s.data?.lenders||[])[0],body=panel("Your lender profile","Your lender account identity and access status.",root);
      if(!own)el("div","empty-state","Your profile will appear here after successful registration.",body);
      else{
        const grid=el("div","key-value-grid",null,body);
        [["Name",own.full_name],["Email",own.email],["Organization",own.organization_name||"—"],["Type",human(own.institution_type||"—")],["Registration / license",own.registration_number||"—"],["Address",own.business_address||"—"],["Operating years",own.years_experience||0],["Declared annual capacity",cash(own.annual_lending_capacity||0)],["Initial eligibility screen",human(own.eligibility_status||"unassessed")],["Phone",own.phone||"—"],["Status",own.status]].forEach(pair=>{const k=el("div","",null,grid);el("div","kv-label",pair[0],k);el("div","kv-value",pair[1],k);});
      }
    }
  }
  function customersPage(root){
    intro("Customer accounts","LoanOfficer-only view of registered customer accounts and their real applications, approvals, and recorded disbursements.",null,null,root);
    const list=s.data?.customers||[];
    const body=panel("All registered customers","Financial records are visible only to the authenticated LoanOfficer.",root);
    if(!list.length){el("div","empty-state","No customer accounts have been registered yet.",body);return;}
    const wrap=el("div","table-wrap",null,body),table=el("table","",null,wrap);
    table.innerHTML="<thead><tr><th>CUSTOMER</th><th>APPLICATIONS</th><th>APPROVED</th><th>FUNDED</th><th>REQUESTED</th><th>DISBURSED</th><th></th></tr></thead>";
    const tbody=el("tbody","",null,table);
    list.forEach(c=>{
      const tr=el("tr","",null,tbody),who=el("td","",null,tr);
      el("div","person-name",c.full_name,who);el("div","person-meta",c.email+" · "+c.status,who);
      el("td","",c.application_count,tr);el("td","",c.approved_count,tr);el("td","",c.funded_count,tr);
      el("td","",cash(c.total_requested),tr);el("td","",cash(c.total_funded),tr);const actions=el("td","",null,tr);const view=el("button","tiny-btn","View applications",actions);view.dataset.customerEmail=c.email;
    });
  }

  function render(){
    renderHeader();const root=$("#workspace-content");root.innerHTML="";
    if(s.view==="detail")return details(root);
    if(s.view==="new"&&s.role==="customer")return newApplication(root);
    if(s.view==="lenders")return lenderDirectory(root);
    if(s.view==="customers"&&s.role==="loanofficer")return customersPage(root);
    if(s.view==="audit"){const b=panel("Audit trail","Recorded actions and rationale",root);(s.data.events||[]).forEach(ev=>el("p","activity-text",ev.actor_name+" · "+ev.action+" · "+(ev.application_id||"")+" — "+(ev.reason||""),b));return;}
    if(["applications","queue","assessment","decisions"].includes(s.view)){
      let apps=s.data.applications||[];
      if(s.view==="applications"&&s.role==="loanofficer"&&s.selectedCustomerEmail)apps=apps.filter(a=>String(a.customer_email||"").toLowerCase()===String(s.selectedCustomerEmail).toLowerCase());
      if(s.view==="queue")apps=apps.filter(a=>["draft","submitted","document_review","documents_returned"].includes(a.status));
      if(s.view==="assessment")apps=apps.filter(a=>a.status==="under_assessment");
      if(s.view==="decisions")apps=apps.filter(a=>a.status==="loanofficer_review");
      intro($("#page-title").textContent,"Open an application to inspect evidence and take the next workflow action.",null,null,root);return appTable(apps,$("#page-title").textContent,root);
    }
    overview(root);
  }
  document.addEventListener("click",async function(e){
    const t=e.target.closest("button,a,[data-dismiss]");if(!t)return;
    if(t.matches("[data-dismiss]")){if(t.classList.contains("modal-backdrop")&&e.target!==t)return;$("#modal-root").innerHTML="";return;}
    if(t.dataset.authMode){
      e.preventDefault();
      if(t.dataset.authMode==="resend"){
        try{const result=await api("/account/resend-code",{method:"POST",body:{email:t.dataset.email}});toast(result.message||"Code request submitted.");}
        catch(err){toast(err.message,true);}
        return;
      }
      return authModal(t.dataset.role||"customer",t.dataset.authMode,{email:t.dataset.email||""});
    }
    if(t.dataset.role){e.preventDefault();return login(t.dataset.role);}
    if(t.dataset.copyCode){
      if(!s.lastLenderCode)return;
      try{await navigator.clipboard.writeText(s.lastLenderCode.access_code);toast("Lender access code copied.");}
      catch{toast("Copy the visible code manually and share it privately.");}
      return;
    }
    if(t.dataset.rotateEmail){
      const f=$("#lender-code-form");if(f){f.elements.email.value=t.dataset.rotateEmail;f.elements.full_name.value=t.dataset.rotateName||"";f.scrollIntoView({behavior:"smooth",block:"center"});f.elements.full_name.focus();}
      return;
    }
    if(t.dataset.revokeEmail){
      if(!confirm("Revoke this lender code and sign out the lender's existing sessions?"))return;
      try{const j=await api("/lenders",{method:"POST",body:{action:"revoke",email:t.dataset.revokeEmail}});s.lastLenderCode=null;toast(j.message);s.data=await api("/dashboard");render();}
      catch(err){toast(err.message,true);}
      return;
    }
    if(t.id==="hero-demo"){e.preventDefault();$("#roles").scrollIntoView({behavior:"smooth"});return;}
    if(t.id==="header-demo"){e.preventDefault();$("#roles").scrollIntoView({behavior:"smooth"});return;}
    if(["brand-home","workspace-home","return-home"].includes(t.id)){e.preventDefault();signOut();return;}
    if(t.id==="switch-role"){signOut();return;}
    if(t.id==="mobile-menu"){$(".sidebar").classList.toggle("open");return;}
    if(t.dataset.customerEmail){s.selectedCustomerEmail=t.dataset.customerEmail;s.view="applications";s.id=null;s.detail=null;return render();}
    if(t.dataset.view){s.view=t.dataset.view;s.selectedCustomerEmail=null;s.id=null;s.detail=null;return render();}
    if(t.dataset.open)return openApp(t.dataset.open);
    if(t.dataset.review){
      const reason=$("#reason-"+t.dataset.review);if(t.dataset.status==="invalid"&&(!reason||reason.value.trim().length<4))return toast("Enter a correction reason before returning this document.",true);
      try{const j=await api("/documents/review",{method:"POST",body:{document_id:Number(t.dataset.review),status:t.dataset.status,reason:reason?reason.value:""}});toast(j.message);s.detail=await api("/applications/"+encodeURIComponent(s.id));render();}catch(err){toast(err.message,true);}return;
    }
    if(t.dataset.workflow){try{const j=await api("/workflow",{method:"POST",body:{action:t.dataset.workflow,application_id:t.dataset.app||s.id}});toast(j.message);s.detail=await api("/applications/"+encodeURIComponent(s.id));s.data=await api("/dashboard");render();}catch(err){toast(err.message,true);}return;}
  });
  document.addEventListener("submit",async function(e){
    const f=e.target;if(!(f instanceof HTMLFormElement))return;e.preventDefault();
    if(f.id==="account-form")return authSubmit(f);
    if(f.id==="lender-code-form"){
      const data=Object.fromEntries(new FormData(f).entries());
      try{
        const result=await api("/lenders",{method:"POST",body:{action:"issue",full_name:data.full_name,email:data.email}});
        s.lastLenderCode={email:result.email,full_name:data.full_name,access_code:result.access_code};
        toast(result.message||"Lender code issued.");s.data=await api("/dashboard");return render();
      }catch(err){toast(err.message,true);return;}
    }
    try{
      if(f.id==="evidence-assessment-form"){
        const body=Object.fromEntries(new FormData(f).entries());
        ["verified_monthly_income","income_variation_percent","bank_statement_months","utility_bills_reviewed","utility_bills_on_time","utility_bills_late","utility_bills_missed","verified_work_months","monthly_obligations"].forEach(k=>body[k]=Number(body[k]));
        body.application_id=f.dataset.app;
        const j=await api("/assessments",{method:"POST",body:body});toast(j.message);s.detail=await api("/applications/"+encodeURIComponent(s.id));s.data=await api("/dashboard");return render();
      }
      if(f.id==="application-form"){
        const fd=new FormData(f),body=Object.fromEntries(fd.entries());["monthly_income","vintage_months","requested_amount","tenure_months"].forEach(k=>body[k]=Number(body[k]));body.consent_alt_data=fd.get("consent_alt_data")==="on";
        const j=await api("/applications",{method:"POST",body:body});toast(j.message);s.data=await api("/dashboard");return openApp(j.application.id);
      }
      if(f.id==="upload-form"){const j=await api("/documents",{method:"POST",body:new FormData(f)});toast(j.message);s.detail=await api("/applications/"+encodeURIComponent(s.id));return render();}
      if(["decision-form","assign-funder-form","funding-form","funding-decline-form"].includes(f.id)){
        const body=Object.fromEntries(new FormData(f).entries());body.application_id=f.dataset.app;
        if(f.id==="decision-form"){body.action="final_decision";body.amount=Number(body.amount||0);if(body.funding_lender_user_id)body.funding_lender_user_id=Number(body.funding_lender_user_id);}
        if(f.id==="assign-funder-form"){body.action="assign_funder";body.funding_lender_user_id=Number(body.funding_lender_user_id||0);}
        if(f.id==="funding-form"){body.action="mark_funded";body.funded_amount=Number(body.funded_amount||0);}
        if(f.id==="funding-decline-form")body.action="decline_funding";
        const j=await api("/workflow",{method:"POST",body:body});toast(j.message);
        if(f.id==="decision-form")s.view="decisions";
        s.id=null;s.detail=null;return refresh();
      }
    }catch(err){toast(err.message,true);}
  });
  async function init(){
    try{
      const result=await api("/account/status",{},true);
      s.adminExists=!!result.loanofficer_exists;
      if(result.user){
        s.user=result.user;s.role=result.user.role;
        $("#app").classList.add("hidden");$("#workspace").classList.remove("hidden");
        await refresh();
      }else{
        s.user=null;s.role=null;
        $("#app").classList.remove("hidden");$("#workspace").classList.add("hidden");
      }
    }catch(e){
      $("#app").classList.remove("hidden");$("#workspace").classList.add("hidden");
      toast("Account service could not be reached. Refresh the page and try again.",true);
    }
  }
  init();
})();