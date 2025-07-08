# Send to W2G - Chrome Extension

Una extensión de Chrome que te permite enviar rápidamente videos de YouTube a tu sala de Watch2Gether con un solo clic.

## Características

- 🎬 Botón "Send to W2G" integrado en el reproductor de YouTube
- ⚡ Envío rápido de videos a tu sala W2G
- 🔒 API key seguro almacenado localmente
- 🎨 Interfaz minimalista que se integra con YouTube
- 📱 Compatible con el modo oscuro de YouTube
- 🖱️ Menú contextual para enlaces de YouTube

## Instalación

### Requisitos previos

1. **Cuenta de Watch2Gether**: Necesitas una cuenta en [Watch2Gether](https://w2g.tv)
2. **API Key**: Genera un API key desde tu perfil de W2G
3. **Sala W2G**: Ten una sala creada o acceso a una existente

### Pasos de instalación

1. **Clonar o descargar este repositorio**
   ```bash
   git clone https://github.com/tuusuario/youtube-to-w2g.git
   ```

2. **Preparar los íconos**
   - Los íconos PNG necesitan ser generados a partir del SVG
   - Puedes usar herramientas online como [CloudConvert](https://cloudconvert.com/svg-to-png)
   - O si tienes ImageMagick instalado:
     ```bash
     cd extension/icons
     convert -density 300 icon.svg -resize 16x16 icon-16.png
     convert -density 300 icon.svg -resize 32x32 icon-32.png
     convert -density 300 icon.svg -resize 48x48 icon-48.png
     convert -density 300 icon.svg -resize 128x128 icon-128.png
     ```

3. **Cargar la extensión en Chrome**
   - Abre Chrome y ve a `chrome://extensions/`
   - Activa el "Modo de desarrollador" (esquina superior derecha)
   - Haz clic en "Cargar extensión sin empaquetar"
   - Selecciona la carpeta `extension` de este proyecto

## Configuración

### Obtener tu API Key de W2G

1. Inicia sesión en [Watch2Gether](https://w2g.tv)
2. Haz clic en tu avatar → "Edit Profile"
3. Desplázate hasta el final de la página
4. En la sección "API Key", haz clic en "New" para generar una clave
5. Copia la clave generada (guárdala en un lugar seguro)

### Obtener el Access Key de tu sala

1. Crea o abre una sala en W2G
2. Mira la URL de la sala, será algo como:
   ```
   https://w2g.tv/en/room/?access_key=gbzifrudabr50l01gguru8
   ```
3. Copia el valor después de `access_key=` (en este ejemplo: `gbzifrudabr50l01gguru8`)

### Configurar la extensión

1. Haz clic en el ícono de la extensión en la barra de herramientas de Chrome
2. Ingresa tu API Key de W2G
3. Ingresa el Access Key de tu sala
4. Haz clic en "Test Connection" para verificar que todo funcione
5. Guarda la configuración

## Uso

### En páginas de YouTube

1. Ve a cualquier video de YouTube
2. Verás un botón verde "SEND TO W2G" en los controles del reproductor
3. Haz clic en el botón para enviar el video a tu sala W2G
4. Recibirás una notificación confirmando que el video fue agregado

### Menú contextual

1. Haz clic derecho en cualquier enlace de YouTube
2. Selecciona "Send to W2G" del menú contextual
3. El video se agregará automáticamente a tu sala

## Solución de problemas

### El botón no aparece
- Recarga la página de YouTube (F5)
- Asegúrate de estar en una página de video (`/watch`)
- Verifica que la extensión esté habilitada en `chrome://extensions/`

### Error de conexión
- Verifica que tu API key sea correcto
- Asegúrate de que el access key de la sala sea válido
- La sala debe existir y debes ser miembro de ella
- Revisa que tu cuenta W2G tenga permisos para usar la API

### Los íconos no se muestran
- Asegúrate de haber convertido el archivo SVG a PNG en todos los tamaños requeridos
- Los archivos deben estar en la carpeta `extension/icons/`

## Desarrollo

### Estructura del proyecto

```
youtube-to-w2g/
├── extension/
│   ├── manifest.json       # Configuración de la extensión
│   ├── popup.html         # UI del popup de configuración
│   ├── js/
│   │   ├── content.js     # Script que se inyecta en YouTube
│   │   ├── background.js  # Service worker para llamadas API
│   │   └── popup.js       # Lógica del popup
│   ├── css/
│   │   └── style.css      # Estilos del botón
│   └── icons/             # Íconos de la extensión
├── generate-icons.js      # Script para generar íconos
└── README.md             # Este archivo
```

### Tecnologías utilizadas

- Chrome Extensions Manifest V3
- JavaScript (ES6+)
- Chrome Storage API
- W2G API

## Seguridad

- El API key se almacena localmente usando Chrome Storage Sync
- Las llamadas a la API se realizan desde el background script, no desde las páginas web
- No se exponen credenciales en el código fuente

## Contribuciones

Las contribuciones son bienvenidas. Por favor:

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## Licencia

Este proyecto está bajo la licencia MIT. Ver el archivo `LICENSE` para más detalles.

## Agradecimientos

- [Watch2Gether](https://w2g.tv) por proporcionar la API
- La comunidad de Chrome Extensions por la documentación