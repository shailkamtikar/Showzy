import math

from .types import LayoutSpec, SeatSpec, SectionSpec

STAND_NAMES = ["North", "North-East", "East", "South-East", "South", "South-West", "West", "North-West"]


def _unit(v: tuple[float, float, float]) -> tuple[float, float, float]:
    n = math.sqrt(sum(c * c for c in v)) or 1.0
    return (round(v[0] / n, 4), round(v[1] / n, 4), round(v[2] / n, 4))


def bowl(
    kind: str,
    stands: int,
    rows_per_tier: int,
    seats_per_row: int,
    field_a: float,
    field_b: float,
    vip_stand: str = "South",
    upper_tier_name: str = "Standard",
    lower_tier_name: str = "Premium",
) -> LayoutSpec:
    """Elliptical bowl around a pitch/stage (kind: 'stadium' or 'arena').

    Every stand has a Lower and an Upper tier. The VIP stand's lower tier is priced VIP.
    Seats rise with distance from the field; look vectors point at the field centre.
    """
    names = STAND_NAMES if stands == 8 else [f"Block {i + 1}" for i in range(stands)]
    row_depth = 0.95
    rise = 0.5
    tier_gap = 3.0
    sections: list[SectionSpec] = []
    order = 0
    gap_angle = math.radians(3.0)
    sector = 2 * math.pi / stands

    for k in range(stands):
        start = sector * k - sector / 2 + gap_angle / 2
        span = sector - gap_angle
        for tier_idx, tier_label in enumerate(["Lower", "Upper"]):
            if tier_idx == 0:
                tier = "VIP" if names[k] == vip_stand else lower_tier_name
            else:
                tier = upper_tier_name
            sec = SectionSpec(name=f"{names[k]} {tier_label}", tier=tier, sort_order=order)
            order += 1
            for r in range(rows_per_tier):
                d = 4.0 + tier_idx * (rows_per_tier * row_depth + tier_gap) + r * row_depth
                a = field_a + d
                b = field_b + d
                y = 0.6 + (tier_idx * (rows_per_tier * rise + 2.0)) + r * rise + d * 0.18
                for s in range(seats_per_row):
                    theta = start + span * (s + 0.5) / seats_per_row
                    x = a * math.cos(theta)
                    z = b * math.sin(theta)
                    look = _unit((-x, 1.0 - (y + 1.1), -z))
                    sec.seats.append(
                        SeatSpec(
                            row_label=str(r + 1) if tier_idx == 0 else f"U{r + 1}",
                            seat_label=str(s + 1),
                            x=round(x, 2),
                            y=round(y, 2),
                            z=round(z, 2),
                            look=look,
                            is_accessible=(r == 0 and s in (0, seats_per_row - 1) and tier_idx == 0),
                        )
                    )
            sections.append(sec)

    metadata = {
        "kind": kind,
        "field": {"a": field_a, "b": field_b},
        "stands": names[:stands],
        "rows_per_tier": rows_per_tier,
        "seats_per_row": seats_per_row,
        "eye_height": 1.1,
        "focus": "pitch" if kind == "stadium" else "stage",
        "preview_type": "geometric",
    }
    return LayoutSpec(metadata=metadata, sections=sections)
