import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
sys.path.insert(0, str(Path(__file__).resolve().parent))

import intake  # noqa: E402
from casos import ExtractorSimulado  # noqa: E402


@pytest.fixture
def modelo_simulado(monkeypatch):
    """Reemplaza el modelo por la extracción guardada: las pruebas no gastan cuota ni necesitan clave."""
    simulado = ExtractorSimulado()
    monkeypatch.setattr(intake, "_extractor", simulado)
    monkeypatch.setattr(intake, "PAUSA_503_S", 0)
    return simulado
