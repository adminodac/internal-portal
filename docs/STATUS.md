# ODAC Internal Portal — Estado y Coordinación
> Fuente única de verdad del proyecto. Reemplaza a `docs/roadmap.html`.
> Última actualización: 2026-07-05 por Claude Code (auditoría de schema + refinamiento del arquitecto)

---

## 0. INSTRUCCIONES PARA CADA IA

**Toda IA que trabaje en este proyecto debe, sin excepción:**
1. Leer este archivo COMPLETO antes de proponer o ejecutar cualquier cosa.
2. Tratar la sección 1 (LEYES) como inmutable. Si tu propuesta contradice una LEY, NO la ejecutes: anótala en la sección 5 como `PROPUESTA PENDIENTE` y detente.
3. Verificar el schema contra `supabase/sql/` (los archivos numerados son el historial de migraciones) antes de escribir código que toque datos. Este documento resume el contrato; los `.sql` son la evidencia.
4. Al terminar tu trabajo, agregar una entrada al inicio del LOG (sección 6) y commitear este archivo en el mismo push que tu código.
5. No inventar campos, tablas, textos ni reglas que no estén aquí. Si falta información, pregunta a Francisco; no rellenes con supuestos.

**Claude Code (dev principal — front y back):**
- Implementas contra el contrato de datos de la sección 1.1 con nombres EXACTOS.
- Modelo recomendado: Sonnet para implementar; pide a Francisco cambiar a Opus solo ante decisiones de arquitectura nuevas.
- Antes de implementar algo no trivial: muestra plan corto y espera OK.

**Perplexity (dev de respaldo cuando Francisco agota tokens):**
- Mismo contrato, mismas LEYES. Historial: introdujiste `applicant_name`, `amount_requested` y `reviewer_notes` sin autorización — ese tipo de error es exactamente lo que este archivo previene.
- Todo cambio de schema o de reglas de negocio se anota como `PROPUESTA PENDIENTE` (sección 5) y lo valida el PO antes de aplicarse.

**Claude.ai (PO / Arquitecto — espacio con contexto de negocio completo):**
- Único autorizado a modificar la sección 1 (LEYES), siempre validando contra Roberta, el Administration Manual y las transcripciones.
- Audita el output de los devs contra este archivo; mantiene secciones 2, 3 y 5 al día.

---

## 1. LEYES (solo el PO modifica esta sección)

### 1.1 Contrato de datos (nombres exactos — nadie agrega ni renombra columnas)

> Refleja el schema DESPLEGADO y verificado end-to-end el 4-jul
> (`supabase/sql/01_schema.sql` + `03_admin_fields.sql`). Los campos del
> flujo social aún NO existen en la DB: ver 1.1.b.

**Tabla `submissions` (desplegada):**
| Columna | Tipo | Regla |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| created_at | timestamptz NOT NULL | default now() |
| updated_at | timestamptz NOT NULL | default now(); trigger `submissions_set_updated_at` la actualiza sola |
| group_name | text NOT NULL | uno de los 18 grupos (dropdown del form) |
| submitter_email | text NOT NULL | contacto del grupo. OJO: NO se llama `email` |
| content_type | text NOT NULL | CHECK: `'event'` \| `'exhibition'` \| `'artwork'` \| `'announcement'` — MINÚSCULAS en DB; la UI muestra etiquetas capitalizadas vía `TYPE_LABELS` |
| title | text NOT NULL | |
| description | text NOT NULL | máx. 2000 caracteres (validación en form.js; la DB no lo restringe) |
| event_date | date | SOLO si content_type='event' (campo condicional en el form) |
| expire_date | date | la ingresa el ADMIN en el dashboard; nunca se calcula automáticamente |
| publish_to | text[] NOT NULL | canales que PIDE el grupo. Valores: 'website', 'facebook', 'instagram'. Default: los tres |
| posted_facebook | boolean NOT NULL | default false — el ADMIN lo marca al confirmar publicación en FB |
| posted_website | boolean NOT NULL | default false — ídem para website |
| posted_instagram | boolean NOT NULL | default false — ídem para IG |
| status | text NOT NULL | CHECK: `'received'` \| `'closed'`. El progreso por canal vive en los `posted_*`, NO en status |
| reviewer_notes | text | ⚠️ existe en la DB pero VIOLA R1. Pendiente migración de DROP (ver sección 5, P-1). PROHIBIDO leerla o escribirla desde cualquier código |

**Tabla `submission_files` (desplegada):**
| Columna | Tipo | Regla |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| submission_id | uuid NOT NULL FK | → submissions.id, ON DELETE CASCADE |
| storage_path | text NOT NULL | ruta en el bucket `submission-files`, formato `submissions/{submission_id}/{filename}` |
| original_name | text NOT NULL | nombre del archivo tal como lo subió el grupo |
| file_size_bytes | integer | tamaño en bytes |
| created_at | timestamptz NOT NULL | default now() |

Límites de archivos: 10MB por archivo, máx. 3 por submission, tipos JPG/PNG/PDF.
Hoy se validan SOLO en el cliente (form.js) — no hay enforcement en DB ni en bucket (gap conocido, ver sección 5, P-3).

### 1.1.b Campos aprobados por el PO, PENDIENTES de migración (`05_social_fields.sql` — aún no existe)

Estos campos NO están en la DB. Se agregan con una migración que Claude Code
escribe y Francisco ejecuta en el SQL Editor, como paso previo a la sección
social del dashboard:

| Columna | Tipo | Regla |
|---|---|---|
| facebook_text | text | flujo "asistir": texto sugerido editable |
| instagram_text | text | flujo "asistir": texto sugerido editable |
| facebook_image | text | URL imagen adaptada 1.91:1 |
| instagram_image | text | URL imagen adaptada 1:1 |
| published_at | timestamptz | lo registra el admin al confirmar publicación |

Hasta que esa migración corra y se anote en el LOG, ningún código puede leer ni escribir estos campos.

### 1.1.c RLS (desplegada en `02_rls.sql` + `04_admin_rls.sql`)
- `submissions`: INSERT para `anon` (form público); SELECT y UPDATE para `authenticated` (admins). Nadie tiene DELETE.
- `submission_files`: INSERT para `anon`. ⚠️ NO hay política SELECT para `authenticated` — el dashboard hoy no puede listar archivos adjuntos (gap conocido, ver sección 5, P-2).
- Storage bucket `submission-files`: INSERT para `anon`. ⚠️ Sin política de lectura para admins (mismo gap P-2).

### 1.2 Reglas de negocio (validadas con Roberta por escrito — no se discuten con los devs)
- **R1. Sin notas internas.** No existe `reviewer_notes` ni `notes` ni equivalente. Confirmado 26-jun.
- **R2. Una cuenta por grupo.** Una persona designada envía por grupo. Sin auto-registro; cuentas creadas por ODAC (Dashboard → Authentication → Add user).
- **R3. Asistir, no automatizar.** PROHIBIDA la publicación automática vía API de Meta. El sistema prepara texto+imagen y el admin copia/pega y publica. Razones: tokens que expiran, pérdida de control editorial (Roberta adapta contenido antes de publicar), riesgo reputacional.
- **R4. KPI 48h.** Es política oficial escrita (Manual, Sección 7). El dashboard lo muestra con semáforo: verde dentro de plazo, amarillo <12h restantes, rojo vencido. Se mide desde `created_at`.
- **R5. Tres plataformas oficiales:** website, Facebook, Instagram (Manual).
- **R6. Nombre completo en comunicación externa.** "Osoyoos & District Arts Council", nunca "ODAC", en todo texto público (Manual, Sección 7).
- **R7. UX admin más simple que una Google Sheet.** Botones grandes con texto completo, cero jerga. La próxima administradora puede no conocer herramientas web.
- **R8. Email oficial:** osoyoosartscouncil@gmail.com. El remitente actual (noreply@soymanada.com) es TEMPORAL y debe migrarse antes de septiembre (dominio personal de Francisco = riesgo de sostenibilidad).

### 1.3 Restricciones técnicas
- Costo total: $0. Stack fijo: GitHub Pages (estático, sin build) + Supabase free + Resend free. No agregar dependencias/servicios sin aprobación del PO.
- Las migraciones de schema son archivos numerados en `supabase/sql/` que Francisco pega en el SQL Editor de Supabase. Nunca se edita una migración ya ejecutada; los cambios van en un archivo nuevo.
- Nada de lógica automática oculta: toda acción con efecto visible la decide un humano.
- Todo debe ser operable tras noviembre 2026 sin Francisco (mantenimiento vía instrucciones de IA a persona no técnica).
- Deadlines: sistema core operativo septiembre 2026; documentado y transferido octubre 2026.

---

## 2. MAPA DEL REPO
| Ruta | Qué es |
|---|---|
| `index.html` + `form.js` + `style.css` | Formulario público de intake (Fase 1, en vivo) |
| `admin.html` + `admin.js` + `admin.css` | Dashboard admin (Fase 2, en curso) |
| `config.js` | URL y anon key de Supabase (público por diseño; la seguridad es RLS) |
| `supabase/sql/01..04_*.sql` | Migraciones ya ejecutadas en producción |
| `supabase/functions/notify-submission` | Edge function: emails de confirmación y alerta vía Resend |
| `docs/STATUS.md` | Este archivo. Fuente única de verdad |
| `docs/roadmap.html` | OBSOLETO — no leer ni actualizar |

## 3. ESTADO POR FASES
- [x] **Fase 1 — Intake:** formulario público en vivo, escribe en Supabase, emails de confirmación y alerta funcionando. Verificado end-to-end 4-jul (submission "Prueba 1" + email recibido). Fixes del manual aplicados (Instagram, nombre completo).
- [ ] **Fase 2 — Dashboard admin (EN CURSO):** login Supabase Auth funcionando; tabla básica con botones por canal (`publish_to` / `posted_*`) existente en admin.js. Pendiente: semáforo 48h, migración `05_social_fields.sql`, flujo "asistir, no automatizar" (previews editables FB/IG + copiar + `published_at`), campo `expire_date` editable, alerta de contenido vencido, RLS de lectura para `submission_files` (P-2).
- [ ] **Fase 3 — Runbook + handoff (sept-oct):** documentación como sección nueva del Administration Manual + fila en política 4.g (Transition of Responsibilities). Feedback mensual a grupos.

## 4. PRÓXIMO PASO ACORDADO
1. PO resuelve las propuestas P-1 y P-2 (sección 5).
2. Claude Code escribe `05_social_fields.sql` (campos de 1.1.b + DROP de `reviewer_notes` si P-1 se aprueba + políticas de lectura de archivos si P-2 se aprueba); Francisco la ejecuta y se anota en el LOG.
3. Claude Code implementa en el dashboard la sección "Publicar en redes" del flujo asistir-no-automatizar: previews editables FB/IG generados desde `description`, botones de copiar, registro de `published_at`. (Sonnet, previo plan corto.)

## 5. PROPUESTAS PENDIENTES (las resuelve el PO; los devs no las implementan hasta que pasen a LEY)
| # | Propuesta | Origen | Estado |
|---|---|---|---|
| P-1 | DROP de la columna `reviewer_notes` (existe en DB desde 01_schema.sql y viola R1). Incluirla en `05_social_fields.sql` | Auditoría Claude Code 5-jul | PENDIENTE |
| P-2 | Políticas RLS de SELECT para `authenticated` en `submission_files` y de lectura en el bucket `submission-files` — sin esto el dashboard no puede mostrar ni descargar los adjuntos | Auditoría Claude Code 5-jul | PENDIENTE |
| P-3 | Enforcement server-side de límites de archivos (10MB / 3 por submission / JPG-PNG-PDF): hoy solo valida el cliente. Opciones $0: restricción de tamaño y MIME en el bucket + trigger de conteo. Prioridad baja (riesgo: abuso del form público) | Auditoría Claude Code 5-jul | PENDIENTE |

## 6. LOG (entradas nuevas ARRIBA)
| Fecha | Autor | Qué se hizo | Qué sigue |
|---|---|---|---|
| 2026-07-05 | Claude Code | Auditoría de STATUS.md contra el schema desplegado: la sección 1.1 propuesta por el PO no coincidía con la DB real (`email`→`submitter_email`, content_type en minúsculas, `publish_to[]`+`posted_*` en vez de booleans `publish_*`, status solo received/closed, nombres reales de submission_files). Se corrigió 1.1 a la realidad verificada, se separaron los campos sociales como 1.1.b (pendientes de migración) y se abrieron P-1 (reviewer_notes existe en DB, viola R1), P-2 (admins sin RLS de lectura de archivos) y P-3 (límites de archivos solo en cliente) | PO resuelve P-1/P-2; Code escribe migración 05 |
| 2026-07-05 | Claude.ai (PO) | Creación de STATUS.md; reemplaza roadmap.html. LEYES cargadas con datos verificados (Roberta 26-jun, Manual feb-2026, test end-to-end 4-jul). Diseño del flujo asistir-no-automatizar aprobado. | Code implementa sección social del dashboard |
| 2026-07-04 | Sistema | Test end-to-end exitoso: submission "Prueba 1" → fila en DB → email confirmación recibido (remitente temporal soymanada.com) | Migrar remitente a cuenta ODAC antes de sept |
| 2026-07-04 | Claude Code | Login Supabase Auth operativo; fixes del manual aplicados en frontend | Dashboard Fase 2 |
