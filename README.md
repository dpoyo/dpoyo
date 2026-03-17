<<<<<<< HEAD
# D'Poyo PWA — Guía de instalación completa

## ✅ Firebase ya configurado
- Proyecto: dpoyo-e0a5a
- Base de datos: southamerica-west1 (Santiago)
- Los 3 admins ya están creados en Authentication

---

## PASO 1 — Configurar reglas de seguridad en Firestore

1. Ve a console.firebase.google.com → proyecto dpoyo
2. Menú izquierdo → Firestore Database → pestaña "Reglas"
3. Borra todo el texto que aparece
4. Copia y pega el contenido del archivo `firestore.rules`
5. Toca "Publicar"

---

## PASO 2 — Crear los íconos de la app

Necesitas dos imágenes PNG con el logo de D'Poyo:
- `icons/icon-192.png` → 192 x 192 píxeles
- `icons/icon-512.png` → 512 x 512 píxeles

Cómo crearlos gratis:
1. Ve a https://favicon.io/favicon-generator/
2. O usa Canva: crea un diseño cuadrado 512x512 con tu logo
3. Guárdalos en la carpeta `icons/`

---

## PASO 3 — Subir a Vercel (gratis, 2 minutos)

1. Ve a https://vercel.com
2. Crea cuenta gratis (con el Gmail de D'Poyo)
3. Toca "Add New Project"
4. Toca "Browse" y selecciona esta carpeta (dpoyo-final)
5. Toca "Deploy"
6. En ~30 segundos tienes tu URL: https://dpoyo-xxxxx.vercel.app

---

## PASO 4 — Imprimir el QR del local

1. Ve a https://qr-code-generator.com
2. En "URL" escribe tu URL de Vercel: https://dpoyo-xxxxx.vercel.app
3. Descarga el QR en PNG
4. Imprímelo y ponlo en el mesón, en las mesas, en las bolsas

---

## Cómo usan la app

### Clientes
1. Escanean el QR impreso del local
2. Se registran con nombre, correo y WhatsApp
3. Tocan "Agregar a pantalla de inicio" → queda como app
4. En cada compra muestran su QR al cajero

### Admins
1. Entran a: https://tu-url.vercel.app/admin.html
2. Inician sesión con su correo y contraseña
   - Estado: admin.estado@dpoyo.cl
   - Huérfanos: admin.huerfanos@dpoyo.cl
   - Super: super@dpoyo.cl
3. Escanean el QR del cliente con la cámara
4. Al llegar a 7 compras → se genera el Súper Cono automáticamente

### Canjear el Súper Cono
1. El cliente muestra su QR de canje (código CANJE-XXXX)
2. El admin lo escanea → aparece "SÚPER CONO CANJEADO ✓"
3. Listo — el QR queda inutilizable

### Canjear cumpleaños
- El día del cumpleaños a las 10am el cliente recibe notificación
- Se genera un QR especial (código BDAY-XXXX)
- El admin lo escanea igual que el canje normal

---

## Panel Superadmin (super@dpoyo.cl)

Además del escaneo, el superadmin puede:
- **Campaña** → enviar mensaje a todos los clientes
- **Campaña** → editar el mensaje de cumpleaños
- **Campaña** → editar los 6 mensajes de proximidad
- **Configuración** → activar/desactivar cumpleaños con toggle
- **Configuración** → cambiar el nombre del premio
- **Configuración** → cambiar los días de validez del premio

---

## Credenciales (guárdalas en lugar seguro)

Firebase proyecto: dpoyo-e0a5a
Admin Estado:    admin.estado@dpoyo.cl    → contraseña: la que creaste
Admin Huérfanos: admin.huerfanos@dpoyo.cl → contraseña: la que creaste
Superadmin:      super@dpoyo.cl           → contraseña: la que creaste

---

## Sucursales configuradas

- Estado:    lat -33.44287311394171 / lng -70.64896774857381 / radio 200m
- Huérfanos: lat -33.439314138759556 / lng -70.6489129977881  / radio 200m

---

## ¿Preguntas?

Todo el sistema está listo para funcionar. Si necesitas ayuda con algún paso,
vuelve a la conversación con Claude y continúa desde donde quedaste.
=======
## Hi there 👋

<!--
**dpoyo/dpoyo** is a ✨ _special_ ✨ repository because its `README.md` (this file) appears on your GitHub profile.

Here are some ideas to get you started:

- 🔭 I’m currently working on ...
- 🌱 I’m currently learning ...
- 👯 I’m looking to collaborate on ...
- 🤔 I’m looking for help with ...
- 💬 Ask me about ...
- 📫 How to reach me: ...
- 😄 Pronouns: ...
- ⚡ Fun fact: ...
-->
>>>>>>> 077bb2cee9340271c9f0cc91bc1f2aae0dabc115
