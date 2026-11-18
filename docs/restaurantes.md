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
   | `ALANUBE_TOKEN` | Token de Alanube de Ordrpr (el mismo para todos los restaurantes). Sin él, la facturación electrónica funciona en **modo de prueba** (todo simulado). |
   | `ALANUBE_ENV` | `production` para emitir comprobantes reales; vacío = sandbox. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Clave *service_role* de **su** Supabase (Project Settings → API). Hace falta para que el equipo entre con PIN. Solo va aquí, nunca en el código ni en el chat. |

3. **Deploy.** Después, en **Settings → Domains**, conecta su dominio.

   Para Apple Wallet y Google Wallet (opcionales, ver abajo) se agregan además `APPLE_PASS_P12`, `APPLE_PASS_P12_PASSWORD`, `APPLE_WWDR_CERT`, `GOOGLE_WALLET_ISSUER_ID` y `GOOGLE_WALLET_SERVICE_ACCOUNT`.

### 6. Entregárselo al dueño
1. **Justo después del despliegue**, el dueño entra a su dirección y **crea la primera cuenta**: la primera cuenta registrada queda automáticamente como dueña. Hazlo antes de compartir la dirección con nadie más.
2. Sigue el **asistente de configuración**: nombre, logo, colores, sucursales, contacto y moneda.
3. Carga su menú desde Inicio y Menú.
4. Invita a su equipo desde **Cuenta → Tu negocio → Equipo**.

Desde ese momento recibe cada actualización junto con los demás.

## Apple Wallet para el pase de sellos (opcional)

Sin esto, el pase de sellos funciona igual dentro de la página; solo no aparece el botón "Agregar a Apple Wallet". Se hace **una vez** y el mismo certificado sirve para todos los restaurantes.

1. Necesitas una cuenta de [Apple Developer](https://developer.apple.com) (99 USD al año).
2. **Certificates, Identifiers & Profiles → Identifiers → +** → *Pass Type IDs*. Identificador, por ejemplo `pass.com.tuempresa.sellos`.
3. En la Mac, **Acceso a Llaveros → Asistente de certificados → Solicitar un certificado de una autoridad de certificación**, guardado en el disco.
4. **Certificates → +** → *Pass Type ID Certificate*, elige el identificador del paso 2 y sube la solicitud del paso 3. Descarga el `.cer` y ábrelo para instalarlo en el llavero.
5. En **Acceso a Llaveros**, clic derecho sobre el certificado → **Exportar** como `.p12`, con una contraseña.
6. Descarga el certificado intermedio **Worldwide Developer Relations – G4** desde [apple.com/certificateauthority](https://www.apple.com/certificateauthority/) (`AppleWWDRCAG4.cer`).
7. Convierte los dos archivos a texto en la Terminal: `base64 -i pase.p12 | pbcopy` (y lo mismo con `AppleWWDRCAG4.cer`).
8. En **Vercel → Settings → Environment Variables** de cada restaurante:

   | Variable | Valor |
   |---|---|
   | `APPLE_PASS_P12` | El texto del `.p12` (paso 7) |
   | `APPLE_PASS_P12_PASSWORD` | La contraseña del paso 5 |
   | `APPLE_WWDR_CERT` | El texto de `AppleWWDRCAG4.cer` |

9. **Redeploy.** En **Promociones → Pase de sellos** debe decir "Apple Wallet conectado" (también lo dice `https://su-dominio/api/wallet/status`).

El Pass Type ID y el Team ID salen solos del certificado. El certificado vence cada año: se renueva en el mismo lugar y se cambian las variables.

## Google Wallet para el pase de sellos (opcional)

Igual que Apple Wallet: sin esto el pase funciona en la página y solo no aparece el botón "Agregar a Google Wallet". Se hace **una vez** y sirve para todos los restaurantes.

1. Entra a la [consola de Google Pay & Wallet](https://pay.google.com/business/console) con una cuenta de Google del negocio, abre **Google Wallet API** y copia el **Issuer ID**.
2. En [Google Cloud](https://console.cloud.google.com), crea un proyecto (o usa uno), busca **Google Wallet API** y actívala.
3. **IAM y administración → Cuentas de servicio → Crear cuenta de servicio**. Dentro de ella, **Claves → Agregar clave → JSON**: se descarga un archivo `.json`.
4. Vuelve a la consola de Google Pay & Wallet → **Usuarios → Invitar**, pega el correo de la cuenta de servicio (termina en `iam.gserviceaccount.com`) con acceso de **Desarrollador**.
5. En **Vercel → Settings → Environment Variables** de cada restaurante:

   | Variable | Valor |
   |---|---|
   | `GOOGLE_WALLET_ISSUER_ID` | El Issuer ID del paso 1 |
   | `GOOGLE_WALLET_SERVICE_ACCOUNT` | Todo el contenido del `.json` del paso 3 |

6. **Redeploy.** En **Promociones → Pase de sellos** debe decir "Google Wallet conectado".
7. Mientras Google no apruebe tu cuenta de emisor, solo los correos que agregues como **usuarios de prueba** en la consola pueden guardar el pase. Cuando todo funcione, pide la aprobación (**Solicitar acceso de publicación**) en la misma consola.

## Punto de venta: puesta en marcha en un restaurante

1. **Equipo:** en **Cuenta → Tu negocio → Equipo**, agrega a cada persona **con PIN** (nombre, rol y 4 números; no necesita correo) o **con correo**:
   - **Cajero:** solo cobra y factura (cuentas de las mesas, pagos por persona y ventas de mostrador). No abre cuentas, no agrega pedidos ni atiende llamados.
   - **Camarero:** sus mesas y la carta para tomar pedidos.
   - **Cocina:** la pantalla de comandas.
   - **Contador:** solo Contabilidad (reportes en PDF y CSV).
   - **Dueño:** todo (siempre con correo).
2. **Aparatos del local:** en la tablet o el teléfono del local, abre `/equipo`, entra como dueño y toca **Usar este aparato para el equipo**. Desde ahí cada quien toca su nombre y pone su PIN. El PIN solo funciona en aparatos activados; 5 errores bloquean a esa persona 15 minutos. Requiere `SUPABASE_SERVICE_ROLE_KEY` en Vercel.
3. **Tiempos de los camareros:** cuando una mesa llama o pide la cuenta, el camarero dice en cuánto va. Si se le vence el tiempo sin marcar «Ya fui», se le anota un strike que el dueño ve (y puede quitar) en Equipo.
4. **Mesas y QR:** en **Sucursales y mesas**, crea las mesas y toca **Códigos QR de las mesas** para imprimirlos. Cada QR abre la cuenta de su mesa.
5. **Facturación:** en **Facturación**, pon la razón social y el RNC que salen en las facturas.
6. **Productos:** en cada producto, agrega los **ingredientes** (los ven los camareros) y si se prepara en **cocina** o **bar**. Las categorías también tienen estación.
7. **Impresoras (prueba):** en **Impresoras**, agrega una impresora:
   - **Virtual:** se ve en el navegador, sin equipo; ideal para probar.
   - **Star (CloudPRNT)** o **Epson (Server Direct Print):** copia la dirección que aparece y pégala en la configuración de la impresora. La impresora la consulta sola cada pocos segundos.
   - Las impresoras de cocina y bar reciben las comandas solas. La de caja recibe prefacturas y facturas cuando se envían desde Caja.

## Facturación electrónica (e-CF) con Alanube

Lo hace el dueño (en **Cuenta → Tu negocio → Facturación electrónica (e-CF)**) o el contador (en **Contabilidad → Facturación**); nosotros no configuramos nada por restaurante (solo `ALANUBE_TOKEN` en Vercel, igual para todos):

1. **Datos del negocio:** razón social y RNC (en Facturación) y dirección (en Contacto), iguales a los de la DGII.
2. **Certificado digital:** sube su .p12/.pfx y la contraseña. La app da de alta al restaurante en Alanube como empresa asociada de Ordrpr. El certificado y la contraseña van directo a Alanube; aquí no se guardan.
3. **Postulación en la DGII:** en la Oficina Virtual elige a Alanube como proveedor y pega las 3 direcciones que muestra la app.
4. **Certificación:** «Generar set de pruebas» y «Subir XML para firmar» (la declaración jurada que da la DGII; se descarga firmada para subirla de vuelta).
5. **Secuencias e-NCF:** los rangos E32, E31 y E34 que autorizó la DGII, con su vencimiento. La app avisa cuando quedan pocos.
6. **Activar:** desde ahí cada factura se envía sola: **E31** si lleva RNC y **E32** si es de consumo. La factura muestra el e-NCF, el código de seguridad, el QR de la DGII y el estado; Contabilidad cuenta aceptados, en proceso y rechazados.

Sin `ALANUBE_TOKEN` todo se simula (modo de prueba) para ver el proceso. Pendiente de validar en el sandbox de Alanube: cómo va la Ley 10% en el e-CF (hoy como recargo exento) y el formato del webhook.

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
| `20261020180000_pase_de_sellos.sql` | Pase de sellos: el diseño del pase, el pase de cada cliente, cada sello, los premios (códigos personales) y los aparatos con el pase en Apple Wallet. |
| `20261020210000_usuarios_y_newsletter.sql` | Aceptación del newsletter al registrarse, la lista de usuarios para el dueño (con correos) y los pases a actualizar en Google Wallet. |
| `20261020230000_newsletter_baja.sql` | Darse de baja del newsletter desde Cuenta o con el enlace personal de cada correo. |
| `20261123000000_archivo_de_facturas.sql` | Resumen de facturas por mes para las carpetas del archivo de Contabilidad. |
| `20261122000000_caja_solo_cobra.sql` | La caja solo cobra y factura: no abre cuentas, no agrega pedidos, no atiende llamados ni cambia pedidos (también bloqueado en la base). |
| `20261121000000_contabilidad_facturacion.sql` | El contador también maneja los datos fiscales (razón social, RNC, dirección y nota al pie) y toda la facturación electrónica. |
| `20261120000000_facturacion_electronica.sql` | Facturación electrónica: configuración e-CF del restaurante, secuencias e-NCF y estado de cada factura ante la DGII. |
| `20261119000000_equipo_pin_tiempos_contabilidad.sql` | Equipo con PIN y aparatos del local; tiempos de los camareros con strikes; rol de contador con lectura de facturas para la contabilidad. |
| `20261118120000_cobro_por_persona.sql` | Cada quien paga su parte desde su teléfono (gift card al instante; efectivo, tarjeta o transferencia con aviso al camarero), varias facturas por cuenta y, al cobrar, los pedidos quedan servidos. |
| `20261118000000_punto_de_venta.sql` | Punto de venta: roles de cajero, camarero y cocina; cuentas abiertas por mesa; facturas; estrellas a los camareros; impresoras por internet; ingredientes, estación y agotado en los productos. |

La base del restaurante original ya tenía todo esto; su historial de migraciones quedó marcado como al día, así que el Action no vuelve a aplicarle nada.
