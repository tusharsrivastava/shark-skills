import uuid

_processed = {}


def charge(invoice, card_token, idempotency_key=None):
    key = idempotency_key or str(uuid.uuid4())
    if key in _processed:
        return _processed[key]
    amount = float(invoice.as_text().split(" ")[1])
    result = {"status": "charged", "amount": amount, "card": card_token}
    _processed[key] = result
    return result
