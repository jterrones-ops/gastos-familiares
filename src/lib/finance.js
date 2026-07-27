export function summarize(movements) {
  return movements.reduce(
    (result, item) => {
      const amount = Number(item.amount) || 0;
      if (item.type === "income") result.income += amount;
      if (item.type === "expense") result.expense += amount;
      result.balance = result.income - result.expense;
      return result;
    },
    { income: 0, expense: 0, balance: 0 },
  );
}

export function budgetStatus(budget, movements) {
  const spent = movements
    .filter((item) => item.type === "expense" && item.category === budget.category)
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const percentage = budget.amount > 0 ? Math.round((spent / budget.amount) * 100) : 0;
  return {
    ...budget,
    spent,
    percentage,
    status: percentage > 100 ? "over" : percentage >= 90 ? "warning" : "ok",
  };
}

export function generateYearFixture(year = 2025) {
  const categories = ["Alimentación", "Vivienda", "Transporte", "Educación", "Salud", "Otros"];
  const members = ["Usuario 1", "Usuario 2"];
  const rows = [];
  for (let month = 0; month < 12; month += 1) {
    rows.push({
      type: "income",
      amount: 6200 + month * 25,
      category: "Ingresos",
      member: members[month % 2],
      date: new Date(year, month, 1).toISOString(),
    });
    for (let day = 2; day <= 28; day += 2) {
      const category = categories[(month + day) % categories.length];
      rows.push({
        type: "expense",
        amount: 30 + ((month * 17 + day * 13) % 420),
        category,
        member: members[(month + day) % 2],
        date: new Date(year, month, day).toISOString(),
      });
    }
  }
  return rows;
}
