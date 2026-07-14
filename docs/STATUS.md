# ODAC Internal Portal — Estado y Coordinación
> Fuente única de verdad del proyecto. Reemplaza a `docs/roadmap.html`.
> Última actualización: 2026-07-14 por Perplexity (LOG entries 13-14 jul)

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
| facebook_text | text | flujo "asistir": texto sugerido editable (migración 05, en producción) |
| instagram_text | text | flujo "asistir": texto sugerido editable (migración 05, en producción) |
| facebook_image | text | URL imagen adaptada 1.91:1 (migración 05, en producción) |
| instagram_image | text | URL imagen adaptada 1:1 (migración 05, en producción) |
| published_at | timestamptz | lo registra el admin al confirmar publicación (migración 05, en producción) |

`reviewer_notes` NO existe — fue DROPEADA por la migración 05 (violaba R1). PROHIBIDO reintroducirla bajo cualquier nombre.

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

### 1.1.b Tabla `groups` (`06_groups.sql` — ✅ EJECUTADA EN PRODUCCIÓN 14-jul)

Reemplaza la lista de 18 grupos hardcodeada en `index.html` por una tabla editable
desde el dashboard (sección "Manage Groups"). `submissions.group_name` sigue
siendo texto libre — esta tabla NO es una FK, así que desactivar o renombrar un
grupo aquí nunca toca submissions históricas.

| Columna | Tipo | Regla |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| name | text NOT NULL UNIQUE | nombre exacto mostrado en el dropdown |
| active | boolean NOT NULL | default true. false = oculto del form público pero conservado para historial. NUNCA se borra una fila, solo se desactiva |
| created_at | timestamptz NOT NULL | default now() |

Seed de 18 grupos aplicado. Verificado: 18 filas, todas `active = true`.

### 1.1.c RLS (desplegada en `02_rls.sql` + `04_admin_rls.sql` + `05_social_fields.sql` + `06_groups.sql`, todas en producción)
- `submissions`: INSERT para `anon` (form público); SELECT y UPDATE para `authenticated` (admins). Nadie tiene DELETE.
- `submission_files`: INSERT para `anon`; SELECT para `authenticated`.
- Storage bucket `submission-files`: INSERT para `anon` (path debe empezar en `submissions/`); SELECT para `anon` (mismo filtro) y para `authenticated`.
- `groups`: SELECT para `anon` solo donde `active = true`; SELECT/INSERT/UPDATE completos para `authenticated`. Sin DELETE para nadie.

⚠️ **Incidente 13-jul:** una migración de rate-limit no autorizada (`20260705_anon_rls_rate_limit.sql`, aplicada por Perplexity sin pasar por PROPUESTA PENDIENTE) reemplazó las policies `anon_can_submit` / `anon_can_insert_file_records` con versiones que contaban filas recientes, rompiendo el formulario público. Se revirtió a mano el mismo día. Adicionalmente, las policies de storage requerían tanto INSERT como SELECT para `anon` — faltaba la policy de SELECT, lo que causaba el error "violates row-level security" al subir archivos aunque el INSERT existiera. Fix completo aplicado el 13-jul. Regla reforzada: **ningún cambio de RLS se ejecuta sin aparecer primero en la sección 5 como PROPUESTA PENDIENTE**, sin excepción, incluso en modo "arreglo urgente".

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
| `supabase/sql/01..06_*.sql` | Migraciones ya ejecutadas en producción |
| `supabase/functions/notify-submission` | Edge function: emails de confirmación y alerta vía Resend |
| `docs/STATUS.md` | Este archivo. Fuente única de verdad |
| `docs/roadmap.html` | OBSOLETO — no leer ni actualizar |

## 3. ESTADO POR FASES
- [x] **Fase 1 — Intake:** formulario público en vivo, escribe en Supabase, emails de confirmación y alerta funcionando. Verificado end-to-end 4-jul (submission "Prueba 1" + email recibido). Fixes del manual aplicados (Instagram, nombre completo).
- [ ] **Fase 2 — Dashboard admin (EN CURSO):** login Supabase Auth ✓, semáforo 48h ✓, botones por canal ✓, alerta de contenido vencido ✓, `expire_date` editable ✓, sección social "asistir, no automatizar" ✓ (previews editables FB/IG + copiar + `published_at` + adjuntos descargables), migración 05 en producción ✓, sección "Manage Groups" ✓ (código listo), migración 06 en producción ✓. Pendiente: **verificación end-to-end con cuenta admin real** (agregar grupo de prueba, verificar dropdown, desactivarlo, flujo social con submission real).
- [ ] **Fase 3 — Runbook + handoff (sept-oct):** documentación como sección nueva del Administration Manual + fila en política 4.g (Transition of Responsibilities). Feedback mensual a grupos.

## 4. PRÓXIMO PASO ACORDADO
1. Francisco (o Roberta) prueba en el dashboard: **Manage Groups** → agregar un grupo de prueba → verificar que aparece en el dropdown del form público → desactivarlo → verificar que desaparece del dropdown pero no rompe nada.
2. Francisco (o Roberta) prueba la sección social con una submission real: "Prepare the social media posts" → editar texto → "Copy the Facebook text" → pegar en FB → "Mark as posted to Facebook" → verificar `published_at`.
3. Migrar remitente de email de noreply@soymanada.com a cuenta ODAC antes de septiembre (R8).

## 5. PROPUESTAS PENDIENTES (las resuelve el PO; los devs no las implementan hasta que pasen a LEY)
| # | Propuesta | Origen | Estado |
|---|---|---|---|
| P-1 | DROP de la columna `reviewer_notes` (violaba R1) | Auditoría Claude Code 5-jul | ✅ APLICADA — migración 05 ejecutada en prod 11-jul |
| P-2 | Políticas RLS de SELECT para `authenticated` en `submission_files` y en el bucket | Auditoría Claude Code 5-jul | ✅ APLICADA — migración 05 ejecutada en prod 11-jul |
| P-3 | Enforcement server-side de límites de archivos (10MB / 3 por submission / JPG-PNG-PDF): hoy solo valida el cliente. Opciones $0: restricción de tamaño y MIME en el bucket + trigger de conteo. Prioridad baja (riesgo: abuso del form público) | Auditoría Claude Code 5-jul | PENDIENTE |
| P-4 | Tabla `groups` para reemplazar el dropdown hardcodeado, con sección "Manage Groups" en el dashboard (agregar/desactivar grupos, sin login por grupo) | Solicitud Francisco 13-jul | ✅ APLICADA — `06_groups.sql` ejecutada en prod 14-jul, 18 grupos seed, verificada |
| P-5 | Alerta por EMAIL cuando una submission supera 48h sin publicar (hoy solo existe como semáforo visual en el dashboard, nadie se entera si no está mirando). Requiere segunda Edge Function + cron (pg_cron o Supabase Scheduled Functions) | Auditoría Claude Code 14-jul | PENDIENTE — no implementar sin aprobación |
| P-6 | Alerta por EMAIL cuando `expire_date` de una submission ya pasó (hoy solo existe como banner visual en el dashboard). Requiere el mismo tipo de cron que P-5 | Auditoría Claude Code 14-jul | PENDIENTE — no implementar sin aprobación |

## 6. LOG (entradas nuevas ARRIBA)
| Fecha | Autor | Qué se hizo | Qué sigue |
|---|---|---|---|
| 2026-07-14 | Claude Code | **Rediseño del dashboard con /design-direction.** Cada submission card apilaba semáforo+descripción+adjuntos+expire_date+canales+panel social en una sola pantalla (medido: 13.9 pantallas de scroll con solo 2 submissions). Se presentaron 3 opciones (top tabs / card tabs / filas colapsables), Francisco aprobó B. Implementado: cada card ahora tiene pestañas Details / Publish / Social; Social solo aparece si se pidió FB o IG y la submission no está cerrada. El tab activo persiste por card (`activeCardTab`) a través de re-renders de guardado. Cambio de pestaña es show/hide directo, no re-render completo — cero riesgo de perder texto sin guardar. Verificado con clicks reales en el navegador, sin errores de consola. Commit local `17cc4b3`, **NO PUSHEADO** — SSH a GitHub bloqueado desde esta red (puerto 22 timeout) desde hace varias horas, igual que el commit `38f7692` de la auditoría de emails | Reintentar push cuando la red lo permita; mientras tanto el sitio en vivo NO tiene este cambio |
| 2026-07-14 | Claude Code | **Auditoría de las 4 alertas por email — solo reporte, sin cambios de código.** (1) Confirmación al grupo: código correcto en `notify-submission`, función SÍ desplegada (GET sin auth → 401 del gateway, no 404), pero remitente real (`FROM_EMAIL` secret) y estado del Database Webhook `on-new-submission` NO verificables desde aquí (server-side / dashboard-only). Última prueba exitosa confirmada: 4-jul con remitente soymanada.com; las 3 submissions de prueba del 13-jul (ya borradas) no tienen resultado de email documentado. Estado: NO VERIFICADO. (2) Alerta al admin: mismo código/función, destinatario real (`ADMIN_EMAIL`) no verificable. Estado: NO VERIFICADO. (3) Alerta 48h por email: NO EXISTE — confirmado por grep en todo el repo, cero cron/scheduled function; solo hay un semáforo visual en `admin.js` que nadie ve si no está logueado. Nunca fue diseñado como email, no es regresión. Agregada como P-5. (4) Alerta de vencido por email: NO EXISTE — mismo patrón, solo banner visual (`isExpired` en admin.js). Agregada como P-6. | Francisco decide si P-5/P-6 se implementan y define umbral de horas; verificar secrets FROM_EMAIL/ADMIN_EMAIL y el Database Webhook en el dashboard de Supabase |
| 2026-07-14 | Perplexity | **Migración 06 ejecutada en producción** (ref `kadypvojaettjhvubnrs`). Tabla `public.groups` creada, 18 grupos seed insertados, RLS habilitado con 4 policies exactamente como en `06_groups.sql` (sin modificaciones). Verificado: `SELECT name, active FROM public.groups ORDER BY name` devuelve 18 filas, todas `active = true`. P-4 marcada APLICADA. STATUS.md actualizado (1.1.b, 1.1.c, 2, 3, 4, 5). | Francisco prueba Manage Groups en el dashboard y el flujo social con submission real |
| 2026-07-14 | Perplexity | **Limpieza de submissions de prueba en producción.** Borradas 3 submissions de test (IDs: 48a226c0, 84149333, bba091f1) y sus registros en `submission_files` via SQL. Los 3 archivos físicos en Storage bucket `submission-files` quedaron huérfanos — deben borrarse manualmente desde [Supabase Dashboard → Storage → submission-files → carpeta submissions](https://supabase.com/dashboard/project/kadypvojaettjhvubnrs/storage/buckets/submission-files). DB verificada: 0 submissions, 0 submission_files. | Francisco borra las 3 carpetas huérfanas en Storage |
| 2026-07-13 | Perplexity | **Fix incidente RLS storage — causa raíz real identificada.** El error "new row violates row-level security" al subir archivos tenía dos causas: (1) la migración no autorizada `20260705_anon_rls_rate_limit.sql` ya revertida, y (2) Supabase Storage v2 requiere policy de SELECT además de INSERT para el rol `anon` en `storage.objects`. Ambas policies recreadas con `WITH CHECK` y `USING` restringidos al path `submissions/` (alineado con el path real de `form.js`). Policies finales en producción: `anon_can_upload_submission_files` (INSERT) y `anon_can_select_own_upload` (SELECT), ambas con `bucket_id = 'submission-files' AND foldername[1] = 'submissions'`. | Probar upload en formulario público |
| 2026-07-13 | Perplexity | **Intento de fix RLS (parcial — no resolvió el problema completo).** Restauradas policies `anon_can_submit` (submissions), `anon_can_insert_file_records` (submission_files) y `anon_can_upload_submission_files` (storage.objects) eliminando las versiones con rate-limit. Error de upload persistía por la falta de policy SELECT en storage (ver entrada siguiente). | — |
| 2026-07-13 | Claude Code | **INCIDENTE:** Perplexity ejecutó `20260705_anon_rls_rate_limit.sql` sin pasar por PROPUESTA PENDIENTE, reemplazando las policies `anon_can_submit`/`anon_can_insert_file_records` por versiones con límite de 5 submissions/hora, rompiendo la subida de archivos del form público (RLS violation). Diagnosticado con pruebas directas contra prod (uploads reales pasaban, aislando el problema a las policies de conteo). Perplexity restauró las policies originales el mismo día tras varios intentos. Ver 1.1.c para detalle | Sin cambios adicionales de RLS sin pasar por sección 5 primero |
| 2026-07-13 | Claude Code | Nueva tabla `groups` (`06_groups.sql`, aprobada por Francisco: sin login por grupo, gestión desde el dashboard). Frontend: `index.html`/`form.js` cargan el dropdown dinámicamente desde `groups` (antes hardcodeado); `admin.html`/`admin.js`/`admin.css`: sección "Manage Groups" (agregar grupo, activar/desactivar, sin DELETE nunca). `submissions.group_name` sigue siendo texto libre, no FK — cero riesgo para submissions existentes. Probado localmente con datos simulados (XSS-safe, degrada si la tabla no existe aún). Actualizado STATUS.md 1.1/1.1.b/1.1.c que había quedado desactualizado tras confirmarse que la migración 05 sí corrió | Perplexity ejecuta `06_groups.sql` exactamente como está escrita |
| 2026-07-13 | Claude Code | Resuelto conflicto de merge: Perplexity había pusheado `expire_date` editable (válido, se mantuvo) junto con `reviewer_notes` (viola R1, columna ya dropeada — se eliminó del código). Dashboard ahora tiene: semáforo, botones por canal, `expire_date` editable, alerta de vencido, adjuntos descargables, sección social — todo verificado sin errores de consola | — |
| 2026-07-11 | Perplexity (bot) | **Migración 05 ejecutada en producción** vía API de Supabase (ref `kadypvojaettjhvubnrs`). 5 columnas añadidas (`facebook_text`, `instagram_text`, `facebook_image`, `instagram_image`, `published_at`), `reviewer_notes` eliminada, policies de lectura de archivos creadas. | Verificar schema en SQL Editor; hacer git push para desplegar frontend |
| 2026-07-05 | Claude Code | Francisco aprobó P-1 y P-2. Escrita `05_social_fields.sql` (campos sociales + DROP reviewer_notes + RLS lectura de archivos). Implementada en admin.js/admin.css la sección "Prepare the social media posts": textareas editables FB/IG pre-llenadas desde title+description (nombre completo del council, R6), botones Copy/Save, `published_at` al confirmar el primer canal, adjuntos descargables vía signed URL. Degrada con aviso si la migración 05 no ha corrido. Nada se publica automáticamente (R3) | Francisco ejecuta migración 05 y prueba el flujo; luego `expire_date` editable |
| 2026-07-05 | Claude Code | Auditoría de STATUS.md contra el schema desplegado: la sección 1.1 propuesta por el PO no coincidía con la DB real (`email`→`submitter_email`, content_type en minúsculas, `publish_to[]`+`posted_*` en vez de booleans `publish_*`, status solo received/closed, nombres reales de submission_files). Se corrigió 1.1 a la realidad verificada, se separaron los campos sociales como 1.1.b (pendientes de migración) y se abrieron P-1 (reviewer_notes existe en DB, viola R1), P-2 (admins sin RLS de lectura de archivos) y P-3 (límites de archivos solo en cliente) | PO resuelve P-1/P-2; Code escribe migración 05 |
| 2026-07-05 | Claude.ai (PO) | Creación de STATUS.md; reemplaza roadmap.html. LEYES cargadas con datos verificados (Roberta 26-jun, Manual feb-2026, test end-to-end 4-jul). Diseño del flujo asistir-no-automatizar aprobado. | Code implementa sección social del dashboard |
| 2026-07-04 | Sistema | Test end-to-end exitoso: submission "Prueba 1" → fila en DB → email confirmación recibido (remitente temporal soymanada.com) | Migrar remitente a cuenta ODAC antes de sept |
| 2026-07-04 | Claude Code | Login Supabase Auth operativo; fixes del manual aplicados en frontend | Dashboard Fase 2 |
