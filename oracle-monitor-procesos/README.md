# Monitor local de procesos Oracle XE 21c

Este prototipo implementa la guía de monitoreo de procesos:
- Identificación de procesos importantes: DBWn, LGWR, SMON, PMON y CKPT.
- Métricas automáticas.
- Línea base e historial local.
- Umbrales Normal / Advertencia / Alto / Crítico.
- Alertas.
- Dashboard.
- Exportación CSV.

## 1. Requisitos

- Oracle Database XE 21c instalado.
- Node.js 18 o superior recomendado.
- Usuario de monitoreo con permisos de lectura sobre las vistas V$.

## 2. Crear el usuario de monitoreo

Abra SQL Developer o SQLcl como SYS o SYSTEM en el PDB `XEPDB1`.

Ejecute:

```sql
@setup_monitor_user.sql
```

Si no utiliza `XEPDB1`, cambie el servicio en `.env`.

## 3. Configuración

Copie:

```text
.env.example
```

a:

```text
.env
```

Edite:

```env
ORACLE_USER=MONITOR_USER
ORACLE_PASSWORD=...
ORACLE_CONNECT_STRING=localhost:1521/XEPDB1
```

## 4. Instalar y ejecutar

```bash
npm install
npm start
```

Abra:

```text
http://localhost:3000
```

## 5. Qué mide

### Procesos
- Procesos actuales.
- Máximo observado.
- Límite de procesos.
- Porcentaje de utilización.

### Sesiones
- Sesiones actuales.
- Activas.
- Inactivas.
- Bloqueadas.

### Rendimiento
- Operaciones prolongadas.
- Cadenas de espera.

### Procesos importantes
- DBWn
- LGWR
- SMON
- PMON
- CKPT

## 6. Indicador IP

Se calcula como:

IP = procesos actuales / límite de procesos * 100

Clasificación configurable:

- 0–69 Normal
- 70–84 Advertencia
- 85–94 Alto
- 95–100 Crítico

Las sesiones bloqueadas elevan el estado a Crítico independientemente del porcentaje.

## 7. Historial

Cada medición se guarda en:

```text
data/history.json
```

El archivo pertenece únicamente al monitor y puede eliminarse desde la interfaz.

## 8. Arquitectura

Oracle XE -> node-oracledb -> API Express -> Dashboard HTML/CSS/JS -> Historial JSON
