"""Workflow de intake para Plunet con LangGraph (ruta B del curso: workflow, no agente).

Cuatro nodos en un único orden, siempre los mismos:

    extraer   una sola llamada al modelo con salida estructurada (SolicitudTraduccion de datos.py)
    validar   código: solo cuentan las citas que existen literalmente en la entrada, umbrales, ISO y locale,
              fechas, cliente por dominio y contrato
    derivar   código: estado pendiente_revision / cola_manual / fuera_de_alcance y borrador del Request
    estimar   código: conteo preliminar de palabras y plazo estimado contra la fecha pedida (estimacion.py)

El modelo no elige pasos ni tiene herramientas: propone valores con su cita y el código decide. Nada se escribe en
Plunet: el PM revisa el borrador y es quien crea el Request.

app.py llama a ejecutar_intake(mensaje) y recibe un diccionario; contrato.py le da la forma final.
"""
from __future__ import annotations

import asyncio
import os
import re
import unicodedata
from datetime import date, datetime
from typing import Any, Optional, TypedDict

import openai
from langgraph.graph import END, START, StateGraph

from contrato import ErrorContrato
from estimacion import estimar, fecha, volumen_de_adjuntos, volumen_de_texto
from datos import (CAMPOS_CLAVE, CAMPOS_DEL_PEDIDO, CLIENTES, CLIENTES_POR_DOMINIO, CONFIANZA_DOMINIO, CONFIANZA_RAZON_SOCIAL,
                   DOMINIOS_PUBLICOS, IDIOMAS_ISO, MAPEO_PLUNET, MODEL_ID, MODELOS_ID_RESPALDO, SYSTEM_PROMPT, UMBRAL_CAMPO,
                   UMBRAL_GLOBAL, SolicitudTraduccion)

# ----------------------------------------------------------------------------- EDITA AQUÍ
OPENROUTER_URL = os.getenv("OPENROUTER_BASE_URL", "").strip() or "https://openrouter.ai/api/v1"
MODELO = os.getenv("MODEL_ID", "").strip() or MODEL_ID   # se puede cambiar desde las variables de Vercel
# Si el principal falla por el proveedor (saturado, caído, sin respuesta), se prueban estos en orden.
# En Vercel: MODEL_ID_RESPALDO con ids separados por coma; «ninguno» desactiva el respaldo.
_respaldo_env = os.getenv("MODEL_ID_RESPALDO", "").strip()
MODELOS_RESPALDO = [] if _respaldo_env.lower() in ("ninguno", "none") else [
    m.strip() for m in (_respaldo_env.split(",") if _respaldo_env else MODELOS_ID_RESPALDO)
    if m.strip() and m.strip() != MODELO]
ESPERA_MODELO_S = 60       # cuánto espera la llamada al modelo antes de rendirse
INTENTOS_503 = 2           # el endpoint gratuito devuelve 503 «provider overloaded» de forma intermitente
PAUSA_503_S = 5
INTENTOS_ESQUEMA = 2       # a veces el modelo devuelve un campo fuera del esquema: se repite la llamada una vez
# -----------------------------------------------------------------------------------------


class Estado(TypedDict, total=False):
    entrada: str
    solicitud: dict
    campos: dict
    confianza_por_campo: dict
    campos_baja_confianza: list
    evidencia: list
    score_global: float
    archivos: list
    estado: str
    razon: str
    alerta: str
    request_plunet: Optional[dict]
    escrituras_plunet: int
    pasos: list
    llamadas: int
    modelo_usado: str
    adjuntos_meta: Optional[list]   # adjuntos de la bandeja con su conteo de palabras; None si el correo se pegó
    volumen: Optional[dict]
    estimacion: Optional[dict]


# ----------------------------------------------------------------------------- utilidades
def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKC", s or "").lower()
    return re.sub(r"\s+", " ", s).strip(" .\"'«»“”")


def _cabecera(entrada: str, nombre: str) -> Optional[str]:
    m = re.search(rf"^{nombre}:\s*(.+)$", entrada, flags=re.MULTILINE)
    return m.group(1).strip() if m else None


_ADJUNTO = re.compile(r"^---\s*Adjunto:.*$", re.MULTILINE)   # el cuerpo del correo termina en la primera marca
_LOCALE = re.compile(r"^([a-z]{2})(?:[-_]([a-z]{2}))?$")


def normalizar_idioma(valor: Any, con_region: bool) -> Optional[str]:
    """«ES_mx» → «es-MX»; «pt» → «pt». Devuelve None si no es un código ISO 639-1 conocido."""
    m = _LOCALE.match(str(valor or "").strip().lower())
    if not m or m.group(1) not in IDIOMAS_ISO:
        return None
    if con_region and m.group(2):
        return f"{m.group(1)}-{m.group(2).upper()}"
    return m.group(1)


def listar_adjuntos(entrada: str) -> list[dict]:
    """archivos[] del contrato: se lee de las marcas «--- Adjunto: nombre (detalle) ---», sin modelo."""
    archivos = []
    for m in re.finditer(r"^---\s*Adjunto:\s*(.+?)\s*(?:\((.*?)\))?\s*---\s*$", entrada, flags=re.MULTILINE):
        archivos.append({"nombre": m.group(1).strip(), "detalle": (m.group(2) or "").strip()})
    return archivos


# ----------------------------------------------------------------------------- el modelo
_extractor = None                         # modelo principal
_extractores_respaldo: dict[str, Any] = {}   # un cliente por modelo de respaldo


def _crear_extractor(modelo: str):
    from langchain_openai import ChatOpenAI
    llm = ChatOpenAI(
        model=modelo,
        base_url=OPENROUTER_URL,
        api_key=os.environ["OPENROUTER_API_KEY"].strip(),   # un salto de línea pegado en Vercel invalida la cabecera
        temperature=0,
        max_tokens=4096,
        timeout=ESPERA_MODELO_S,
        max_retries=1,
    )
    # include_raw: un error de esquema vuelve como dato (parsing_error) y no como excepción, para poder reintentar
    return llm.with_structured_output(SolicitudTraduccion, method="function_calling", include_raw=True)


def obtener_extractor():
    """Crea el cliente la primera vez y lo reutiliza mientras la instancia de Vercel siga viva."""
    global _extractor
    if _extractor is None:
        _extractor = _crear_extractor(MODELO)
    return _extractor


def obtener_extractor_respaldo(modelo: str):
    if modelo not in _extractores_respaldo:
        _extractores_respaldo[modelo] = _crear_extractor(modelo)
    return _extractores_respaldo[modelo]


def _falla_del_proveedor(e: Exception) -> bool:
    """Fallas en las que otro modelo puede responder: saturación, caída, modelo retirado, límite del proveedor,
    tiempo agotado o conexión. Un error de clave (401/403) no cambia con otro modelo."""
    if isinstance(e, (openai.APITimeoutError, openai.APIConnectionError, openai.RateLimitError)):
        return True
    if isinstance(e, openai.APIStatusError):
        return e.status_code in (404, 408, 429) or e.status_code >= 500
    texto = str(e)
    return "503" in texto or "Upstream" in texto or "overloaded" in texto.lower()


def _motivo(e: Exception) -> str:
    return type(e).__name__ + (f" {e.status_code}" if isinstance(e, openai.APIStatusError) else "")


async def _invocar_con_respaldo(mensajes: list) -> tuple[dict, str, int, str]:
    """Devuelve (salida, modelo que respondió, llamadas hechas, motivo del cambio de modelo o '').
    Prueba el principal y, si falla por el proveedor, cada respaldo en orden. Si todos fallan, lanza la última falla."""
    try:
        return await obtener_extractor().ainvoke(mensajes), MODELO, 1, ""
    except Exception as e:  # noqa: BLE001
        if not MODELOS_RESPALDO or not _falla_del_proveedor(e):
            raise
        motivos = [f"{MODELO}: {_motivo(e)}"]
        ultima = e
    for i, modelo in enumerate(MODELOS_RESPALDO):
        try:
            salida = await obtener_extractor_respaldo(modelo).ainvoke(mensajes)
            return salida, modelo, i + 2, "; ".join(motivos)
        except Exception as e:  # noqa: BLE001
            if not _falla_del_proveedor(e):
                raise
            motivos.append(f"{modelo}: {_motivo(e)}")
            ultima = e
    raise ultima


def _donde_fallo(error: Any) -> str:
    """Qué campo no cumplió el esquema, sin copiar el valor (puede traer datos del correo)."""
    errores = error.errors() if hasattr(error, "errors") else []
    if errores:
        e = errores[0]
        return f"{'.'.join(str(x) for x in e.get('loc', ())) or 'salida'}: {e.get('type', '')}"
    return type(error).__name__


# ----------------------------------------------------------------------------- nodos
async def extraer(r: Estado) -> dict:
    mensajes = [("system", SYSTEM_PROMPT), ("human", r["entrada"])]
    llamadas, modelo, motivo = 0, MODELO, ""
    for intento in range(1, INTENTOS_ESQUEMA + 1):
        salida, modelo, n, motivo = await _invocar_con_respaldo(mensajes)
        llamadas += n
        s, error = salida.get("parsed"), salida.get("parsing_error")
        if s is not None and error is None:
            break
        if intento == INTENTOS_ESQUEMA:
            raise ErrorContrato("backend", "El modelo devolvió campos fuera del contrato.", 502,
                                _donde_fallo(error) if error else "salida estructurada vacía", True)
    s = s.model_dump() if hasattr(s, "model_dump") else dict(s)
    propuestos = sum(1 for k in ("idioma_origen", "tipo_documento", "servicio", "deadline_solicitado", "notas_cliente")
                     if s.get(k)) + (1 if s.get("idiomas_destino") else 0)
    paso = {"tipo": "paso", "nombre": "extraer",
            "detalle": f"modelo → {propuestos} campos propuestos, {len(s.get('evidencia') or [])} citas"
                       + (" (reintento: la 1.ª salida no cumplió el esquema)" if intento > 1 else "")
                       + (f" · respondió el modelo de respaldo {modelo} porque el principal falló ({motivo})" if motivo else "")}
    return {"solicitud": s, "pasos": [paso], "llamadas": llamadas, "modelo_usado": modelo}


def _identificar_cliente(entrada: str, nombre_propuesto: Optional[str]) -> tuple[Optional[dict], float, str, str]:
    """Devuelve (cliente, confianza, cómo se identificó, alerta). Sin modelo."""
    remitente = _cabecera(entrada, "De") or ""
    dominio = remitente.rsplit("@", 1)[-1].strip(" >").lower() if "@" in remitente else ""
    cliente = CLIENTES_POR_DOMINIO.get(dominio)
    if cliente:
        return cliente, CONFIANZA_DOMINIO, f"dominio {dominio} → {cliente['cliente_id']}", ""
    candidato = None
    if nombre_propuesto:
        candidato = next((c for c in CLIENTES if _norm(c["razon_social"]) == _norm(nombre_propuesto)), None)
    if candidato:
        origen = "de dominio público" if dominio in DOMINIOS_PUBLICOS else f"de un dominio no registrado ({dominio or 'sin dominio'})"
        alerta = (f"Posible cliente {candidato['razon_social']} ({candidato['cliente_id']}) solo por razón social; "
                  f"el remitente es {origen}. El PM debe confirmarlo.")
        return candidato, CONFIANZA_RAZON_SOCIAL, f"razón social → posible {candidato['cliente_id']} (sin dominio registrado)", alerta
    return None, 0.0, f"dominio {dominio or '—'} sin cliente registrado", ""


def validar(r: Estado) -> dict:
    s, entrada = r["solicitud"], r["entrada"]
    texto_norm = _norm(entrada)
    # 1. Evidencia: solo cuentan las citas que existen literalmente en la entrada.
    propuestas = [e for e in (s.get("evidencia") or []) if isinstance(e, dict)]
    evidencia = [e for e in propuestas if e.get("fragmento") and _norm(e["fragmento"]) in texto_norm]
    # 1b. Los datos del pedido (idiomas destino, fecha, servicio) los pide el cliente en el cuerpo del correo; un
    #     adjunto es el documento a traducir. Una cita que solo está en un adjunto no los respalda: se comprueba dónde
    #     aparece el texto, sin confiar en la «fuente» que declara el modelo (prueba de seguridad 6).
    cuerpo_norm = _norm(_ADJUNTO.split(entrada, maxsplit=1)[0])
    solo_en_adjunto = sorted({e["campo"] for e in evidencia
                              if e["campo"] in CAMPOS_DEL_PEDIDO and _norm(e["fragmento"]) not in cuerpo_norm})
    conf: dict[str, float] = {}
    for e in evidencia:
        if e["campo"] in CAMPOS_DEL_PEDIDO and _norm(e["fragmento"]) not in cuerpo_norm:
            continue
        conf[e["campo"]] = max(conf.get(e["campo"], 0.0), float(e.get("confianza") or 0.0))
    campos: dict[str, Any] = {}
    baja: list[str] = []
    # 2. Campos que propone el LLM: sin cita válida o bajo el umbral, quedan null.
    for campo in ["idioma_origen", "idiomas_destino", "tipo_documento", "servicio", "deadline_solicitado", "notas_cliente"]:
        valor = s.get(campo)
        if campo == "idioma_origen" and valor:
            valor = normalizar_idioma(valor, con_region=False)
        if campo == "idiomas_destino":
            valor = sorted({v for v in (normalizar_idioma(x, con_region=True) for x in (valor or [])) if v})
        if campo == "deadline_solicitado" and valor:
            try:
                recibido = datetime.strptime((_cabecera(entrada, "Fecha") or "")[:10], "%Y-%m-%d").date()
                valor = valor if date.fromisoformat(valor) >= recibido else None
            except (TypeError, ValueError):
                valor = None
        vacio = valor in (None, [], "")
        if vacio or conf.get(campo, 0.0) < UMBRAL_CAMPO:
            campos[campo] = [] if campo == "idiomas_destino" else None
            conf[campo] = 0.0 if vacio else conf.get(campo, 0.0)
            if campo != "notas_cliente":
                baja.append(campo)
        else:
            campos[campo] = valor
    # 3. Cliente por reglas (sin LLM): dominio del remitente; la razón social sola no alcanza el umbral.
    cliente, conf["cliente_id"], como_cliente, alerta = _identificar_cliente(entrada, s.get("cliente_nombre"))
    aceptado = cliente is not None and conf["cliente_id"] >= UMBRAL_CAMPO
    campos["cliente_id"] = cliente["cliente_id"] if aceptado else None
    campos["cliente_nombre"] = cliente["razon_social"] if aceptado else s.get("cliente_nombre")
    if not aceptado:
        baja.append("cliente_id")
    # 4. Contrato: solo se asigna si el cliente tiene exactamente un contrato activo.
    contratos = cliente["contratos_activos"] if aceptado else []
    campos["contrato_id"] = contratos[0] if len(contratos) == 1 else None
    if campos["contrato_id"] is None:
        baja.append("contrato_id")
    if solo_en_adjunto:
        nombres = {"idiomas_destino": "idiomas destino", "deadline_solicitado": "fecha de entrega", "servicio": "servicio"}
        varios = len(solo_en_adjunto) > 1
        aviso = (f"{' y '.join(nombres[c] for c in solo_en_adjunto).capitalize()}: "
                 f"{'solo aparecen' if varios else 'solo aparece'} en un adjunto, no en el correo del cliente. "
                 f"{'No se prellenan' if varios else 'No se prellena'}; el PM debe confirmarlo con el cliente.")
        alerta = f"{alerta} {aviso}".strip()
    score = round(sum(conf.get(c, 0.0) if campos[c] not in (None, []) else 0.0 for c in CAMPOS_CLAVE) / len(CAMPOS_CLAVE), 2)
    paso = {"tipo": "paso", "nombre": "validar",
            "detalle": f"citas literales {len(evidencia)} de {len(propuestas)} · cliente: {como_cliente} · "
                       + (f"solo en adjunto: {', '.join(solo_en_adjunto)} · " if solo_en_adjunto else "")
                       + f"{len(baja)} {'campo' if len(baja) == 1 else 'campos'} para revisar"}
    return {"campos": campos, "confianza_por_campo": {k: round(v, 2) for k, v in conf.items()},
            "campos_baja_confianza": baja, "evidencia": evidencia, "score_global": score,
            "archivos": listar_adjuntos(entrada), "alerta": alerta, "pasos": r.get("pasos", []) + [paso]}


def derivar(r: Estado) -> dict:
    s = r["solicitud"]
    base = {"request_plunet": None, "escrituras_plunet": 0}   # el MVP nunca escribe en Plunet
    if not s.get("es_solicitud_nueva"):
        estado, razon = "fuera_de_alcance", s.get("motivo_no_solicitud") or "No es una solicitud nueva"
    elif r["score_global"] < UMBRAL_GLOBAL:
        estado, razon = "cola_manual", f"score_global {r['score_global']} < {UMBRAL_GLOBAL}: no se prellena"
    else:
        estado = "pendiente_revision"
        base["request_plunet"] = {MAPEO_PLUNET[k]: r["campos"][k] for k in MAPEO_PLUNET}
        base["request_plunet"]["estado"] = "borrador_pendiente_confirmacion_PM"
        razon = f"score_global {r['score_global']}; revisar: {', '.join(r['campos_baja_confianza']) or 'ninguno'}"
    paso = {"tipo": "paso", "nombre": "derivar", "detalle": f"regla → {estado} (score {r['score_global']})"}
    return {**base, "estado": estado, "razon": razon, "pasos": r.get("pasos", []) + [paso]}


def estimar_volumen_y_plazo(r: Estado) -> dict:
    """Conteo preliminar de palabras y plazo estimado (estimacion.py). Sin modelo."""
    volumen = (volumen_de_adjuntos(r["adjuntos_meta"]) if r.get("adjuntos_meta") is not None
               else volumen_de_texto(r["entrada"]))
    campos = r["campos"]
    plazo = None
    if r["estado"] == "pendiente_revision":
        plazo = estimar(volumen, campos.get("servicio"), len(campos.get("idiomas_destino") or []),
                        fecha(_cabecera(r["entrada"], "Fecha")), fecha(campos.get("deadline_solicitado")))
    request = r.get("request_plunet")
    if request is not None:
        request = {**request, "wordCount": volumen["palabras"] if volumen else None}
    if not volumen:
        detalle = "sin adjuntos: no hay palabras que contar"
    else:
        detalle = f"{volumen['palabras']:,} palabras".replace(",", ".")
        detalle += (f" · {plazo['dias_habiles']} días hábiles · {plazo['semaforo'].replace('_', ' ')}" if plazo
                    else " · plazo: faltan servicio o idiomas")
    paso = {"tipo": "paso", "nombre": "estimar", "detalle": detalle}
    return {"volumen": volumen, "estimacion": plazo, "request_plunet": request, "pasos": r.get("pasos", []) + [paso]}


def construir_workflow():
    grafo = StateGraph(Estado)
    grafo.add_node("extraer", extraer)
    grafo.add_node("validar", validar)
    grafo.add_node("derivar", derivar)
    grafo.add_node("estimar", estimar_volumen_y_plazo)
    grafo.add_edge(START, "extraer")
    grafo.add_edge("extraer", "validar")
    grafo.add_edge("validar", "derivar")
    grafo.add_edge("derivar", "estimar")
    grafo.add_edge("estimar", END)
    return grafo.compile()


workflow = construir_workflow()


# ----------------------------------------------------------------------------- entrada desde app.py
def _es_503(e: Exception) -> bool:
    return (isinstance(e, openai.APIStatusError) and e.status_code == 503) or "503" in str(e)


async def ejecutar_intake(mensaje: str, adjuntos: Optional[list] = None) -> dict[str, Any]:
    llamadas = 0   # intentos fallidos por 503; las llamadas del intento que funciona las cuenta extraer
    for intento in range(INTENTOS_503):
        try:
            r = await workflow.ainvoke({"entrada": mensaje, "adjuntos_meta": adjuntos})
            llamadas += r.get("llamadas", 1)
            break
        except Exception as e:  # noqa: BLE001
            if _es_503(e) and intento < INTENTOS_503 - 1:
                llamadas += 1
                await asyncio.sleep(PAUSA_503_S)
                continue
            raise traducir_error(e) from None
    claves = ("estado", "razon", "alerta", "score_global", "campos", "confianza_por_campo", "campos_baja_confianza",
              "evidencia", "archivos", "request_plunet", "escrituras_plunet", "pasos", "volumen", "estimacion")
    fecha_correo = fecha(_cabecera(mensaje, "Fecha"))
    return {**{k: r.get(k) for k in claves}, "fecha_correo": fecha_correo.isoformat() if fecha_correo else None,
            "modelo": r.get("modelo_usado") or MODELO, "llamadas_modelo": llamadas}


def traducir_error(e: Exception) -> ErrorContrato:
    """Convierte las excepciones de OpenRouter / LangChain en errores del contrato (la pantalla sabe explicarlos)."""
    if isinstance(e, ErrorContrato):
        return e
    if isinstance(e, openai.RateLimitError):
        return ErrorContrato("cuota_ia", "El modelo gratuito alcanzó su límite de uso.", 502, "OpenRouter respondió 429", True)
    if isinstance(e, (openai.AuthenticationError, openai.PermissionDeniedError)):
        return ErrorContrato("backend", "OpenRouter rechazó la clave: revisa OPENROUTER_API_KEY en Vercel.", 502,
                             f"OpenRouter respondió {e.status_code}")
    if isinstance(e, openai.APITimeoutError):
        return ErrorContrato("timeout", "El modelo tardó demasiado en responder.", 504, f"sin respuesta en {ESPERA_MODELO_S} s", True)
    if isinstance(e, openai.APIConnectionError):
        return ErrorContrato("backend", "No se pudo conectar con OpenRouter.", 502, type(e).__name__, True)
    if isinstance(e, openai.APIStatusError):
        pista = (str(e.message) if getattr(e, "message", None) else "")[:100]
        return ErrorContrato("backend", "El modelo respondió con un error.", 502,
                             f"OpenRouter respondió {e.status_code} · {pista}".strip(" ·"), e.status_code >= 500)
    if _es_503(e):
        return ErrorContrato("backend", "El proveedor del modelo está saturado (503).", 502, "provider overloaded", True)
    return ErrorContrato("backend", "El workflow falló.", 500, type(e).__name__)
