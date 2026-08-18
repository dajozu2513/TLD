# TLD Backend — Integración de base de datos (Parte 2)

Este proyecto conecta el cuestionario ISO/IEC 27002 de **Three Little Ducks**
a una base de datos **PostgreSQL real**, corriendo en local con Docker.
Antes, todo el cálculo y el "guardado" vivían solo en el navegador
(`js/iso-cuestionario.js`); ahora los controles, las respuestas y los
resultados se persisten en la base de datos, siguiendo el modelo E-R y el
diccionario de datos de la Parte 1 (migrado de Oracle a PostgreSQL).

## 0. Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) instalado y corriendo.
- [Node.js 18+](https://nodejs.org/) instalado (`node -v` para comprobar).

## 1. Levantar PostgreSQL local

```bash
cd tld-backend
docker compose up -d
```

Esto hace tres cosas automáticamente:
1. Descarga y levanta un contenedor de **PostgreSQL 16** en el puerto `5432`.
2. La primera vez que se crea el volumen, ejecuta `db/01_schema.sql`
   (crea las 15 tablas de la Parte 1 traducidas a PostgreSQL) y luego
   `db/02_seed.sql` (carga los roles, dimensiones C/I/D, y los 15 controles
   ISO con sus 3 preguntas cada uno — los mismos que hoy están hardcodeados
   en el frontend).
3. Levanta **pgAdmin** en `http://localhost:5050` (usuario `admin@tld.com`,
   contraseña `admin`) para que puedan ver las tablas sin escribir SQL, si
   quieren revisar visualmente que todo cargó bien.

Para comprobar que quedó arriba:

```bash
docker compose ps
docker exec -it tld_postgres psql -U tld_user -d tld_db -c "SELECT codigo_control, nombre_control FROM CONTROL;"
```

Deberían ver las 15 filas de controles.

> Si alguna vez necesitan reiniciar desde cero (por ejemplo si cambian el
> schema), hay que borrar el volumen: `docker compose down -v` y luego
> `docker compose up -d` de nuevo. Los scripts de `db/` **solo** se ejecutan
> la primera vez que el volumen se crea.

## 2. Levantar el backend (API)

```bash
cd tld-backend
cp .env.example .env
npm install
npm run dev
```

Deberían ver en consola: `TLD backend escuchando en http://localhost:3000`.

Prueben en el navegador o con curl:

```bash
curl http://localhost:3000/api/health
curl http://localhost:3000/api/controles
```

El primero confirma que la API está conectada a Postgres. El segundo debería
devolver el catálogo completo de dominios/controles/preguntas en JSON — es
el mismo contenido que hoy está hardcodeado en `CONTROLES` dentro de
`js/iso-cuestionario.js`.

## 3. Endpoints disponibles

| Método | Ruta | Para qué sirve |
|---|---|---|
| GET | `/api/health` | Verifica conexión a la base de datos |
| GET | `/api/controles` | Catálogo de dominios, controles y preguntas |
| POST | `/api/organizaciones` | Crea la organización auditada `{ nombre, sector, ubicacion }` |
| POST | `/api/auditorias` | Crea una auditoría `{ id_organizacion, area_evaluada, fecha_auditoria }` |
| PUT | `/api/auditorias/:id/respuestas` | Guarda/actualiza respuestas (array) — permite "guardar y continuar después" |
| POST | `/api/auditorias/:id/calcular` | Calcula madurez, cumplimiento y exposición, y **persiste** el resultado |
| GET | `/api/auditorias/:id/reporte` | Recupera un reporte ya calculado |

La fórmula de cálculo (`src/services/calculoRiesgo.js`) es exactamente la
misma que ya tenían en el frontend — solo se movió al servidor para que el
resultado se pueda guardar en `RESULTADO_CONTROL`, `RESULTADO_DOMINIO` y
`RESULTADO_AUDITORIA`.

## 4. Qué cambia en el frontend (`js/iso-cuestionario.js`)

Esto es lo que falta para completar la migración — se los dejo explicado
para que lo hagamos juntos en la próxima sesión, con calma:

1. **Al cargar la página**: en vez de usar el arreglo `CONTROLES` fijo,
   hacer `fetch("http://localhost:3000/api/controles")` y construir el DOM
   con esa respuesta (la estructura es casi idéntica, solo cambian los
   nombres de campo: `id_control` en vez de `id`, etc.).
2. **Antes de mostrar el cuestionario**: crear la organización y la
   auditoría con `POST /api/organizaciones` y `POST /api/auditorias`
   usando los datos del formulario "Datos de la auditoría", y guardar el
   `id_auditoria` que devuelve.
3. **Cada vez que cambia una respuesta**: en lugar de solo recalcular en
   memoria, mandar `PUT /api/auditorias/:id/respuestas` (puede ser con un
   pequeño *debounce* de 1-2 segundos para no saturar la API en cada click).
4. **Al presionar "Generar reporte ejecutivo"**: llamar a
   `POST /api/auditorias/:id/calcular` y pintar el reporte con lo que
   devuelve la API, en vez de calcularlo todo en el navegador.
5. El botón **"Descargar en Excel"** puede seguir funcionando igual que
   ahora (con la librería `xlsx` en el navegador), solo que ahora lee los
   datos ya calculados que vinieron de la API.

No hace falta reescribir toda la lógica de un jueves a otro — se puede ir
control por control. Lo importante para esta entrega es que el **cálculo y
el guardado ya viven en la base de datos**, que es lo que pide el profesor.

## 5. Próximo paso: el Monitor de Salud (Parte 2)

Con esta base de datos ya funcionando, el siguiente bloque de trabajo es el
monitor. Puntos clave que ya adelantamos para la próxima sesión:

- El monitor va a necesitar **su propia base de datos** (o su propio
  esquema) para guardar el historial de mediciones — separado de la base
  de datos que está siendo *monitoreada* — tal como lo planteaba el diseño
  original en Oracle (`MONITOR_INDICES`, `MONITOR_ALERTAS`, etc.).
- El **"database link"** que mencionó el profesor es el mecanismo para que
  la base del monitor pueda leer datos de la base monitoreada (o viceversa)
  sin tener que copiar todo manualmente. En PostgreSQL el equivalente es la
  extensión **`postgres_fdw`** (o `dblink`), que permite declarar un
  "servidor foráneo" y consultar tablas de otra base de datos como si
  fueran locales.
- Las vistas `V$SESSION`, `V$PROCESS`, `V$PGASTAT`, `V$DATAFILE` de Oracle
  que usa el documento del monitor tienen equivalentes directos en
  PostgreSQL: `pg_stat_activity` (sesiones/procesos), `pg_stat_database`
  (memoria/cache), `pg_database_size()` / `pg_tablespace_size()` (espacio
  de archivos/tablespaces), `pg_stat_bgwriter` (actividad de escritura).

Cuando quieran, seguimos con ese diseño (adaptar los índices IP, IM, IA del
documento del monitor a las vistas de PostgreSQL) y lo integramos a este
mismo backend.
