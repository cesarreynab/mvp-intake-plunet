# Intake de solicitudes en Plunet · MVP

Asistente que **prellena el Request de Plunet BusinessManager** a partir del correo de una solicitud de traducción y de sus adjuntos. Cada campo llega con la cita del correo que lo respalda; lo que no tiene respaldo queda vacío y marcado para revisión, y el Request se crea solo cuando el Project Manager confirma.

Proyecto Final AI · BSG Institute · César Reyna · octubre de 2026. Caso: operaciones de una empresa de servicios lingüísticos de ciencias de la vida (LILT). **Todos los correos, personas, empresas y documentos son ficticios.**

**Demo en vivo:** https://mvp-intake-plunet.vercel.app (pide un código de acceso, que entrego por separado).
**Sin código ni cuota:** https://mvp-intake-plunet.vercel.app/?demo=1 muestra respuestas guardadas.

## Qué hace

1. El PM ve la bandeja simulada de `projects@lilt.com` (9 correos con adjuntos PDF, DOCX, XLSX y PPTX) y abre uno.
2. Pulsa **Prellenar Request**. En 5 a 40 segundos el sistema propone cliente, contrato, idioma origen, idiomas destino (con variante: `es-MX`, `pt-BR`), servicio, tipo de documento, fecha de entrega y notas.
3. Cada campo muestra su origen: **Citado** (frase literal del correo o del adjunto), **Por regla** (cliente por dominio, contrato único) o **Revisar** (sin respaldo suficiente).
4. Cuenta las palabras de los adjuntos y estima el plazo en días hábiles, con un semáforo contra la fecha que pidió el cliente: *alcanza*, *ajustado* o *no alcanza*.
5. El PM corrige y confirma. Recién ahí se crea el Request en un **Plunet sandbox**, que valida los datos y devuelve un número, pero no escribe en un Plunet real.

Si la evidencia no alcanza, el correo va a **cola manual**. Si no es una solicitud nueva (pide un precio o una factura, o modifica un proyecto abierto), queda **fuera de alcance** y no se crea nada.

## Cómo funciona

Un workflow fijo de cuatro pasos (ruta B del curso: workflow, no agente). Solo el primero usa el modelo, con una única llamada por correo.

```
correo + adjuntos ─► extraer ─► validar ─► derivar ─► estimar ─► borrador ─► PM confirma ─► Plunet (sandbox)
                     modelo     reglas     reglas     reglas
```

| Paso | Qué hace | Archivo |
|---|---|---|
| extraer | Una llamada al modelo con salida estructurada: propone cada valor con su cita | `intake.py`, `datos.py` |
| validar | Acepta solo citas que aparecen literalmente en el correo; los datos del pedido (idiomas, fecha, servicio) deben estar en el cuerpo, no en un adjunto; umbral de confianza 0.75; cliente por dominio del remitente; contrato solo si hay uno activo; idiomas y fechas válidos | `intake.py` |
| derivar | Estado: `pendiente_revision`, `cola_manual` (score < 0.60) o `fuera_de_alcance` | `intake.py` |
| estimar | Conteo preliminar de palabras y plazo según rendimientos declarados (supuestos editables) | `estimacion.py` |

El navegador nunca habla con el modelo: habla con un proxy (`app.py`) que guarda la clave, exige el código de acceso, limita las consultas por minuto, valida la entrada y devuelve siempre la misma forma de respuesta (`contrato.py`, versión `1.0-plunet`).

## Por qué este stack

| Pieza | Por qué |
|---|---|
| **LangChain** | Salida estructurada con la forma exacta del contrato (`with_structured_output`) y un cliente que funciona con cualquier modelo compatible con OpenAI. |
| **LangGraph** | El workflow como un grafo explícito de pasos pequeños, que se prueban por separado. |
| **Pydantic** | El contrato de extracción: campos, tipos y valores permitidos. |
| **OpenRouter + NVIDIA Nemotron 3 Ultra (gratuito)** | El modelo común del curso, con costo USD 0. Si falla por el proveedor (saturado, caído, sin respuesta), el sistema reintenta solo con un modelo de respaldo, **Nemotron 3.5 Super**, elegido por prueba: 4 de 4 casos con el principal caído. Ambos se cambian con variables (`MODEL_ID`, `MODEL_ID_RESPALDO`), sin tocar el código. |
| **FastAPI en Vercel** | Proxy pequeño en una función sin servidor propio; dirección pública en el plan gratuito y publicación con cada `git push`. |
| **HTML y JavaScript sin frameworks** | Pantalla liviana y fácil de auditar. Todo texto del correo o del modelo entra como texto, nunca como código (`textContent`). |

## Estructura

```
app.py            proxy FastAPI: rutas, código de acceso, límites, errores
intake.py         workflow LangGraph: extraer → validar → derivar → estimar
contrato.py       contrato 1.0-plunet entre la pantalla y el servidor
datos.py          contrato de extracción, prompt, clientes, bandeja simulada, umbrales y rendimientos
estimacion.py     conteo de palabras y plazo en días hábiles
plunet.py         Plunet sandbox: valida y crea el Request confirmado por el PM
public/           pantalla (index.html, app.js, config.js, estilos.css)
tests/            75 pruebas pytest con un modelo simulado (no gastan cuota)
herramientas/     probar_endpoint.py: prueba un despliegue con los casos del proyecto
```

## Rutas del servidor

| Ruta | Para qué |
|---|---|
| `GET /api/health` | Estado del servicio; no revela secretos |
| `GET /api/bandeja` | Los 9 correos ficticios y la tabla de clientes |
| `POST /api/intake` | Prellena el Request de un correo de la bandeja (`message_id`) o de uno pegado (`mensaje`) |
| `POST /api/estimacion` | Recalcula volumen y plazo cuando el PM edita el borrador (sin modelo) |
| `POST /api/plunet/requests` | Crea en el sandbox el Request que el PM confirmó (sin modelo) |

## Correrlo en local

Requiere Python 3.12 o superior y una clave de OpenRouter (https://openrouter.ai/keys).

```
python -m venv .venv
.venv\Scripts\activate            # Windows · en macOS o Linux: source .venv/bin/activate
pip install -r requirements-local.txt
copy .env.example .env            # en macOS o Linux: cp .env.example .env · luego pega la clave en .env
python -m uvicorn app:app --env-file .env --port 8010
```

Abre http://localhost:8010. Variables opcionales en `.env.example`: `ACCESS_CODE`, `MAX_POR_MINUTO`, `MODEL_ID` y `MODEL_ID_RESPALDO` (ids separados por coma, o `ninguno`).

## Pruebas

```
python -m pytest tests                                                    # 75 pruebas, sin clave ni cuota
python herramientas/probar_endpoint.py https://mvp-intake-plunet.vercel.app --codigo-acceso CODIGO --pausa 3
python herramientas/probar_endpoint.py https://mvp-intake-plunet.vercel.app --codigo-acceso CODIGO --bandeja --pausa 3
```

La primera línea ejecuta las pruebas de las reglas, del contrato, del plazo y de la seguridad del proxy. La segunda envía los casos P1 a P4 del proyecto (4 llamadas al modelo); la tercera, los 9 correos de la bandeja (9 llamadas). El modelo gratuito admite 50 llamadas por día.

## Límites del MVP

- La bandeja es simulada: en producción, el buzón se leería con Microsoft Graph y el texto de los adjuntos se extraería con pypdf, python-docx, openpyxl y python-pptx (OCR para escaneados).
- Plunet es un sandbox: en producción, el Request se crearía por la API de Plunet con un usuario técnico, siempre después de la confirmación del PM.
- El progreso de la bandeja se guarda en el navegador, no en una base de datos.
- El conteo de palabras es preliminar y los rendimientos del plazo son supuestos; el análisis oficial es el de memoQ. El sistema no cotiza.
- La confianza la informa el modelo; falta calibrarla con un set de correos etiquetados.
