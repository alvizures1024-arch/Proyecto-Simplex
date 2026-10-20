import unittest

from pydantic import ValidationError

from app.schemas import Problem
from app.simplex import solve


def problem(obj, cons, maximize=True):
    return Problem.model_validate({"obj": obj, "cons": [
        {"a": a, "op": op, "b": b} for a, op, b in cons], "max": maximize})


class SimplexTests(unittest.TestCase):
    def test_original_example_and_pivot_count(self):
        result = solve(problem([3, 5], [([1, 0], "<=", 4), ([0, 2], "<=", 12), ([3, 2], "<=", 18)]))
        self.assertEqual(result["status"], "optimal")
        self.assertAlmostEqual(result["z"], 36)
        self.assertEqual(result["sol"], [2, 6])
        self.assertEqual(result["count"], sum(log["enter"] is not None for log in result["logs"]))

    def test_minimization_with_phase_one(self):
        result = solve(problem([1, 1], [([1, 2], ">=", 4), ([4, 2], ">=", 12)], False))
        self.assertEqual(result["status"], "optimal")
        self.assertAlmostEqual(result["z"], 10 / 3)
        self.assertTrue(any("Fase I ·" in log["phase"] for log in result["logs"]))

    def test_equality(self):
        result = solve(problem([2, 1], [([1, 1], "=", 5)]))
        self.assertEqual(result["sol"], [5, 0])
        self.assertEqual(result["z"], 10)

    def test_negative_rhs(self):
        result = solve(problem([1, 0], [([-1, 0], "<=", -2), ([1, 0], "<=", 5)]))
        self.assertEqual(result["status"], "optimal")
        self.assertEqual(result["z"], 5)

    def test_infeasible(self):
        result = solve(problem([1, 1], [([1, 0], "<=", 1), ([1, 0], ">=", 2)]))
        self.assertEqual(result["status"], "infeasible")

    def test_unbounded(self):
        result = solve(problem([1, 1], [([1, -1], "<=", 1)]))
        self.assertEqual(result["status"], "unbounded")

    def test_redundant_equalities(self):
        result = solve(problem([1, 1], [([1, 1], "=", 4), ([2, 2], "=", 8), ([0, 0], "=", 0)]))
        self.assertEqual(result["status"], "optimal")
        self.assertAlmostEqual(result["z"], 4)

    def test_artificial_variable_removed_by_pivot(self):
        result = solve(problem([1, 0], [([-1, 0], "=", 0), ([0, 1], "<=", 1)]))
        self.assertEqual(result["status"], "optimal")
        self.assertEqual(result["z"], 0)
        self.assertTrue(any("retiro" in log["phase"] for log in result["logs"]))
        self.assertEqual(result["count"], sum(log["enter"] is not None for log in result["logs"]))

    def test_degenerate_cycling_example_bland(self):
        result = solve(problem([10, -57, -9, -24], [
            ([0.5, -5.5, -2.5, 9], "<=", 0),
            ([0.5, -1.5, -0.5, 1], "<=", 0),
            ([1, 0, 0, 0], "<=", 1),
        ]))
        self.assertEqual(result["status"], "optimal")
        self.assertAlmostEqual(result["z"], 1)

    def test_zero_objective_and_empty_redundant_rows(self):
        result = solve(problem([0, 0], [([0, 0], "=", 0)]))
        self.assertEqual(result["status"], "optimal")
        self.assertEqual(result["z"], 0)

    def test_inconsistent_zero_row(self):
        self.assertEqual(solve(problem([1, 1], [([0, 0], "=", 1)]))["status"], "infeasible")

    def test_invalid_inputs(self):
        invalid = [
            {"obj": [1, 2], "cons": []},
            {"obj": [float('nan'), 2], "cons": [{"a": [1, 2], "op": "<=", "b": 1}]},
            {"obj": [1, 2], "cons": [{"a": [1, 2, 3], "op": "<=", "b": 1}]},
            {"obj": [1, 2], "cons": [{"a": [1, 2], "op": "<", "b": 1}]},
            {"obj": [1, 2], "cons": [{"a": [1, 2], "op": "<=", "b": 1}], "max": "yes"},
        ]
        for payload in invalid:
            with self.subTest(payload=payload), self.assertRaises(ValidationError):
                Problem.model_validate(payload)

    def test_against_scipy_on_80_models(self):
        try:
            import random
            from scipy.optimize import linprog
        except ImportError:
            self.skipTest("SciPy no instalado; pip install scipy para la comparación independiente.")
        rng = random.Random(2026)
        for iteration in range(80):
            n = rng.randint(2, 6)
            obj = [rng.uniform(-4, 6) for _ in range(n)]
            feasible = [rng.uniform(0, 4) for _ in range(n)]
            constraints = []
            # Cotas superiores garantizan que el modelo sea acotado.
            for j in range(n):
                constraints.append(([float(i == j) for i in range(n)], "<=", feasible[j] + rng.uniform(1, 5)))
            for k in range(rng.randint(1, 7)):
                a = [rng.uniform(-3, 3) for _ in range(n)]
                op = rng.choice(["<=", ">=", "="])
                rhs = sum(v*x for v, x in zip(a, feasible))
                rhs += rng.uniform(0, 3) * (1 if op == "<=" else -1 if op == ">=" else 0)
                constraints.append((a, op, rhs))
            maximize = iteration % 2 == 0
            inequalities = [(a if op == "<=" else [-v for v in a], b if op == "<=" else -b)
                            for a, op, b in constraints if op != "="]
            equalities = [(a, b) for a, op, b in constraints if op == "="]
            expected = linprog([-v for v in obj] if maximize else obj,
                               A_ub=[a for a, b in inequalities], b_ub=[b for a, b in inequalities],
                               A_eq=[a for a, b in equalities] or None,
                               b_eq=[b for a, b in equalities] or None, method="highs")
            with self.subTest(iteration=iteration):
                self.assertTrue(expected.success)
                result = solve(problem(obj, constraints, maximize))
                self.assertEqual(result["status"], "optimal")
                self.assertAlmostEqual(result["z"], -expected.fun if maximize else expected.fun, places=5)
