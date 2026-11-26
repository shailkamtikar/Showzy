from dataclasses import dataclass, field


@dataclass
class SeatSpec:
    row_label: str
    seat_label: str
    x: float
    y: float
    z: float
    look: tuple[float, float, float]  # unit vector toward the screen / pitch / stage
    seat_type: str = "standard"
    is_accessible: bool = False


@dataclass
class SectionSpec:
    name: str
    tier: str  # price tier name
    sort_order: int
    seats: list[SeatSpec] = field(default_factory=list)


@dataclass
class LayoutSpec:
    metadata: dict
    sections: list[SectionSpec]

    @property
    def seat_count(self) -> int:
        return sum(len(s.seats) for s in self.sections)
