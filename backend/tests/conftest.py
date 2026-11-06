import pytest

import service


@pytest.fixture(autouse=True)
def keep_each_contents_line(monkeypatch):
    """Page tests stay about finding pages. Grouping is covered on its own."""

    def each_line(chapters):
        return [{"title": chapter["title"], "lines": [index]} for index, chapter in enumerate(chapters)]

    monkeypatch.setattr(service, "_ask_chapter_groups", each_line)
