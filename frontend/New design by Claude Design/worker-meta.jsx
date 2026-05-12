// Worker · planning surfaces — availability, assignment, onboarding
const { I, BottomNav } = window;

// ─────────────────────────────────────────────────────────────
// 5. Weekly availability — toggleable
// ─────────────────────────────────────────────────────────────
const DAYS = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];
const DATES = [19,20,21,22,23,24,25];
const SLOTS = ["Morning","Afternoon","Evening","Overnight"];
const SLOT_HR = ["06–12","12–18","18–24","00–06"];

function WorkerAvailability() {
  const [grid, setGrid] = React.useState(() => {
    // 7 days × 4 slots
    return [
      [1,1,0,0],[1,1,1,0],[1,1,0,0],[1,1,0,0],
      [0,0,0,0],[1,1,0,0],[0,0,0,0],
    ];
  });
  const toggle = (d,s) => setGrid(g => g.map((row,i)=> i===d ? row.map((v,j)=> j===s ? (v?0:1) : v) : row));
  const totalSlots = grid.flat().filter(Boolean).length;

  return (
    <div className="stf-screen" style={{display:"flex", flexDirection:"column", height:"100%"}}>
      <div style={{padding:"58px 22px 8px"}}>
        <div className="stf-h-eyebrow">Week of 19 May</div>
        <div style={{display:"flex", alignItems:"baseline", justifyContent:"space-between", marginTop:4}}>
          <h1 style={{fontFamily:"Instrument Serif", fontSize:30, margin:0, lineHeight:1.05}}>
            When you're <em style={{fontStyle:"italic"}}>open</em>
          </h1>
          <div style={{display:"flex", gap:6}}>
            <button className="stf-btn ghost" style={{padding:"6px", width:30, height:30, borderRadius:99}}><I.ArrowLeft size={14}/></button>
            <button className="stf-btn ghost" style={{padding:"6px", width:30, height:30, borderRadius:99}}><I.ArrowRight size={14}/></button>
          </div>
        </div>
      </div>

      {/* summary strip */}
      <div style={{margin:"14px 22px 0", padding:"12px 16px", background:"#fff", border:"0.5px solid var(--line)", borderRadius:16, display:"flex", alignItems:"center", gap:12}}>
        <div style={{flex:1}}>
          <div style={{fontSize:11, color:"var(--ink-3)", letterSpacing:".06em", textTransform:"uppercase"}}>Available this week</div>
          <div style={{fontFamily:"Instrument Serif", fontSize:24, lineHeight:1, marginTop:2}}>{totalSlots} <em style={{fontStyle:"italic", fontSize:14, color:"var(--ink-3)"}}>of 28 slots</em></div>
        </div>
        <button className="stf-btn ghost" style={{padding:"8px 12px", fontSize:12}}>Copy last week</button>
      </div>

      {/* grid */}
      <div className="stf-scroll" style={{flex:1, padding:"18px 22px 12px"}}>
        <div style={{display:"grid", gridTemplateColumns:"56px repeat(7, 1fr)", gap:6}}>
          <div/>
          {DAYS.map((d,i)=>(
            <div key={d} style={{textAlign:"center", paddingBottom:8}}>
              <div style={{fontSize:10, color:"var(--ink-3)", letterSpacing:".06em", textTransform:"uppercase"}}>{d}</div>
              <div style={{fontFamily:"Instrument Serif", fontSize:18, marginTop:2}}>{DATES[i]}</div>
            </div>
          ))}
          {SLOTS.map((s,si)=>(
            <React.Fragment key={s}>
              <div style={{display:"flex", flexDirection:"column", justifyContent:"center", paddingRight:4}}>
                <div style={{fontSize:11, fontWeight:500}}>{s}</div>
                <div style={{fontSize:9, color:"var(--ink-3)", fontFamily:"var(--mono)"}}>{SLOT_HR[si]}</div>
              </div>
              {DAYS.map((_,di)=>{
                const on = grid[di][si];
                return (
                  <button key={di+"-"+si} onClick={()=>toggle(di,si)} style={{
                    aspectRatio:"1/1.05",
                    border: on ? "none" : "0.5px solid var(--line)",
                    background: on ? "var(--moss)" : "#fff",
                    borderRadius:10, cursor:"pointer",
                    display:"flex", alignItems:"center", justifyContent:"center",
                    color: on ? "#fff" : "transparent",
                    transition:"background .12s",
                  }}>
                    <I.Check size={12} stroke={2.2}/>
                  </button>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        <div className="stf-h-eyebrow" style={{margin:"26px 0 10px"}}>Preferences</div>
        <div style={{background:"#fff", border:"0.5px solid var(--line)", borderRadius:16}}>
          <ToggleRow label="Urgent alerts" sub="Notify me for same-day requests" on/>
          <ToggleRow label="Far-away shifts" sub="Include requests beyond 10 km" on={false}/>
          <ToggleRow label="Weekend overnights" sub="Overnight shifts on Sat/Sun" on={false} last/>
        </div>
      </div>

      <BottomNav active="schedule"/>
    </div>
  );
}

function ToggleRow({label, sub, on, last}) {
  const [v, setV] = React.useState(on);
  return (
    <div style={{display:"flex", alignItems:"center", padding:"14px 16px", borderBottom: last?"none":"0.5px solid var(--line-soft)"}}>
      <div style={{flex:1}}>
        <div style={{fontSize:13, fontWeight:500}}>{label}</div>
        <div style={{fontSize:11, color:"var(--ink-3)", marginTop:1}}>{sub}</div>
      </div>
      <button onClick={()=>setV(!v)} style={{
        width:38, height:22, borderRadius:99, border:"none", cursor:"pointer",
        background: v ? "var(--moss)" : "var(--paper-2)",
        position:"relative", transition:"background .15s",
      }}>
        <div style={{
          position:"absolute", top:2, left: v?18:2, width:18, height:18, borderRadius:99,
          background:"#fff", boxShadow:"0 1px 2px rgba(0,0,0,.15)", transition:"left .15s",
        }}/>
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 6. Today's assignment — confirm + check-in
// ─────────────────────────────────────────────────────────────
function WorkerAssignment() {
  const [confirmed, setConfirmed] = React.useState(true);
  return (
    <div className="stf-screen" style={{display:"flex", flexDirection:"column", height:"100%"}}>
      <div style={{padding:"58px 22px 6px"}}>
        <div className="stf-h-eyebrow">Today · Tuesday 19 May</div>
        <h1 style={{fontFamily:"Instrument Serif", fontSize:30, margin:"4px 0 0", lineHeight:1.05}}>
          Your <em style={{fontStyle:"italic"}}>shift</em>
        </h1>
      </div>

      <div className="stf-scroll" style={{flex:1, padding:"16px 22px 24px"}}>
        {/* hero */}
        <div style={{
          background:"#15140F", color:"#F6F4EE", borderRadius:22, padding:"22px",
          marginBottom:14, position:"relative", overflow:"hidden",
        }}>
          <svg style={{position:"absolute", right:-30, top:-30, opacity:.18}} width="180" height="180" viewBox="0 0 200 200"><circle cx="100" cy="100" r="80" stroke="#DC5A2A" strokeWidth="1" fill="none"/><circle cx="100" cy="100" r="40" stroke="#DC5A2A" strokeWidth="1" fill="none"/></svg>
          <div style={{display:"flex", alignItems:"center", gap:8, marginBottom:14}}>
            <span className="stf-chip moss" style={{background:"rgba(37,104,74,.3)", color:"#A8D9B8"}}>
              <span className="dot"/>Confirmed
            </span>
            <span style={{fontSize:10, fontFamily:"var(--mono)", opacity:.6}}>REQ-2041</span>
          </div>
          <div style={{fontFamily:"Instrument Serif", fontSize:30, lineHeight:1.1, marginBottom:4}}>
            Les Petits Lutins
          </div>
          <div style={{fontSize:13, opacity:.7, marginBottom:18}}>Educator · childcare · group of 8 toddlers</div>

          <div style={{display:"flex", alignItems:"baseline", gap:14, marginBottom:16}}>
            <div className="stf-mono" style={{fontSize:28, fontWeight:500}}>07:30</div>
            <div style={{flex:1, height:1, background:"rgba(246,244,238,.18)"}}/>
            <div className="stf-mono" style={{fontSize:28, fontWeight:500}}>14:30</div>
          </div>

          <div style={{display:"flex", gap:8}}>
            <button className="stf-btn terra" style={{flex:1, padding:"12px 0"}}>
              <I.Pin size={15}/> Directions
            </button>
            <button className="stf-btn ghost" style={{padding:"12px 14px", background:"rgba(255,255,255,.06)", color:"#F6F4EE", border:"0.5px solid rgba(255,255,255,.18)"}}>
              <I.Phone size={15}/>
            </button>
          </div>
        </div>

        {/* check-in card */}
        <div style={{padding:"16px", background:"#fff", border:"0.5px solid var(--line)", borderRadius:18, marginBottom:14}}>
          <div className="stf-h-eyebrow" style={{marginBottom:10}}>Check-in</div>
          <div style={{display:"flex", alignItems:"center", gap:12, marginBottom:14}}>
            <div style={{width:44, height:44, borderRadius:12, background:"var(--terra-soft)", color:"var(--terra-ink)", display:"flex", alignItems:"center", justifyContent:"center"}}>
              <I.Clock size={20}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:14, fontWeight:500}}>Arrive 10 minutes early</div>
              <div style={{fontSize:11, color:"var(--ink-3)"}}>Buzz 2A · ask for Sylvie</div>
            </div>
          </div>
          <button className="stf-btn moss" style={{width:"100%", padding:"12px 0"}}>
            <I.Check size={15} stroke={2}/> Check in when you arrive
          </button>
        </div>

        {/* week ahead */}
        <div className="stf-h-eyebrow" style={{margin:"6px 0 10px"}}>This week</div>
        <div style={{background:"#fff", border:"0.5px solid var(--line)", borderRadius:18, overflow:"hidden"}}>
          {[
            ["Thu 21","Résidence Les Érables","15:00–23:00","Confirmed"],
            ["Mon 24","Maison Bleue","08:00–16:00","Awaiting"],
          ].map(([d,o,t,s],i)=>(
            <div key={d} style={{display:"flex", alignItems:"center", gap:14, padding:"14px 16px", borderBottom: i===0?"0.5px solid var(--line-soft)":"none"}}>
              <div style={{fontFamily:"Instrument Serif", fontSize:18, width:48}}>{d}</div>
              <div style={{flex:1, lineHeight:1.2}}>
                <div style={{fontSize:13, fontWeight:500}}>{o}</div>
                <div style={{fontSize:11, color:"var(--ink-3)", fontFamily:"var(--mono)"}}>{t}</div>
              </div>
              {s==="Confirmed"
                ? <span className="stf-chip moss"><span className="dot"/>{s}</span>
                : <span className="stf-chip sand"><span className="dot"/>{s}</span>}
            </div>
          ))}
        </div>
      </div>
      <BottomNav active="schedule"/>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 7. Onboarding — qualifications / cities / certifications
// ─────────────────────────────────────────────────────────────
function WorkerOnboarding() {
  const [picked, setPicked] = React.useState(new Set(["aec_petite_enfance","cpr","french"]));
  const [cities, setCities] = React.useState(new Set(["mtl","plateau"]));
  const tog = (s, set, key) => {
    const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); set(n);
  };
  const quals = [
    ["aec_petite_enfance","AEC Éducation à l'enfance"],
    ["dec_psw","DEC Préposé aux bénéficiaires"],
    ["rn_diploma","RN diploma"],
    ["food_handler","Food handler"],
  ];
  const certs = [
    ["cpr","CPR · valid"],
    ["first_aid","First Aid"],
    ["police_check","Police background check"],
    ["vulnerable_sector","Vulnerable sector"],
  ];
  const langs = [["french","Français"],["english","English"],["spanish","Español"],["arabic","العربية"]];

  return (
    <div className="stf-screen" style={{display:"flex", flexDirection:"column", height:"100%"}}>
      <div style={{padding:"58px 22px 8px"}}>
        <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14}}>
          <button className="stf-btn ghost" style={{padding:"8px", borderRadius:99, width:36, height:36}}><I.ArrowLeft size={16}/></button>
          <div style={{flex:1, padding:"0 14px"}}>
            <div style={{height:3, background:"var(--paper-2)", borderRadius:99, position:"relative", overflow:"hidden"}}>
              <div style={{position:"absolute", inset:0, width:"66%", background:"var(--terra)"}}/>
            </div>
            <div style={{textAlign:"center", fontSize:10, color:"var(--ink-3)", marginTop:6, fontFamily:"var(--mono)"}}>Step 2 of 3</div>
          </div>
          <span style={{fontSize:13, color:"var(--ink-3)"}}>Skip</span>
        </div>
        <h1 style={{fontFamily:"Instrument Serif", fontSize:30, margin:"0 0 6px", lineHeight:1.05}}>
          What do you <em style={{fontStyle:"italic"}}>do</em>?
        </h1>
        <p style={{margin:0, fontSize:14, color:"var(--ink-2)", lineHeight:1.45}}>
          We'll only show you requests that match. Add more later in your profile.
        </p>
      </div>

      <div className="stf-scroll" style={{flex:1, padding:"22px 22px 24px"}}>
        <Section title="Qualifications">
          <ChipGrid items={quals} selected={picked} onToggle={(k)=>tog(picked,setPicked,k)}/>
        </Section>
        <Section title="Certifications">
          <ChipGrid items={certs} selected={picked} onToggle={(k)=>tog(picked,setPicked,k)} hint="Tap to add — you'll upload proof later"/>
        </Section>
        <Section title="Languages you speak">
          <ChipGrid items={langs} selected={picked} onToggle={(k)=>tog(picked,setPicked,k)}/>
        </Section>
        <Section title="Where you'll work">
          <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8}}>
            {[
              ["mtl","Montréal","centre"],
              ["plateau","Plateau","neighbourhood"],
              ["laval","Laval","city"],
              ["longueuil","Longueuil","city"],
              ["verdun","Verdun","neighbourhood"],
              ["other","Other…","add"],
            ].map(([k,l,sub])=>{
              const on = cities.has(k);
              return (
                <button key={k} onClick={()=>tog(cities,setCities,k)} style={{
                  textAlign:"left", padding:"12px 14px", borderRadius:14,
                  background: on ? "var(--ink)" : "#fff",
                  color: on ? "var(--paper)" : "var(--ink)",
                  border:"0.5px solid", borderColor: on ? "transparent" : "var(--line)",
                  cursor:"pointer", fontFamily:"inherit",
                }}>
                  <div style={{fontSize:14, fontWeight:500}}>{l}</div>
                  <div style={{fontSize:10, color: on ? "rgba(246,244,238,.6)" : "var(--ink-3)", marginTop:2, letterSpacing:".04em", textTransform:"uppercase"}}>{sub}</div>
                </button>
              );
            })}
          </div>
        </Section>
      </div>

      <div style={{padding:"14px 22px 28px", borderTop:"0.5px solid var(--line)", background:"#fff", display:"flex", gap:10, alignItems:"center"}}>
        <div style={{flex:1, fontSize:12, color:"var(--ink-3)"}}>
          {picked.size} qualifications · {cities.size} locations
        </div>
        <button className="stf-btn primary">Continue <I.ArrowRight size={15}/></button>
      </div>
    </div>
  );
}

function Section({title, children}) {
  return (
    <div style={{marginBottom:24}}>
      <div className="stf-h-eyebrow" style={{marginBottom:10}}>{title}</div>
      {children}
    </div>
  );
}
function ChipGrid({items, selected, onToggle, hint}) {
  return (
    <>
      <div style={{display:"flex", flexWrap:"wrap", gap:8}}>
        {items.map(([k,l])=>{
          const on = selected.has(k);
          return (
            <button key={k} onClick={()=>onToggle(k)} style={{
              padding:"9px 14px", borderRadius:99, cursor:"pointer", fontFamily:"inherit",
              background: on ? "var(--terra)" : "#fff",
              color: on ? "#fff" : "var(--ink)",
              border:"0.5px solid", borderColor: on ? "transparent" : "var(--line)",
              fontSize:13, fontWeight: on?500:400, display:"inline-flex", alignItems:"center", gap:6,
            }}>
              {on && <I.Check size={12} stroke={2.2}/>}
              {l}
            </button>
          );
        })}
      </div>
      {hint && <div style={{fontSize:11, color:"var(--ink-3)", marginTop:10}}>{hint}</div>}
    </>
  );
}

Object.assign(window, { WorkerAvailability, WorkerAssignment, WorkerOnboarding });
