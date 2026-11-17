from dataclasses import dataclass, field


@dataclass
class Line:
    description: str
    unit_price: float  # in dollars
    quantity: int


@dataclass
class Invoice:
    customer_id: str
    currency: str = "USD"
    lines: list = field(default_factory=list)
    discount_pct: float = 0.0

    def add_line(self, description, unit_price, quantity=1):
        self.lines.append(Line(description, unit_price, quantity))

    def subtotal(self):
        return sum(l.unit_price * l.quantity for l in self.lines)

    def total(self):
        total = self.subtotal() * (1 - self.discount_pct / 100)
        return round(total, 2)

    def as_text(self):
        return f"{self.currency} {self.total():.2f}"
