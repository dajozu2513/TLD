# TLD Backend — Integración de base de datos (Parte 2)

Este proyecto conecta el cuestionario ISO/IEC 27002 de **Three Little Ducks**
a una base de datos **Oracle real**, usando tu instalación local (XE u otra
edición) — el diseño original de la Parte 1.
Antes, todo el cálculo y el "guardado" vivían solo en el navegador
(`js/iso-cuestionario.js`); ahora los controles, las respuestas y los
resultados se persisten en la base de datos, siguiendo el modelo E-R y el
diccionario de datos de la Parte 1.

## 0. Requisitos

- Una instancia de **Oracle Database** corriendo localmente (XE, Standard,
  etc.) con un usuario/contraseña que puedas usar.
- [Node.js 18+](https://nodejs.org/) instalado (`node -v` para comprobar).

> No necesitas instalar Oracle Instant Client: el driver `oracledb` (v6+)
> usa por defecto el modo **Thin**, que se conecta directo por red al
> listener de Oracle sin librerías nativas adicionales.

## 1. Crear el usuario/esquema en Oracle

Conéctate a tu Oracle local como un usuario con privilegios (`SYSTEM` o
`SYS AS SYSDBA`, según tu instalación) y crea el esquema donde vivirán las
tablas del proyecto:

```sql
-- Si tu Oracle usa pluggable databases (XE 18c/21c en adelante),
-- primero conéctate al PDB correcto, por ejemplo:
-- ALTER SESSION SET CONTAINER = XEPDB1;

CREATE USER tld_user IDENTIFIED BY tld_pass;
GRANT CONNECT, RESOURCE, CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, UNLIMITED TABLESPACE
  TO tld_user;

-- Necesario para el Monitor de Salud (GET /api/monitor/salud): permite
-- leer las vistas dinámicas V$... y los catálogos DBA_*, que un esquema
-- de aplicación normal no puede ver por defecto.
GRANT SELECT_CATALOG_ROLE TO tld_user;
```

(Ajusta el nombre de usuario/contraseña si quieres otros; solo asegúrate de
que coincidan luego con tu `.env`.)

## 2. Crear las tablas y cargar los datos semilla

Conéctate **como `tld_user`** (por ejemplo con SQL*Plus, SQLcl o SQL
Developer) y ejecuta, en este orden:

```bash
cd tld-backend/db
sqlplus tld_user/tld_pass@localhost:1521/XEPDB1 @01_schema.sql
sqlplus tld_user/tld_pass@localhost:1521/XEPDB1 @02_seed.sql
```

(Cambia `localhost:1521/XEPDB1` por el connect string real de tu instancia;
si usas SID en vez de servicio, el formato es `host:puerto:SID`.)

Esto crea las 15 tablas del modelo y carga los dominios, los 15 controles
ISO con sus 3 preguntas cada uno, y las dimensiones C/I/D — los mismos que
hoy están hardcodeados en el frontend.

Para comprobar que quedó bien:

```sql
SELECT codigo_control, nombre_control FROM CONTROL;
```

Deberían verse las 15 filas de controles.

> Si necesitas reiniciar desde cero, simplemente vuelve a crear el usuario
> (`DROP USER tld_user CASCADE;` y repite el paso 1) y corre de nuevo los
> scripts de `db/`.

## 3. Levantar el backend (API)

```bash
cd tld-backend
cp .env.example .env
```

Edita `.env` con los datos de tu Oracle local (usuario, contraseña y
connect string):

```
ORACLE_USER=tld_user
ORACLE_PASSWORD=tld_pass
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
```

Luego:

```bash
npm install
npm run dev
```

Deberían ver en consola: `TLD backend escuchando en http://localhost:3000`.

Prueben en el navegador o con curl:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/controles
```

El primero confirma que la API está conectada a Oracle. El segundo debería
devolver el catálogo completo de dominios/controles/preguntas en JSON — es
el mismo contenido que hoy está hardcodeado en `CONTROLES` dentro de
`js/iso-cuestionario.js`.

## 4. Servir el frontend

Desde la raíz del repo (no desde `tld-backend/`):

```bash
python -m http.server 5500
```

Y abre `http://localhost:5500`. El frontend estático sigue siendo
independiente del backend; solo la parte del cuestionario ISO consumirá
la API cuando esté conectada.

## 5. Endpoints disponibles

| Método | Ruta | Para qué sirve |
|---|---|---|
| GET | `/api/health` | Verifica conexión a la base de datos |
| GET | `/api/controles` | Catálogo de dominios, controles y preguntas |
| POST | `/api/organizaciones` | Crea la organización auditada `{ nombre, sector, ubicacion }` |
| POST | `/api/auditorias` | Crea una auditoría `{ id_organizacion, area_evaluada, fecha_auditoria }` |
| PUT | `/api/auditorias/:id/respuestas` | Guarda/actualiza respuestas (array) — permite "guardar y continuar después" |
| POST | `/api/auditorias/:id/calcular` | Calcula madurez, cumplimiento y exposición, y **persiste** el resultado |
| GET | `/api/auditorias/:id/reporte` | Recupera un reporte ya calculado |
| GET | `/api/monitor/salud` | Métricas en vivo de la instancia Oracle (procesos, memoria, archivos) para el Monitor de Salud |

### Monitor de salud

`monitor.html` (menú "Monitor de Salud Oracle") ya no simula datos con
`Math.random()`: en cada actualización llama a `GET /api/monitor/salud`,
que lee en el momento las vistas dinámicas de la instancia Oracle
conectada —

- `V$INSTANCE`, `V$RESOURCE_LIMIT` → identidad de la instancia y límites
  de `processes`/`sessions`.
- `V$SESSION`, `V$SESSION_LONGOPS` → sesiones activas/inactivas/bloqueadas
  y operaciones largas en curso.
- `V$SGA`, `V$SGAINFO`, `V$SGASTAT`, `V$BUFFER_POOL_STATISTICS`,
  `V$PGASTAT` → uso de memoria SGA/PGA.
- `V$DATAFILE`, `V$DATAFILE_HEADER`, `DBA_DATA_FILES` + `DBA_FREE_SPACE`,
  `DBA_TEMP_FREE_SPACE`, `V$LOG`, `V$BGPROCESS` → estado de archivos,
  tablespaces y procesos de fondo.

El cálculo de los índices IP/IM/IA/ISBD y de las alertas sigue viviendo
en el frontend (`js/monitor-salud.js`), con las mismas fórmulas de la
Parte 1 — solo cambió de dónde salen los números.

Si `/api/monitor/salud` responde 500 con un mensaje sobre `ORA-00942` o
`ORA-01031`, falta el grant `SELECT_CATALOG_ROLE` del paso 1 (ejecutar
como `SYSTEM`/`SYSDBA`, no como `tld_user`). Dos formas de aplicarlo:

- Con sqlplus/SQL Developer: `db/03_grant_monitor.sql`.
- Sin sqlplus a mano: `node db/grant-monitor.js` (usa el mismo driver
  `oracledb` ya instalado, te pide la contraseña de SYSTEM de forma
  interactiva y no necesita Instant Client).

Si el backend no está corriendo (o Oracle no responde), la página
muestra un aviso de "sin conexión" en vez de datos inventados.

## Notas de la migración a Oracle

Comparado con la versión que corría sobre PostgreSQL con Docker, cambiaron
tres cosas internamente (el comportamiento de la API es el mismo):

- **Driver**: `pg` → `oracledb` (modo Thin, sin Instant Client).
- **Upserts**: Postgres resolvía "guardar o actualizar" con
  `INSERT ... ON CONFLICT ... DO UPDATE`; Oracle no tiene esa sintaxis, así
  que se usa `MERGE` en su lugar (mismo resultado).
- **Devolver la fila recién creada**: Postgres permite
  `INSERT ... RETURNING *`; Oracle solo permite
  `RETURNING columna INTO :bind`, así que se pide el id generado y se hace
  un `SELECT` de la fila completa con ese id.
