# Un restaurante, una base de datos, un servidor

Cada restaurante tiene **su propio Supabase** (base de datos, usuarios y fotos) y **su propio proyecto en Vercel**. Todos usan **el mismo código** de este repositorio. Si un restaurante tiene mucho tráfico o un problema, los demás no se enteran.

```
            GitHub: este repositorio (rama main)
                         │
      git push ──────────┼───────────────────────┐
                         ▼                       ▼
   GitHub Action "Actualizar bases de datos"   Vercel: un proyecto por restaurante,
   aplica las migraciones nuevas en cada       todos conectados a este mismo repo
   Supabase de la lista                        y con sus propias variables
```

## Cómo llegan las actualizaciones

- **Código:** al aprobar un PR en `main`, Vercel vuelve a desplegar automáticamente todos los proyectos conectados al repositorio.
- **Base de datos:** si el PR trae archivos nuevos en `supabase/migrations/`, el GitHub Action los aplica en cada restaurante de la lista. Primero va el restaurante de prueba (si hay uno configurado) y, si sale bien, todos los demás. Cada base recibe solo las migraciones que le faltan y **conserva sus datos**.

### Reglas para cambios de base de datos

1. **Cada cambio es un archivo nuevo** en `supabase/migrations/`, con la fecha y hora delante: `AAAAMMDDHHMMSS_que_hace.sql`. Nunca se edita un archivo que ya se aplicó.
2. **Solo cambios compatibles con el código que ya está publicado.** Agregar tablas, columnas, índices o funciones, sí. Para borrar o renombrar algo que el código usa: primero se publica el código que deja de usarlo y, en otra actualización, se borra.
3. **El código nuevo debe tolerar que la migración llegue un minuto después.** Vercel y el Action arrancan al mismo tiempo. Si una función nueva necesita una columna nueva, la migración va en un PR anterior o el código revisa que exista (como ya hace el pedido con `push_ref`).
4. Nunca se ejecuta SQL a mano en el editor de un solo restaurante: los demás quedarían distintos.

## Configuración del GitHub Action (una sola vez)

En GitHub: **Settings → Secrets and variables → Actions**.

**Variables** (pestaña *Variables*):

| Nombre | Ejemplo | Para qué |
|---|---|---|
| `RESTAURANTES` | `["PRINCIPAL"]` | Lista de códigos de todos los restaurantes. |
| `RESTAURANTE_PRUEBA` | `DEMO` | Opcional. Se actualiza primero; si falla, no se toca a nadie más. |

El código de cada restaurante va en mayúsculas, sin espacios ni acentos (letras, números y `_`).

**Secretos** (pestaña *Secrets*), uno por restaurante:

| Nombre | Valor |
|---|---|
| `DB_URL_PRINCIPAL` | La cadena de conexión de su Supabase |

**De dónde sale la cadena de conexión:** en Supabase, botón **Connect** arriba → **Session pooler** → copia la URI y reemplaza `[YOUR-PASSWORD]` por la contraseña de la base. Usa la de *Session pooler* y no la *Direct connection*: los servidores de GitHub no pueden conectarse a la directa.

Para probarlo: **Actions → Actualizar bases de datos → Run workflow**. Si todo está bien, cada restaurante dice "Remote database is up to date".

## Dar de alta un restaurante nuevo

Unos 20 a 30 minutos. Los pasos en orden:

### 1. Supabase: crear su base
1. En [supabase.com](https://supabase.com), **New project**. Nombre: el del restaurante. Región: la más cercana al restaurante.
2. Guarda la **contraseña de la base** en un lugar seguro.
3. Cuando termine de crearse, copia de **Connect → Session pooler** su cadena de conexión.

### 2. Instalarle la base completa
1. En GitHub, crea el secreto `DB_URL_<CÓDIGO>` con esa cadena (por ejemplo `DB_URL_CASA_SABOR`).
2. Agrega el código a la variable `RESTAURANTES`: `["PRINCIPAL","CASA_SABOR"]`.
3. **Actions → Actualizar bases de datos → Run workflow.** Su base queda idéntica a las demás, vacía y lista.

### 3. Supabase: ajustes de inicio de sesión
Estos no viajan con las migraciones porque son de cada proyecto:
1. **Authentication → URL Configuration:** en *Site URL* pon el dominio del restaurante (`https://lacasadelsabor.com`) y agrégalo también en *Redirect URLs*.
2. **Authentication → Providers → Email:** activa **Leaked password protection**.
3. Si va a registrar a mucha gente, conecta un servicio de correo propio en **Authentication → Emails → SMTP Settings**: el correo incluido en Supabase tiene un límite bajo de envíos por hora.
4. De **Project Settings → API**, copia la **Project URL** y la llave **anon / public**.

### 4. OneSignal: avisos al teléfono (opcional)
1. En [onesignal.com](https://onesignal.com), crea una app nueva de tipo **Web** con el dominio del restaurante como *Site URL*.
2. Copia el **App ID** y la **REST API Key**.

Si el restaurante no quiere avisos push, sáltate este paso: la app funciona igual sin ellos.

### 5. Vercel: su servidor
1. **Add New → Project** e importa **este mismo repositorio** (`moiniwedding/ordrpr`).
2. En **Environment Variables**:

   | Variable | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Project URL de su Supabase |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Llave anon / public de su Supabase |
   | `NEXT_PUBLIC_ONESIGNAL_APP_ID` | App ID de OneSignal (opcional) |
   | `ONESIGNAL_REST_API_KEY` | REST API Key de OneSignal (opcional) |

3. **Deploy.** Después, en **Settings → Domains**, conecta su dominio.

### 6. Entregárselo al dueño
1. **Justo después del despliegue**, el dueño entra a su dirección y **crea la primera cuenta**: la primera cuenta registrada queda automáticamente como dueña. Hazlo antes de compartir la dirección con nadie más.
2. Sigue el **asistente de configuración**: nombre, logo, colores, sucursales, contacto y moneda.
3. Carga su menú desde Inicio y Menú.
4. Invita a su equipo desde **Cuenta → Tu negocio → Equipo**.

Desde ese momento recibe cada actualización junto con los demás.

## Lo que hay en `supabase/migrations/`

| Archivo | Qué hace |
|---|---|
| `20261017000000_base.sql` | La base completa: tablas, reglas de seguridad, funciones, el disparador que crea el perfil al registrarse, el espacio de fotos `fotos` y los datos iniciales. |
| `20261018213511_estadisticas_por_dia.sql` | Índices para filtrar estadísticas por día. |
| `20261018214352_seguridad_pay_with_gift_card_monto.sql` | Pagar con gift card rechaza montos negativos. |
| `20261018214400_seguridad_revocar_funciones_anon.sql` | Las funciones que requieren sesión no se pueden llamar sin iniciarla. |
| `20261018214422_seguridad_pedidos_insert.sql` | Un pedido nuevo no puede cargarse a otra cuenta ni crearse ya avanzado. |
| `20261019120000_monedas_extra.sql` | Otras monedas para pagar: las que agrega el dueño y la que eligió el cliente en cada pedido. |
| `20261019150000_codigo_moneda.sql` | Código de la moneda principal, para buscar las tasas de cambio del día. |
| `20261019180000_precios_por_moneda.sql` | Precio propio de cada producto en otra moneda (por ejemplo US$6). |
| `20261019210000_inicio_y_personalizacion.sql` | Ocultar y ordenar en el inicio, color de fondo y CSS/HTML propios del menú tipo carta. |
| `20261020090000_mostrar_nosotros.sql` | El dueño puede ocultar la página Nosotros a los clientes. |
| `20261020120000_codigos_promocionales.sql` | Códigos promocionales: los códigos, cada canje y el código usado en cada pedido. |
| `20261020150000_setup_con_dueno.sql` | En cuanto existe una cuenta de dueño, /setup da 404 a todos los demás. |

La base del restaurante original ya tenía todo esto; su historial de migraciones quedó marcado como al día, así que el Action no vuelve a aplicarle nada.
