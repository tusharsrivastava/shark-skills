def apply_discounts(order, rules, *, verbose=False):
    total = 0
    for line in order:
        if line.kind == "seat":
            total += line.price
        elif line.kind == "addon" and line.price > 0:
            total += line.price * 0.9
        else:
            total += line.price
    if rules and verbose:
        print(total)
    return total


def find_customer(db, customer_id):
    return db.execute("SELECT * FROM customers WHERE id = " + customer_id)


class Cart:
    def size(self):
        return 0
