import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import closerControlLogo from "@/assets/closer-control-logo.png";

const LAUNCHER_URL = import.meta.env.VITE_LAUNCHER_URL as string | undefined;

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // Unified platform: login is the launcher's job. ACQ renders this whenever
  // there's no session (sign-out from any screen, expired/revoked token), so
  // send the user to the launcher instead of ACQ's own login. Standalone
  // deploys (no launcher configured) still show the local form below.
  useEffect(() => {
    if (LAUNCHER_URL) window.location.replace(LAUNCHER_URL);
  }, []);
  if (LAUNCHER_URL) return null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(""); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setErr(error.message);
  };

  return (
    <div style={{
      display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center",
      height:"100vh", background:"#000", fontFamily:"'Open Sans', sans-serif", padding:24,
    }}>
      <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
        <img src={closerControlLogo} alt="CC" style={{ height:36 }} />
        <div style={{ fontSize:24, fontWeight:800, fontFamily:"'League Spartan', sans-serif", color:"#f4f4f4", letterSpacing:"0.04em" }}>
          ACQ COACH
        </div>
      </div>
      <div style={{ fontSize:12, color:"#777", marginBottom:32, textTransform:"uppercase", letterSpacing:"0.12em" }}>
        Sign in
      </div>
      <form onSubmit={submit} style={{
        background:"#0d0d0d", border:"1px solid #1c1c1c", borderRadius:10, padding:28, width:"100%", maxWidth:380,
      }}>
        <label style={{ fontSize:11, color:"#999", textTransform:"uppercase", letterSpacing:"0.1em" }}>Email</label>
        <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required autoFocus
          style={{ width:"100%", marginTop:6, marginBottom:14, padding:"10px 12px", background:"#000",
            border:"1px solid #222", borderRadius:6, color:"#f4f4f4", fontSize:14 }} />
        <label style={{ fontSize:11, color:"#999", textTransform:"uppercase", letterSpacing:"0.1em" }}>Password</label>
        <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required
          style={{ width:"100%", marginTop:6, marginBottom:14, padding:"10px 12px", background:"#000",
            border:"1px solid #222", borderRadius:6, color:"#f4f4f4", fontSize:14 }} />
        {err && <div style={{ color:"#c0392b", fontSize:12, marginBottom:12 }}>{err}</div>}
        <button type="submit" disabled={loading} style={{
          width:"100%", padding:"11px 14px", background:"#4e7d3d", color:"#fff", border:"none",
          borderRadius:6, fontWeight:700, letterSpacing:"0.06em", cursor:"pointer",
          textTransform:"uppercase", fontSize:13, opacity: loading?0.6:1,
        }}>{loading?"Signing in…":"Sign in"}</button>
        <div style={{ fontSize:11, color:"#777", marginTop:16, textAlign:"center" }}>
          No public sign-up. Contact your admin for access.
        </div>
      </form>
    </div>
  );
}
