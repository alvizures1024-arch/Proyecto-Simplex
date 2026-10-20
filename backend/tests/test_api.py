import unittest
from datetime import timedelta
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base, SavedProblem, User, UserSession, RevokedSession, get_session
from app.auth import AUTH_ATTEMPTS, COOKIE, now, verify_password
from app.main import app

EXAMPLE = {"obj": [3, 5], "cons": [
    {"a": [1, 0], "op": "<=", "b": 4},
    {"a": [0, 2], "op": "<=", "b": 12},
    {"a": [3, 2], "op": "<=", "b": 18},
], "max": True}


class ApiTests(unittest.TestCase):
    def test_database_names_in_spanish(self):
        self.assertEqual(SavedProblem.__tablename__, 'problemas')
        self.assertEqual(set(SavedProblem.__table__.columns.keys()), {
            'id', 'modo', 'estado', 'problema', 'resultado', 'fecha_creacion',
        })

    def setUp(self):
        # SQLite sólo aísla las pruebas HTTP; la aplicación usa MySQL.
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.sessions = sessionmaker(self.engine, expire_on_commit=False)

        def session_override():
            with self.sessions() as session:
                yield session

        app.dependency_overrides[get_session] = session_override
        self.client = TestClient(app)  # Sin lifespan: evita conectar a MySQL real.
        AUTH_ATTEMPTS.clear()
        self.account = {'name': 'Prueba', 'email': 'prueba@example.com', 'password': 'ClavePrueba2026!'}
        created = self.client.post('/api/auth/register', json=self.account)
        self.assertEqual(created.status_code, 201)

    def tearDown(self):
        self.client.close()
        app.dependency_overrides.clear()
        self.engine.dispose()

    def test_solve_save_list_and_recover(self):
        response = self.client.post('/api/solve', json=EXAMPLE)
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertTrue(result['saved'])
        self.assertEqual(result['z'], 36)
        records = self.client.get('/api/problems').json()
        self.assertEqual(records[0]['id'], result['id'])
        recovered = self.client.get(f"/api/problems/{result['id']}").json()
        self.assertEqual(recovered['problem'], EXAMPLE)
        self.assertEqual(recovered['result']['sol'], [2, 6])
        self.assertTrue(recovered['created_at'].endswith('+00:00'))

    def test_invalid_request_not_saved(self):
        self.assertEqual(self.client.post('/api/solve', json={**EXAMPLE, 'cons': []}).status_code, 422)
        self.assertEqual(self.client.get('/api/problems').json(), [])

    def test_not_found_and_pagination_limits(self):
        self.assertEqual(self.client.get('/api/problems/9999').status_code, 404)
        self.assertEqual(self.client.get('/api/problems?limit=101').status_code, 422)
        self.assertEqual(self.client.get('/api/problems?offset=-1').status_code, 422)

    def test_health_and_cors(self):
        self.assertEqual(self.client.get('/api/health').status_code, 200)
        response = self.client.options('/api/solve', headers={
            'Origin': 'http://localhost:8080', 'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'content-type'})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers['access-control-allow-origin'], 'http://localhost:8080')

    def test_mysql_failure_reports_unsaved_result(self):
        with patch('sqlalchemy.orm.Session.commit', side_effect=OperationalError('commit', {}, Exception())):
            response = self.client.post('/api/solve', json=EXAMPLE)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['z'], 36)
        self.assertFalse(response.json()['saved'])
        self.assertIn('warning', response.json())

    def test_database_failure_for_history_and_health(self):
        with patch('sqlalchemy.orm.Session.scalars', side_effect=OperationalError('select', {}, Exception())):
            self.assertEqual(self.client.get('/api/problems').status_code, 503)
        with patch('sqlalchemy.orm.Session.execute', side_effect=OperationalError('select', {}, Exception())):
            self.assertEqual(self.client.get('/api/health').status_code, 503)

    def test_auth_required_for_problem_routes(self):
        self.client.cookies.clear()
        self.assertEqual(self.client.post('/api/solve', json=EXAMPLE).status_code, 401)
        self.assertEqual(self.client.get('/api/problems').status_code, 401)
        self.assertEqual(self.client.get('/api/problems/1').status_code, 401)

    def test_cookie_and_password_storage(self):
        cookie_response = self.client.post('/api/auth/login', json={
            'email': self.account['email'], 'password': self.account['password'],
        })
        cookie = cookie_response.headers['set-cookie']
        self.assertIn('HttpOnly', cookie)
        self.assertIn('SameSite=lax', cookie)
        self.assertIn('Path=/api', cookie)
        self.assertEqual(self.client.get('/api/auth/me').json()['name'], 'Prueba')
        with self.sessions() as session:
            user = session.get(User, 1)
            self.assertNotEqual(user.password_hash, self.account['password'])
            self.assertTrue(verify_password(self.account['password'], user.password_hash))
            tokens = session.query(UserSession).all()
            self.assertTrue(all(row.token_hash != self.client.cookies.get(COOKIE) for row in tokens))

    def test_logout_invalidates_replayed_cookie(self):
        token = self.client.cookies.get(COOKIE)
        self.assertEqual(self.client.post('/api/auth/logout').status_code, 200)
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        self.client.cookies.set(COOKIE, token, path='/api')
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        with self.sessions() as session:
            self.assertEqual(session.query(RevokedSession).count(), 1)

    def test_wrong_password_and_unknown_account(self):
        for email in [self.account['email'], 'desconocido@example.com']:
            response = self.client.post('/api/auth/login', json={'email': email, 'password': 'Incorrecta'} )
            self.assertEqual(response.status_code, 401)
            self.assertEqual(response.json()['detail'], 'Correo o contraseña incorrectos.')

    def test_duplicate_email_and_weak_password(self):
        self.assertEqual(self.client.post('/api/auth/register', json={
            **self.account, 'email': 'PRUEBA@EXAMPLE.COM',
        }).status_code, 409)
        self.assertEqual(self.client.post('/api/auth/register', json={
            **self.account, 'password': '123',
        }).status_code, 422)

    def test_expired_and_tampered_session(self):
        with self.sessions() as session:
            saved = session.query(UserSession).first()
            saved.expires_at = now() - timedelta(seconds=1)
            session.commit()
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)
        self.client.cookies.clear()
        self.client.cookies.set(COOKIE, 'inventado', path='/api')
        self.assertEqual(self.client.get('/api/auth/me').status_code, 401)

    def test_untrusted_origin_rejected(self):
        response = self.client.post('/api/solve', json=EXAMPLE, headers={'Origin': 'https://otro.example'})
        self.assertEqual(response.status_code, 403)
        response = self.client.post('/api/auth/logout', headers={'Origin': 'https://otro.example'})
        self.assertEqual(response.status_code, 403)

    def test_login_rate_limit(self):
        AUTH_ATTEMPTS.clear()
        for _ in range(10):
            response = self.client.post('/api/auth/login', json={'email': self.account['email'], 'password': 'mal'})
            self.assertEqual(response.status_code, 401)
        self.assertEqual(self.client.post('/api/auth/login', json={
            'email': self.account['email'], 'password': 'mal',
        }).status_code, 429)
