# Ecotecplast

Sitio web corporativo de Ecotecplast, empresa especializada en aditivos para la industria del plástico con más de 20 años de experiencia.

## Stack

- **Framework:** [Astro](https://astro.build) v3
- **Estilos:** [Tailwind CSS](https://tailwindcss.com) v3
- **Contenido:** MDX con colecciones de contenido
- **Correo:** [Resend](https://resend.com)
- **Despliegue:** [Vercel](https://vercel.com) (serverless)
- **Fuentes:** Montserrat Variable via Fontsource

## Estructura

```
src/
├── components/     # Componentes reutilizables
├── content/        # Colecciones MDX (productos y procesos)
├── images/         # Imágenes optimizadas con astro:assets
├── layouts/        # Layouts de página
├── lib/            # Utilidades (Resend, etc.)
├── pages/          # Rutas del sitio
│   ├── index.astro
│   ├── aditivos.astro
│   ├── contacto.astro
│   ├── e-purge.astro
│   ├── full-master-color.astro
│   └── aviso-de-privacidad.astro
└── const.ts        # Constantes del proyecto
```

## Comandos

| Comando | Acción |
|---------|--------|
| `pnpm dev` | Inicia servidor local en `localhost:4321` |
| `pnpm build` | Compila el sitio para producción |
| `pnpm preview` | Previsualiza la build localmente |

## Variables de entorno

| Variable | Descripción |
|----------|-------------|
| `RESEND_API_KEY` | API key de Resend para envío de correos |
