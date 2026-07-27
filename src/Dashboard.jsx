import { useMemo, useState } from "react";
import {
  ArrowDown, ArrowUp, BarChart3, Copy, CreditCard, Goal, Home,
  List, LogOut, Menu, PieChart, Plus, Users, WalletCards, X
} from "lucide-react";

const money = new Intl.NumberFormat("es-PE", { style: "currency", currency: "PEN" });
const nav = [
  ["summary", "Resumen", Home],
  ["transactions", "Movimientos", List],
  ["budgets", "Presupuestos", PieChart],
  ["goals", "Metas", Goal],
  ["debts", "Deudas", CreditCard],
  ["reports", "Reportes", BarChart3],
];

export default function Dashboard({
  family, transactions, budgets, goals, debts, totals,
  onNew, onInvite, onSignOut,
}) {
  const [active, setActive] = useState("summary");
  const [mobileMenu, setMobileMenu] = useState(false);
  const expenses = useMemo(() => transactions.filter((x) => x.type === "expense"), [transactions]);
  const byCategory = useMemo(() => expenses.reduce((acc, item) => {
    acc[item.category] = (acc[item.category] || 0) + Number(item.amount);
    return acc;
  }, {}), [expenses]);
  const action = {
    summary: ["transaction", "Registrar movimiento"],
    transactions: ["transaction", "Registrar movimiento"],
    budgets: ["budget", "Nuevo presupuesto"],
    goals: ["goal", "Nueva meta"],
    debts: ["debt", "Nueva deuda"],
  }[active];

  function go(id) {
    setActive(id);
    setMobileMenu(false);
  }

  return (
    <div className="app-layout">
      <aside className={mobileMenu ? "sidebar open" : "sidebar"}>
        <div className="side-brand"><WalletCards size={27} /><strong>Mi Familia</strong></div>
        <button className="close-menu" onClick={() => setMobileMenu(false)}><X /></button>
        <nav>{nav.map(([id, label, Icon]) => (
          <button key={id} className={active === id ? "active" : ""} onClick={() => go(id)}>
            <Icon size={20} /><span>{label}</span>
          </button>
        ))}</nav>
        <div className="side-bottom">
          <button onClick={onInvite}><Users size={19} /> Invitar</button>
          <button onClick={onSignOut}><LogOut size={19} /> Salir</button>
        </div>
      </aside>
      {mobileMenu && <button className="menu-shade" onClick={() => setMobileMenu(false)} />}

      <section className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMobileMenu(true)}><Menu /></button>
          <div><small>{family.name}</small><h1>{active === "summary" ? "Buenos días, Familia" : nav.find(x => x[0] === active)?.[1]}</h1></div>
          <div className="top-actions">
            <div className="member-bubbles"><span>J</span><span>+</span></div>
            {action && <button className="primary" onClick={() => onNew(action[0])}><Plus size={19} /> {action[1]}</button>}
          </div>
        </header>

        <main className="dashboard-main">
          {active === "summary" && <Summary totals={totals} transactions={transactions} budgets={budgets} goals={goals} byCategory={byCategory} />}
          {active === "transactions" && <Transactions rows={transactions} />}
          {active === "budgets" && <Budgets rows={budgets} byCategory={byCategory} />}
          {active === "goals" && <Goals rows={goals} />}
          {active === "debts" && <Debts rows={debts} />}
          {active === "reports" && <Reports transactions={transactions} byCategory={byCategory} totals={totals} />}
        </main>
      </section>
    </div>
  );
}

function Metric({ icon, label, value, tone }) {
  return <article className="metric-card"><span className={tone}>{icon}</span><div><small>{label}</small><strong>{money.format(value)}</strong></div></article>;
}

function Summary({ totals, transactions, budgets, goals, byCategory }) {
  const mainGoal = goals[0];
  const goalPct = mainGoal ? Math.min(100, Math.round(Number(mainGoal.saved_amount) / Number(mainGoal.target_amount) * 100)) : 0;
  return <>
    <section className="model-metrics">
      <Metric icon={<ArrowUp />} label="Ingresos" value={totals.income} tone="green" />
      <Metric icon={<ArrowDown />} label="Gastos" value={totals.expense} tone="coral" />
      <Metric icon={<WalletCards />} label="Disponible" value={totals.balance} tone="blue" />
    </section>
    <section className="summary-grid">
      <article className="dash-card budget-summary">
        <div className="dash-title"><h2>Presupuesto por categoría</h2><span>{budgets.length} categorías</span></div>
        {budgets.length === 0 && <Empty text="Aún no hay presupuestos mensuales." />}
        {budgets.slice(0, 5).map((b) => {
          const used = byCategory[b.category] || 0;
          const pct = Math.min(100, Math.round(used / Number(b.amount) * 100));
          return <div className="budget-line" key={b.id}>
            <div><strong>{b.category}</strong><span>{money.format(used)} de {money.format(b.amount)}</span><b>{pct}%</b></div>
            <i><em style={{ width: `${pct}%` }} className={pct >= 90 ? "danger" : ""} /></i>
          </div>;
        })}
      </article>
      <div className="summary-side">
        <article className="dash-card goal-summary">
          <div><small>Meta de ahorro</small><h2>{mainGoal?.name || "Crea tu primera meta"}</h2>
            <span>{mainGoal ? `${money.format(mainGoal.saved_amount)} de ${money.format(mainGoal.target_amount)}` : "Todavía no hay metas"}</span></div>
          <div className="ring" style={{ "--progress": `${goalPct * 3.6}deg` }}><strong>{goalPct}%</strong></div>
        </article>
        <article className="dash-card recent">
          <div className="dash-title"><h2>Actividad reciente</h2></div>
          {transactions.length === 0 && <Empty text="Todavía no hay movimientos." />}
          {transactions.slice(0, 4).map((item) => <div className="activity" key={item.id}>
            <span>{item.description.slice(0, 1).toUpperCase()}</span>
            <div><strong>{item.description}</strong><small>{item.category}</small></div>
            <b className={item.type}>{item.type === "expense" ? "−" : "+"}{money.format(item.amount)}</b>
          </div>)}
        </article>
      </div>
    </section>
  </>;
}

function Transactions({ rows }) {
  return <article className="dash-card page-card"><div className="dash-title"><h2>Todos los movimientos</h2><span>{rows.length} registros</span></div>
    {rows.length === 0 && <Empty text="Registra tu primer ingreso o gasto." />}
    {rows.map((item) => <div className="activity wide" key={item.id}><span>{item.type === "expense" ? "G" : "I"}</span><div><strong>{item.description}</strong><small>{item.category} · {new Date(item.occurred_at).toLocaleDateString("es-PE")}</small></div><b className={item.type}>{item.type === "expense" ? "−" : "+"}{money.format(item.amount)}</b></div>)}
  </article>;
}

function Budgets({ rows, byCategory }) {
  return <article className="dash-card page-card"><div className="dash-title"><h2>Presupuesto mensual</h2><span>{rows.length} categorías</span></div>
    {rows.length === 0 && <Empty text="Todavía no hay presupuestos configurados." />}
    {rows.map((b) => { const used = byCategory[b.category] || 0; const pct = Math.min(100, Math.round(used / Number(b.amount) * 100)); return <div className="budget-line large" key={b.id}><div><strong>{b.category}</strong><span>{money.format(used)} de {money.format(b.amount)}</span><b>{pct}%</b></div><i><em style={{width:`${pct}%`}} className={pct >= 90 ? "danger" : ""}/></i></div>; })}
  </article>;
}

function Goals({ rows }) {
  return <div className="item-grid">{rows.length === 0 && <article className="dash-card"><Empty text="Todavía no hay metas de ahorro." /></article>}{rows.map(g => { const pct=Math.min(100,Math.round(Number(g.saved_amount)/Number(g.target_amount)*100)); return <article className="dash-card item-card" key={g.id}><Goal/><h2>{g.name}</h2><strong>{money.format(g.saved_amount)}</strong><span>de {money.format(g.target_amount)}</span><i><em style={{width:`${pct}%`}}/></i><small>{pct}% completado</small></article>; })}</div>;
}

function Debts({ rows }) {
  return <div className="item-grid">{rows.length === 0 && <article className="dash-card"><Empty text="No hay deudas pendientes." /></article>}{rows.map(d => <article className="dash-card item-card" key={d.id}><CreditCard/><h2>{d.name}</h2><span>{d.creditor}</span><strong>{money.format(Number(d.total_amount)-Number(d.paid_amount))}</strong><small>Pendiente</small></article>)}</div>;
}

function Reports({ byCategory, totals }) {
  const entries = Object.entries(byCategory).sort((a,b)=>b[1]-a[1]);
  const max = Math.max(...entries.map(x=>x[1]),1);
  return <section className="reports-grid"><article className="dash-card"><div className="dash-title"><h2>Gastos por categoría</h2></div>{entries.length===0&&<Empty text="Los gráficos aparecerán cuando registres gastos."/>}{entries.map(([name,value])=><div className="report-bar" key={name}><span>{name}</span><i><em style={{width:`${value/max*100}%`}}/></i><strong>{money.format(value)}</strong></div>)}</article><article className="dash-card report-balance"><small>Balance familiar</small><strong>{money.format(totals.balance)}</strong><div><span>Ingresos {money.format(totals.income)}</span><span>Gastos {money.format(totals.expense)}</span></div></article></section>;
}

function Empty({ text }) { return <div className="model-empty">{text}</div>; }
