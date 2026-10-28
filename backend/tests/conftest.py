import os

os.environ.setdefault("WARMUP_ON_STARTUP", "0")

import pytest
import respx

from app import config
from tests.fakes import elexon_handler


@pytest.fixture
def elexon():
    """Mocked Elexon. `elexon.calls` records every request made."""
    with respx.mock(base_url=config.ELEXON_BASE_URL, assert_all_called=False) as mock:
        mock.get(path__regex=r"/datasets/(FUELHH|WINDFOR)/stream").mock(side_effect=elexon_handler)
        yield mock


@pytest.fixture
def elexon_down():
    with respx.mock(base_url=config.ELEXON_BASE_URL, assert_all_called=False) as mock:
        mock.get(path__regex=r".*").respond(503)
        yield mock


@pytest.fixture(autouse=True)
def fast_retries(monkeypatch):
    monkeypatch.setattr(config, "ELEXON_RETRIES", 2)
    monkeypatch.setattr(config, "ELEXON_BACKOFF_S", 0)