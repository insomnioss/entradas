# INSOMNIO Entradas

## Flujo de compra

1. La persona selecciona entradas y asistentes.
2. El formulario crea una preferencia de Checkout Pro y redirige a Mercado Pago.
3. El webhook consulta el pago directamente en Mercado Pago. Solo cuando el estado es `approved` activa los QR.
4. La página `success.html` muestra un QR personal por entrada.
5. El equipo de acceso usa `checkin.html`; una validación aprobada deja el QR marcado como utilizado.

## Configuración

1. Instala dependencias con `npm install`.
2. Copia `.env.example` como `.env` y completa `MERCADOPAGO_ACCESS_TOKEN`, `APP_BASE_URL`, `MERCADOPAGO_WEBHOOK_URL` y `CHECKIN_SECRET`.
3. Ejecuta `npm run dev`.
4. Para pruebas con Mercado Pago, usa las credenciales de prueba y cambia `MERCADOPAGO_USE_SANDBOX=true`.

Mercado Pago debe poder llegar a `MERCADOPAGO_WEBHOOK_URL`. Por eso, en producción `APP_BASE_URL` y la URL del webhook deben ser un dominio HTTPS público, no `localhost`.

## Operación

- Página de venta: `/`
- Resultado y QR: `/success.html?order_id=...` (se abre automáticamente al volver de Mercado Pago)
- Validación de acceso: `/checkin.html`

Los pedidos se almacenan en `data/orders.json`. Ese archivo queda fuera de Git porque contiene datos personales y códigos de entrada. Para un evento real con alto volumen, conviene reemplazarlo por una base de datos persistente antes de desplegar.
