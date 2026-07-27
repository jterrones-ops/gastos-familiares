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
  const [formType, setFormType] = useState(null);
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

  async function saveEntry(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    let table;
    let payload;
    if (formType === "transaction") {
      const movementKind = form.get("movement_kind");
      const amount = Number(form.get("amount"));
      if (movementKind === "debt_payment") {
        const debt = debts.find((item) => item.id === form.get("debt_id"));
        if (!debt) return setMessage("Selecciona una deuda");
        const newPaid = Number(debt.paid_amount) + amount;
        const { error: debtError } = await supabase.from("debts").update({
          paid_amount: newPaid,
          status: newPaid >= Number(debt.total_amount) ? "paid" : "pending",
        }).eq("id", debt.id);
        if (debtError) return setMessage(debtError.message);
        table = "transactions";
        payload = { family_id: family.id, user_id: session.user.id, type: "expense", amount, category: "Pago de deuda", description: `Pago: ${debt.name}`, occurred_at: new Date().toISOString() };
      } else if (movementKind === "saving") {
        const goal = goals.find((item) => item.id === form.get("goal_id"));
        if (!goal) return setMessage("Selecciona una meta");
        const { error: goalError } = await supabase.from("goals").update({
          saved_amount: Number(goal.saved_amount) + amount,
        }).eq("id", goal.id);
        if (goalError) return setMessage(goalError.message);
        table = "transactions";
        payload = { family_id: family.id, user_id: session.user.id, type: "expense", amount, category: "Ahorro", description: `Aporte: ${goal.name}`, occurred_at: new Date().toISOString() };
      } else {
      table = "transactions";
        payload = { family_id: family.id, user_id: session.user.id, type: movementKind, amount, category: form.get("category"), description: form.get("description"), occurred_at: new Date().toISOString() };
      }
    } else if (formType === "budget") {
      table = "budgets";
      const category = form.get("category") === "__custom__" ? form.get("custom_category").trim() : form.get("category");
      if (!category) return setMessage("Escribe el nombre del gasto");
      payload = { family_id: family.id, category, amount: Number(form.get("amount")), month: `${new Date().toISOString().slice(0, 7)}-01` };
    } else if (formType === "goal") {
      table = "goals";
      payload = { family_id: family.id, name: form.get("name"), target_amount: Number(form.get("target_amount")), saved_amount: Number(form.get("saved_amount") || 0), target_date: form.get("target_date") || null };
    } else {
      table = "debts";
      payload = { family_id: family.id, name: form.get("name"), creditor: form.get("creditor"), total_amount: Number(form.get("total_amount")), paid_amount: Number(form.get("paid_amount") || 0), due_date: form.get("due_date") || null, status: "pending" };
    }
    const { error } = await supabase.from(table).insert(payload);
    if (error) return setMessage(error.message);
    setFormType(null);
    setMessage("Información guardada");
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
        onNew={(type) => setFormType(type)}
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
      {formType && <EntryForm type={formType} goals={goals} debts={debts} onClose={() => setFormType(null)} onSubmit={saveEntry} />}
    </div>
  );
}

function EntryForm({ type, goals, debts, onClose, onSubmit }) {
  const [movementKind, setMovementKind] = useState("expense");
  const [budgetCategory, setBudgetCategory] = useState("Luz");
  const title = { transaction: "Movimiento familiar", budget: "Nuevo presupuesto", goal: "Nueva meta de ahorro", debt: "Nueva deuda" }[type];
  const categories = ["Luz","Agua","Internet","Celular","Colegio","Alimentación","Vivienda","Transporte","Educación","Salud","Entretenimiento","Otros"];
  return <div className="backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
    <form className="modal" onSubmit={onSubmit}>
      <div className="modal-head"><div><p>Nuevo registro</p><h2>{title}</h2></div><button type="button" onClick={onClose}>×</button></div>
      {type === "transaction" && <>
        <label>Tipo de movimiento<select name="movement_kind" value={movementKind} onChange={(e) => setMovementKind(e.target.value)}><option value="expense">Gasto</option><option value="income">Ingreso</option><option value="debt_payment">Pago de deuda</option><option value="saving">Aporte de ahorro</option></select></label>
        <label>Monto<input name="amount" type="number" min="0.01" step="0.01" required /></label>
        {(movementKind === "expense" || movementKind === "income") && <>
          <label>Descripción<input name="description" required placeholder={movementKind === "income" ? "Ej. Sueldo" : "Ej. Supermercado"} /></label>
          <label>Categoría<select name="category">{(movementKind === "income" ? ["Sueldo","Ingreso adicional","Otros ingresos"] : categories).map(x => <option key={x}>{x}</option>)}</select></label>
        </>}
        {movementKind === "debt_payment" && <label>Deuda<select name="debt_id" required><option value="">Seleccionar deuda</option>{debts.filter(x => x.status === "pending").map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>}
        {movementKind === "saving" && <label>Meta de ahorro<select name="goal_id" required><option value="">Seleccionar meta</option>{goals.map(x => <option value={x.id} key={x.id}>{x.name}</option>)}</select></label>}
      </>}
      {type === "budget" && <>
        <label>Gasto fijo o categoría<select name="category" value={budgetCategory} onChange={(e) => setBudgetCategory(e.target.value)}>{categories.filter(x => x !== "Otros").map(x => <option key={x}>{x}</option>)}<option value="__custom__">Personalizado…</option></select></label>
        {budgetCategory === "__custom__" && <label>Nombre del gasto<input name="custom_category" required placeholder="Escribe el gasto que quieras" /></label>}
        <label>Límite mensual<input name="amount" type="number" min="0.01" step="0.01" required placeholder="S/ 0.00" /></label>
      </>}
      {type === "goal" && <>
        <label>Nombre de la meta<input name="name" required placeholder="Ej. Viaje familiar" /></label>
        <label>Monto objetivo<input name="target_amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Ahorrado actualmente<input name="saved_amount" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <label>Fecha objetivo<input name="target_date" type="date" /></label>
      </>}
      {type === "debt" && <>
        <label>Nombre de la deuda<input name="name" required placeholder="Ej. Préstamo" /></label>
        <label>Acreedor<input name="creditor" required placeholder="Banco o persona" /></label>
        <label>Monto total<input name="total_amount" type="number" min="0.01" step="0.01" required /></label>
        <label>Monto pagado<input name="paid_amount" type="number" min="0" step="0.01" defaultValue="0" /></label>
        <label>Fecha de vencimiento<input name="due_date" type="date" /></label>
      </>}
      <button className="primary" type="submit">Guardar</button>
    </form>
  </div>;
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
