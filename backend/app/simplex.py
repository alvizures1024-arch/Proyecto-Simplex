"""Simplex de dos fases, con variables no negativas y regla de Bland.

Cada snapshot registra la tabla posterior al pivote. Los índices enter/leave
identifican su columna y fila. count cuenta pivotes, no tablas iniciales.
"""
import math

from .schemas import Problem

EPS = 1e-8
MAX_ITERATIONS = 200


class NumericalError(ValueError):
    pass


def solve(problem: Problem) -> dict:
    n = len(problem.obj)
    names = [f"x{i + 1}" for i in range(n)]
    artificial: set[int] = set()
    basis: list[int] = []
    table: list[list[float]] = []
    logs = []
    pivots = 0
    counts = {"h": 0, "e": 0, "a": 0}

    def add_column(kind):
        counts[kind] += 1
        names.append(f"{kind}{counts[kind]}")
        for row in table:
            row.insert(len(row) - 1, 0.0)
        return len(names) - 1

    for constraint in problem.cons:
        a, b, op = list(constraint.a), constraint.b, constraint.op
        if b < 0:
            a, b = [-v for v in a], -b
            op = {"<=": ">=", ">=": "<=", "=": "="}[op]
        table.append(a + [0.0] * (len(names) - n) + [b])
        if op == "<=":
            col = add_column("h")
            table[-1][col] = 1.0
        else:
            if op == ">=":
                col = add_column("e")
                table[-1][col] = -1.0
            col = add_column("a")
            table[-1][col] = 1.0
            artificial.add(col)
        basis.append(col)

    def init_objective(cost):
        objective = [-v for v in cost] + [0.0]
        for i, basic in enumerate(basis):
            for j in range(len(objective)):
                objective[j] += cost[basic] * table[i][j]
        table.append(objective)

    def snapshot(phase, enter=None, leave=None):
        logs.append(dict(phase=phase, names=names.copy(), basis=basis.copy(),
                         table=[r.copy() for r in table], enter=enter, leave=leave))

    def pivot(row, col):
        nonlocal pivots
        divisor = table[row][col]
        table[row] = [v / divisor for v in table[row]]
        for i in range(len(table)):
            if i != row:
                factor = table[i][col]
                table[i] = [v - factor * p for v, p in zip(table[i], table[row])]
        if any(not math.isfinite(v) for r in table for v in r):
            raise NumericalError("Inestabilidad numérica. Reduce la escala de los coeficientes.")
        basis[row] = col
        pivots += 1

    def run(phase):
        snapshot(phase)
        while True:
            entering = next((j for j in range(len(names)) if table[-1][j] < -EPS), None)
            if entering is None:
                return "optimal"
            if pivots >= MAX_ITERATIONS:
                return "limit"
            leaving, ratio = None, math.inf
            for i in range(len(basis)):
                coefficient = table[i][entering]
                if coefficient > EPS:
                    candidate = table[i][-1] / coefficient
                    if candidate < ratio - EPS or (
                        abs(candidate - ratio) <= EPS and
                        (leaving is None or basis[i] < basis[leaving])
                    ):
                        leaving, ratio = i, candidate
            if leaving is None:
                return "unbounded"
            pivot(leaving, entering)
            snapshot(phase, entering, leaving)

    def result(status, **extra):
        return dict(status=status, logs=logs, count=pivots, **extra)

    if artificial:
        init_objective([-1.0 if j in artificial else 0.0 for j in range(len(names))])
        status = run("Fase I · factibilidad")
        if status != "optimal":
            return result("limit" if status == "limit" else "infeasible")
        if abs(table[-1][-1]) > 1e-6:
            return result("infeasible")
        for i in range(len(basis) - 1, -1, -1):
            if basis[i] in artificial:
                entering = next((j for j in range(len(names))
                                 if j not in artificial and abs(table[i][j]) > EPS), None)
                if entering is None:
                    if abs(table[i][-1]) > 1e-6:
                        return result("infeasible")
                    table.pop(i)
                    basis.pop(i)
                else:
                    if pivots >= MAX_ITERATIONS:
                        return result("limit")
                    pivot(i, entering)
                    snapshot("Fase I · retiro de artificiales", entering, i)
        table.pop()
        keep = [j for j in range(len(names)) if j not in artificial]
        basis[:] = [keep.index(j) for j in basis]
        table[:] = [[r[j] for j in keep] + [r[-1]] for r in table]
        names[:] = [names[j] for j in keep]

    cost = [v if problem.maximize else -v for v in problem.obj]
    init_objective(cost + [0.0] * (len(names) - n))
    status = run("Fase II · optimización")
    if status != "optimal":
        return result(status)
    solution = [0.0] * n
    for i, basic in enumerate(basis):
        if basic < n:
            solution[basic] = table[i][-1]
    # Verifica el modelo original antes de anunciar un óptimo numérico.
    for c in problem.cons:
        lhs = sum(a * x for a, x in zip(c.a, solution))
        tolerance = 1e-6 * max(1.0, abs(c.b), sum(abs(a * x) for a, x in zip(c.a, solution)))
        invalid = ((c.op == "<=" and lhs > c.b + tolerance) or
                   (c.op == ">=" and lhs < c.b - tolerance) or
                   (c.op == "=" and abs(lhs - c.b) > tolerance))
        if invalid:
            raise NumericalError("No se pudo verificar la factibilidad numérica del resultado.")
    if any(x < -1e-6 for x in solution):
        raise NumericalError("El resultado viola la no negatividad de las variables.")
    return result("optimal", z=sum(a * x for a, x in zip(problem.obj, solution)), sol=solution)
