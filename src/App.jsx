import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, Copy, LogOut, Plus, Users, WalletCards } from "lucide-react";
import { supabase } from "./lib/supabase";
import { summarize } from "./lib/finance";
import Dashboard from "./Dashboard";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });

export default function App() {
  const [session, setSession] = useState(null);
  const [family, setFamily] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [goals, setGoals] = useState([]);
  const [debts, setDebts] = useState([]);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [showInvite, setShowInvite] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    loadFamily();
  }, [session]);

  async function loadFamily() {
    const { error: userError } = await supabase.auth.getUser();
    if (userError) {
      await supabase.auth.signOut({ scope: "local" });
      setSession(null);
      setMessage("La sesión anterior fue eliminada. Crea tu cuenta nuevamente.");
      return;
    }
    const { data, error } = await supabase
      .from("family_members")
      .select("family_id, families(id,name,join_code)")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (error) return setMessage(error.message);
    if (!data) return setFamily(null);
    setFamily(data.families);
    await loadData(data.family_id);
  }

  async function loadData(familyId) {
    const [{ data: rows }, { data: limits }, { data: goalRows }, { data: debtRows }] = await Promise.all([
      supabase.from("transactions").select("*").eq("family_id", familyId).order("occurred_at", { ascending: false }),
      supabase.from("budgets").select("*").eq("family_id", familyId),
      supabase.from("goals").select("*").eq("family_id", familyId),
      supabase.from("debts").select("*").eq("family_id", familyId),
    ]);
    setTransactions(rows || []);
    setBudgets(limits || []);
    setGoals(goalRows || []);
    setDebts(debtRows || []);
  }

  const totals = useMemo(() => summarize(transactions), [transactions]);
  const alerts = budgets.filter((budget) => {
    const spent = transactions
      .filter((item) => item.type === "expense" && item.category === budget.category)
      .reduce((sum, item) => sum + Number(item.amount), 0);
    return spent >= Number(budget.amount) * 0.9;
  });

  if (!session) return <AuthScreen onMessage={setMessage} message={message} />;
  if (!family) return <Onboarding session={session} onReady={loadFamily} onMessage={setMessage} message={message} />;

  async function saveTransaction(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await supabase.from("transactions").insert({
      family_id: family.id,
      user_id: session.user.id,
      type: form.get("type"),
      amount: Number(form.get("amount")),
      category: form.get("category"),
      description: form.get("description"),
      occurred_at: new Date().toISOString(),
    });
    if (error) return setMessage(error.message);
    setShowForm(false);
    setMessage("Movimiento guardado");
    await loadData(family.id);
  }

  async function copyFamilyCode() {
    await navigator.clipboard.writeText(family.join_code);
    setMessage("Código familiar copiado");
  }

  return (
    <div>
      <Dashboard
        family={family}
        transactions={transactions}
        budgets={budgets}
        goals={goals}
        debts={debts}
        totals={totals}
        onNewTransaction={() => setShowForm(true)}
        onInvite={() => setShowInvite(true)}
        onSignOut={() => supabase.auth.signOut()}
      />
      {message && <div className="toast">{message}</div>}
      {showInvite && (
        <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowInvite(false)}>
          <div className="modal invite-modal">
            <div className="modal-head">
              <div><p>Cuenta compartida</p><h2>Invitar a tu esposa</h2></div>
              <button type="button" onClick={() => setShowInvite(false)}>×</button>
            </div>
            <div className="invite-illustration"><Users size={26} /></div>
            <p className="invite-help">Ella debe crear su propio usuario y seleccionar “Ya tengo un código”. Ambos verán los mismos datos.</p>
            <div className="family-code">
              <small>Código familiar</small>
              <strong>{family.join_code}</strong>
            </div>
            <button className="copy-code" type="button" onClick={copyFamilyCode}><Copy size={17} /> Copiar código</button>
          </div>
        </div>
      )}
      {showForm && (
        <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <form className="modal" onSubmit={saveTransaction}>
            <div className="modal-head"><div><p>Nuevo registro</p><h2>Movimiento familiar</h2></div><button type="button" onClick={() => setShowForm(false)}>×</button></div>
            <label>Tipo<select name="type"><option value="expense">Gasto</option><option value="income">Ingreso</option></select></label>
            <label>Monto<input name="amount" type="number" min="0.01" step="0.01" required /></label>
            <label>Descripción<input name="description" required placeholder="Ej. Supermercado" /></label>
            <label>Categoría<select name="category">{["Alimentación","Vivienda","Transporte","Educación","Salud","Entretenimiento","Ingresos","Otros"].map(x => <option key={x}>{x}</option>)}</select></label>
            <button className="primary" type="submit">Guardar</button>
          </form>
        </div>
      )}
    </div>
  );
}

function Card({ icon, label, value, tone }) {
  return <article className="card"><span className={tone}>{icon}</span><div><small>{label}</small><strong>{value}</strong></div></article>;
}

function AuthScreen({ onMessage, message }) {
  const [mode, setMode] = useState("login");
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const credentials = { email: form.get("email"), password: form.get("password") };
    const result = mode === "login"
      ? await supabase.auth.signInWithPassword(credentials)
      : await supabase.auth.signUp(credentials);
    onMessage(result.error?.message || (mode === "register" ? "Revisa tu correo para confirmar la cuenta." : ""));
  }
  return (
    <div className="auth-page"><div className="auth-card">
      <div className="auth-brand"><WalletCards /><h1>Mi Familia</h1><p>Una cuenta familiar, dos usuarios.</p></div>
      <form onSubmit={submit}>
        <label>Correo<input name="email" type="email" required /></label>
        <label>Contraseña<input name="password" type="password" minLength="8" required /></label>
        <button className="primary" type="submit">{mode === "login" ? "Ingresar" : "Crear usuario"}</button>
      </form>
      <button className="link" onClick={() => setMode(mode === "login" ? "register" : "login")}>{mode === "login" ? "Crear una cuenta" : "Ya tengo cuenta"}</button>
      {message && <p className="form-message">{message}</p>}
    </div></div>
  );
}

function Onboarding({ onReady, onMessage, message }) {
  const [mode, setMode] = useState("create");
  async function submit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const fn = mode === "create" ? "create_family" : "join_family";
    const args = mode === "create"
      ? { family_name: form.get("family"), member_name: form.get("name") }
      : { invitation_code: form.get("code").toUpperCase(), member_name: form.get("name") };
    const { error } = await supabase.rpc(fn, args);
    if (error) return onMessage(error.message);
    onMessage("");
    onReady();
  }
  return <div className="auth-page"><div className="auth-card">
    <h1>{mode === "create" ? "Crear cuenta familiar" : "Unirse a la familia"}</h1>
    <p>El primer usuario crea la familia. El segundo utiliza el código de invitación.</p>
    <form onSubmit={submit}>
      <label>Tu nombre<input name="name" required /></label>
      {mode === "create"
        ? <label>Nombre de la familia<input name="family" required placeholder="Ej. Familia Agurto" /></label>
        : <label>Código familiar<input name="code" required maxLength="8" /></label>}
      <button className="primary" type="submit">Continuar</button>
    </form>
    <button className="link" onClick={() => setMode(mode === "create" ? "join" : "create")}>{mode === "create" ? "Ya tengo un código" : "Crear una familia"}</button>
    <button className="link" onClick={() => supabase.auth.signOut({ scope: "local" })}>Cerrar sesión</button>
    {message && <p className="form-message">{message}</p>}
  </div></div>;
}
