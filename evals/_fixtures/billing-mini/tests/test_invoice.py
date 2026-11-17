from src.billing.invoice import Invoice


def test_subtotal():
    inv = Invoice("c1")
    inv.add_line("seat", 10.0, 3)
    assert inv.subtotal() == 30.0


def test_discount():
    inv = Invoice("c1", discount_pct=15)
    inv.add_line("seat", 0.1, 3)
    inv.add_line("addon", 0.2, 1)
    assert inv.total() == 0.43  # 0.425 rounds half up
