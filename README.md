# SimplexLab: PHP + FastAPI + MySQL

Aplicación web académica para resolver problemas de programación lineal de maximización y minimización mediante el método simplex de dos fases. Incluye frontend PHP, API en Python con FastAPI, base de datos MySQL, registro e inicio de sesión, historial compartido, tablas por iteración y exportación a CSV.

Parte del diseño de `PRESENTACION.html` y también incluye una versión HTML/CSS/JavaScript independiente para demostraciones sin servidor.

## Instalación local en Windows

Esta guía permite ejecutar el proyecto completo en tu computadora: PHP sirve la interfaz en el puerto **8080**, FastAPI resuelve los modelos en el puerto **8000** y MySQL guarda las cuentas, sesiones y problemas. Mantén MySQL iniciado y las dos terminales abiertas mientras uses la aplicación.

### 1. Instalar los requisitos

| Herramienta | Versión requerida | Uso |
| --- | --- | --- |
| Git | Disponible en la terminal | Descargar el proyecto |
| Python | 3.11 o posterior | Ejecutar FastAPI y el método simplex |
| PHP | 8.2 o posterior | Servir la interfaz web |
| MySQL | 8.0 o posterior | Almacenar cuentas, sesiones e historial |
| MySQL Workbench | Opcional | Ejecutar el script SQL con una interfaz gráfica |

Git, Python y PHP deben estar disponibles en el PATH. Compruébalo en PowerShell:

```powershell
git --version
python --version
php --version
```

Puedes usar Apache/XAMPP para PHP, seleccionando `frontend/public` como raíz del sitio; los pasos siguientes utilizan el servidor integrado de PHP. Node.js no es necesario para ejecutar la aplicación; sólo se usa en las pruebas opcionales del navegador.

### 2. Descargar el proyecto

```powershell
git clone https://github.com/alvizures1024-arch/Proyecto-Simplex.git
cd Proyecto-Simplex
```

También puedes descargar **Code → Download ZIP** desde GitHub, extraerlo y abrir una terminal dentro de la carpeta que contiene este README.

### 3. Crear la base de datos

Inicia el servicio MySQL. En MySQL Workbench, conéctate con tu cuenta administradora, abre `database/schema.sql` y ejecuta el script completo. Se crean la base **simplexlab** y las tablas `problemas`, `usuarios`, `sesiones` y `sesiones_revocadas`.

Después ejecuta este SQL con la misma cuenta administradora, reemplazando la contraseña de ejemplo por una propia:

```sql
CREATE USER IF NOT EXISTS 'simplex'@'localhost'
IDENTIFIED BY 'change_this_local_password';
GRANT SELECT, INSERT, CREATE, INDEX ON simplexlab.* TO 'simplex'@'localhost';
```

Si el usuario `simplex` ya existe, utiliza su contraseña actual al configurar el backend; `CREATE USER IF NOT EXISTS` no cambia su contraseña. Si tu servidor requiere una cuenta específica para conexiones TCP, configura también el usuario y permisos para `'simplex'@'127.0.0.1'`.

El script SQL incluido contiene la estructura de las tablas; no incluye las cuentas, sesiones ni datos de ninguna instalación anterior. En una instalación nueva no debes ejecutar las migraciones de nombres antiguos.

### 4. Preparar Python y configurar MySQL

Desde la raíz del proyecto:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
Copy-Item backend/.env.example backend/.env
```

Si `.venv` ya existe, omite su creación y utiliza su intérprete. Abre `backend/.env` y configura la conexión con la misma contraseña asignada al usuario MySQL:

```dotenv
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=simplexlab
DB_USER=simplex
DB_PASSWORD=change_this_local_password
CORS_ORIGINS=http://localhost:8080,http://127.0.0.1:8080
COOKIE_SECURE=false
```

Sustituye `change_this_local_password` por tu contraseña real. El archivo `backend/.env` es local y está excluido de Git. No necesitas activar el entorno virtual ni modificar la política de ejecución de PowerShell.

### 5. Iniciar el backend — terminal 1

Desde la raíz del proyecto ejecuta:

```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --app-dir backend --reload --host 127.0.0.1 --port 8000
```

Déjalo ejecutándose. Puedes abrir la documentación en <http://localhost:8000/docs>.

### 6. Iniciar el frontend — terminal 2

Abre otra terminal en la raíz del proyecto:

```powershell
$env:API_URL = 'http://localhost:8000'
php -S localhost:8080 -t frontend/public
```

Déjala abierta y entra a **<http://localhost:8080>**. No abras `index.php` directamente como archivo.

### 7. Crear una cuenta y comprobar la instalación

1. Pulsa **Crear cuenta** y registra tu nombre, correo y una contraseña de al menos 10 caracteres.
2. Al ingresar, comprueba que aparezca **API y MySQL disponibles**.
3. Pulsa **Cargar ejemplo**. El resultado esperado es **x1 = 2, x2 = 6 y Z = 36**.
4. Confirma que el problema se guardó y vuelve a abrirlo desde el historial.
5. Prueba **Exportar CSV** para descargar el modelo y sus resultados.

Las cuentas de acceso a SimplexLab se crean desde la interfaz y son distintas del usuario MySQL `simplex`. El repositorio no proporciona una cuenta de acceso predeterminada.

Para comprobar la conexión desde PowerShell:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

Debe devolver `status: ok` y `database: mysql`. Para detener los servidores, pulsa **Ctrl+C** en cada terminal. En ejecuciones posteriores basta con iniciar MySQL y repetir los pasos 5 y 6; no necesitas volver a crear la base ni instalar dependencias.

### Solución de problemas de instalación

| Problema | Qué revisar |
| --- | --- |
| Python, PHP o Git no se reconoce | Instala la herramienta y agrégala al PATH; abre una terminal nueva. |
| No se puede conectar con FastAPI | Deja ejecutándose la terminal 1 y comprueba el puerto 8000. |
| API disponible, MySQL pendiente | Inicia MySQL y revisa las credenciales de `backend/.env`. |
| `Unknown database 'simplexlab'` | Ejecuta `database/schema.sql` con tu cuenta administradora. |
| `Access denied` en MySQL | Comprueba usuario, contraseña y permisos en el paso 3. |
| El puerto ya está en uso | Comprueba si ya existe otra instancia del servidor y utiliza esa instancia o ciérrala antes de iniciar otra. |
| Regresa al login después de ingresar | Usa `localhost` para frontend y backend; conserva `COOKIE_SECURE=false` en HTTP local. |

### Error al importar `ArgsKwargs` o `pydantic_core`

No reutilices un entorno virtual con una versión diferente de Python. Ejecutar `python -m venv .venv` sobre una carpeta existente puede conservar paquetes binarios de la versión anterior. Por ejemplo, un paquete `cp312` corresponde a Python 3.12 y no sirve para Python 3.14.

Si el entorno ya existe, omite el paso de creación y comprueba su intérprete con `.\.venv\Scripts\python.exe --version`. Si cambiaste de versión de Python, detén FastAPI con Ctrl+C y reinstala las dependencias con el intérprete actual:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade --force-reinstall --no-cache-dir -r backend/requirements-dev.txt scipy
.\.venv\Scripts\python.exe -m pip check
```

Este comando también reinstala las dependencias opcionales de pruebas que se incluyeron durante la verificación del proyecto.

`API_URL` es una variable de entorno de PHP y una dirección accesible **desde el navegador**. Si cambias el origen o el puerto del frontend, agrégalo a `CORS_ORIGINS` en `backend/.env` y reinicia FastAPI. El archivo `.env` de la raíz lo utiliza Docker Compose; el de `backend/` se utiliza al ejecutar Python localmente. No contienen las mismas variables.

## Ingresar y reportar problemas

Abre la aplicación PHP y pulsa **Crear cuenta**. Registra tu nombre, correo y una contraseña de al menos 10 caracteres; no hay credenciales predeterminadas. Después podrás ingresar con tu correo y contraseña y usar **Cerrar sesión**. El correo sirve como nombre de acceso; el registro no envía mensajes de verificación. El historial sigue siendo compartido entre usuarios registrados, como indica la interfaz.

Las contraseñas se guardan como hashes scrypt con sal aleatoria. La sesión dura 12 horas y usa una cookie HttpOnly; MySQL almacena sólo el hash del token. Al cerrar sesión, el token queda revocado en el servidor. El backend exige una sesión válida para calcular y consultar problemas. Hay un límite de 10 intentos de registro o login por IP en diez minutos y por proceso. El registro es abierto para esta aplicación académica; no se incluye recuperación de contraseñas. MySQL debe estar disponible para ingresar.

Se crean automáticamente las tablas `usuarios`, `sesiones` y `sesiones_revocadas` al iniciar FastAPI, sin alterar los problemas existentes. El SQL también está en `database/migrations/003_acceso_usuarios.sql`. Se usan inserciones para registrar y revocar sesiones; no hacen falta permisos UPDATE o DELETE. Las sesiones vencidas y revocaciones se conservan para mantenimiento posterior.

En el pie de página se muestra **7ª calle 25-55, Boulevard El Naranjo, zona 4 de Mixco. Telefono de Contacto : 24567890.** Al ingresar aparece el botón **Reportar un problema**. Escribe el asunto y la descripción y pulsa **Continuar en mi correo**. Se prepara un mensaje para `alvizures1024@gmail.com` con el nombre y correo de tu cuenta. Debes revisar el mensaje y pulsar **Enviar** en tu aplicación de correo. El navegador necesita un cliente de correo configurado; la aplicación no afirma que el mensaje se haya enviado ni usa SMTP.

Usa el mismo nombre de host para PHP y FastAPI (`localhost` en ambos o `127.0.0.1` en ambos). El frontend ajusta esos dos nombres locales automáticamente. Al publicar mediante HTTPS, configura `COOKIE_SECURE=true` y mantén frontend y API en el mismo sitio (por ejemplo, mediante un proxy). Referencias: [cookies en FastAPI](https://fastapi.tiangolo.com/advanced/response-cookies/) y [CORS con credenciales](https://fastapi.tiangolo.com/tutorial/cors/).

La carpeta `version-html/` sigue siendo la demostración independiente sin servidor ni login; su pie de página incluye el contacto y un enlace de correo. El acceso autenticado corresponde a la aplicación PHP con FastAPI.

## Archivos y responsabilidades

```text
version-html/                 Versión independiente, sin servidor ni MySQL
  index.html                  Estructura HTML
  css/styles.css              Estilos originales separados
  js/app.js                   Formulario, motor simplex original y resultados
frontend/
  public/index.php            Entrada PHP y configuración de la URL de FastAPI
  public/assets/css/styles.css
  public/assets/js/app.js      Formulario y presentación de tablas
  public/assets/js/api.js      Peticiones HTTP e historial
  views/page.html             Vista HTML servida por PHP
backend/
  app/main.py                 Rutas FastAPI, almacenamiento y recuperación
  app/schemas.py              Validación del modelo con Pydantic
  app/simplex.py              Motor simplex en Python
  app/database.py             Conexión MySQL y modelo SQLAlchemy
  tests/                     Pruebas matemáticas y HTTP
database/schema.sql           Base de datos y tabla de problemas
database/migrations/          Migración del esquema anterior sin borrar registros
compose.yaml                  PHP, FastAPI y MySQL con almacenamiento persistente
```

La versión independiente se abre directamente con `version-html/index.html`; calcula en JavaScript y no guarda historial. La aplicación completa se abre mediante PHP: el navegador consulta FastAPI, Python calcula la solución y guarda el modelo y las tablas en MySQL. PHP no necesita conectarse directamente a la base de datos.

## Exportar a CSV

Después de resolver un problema o abrirlo desde el historial, pulsa **Exportar CSV** al final de los resultados. El archivo incluye el tipo de optimización, la función objetivo, las restricciones, el estado, la solución y todas las tablas simplex calculadas. También permite exportar los diagnósticos de inviabilidad o no acotación. La descarga usa UTF-8 con BOM, encabezados en español y números sin redondear para conservar precisión y tildes en Excel. Si modificas el formulario, el archivo sigue correspondiendo al resultado mostrado hasta que vuelvas a resolver. El botón también está disponible en la versión HTML independiente.

## Alternativa: ejecutar localmente con Docker

Requisitos: Docker Desktop iniciado, con contenedores Linux y Docker Compose.

Desde la raíz del proyecto, en PowerShell:

```powershell
Copy-Item .env.example .env
# Edita .env y cambia las dos contraseñas de ejemplo.
docker compose up --build -d
```

- Aplicación PHP: <http://localhost:8080>
- Documentación interactiva de FastAPI: <http://localhost:8000/docs>
- Estado de API y MySQL: <http://localhost:8000/api/health>

`MYSQL_DATABASE` debe mantenerse como `simplexlab` al usar el script SQL incluido. Docker crea el usuario de aplicación y ejecuta `database/schema.sql` al inicializar un volumen vacío. MySQL no publica su puerto en el equipo anfitrión; los servicios se comunican por la red interna de Docker.

```powershell
docker compose logs backend
docker compose down
```

`down` conserva los datos del volumen. Cambiar las contraseñas de `.env` después de inicializar MySQL no cambia las credenciales de los usuarios ya creados: actualízalas dentro de MySQL también.

## API

| Método | Ruta | Función |
| --- | --- | --- |
| POST | `/api/auth/register` | Registra nombre, correo y contraseña y abre sesión |
| POST | `/api/auth/login` | Inicia sesión con correo y contraseña |
| GET | `/api/auth/me` | Devuelve el usuario de la sesión actual |
| POST | `/api/auth/logout` | Revoca la sesión y elimina la cookie |
| GET | `/api/health` | Comprueba acceso a MySQL; responde 503 si falla |
| POST | `/api/solve` | Valida, resuelve y guarda un problema |
| GET | `/api/problems?limit=20&offset=0` | Lista el historial, del más reciente al más antiguo |
| GET | `/api/problems/{id}` | Recupera modelo y resultado completos |

Ejemplo del cuerpo JSON para `POST /api/solve`:

```json
{
  "obj": [3, 5],
  "max": true,
  "cons": [
    {"a": [1, 0], "op": "<=", "b": 4},
    {"a": [0, 2], "op": "<=", "b": 12},
    {"a": [3, 2], "op": "<=", "b": 18}
  ]
}
```

Para minimizar usa `"max": false`. Los estados son `optimal`, `infeasible`, `unbounded` y `limit`. La respuesta contiene `logs` con las tablas, `count` con el número de pivotes y, si existe solución óptima, `sol` y `z`. El campo `saved` indica si se almacenó; cuando es verdadero también se devuelve el identificador `id`.

El historial usa JSON de MySQL para guardar coeficientes, restricciones, resultados e iteraciones sin perder dimensiones. Las fechas se almacenan en UTC y se muestran con la zona horaria del navegador. MySQL debe estar disponible para iniciar y verificar sesiones. Si falla el almacenamiento después de verificar la sesión y calcular, `saved` es falso y aparece un aviso explícito; las consultas que no puedan completarse devuelven 503.

### Nombres en español en MySQL

La tabla se llama `problemas` y sus columnas son:

| Nombre anterior | Nombre actual |
| --- | --- |
| `id` | `id` |
| `mode` | `modo` |
| `status` | `estado` |
| `problem` | `problema` |
| `result` | `resultado` |
| `created_at` | `fecha_creacion` |

Para una instalación nueva, `database/schema.sql` ya utiliza esos nombres. Si tienes una base con la tabla anterior `problems`, detén FastAPI y ejecuta desde la raíz:

```powershell
Push-Location backend
..\.venv\Scripts\python.exe -m app.migrate_database
Pop-Location
```

Después reinicia FastAPI. La migración crea una copia JSON en `database/backups/`, renombra la tabla y sus columnas con un único `ALTER TABLE`, y comprueba que todos los registros se conservaron. Si la migración ya se aplicó, no modifica datos. Requiere permisos `ALTER`, `DROP`, `CREATE` e `INSERT` para renombrar la tabla, además de `SELECT` para verificar los registros. También se incluye el SQL en `database/migrations/001_nombres_en_espanol.sql` para ejecución manual, una sola vez, seleccionando previamente la base correcta en MySQL.

Si MySQL devuelve el error 1142 de permisos, una cuenta administradora debe ejecutar `database/migrations/001_permisos_administrador.sql` antes de reintentar. El usuario de aplicación descrito en la instalación ya tiene `SELECT`, `INSERT` y `CREATE`; ese archivo añade `ALTER` y `DROP` únicamente sobre la tabla antigua que debe renombrarse.

Los nombres de las rutas y campos JSON de la API se conservan para mantener funcionando el frontend. Los nombres físicos de la tabla y de todas sus columnas están en español.

La clave primaria se llama `id`. Si tu tabla aún tiene la columna `identificador`, el mismo comando de migración aplica `database/migrations/002_identificador_a_id.sql`, conserva sus valores y verifica todos los registros. Esa operación requiere permiso `ALTER` sobre `simplexlab.problemas`; una cuenta administradora puede concederlo ejecutando `database/migrations/002_permisos_administrador.sql`. Los permisos sobre el nombre anterior `problems` no se transfieren automáticamente al nuevo nombre.

## Pruebas

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend/requirements-dev.txt
Push-Location backend
..\.venv\Scripts\python.exe -m unittest discover -s tests -v
Pop-Location
```

La comparación independiente con 80 modelos necesita `pip install scipy`; si no está instalado, sólo esa prueba se omite. Las pruebas HTTP usan SQLite **únicamente como base aislada de pruebas**. No certifican una conexión real a MySQL: para comprobarla, ejecuta el proyecto y verifica `/api/health`, resuelve un modelo y ábrelo desde el historial.

Se prueban el ejemplo original, minimización, igualdad, términos independientes negativos, restricciones redundantes, degeneración, incompatibilidad, no acotación, validaciones, almacenamiento/recuperación HTTP y errores de conexión.

También se incluye `scripts/verify_frontend.cjs` para comprobar la interfaz con Playwright y Microsoft Edge en modo sin ventana. Requiere `npm install --no-save playwright` y PHP en el PATH. Desde la raíz ejecuta `node scripts/verify_frontend.cjs`. Usa temporalmente los puertos 18000 y 18080 y cierra sus procesos al terminar. Requiere MySQL y comprueba la versión HTML, registro/login, PHP con FastAPI y MySQL reales, minimización, recuperación de historial con respuestas simuladas y el diseño móvil. Las capturas en `artifacts/` provienen de estas pruebas y pueden mostrar datos simulados del historial. `node scripts/verify_access.cjs` verifica además registro, login, cierre de sesión, acceso protegido y el formulario de reporte; intercepta el enlace mailto para evitar abrir una aplicación externa. `node scripts/verify_csv.cjs` comprueba la descarga autenticada. Estas pruebas crean cuentas con nombre Verificación de interfaz y claves aleatorias; puedes indicar TEST_EMAIL y TEST_PASSWORD en el entorno para reutilizar una cuenta de pruebas. La prueba completa del frontend también guarda modelos de demostración.

## Alcance

- De 2 a 6 variables no negativas y de 1 a 30 restricciones `<=`, `>=` o `=`.
- Coeficientes finitos entre -1e9 y 1e9; máximo de 200 pivotes.
- Algoritmo educativo con aritmética de punto flotante, tolerancia de 1e-8 y comprobación final de factibilidad. Evita mezclar escalas muy diferentes o valores cercanos a la tolerancia; no utiliza aritmética exacta.
- El motor Python registra también los pivotes de retiro de artificiales y cuenta pivotes reales. Las tablas iniciales de cada fase no incrementan el contador.
- Aplicación académica local, con registro e inicio de sesión y un historial compartido entre usuarios registrados. La configuración Docker sólo publica PHP y FastAPI en la interfaz local.

Referencias de implementación: [FastAPI y bases de datos SQL](https://fastapi.tiangolo.com/tutorial/sql-databases/) y [CORS en FastAPI](https://fastapi.tiangolo.com/tutorial/cors/).
