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


