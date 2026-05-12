// Admin desktop — create request, workflow card, substitute directory
const { I } = window;

// ─────────────────────────────────────────────────────────────
// Shared admin shell — sidebar + main
// ─────────────────────────────────────────────────────────────
function AdminShell({ active="requests", children, page }) {
  const nav = [
    ["dash","Dashboard", <I.Activity size={16}/>],
    ["requests","Requests", <I.Bolt size={16}/>],
    ["workers","Substitutes", <I.User size={16}/>],
    ["orgs","Organizations", <I.Briefcase size={16}/>],
    ["activity","Activity", <I.Calendar size={16}/>],
  ];
  return (
    <div style={{display:"flex", height:"100%", background:"var(--paper)", color:"var(--ink)", fontFamily:"var(--ui)"}}>
      {/* sidebar */}
      <aside style={{width:232, background:"var(--paper)", borderRight:"0.5px solid var(--line)", padding:"18px 14px", display:"flex", flexDirection:"column"}}>
        <div style={{display:"flex", alignItems:"center", gap:10, padding:"4px 8px 18px"}}>
          <I.Logo size={22}/>
          <span style={{fontSize:15, fontWeight:600, letterSpacing:"-0.01em"}}>Staffig</span>
          <span style={{fontSize:9, color:"var(--ink-3)", border:"0.5px solid var(--line)", padding:"1px 5px", borderRadius:4, marginLeft:"auto"}}>Admin</span>
        </div>

        <div style={{display:"flex", alignItems:"center", gap:8, padding:"8px 10px", background:"#fff", border:"0.5px solid var(--line)", borderRadius:10, marginBottom:14}}>
          <div style={{width:24, height:24, borderRadius:6, background:"var(--ink)", color:"var(--paper)", fontSize:10, fontWeight:600, display:"flex", alignItems:"center", justifyContent:"center"}}>LP</div>
          <div style={{flex:1, lineHeight:1.15}}>
            <div style={{fontSize:12, fontWeight:500}}>Les Petits Lutins</div>
            <div style={{fontSize:10, color:"var(--ink-3)"}}>Plateau · Montréal</div>
          </div>
          <I.ChevronDown size={14} stroke={1.3}/>
        </div>

        <div style={{fontSize:9, color:"var(--ink-3)", letterSpacing:".14em", textTransform:"uppercase", padding:"8px 10px 6px"}}>Workspace</div>
        {nav.map(([k,l,icon])=>(
          <div key={k} style={{
            display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:8,
            background: active===k ? "#fff" : "transparent",
            color: active===k ? "var(--ink)" : "var(--ink-2)",
            border: active===k ? "0.5px solid var(--line)" : "0.5px solid transparent",
            fontSize:13, fontWeight: active===k?500:400, marginBottom:2, cursor:"pointer",
          }}>
            <span style={{color: active===k?"var(--terra)":"var(--ink-3)"}}>{icon}</span>
            {l}
            {k==="requests" && <span style={{marginLeft:"auto", fontSize:10, fontFamily:"var(--mono)", background:"var(--terra-soft)", color:"var(--terra-ink)", padding:"1px 6px", borderRadius:99}}>4</span>}
          </div>
        ))}

        <div style={{flex:1}}/>
        <div style={{padding:"10px", borderRadius:10, background:"#fff", border:"0.5px solid var(--line)"}}>
          <div style={{fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", marginBottom:6}}>This week</div>
          <div style={{display:"flex", alignItems:"baseline", gap:6}}>
            <span style={{fontFamily:"Instrument Serif", fontSize:26, lineHeight:1}}>87%</span>
            <span style={{fontSize:11, color:"var(--moss)"}}>↑ 4</span>
          </div>
          <div style={{fontSize:10, color:"var(--ink-3)", marginTop:2}}>fill rate</div>
        </div>
      </aside>
      <main style={{flex:1, display:"flex", flexDirection:"column", overflow:"hidden"}}>
        {page && (
          <div style={{padding:"14px 24px", borderBottom:"0.5px solid var(--line)", display:"flex", alignItems:"center", justifyContent:"space-between", background:"var(--paper)"}}>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <span style={{fontSize:12, color:"var(--ink-3)"}}>{page.crumb}</span>
              {page.action}
            </div>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <button className="stf-btn ghost" style={{padding:"7px 10px", fontSize:12}}><I.Search size={14}/></button>
              <button className="stf-btn ghost" style={{padding:"7px 10px", fontSize:12}}><I.Bell size={14}/></button>
              <div className="stf-avatar" style={{width:28, height:28, fontSize:11, background:"var(--paper-2)"}}>SB</div>
            </div>
          </div>
        )}
        <div style={{flex:1, overflow:"auto"}}>{children}</div>
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Admin · Create request
// ─────────────────────────────────────────────────────────────
function AdminCreateRequest() {
  const steps = ["Where & when", "Who you need", "Notify"];
  return (
    <AdminShell active="requests" page={{crumb:"Requests / New", action: <span className="stf-chip">Draft · auto-saving</span>}}>
      <div style={{padding:"28px 40px", maxWidth:1080}}>
        <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:6}}>
          <h1 style={{fontFamily:"Instrument Serif", fontSize:42, lineHeight:1.05, margin:0}}>
            New staffing <em style={{fontStyle:"italic"}}>request</em>
          </h1>
          <div style={{fontSize:12, color:"var(--ink-3)", fontFamily:"var(--mono)"}}>REQ-2042 · draft</div>
        </div>
        <p style={{margin:"0 0 22px", color:"var(--ink-2)", maxWidth:680}}>
          Tell us when you need someone and what they should know. We'll only notify substitutes who match.
        </p>

        {/* stepper */}
        <div style={{display:"flex", gap:8, marginBottom:24}}>
          {steps.map((s,i)=>(
            <div key={s} style={{
              flex:1, padding:"10px 14px", borderRadius:12,
              background: i<=1 ? "#fff" : "var(--paper-2)",
              border:"0.5px solid", borderColor: i===1 ? "var(--ink)" : "var(--line)",
              display:"flex", alignItems:"center", gap:10,
            }}>
              <div style={{
                width:22, height:22, borderRadius:99, fontSize:11, fontWeight:600,
                background: i<1?"var(--moss)":i===1?"var(--ink)":"transparent",
                color: i<=1?"#fff":"var(--ink-3)",
                border: i>1 ? "0.5px solid var(--line)" : "none",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>{i<1 ? <I.Check size={12} stroke={2.2}/> : i+1}</div>
              <div style={{lineHeight:1.2}}>
                <div style={{fontSize:10, color:"var(--ink-3)", letterSpacing:".06em", textTransform:"uppercase"}}>Step {i+1}</div>
                <div style={{fontSize:13, fontWeight:500}}>{s}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:24}}>
          {/* form */}
          <div className="stf-card" style={{padding:24}}>
            <div className="stf-h-eyebrow" style={{marginBottom:14}}>Step 2 · Who you need</div>

            <Label l="Role">
              <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
                {["Educator","Assistant educator","PSW","Nurse"].map((r,i)=>(
                  <button key={r} style={{
                    padding:"8px 14px", borderRadius:99,
                    background: i===0?"var(--ink)":"#fff", color: i===0?"var(--paper)":"var(--ink)",
                    border:"0.5px solid", borderColor: i===0?"transparent":"var(--line)",
                    fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  }}>{r}</button>
                ))}
              </div>
            </Label>

            <Label l="Required qualifications">
              <div style={{display:"flex", flexWrap:"wrap", gap:6}}>
                {["AEC Petite enfance","DEC TEE","First Aid","Food handler","+ Add"].map((q,i)=>(
                  <span key={q} className="stf-chip" style={{background:i<3?"var(--terra-soft)":"#fff", color:i<3?"var(--terra-ink)":"var(--ink-3)", borderColor:i<3?"transparent":"var(--line)", padding:"5px 10px", fontSize:12}}>
                    {i<3 && <I.Check size={10} stroke={2.2}/>}
                    {q}
                  </span>
                ))}
              </div>
            </Label>

            <Label l="Language required">
              <div style={{display:"flex", gap:8}}>
                {["French","English","Bilingual","No preference"].map((l,i)=>(
                  <button key={l} style={{
                    padding:"8px 14px", borderRadius:99,
                    background: i===0?"var(--ink)":"#fff", color: i===0?"var(--paper)":"var(--ink)",
                    border:"0.5px solid", borderColor: i===0?"transparent":"var(--line)",
                    fontSize:13, cursor:"pointer", fontFamily:"inherit",
                  }}>{l}</button>
                ))}
              </div>
            </Label>

            <Label l="Urgency">
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
                {[
                  ["Same-day urgent","Notify in 15 min · phone too", true],
                  ["Planned absence","Notify over 24 h", false],
                  ["Recurring","Repeats weekly", false],
                  ["Emergency","Page everyone available", false],
                ].map(([t,sub,on])=>(
                  <div key={t} style={{
                    padding:"12px 14px", borderRadius:14,
                    background: on?"#fff":"var(--paper-2)",
                    border:"0.5px solid", borderColor: on?"var(--terra)":"var(--line)",
                    boxShadow: on?"0 0 0 3px rgba(220,90,42,.08)":"none",
                  }}>
                    <div style={{display:"flex", alignItems:"center", gap:8}}>
                      <div style={{width:14, height:14, borderRadius:99, border:"0.5px solid var(--line)", background:on?"var(--terra)":"transparent", display:"flex", alignItems:"center", justifyContent:"center"}}>{on && <div style={{width:6, height:6, borderRadius:99, background:"#fff"}}/>}</div>
                      <div style={{fontSize:13, fontWeight:500}}>{t}</div>
                    </div>
                    <div style={{fontSize:11, color:"var(--ink-3)", marginTop:4, marginLeft:22}}>{sub}</div>
                  </div>
                ))}
              </div>
            </Label>

            <Label l="Arrival instructions (visible to worker)">
              <div style={{background:"#fff", border:"0.5px solid var(--line)", borderRadius:12, padding:"12px 14px", color:"var(--ink-2)", fontSize:13, minHeight:80}}>
                Ask for Sylvie at the front desk. The toddler room is on the second floor. Snacks at 10:00.<span style={{borderLeft:"1.5px solid var(--terra)", marginLeft:2, height:14, display:"inline-block", verticalAlign:"text-bottom"}}/>
              </div>
            </Label>

            <div style={{display:"flex", justifyContent:"space-between", marginTop:18}}>
              <button className="stf-btn ghost"><I.ArrowLeft size={14}/> Back</button>
              <button className="stf-btn primary">Continue <I.ArrowRight size={14}/></button>
            </div>
          </div>

          {/* preview pane */}
          <div>
            <div className="stf-h-eyebrow" style={{marginBottom:10}}>Preview · what workers will see</div>
            <div style={{transform:"scale(.82)", transformOrigin:"top left", width:"122%"}}>
              <div style={{width:340, background:"#fff", borderRadius:18, padding:"14px 16px", border:"0.5px solid var(--line)", borderLeft:"3px solid var(--terra)"}}>
                <div style={{display:"flex", gap:6, marginBottom:8}}>
                  <span className="stf-chip urgent"><I.Bolt size={10}/>Urgent</span>
                  <span className="stf-chip terra"><span className="dot"/>New request</span>
                </div>
                <div style={{fontFamily:"Instrument Serif", fontSize:22, lineHeight:1.1}}>Les Petits Lutins</div>
                <div style={{fontSize:12, color:"var(--ink-2)", marginBottom:10}}>Educator · childcare</div>
                <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10}}>
                  <div style={{padding:"6px 10px", background:"var(--paper)", borderRadius:10}}>
                    <div style={{fontSize:11, fontWeight:500}}>Today · 19 May</div>
                    <div style={{fontSize:9, color:"var(--ink-3)"}}>07:30 → 14:30</div>
                  </div>
                  <div style={{padding:"6px 10px", background:"var(--paper)", borderRadius:10}}>
                    <div style={{fontSize:11, fontWeight:500}}>Plateau, Mtl</div>
                    <div style={{fontSize:9, color:"var(--ink-3)"}}>1.2 km</div>
                  </div>
                </div>
                <div style={{display:"flex", gap:6}}>
                  <div style={{flex:1, padding:"9px 0", background:"var(--ink)", color:"var(--paper)", borderRadius:10, fontSize:12, fontWeight:500, textAlign:"center"}}>I can take it</div>
                  <div style={{padding:"9px 12px", border:"0.5px solid var(--line)", borderRadius:10, fontSize:12, color:"var(--ink-2)"}}>Decline</div>
                </div>
              </div>
            </div>

            <div style={{marginTop:14, padding:"14px 16px", background:"var(--moss-soft)", border:"0.5px solid #C8DCC1", borderRadius:14}}>
              <div style={{fontSize:11, letterSpacing:".06em", textTransform:"uppercase", color:"var(--moss)", fontWeight:600, marginBottom:6}}>Reach estimate</div>
              <div style={{fontFamily:"Instrument Serif", fontSize:28, lineHeight:1, color:"var(--moss)"}}>
                12 <em style={{fontStyle:"italic", fontSize:16, color:"var(--moss)"}}>eligible substitutes</em>
              </div>
              <div style={{fontSize:11, color:"var(--moss)", marginTop:6, opacity:.85, lineHeight:1.5}}>
                match French + Petite enfance + available today within 10 km. <br/>
                <span style={{textDecoration:"underline", cursor:"pointer"}}>See list</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Label({l, children}) {
  return (
    <div style={{marginBottom:20}}>
      <div style={{fontSize:11, color:"var(--ink-3)", letterSpacing:".08em", textTransform:"uppercase", fontWeight:500, marginBottom:8}}>{l}</div>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Admin · Request workflow (live)
// ─────────────────────────────────────────────────────────────
function AdminWorkflow() {
  const responses = [
    {n:"Amélie Tremblay", init:"AT", city:"Plateau · 1.2 km", lang:"FR", status:"accepted", time:"06:43", match:96, photo:"AT"},
    {n:"Noor Khalil", init:"NK", city:"Mile End · 2.1 km", lang:"FR/EN", status:"accepted", time:"06:47", match:91, photo:"NK"},
    {n:"Marie-Eve Côté", init:"MC", city:"Rosemont · 3.8 km", lang:"FR", status:"viewed", time:"06:45", match:88},
    {n:"Sofia Lopez", init:"SL", city:"Verdun · 5.4 km", lang:"FR", status:"declined", time:"06:46", match:84, reason:"Family obligation"},
    {n:"Jean-Philippe Roy", init:"JR", city:"Outremont · 2.9 km", lang:"FR", status:"no_response", time:"—", match:81},
  ];
  return (
    <AdminShell active="requests" page={{crumb:"Requests / REQ-2041"}}>
      <div style={{padding:"24px 36px"}}>
        <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom:6}}>
          <span className="stf-chip urgent"><I.Bolt size={10}/>Urgent</span>
          <span className="stf-chip"><span className="dot" style={{background:"var(--terra)"}}/>Responses received</span>
          <div style={{marginLeft:"auto", fontSize:12, fontFamily:"var(--mono)", color:"var(--ink-3)"}}>
            REQ-2041 · created 06:40 · 3 min ago
          </div>
        </div>
        <h1 style={{fontFamily:"Instrument Serif", fontSize:38, lineHeight:1.05, margin:"4px 0 4px"}}>
          Educator · today, <em style={{fontStyle:"italic"}}>07:30 — 14:30</em>
        </h1>
        <div style={{color:"var(--ink-2)", fontSize:14, marginBottom:20}}>
          Les Petits Lutins · 4231 rue Drolet, Plateau-Mont-Royal
        </div>

        <div style={{display:"grid", gridTemplateColumns:"1.5fr 1fr", gap:20}}>
          {/* left: workflow + responses */}
          <div>
            {/* timeline */}
            <div className="stf-card" style={{padding:"18px 20px", marginBottom:16}}>
              <div className="stf-h-eyebrow" style={{marginBottom:14}}>Workflow</div>
              <div style={{display:"flex", alignItems:"center", gap:0}}>
                {[
                  ["Created","06:40","done"],
                  ["12 notified","06:41","done"],
                  ["5 responses","06:47","active"],
                  ["Assign","—","pending"],
                  ["Confirmed","—","pending"],
                ].map(([t,s,k],i,arr)=>(
                  <React.Fragment key={t}>
                    <div style={{display:"flex", flexDirection:"column", alignItems:"center", gap:6, minWidth:88}}>
                      <div style={{
                        width:26, height:26, borderRadius:99,
                        background: k==="done"?"var(--moss)":k==="active"?"var(--terra)":"#fff",
                        border: k==="pending"?"0.5px dashed var(--line)":"none",
                        color:"#fff", display:"flex", alignItems:"center", justifyContent:"center",
                      }}>
                        {k==="done" && <I.Check size={14} stroke={2.2}/>}
                        {k==="active" && <div style={{width:8,height:8,borderRadius:99,background:"#fff"}}/>}
                      </div>
                      <div style={{fontSize:11, fontWeight:500, color: k==="pending"?"var(--ink-3)":"var(--ink)"}}>{t}</div>
                      <div style={{fontSize:10, fontFamily:"var(--mono)", color:"var(--ink-3)"}}>{s}</div>
                    </div>
                    {i<arr.length-1 && <div style={{flex:1, height:1, background: i<2?"var(--moss)":"var(--line)", marginTop:-30}}/>}
                  </React.Fragment>
                ))}
              </div>
            </div>

            {/* responses */}
            <div className="stf-card" style={{padding:"18px 20px"}}>
              <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:14}}>
                <div>
                  <div className="stf-h-eyebrow">Responses</div>
                  <div style={{fontFamily:"Instrument Serif", fontSize:26, lineHeight:1, marginTop:4}}>
                    2 <em style={{fontStyle:"italic", fontSize:16, color:"var(--ink-3)"}}>accepted ·</em> 1 <em style={{fontStyle:"italic", fontSize:16, color:"var(--ink-3)"}}>viewed ·</em> 1 <em style={{fontStyle:"italic", fontSize:16, color:"var(--ink-3)"}}>declined</em>
                  </div>
                </div>
                <button className="stf-btn ghost" style={{padding:"7px 12px", fontSize:12}}>Notify more</button>
              </div>
              <div style={{display:"flex", flexDirection:"column", gap:8}}>
                {responses.map((r,i)=>(
                  <ResponseRow key={r.n} r={r} top={r.status==="accepted" && i===0}/>
                ))}
              </div>
            </div>
          </div>

          {/* right: pin sidebar */}
          <div style={{display:"flex", flexDirection:"column", gap:14}}>
            <div className="stf-card" style={{padding:"18px 20px", background:"var(--ink)", color:"var(--paper)", border:"none"}}>
              <div style={{fontSize:11, letterSpacing:".1em", textTransform:"uppercase", color:"rgba(246,244,238,.6)", marginBottom:8}}>Best match</div>
              <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:14}}>
                <div className="stf-avatar" style={{width:46, height:46, fontSize:16, background:"var(--terra)", color:"#fff", borderColor:"transparent"}}>AT</div>
                <div>
                  <div style={{fontFamily:"Instrument Serif", fontSize:22, lineHeight:1.1}}>Amélie Tremblay</div>
                  <div style={{fontSize:12, opacity:.7}}>Educator · 4 yrs · 96 % match</div>
                </div>
              </div>
              <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:14}}>
                <Tag dark text="French · primary"/>
                <Tag dark text="1.2 km away"/>
                <Tag dark text="Available today"/>
                <Tag dark text="Petite enfance ✓"/>
              </div>
              <button className="stf-btn terra" style={{width:"100%"}}>
                Assign Amélie <I.Check size={14} stroke={2.2}/>
              </button>
              <div style={{textAlign:"center", marginTop:10, fontSize:11, opacity:.6}}>
                Notification sent at 07:00 if no assignment by then.
              </div>
            </div>

            <div className="stf-card" style={{padding:"16px 18px"}}>
              <div className="stf-h-eyebrow" style={{marginBottom:10}}>Shift details</div>
              <Row k="When" v="Tue 19 May · 07:30 → 14:30"/>
              <Row k="Duration" v="7 hours"/>
              <Row k="Language" v="French"/>
              <Row k="Rate" v="$26 / hr"/>
              <Row k="Contact" v="Sylvie · (514) 555-0182" last/>
            </div>

            <div className="stf-card" style={{padding:"14px 16px", display:"flex", alignItems:"center", gap:10, background:"var(--sand-soft)", borderColor:"transparent"}}>
              <I.Warn size={18} stroke={1.6}/>
              <div style={{fontSize:12, lineHeight:1.4, color:"#7C5C12"}}>
                <strong style={{fontWeight:600}}>Sofia Lopez</strong> declined: "Family obligation." Pattern detected — 3 declines this month.
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function Row({k, v, last}) {
  return (
    <div style={{display:"flex", justifyContent:"space-between", padding:"8px 0", borderBottom: last?"none":"0.5px solid var(--line-soft)", fontSize:13}}>
      <span style={{color:"var(--ink-3)"}}>{k}</span>
      <span style={{fontWeight:500, color:"var(--ink)"}}>{v}</span>
    </div>
  );
}
function Tag({text, dark}) {
  return (
    <div style={{
      padding:"5px 10px", fontSize:11, fontWeight:500,
      borderRadius:8,
      background: dark ? "rgba(255,255,255,.08)" : "var(--paper)",
      color: dark ? "rgba(246,244,238,.9)" : "var(--ink)",
      border: dark ? "0.5px solid rgba(255,255,255,.1)" : "0.5px solid var(--line)",
      textAlign:"center",
    }}>{text}</div>
  );
}

function ResponseRow({r, top}) {
  const statusMap = {
    accepted: { c:"moss", l:"Accepted"},
    viewed: { c:"sand", l:"Viewed"},
    declined: { c:"rose", l:"Declined"},
    no_response: { c:"", l:"No reply yet"},
  };
  const s = statusMap[r.status];
  return (
    <div style={{
      display:"flex", alignItems:"center", gap:14, padding:"12px 14px", borderRadius:12,
      background: top ? "var(--moss-soft)" : "var(--paper)",
      border: top ? "0.5px solid #C8DCC1" : "0.5px solid var(--line)",
    }}>
      <div className="stf-avatar" style={{width:34, height:34, background: top?"var(--moss)":"var(--paper-2)", color: top?"#fff":"var(--ink)", borderColor:"transparent"}}>{r.init}</div>
      <div style={{flex:1, lineHeight:1.2}}>
        <div style={{fontSize:14, fontWeight:500, display:"flex", alignItems:"center", gap:8}}>
          {r.n}
          {top && <span className="stf-chip terra" style={{padding:"1px 6px", fontSize:10}}><I.Sparkle size={9}/>Top</span>}
        </div>
        <div style={{fontSize:11, color:"var(--ink-3)", marginTop:1}}>{r.city} · {r.lang} {r.reason && <span style={{color:"var(--rose)"}}>· "{r.reason}"</span>}</div>
      </div>
      <div style={{textAlign:"right", lineHeight:1.2}}>
        <div style={{fontFamily:"var(--mono)", fontSize:11, fontWeight:500}}>{r.match}%</div>
        <div style={{fontSize:9, color:"var(--ink-3)", letterSpacing:".06em", textTransform:"uppercase"}}>match</div>
      </div>
      {s.c
        ? <span className={`stf-chip ${s.c}`}><span className="dot"/>{s.l}</span>
        : <span className="stf-chip" style={{color:"var(--ink-3)"}}>{s.l}</span>}
      <span style={{fontSize:10, fontFamily:"var(--mono)", color:"var(--ink-3)", width:46, textAlign:"right"}}>{r.time}</span>
      <button className="stf-btn ghost" style={{padding:"6px 10px", fontSize:11}}>Assign</button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Admin · Substitute directory + eligibility match
// ─────────────────────────────────────────────────────────────
function AdminDirectory() {
  const subs = [
    {n:"Amélie Tremblay", role:"Educator", city:"Plateau", years:4, langs:["FR"], avail:"Today, all week", match:96, status:"available"},
    {n:"Noor Khalil", role:"Educator", city:"Mile End", years:3, langs:["FR","EN"], avail:"Mon–Wed", match:91, status:"available"},
    {n:"Marie-Eve Côté", role:"Educator", city:"Rosemont", years:6, langs:["FR"], avail:"Afternoons", match:88, status:"on_shift"},
    {n:"Sofia Lopez", role:"PSW + Educator", city:"Verdun", years:2, langs:["FR","ES"], avail:"Weekends", match:84, status:"available"},
    {n:"Jean-Philippe Roy", role:"Assistant", city:"Outremont", years:1, langs:["FR"], avail:"Mornings", match:81, status:"available"},
    {n:"Léa Bouchard", role:"Educator", city:"Hochelaga", years:5, langs:["FR"], avail:"—", match:74, status:"unavailable"},
    {n:"David Chen", role:"Educator", city:"Saint-Henri", years:2, langs:["FR","EN","ZH"], avail:"Thu–Sun", match:72, status:"available"},
  ];
  return (
    <AdminShell active="workers" page={{crumb:"Substitutes"}}>
      <div style={{padding:"24px 36px"}}>
        <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginBottom:18}}>
          <div>
            <h1 style={{fontFamily:"Instrument Serif", fontSize:38, lineHeight:1, margin:0}}>
              The <em style={{fontStyle:"italic"}}>pool</em>
            </h1>
            <p style={{margin:"6px 0 0", color:"var(--ink-2)", fontSize:14}}>
              48 substitutes · ranked against an open request.
            </p>
          </div>
          <div style={{display:"flex", gap:8}}>
            <button className="stf-btn ghost"><I.Filter size={14}/> Filter</button>
            <button className="stf-btn primary"><I.Plus size={14}/> Invite</button>
          </div>
        </div>

        {/* match-against bar */}
        <div className="stf-card" style={{padding:"12px 16px", marginBottom:18, display:"flex", alignItems:"center", gap:14, background:"#15140F", color:"#F6F4EE", border:"none"}}>
          <div style={{display:"flex", alignItems:"center", gap:8, fontSize:12, opacity:.7, letterSpacing:".06em", textTransform:"uppercase"}}>
            <I.Sparkle size={14}/> Ranking by match against
          </div>
          <div style={{display:"flex", alignItems:"center", gap:6, padding:"5px 10px", background:"rgba(255,255,255,.06)", borderRadius:8}}>
            <span style={{fontSize:10, fontFamily:"var(--mono)", opacity:.6}}>REQ-2041</span>
            <span style={{fontSize:12, fontWeight:500}}>Les Petits Lutins · educator · today</span>
          </div>
          <div style={{flex:1}}/>
          <div style={{display:"flex", gap:8}}>
            <Tag dark text="French"/>
            <Tag dark text="Petite enfance"/>
            <Tag dark text="≤ 10 km"/>
            <Tag dark text="Available today"/>
          </div>
          <button style={{background:"transparent", border:"none", color:"rgba(246,244,238,.7)", cursor:"pointer", fontFamily:"inherit", fontSize:12}}>Clear</button>
        </div>

        {/* table */}
        <div className="stf-card" style={{padding:0, overflow:"hidden"}}>
          <div style={{display:"grid", gridTemplateColumns:"2fr 1.4fr 1fr 1.6fr 1fr 1fr 90px", padding:"12px 18px", borderBottom:"0.5px solid var(--line)", fontSize:10, color:"var(--ink-3)", letterSpacing:".1em", textTransform:"uppercase", fontWeight:500}}>
            <div>Substitute</div><div>City</div><div>Years</div><div>Availability</div><div>Languages</div><div>Match</div><div></div>
          </div>
          {subs.map((s,i)=>(
            <div key={s.n} style={{
              display:"grid", gridTemplateColumns:"2fr 1.4fr 1fr 1.6fr 1fr 1fr 90px",
              padding:"14px 18px", alignItems:"center", borderBottom: i<subs.length-1?"0.5px solid var(--line-soft)":"none",
              background: i===0 ? "var(--moss-soft)" : "transparent",
            }}>
              <div style={{display:"flex", alignItems:"center", gap:12}}>
                <div className="stf-avatar" style={{width:34, height:34, fontSize:12, background: s.status==="available"?"var(--paper-2)":s.status==="on_shift"?"var(--sand-soft)":"#F2F0E6"}}>{s.n.split(" ").map(p=>p[0]).slice(0,2).join("")}</div>
                <div style={{lineHeight:1.2}}>
                  <div style={{fontSize:13, fontWeight:500, display:"flex", alignItems:"center", gap:6}}>
                    {s.n}
                    {i===0 && <span className="stf-chip terra" style={{padding:"1px 6px", fontSize:10}}><I.Sparkle size={9}/>Top</span>}
                  </div>
                  <div style={{fontSize:11, color:"var(--ink-3)"}}>{s.role}</div>
                </div>
              </div>
              <div style={{fontSize:13}}>{s.city}</div>
              <div style={{fontFamily:"var(--mono)", fontSize:13}}>{s.years}</div>
              <div style={{fontSize:13}}>
                {s.status==="available" && <span style={{color:"var(--moss)"}}>● </span>}
                {s.status==="on_shift" && <span style={{color:"#C19A2A"}}>● </span>}
                {s.status==="unavailable" && <span style={{color:"var(--ink-4)"}}>● </span>}
                {s.avail}
              </div>
              <div style={{display:"flex", gap:4, flexWrap:"wrap"}}>
                {s.langs.map(l=><span key={l} style={{fontSize:10, padding:"2px 6px", background:"var(--paper)", border:"0.5px solid var(--line)", borderRadius:4, fontFamily:"var(--mono)"}}>{l}</span>)}
              </div>
              <div style={{display:"flex", alignItems:"center", gap:8}}>
                <div style={{width:50, height:5, background:"var(--paper-2)", borderRadius:99, overflow:"hidden"}}>
                  <div style={{height:"100%", width:`${s.match}%`, background: s.match>=90?"var(--moss)":s.match>=80?"var(--terra)":"var(--ink-3)"}}/>
                </div>
                <span style={{fontFamily:"var(--mono)", fontSize:12, fontWeight:500}}>{s.match}</span>
              </div>
              <button className="stf-btn ghost" style={{padding:"6px 12px", fontSize:11, justifySelf:"end"}}>Notify</button>
            </div>
          ))}
        </div>

        <div style={{marginTop:18, fontSize:12, color:"var(--ink-3)", display:"flex", alignItems:"center", gap:6}}>
          <I.Shield size={13}/> Ranking factors: language, qualifications, distance, recent decline rate, certifications.
        </div>
      </div>
    </AdminShell>
  );
}

Object.assign(window, { AdminCreateRequest, AdminWorkflow, AdminDirectory });
