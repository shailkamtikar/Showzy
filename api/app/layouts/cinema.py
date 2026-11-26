import math

from .types import LayoutSpec, SeatSpec, SectionSpec

SEAT_PITCH = 0.62  # metres between seat centres
ROW_PITCH = 1.0
AISLE_GAP = 1.1
FIRST_ROW_Z = 4.0  # distance from screen wall to first row


def _unit(v: tuple[float, float, float]) -> tuple[float, float, float]:
    n = math.sqrt(sum(c * c for c in v)) or 1.0
    return (round(v[0] / n, 4), round(v[1] / n, 4), round(v[2] / n, 4))


def _row_label(i: int) -> str:
    return chr(ord("A") + i)


def cinema_hall(
    rows: int,
    cols: int,
    aisle_after: int | None = None,
    rake: float = 0.28,
    screen_width: float = 12.0,
    screen_height: float = 5.0,
    premium_from: int | None = None,
    recliner_rows: int = 2,
    kind_label: str = "Standard",
) -> LayoutSpec:
    """Raked cinema hall. Screen on the plane z=0 facing +z; row A is the front row.

    Sections by row band: Front (Standard), Middle (Premium), Recliners (VIP, last rows).
    Seat look vectors point at the screen centre so the preview camera faces the screen.
    """
    premium_from = premium_from if premium_from is not None else max(2, rows // 3)
    recliner_start = rows - recliner_rows
    screen_y = 1.0 + rake * rows * 0.4 + screen_height / 2
    bands = [
        ("Front", "Standard", 0, range(0, premium_from)),
        ("Middle", "Premium", 1, range(premium_from, recliner_start)),
        ("Recliners", "VIP", 2, range(recliner_start, rows)),
    ]
    sections: list[SectionSpec] = []
    for name, tier, order, row_range in bands:
        sec = SectionSpec(name=name, tier=tier, sort_order=order)
        for r in row_range:
            z = FIRST_ROW_Z + r * ROW_PITCH
            y = 0.45 + r * rake
            for c in range(cols):
                gap = AISLE_GAP if (aisle_after is not None and c >= aisle_after) else 0.0
                x = (c - (cols - 1) / 2) * SEAT_PITCH + (gap - (AISLE_GAP if aisle_after is not None else 0) / 2)
                look = _unit((0 - x, screen_y - (y + 1.1), 0 - z))
                sec.seats.append(
                    SeatSpec(
                        row_label=_row_label(r),
                        seat_label=str(c + 1),
                        x=round(x, 2),
                        y=round(y, 2),
                        z=round(z, 2),
                        look=look,
                        seat_type="recliner" if r >= recliner_start else "standard",
                        is_accessible=(r == rows - 1 and c in (0, cols - 1)),
                    )
                )
        sections.append(sec)

    width = cols * SEAT_PITCH + (AISLE_GAP if aisle_after is not None else 0) + 3.0
    depth = FIRST_ROW_Z + rows * ROW_PITCH + 2.0
    metadata = {
        "kind": "cinema",
        "format": kind_label,
        "screen": {"width": screen_width, "height": screen_height, "y": round(screen_y, 2), "z": 0},
        "hall": {"width": round(width, 2), "depth": round(depth, 2), "rows": rows, "cols": cols, "rake": rake},
        "eye_height": 1.1,
        "preview_type": "geometric",
    }
    return LayoutSpec(metadata=metadata, sections=sections)
