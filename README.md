# Mi Familia

PWA independiente para dos usuarios que comparten una sola cuenta familiar.

## Activación

1. En Supabase, abrir SQL Editor y ejecutar `supabase/schema.sql`.
2. Configurar `.env.local` con Project URL y Publishable Key.
3. Ejecutar `npm install`, `npm test` y `npm run build`.
4. Publicar la carpeta `dist` en un hosting HTTPS.

El primer usuario crea la familia. El segundo crea su propio acceso y utiliza el
código familiar. Todos los datos quedan compartidos y protegidos con políticas
RLS. El proyecto no incluye datos de demostración.
