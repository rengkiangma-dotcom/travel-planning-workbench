<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useTripStore } from '../../stores/trip.js';
import { railSearch, railInterline } from '../../api/client.js';
import { minFare, seatsAvailable, legFare, ticketsFor } from '../../domain/tickets.js';
import { toMinor, formatYuan } from '../../domain/money.js';
import { confirmDo, toast } from '../../ui/feedback.js';
import ThemeSelect from '../ThemeSelect.vue';

const trip = useTripStore();

const draft = reactive({
  origin: trip.origin,
  destination: trip.destination,
  start: trip.start,
  days: trip.days,
  flags: '',
  compare: Boolean(trip.flexible && !trip.start),
});
const tickets = computed(() => draft.origin.trim() === trip.origin && draft.destination.trim() === trip.destination ? ticketsFor(trip.$state) : null);

const rail = reactive({ loading: false, error: '', data: null });
const activeLeg = ref('outbound');
const transportMode = ref('rail');
const best = reactive({
  outbound: { loading: false, error: '', direct: null, transfer: null, queriedAt: null },
  inbound: { loading: false, error: '', direct: null, transfer: null, queriedAt: null },
});
const seatChoice = reactive({});
const autoAttempted = new Set();
let queryVersion = 0;

watch(() => [draft.origin, draft.destination, draft.start, draft.days, draft.flags, draft.compare], () => {
  queryVersion += 1;
  rail.data = null;
  rail.error = '';
  for (const leg of ['outbound', 'inbound']) {
    best[leg].direct = null;
    best[leg].transfer = null;
    best[leg].error = '';
  }
});

const money = (value) => formatYuan(toMinor(value));
const seatKey = (train, leg, pair) => `${pair}:${leg}:${train.id}`;

onMounted(() => {
  const signature = [draft.origin, draft.destination, draft.start, draft.days].join('|');
  if (trip.autoLookup !== false && /^\d{4}-\d{2}-\d{2}$/.test(draft.start) && !autoAttempted.has(signature)) {
    autoAttempted.add(signature);
    queryRail();
  }
});

function queryDates() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.start)) return [];
  const count = draft.compare ? 3 : 1;
  return Array.from({ length: count }, (_, i) => (
    new Date(Date.parse(draft.start + 'T00:00:00Z') + i * 86400000).toISOString().slice(0, 10)
  ));
}

async function queryRail() {
  if (rail.loading) return;
  const dates = queryDates();
  if (!dates.length) { rail.error = '请先填写有效的出发日期'; return; }
  const origin = draft.origin.trim();
  const destination = draft.destination.trim();
  if (!origin || !destination) { rail.error = '请填写出发地和目的地'; return; }
  const version = queryVersion;
  if (origin !== trip.origin || destination !== trip.destination) {
    const ok = await confirmDo('更改这次旅行的出发地或目的地？', '将更新旅行地点并清除原有交通选择；更换目的地时会清除示例酒店和示例地点，真实地点及原始安排会保留。已购车票不会自动改签。');
    if (!ok || version !== queryVersion) return;
    trip.applyRequirements({ origin, destination, start: trip.start, notes: trip.notes, people: trip.people, budget: trip.budget });
  }
  rail.loading = true;
  rail.error = '';
  try {
    const data = await railSearch({
      origin,
      destination,
      days: Number(draft.days),
      dates,
      flags: draft.flags || '',
    });
    if (version === queryVersion) rail.data = data;
  } catch (error) {
    if (version === queryVersion) {
      rail.data = null;
      rail.error = error.message;
    }
  } finally {
    rail.loading = false;
  }
}

async function pick(train, leg, pair) {
  const query = rail.data?.query;
  if (!query || query.days !== trip.days
    || !query.origin.includes(trip.origin) || !query.destination.includes(trip.destination)) {
    toast('查询条件与当前行程不同，请先核对出发地、目的地和天数。');
    return;
  }
  const statusKey = leg === 'outbound' ? 'outStatus' : 'backStatus';
  if (trip[statusKey] === '已购票') {
    toast('已有已购票标记，保留原安排；请先核对后再更换方案。');
    return;
  }
  const seats = seatsAvailable(train);
  const seat = seats[Number(seatChoice[seatKey(train, leg, pair)] || 0)];
  if (!seat) return;
  const ok = await confirmDo('确认选用这个查询方案？', `${train.date} ${train.train} ${train.from} → ${train.to}，${seat.name} ¥${seat.price}/人。仅保存选择，不办理购票；原始行程不变。`);
  if (!ok) return;
  if (trip.start !== pair.date) {
    trip.setStart(pair.date);
    trip.clearTickets();
  }
  trip.chooseTicket(leg, { ...train, seat, queriedAt: rail.data.queriedAt });
  toast('已保存车次选择，未购票。');
}

function legDates() {
  const start = draft.start || trip.start;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '')) return null;
  const days = Math.max(1, Number(draft.days) || 1);
  const end = new Date(Date.parse(start + 'T00:00:00Z') + (days - 1) * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

function legRoute(leg) {
  return leg === 'outbound'
    ? { from: draft.origin.trim(), to: draft.destination.trim() }
    : { from: draft.destination.trim(), to: draft.origin.trim() };
}

function legDate(leg) {
  const dates = legDates();
  if (!dates) return '';
  return leg === 'outbound' ? dates.start : dates.end;
}

function directTrains(leg) {
  const dates = legDates();
  if (!rail.data || !dates) return [];
  const wanted = leg === 'outbound' ? dates.start : dates.end;
  const trains = [];
  for (const pair of rail.data.results || []) {
    if ((leg === 'outbound' ? pair.date : pair.returnDate) !== wanted) continue;
    for (const train of (leg === 'outbound' ? pair.outbound : pair.inbound)?.trains || []) {
      const seats = seatsAvailable(train);
      if (seats.length) trains.push({ train, seat: seats[0], fare: seats[0].price });
    }
  }
  return trains.sort((a, b) => a.fare - b.fare);
}

function ticketFromPlan(plan) {
  const segments = (plan?.legs || []).map((seg) => {
    const seat = (seg.seats || []).filter((s) => s.available && s.price !== null).sort((a, b) => a.price - b.price)[0];
    if (!seat) return null;
    return {
      train: seg.train, from: seg.from, to: seg.to, date: seg.date,
      departure: seg.departure, arrival: seg.arrival,
      seat: { name: seat.name, price: seat.price },
    };
  });
  if (!segments.length || segments.some((x) => !x)) return null;
  const total = segments.reduce((sum, one) => sum + one.seat.price, 0);
  return {
    kind: 'interline',
    train: segments.map((one) => one.train).join(' ⇄ '),
    from: segments[0].from,
    to: segments[segments.length - 1].to,
    date: segments[0].date,
    departure: segments[0].departure,
    arrival: segments[segments.length - 1].arrival,
    seat: { name: '换乘合计', price: total },
    legs: segments,
  };
}

async function findCheapest(leg) {
  const box = best[leg];
  if (box.loading) return;
  const dates = legDates();
  if (!dates) { box.error = '请先填写有效的出发日期'; return; }
  const route = legRoute(leg);
  if (!route.from || !route.to) { box.error = '请先填写出发地和目的地'; return; }
  box.loading = true;
  box.error = '';
  box.direct = null;
  box.transfer = null;
  const version = queryVersion;
  try {
    const query = rail.data?.query;
    const fresh = query
      && query.origin === draft.origin.trim()
      && query.destination === draft.destination.trim()
      && query.days === Number(draft.days)
      && (query.dates || []).includes(dates.start);
    if (!fresh) await queryRail();
    if (!rail.data) throw new Error(rail.error || '直达车次查询失败');

    const data = await railInterline({
      origin: route.from,
      destination: route.to,
      dates: [legDate(leg)],
      flags: draft.flags || '',
    });
    if (version !== queryVersion) return;
    const transfer = (data.results?.[0]?.plans || [])
      .map(ticketFromPlan)
      .filter(Boolean)
      .sort((a, b) => legFare(a) - legFare(b))[0] || null;
    const direct = directTrains(leg)[0] || null;

    box.direct = direct ? { train: direct.train, seat: direct.seat, fare: direct.fare } : null;
    box.transfer = transfer ? { ticket: transfer, fare: legFare(transfer) } : null;
    box.queriedAt = data.queriedAt;
    if (!box.direct && !box.transfer) {
      box.error = '直达和中转都没有查到可购席别';
    }
  } catch (error) {
    if (version === queryVersion) box.error = error.message;
  } finally {
    box.loading = false;
  }
}

function cheapestKind(leg) {
  const box = best[leg];
  if (!box.direct && !box.transfer) return null;
  if (!box.transfer) return 'direct';
  if (!box.direct) return 'transfer';
  return box.transfer.fare < box.direct.fare ? 'transfer' : 'direct';
}

async function chooseBest(leg, kind) {
  const box = best[leg];
  const dates = legDates();
  const choice = kind === 'transfer' ? box.transfer : box.direct;
  if (!choice || !dates) return;
  const statusKey = leg === 'outbound' ? 'outStatus' : 'backStatus';
  if (trip[statusKey] === '已购票') {
    toast('已有已购票标记，请先核对后再更换方案。');
    return;
  }
  const ticket = kind === 'transfer'
    ? { ...choice.ticket, queriedAt: box.queriedAt }
    : { ...choice.train, seat: choice.seat, queriedAt: box.queriedAt || rail.data?.queriedAt };
  const detail = kind === 'transfer'
    ? `${choice.ticket.train}，各段最低有票席别合计 ${money(choice.fare)}/人`
    : `${choice.train.train} ${choice.train.from} → ${choice.train.to}，${choice.seat.name} ${money(choice.fare)}/人`;
  const ok = await confirmDo(
    `选用这个${kind === 'transfer' ? '中转' : '直达'}方案？`,
    `${leg === 'outbound' ? '去程' : '返程'} ${legDate(leg)}：${detail}。仅保存选择，不办理购票。`,
  );
  if (!ok) return;
  if (trip.start !== dates.start) {
    trip.setStart(dates.start);
    trip.clearTickets();
  }
  trip.chooseTicket(leg, ticket);
  toast('已保存车次选择，未购票。');
}

function legLine(leg) {
  if (!leg) return null;
  if (Array.isArray(leg.legs)) {
    return {
      title: '（换乘）',
      detail: `${leg.date} ${leg.legs.map((one) => `${one.train} ${one.from}→${one.to} ${one.seat.name} ${money(one.seat.price)}`).join(' ⇄ ')} · 合计 ${money(legFare(leg))} / 人`,
    };
  }
  return {
    title: '',
    detail: `${leg.date} ${leg.train} · ${leg.from} → ${leg.to} · ${leg.seat.name} ${money(leg.seat.price)} / 人`,
  };
}
</script>

<template>
  <div class="transport-tabs" role="group" aria-label="选择交通方式">
    <button type="button" :class="{ active: transportMode === 'rail' }" :aria-pressed="transportMode === 'rail'" @click="transportMode = 'rail'">火车 / 高铁</button>
    <button type="button" :class="{ active: transportMode === 'flight' }" :aria-pressed="transportMode === 'flight'" @click="transportMode = 'flight'">飞机</button>
  </div>
  <div v-if="transportMode === 'flight'" class="surface flight-placeholder"><strong>飞机</strong><p>机票价格查询待接入。</p></div>
  <template v-else>
  <div class="surface live-card">
    <form
      id="live-rail-form"
      class="rail-inline"
      title="12306 真实查询：可查具体车站；勾选“3天”会比较连续三天；最多 3 组往返；结果缓存 2 分钟；不会自动购票。"
      @submit.prevent="queryRail"
    >
      <input v-model="draft.origin" name="origin" maxlength="60" required aria-label="出发城市或车站" placeholder="出发" title="出发城市 / 车站">
      <span class="rail-arrow" aria-hidden="true">→</span>
      <input v-model="draft.destination" name="destination" maxlength="60" required aria-label="到达城市或车站" placeholder="到达" title="到达城市 / 车站">
      <input v-model="draft.start" name="start" type="date" required aria-label="出发日期" title="出发日期">
      <input v-model.number="draft.days" name="days" type="number" min="1" max="7" required aria-label="旅行天数" title="旅行天数">
      <span class="rail-unit">天</span>
      <ThemeSelect v-model="draft.flags" :options="[{ value: '', label: '所有车次' }, { value: 'GD', label: '高铁 / 动车' }, { value: 'ZTKO', label: '普通列车' }]" aria-label="交通偏好" />
      <label class="rail-check" title="比较连续 3 天往返票价">
        <input v-model="draft.compare" name="compare" type="checkbox">3天
      </label>
      <label class="rail-check" title="信息齐全后自动查询">
        <input type="checkbox" :checked="trip.autoLookup !== false" @change="trip.setAutoLookup($event.target.checked)">自动
      </label>
      <button class="button primary" type="submit" aria-label="查询真实往返" title="查询真实往返，不会自动购票" :disabled="rail.loading">
        {{ rail.loading ? '查询中…' : '查询' }}
      </button>
    </form>

    <p v-if="rail.error" class="live-error" role="alert">{{ rail.error }}</p>

    <section class="leg-board">
      <article v-for="leg in ['outbound', 'inbound']" :key="leg" class="leg-card">
        <header>
          <strong>{{ leg === 'outbound' ? '去程' : '返程' }}</strong>
          <span>{{ legDate(leg) || '日期待定' }}</span>
        </header>
        <p class="leg-route">{{ legRoute(leg).from || '出发地' }} → {{ legRoute(leg).to || '目的地' }}</p>
        <template v-if="tickets && tickets[leg]">
          <p class="leg-picked">{{ legLine(tickets[leg]).detail }}</p>
          <p class="leg-fare">{{ money(legFare(tickets[leg])) }}<small> / 人</small></p>
        </template>
        <p v-else class="leg-empty">尚未选择</p>
        <label class="leg-status">购票状态
          <ThemeSelect :model-value="leg === 'outbound' ? trip.outStatus : trip.backStatus" :options="['待定', '已选待购', '已购票'].map((value) => ({ value, label: value }))" :aria-label="`${leg === 'outbound' ? '去程' : '返程'}购票状态`" @change="trip.setTransportStatus(leg === 'outbound' ? 'outStatus' : 'backStatus', $event)" />
        </label>
        <button type="button" class="button outline small" :disabled="best[leg].loading" @click="findCheapest(leg)">
          {{ best[leg].loading ? '正在比较直达与中转…' : '算最便宜' }}
        </button>
        <p v-if="best[leg].direct || best[leg].transfer" class="leg-compare">
          直达 {{ best[leg].direct ? money(best[leg].direct.fare) : '—' }}
          · 中转 {{ best[leg].transfer ? money(best[leg].transfer.fare) : '—' }}
        </p>
        <p v-if="best[leg].error" class="live-error" role="alert">{{ best[leg].error }}</p>
      </article>
    </section>
    <section v-if="best.outbound.direct || best.outbound.transfer || best.inbound.direct || best.inbound.transfer" class="best-result">
      <template v-for="leg in ['outbound', 'inbound']" :key="leg">
        <div v-if="best[leg].direct || best[leg].transfer" class="best-block">
          <p class="best-title">{{ leg === 'outbound' ? '去程' : '返程' }} · {{ legDate(leg) }} 的最低价候选</p>
          <div class="best-grid">
            <article v-if="best[leg].direct" class="best-option" :class="{ cheapest: cheapestKind(leg) === 'direct' }">
              <div class="best-head">
                <span class="best-tag">直达</span>
                <em v-if="cheapestKind(leg) === 'direct'">最低</em>
                <strong>{{ money(best[leg].direct.fare) }}<small> / 人</small></strong>
              </div>
              <p>{{ best[leg].direct.train.train }} {{ best[leg].direct.train.departure }}–{{ best[leg].direct.train.arrival }} · {{ best[leg].direct.seat.name }}</p>
              <p class="best-route">{{ best[leg].direct.train.from }} → {{ best[leg].direct.train.to }}</p>
              <button type="button" class="button outline small" @click="chooseBest(leg, 'direct')">选直达</button>
            </article>
            <article v-if="best[leg].transfer" class="best-option" :class="{ cheapest: cheapestKind(leg) === 'transfer' }">
              <div class="best-head">
                <span class="best-tag">中转</span>
                <em v-if="cheapestKind(leg) === 'transfer'">最低</em>
                <strong>{{ money(best[leg].transfer.fare) }}<small> / 人</small></strong>
              </div>
              <p>{{ best[leg].transfer.ticket.train }}</p>
              <p class="best-route">各段最低有票席别合计，换乘时间需自行核对</p>
              <button type="button" class="button outline small" @click="chooseBest(leg, 'transfer')">选中转</button>
            </article>
          </div>
          <p class="best-hint">价格是这次查询的快照，点选后才写入行程；选中不等于购票。</p>
        </div>
      </template>
    </section>

    <template v-if="rail.data">
      <section v-for="(pair, pairIndex) in rail.data.results" :key="pair.date" class="rail-pair">
        <header>
          <strong>{{ pair.date }} 出发 · {{ pair.returnDate }} 返回</strong>
          <span>{{ minFare(pair.outbound?.trains || []) !== null && minFare(pair.inbound?.trains || []) !== null ? money(minFare(pair.outbound.trains) + minFare(pair.inbound.trains)) + ' / 人往返起' : '暂无完整可用报价' }}</span>
        </header>
        <small>起价取本次返回的有票席别，未计接驳费；不是所有路线的最低价承诺。</small>
        <div class="rail-leg-tabs" role="group" aria-label="选择车次方向">
          <button v-for="leg in ['outbound', 'inbound']" :key="leg" type="button" :class="{ active: activeLeg === leg }" :aria-pressed="activeLeg === leg" @click="activeLeg = leg">
            {{ leg === 'outbound' ? '去程' : '返程' }} · {{ leg === 'outbound' ? pair.date : pair.returnDate }} · {{ (pair[leg]?.trains || []).length }} 趟车
          </button>
        </div>
        <template v-for="(leg, index) in ['outbound', 'inbound']" :key="leg">
        <div v-if="activeLeg === leg">
          <p v-if="pair[leg]?.error" class="live-error" role="alert">{{ pair[leg].error }}</p>
          <p v-else-if="!(pair[leg]?.trains || []).length" class="subtle">没有返回车次，可能未起售、无直达或接口暂时无数据。</p>
          <article
            v-for="train in [...(pair[leg]?.trains || [])].sort((a, b) => (minFare([a]) ?? Infinity) - (minFare([b]) ?? Infinity)).slice(0, 12)"
            :key="train.id"
            class="real-train"
          >
            <div class="train-title">
              <strong>{{ train.train }}</strong>
              <span>{{ train.departure }} → {{ train.arrival }}</span>
              <small>{{ train.duration }}{{ train.arrivalDate && train.arrivalDate !== train.date ? ' · 跨日到达' : '' }}</small>
            </div>
            <p>{{ train.from }} → {{ train.to }} <span>{{ train.date }} 上车</span></p>
            <div class="train-seats">
              <span v-for="seat in train.seats" :key="seat.name" :class="{ available: seat.available }">
                {{ seat.name }} {{ seat.price === null ? '价格缺失' : money(seat.price) }} · {{ seat.remaining }}
              </span>
            </div>
            <div class="train-pick">
              <ThemeSelect v-model="seatChoice[seatKey(train, leg, pairIndex)]" :options="seatsAvailable(train).map((seat, i) => ({ value: String(i), label: `${seat.name} ${money(seat.price)}` }))" :disabled="!seatsAvailable(train).length" :aria-label="`${train.train}${index ? '返程' : '去程'}席别`" />
              <button type="button" class="button outline small" :disabled="!seatsAvailable(train).length" @click="pick(train, leg, pairIndex)">
                选择{{ index ? '返程' : '去程' }}
              </button>
            </div>
          </article>
        </div>
        </template>
      </section>
      <p class="live-source">成人票查询，不推算学生优惠。余票可能变化，以 12306 下单时为准。</p>
    </template>

  </div>

  </template>
</template>
