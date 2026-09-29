"""Build past pay periods (the budget's `history`) from a bank statement CSV.

Usage:
    python3 tools/backfill.py backfill.json statement.csv history.json

- backfill.json: your rules (start from tools/backfill.example.json).
- statement.csv: a Revolut statement export (CSV). Other banks work if you map their columns in
  "columns" (see the example config).
- history.json: written here; paste it into the budget document's `history` field.

Each period runs from the day before one payday to the day before the next, and every period must
print "gap 0.00" (opening + income - expenses = closing balance). A non-zero gap means a
transaction was dropped or double counted.

Classification, in order:
1. A transfer from your partner worth HALF of one of your purchases (to the penny, from 3 days before
   to 60 days after it) is their share of that purchase: a negative item in the purchase's group.
2. Money back from friends for a split bill ("split_bills") is negative discretionary spending.
3. Card refunds reduce the group the original purchase belongs to.
4. Other money in is income ("income_rules"; anything unmatched goes to "Other income").
5. Money out matching "bill_rules" or "subscriptions" is a planned bill; everything else is discretionary.
"""
import csv, json, re, sys
from collections import OrderedDict
from datetime import date, timedelta

if len(sys.argv) < 4:
    sys.exit(__doc__)
CFG = json.load(open(sys.argv[1]))
COL = {'state': 'State', 'completed': 'Completed Date', 'started': 'Started Date', 'description': 'Description',
       'amount': 'Amount', 'fee': 'Fee', 'type': 'Type', 'balance': 'Balance', 'completed_value': 'COMPLETED'}
COL.update(CFG.get('columns', {}))
MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
         'November', 'December']

rows = []
for r in csv.DictReader(open(sys.argv[2], encoding='utf-8-sig')):
    if COL['state'] in r and r[COL['state']] != COL['completed_value']:
        continue
    fee = float(r.get(COL['fee']) or 0)
    r['net'] = round(float(r[COL['amount']]) - fee, 2)
    r['day'] = r[COL['completed']][:10]
    r['started'] = (r.get(COL['started']) or r[COL['completed']])[:10]
    r['desc'] = re.sub(r'\s+', ' ', r[COL['description']]).strip()
    r['type'] = r.get(COL['type'], '')
    rows.append(r)
rows.sort(key=lambda r: r['day'])
IGNORE = [re.compile(p, re.I) for p in CFG.get('ignore', [])]
PARTNER = CFG.get('partner') or {}
P_MATCH = PARTNER.get('match', '').upper()
SELF = CFG.get('self_match', '').upper()

def is_partner(desc):
    return bool(P_MATCH) and P_MATCH in desc.upper()

def income(r):
    for rule in CFG.get('income_rules', []):
        if re.search(rule['match'], r['desc'], re.I) and r['net'] >= rule.get('min', 0):
            return rule['group'], rule['name'].replace('{month}', MONTH[int(r['day'][5:7]) - 1])
    if is_partner(r['desc']):
        if SELF and SELF in r['desc'].upper():
            return PARTNER.get('income_group', 'Partner'), 'From joint account'
        return PARTNER.get('income_group', 'Partner'), PARTNER.get('income_name', 'From partner')
    return 'Other income', re.sub(r'^Payment From ', 'From ', r['desc'].title())

def expense(r):
    d = r['desc']
    for rule in CFG.get('bill_rules', []):
        if re.search(rule['match'], d, re.I):
            return rule['group'], rule['name'], False
    if is_partner(d):
        return PARTNER.get('to_group', 'Transfers to partner'), PARTNER.get('to_name', 'To partner'), False
    if d in CFG.get('subscriptions', {}):
        return 'Subscriptions', CFG['subscriptions'][d], False
    name = re.sub(r'^To ', '', d)
    return 'Discretionary', CFG.get('renames', {}).get(name, name), True

def match_halves(rows):
    """Partner transfers worth half of one of your purchases: their share of it."""
    if not P_MATCH:
        return {}
    debits = [r for r in rows if r['net'] < 0 and not is_partner(r['desc'])]
    credits = [r for r in rows if r['net'] > 0 and is_partner(r['desc']) and not (SELF and SELF in r['desc'].upper())]
    used, out = set(), {}
    for c in credits:
        cd = date.fromisoformat(c['day'])
        cands = [d for d in debits if id(d) not in used and abs(-d['net'] / 2 - c['net']) <= 0.0151
                 and -3 <= (cd - date.fromisoformat(d['started'])).days <= 60]
        if cands:
            best = min(cands, key=lambda d: abs((cd - date.fromisoformat(d['started'])).days))
            used.add(id(best))
            out[id(c)] = best
    return out

HALVES = match_halves(rows)

def classify(r):
    if id(r) in HALVES:
        g, _, disc = expense(HALVES[id(r)])
        return 'out', g, PARTNER.get('share_name', "Partner's share (split bills)"), disc
    for who, name in CFG.get('split_bills', {}).items():
        if who.upper() in r['desc'].upper() and r['net'] > 0:
            return 'out', 'Discretionary', name, True
    if r['net'] > 0 and (r['type'] in ('Card Refund', 'Rev Payment Refund') or r['desc'].startswith('Refund from')):
        g, name, disc = expense(r)
        return 'out', g, name, disc
    if r['net'] > 0:
        g, name = income(r)
        return 'in', g, name, False
    g, name, disc = expense(r)
    return 'out', g, name, disc

def balance_at_end_of(day):
    bal = float(rows[0][COL['balance']]) - rows[0]['net']
    for r in rows:
        if r['day'] <= day:
            bal = float(r[COL['balance']])
        else:
            break
    return round(bal, 2)

def build(start, end):
    """Items completed after `start` up to and including `end` (ISO dates)."""
    inc, exp = OrderedDict(), OrderedDict()
    for r in rows:
        if not (start < r['day'] <= end) or any(p.search(r['desc']) for p in IGNORE):
            continue
        side, g, name, disc = classify(r)
        target = inc if side == 'in' else exp
        grp = target.setdefault(g, {'group': g, 'items': OrderedDict(), 'discretionary': disc})
        it = grp['items'].setdefault(name, {'name': name, 'amount': 0.0, 'count': 0, 'done': True, 'due': r['day']})
        it['amount'] += abs(r['net']) if side == 'in' else -r['net']
        it['count'] += 1
        it['due'] = r['day']
    def fin(groups):
        out = []
        for g in groups.values():
            items = [dict(i, amount=round(i['amount'], 2)) for i in g['items'].values() if abs(i['amount']) >= 0.005]
            for i in items:
                if i['count'] == 1:
                    del i['count']
            items.sort(key=lambda i: -i['amount'])
            if items:
                o = {'group': g['group'], 'items': items}
                if g['discretionary']:
                    o['discretionary'] = True
                out.append(o)
        return out
    return fin(inc), fin(exp)

def order(groups, preferred):
    rank = {name: i for i, name in enumerate(preferred)}
    return sorted(groups, key=lambda g: (rank.get(g['group'], len(rank)), g['group'] == 'Discretionary'))

PAYDAYS = CFG['paydays']
prev = lambda iso: (date.fromisoformat(iso) - timedelta(days=1)).isoformat()
starts = [CFG['start']] + [prev(p) for p in PAYDAYS[:-1]]
ends = [prev(p) for p in PAYDAYS]
history = []
for i, (s_, e) in enumerate(zip(starts, ends)):
    inc, exp = build(s_, e)
    opening = balance_at_end_of(s_) if i else round(float(rows[0][COL['balance']]) - rows[0]['net'], 2)
    history.append({'periodStart': s_, 'periodEnd': e, 'payday': PAYDAYS[i], 'opening': opening,
                    'balance': balance_at_end_of(e), 'income': order(inc, CFG.get('order_in', [])),
                    'expenses': order(exp, CFG.get('order_out', []))})
for h in history:
    tin = sum(i['amount'] for g in h['income'] for i in g['items'])
    tout = sum(i['amount'] for g in h['expenses'] for i in g['items'])
    gap = h['opening'] + tin - tout - h['balance']
    print(h['periodStart'], '->', h['periodEnd'],
          f"open {h['opening']:9.2f} in {tin:9.2f} out {tout:9.2f} end {h['balance']:9.2f} gap {gap:6.2f}")
json.dump(history, open(sys.argv[3], 'w'), ensure_ascii=False, indent=1)
