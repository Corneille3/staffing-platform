// Worker mobile flow — lock-screen alert, inbox, request detail, accepted
const { I } = window;

// ─────────────────────────────────────────────────────────────
// Brand cover + tokens (used in canvas hero row)
// ─────────────────────────────────────────────────────────────
function StfCover() {
  return (
    <div style={{
      position:"relative", width:"100%", height:"100%",
      background:"linear-gradient(170deg, #F6F4EE 0%, #EFEBE0 60%, #E8DEC8 100%)",
      padding:"60px 80px", display:"flex", flexDirection:"column",
      justifyContent:"space-between", overflow:"hidden",
    }}>
      <div style={{display:"flex", alignItems:"center", gap:14}}>
        <I.Logo size={36}/>
        <div style={{display:"flex", flexDirection:"column"}}>
          <span style={{fontSize:22, fontWeight:600, letterSpacing:"-0.02em"}}>Staffig</span>
          <span style={{fontSize:11, letterSpacing:".2em", textTransform:"uppercase", color:"var(--ink-3)"}}>Care · staffed in time</span>
        </div>
      </div>

      <div style={{maxWidth:880}}>
        <div className="stf-h-eyebrow" style={{marginBottom:18}}>Design exploration · v1 · May 2026</div>
        <h1 className="stf-display" style={{margin:0, fontSize:96, lineHeight:.95, color:"var(--ink)"}}>
          When a shift opens, <em style={{fontStyle:"italic"}}>somebody answers</em>.
        </h1>
        <p style={{margin:"28px 0 0", maxWidth:640, fontSize:17, lineHeight:1.5, color:"var(--ink-2)"}}>
          A staffing platform for care workers — mobile-first for the people who pick up shifts,
          desktop for the coordinators who fill them. Bilingual, urgent, and humane.
        </p>
      </div>

      <div style={{display:"flex", gap:12, alignItems:"center"}}>
        <span className="stf-chip ink">Worker · mobile</span>
        <span className="stf-chip">Admin · desktop</span>
        <span className="stf-chip">Bilingual EN/FR</span>
        <span className="stf-chip">Eligibility match</span>
        <span style={{marginLeft:"auto", color:"var(--ink-3)", fontSize:12, fontFamily:"var(--mono)"}}>
          12 screens · 3 surfaces
        </span>
      </div>

      <svg style={{position:"absolute", right:-60, top:60, opacity:.5}} width="380" height="380" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="92" stroke="#DC5A2A" strokeWidth="0.7" strokeDasharray="2 4"/>
        <circle cx="100" cy="100" r="62" stroke="#15140F" strokeWidth="0.7"/>
        <circle cx="100" cy="100" r="3" fill="#DC5A2A"/>
        <text x="100" y="14" textAnchor="middle" fontFamily="Instrument Serif" fontStyle="italic" fontSize="11" fill="#56544B">06:42 · Montréal</text>
      </svg>
    </div>
  );
}

function StfTokens() {
  const swatches = [
    ["Paper","#F6F4EE","Page bg"],
    ["Card","#FFFFFF","Surface"],
    ["Ink","#15140F","Primary text"],
    ["Ink/2","#56544B","Body text"],
    ["Line","#E5E1D3","Hairline"],
    ["Terra","#DC5A2A","Signature · primary CTA"],
    ["Moss","#25684A","Available · confirmed"],
    ["Sand","#E8C97A","Waiting · responses"],
    ["Rose","#C53A2A","Urgent · cancelled"],
    ["Slate","#2D3340","Admin nav"],
  ];
  return (
    <div style={{padding:"56px 64px", height:"100%", background:"#F6F4EE", display:"grid", gridTemplateColumns:"1fr 1fr", gap:48}}>
      <div>
        <div className="stf-h-eyebrow" style={{marginBottom:12}}>Type</div>
        <div style={{fontFamily:"Instrument Serif", fontSize:64, lineHeight:1, marginBottom:4}}>Aa <em style={{fontStyle:"italic"}}>Aa</em></div>
        <div style={{color:"var(--ink-3)", fontSize:11, fontFamily:"var(--mono)", marginBottom:32}}>Instrument Serif · display</div>

        <div style={{fontFamily:"Inter Tight", fontSize:38, fontWeight:600, letterSpacing:"-0.02em", marginBottom:4}}>Inter Tight</div>
        <div style={{color:"var(--ink-3)", fontSize:11, fontFamily:"var(--mono)", marginBottom:24}}>UI · 400/500/600/700</div>

        <div style={{fontFamily:"JetBrains Mono", fontSize:22, marginBottom:4}}>06:42 → 14:30</div>
        <div style={{color:"var(--ink-3)", fontSize:11, fontFamily:"var(--mono)", marginBottom:32}}>JetBrains Mono · numerics</div>

        <div style={{display:"flex", gap:8, flexWrap:"wrap"}}>
          <span className="stf-chip urgent"><span className="dot"/>Urgent</span>
          <span className="stf-chip moss"><span className="dot"/>Confirmed</span>
          <span className="stf-chip sand"><span className="dot"/>Awaiting reply</span>
          <span className="stf-chip terra"><span className="dot"/>New request</span>
          <span className="stf-chip ink">Filled</span>
        </div>
      </div>
      <div>
        <div className="stf-h-eyebrow" style={{marginBottom:12}}>Palette</div>
        <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:10}}>
          {swatches.map(([n,c,sub])=>(
            <div key={n} style={{display:"flex", alignItems:"center", gap:12, padding:"10px 12px", borderRadius:12, background:"#fff", border:"0.5px solid var(--line)"}}>
              <div style={{width:34, height:34, borderRadius:8, background:c, border:"0.5px solid rgba(0,0,0,.05)"}}/>
              <div style={{lineHeight:1.2}}>
                <div style={{fontSize:13, fontWeight:600}}>{n}</div>
                <div style={{fontSize:10, color:"var(--ink-3)", fontFamily:"var(--mono)"}}>{c} · {sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 1. Lock-screen urgent alert (dark)
// ─────────────────────────────────────────────────────────────
function WorkerLockUrgent() {
  return (
    <div style={{
      width:"100%", height:"100%",
      background:"linear-gradient(180deg, #1B1814 0%, #2A1F18 50%, #3A1F12 100%)",
      color:"#F6F4EE", padding:"24px 18px", display:"flex", flexDirection:"column",
      fontFamily:"var(--ui)",
    }}>
      {/* top: date */}
      <div style={{textAlign:"center", marginTop:32, marginBottom:8, fontSize:13, color:"rgba(246,244,238,.7)"}}>
        Tuesday · 19 May
      </div>
      <div style={{textAlign:"center", fontFamily:"Instrument Serif", fontSize:88, lineHeight:1, letterSpacing:"-0.03em"}}>
        06:42
      </div>
      <div style={{textAlign:"center", marginTop:6, fontSize:12, color:"rgba(246,244,238,.55)"}}>
        Montréal · 12°C
      </div>

      {/* notification */}
      <div style={{
        marginTop:48,
        background:"rgba(255,255,255,0.10)",
        backdropFilter:"blur(20px)",
        WebkitBackdropFilter:"blur(20px)",
        borderRadius:22,
        padding:18,
        border:"0.5px solid rgba(255,255,255,.18)",
      }}>
        <div style={{display:"flex", alignItems:"center", gap:10, marginBottom:12}}>
          <div style={{width:24, height:24, borderRadius:6, background:"#DC5A2A", display:"flex", alignItems:"center", justifyContent:"center"}}>
            <I.Bolt size={14}/>
          </div>
          <span style={{fontSize:12, fontWeight:600, letterSpacing:".04em"}}>STAFFIG</span>
          <span style={{marginLeft:"auto", fontSize:11, color:"rgba(246,244,238,.55)"}}>now</span>
        </div>
        <div style={{fontFamily:"Instrument Serif", fontSize:22, lineHeight:1.15, marginBottom:6}}>
          Urgent shift · <em style={{fontStyle:"italic"}}>1.2 km</em> away
        </div>
        <div style={{fontSize:13, color:"rgba(246,244,238,.78)", lineHeight:1.45, marginBottom:14}}>
          Les Petits Lutins — childcare · today 07:30 → 14:30. Sick call. They need someone in 48 min.
        </div>
        <div style={{display:"flex", gap:8}}>
          <button style={{
            flex:1, padding:"11px 0", borderRadius:12, border:"none",
            background:"#fff", color:"#15140F", fontWeight:600, fontSize:14, cursor:"pointer",
          }}>I can take it</button>
          <button style={{
            padding:"11px 14px", borderRadius:12, border:"0.5px solid rgba(255,255,255,.22)",
            background:"transparent", color:"#F6F4EE", fontWeight:500, fontSize:14, cursor:"pointer",
          }}>Can't</button>
        </div>
        <div style={{marginTop:10, fontSize:11, color:"rgba(246,244,238,.5)", textAlign:"center"}}>
          Swipe up to see eligibility match
        </div>
      </div>

      {/* secondary notif */}
      <div style={{
        marginTop:14,
        background:"rgba(255,255,255,0.06)",
        backdropFilter:"blur(20px)",
        WebkitBackdropFilter:"blur(20px)",
        borderRadius:22, padding:"14px 16px",
        border:"0.5px solid rgba(255,255,255,.12)",
        display:"flex", alignItems:"center", gap:12,
      }}>
        <I.Calendar size={18}/>
        <div style={{flex:1, fontSize:13}}>Your Thursday shift was <strong style={{fontWeight:600}}>confirmed</strong>.</div>
        <span style={{fontSize:11, color:"rgba(246,244,238,.55)"}}>2h ago</span>
      </div>

      <div style={{flex:1}}/>
      <div style={{textAlign:"center", fontSize:11, color:"rgba(246,244,238,.4)", marginBottom:12}}>
        Press to unlock · Staffig will keep notifying you
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 2. Inbox — list of requests
// ─────────────────────────────────────────────────────────────
const inboxItems = [
  { id:"REQ-2041", urgent:true, status:"new", org:"Les Petits Lutins", role:"Educator · childcare", city:"Mtl · Plateau",
    date:"Today · 19 May", time:"07:30 → 14:30", distance:"1.2 km", lang:"FR", sent:"3 min ago",
    note:"Educator out sick. Group of 8 toddlers." },
  { id:"REQ-2039", urgent:false, status:"new", org:"Résidence Les Érables", role:"PSW · long-term care", city:"Laval",
    date:"Thu 21 May", time:"15:00 → 23:00", distance:"7 km", lang:"FR / EN", sent:"22 min ago",
    note:"Planned absence · evening shift on 4th floor." },
  { id:"REQ-2036", urgent:false, status:"sent", org:"Maison Bleue", role:"Educator · childcare", city:"Mtl · Verdun",
    date:"Mon 24 May", time:"08:00 → 16:00", distance:"4.5 km", lang:"FR", sent:"yesterday",
    note:"You replied · waiting for confirmation." },
  { id:"REQ-2032", urgent:false, status:"filled", org:"CHSLD Saint-Laurent", role:"PSW · LTC", city:"Mtl · St-Laurent",
    date:"Sat 17 May", time:"07:00 → 15:00", distance:"6 km", lang:"FR", sent:"2 days ago",
    note:"Filled by another worker." },
];

function StatusPill({s}) {
  if (s === "new") return <span className="stf-chip terra"><span className="dot"/>New request</span>;
  if (s === "sent") return <span className="stf-chip sand"><span className="dot"/>Reply sent</span>;
  if (s === "filled") return <span className="stf-chip" style={{color:"var(--ink-3)"}}>Filled</span>;
  return null;
}

function WorkerInbox() {
  const [tab, setTab] = React.useState("active");
  const filtered = inboxItems.filter(i => tab==="active" ? i.status!=="filled" : i.status==="filled");
  return (
    <div className="stf-screen" style={{display:"flex", flexDirection:"column", height:"100%"}}>
      {/* top bar */}
      <div style={{padding:"58px 22px 6px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <div>
          <div style={{fontSize:11, color:"var(--ink-3)", letterSpacing:".14em", textTransform:"uppercase", fontWeight:500}}>Good morning, Amélie</div>
          <div style={{fontFamily:"Instrument Serif", fontSize:32, lineHeight:1.05, marginTop:2}}>
            Today's <em style={{fontStyle:"italic"}}>opportunities</em>
          </div>
        </div>
        <div className="stf-avatar" style={{width:38, height:38, fontSize:13, background:"var(--terra-soft)", color:"var(--terra-ink)", borderColor:"transparent"}}>AT</div>
      </div>

      {/* availability strip */}
      <div style={{margin:"14px 22px 0", display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"var(--moss-soft)", border:"0.5px solid #C8DCC1", borderRadius:14}}>
        <div style={{width:8, height:8, borderRadius:99, background:"var(--moss)"}}/>
        <div style={{fontSize:13, color:"var(--moss)", fontWeight:500}}>Available today · all day</div>
        <span style={{marginLeft:"auto", fontSize:11, color:"var(--ink-3)"}}>Edit</span>
      </div>

      {/* tabs */}
      <div style={{display:"flex", gap:4, padding:"18px 22px 8px"}}>
        {[["active","Active","3"],["history","History","12"]].map(([k,l,n])=>(
          <button key={k} onClick={()=>setTab(k)} style={{
            border:"none", background:"transparent", padding:"8px 0", marginRight:18,
            fontFamily:"inherit", fontSize:14, fontWeight: tab===k?600:400,
            color: tab===k?"var(--ink)":"var(--ink-3)",
            borderBottom: tab===k?"1.5px solid var(--ink)":"1.5px solid transparent",
            cursor:"pointer",
          }}>
            {l} <span style={{color:"var(--ink-3)", fontWeight:400, marginLeft:4}}>{n}</span>
          </button>
        ))}
      </div>

      {/* list */}
      <div className="stf-scroll" style={{flex:1, padding:"4px 16px 24px"}}>
        {filtered.map(item => (
          <RequestCard key={item.id} item={item}/>
        ))}
        <div style={{textAlign:"center", padding:"24px 0 8px", color:"var(--ink-3)", fontSize:12}}>
          That's all for now.
        </div>
      </div>

      {/* bottom nav */}
      <BottomNav active="inbox"/>
    </div>
  );
}

function RequestCard({item}) {
  return (
    <div style={{
      background:"#fff", borderRadius:18, padding:"14px 16px", marginBottom:10,
      border:`0.5px solid ${item.urgent ? "#F2C5B0" : "var(--line)"}`,
      boxShadow: item.urgent ? "0 1px 0 rgba(220,90,42,.04), 0 8px 24px -16px rgba(220,90,42,.18)" : "none",
      position:"relative", overflow:"hidden",
    }}>
      {item.urgent && <div style={{position:"absolute", left:0, top:0, bottom:0, width:3, background:"var(--terra)"}}/>}
      <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8}}>
        <div style={{display:"flex", alignItems:"center", gap:8}}>
          {item.urgent && <span className="stf-chip urgent"><I.Bolt size={10}/>Urgent</span>}
          <StatusPill s={item.status}/>
        </div>
        <span style={{fontSize:10, color:"var(--ink-3)", fontFamily:"var(--mono)"}}>{item.sent}</span>
      </div>
      <div style={{fontFamily:"Instrument Serif", fontSize:22, lineHeight:1.15, marginBottom:2}}>
        {item.org}
      </div>
      <div style={{fontSize:12, color:"var(--ink-2)", marginBottom:10}}>{item.role}</div>

      <div style={{display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:10}}>
        <Meta icon={<I.Calendar size={13}/>} label={item.date} sub={item.time}/>
        <Meta icon={<I.Pin size={13}/>} label={item.city} sub={item.distance}/>
      </div>
      {item.status !== "filled" && (
        <div style={{display:"flex", gap:8}}>
          {item.status === "new" && <>
            <button className="stf-btn primary" style={{flex:1, padding:"11px 0"}}>I can take it</button>
            <button className="stf-btn ghost" style={{padding:"11px 14px"}}>Decline</button>
          </>}
          {item.status === "sent" && <>
            <div style={{flex:1, padding:"11px 0", textAlign:"center", color:"var(--ink-3)", fontSize:13, border:"0.5px dashed var(--line)", borderRadius:12}}>
              Waiting for confirmation
            </div>
            <button className="stf-btn ghost" style={{padding:"11px 14px"}}>Withdraw</button>
          </>}
        </div>
      )}
    </div>
  );
}

function Meta({icon, label, sub}) {
  return (
    <div style={{display:"flex", alignItems:"center", gap:8, padding:"6px 10px", background:"var(--paper)", borderRadius:10}}>
      <span style={{color:"var(--ink-3)", display:"flex"}}>{icon}</span>
      <div style={{lineHeight:1.15}}>
        <div style={{fontSize:12, fontWeight:500, color:"var(--ink)"}}>{label}</div>
        <div style={{fontSize:10, color:"var(--ink-3)"}}>{sub}</div>
      </div>
    </div>
  );
}

function BottomNav({active="inbox"}) {
  const items = [
    ["inbox","Inbox", <I.Bell size={20}/>],
    ["schedule","Schedule", <I.Calendar size={20}/>],
    ["profile","Profile", <I.User size={20}/>],
  ];
  return (
    <div style={{
      borderTop:"0.5px solid var(--line)", background:"#fff",
      padding:"10px 24px 26px", display:"flex", justifyContent:"space-between",
    }}>
      {items.map(([k,l,icon])=>(
        <div key={k} style={{display:"flex", flexDirection:"column", alignItems:"center", gap:3, color: active===k?"var(--ink)":"var(--ink-3)"}}>
          {icon}
          <span style={{fontSize:10, fontWeight: active===k?600:500, letterSpacing:".02em"}}>{l}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 3. Request detail — accept/decline with eligibility
// ─────────────────────────────────────────────────────────────
function WorkerRequestDetail() {
  const eligibility = [
    { t:"profile", ok:true,  l:"Profile complete" },
    { t:"availability", ok:true, l:"Available · today, full day" },
    { t:"city", ok:true,  l:"You work in Montréal" },
    { t:"language", ok:true, l:"French · spoken" },
    { t:"qualification", ok:true, l:"AEC Éducation à l'enfance" },
    { t:"certification", ok:false, l:"First Aid · expires in 14 days", warn:true },
  ];
  return (
    <div className="stf-screen" style={{display:"flex", flexDirection:"column", height:"100%"}}>
      {/* header */}
      <div style={{padding:"58px 22px 14px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <button className="stf-btn ghost" style={{padding:"8px", borderRadius:99, width:36, height:36}}>
          <I.ArrowLeft size={16}/>
        </button>
        <span style={{fontSize:11, fontFamily:"var(--mono)", color:"var(--ink-3)"}}>REQ-2041</span>
        <button className="stf-btn ghost" style={{padding:"8px", borderRadius:99, width:36, height:36}}>
          <I.More size={16}/>
        </button>
      </div>

      <div className="stf-scroll" style={{flex:1, padding:"0 22px 24px"}}>
        {/* urgent banner */}
        <div style={{display:"flex", alignItems:"center", gap:10, padding:"10px 14px", background:"var(--terra-soft)", borderRadius:14, marginBottom:18}}>
          <div style={{width:28, height:28, borderRadius:8, background:"var(--terra)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff"}}>
            <I.Bolt size={14}/>
          </div>
          <div style={{flex:1, lineHeight:1.25}}>
            <div style={{fontSize:13, fontWeight:600, color:"var(--terra-ink)"}}>Same-day urgent</div>
            <div style={{fontSize:11, color:"var(--terra-ink)", opacity:.8}}>Starts in 48 minutes · 5 substitutes notified</div>
          </div>
        </div>

        <div style={{marginBottom:8}}>
          <span className="stf-chip">Childcare · educator</span>
        </div>
        <h1 style={{fontFamily:"Instrument Serif", fontSize:34, lineHeight:1.05, margin:"6px 0 4px", letterSpacing:"-0.01em"}}>
          Les Petits Lutins
        </h1>
        <div style={{color:"var(--ink-2)", fontSize:14, marginBottom:18}}>
          Group of 8 toddlers · educator out sick
        </div>

        {/* time block */}
        <div style={{
          padding:"16px 18px", background:"#fff", border:"0.5px solid var(--line)", borderRadius:16,
          marginBottom:14,
        }}>
          <div className="stf-h-eyebrow" style={{marginBottom:10}}>When</div>
          <div style={{display:"flex", alignItems:"baseline", gap:14}}>
            <div>
              <div style={{fontFamily:"Instrument Serif", fontSize:34, lineHeight:1}}>Today</div>
              <div style={{fontSize:11, color:"var(--ink-3)", marginTop:2}}>Tuesday · 19 May</div>
            </div>
            <div style={{flex:1, height:1, background:"var(--line)"}}/>
            <div className="stf-mono" style={{fontSize:18, fontWeight:500}}>
              07:30<span style={{color:"var(--ink-3)"}}>→</span>14:30
            </div>
          </div>
          <div style={{display:"flex", gap:12, marginTop:14, paddingTop:12, borderTop:"0.5px solid var(--line-soft)"}}>
            <Stat n="7h" l="Duration"/>
            <div style={{width:1, background:"var(--line-soft)"}}/>
            <Stat n="$26/h" l="Rate"/>
            <div style={{width:1, background:"var(--line-soft)"}}/>
            <Stat n="1.2km" l="From you"/>
          </div>
        </div>

        {/* location */}
        <div style={{
          padding:"14px 16px", background:"#fff", border:"0.5px solid var(--line)", borderRadius:16, marginBottom:14,
          display:"flex", alignItems:"center", gap:12,
        }}>
          <div style={{width:40, height:40, borderRadius:10, background:"var(--paper-2)", display:"flex", alignItems:"center", justifyContent:"center"}}>
            <I.Pin size={18}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontWeight:500, fontSize:14}}>4231 rue Drolet</div>
            <div style={{fontSize:12, color:"var(--ink-3)"}}>Plateau-Mont-Royal · Buzz 2A · Sylvie</div>
          </div>
          <I.ChevronRight size={16} stroke={1.4}/>
        </div>

        {/* eligibility */}
        <div className="stf-h-eyebrow" style={{margin:"8px 0 10px"}}>Why you'll match</div>
        <div style={{background:"#fff", border:"0.5px solid var(--line)", borderRadius:16, padding:"4px 16px"}}>
          {eligibility.map((e,i)=>(
            <div key={e.t} style={{display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom: i<eligibility.length-1?"0.5px solid var(--line-soft)":"none"}}>
              <div style={{
                width:22, height:22, borderRadius:99,
                background: e.warn ? "var(--sand-soft)" : e.ok ? "var(--moss-soft)" : "var(--rose-soft)",
                color: e.warn ? "#8C6B14" : e.ok ? "var(--moss)" : "var(--rose)",
                display:"flex", alignItems:"center", justifyContent:"center",
              }}>
                {e.warn ? <I.Warn size={12}/> : e.ok ? <I.Check size={13}/> : <I.X size={12}/>}
              </div>
              <span style={{fontSize:13, flex:1}}>{e.l}</span>
              {e.warn && <span style={{fontSize:11, color:"#8C6B14"}}>Renew soon</span>}
            </div>
          ))}
        </div>

        {/* contact */}
        <div className="stf-h-eyebrow" style={{margin:"22px 0 10px"}}>On arrival</div>
        <div style={{background:"#fff", border:"0.5px solid var(--line)", borderRadius:16, padding:"14px 16px", fontSize:13, lineHeight:1.5, color:"var(--ink-2)"}}>
          Ask for Sylvie at the front desk. The toddler room is on the second floor. <br/>
          <span style={{color:"var(--ink-3)"}}>Sylvie Boivin · </span>
          <span style={{color:"var(--ink)", fontWeight:500}}>(514) 555-0182</span>
        </div>
      </div>

      {/* sticky CTA */}
      <div style={{
        padding:"14px 18px 28px", borderTop:"0.5px solid var(--line)", background:"#fff",
        display:"flex", gap:10, alignItems:"center",
      }}>
        <button className="stf-btn ghost" style={{padding:"13px 16px"}}>Can't</button>
        <button className="stf-btn terra" style={{flex:1}}>
          I can take it <I.ArrowRight size={16}/>
        </button>
      </div>
    </div>
  );
}

function Stat({n, l}) {
  return (
    <div style={{flex:1}}>
      <div style={{fontFamily:"Instrument Serif", fontSize:20, lineHeight:1}}>{n}</div>
      <div style={{fontSize:10, color:"var(--ink-3)", marginTop:2, letterSpacing:".06em", textTransform:"uppercase"}}>{l}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// 4. Accepted state — waiting for confirmation
// ─────────────────────────────────────────────────────────────
function WorkerAccepted() {
  return (
    <div className="stf-screen" style={{display:"flex", flexDirection:"column", height:"100%", background:"var(--paper)"}}>
      <div style={{padding:"58px 22px 14px", display:"flex", alignItems:"center", justifyContent:"space-between"}}>
        <button className="stf-btn ghost" style={{padding:"8px", borderRadius:99, width:36, height:36}}>
          <I.ArrowLeft size={16}/>
        </button>
        <span style={{fontSize:11, fontFamily:"var(--mono)", color:"var(--ink-3)"}}>REQ-2041</span>
        <div style={{width:36}}/>
      </div>

      <div style={{flex:1, padding:"18px 22px", display:"flex", flexDirection:"column"}}>
        {/* hero confirmation block */}
        <div style={{textAlign:"center", padding:"24px 14px 18px"}}>
          <div style={{
            width:72, height:72, borderRadius:99, margin:"0 auto 18px",
            background:"var(--moss-soft)", color:"var(--moss)",
            display:"flex", alignItems:"center", justifyContent:"center",
            border:"0.5px solid #C8DCC1",
          }}>
            <I.Check size={28} stroke={1.8}/>
          </div>
          <div className="stf-h-eyebrow" style={{marginBottom:8}}>Response sent</div>
          <h1 style={{fontFamily:"Instrument Serif", fontSize:34, lineHeight:1.1, margin:"0 0 8px"}}>
            You're in line for <em style={{fontStyle:"italic"}}>this shift</em>.
          </h1>
          <p style={{margin:"0 auto", maxWidth:280, fontSize:14, lineHeight:1.5, color:"var(--ink-2)"}}>
            Les Petits Lutins will confirm within minutes. You'll get a notification — keep your phone close.
          </p>
        </div>

        {/* timeline */}
        <div style={{flex:1, padding:"18px 22px", background:"#fff", borderRadius:20, border:"0.5px solid var(--line)", marginTop:12}}>
          <div className="stf-h-eyebrow" style={{marginBottom:14}}>What happens next</div>
          {[
            ["Response sent", "06:43 · just now", true, true],
            ["Coordinator reviews responses", "expected by 06:50", true, false],
            ["You're confirmed", "expected by 07:00", false, false],
            ["Shift starts", "07:30", false, false],
          ].map(([t,sub,done,active],i,arr)=>(
            <div key={t} style={{display:"flex", gap:14}}>
              <div style={{display:"flex", flexDirection:"column", alignItems:"center"}}>
                <div style={{
                  width:14, height:14, borderRadius:99,
                  background: done ? "var(--moss)" : active ? "var(--terra)" : "var(--paper-2)",
                  border: done || active ? "none" : "0.5px solid var(--line)",
                  display:"flex", alignItems:"center", justifyContent:"center",
                }}>
                  {done && <I.Check size={9} stroke={2}/>}
                </div>
                {i<arr.length-1 && <div style={{width:1, flex:1, background:"var(--line-soft)", marginTop:2}}/>}
              </div>
              <div style={{paddingBottom:18, flex:1}}>
                <div style={{fontSize:14, fontWeight: done?500:400, color: done?"var(--ink)":"var(--ink-2)"}}>{t}</div>
                <div style={{fontSize:11, color:"var(--ink-3)", marginTop:2, fontFamily:"var(--mono)"}}>{sub}</div>
              </div>
            </div>
          ))}
        </div>

        <div style={{marginTop:14, padding:"12px 14px", background:"transparent", border:"0.5px dashed var(--line)", borderRadius:14, fontSize:12, color:"var(--ink-2)", textAlign:"center", lineHeight:1.5}}>
          Changed your mind? You can withdraw before confirmation.
        </div>
        <button className="stf-btn ghost" style={{marginTop:10, width:"100%"}}>Withdraw my response</button>
      </div>
    </div>
  );
}

Object.assign(window, {
  StfCover, StfTokens,
  WorkerLockUrgent, WorkerInbox, WorkerRequestDetail, WorkerAccepted,
  BottomNav,
});
