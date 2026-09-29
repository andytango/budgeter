"""Generates examples/demo-budget.json: a made-up UK household (every name and number is fictional).

    python3 tools/make-demo.py [output.json]

Deterministic (fixed seed). Six finished pay periods of history, the current period as of Fri 9 Oct 2026,
a plan, debts and timeline notes. The screenshots in docs/images come from this file
(tools/screenshots.mjs), with the device clock set to 9 Oct 2026.
"""
import json, random, datetime as dt, sys
random.seed(11)
D = dt.date.fromisoformat
iso = lambda d: d.isoformat()
r2 = lambda x: round(x + 1e-9, 2)
OUT = sys.argv[1] if len(sys.argv) > 1 else 'examples/demo-budget.json'

paydays = ['2026-03-27','2026-04-24','2026-05-29','2026-06-26','2026-07-31','2026-08-28','2026-09-25','2026-10-30']
SALARY, PARTNER = 3412.66, 725.00

plan_exp = [
  {"group":"Housing","name":"Mortgage (Harbourside BS)","amount":1084.37,"day":1},
  {"group":"Housing","name":"Council tax","amount":187.00,"day":1,"months":[4,5,6,7,8,9,10,11,12,1]},
  {"group":"Housing","name":"Home insurance (Hearthguard)","amount":21.84,"day":8},
  {"group":"Debt Repayments","name":"Kestrel card","amount":250.00,"day":3,"debt":"Kestrel card"},
  {"group":"Debt Repayments","name":"Meridian card (0% transfer)","amount":120.00,"day":12,"debt":"Meridian card"},
  {"group":"Debt Repayments","name":"Car finance (Fernway)","amount":239.41,"day":20,"debt":"Car finance"},
  {"group":"Savings","name":"Emergency fund","amount":300.00,"payday":True},
  {"group":"Savings","name":"Holiday pot","amount":200.00,"payday":True},
  {"group":"Groceries","name":"Greenleaf weekly shop","amount":75.00,"weekly":6,"est":True},
  {"group":"Bills","name":"Brightwatt Energy","amount":128.00,"day":2,"est":True},
  {"group":"Bills","name":"Riverside Water","amount":41.00,"day":15},
  {"group":"Bills","name":"Loop Broadband","amount":47.50,"day":22},
  {"group":"Bills","name":"Pocket Mobile","amount":12.00,"day":9},
  {"group":"Car","name":"Car insurance (Lanternside)","amount":48.12,"day":11},
  {"group":"Car","name":"Car service","amount":249.00,"date":"2026-10-19","everyYears":1,"est":True},
  {"group":"Health & Pets","name":"Pulse Fitness","amount":27.99,"day":4},
  {"group":"Health & Pets","name":"Dental plan","amount":19.50,"day":1},
  {"group":"Health & Pets","name":"Pet insurance (Pawprint)","amount":31.76,"day":18},
  {"group":"Subscriptions","name":"Tuneloop (music)","amount":16.99,"day":14},
  {"group":"Subscriptions","name":"Reelhouse (films)","amount":12.99,"day":21},
  {"group":"Subscriptions","name":"Nimbus storage","amount":2.99,"day":26},
  {"group":"Subscriptions","name":"Office apps (annual)","amount":104.99,"date":"2026-11-19","everyYears":1},
  {"group":"Subscriptions","name":"Language app (annual)","amount":84.99,"date":"2027-02-03","everyYears":1},
  {"group":"Subscriptions","name":"Everymart membership (annual)","amount":95.00,"date":"2027-03-08","everyYears":1},
  {"group":"Debt Repayments","name":"Kestrel card (from the bonus)","amount":600.00,"date":"2026-12-18","debt":"Kestrel card"},
]
plan_inc = [
  {"group":"Salary","name":"{month} pay","amount":SALARY,"payday":True,"est":True},
  {"group":"Alex","name":"Bill share from Alex","amount":PARTNER,"day":1,"est":True},
  {"group":"Salary","name":"Year-end bonus","amount":1150.00,"date":"2026-12-18","est":True},
]

def dates(item, start, end, payday):
    out, d = [], start + dt.timedelta(days=1)
    while d <= end:
        if 'day' in item and d.day == item['day'] and ('months' not in item or d.month in item['months']): out.append(d)
        if 'weekly' in item and d.isoweekday() % 7 == item['weekly']: out.append(d)
        if 'date' in item and (d.month, d.day) == (D(item['date']).month, D(item['date']).day) and d >= D(item['date']) - dt.timedelta(days=366 * 3): 
            if d.year == D(item['date']).year: out.append(d)
        if item.get('payday') and d == payday: out.append(d)
        d += dt.timedelta(days=1)
    return out

# (name, low, high, max visits per period, eating out?)
MERCHANTS = [("Bean & Leaf Café",3.2,8.5,6,1),("Corner Bakery",2.8,6.5,4,1),("Daily Grind",3.1,5.4,4,1),("Fairway Local",4,19,8,0),
  ("The Copper Kettle",14,42,3,1),("Ember Kitchen",28,52,1,1),("Noodle Yard",24,41,1,1),("Dishdash (food delivery)",21,34,3,1),
  ("Northline Rail",18,72,3,0),("Zoomcab",8,19,2,0),("Petrolux (fuel)",48,66,2,0),("Wellspring Pharmacy",4,22,2,0),("Everymart",9,45,4,0),
  ("Toolbox DIY",11,64,1,0),("Nuts & Bolts",8,39,1,0),("Pageturner Books",9,21,1,0),("Starlight Cinema",19,24,1,0),("Thread & Co",25,60,1,0),
  ("Petworld",14,38,1,0),("Greenleaf top-up",8,31,4,0),("Homestead Home",25,90,1,0),("Bytebox Takeaway",19,31,2,1),("Trattoria Sole",38,64,1,1)]

def discretionary(start, end, target):
    days = (end - start).days
    while True:  # re-roll until the natural total is close, so scaling stays gentle
        items = []
        for nm, lo, hi, mx, _ in MERCHANTS:
            v = random.randint(0, mx)
            if not v: continue
            it = {"name": nm, "amount": sum(random.uniform(lo, hi) for _ in range(v)), "done": True, "due": iso(start + dt.timedelta(days=random.randint(1, days)))}
            if v > 1: it["count"] = v
            items.append(it)
        tot = sum(i["amount"] for i in items)
        if 0.9 <= target / tot <= 1.1: break
    f = target / tot
    for i in items: i["amount"] = r2(i["amount"] * f)
    big = max(items, key=lambda i: i["amount"])
    big["amount"] = r2(big["amount"] + target - sum(i["amount"] for i in items))
    items.sort(key=lambda i: i["due"])
    return items

EXTRA = {3: [("Skylark Air (holiday flights, 2 seats)", 238.46)], 4: [("Holiday rental", 412.80), ("Holiday: food and travel", 186.35)]}
history, opening = [], 598.10
targets = [640.35, 522.10, 611.45, 448.90, 331.75, 286.40]
for k in range(6):
    start, end, pay = D(paydays[k]) - dt.timedelta(days=1), D(paydays[k+1]) - dt.timedelta(days=1), D(paydays[k])
    income = [{"group":"Salary","items":[{"name": pay.strftime("%B") + " pay","amount":SALARY,"done":True,"due":iso(pay)}]}]
    share = [{"name":"Bill share from Alex","amount":PARTNER,"done":True,"due":iso(d)} for d in dates({"day":1}, start, end, pay)]
    if share: income.append({"group":"Alex","items":share})
    groups = {}
    for p in plan_exp:
        if p.get("date"): continue
        for d in dates(p, start, end, pay):
            amt = p["amount"]
            if p["name"] == "Greenleaf weekly shop": amt = r2(random.uniform(61, 92))
            if p["name"] == "Brightwatt Energy": amt = r2(random.uniform(96, 128)) if d.month in (4,5,6,7,8,9) else amt
            groups.setdefault(p["group"], []).append({"name":p["name"],"amount":amt,"done":True,"due":iso(d)})
    expenses = [{"group":g,"items":sorted(v,key=lambda i:i["due"])} for g,v in groups.items()]
    inc = sum(i["amount"] for g in income for i in g["items"])
    bills = sum(i["amount"] for g in expenses for i in g["items"])
    split = -r2(random.uniform(18, 64))
    extra = [{"name": n, "amount": a, "done": True, "due": iso(start + dt.timedelta(days=9))} for n, a in EXTRA.get(k, [])]
    disc_total = r2(opening + inc - bills - targets[k] - split - sum(e["amount"] for e in extra))
    disc = discretionary(start, end, disc_total) + extra
    disc.append({"name":"Alex's half (split bills)","amount":split,"done":True,"due":iso(end - dt.timedelta(days=4))})
    expenses.append({"group":"Discretionary","discretionary":True,"items":sorted(disc, key=lambda i: i["due"])})
    print(start, "disc", disc_total, "bills", r2(bills))
    history.append({"periodStart":iso(start),"periodEnd":iso(end),"payday":iso(D(paydays[k+1])),
                    "opening":r2(opening),"balance":targets[k],"income":income,"expenses":expenses})
    opening = targets[k]

# Current period 24 Sep -> 29 Oct, as of Fri 9 Oct.
start, end, asof, pay = D("2026-09-24"), D("2026-10-29"), D("2026-10-09"), D("2026-09-25")
income = [{"group":"Salary","items":[{"name":"September pay","amount":SALARY,"done":True,"due":"2026-09-25"}]},
          {"group":"Alex","items":[{"name":"Bill share from Alex","amount":PARTNER,"done":True,"due":"2026-10-01"}]}]
actual = {("Greenleaf weekly shop","2026-09-26"):74.18, ("Greenleaf weekly shop","2026-10-03"):81.06, ("Brightwatt Energy","2026-10-02"):128.00}
groups = {}
for p in plan_exp:
    for d in dates(p, start, end, pay):
        it = {"name":p["name"],"amount":actual.get((p["name"], iso(d)), p["amount"]),"due":iso(d)}
        if p.get("debt"): it["debt"] = p["debt"]
        if d <= asof: it["done"] = True
        elif p.get("est"): it["est"] = True
        groups.setdefault(p["group"], []).append(it)
expenses = [{"group":g,"items":sorted(v,key=lambda i:i["due"])} for g,v in groups.items()]
disc = [
  {"name":"Bean & Leaf Café","amount":23.85,"count":4,"done":True,"due":"2026-09-25"},
  {"name":"The Copper Kettle","amount":31.40,"done":True,"due":"2026-09-26"},
  {"name":"Northline Rail (return trip)","amount":64.30,"done":True,"due":"2026-09-27"},
  {"name":"Wellspring Pharmacy","amount":12.49,"done":True,"due":"2026-09-28"},
  {"name":"Petrolux (fuel)","amount":58.72,"done":True,"due":"2026-09-29"},
  {"name":"Pageturner Books","amount":18.99,"done":True,"due":"2026-10-01"},
  {"name":"Everymart","amount":24.99,"done":True,"due":"2026-10-02"},
  {"name":"Ember Kitchen","amount":46.80,"done":True,"due":"2026-10-03"},
  {"name":"Starlight Cinema","amount":21.98,"done":True,"due":"2026-10-04"},
  {"name":"Alex's half (Ember Kitchen)","amount":-23.40,"done":True,"due":"2026-10-04"},
  {"name":"Toolbox DIY","amount":37.15,"done":True,"due":"2026-10-04"},
  {"name":"Thread & Co","amount":39.90,"done":True,"due":"2026-10-05"},
  {"name":"Everymart refund","amount":-24.99,"done":True,"due":"2026-10-06"},
  {"name":"Corner Bakery","amount":9.15,"count":3,"done":True,"due":"2026-10-07"},
  {"name":"Fairway Local","amount":22.60,"count":3,"done":True,"due":"2026-10-08"},
  {"name":"Dishdash (food delivery)","amount":27.45,"done":True,"due":"2026-10-08"},
]
expenses.append({"group":"Discretionary","discretionary":True,"items":disc})
done_in = sum(i["amount"] for g in income for i in g["items"] if i.get("done"))
done_out = sum(i["amount"] for g in expenses for i in g["items"] if i.get("done"))
balance = r2(opening + done_in - done_out)
todo_out = sum(i["amount"] for g in expenses for i in g["items"] if not i.get("done"))
end_cash = r2(balance - todo_out)
disc_so_far = r2(sum(i["amount"] for i in disc))
eat = r2(sum(i["amount"] for i in disc if i["name"] in ("Bean & Leaf Café","The Copper Kettle","Ember Kitchen","Alex's half (Ember Kitchen)","Corner Bakery","Dishdash (food delivery)")))
fmt = lambda x: f"£{x:,.0f}"
doc = {
  "asOf": iso(asof), "updatedLabel": "9 Oct", "periodStart": iso(start), "periodEnd": iso(end), "payday": "2026-10-30",
  "opening": opening, "balance": balance, "income": income, "expenses": expenses,
  "debts": [
    {"name":"Kestrel card","rate":"24.9% APR","apr":24.9,"monthly":250,"balance":1842.17,"start":3200.00},
    {"name":"Meridian card","rate":"0% until Jun 2027","apr":0,"monthly":120,"balance":2460.00,"start":3600.00},
    {"name":"Car finance","rate":"9.9% APR","apr":9.9,"monthly":239.41,"balance":6873.40,"start":12500.00},
  ],
  "alerts": [
    {"date":"2026-10-07","kind":"good","text":"Everymart refund of £24.99 landed"},
    {"date":"2026-10-12","kind":"action","text":"Get car insurance quotes: renews 2 Nov"},
    {"date":"2026-10-19","kind":"info","text":"Car service booked, about £249"},
  ],
  "note": f"On track for **{fmt(end_cash)}** on Thu 29 Oct, the day before payday. Discretionary so far **{fmt(disc_so_far)}**, {fmt(eat)} of it eating out.",
  "plan": {"income": plan_inc, "expenses": plan_exp},
  "history": history,
}
json.dump(doc, open(OUT, 'w'), indent=1, ensure_ascii=False)
print('opening', opening, 'balance', balance, 'end', end_cash, 'disc', disc_so_far, 'eat', eat)
