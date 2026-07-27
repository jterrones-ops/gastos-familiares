import { describe, expect, it } from "vitest";
import { budgetStatus, generateYearFixture, summarize } from "../src/lib/finance";

describe("simulación anual familiar", () => {
  const rows = generateYearFixture(2025);

  it("genera doce meses para dos usuarios sin días inválidos", () => {
    expect(rows.filter((x) => x.type === "income")).toHaveLength(12);
    expect(new Set(rows.map((x) => x.member))).toEqual(new Set(["Usuario 1", "Usuario 2"]));
    expect(rows.every((x) => !Number.isNaN(new Date(x.date).getTime()))).toBe(true);
  });

  it("calcula ingresos, gastos y saldo con precisión", () => {
    const totals = summarize(rows);
    expect(totals.income).toBeGreaterThan(74000);
    expect(totals.expense).toBeGreaterThan(0);
    expect(totals.balance).toBe(totals.income - totals.expense);
  });

  it("activa alertas al 90% y al superar el presupuesto", () => {
    const warning = budgetStatus({ category: "Comida", amount: 1000 }, [{ type: "expense", category: "Comida", amount: 920 }]);
    const over = budgetStatus({ category: "Comida", amount: 1000 }, [{ type: "expense", category: "Comida", amount: 1100 }]);
    expect(warning.status).toBe("warning");
    expect(over.status).toBe("over");
  });
});
