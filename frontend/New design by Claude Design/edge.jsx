// Edge states — sign-in, not-invited, orphan cleanup
const { I } = window;

// Shared frame
function EdgeFrame({ children, dark=false }) {
  return (
    <div style={{
      width:"100%", height:"100%",
      background: dark ? "#15140F" : "var(--paper)",
      color: dark ? "#F6F4EE" : "var(--ink)",
      fontFamily:"var(--ui)",
      display:"flex", padding:36, position:"relative", overflow:"hidden",
    }}>
      <div style={{position:"absolute", top:24, left:28, display:"flex", alignItems:"center", gap:10, color: dark ? "#F6F4EE" : "var(--ink)"}}>
        <I.Logo size={22}/>
        <span style={{fontSize:14, fontWeight:600, letterSpacing:"-0.01em"}}>Staffig</span>
      </div>
      {children}
    </div>
  );
}

// 1) Sign in
function EdgeSignIn() {
  return (
    <EdgeFrame>
      <div style={{margin:"auto", width:380}}>
        <div className="stf-h-eyebrow" style={{marginBottom:10}}>Welcome back</div>
        <h1 style={{fontFamily:"Instrument Serif", fontSize:46, lineHeight:1.05, margin:"0 0 8px"}}>
          Sign in to <em style={{fontStyle:"italic"}}>Staffig</em>
        </h1>
        <p style={{margin:"0 0 26px", color:"var(--ink-2)", fontSize:14, lineHeight:1.5}}>
          We'll text you a one-time code. No passwords.
        </p>

        <div style={{display:"flex", flexDirection:"column", gap:10}}>
          <button style={{padding:"12px 16px", borderRadius:12, border:"0.5px solid var(--line)", background:"#fff", display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontFamily:"inherit"}}>
            <I.Phone size={16}/>
            <span style={{fontSize:14, fontWeight:500}}>Continue with phone</span>
            <I.ArrowRight size={14} stroke={1.4}/>
          </button>
          <button style={{padding:"12px 16px", borderRadius:12, border:"0.5px solid var(--line)", background:"#fff", display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontFamily:"inherit"}}>
            <div style={{width:16, height:16, borderRadius:99, background:"linear-gradient(135deg,#EA4335,#FBBC04,#34A853,#4285F4)"}}/>
            <span style={{fontSize:14, fontWeight:500}}>Continue with Google</span>
          </button>
          <button style={{padding:"12px 16px", borderRadius:12, border:"0.5px solid var(--line)", background:"#fff", display:"flex", alignItems:"center", gap:10, cursor:"pointer", fontFamily:"inherit"}}>
            <div style={{width:16, height:16, borderRadius:4, background:"var(--ink)"}}/>
            <span style={{fontSize:14, fontWeight:500}}>Continue with Apple</span>
          </button>
        </div>

        <div style={{display:"flex", alignItems:"center", gap:10, margin:"22px 0"}}>
          <div style={{flex:1, height:1, background:"var(--line)"}}/>
          <span style={{fontSize:10, color:"var(--ink-3)", letterSpacing:".14em", textTransform:"uppercase"}}>or by invite</span>
          <div style={{flex:1, height:1, background:"var(--line)"}}/>
        </div>

        <p style={{margin:0, fontSize:12, color:"var(--ink-3)", lineHeight:1.5}}>
          New here? Staffig is invite-only. Ask the coordinator at your organization to add you, or <span style={{color:"var(--ink)", textDecoration:"underline", cursor:"pointer"}}>request an invite</span>.
        </p>
        <div style={{marginTop:32, fontSize:11, color:"var(--ink-3)"}}>
          EN · <span style={{textDecoration:"underline"}}>FR</span>
        </div>
      </div>

      <svg style={{position:"absolute", right:-100, bottom:-80}} width="380" height="380" viewBox="0 0 200 200" fill="none">
        <circle cx="100" cy="100" r="90" stroke="#DC5A2A" strokeWidth=".6" strokeDasharray="2 3"/>
        <circle cx="100" cy="100" r="60" stroke="#15140F" strokeWidth=".6"/>
        <circle cx="100" cy="100" r="4" fill="#DC5A2A"/>
      </svg>
    </EdgeFrame>
  );
}

// 2) Not invited
function EdgeNotInvited() {
  return (
    <EdgeFrame>
      <div style={{margin:"auto", width:460, textAlign:"left"}}>
        <div style={{
          width:60, height:60, borderRadius:99,
          background:"var(--sand-soft)", color:"#8C6B14",
          display:"flex", alignItems:"center", justifyContent:"center", marginBottom:24,
          border:"0.5px solid #E2D49A",
        }}>
          <I.Warn size={22}/>
        </div>
        <div className="stf-h-eyebrow" style={{marginBottom:8, color:"#8C6B14"}}>Hold on — </div>
        <h1 style={{fontFamily:"Instrument Serif", fontSize:46, lineHeight:1.05, margin:"0 0 14px"}}>
          You haven't been <em style={{fontStyle:"italic"}}>invited yet</em>.
        </h1>
        <p style={{margin:"0 0 22px", color:"var(--ink-2)", fontSize:14, lineHeight:1.55}}>
          Staffig is invite-only — coordinators add substitutes one at a time so the right people get the right shifts.
          You signed in as <strong style={{fontWeight:500, color:"var(--ink)"}}>amelie.t@gmail.com</strong>, but we don't have a record of that address.
        </p>

        <div className="stf-card" style={{padding:"16px 18px", marginBottom:18}}>
          <div className="stf-h-eyebrow" style={{marginBottom:10}}>Two ways forward</div>
          <div style={{display:"flex", gap:14, padding:"10px 0", borderBottom:"0.5px solid var(--line-soft)"}}>
            <div style={{fontFamily:"Instrument Serif", fontSize:24, width:24, color:"var(--terra)"}}>1</div>
            <div style={{fontSize:13, color:"var(--ink-2)", lineHeight:1.5}}>
              <strong style={{color:"var(--ink)", fontWeight:500}}>Sign in with a different account.</strong> If your coordinator invited you, they used a specific email — check it.
            </div>
          </div>
          <div style={{display:"flex", gap:14, padding:"10px 0"}}>
            <div style={{fontFamily:"Instrument Serif", fontSize:24, width:24, color:"var(--terra)"}}>2</div>
            <div style={{fontSize:13, color:"var(--ink-2)", lineHeight:1.5}}>
              <strong style={{color:"var(--ink)", fontWeight:500}}>Ask your organization to invite you.</strong> Send them this address and we'll do the rest.
            </div>
          </div>
        </div>

        <div style={{display:"flex", gap:10}}>
          <button className="stf-btn primary">Try a different account</button>
          <button className="stf-btn ghost">Email my coordinator</button>
        </div>
      </div>
    </EdgeFrame>
  );
}

// 3) Orphan cleanup (admin pov)
function EdgeOrphan() {
  const orphans = [
    {n:"olivia.p@outlook.com", reason:"Signed in 4 times, never invited", days:7},
    {n:"marc.beaudoin@gmail.com", reason:"Org Maison Bleue removed her", days:14},
    {n:"+1 (514) 555-0913", reason:"Phone signed in, no org match", days:21},
  ];
  return (
    <EdgeFrame>
      <div style={{margin:"auto", width:600}}>
        <div className="stf-h-eyebrow" style={{marginBottom:8}}>Admin · Housekeeping</div>
        <h1 style={{fontFamily:"Instrument Serif", fontSize:38, lineHeight:1.05, margin:"0 0 8px"}}>
          3 <em style={{fontStyle:"italic"}}>orphan accounts</em>
        </h1>
        <p style={{margin:"0 0 18px", color:"var(--ink-2)", fontSize:13, lineHeight:1.5, maxWidth:520}}>
          These people signed into Staffig but no organization claims them. Tidy up so they don't sit in limbo, or invite them in.
        </p>

        <div className="stf-card" style={{padding:0, overflow:"hidden", marginBottom:14}}>
          {orphans.map((o,i)=>(
            <div key={o.n} style={{display:"flex", alignItems:"center", gap:14, padding:"14px 18px", borderBottom: i<orphans.length-1?"0.5px solid var(--line-soft)":"none"}}>
              <div className="stf-avatar" style={{background:"var(--paper-2)", color:"var(--ink-3)"}}><I.User size={14}/></div>
              <div style={{flex:1, lineHeight:1.25}}>
                <div style={{fontSize:13, fontWeight:500, fontFamily: o.n.startsWith("+") ? "var(--mono)" : "inherit"}}>{o.n}</div>
                <div style={{fontSize:11, color:"var(--ink-3)"}}>{o.reason} · waiting {o.days}d</div>
              </div>
              <button className="stf-btn ghost" style={{padding:"6px 10px", fontSize:11}}>Invite</button>
              <button className="stf-btn danger" style={{padding:"6px 10px", fontSize:11}}>Remove</button>
            </div>
          ))}
        </div>

        <div style={{display:"flex", alignItems:"center", gap:10, padding:"12px 14px", background:"var(--moss-soft)", borderRadius:12}}>
          <I.Shield size={16} stroke={1.6}/>
          <div style={{fontSize:12, color:"var(--moss)", flex:1, lineHeight:1.4}}>
            Removed accounts can come back any time — they just sign in again and reappear here.
          </div>
          <button className="stf-btn moss" style={{padding:"7px 12px", fontSize:12}}>Auto-clean weekly</button>
        </div>
      </div>
    </EdgeFrame>
  );
}

Object.assign(window, { EdgeSignIn, EdgeNotInvited, EdgeOrphan });
