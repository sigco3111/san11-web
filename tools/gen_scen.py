#!/usr/bin/env python3
"""시나리오 수치 독자 생성. 184/190: 역사적 세력 소속·도시 판도 골격 유지,
경제/병력 수치·태수 배정·충성도는 자체 루브릭. 251: 자체 가상 배치."""
import json, os, random
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
def load(p): return json.load(open(os.path.join(BASE,p)))

METRO = [15,17,6,13,22,39,29,8]
BIG = [0,1,3,10,12,26,30,31,36]
HORSE = [0,1,2,5,19,20,21]
SHIP = [22,23,24,26,27,29,30,31,35,38]
TIER = {
 'metro': dict(troops=32000, gold=5000, food=90000, revenue=600, harvest=9000, maxhp=4500),
 'big':   dict(troops=22000, gold=3500, food=60000, revenue=450, harvest=6500, maxhp=3400),
 'small': dict(troops=13000, gold=2200, food=35000, revenue=320, harvest=4500, maxhp=2600),
}
def tier(cid): return 'metro' if cid in METRO else ('big' if cid in BIG else 'small')

def econ(cid, owned):
    t = TIER[tier(cid)]
    if not owned:
        return dict(troops=0, gold=0, food=0, spears=0, pikes=0, bows=0, horses=0,
                    revenue=t['revenue'], harvest=t['harvest'], maxhp=t['maxhp'])
    tr = t['troops']
    return dict(troops=tr, gold=t['gold'], food=t['food'],
                spears=int(tr*0.3), pikes=int(tr*0.2), bows=int(tr*0.2),
                horses=int(tr*(0.2 if cid in HORSE else 0.05)),
                revenue=t['revenue'], harvest=t['harvest'], maxhp=t['maxhp'])

def specialty(cid):
    if cid in HORSE: return ['군마']
    if cid in SHIP: return ['선박']
    return []

offs = load('data/officers670.json')
byidx = {o['idx']: o for o in offs}

def regen_hist(sid):
    s = load(f'data/scenario-{sid}.json')
    s.pop('relations_raw', None)
    # 도시 경제·특색·대도시 자체 수치로 교체 (소유 골격 유지)
    for c in s['cities']:
        c.update(econ(c['id'], c['force'] is not None))
        c['specialty'] = specialty(c['id'])
        c['metropolis'] = c['id'] in METRO
        c['taesu'] = None
    # 태수: 각 도시 소속 무장 중 통솔 최고
    city_off = {}
    for o in s['officers']:
        if o.get('status') in ('taesu','serving') and o.get('city') is not None:
            city_off.setdefault(o['city'], []).append(o['idx'])
    for cid, lst in city_off.items():
        best = max(lst, key=lambda i: byidx[i]['ldr'])
        s['cities'][cid]['taesu'] = best
    # 충성도 자체 배정
    for o in s['officers']:
        if o.get('status') == 'ruler': o['loyal'] = 100
        elif o.get('status') in ('taesu','serving'):
            o['loyal'] = random.Random(9000+o['idx']).randint(70,95)
        for x in s['officers']: pass
    for o in s['officers']:
        if o.get('city') is None or o.get('status') not in ('taesu','serving'): continue
        if o['status']=='taesu' and s['cities'][o['city']]['taesu'] != o['idx']:
            o['status'] = 'serving'
        elif o['status']=='serving' and s['cities'][o['city']]['taesu'] == o['idx']:
            o['status'] = 'taesu'
    json.dump(s, open(os.path.join(BASE,f'data/scenario-{sid}.json'),'w'), ensure_ascii=False, separators=(',',':'))
    return s

s184 = regen_hist(184); s190 = regen_hist(190)

# ---- 251: 자체 가상 배치 '영웅집결' ----
name2idx = {o['name_zh']: o['idx'] for o in offs}
def N(n): return name2idx[n]
RULERS = {  # city_id: ruler idx (자체 선정: 각자의 역사적 거점)
 0:N('公孫度'), 1:N('公孫瓚'), 3:N('袁譚'), 6:N('袁紹'), 7:N('孔融'), 8:N('呂布'),
 9:N('陶謙'), 10:N('袁術'), 12:N('曹操'), 15:N('何進'), 16:N('張繡'), 17:N('董卓'),
 19:N('馬騰'), 20:N('韓遂'), 21:N('馬超'), 22:N('孫堅'), 23:N('嚴白虎'), 24:N('王朗'),
 25:N('劉繇'), 27:N('黃祖'), 28:N('劉備'), 29:N('劉表'), 36:N('張魯'), 39:N('劉璋'),
 41:N('孟獲'),
}
HAND = {
 N('劉備'): [N(x) for x in '關羽 張飛 趙雲 諸葛亮 龐統 徐庶 關平 廖化'.split()],
 N('孫堅'): [N(x) for x in '孫策 孫權 孫尚香 周瑜 魯肅 呂蒙 陸遜 甘寧 太史慈 黃蓋 程普 周泰 凌統 韓當 蔣欽 丁奉 徐盛 潘璋 朱然 大喬 小喬'.split()],
 N('馬超'): [N(x) for x in '馬岱 龐德'.split()],
 N('呂布'): [N(x) for x in '張遼 高順 陳宮 貂蟬'.split()],
 N('袁紹'): [N(x) for x in '顏良 文醜 張郃 高覽 沮授 田豐 審配 許攸 逢紀 郭圖 袁熙 袁尚'.split()],
 N('董卓'): [N(x) for x in '李傕 郭汜 華雄 李肅 賈詡'.split()],
 N('曹操'): [N(x) for x in '夏侯惇 夏侯淵 曹仁 曹洪 曹彰 曹丕 曹植 樂進 李典 于禁 許褚 典韋 郭嘉 荀彧 荀攸 程昱 劉曄 滿寵 徐晃 司馬懿 司馬朗'.split()],
 N('劉表'): [N(x) for x in '蔡瑁 蒯良 蒯越 黃忠 魏延'.split()],
 N('孟獲'): [N(x) for x in '祝融 兀突骨'.split()],
 N('張繡'): [N(x) for x in '賈詡'.split()][0:0],  # 가후는 동탁측
 N('馬騰'): [N(x) for x in '龐德'.split()][0:0],
}
# 190 시나리오 소속을 기반으로 주요 세력 추종자 보강 (역사적 소속)
mem190 = {}
for f in s190['forces']:
    mem190[f['ruler']] = set(f['officers'])
assigned = {}
for cid, ridx in RULERS.items():
    lst = [ridx]
    lst += HAND.get(ridx, [])
    if ridx in mem190:
        lst += [i for i in mem190[ridx] if i != ridx and i in RULERS.values() is False]
    assigned[ridx] = lst
    for i in lst: pass
# 손견군에 손책 등이 다른 세력 군주로 쓰이지 않게: 군주 전체는 타 세력 추종자에서 제외
ruler_set = set(RULERS.values())
for ridx, lst in assigned.items():
    assigned[ridx] = [i for i in dict.fromkeys(lst) if i == ridx or i not in ruler_set]
used = set(i for lst in assigned.values() for i in lst)

forces, cities_owners = [], {}
fid = 0
for cid, ridx in sorted(RULERS.items()):
    members = assigned[ridx]
    forces.append({'id': fid, 'ruler': ridx, 'cities': [cid], 'officers': members})
    cities_owners[cid] = fid
    fid += 1

s251 = load('data/scenario-251.json')
cities = []
for c in s251['cities']:
    cid = c['id']; f = cities_owners.get(cid)
    cc = {k: c[k] for k in ('id','name_zh','name_ko','lon','lat','district') if k in c}
    cc['force'] = f
    cc.update(econ(cid, f is not None))
    cc['specialty'] = specialty(cid)
    cc['metropolis'] = cid in METRO
    cities.append(cc)
# 무장 상태
fid_of = {i: f['id'] for f in forces for i in f['officers']}
city_of_ruler = {f['ruler']: f['cities'][0] for f in forces}
rstate = random.Random(777)
off_states = []
for o in offs:
    i = o['idx']
    if i in fid_of:
        f = next(f for f in forces if f['id'] == fid_of[i])
        st = 'ruler' if i == f['ruler'] else 'serving'
        off_states.append({'idx': i, 'loyal': 100 if st=='ruler' else rstate.randint(70,95),
                           'status': st, 'force': f['id'], 'city': f['cities'][0]})
    else:
        off_states.append({'idx': i, 'loyal': rstate.randint(60,90), 'status': 'wild',
                           'city': rstate.randrange(42)})
# 태수
for c in cities:
    if c['force'] is not None:
        f = forces[c['force']]
        best = max((i for i in f['officers'] if i != f['ruler']), key=lambda i: byidx[i]['ldr'], default=None)
        if best is not None:
            c['taesu'] = best
            for os_ in off_states:
                if os_['idx'] == best: os_['status'] = 'taesu'
    else: c['taesu'] = None
s251 = {'id':'251','year':251,'month':1,'forces':forces,'cities':cities,'officers':off_states}
json.dump(s251, open(os.path.join(BASE,'data/scenario-251.json'),'w'), ensure_ascii=False, separators=(',',':'))
print('251 forces:', len(forces), 'assigned officers:', len(used), 'wild:', 670-len(used))
print('184 cities owned:', sum(1 for c in s184['cities'] if c['force'] is not None),
      '190 forces:', len(s190['forces']))
